/**
 * AINTIVIRUS dApp Connectivity - Content Script Bridge
 * 
 * This module runs in the content script context (ISOLATED world) and acts
 * as a bridge between the inpage script and the background service worker.
 * 
 * SECURITY ARCHITECTURE:
 * - Validates message origin against tab URL
 * - Filters messages by source identifier
 * - Uses chrome.runtime for background communication
 * - Tab ID tracking for multi-tab support
 * 
 * MESSAGE FLOW:
 * Inpage (postMessage) -> Content Script -> Background (chrome.runtime)
 * Background (chrome.runtime) -> Content Script -> Inpage (postMessage)
 */

import {
  DAppMessage,
  DAppResponse,
  DAppMessageType,
  DAppChainType,
  DAPP_MESSAGE_SOURCE,
  isDAppMessage,
  isValidDAppSource,
  isFromInpage,
} from '../types';
import { MESSAGE_SOURCE, TIMEOUTS } from './constants';

// ============================================
// TYPES
// ============================================

interface BackgroundMessage {
  type: string;
  payload: unknown;
}

interface BackgroundResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Maximum pending requests to prevent memory leaks */
const MAX_PENDING_REQUESTS = 100;

/** Request expiry for cleanup (5 minutes) */
const REQUEST_EXPIRY_MS = 5 * 60 * 1000;

// ============================================
// STATE
// ============================================

/** Track if bridge is initialized */
let isInitialized = false;

/** Current tab info */
let currentTabId: number | null = null;

/** 
 * Pending requests waiting for background response.
 * Bounded to MAX_PENDING_REQUESTS to prevent memory leaks.
 * Cleanup happens on each new request, not via setInterval.
 * 
 * MV3 SECURITY: Each request has a nonce for response validation.
 * This prevents spoofing of responses by malicious scripts.
 */
const pendingRequests = new Map<string, {
  message: DAppMessage;
  timestamp: number;
  nonce: string; // Crypto-random nonce for response validation
}>();

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// INPAGE SCRIPT INJECTION
// ============================================

/**
 * Inject the dApp provider script into the page context
 */
export function injectDAppScript(): void {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dappInpage.js');
    script.id = 'aintivirus-dapp-provider';
    script.onload = () => {
      script.remove(); // Clean up after injection
    };
    
    // Inject before any other script runs
    const target = document.head || document.documentElement;
    if (target) {
      target.insertBefore(script, target.firstChild);
      console.log('[Aintivirus Bridge] dApp provider script injected');
    }
  } catch (error) {
    console.error('[Aintivirus Bridge] Failed to inject dApp script:', error);
  }
}

// ============================================
// MESSAGE VALIDATION
// ============================================

/**
 * Validate that message origin matches current page
 */
function validateOrigin(messageOrigin: string): boolean {
  try {
    const pageOrigin = window.location.origin;
    return messageOrigin === pageOrigin;
  } catch {
    return false;
  }
}

/**
 * Check if message type requires background communication
 */
function requiresBackgroundCommunication(type: DAppMessageType): boolean {
  const forwardTypes: DAppMessageType[] = [
    'DAPP_CONNECT',
    'DAPP_DISCONNECT',
    'EVM_REQUEST',
    'SOLANA_CONNECT',
    'SOLANA_DISCONNECT',
    'SOLANA_SIGN_TRANSACTION',
    'SOLANA_SIGN_ALL_TRANSACTIONS',
    'SOLANA_SIGN_MESSAGE',
    'SOLANA_SIGN_AND_SEND',
    'DAPP_GET_STATE',
  ];
  return forwardTypes.includes(type);
}

// ============================================
// MESSAGE HANDLING
// ============================================

/**
 * Handle messages from the inpage script
 */
function handleInpageMessage(event: MessageEvent): void {
  // Only accept messages from same window
  if (event.source !== window) return;
  
  const data = event.data;
  
  // Validate message structure
  if (!isDAppMessage(data)) return;
  
  // Validate source is from our inpage script
  if (!isFromInpage(data)) return;
  
  // Validate origin matches page
  if (!validateOrigin(data.origin)) {
    console.warn('[Aintivirus Bridge] Origin mismatch:', data.origin, '!==', window.location.origin);
    return;
  }
  
  // Handle providers ready notification
  if (data.type === 'DAPP_PROVIDERS_READY' as DAppMessageType) {
    console.log('[Aintivirus Bridge] dApp providers ready');
    return;
  }
  
  // Forward to background if needed
  if (requiresBackgroundCommunication(data.type)) {
    forwardToBackground(data);
  }
}

/**
 * Forward message to background service worker
 */
async function forwardToBackground(message: DAppMessage): Promise<void> {
  // Clean up expired requests and enforce limits before adding new one
  cleanupAndEnforceLimits();
  
  // Generate nonce for response validation
  const nonce = generateNonce();
  
  // Store pending request with nonce
  pendingRequests.set(message.id, {
    message,
    timestamp: Date.now(),
    nonce,
  });
  
  try {
    // Prepare message for background (include nonce for round-trip validation)
    const backgroundMessage: BackgroundMessage = {
      type: 'DAPP_REQUEST',
      payload: {
        id: message.id,
        nonce, // MV3 SECURITY: nonce for response validation
        type: message.type,
        chainType: message.chainType,
        method: (message.payload as { method?: string })?.method || message.type,
        params: (message.payload as { params?: unknown })?.params,
        origin: message.origin,
        tabId: currentTabId,
        favicon: getFavicon(),
        title: document.title,
      },
    };
    
    // Send to background
    const response = await chrome.runtime.sendMessage(backgroundMessage) as BackgroundResponse;
    
    // Handle response
    if (response) {
      sendResponseToInpage(message.id, response.success, response.data, response.error);
    }
  } catch (error) {
    console.error('[Aintivirus Bridge] Failed to forward to background:', error);
    sendResponseToInpage(
      message.id,
      false,
      undefined,
      error instanceof Error ? error.message : 'Unknown error'
    );
  } finally {
    pendingRequests.delete(message.id);
  }
}

