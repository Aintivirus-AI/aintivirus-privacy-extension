import {
  DAppMessage,
  DAppResponse,
  DAppMessageType,
  DAppChainType,
  isDAppMessage,
  isFromInpage,
} from '../types';
import { MESSAGE_SOURCE } from './constants';

interface BackgroundMessage {
  type: string;
  payload: unknown;
}

interface BackgroundResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

const MAX_PENDING_REQUESTS = 100;

const REQUEST_EXPIRY_MS = 5 * 60 * 1000;

let isInitialized = false;

let currentTabId: number | null = null;

const pendingRequests = new Map<
  string,
  {
    message: DAppMessage;
    timestamp: number;
    nonce: string;
  }
>();

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function injectDAppScript(): void {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dappInpage.js');
    script.id = 'aintivirus-dapp-provider';
    script.onload = () => {
      script.remove();
    };

    const target = document.head || document.documentElement;
    if (target) {
      target.insertBefore(script, target.firstChild);
    }
  } catch {
    // Injection is best-effort; failing here should not break page scripts.
  }
}

function validateOrigin(messageOrigin: string): boolean {
  try {
    const pageOrigin = window.location.origin;
    return messageOrigin === pageOrigin;
  } catch {
    return false;
  }
}

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

function handleInpageMessage(event: MessageEvent): void {
  if (event.source !== window) return;

  const data = event.data;

  if (!isDAppMessage(data)) return;

  if (!isFromInpage(data)) return;

  if (!validateOrigin(data.origin)) {
    return;
  }

  if (data.type === ('DAPP_PROVIDERS_READY' as DAppMessageType)) {
    return;
  }

  if (requiresBackgroundCommunication(data.type)) {
    forwardToBackground(data);
  }
}

// Helper to wake up service worker if it's been terminated
async function ensureServiceWorkerAwake(): Promise<boolean> {
  try {
    // Send a simple ping to wake up the service worker
    const response = await chrome.runtime.sendMessage({ type: 'PING' });
    return response?.success === true;
  } catch {
    return false;
  }
}

async function forwardToBackground(message: DAppMessage): Promise<void> {
  cleanupAndEnforceLimits();

  const nonce = generateNonce();

  pendingRequests.set(message.id, {
    message,
    timestamp: Date.now(),
    nonce,
  });

  const backgroundMessage: BackgroundMessage = {
    type: 'DAPP_REQUEST',
    payload: {
      id: message.id,
      nonce,
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

  // Retry logic to handle service worker termination
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 200;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // On first attempt or after a failure, try to wake up the service worker
      if (attempt > 0) {
        console.log(`[DApp Bridge] Attempt ${attempt + 1}: Waking up service worker...`);
        await ensureServiceWorkerAwake();
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }

      const response = (await chrome.runtime.sendMessage(backgroundMessage)) as BackgroundResponse;

      if (response) {
        pendingRequests.delete(message.id);
        sendResponseToInpage(message.id, response.success, response.data, response.error);
        return;
      } else {
        // No response usually means the background didn't handle the message
        console.warn('[DApp Bridge] No response from background');
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }
        pendingRequests.delete(message.id);
        sendResponseToInpage(message.id, false, undefined, 'No response from extension background');
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DApp Bridge] Error (attempt ${attempt + 1}/${MAX_RETRIES}):`, errorMessage);

      const isConnectionError =
        errorMessage.includes('Could not establish connection') ||
        errorMessage.includes('Receiving end does not exist') ||
        errorMessage.includes('Extension context invalidated');

      // If it's a connection error and we have retries left, wait and try again
      if (isConnectionError && attempt < MAX_RETRIES - 1) {
        console.warn(`[DApp Bridge] Connection error, will retry after delay...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      pendingRequests.delete(message.id);

      // If the extension context is invalidated, the page needs to be refreshed
      if (errorMessage.includes('Extension context invalidated')) {
        sendResponseToInpage(
          message.id,
          false,
          undefined,
          'Extension was reloaded. Please refresh this page to reconnect.',
        );
      } else {
        sendResponseToInpage(message.id, false, undefined, errorMessage);
      }
      return;
    }
  }

  pendingRequests.delete(message.id);
  sendResponseToInpage(message.id, false, undefined, 'Failed to connect to extension after multiple attempts');
}

function sendResponseToInpage(
  requestId: string,
  success: boolean,
  result?: unknown,
  error?: string,
): void {
  const response: DAppResponse = {
    id: requestId,
    success,
    result,
    error: error ? { code: -32603, message: error } : undefined,
  };

  window.postMessage(
    {
      source: MESSAGE_SOURCE.CONTENT,
      type: success ? 'DAPP_RESPONSE' : 'DAPP_ERROR',
      payload: response,
    },
    '*',
  );
}

function handleBackgroundMessage(
  message: { type: string; payload: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (sender.id !== chrome.runtime.id) return false;

  switch (message.type) {
    case 'DAPP_BROADCAST_EVENT':
      broadcastEventToInpage(
        message.payload as {
          type: DAppMessageType;
          chainType: DAppChainType;
          data: unknown;
        },
      );
      sendResponse({ success: true });
      return true;

    case 'DAPP_REQUEST_RESULT':
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

function broadcastEventToInpage(event: {
  type: DAppMessageType;
  chainType: DAppChainType;
  data: unknown;
}): void {
  window.postMessage(
    {
      source: MESSAGE_SOURCE.CONTENT,
      type: event.type,
      payload: event.data,
    },
    '*',
  );
}

function getFavicon(): string | undefined {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  );

  for (const link of links) {
    if (link.href) {
      return link.href;
    }
  }

  return `${window.location.origin}/favicon.ico`;
}

function cleanupAndEnforceLimits(): void {
  const now = Date.now();

  for (const [id, request] of pendingRequests) {
    if (now - request.timestamp > REQUEST_EXPIRY_MS) {
      pendingRequests.delete(id);
      sendResponseToInpage(id, false, undefined, 'Request expired');
    }
  }

  if (pendingRequests.size > MAX_PENDING_REQUESTS) {
    const entries = Array.from(pendingRequests.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    const toRemove = entries.slice(0, pendingRequests.size - MAX_PENDING_REQUESTS);
    for (const [id] of toRemove) {
      pendingRequests.delete(id);
      sendResponseToInpage(id, false, undefined, 'Request queue full');
    }
  }
}

export function initializeDAppBridge(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (
    window.location.protocol === 'chrome-extension:' ||
    window.location.protocol === 'moz-extension:'
  ) {
    return;
  }

  chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
    if (response && typeof response.tabId === 'number') {
      currentTabId = response.tabId;
    }
  });

  injectDAppScript();

  window.addEventListener('message', handleInpageMessage);

  chrome.runtime.onMessage.addListener(handleBackgroundMessage);

  window.addEventListener('pagehide', () => {
    chrome.runtime
      .sendMessage({
        type: 'DAPP_PAGE_UNLOAD',
        payload: { tabId: currentTabId },
      })
      .catch(() => {});
  });
}

let backgroundPort: chrome.runtime.Port | null = null;

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

      setTimeout(establishBackgroundConnection, 1000);
    });
  } catch (error) {}
}

export {
  handleInpageMessage,
  handleBackgroundMessage,
  forwardToBackground,
  sendResponseToInpage,
  broadcastEventToInpage,
};
