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

import { 
  initializePrivacyEngine,
  handlePrivacyMessage,
  togglePrivacyProtection,
  checkAndRefreshFilterLists,
  enableRuleset,
  disableRuleset,
  toggleRuleset,
  getRulesetStats,
} from '../privacy';

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

import {
  getFilterListHealth,
  resetFilterList,
} from '../privacy/filterListManager';

import {
  initializeFingerprintProtection,
  handleFingerprintMessage,
} from '../fingerprinting';

import {
  initializeWalletModule,
  handleWalletMessage,
  WalletMessageType,
} from '../wallet';
import {
  handleAutoLockAlarm,
  getAutoLockAlarmName,
} from '../wallet/storage';
import {
  TX_POLL_ALARM_NAME,
  handleTxPollAlarm,
  setupTxPollingAlarm,
} from '../wallet/chains/evm/pendingTxStore';
import {
  getSolPriceWithChange,
  getEthPriceWithChange,
  getTokenPrices,
} from '../wallet/prices';

import {
  initializeSecurityModule,
  handleSecurityMessage,
  handleSecurityCleanupAlarm,
  SecurityMessageType,
} from '../security';

import {
  initializeDAppHandlers,
  handleDAppMessage,
  handleDAppTabClosed,
  handleDAppWalletLocked,
} from '../dapp/handlers';
import { handleRequestQueueAlarm } from '../dapp/queue/requestQueue';

initializeNotificationHandlers();

chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeStorage();

  if (details.reason === 'install') {
  } else if (details.reason === 'update') {
  }

  await initializePrivacyEngine();
  await initializeFingerprintProtection();
  await initializeWalletModule();
  await initializeSecurityModule();
  await initializeThreatIntel();
  await initializeDAppHandlers();
  setupThreatIntelAlarm();
  await setupTxPollingAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  const flags = await getFeatureFlags();

  await initializePrivacyEngine();
  await initializeFingerprintProtection();
  await initializeWalletModule();
  await initializeSecurityModule();
  await initializeThreatIntel();
  await initializeDAppHandlers();
  
  await checkAndRefreshFilterLists();
  
  await setupTxPollingAlarm();
});

chrome.alarms.create('filterListRefresh', {
  periodInMinutes: 60 * 6,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const handledByQueue = await handleRequestQueueAlarm(alarm);
  if (handledByQueue) return;
  
  if (alarm.name === 'filterListRefresh') {
    await checkAndRefreshFilterLists();
  } else if (alarm.name === getAutoLockAlarmName()) {
    handleAutoLockAlarm();
    await handleDAppWalletLocked();
  } else if (alarm.name === 'securityCleanup') {
    await handleSecurityCleanupAlarm();
  } else if (alarm.name === TX_POLL_ALARM_NAME) {
    await handleTxPollAlarm();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});

createMessageListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

  return true;
});