/**
 * Send response back to inpage script
 */
function sendResponseToInpage(
  requestId: string,
  success: boolean,
  result?: unknown,
  error?: string
): void {
  const response: DAppResponse = {
    id: requestId,
    success,
    result,
    error: error ? { code: -32603, message: error } : undefined,
  };
  
  window.postMessage({
    source: MESSAGE_SOURCE.CONTENT,
    type: success ? 'DAPP_RESPONSE' : 'DAPP_ERROR',
    payload: response,
  }, '*');
}

/**
 * Handle messages from background service worker
 */
function handleBackgroundMessage(
  message: { type: string; payload: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): boolean {
  // Only accept messages from our extension
  if (sender.id !== chrome.runtime.id) return false;
  
  switch (message.type) {
    case 'DAPP_BROADCAST_EVENT':
      // Forward event to inpage
      broadcastEventToInpage(message.payload as {
        type: DAppMessageType;
        chainType: DAppChainType;
        data: unknown;
      });
      sendResponse({ success: true });
      return true;
      
    case 'DAPP_REQUEST_RESULT':
      // Forward result for a pending request
      const result = message.payload as {
        id: string;
        success: boolean;
        result?: unknown;
        error?: string;
      };
      sendResponseToInpage(result.id, result.success, result.result, result.error);
      sendResponse({ success: true });
      return true;
      
    default:
      return false;
  }
}

/**
 * Broadcast an event to the inpage script
 */
function broadcastEventToInpage(event: {
  type: DAppMessageType;
  chainType: DAppChainType;
  data: unknown;
}): void {
  window.postMessage({
    source: MESSAGE_SOURCE.CONTENT,
    type: event.type,
    payload: event.data,
  }, '*');
}

// ============================================
// UTILITIES
// ============================================

/**
 * Get the page's favicon URL
 */
function getFavicon(): string | undefined {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  );
  
  for (const link of links) {
    if (link.href) {
      return link.href;
    }
  }
  
  // Default favicon location
  return `${window.location.origin}/favicon.ico`;
}

/**
 * Clean up expired pending requests and enforce size limit.
 * Called on each new request instead of via setInterval.
 * 
 * Content scripts persist per-tab, so we don't need chrome.alarms.
 * Instead, we clean up opportunistically on each message.
 */
function cleanupAndEnforceLimits(): void {
  const now = Date.now();
  
  // First, remove expired requests
  for (const [id, request] of pendingRequests) {
    if (now - request.timestamp > REQUEST_EXPIRY_MS) {
      pendingRequests.delete(id);
      sendResponseToInpage(id, false, undefined, 'Request expired');
    }
  }
  
  // Enforce maximum size by removing oldest entries
  if (pendingRequests.size > MAX_PENDING_REQUESTS) {
    // Convert to array, sort by timestamp (oldest first), remove oldest
    const entries = Array.from(pendingRequests.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, pendingRequests.size - MAX_PENDING_REQUESTS);
    for (const [id] of toRemove) {
      pendingRequests.delete(id);
      sendResponseToInpage(id, false, undefined, 'Request queue full');
    }
  }
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the content script bridge
 */
export function initializeDAppBridge(): void {
  if (isInitialized) return;
  isInitialized = true;
  
  // Skip for extension pages
  if (window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'moz-extension:') {
    return;
  }
  
  // Get current tab ID
  chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
    if (response && typeof response.tabId === 'number') {
      currentTabId = response.tabId;
    }
  });
  
  // Inject dApp provider script
  injectDAppScript();
  
  // Listen for messages from inpage script
  window.addEventListener('message', handleInpageMessage);
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  
  // NOTE: No setInterval for cleanup - we use request-scoped cleanup instead.
  // Content scripts persist per-tab, but endless intervals can still cause issues.
  // Cleanup happens opportunistically on each new message via cleanupAndEnforceLimits().
  
  // Handle page unload
  window.addEventListener('pagehide', () => {
    // Notify background that tab is navigating away
    chrome.runtime.sendMessage({
      type: 'DAPP_PAGE_UNLOAD',
      payload: { tabId: currentTabId },
    }).catch(() => {
      // Ignore errors during unload
    });
  });
  
  console.log('[Aintivirus Bridge] Content script bridge initialized');
}

// ============================================
// CONNECTION STATE MANAGEMENT
// ============================================

/**
 * Port-based connection for long-running communication
 */
let backgroundPort: chrome.runtime.Port | null = null;

/**
 * Establish a persistent connection with the background
 */
export function establishBackgroundConnection(): void {
  if (backgroundPort) return;
  
  try {
    backgroundPort = chrome.runtime.connect({ name: 'dapp-bridge' });
    
    backgroundPort.onMessage.addListener((message) => {
      if (message.type === 'DAPP_BROADCAST_EVENT') {
        broadcastEventToInpage(message.payload);
      }
    });
    
    backgroundPort.onDisconnect.addListener(() => {
      backgroundPort = null;
      // Attempt reconnection after a delay
      setTimeout(establishBackgroundConnection, 1000);
    });
    
    console.log('[Aintivirus Bridge] Background connection established');
  } catch (error) {
    console.debug('[Aintivirus Bridge] Failed to establish connection:', error);
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  handleInpageMessage,
  handleBackgroundMessage,
  forwardToBackground,
  sendResponseToInpage,
  broadcastEventToInpage,
};
