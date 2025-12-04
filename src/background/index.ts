// Polyfill for Solana libraries that freak out when window doesn't exist
// Service workers don't have window, but web3.js really wants it
if (typeof globalThis !== 'undefined' && typeof (globalThis as unknown as Record<string, unknown>).window === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
}

import { initializeStorage } from '@shared/storage';
import { createMessageListener } from '@shared/messaging';
import { getFeatureFlags, setFeatureFlag } from '@shared/featureFlags';
import { ExtensionMessage, MessageResponse, FeatureFlags } from '@shared/types';
import { 
  initializeNotificationHandlers,
  notifyPhishingSite,
  notifyConnectionRequest,
  notifyRiskyTransaction,
} from '@shared/notifications';

// Privacy stuff
import { 
  initializePrivacyEngine,
  handlePrivacyMessage,
  togglePrivacyProtection,
  checkAndRefreshFilterLists,
} from '../privacy';

// Threat Intelligence
import {
  initializeThreatIntel,
  setupThreatIntelAlarm,
  refreshThreatIntel,
  getThreatIntelHealth,
  getThreatIntelSources,
  addThreatIntelSource,
  removeThreatIntelSource,
  toggleThreatIntelSource,
} from '../threatIntel';

// Filter List Health
import {
  getFilterListHealth,
  resetFilterList,
} from '../privacy/filterListManager';

// Anti-fingerprinting
import {
  initializeFingerprintProtection,
  handleFingerprintMessage,
} from '../fingerprinting';

// Wallet
import {
  initializeWalletModule,
  handleWalletMessage,
  WalletMessageType,
} from '../wallet';
import {
  handleAutoLockAlarm,
  getAutoLockAlarmName,
} from '../wallet/storage';

// Security checks
import {
  initializeSecurityModule,
  handleSecurityMessage,
  handleSecurityCleanupAlarm,
  SecurityMessageType,
} from '../security';

// Main background service worker - this is where all the magic happens.
// Routes messages around, manages features, and keeps everything in sync.

console.log('[AINTIVIRUS] Background service worker starting...');

// Get notification handlers ready before anything else
initializeNotificationHandlers();

// First run or update - set things up
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[AINTIVIRUS] Extension installed/updated:', details.reason);

  await initializeStorage();

  if (details.reason === 'install') {
    console.log('[AINTIVIRUS] First install - storage initialized');
  } else if (details.reason === 'update') {
    console.log('[AINTIVIRUS] Updated from version:', details.previousVersion);
  }

  // Fire up all the modules once storage is ready
  await initializePrivacyEngine();
  await initializeFingerprintProtection();
  await initializeWalletModule();
  await initializeSecurityModule();
  await initializeThreatIntel();
  setupThreatIntelAlarm();
});

// Browser just opened - wake everything up
chrome.runtime.onStartup.addListener(async () => {
  console.log('[AINTIVIRUS] Browser started - extension waking up');
  
  const flags = await getFeatureFlags();
  console.log('[AINTIVIRUS] Current feature flags:', flags);

  // Spin up all the modules
  await initializePrivacyEngine();
  await initializeFingerprintProtection();
  await initializeWalletModule();
  await initializeSecurityModule();
  await initializeThreatIntel();
  
  // Might need fresh filter lists
  await checkAndRefreshFilterLists();
});

// Alarms keep us on schedule even when the service worker gets killed
chrome.alarms.create('filterListRefresh', {
  periodInMinutes: 60 * 6, // every 6 hours
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'filterListRefresh') {
    await checkAndRefreshFilterLists();
  } else if (alarm.name === getAutoLockAlarmName()) {
    // Lock the wallet if user's been idle too long
    handleAutoLockAlarm();
  } else if (alarm.name === 'securityCleanup') {
    await handleSecurityCleanupAlarm();
  }
});

// Central message router - popup, settings, and content scripts all talk through here
createMessageListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('[AINTIVIRUS] Message handler error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

  return true; // async response
});