async function handleMessage(
  message: ExtensionMessage | { what?: string; css?: string },
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  
  if ('what' in message && message.what) {
    const legacyMessage = message as { what: string; css?: string };
    const tabId = sender.tab?.id;
    const frameId = sender.frameId ?? 0;

    switch (legacyMessage.what) {
      case 'insertCSS': {
        if (tabId === undefined || frameId === undefined) return { success: false };
        try {
          await chrome.scripting.insertCSS({
            css: legacyMessage.css || '',
            origin: 'USER',
            target: { tabId, frameIds: [frameId] },
          });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      }

      case 'removeCSS': {
        if (tabId === undefined || frameId === undefined) return { success: false };
        try {
          await chrome.scripting.removeCSS({
            css: legacyMessage.css || '',
            origin: 'USER',
            target: { tabId, frameIds: [frameId] },
          });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      }

      case 'injectCSSProceduralAPI': {
        if (tabId === undefined || frameId === undefined) return { success: false };
        try {
          await chrome.scripting.executeScript({
            files: ['/ubol/js/scripting/css-procedural-api.js'],
            target: { tabId, frameIds: [frameId] },
            injectImmediately: true,
          });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      }

      default:
        return { success: false, error: 'Unknown uBOL message type' };
    }
  }

  
  const extMessage = message as ExtensionMessage;

  switch (extMessage.type) {
    case 'GET_FEATURE_FLAGS':
      return handleGetFeatureFlags();

    case 'SET_FEATURE_FLAG':
      return handleSetFeatureFlag(extMessage.payload);

    case 'CONTENT_SCRIPT_READY':
      return handleContentScriptReady(extMessage.payload, sender);

    case 'PING':
      return { success: true, data: 'pong' };

    case 'OPEN_SETTINGS':
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
      return { success: true };

    case 'GET_PRIVACY_SETTINGS':
    case 'SET_PRIVACY_SETTINGS':
    case 'GET_AD_BLOCKER_STATUS':
    case 'SET_AD_BLOCKER_STATUS':
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
      return handlePrivacyMessageWrapper(extMessage.type, extMessage.payload);

    case 'GET_FILTER_LIST_HEALTH':
      return handleGetFilterListHealth();
    
    case 'RESET_FILTER_LIST':
      return handleResetFilterList(extMessage.payload);

    case 'GET_RULESET_STATS':
      return handleGetRulesetStats();
    
    case 'ENABLE_RULESET':
      return handleEnableRuleset(extMessage.payload);
    
    case 'DISABLE_RULESET':
      return handleDisableRuleset(extMessage.payload);
    
    case 'TOGGLE_RULESET':
      return handleToggleRuleset(extMessage.payload);

    case 'GET_THREAT_INTEL_HEALTH':
      return handleGetThreatIntelHealth();
    
    case 'REFRESH_THREAT_INTEL':
      return handleRefreshThreatIntel();
    
    case 'GET_THREAT_INTEL_SOURCES':
      return handleGetThreatIntelSources();
    
    case 'ADD_THREAT_INTEL_SOURCE':
      return handleAddThreatIntelSource(extMessage.payload);
    
    case 'REMOVE_THREAT_INTEL_SOURCE':
      return handleRemoveThreatIntelSource(extMessage.payload);
    
    case 'TOGGLE_THREAT_INTEL_SOURCE':
      return handleToggleThreatIntelSource(extMessage.payload);

    case 'GET_FINGERPRINT_SETTINGS':
    case 'SET_FINGERPRINT_SETTINGS':
    case 'GET_FINGERPRINT_STATUS':
      return handleFingerprintMessageWrapper(extMessage.type, extMessage.payload);

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
    case 'WALLET_SEND_SOL':
    case 'WALLET_SEND_SPL_TOKEN':
    case 'WALLET_ESTIMATE_FEE':
    case 'WALLET_GET_HISTORY':
    case 'WALLET_GET_TOKENS':
    case 'WALLET_ADD_TOKEN':
    case 'WALLET_REMOVE_TOKEN':
    case 'WALLET_GET_POPULAR_TOKENS':
    case 'WALLET_GET_TOKEN_METADATA':
    case 'WALLET_GET_RPC_HEALTH':
    case 'WALLET_ADD_RPC':
    case 'WALLET_REMOVE_RPC':
    case 'WALLET_TEST_RPC':
    case 'WALLET_LIST':
    case 'WALLET_ADD':
    case 'WALLET_IMPORT_ADD':
    case 'WALLET_SWITCH':
    case 'WALLET_RENAME':
    case 'WALLET_DELETE_ONE':
    case 'WALLET_EXPORT_ONE':
    case 'WALLET_IMPORT_PRIVATE_KEY':
    case 'WALLET_EXPORT_PRIVATE_KEY':
    case 'WALLET_GET_ACTIVE':
    case 'WALLET_GET_ALLOWANCES':
    case 'WALLET_ESTIMATE_REVOKE_FEE':
    case 'WALLET_REVOKE_ALLOWANCE':
    case 'WALLET_SET_CHAIN':
    case 'WALLET_SET_EVM_CHAIN':
    case 'WALLET_GET_EVM_BALANCE':
    case 'WALLET_SEND_ETH':
    case 'WALLET_SEND_ERC20':
    case 'WALLET_GET_EVM_TOKENS':
    case 'WALLET_GET_EVM_HISTORY':
    case 'WALLET_ESTIMATE_EVM_FEE':
    case 'WALLET_GET_EVM_ADDRESS':
    case 'EVM_GET_PENDING_TXS':
    case 'EVM_SPEED_UP_TX':
    case 'EVM_CANCEL_TX':
    case 'EVM_GET_GAS_PRESETS':
    case 'EVM_ESTIMATE_REPLACEMENT_FEE':
    // Jupiter Swap
    case 'WALLET_SWAP_QUOTE':
    case 'WALLET_SWAP_EXECUTE':
    case 'WALLET_SWAP_AVAILABLE':
    case 'WALLET_SWAP_REFERRAL_STATUS':
      return handleWalletMessageWrapper(extMessage.type as WalletMessageType, extMessage.payload);

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
      return handleSecurityMessageWrapper(extMessage.type as SecurityMessageType, extMessage.payload, sender.tab?.id);

    case 'GET_SOL_PRICE':
      return handleGetSolPrice();
    
    case 'GET_ETH_PRICE':
      return handleGetEthPrice();
    
    case 'GET_TOKEN_PRICES':
      return handleGetTokenPrices(extMessage.payload);

    case 'DAPP_REQUEST':
    case 'DAPP_APPROVE':
    case 'DAPP_REJECT':
    case 'DAPP_GET_PERMISSIONS':
    case 'DAPP_REVOKE_PERMISSION':
    case 'DAPP_REVOKE_ALL_PERMISSIONS':
    case 'DAPP_GET_PENDING_REQUESTS':
    case 'DAPP_CANCEL_REQUEST':
    case 'DAPP_GET_PROVIDER_STATE':
    case 'DAPP_PAGE_UNLOAD':
    case 'GET_TAB_ID':
      return handleDAppMessageWrapper(extMessage.type, extMessage.payload, sender);

    default:
      return {
        success: false,
        error: `Unknown message type: ${extMessage.type}`,
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

  if (payload.id === 'privacy') {
    await togglePrivacyProtection(payload.enabled);
  }

  return { success: true };
}

async function handleContentScriptReady(
  payload: { url: string },
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleWalletMessageWrapper(
  type: WalletMessageType,
  payload: unknown
): Promise<MessageResponse> {
  try {
    const result = await handleWalletMessage(type, payload);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleSecurityMessageWrapper(
  type: SecurityMessageType,
  payload: unknown,
  senderTabId?: number
): Promise<MessageResponse> {
  try {
    const result = await handleSecurityMessage(type, payload, senderTabId);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleGetFilterListHealth(): Promise<MessageResponse> {
  try {
    const health = await getFilterListHealth();
    return { success: true, data: health };
  } catch (error) {
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleGetRulesetStats(): Promise<MessageResponse> {
  try {
    const stats = await getRulesetStats();
    return { success: true, data: stats };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleEnableRuleset(
  payload: { rulesetId: string }
): Promise<MessageResponse> {
  try {
    await enableRuleset(payload.rulesetId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleDisableRuleset(
  payload: { rulesetId: string }
): Promise<MessageResponse> {
  try {
    await disableRuleset(payload.rulesetId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleToggleRuleset(
  payload: { rulesetId: string }
): Promise<MessageResponse> {
  try {
    const enabled = await toggleRuleset(payload.rulesetId);
    return { success: true, data: { enabled } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleGetThreatIntelHealth(): Promise<MessageResponse> {
  try {
    const health = await getThreatIntelHealth();
    return { success: true, data: health };
  } catch (error) {
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleGetSolPrice(): Promise<MessageResponse> {
  try {
    const result = await getSolPriceWithChange();
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleGetEthPrice(): Promise<MessageResponse> {
  try {
    const result = await getEthPriceWithChange();
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleGetTokenPrices(
  payload: { mints: string[] }
): Promise<MessageResponse> {
  try {
    const prices = await getTokenPrices(payload.mints);
    const pricesObj: Record<string, number> = {};
    prices.forEach((price, mint) => {
      pricesObj[mint] = price;
    });
    return { success: true, data: pricesObj };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleDAppMessageWrapper(
  type: string,
  payload: unknown,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  try {
    const result = await handleDAppMessage(type, payload, sender);
    return { 
      success: result.success, 
      data: result.data,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