// Figure out what kind of message this is and route it to the right handler
async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  console.log('[AINTIVIRUS] Received message:', message.type, 'from:', sender.tab?.url || 'extension');

  switch (message.type) {
    case 'GET_FEATURE_FLAGS':
      return handleGetFeatureFlags();

    case 'SET_FEATURE_FLAG':
      return handleSetFeatureFlag(message.payload);

    case 'CONTENT_SCRIPT_READY':
      return handleContentScriptReady(message.payload, sender);

    case 'PING':
      return { success: true, data: 'pong' };

    // Privacy
    case 'GET_PRIVACY_SETTINGS':
    case 'SET_PRIVACY_SETTINGS':
    case 'GET_SITE_PRIVACY_MODE':
    case 'SET_SITE_PRIVACY_MODE':
    case 'GET_ALL_SITE_SETTINGS':
    case 'GET_PRIVACY_METRICS':
    case 'REFRESH_FILTER_LISTS':
    case 'ADD_FILTER_LIST':
    case 'REMOVE_FILTER_LIST':
    case 'GET_BLOCKED_COUNT':
    case 'GET_BLOCKED_REQUESTS':
    case 'GET_COSMETIC_RULES':
      return handlePrivacyMessageWrapper(message.type, message.payload);

    // Filter List Health
    case 'GET_FILTER_LIST_HEALTH':
      return handleGetFilterListHealth();
    
    case 'RESET_FILTER_LIST':
      return handleResetFilterList(message.payload);

    // Threat Intelligence
    case 'GET_THREAT_INTEL_HEALTH':
      return handleGetThreatIntelHealth();
    
    case 'REFRESH_THREAT_INTEL':
      return handleRefreshThreatIntel();
    
    case 'GET_THREAT_INTEL_SOURCES':
      return handleGetThreatIntelSources();
    
    case 'ADD_THREAT_INTEL_SOURCE':
      return handleAddThreatIntelSource(message.payload);
    
    case 'REMOVE_THREAT_INTEL_SOURCE':
      return handleRemoveThreatIntelSource(message.payload);
    
    case 'TOGGLE_THREAT_INTEL_SOURCE':
      return handleToggleThreatIntelSource(message.payload);

    // Fingerprinting
    case 'GET_FINGERPRINT_SETTINGS':
    case 'SET_FINGERPRINT_SETTINGS':
    case 'GET_FINGERPRINT_STATUS':
      return handleFingerprintMessageWrapper(message.type, message.payload);

    // Wallet
    case 'WALLET_CREATE':
    case 'WALLET_IMPORT':
    case 'WALLET_UNLOCK':
    case 'WALLET_LOCK':
    case 'WALLET_EXISTS':
    case 'WALLET_GET_STATE':
    case 'WALLET_DELETE':
    case 'WALLET_GET_BALANCE':
    case 'WALLET_GET_ADDRESS':
    case 'WALLET_GET_ADDRESS_QR':
    case 'WALLET_SET_NETWORK':
    case 'WALLET_GET_NETWORK':
    case 'WALLET_GET_NETWORK_STATUS':
    case 'WALLET_SIGN_TRANSACTION':
    case 'WALLET_SIGN_MESSAGE':
    case 'WALLET_GET_SETTINGS':
    case 'WALLET_SET_SETTINGS':
    // Wallet transactions
    case 'WALLET_SEND_SOL':
    case 'WALLET_ESTIMATE_FEE':
    case 'WALLET_GET_HISTORY':
    case 'WALLET_GET_TOKENS':
    case 'WALLET_ADD_TOKEN':
    case 'WALLET_REMOVE_TOKEN':
    // Wallet RPC health
    case 'WALLET_GET_RPC_HEALTH':
    case 'WALLET_ADD_RPC':
    case 'WALLET_REMOVE_RPC':
    case 'WALLET_TEST_RPC':
      return handleWalletMessageWrapper(message.type as WalletMessageType, message.payload);

    // Security
    case 'SECURITY_CONNECTION_REQUEST':
    case 'SECURITY_CONNECTION_APPROVE':
    case 'SECURITY_CONNECTION_DENY':
    case 'SECURITY_CONNECTION_REVOKE':
    case 'SECURITY_GET_CONNECTIONS':
    case 'SECURITY_GET_ACTIVE_CONNECTIONS':
    case 'SECURITY_VERIFY_TRANSACTION':
    case 'SECURITY_TRANSACTION_DECISION':
    case 'SECURITY_GET_PENDING_VERIFICATIONS':
    case 'SECURITY_CHECK_DOMAIN':
    case 'SECURITY_DISMISS_WARNING':
    case 'SECURITY_REPORT_DOMAIN':
    case 'SECURITY_GET_SETTINGS':
    case 'SECURITY_SET_SETTINGS':
    case 'SECURITY_GET_DOMAIN_SETTINGS':
    case 'SECURITY_SET_DOMAIN_TRUST':
    case 'SECURITY_GET_PROGRAM_INFO':
    case 'SECURITY_SET_PROGRAM_TRUST':
      return handleSecurityMessageWrapper(message.type as SecurityMessageType, message.payload, sender.tab?.id);

    default:
      return {
        success: false,
        error: `Unknown message type: ${(message as ExtensionMessage).type}`,
      };
  }
}

async function handleGetFeatureFlags(): Promise<MessageResponse<FeatureFlags>> {
  const flags = await getFeatureFlags();
  return { success: true, data: flags };
}

async function handleSetFeatureFlag(
  payload: { id: 'privacy' | 'wallet' | 'notifications'; enabled: boolean }
): Promise<MessageResponse> {
  await setFeatureFlag(payload.id, payload.enabled);
  console.log('[AINTIVIRUS] Feature flag updated:', payload.id, '=', payload.enabled);

  // Keep privacy engine in sync
  if (payload.id === 'privacy') {
    await togglePrivacyProtection(payload.enabled);
  }

  return { success: true };
}

async function handleContentScriptReady(
  payload: { url: string },
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  console.log('[AINTIVIRUS] Content script ready on tab:', sender.tab?.id, 'url:', payload.url);
  // DNR handles the heavy lifting, content script is mostly for UI stuff
  return { success: true };
}

async function handlePrivacyMessageWrapper(
  type: string,
  payload: unknown
): Promise<MessageResponse> {
  try {
    const result = await handlePrivacyMessage(type, payload);
    return { success: true, data: result };
  } catch (error) {
    console.error('[AINTIVIRUS] Privacy message error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleFingerprintMessageWrapper(
  type: string,
  payload: unknown
): Promise<MessageResponse> {
  try {
    const result = await handleFingerprintMessage(type, payload);
    return { success: true, data: result };
  } catch (error) {
    console.error('[AINTIVIRUS] Fingerprint message error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// All wallet ops go through here - keys never leave the wallet module
async function handleWalletMessageWrapper(
  type: WalletMessageType,
  payload: unknown
): Promise<MessageResponse> {
  try {
    const result = await handleWalletMessage(type, payload);
    return { success: true, data: result };
  } catch (error) {
    console.error('[AINTIVIRUS] Wallet message error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Security features: connection tracking, tx verification, phishing checks
async function handleSecurityMessageWrapper(
  type: SecurityMessageType,
  payload: unknown,
  senderTabId?: number
): Promise<MessageResponse> {
  try {
    const result = await handleSecurityMessage(type, payload, senderTabId);
    return { success: true, data: result };
  } catch (error) {
    console.error('[AINTIVIRUS] Security message error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Filter List Health handlers
async function handleGetFilterListHealth(): Promise<MessageResponse> {
  try {
    const health = await getFilterListHealth();
    return { success: true, data: health };
  } catch (error) {
    console.error('[AINTIVIRUS] Filter list health error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleResetFilterList(
  payload: { url: string }
): Promise<MessageResponse> {
  try {
    await resetFilterList(payload.url);
    return { success: true };
  } catch (error) {
    console.error('[AINTIVIRUS] Filter list reset error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Threat Intelligence handlers
async function handleGetThreatIntelHealth(): Promise<MessageResponse> {
  try {
    const health = await getThreatIntelHealth();
    return { success: true, data: health };
  } catch (error) {
    console.error('[AINTIVIRUS] Threat intel health error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleRefreshThreatIntel(): Promise<MessageResponse> {
  try {
    const success = await refreshThreatIntel(true);
    return { success: true, data: { refreshed: success } };
  } catch (error) {
    console.error('[AINTIVIRUS] Threat intel refresh error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleGetThreatIntelSources(): Promise<MessageResponse> {
  try {
    const sources = await getThreatIntelSources();
    return { success: true, data: sources };
  } catch (error) {
    console.error('[AINTIVIRUS] Get threat intel sources error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleAddThreatIntelSource(
  payload: { name: string; url: string; type: 'phishing' | 'malware' | 'scam' | 'combined'; format: 'text' | 'json' | 'csv'; refreshIntervalHours?: number; priority?: number }
): Promise<MessageResponse> {
  try {
    await addThreatIntelSource({
      name: payload.name,
      url: payload.url,
      type: payload.type,
      format: payload.format,
      enabled: true,
      refreshIntervalHours: payload.refreshIntervalHours || 6,
      priority: payload.priority || 10,
    });
    return { success: true };
  } catch (error) {
    console.error('[AINTIVIRUS] Add threat intel source error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleRemoveThreatIntelSource(
  payload: { sourceId: string }
): Promise<MessageResponse> {
  try {
    await removeThreatIntelSource(payload.sourceId);
    return { success: true };
  } catch (error) {
    console.error('[AINTIVIRUS] Remove threat intel source error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleToggleThreatIntelSource(
  payload: { sourceId: string; enabled: boolean }
): Promise<MessageResponse> {
  try {
    await toggleThreatIntelSource(payload.sourceId, payload.enabled);
    return { success: true };
  } catch (error) {
    console.error('[AINTIVIRUS] Toggle threat intel source error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

console.log('[AINTIVIRUS] Background service worker ready');
