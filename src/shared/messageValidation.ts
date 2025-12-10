const ALLOWED_MESSAGE_TYPES = new Set([
  'GET_FEATURE_FLAGS',
  'SET_FEATURE_FLAG',
  
  'CONTENT_SCRIPT_READY',
  'PING',
  
  'OPEN_SETTINGS',
  
  'GET_PRIVACY_SETTINGS',
  'SET_PRIVACY_SETTINGS',
  'GET_AD_BLOCKER_STATUS',
  'SET_AD_BLOCKER_STATUS',
  'GET_SITE_PRIVACY_MODE',
  'SET_SITE_PRIVACY_MODE',
  'GET_ALL_SITE_SETTINGS',
  'GET_PRIVACY_METRICS',
  'REFRESH_FILTER_LISTS',
  'ADD_FILTER_LIST',
  'REMOVE_FILTER_LIST',
  'GET_BLOCKED_COUNT',
  'GET_BLOCKED_REQUESTS',
  'GET_COSMETIC_RULES',
  'GET_FILTER_LIST_HEALTH',
  'RESET_FILTER_LIST',
  'GET_RULESET_STATS',
  'ENABLE_RULESET',
  'DISABLE_RULESET',
  'TOGGLE_RULESET',
  
  'GET_THREAT_INTEL_HEALTH',
  'REFRESH_THREAT_INTEL',
  'GET_THREAT_INTEL_SOURCES',
  'ADD_THREAT_INTEL_SOURCE',
  'REMOVE_THREAT_INTEL_SOURCE',
  'TOGGLE_THREAT_INTEL_SOURCE',
  
  'GET_FINGERPRINT_SETTINGS',
  'SET_FINGERPRINT_SETTINGS',
  'GET_FINGERPRINT_STATUS',
  
  'WALLET_CREATE',
  'WALLET_IMPORT',
  'WALLET_UNLOCK',
  'WALLET_LOCK',
  'WALLET_EXISTS',
  'WALLET_GET_STATE',
  'WALLET_DELETE',
  'WALLET_GET_BALANCE',
  'WALLET_GET_ADDRESS',
  'WALLET_GET_ADDRESS_QR',
  
  'WALLET_SET_NETWORK',
  'WALLET_GET_NETWORK',
  'WALLET_GET_NETWORK_STATUS',
  
  'WALLET_SIGN_TRANSACTION',
  'WALLET_SIGN_MESSAGE',
  
  'WALLET_GET_SETTINGS',
  'WALLET_SET_SETTINGS',
  
  'WALLET_SEND_SOL',
  'WALLET_SEND_SPL_TOKEN',
  'WALLET_ESTIMATE_FEE',
  
  'WALLET_GET_HISTORY',
  'WALLET_GET_TOKENS',
  'WALLET_ADD_TOKEN',
  'WALLET_REMOVE_TOKEN',
  'WALLET_GET_POPULAR_TOKENS',
  'WALLET_GET_TOKEN_METADATA',
  
  'WALLET_GET_RPC_HEALTH',
  'WALLET_ADD_RPC',
  'WALLET_REMOVE_RPC',
  'WALLET_TEST_RPC',
  
  'WALLET_LIST',
  'WALLET_ADD',
  'WALLET_IMPORT_ADD',
  'WALLET_SWITCH',
  'WALLET_RENAME',
  'WALLET_DELETE_ONE',
  'WALLET_EXPORT_ONE',
  'WALLET_GET_ACTIVE',
  
  'WALLET_SET_CHAIN',
  'WALLET_SET_EVM_CHAIN',
  'WALLET_GET_EVM_BALANCE',
  'WALLET_SEND_ETH',
  'WALLET_SEND_ERC20',
  'WALLET_GET_EVM_TOKENS',
  'WALLET_GET_EVM_HISTORY',
  'WALLET_ESTIMATE_EVM_FEE',
  'WALLET_GET_EVM_ADDRESS',
  
  'EVM_GET_PENDING_TXS',
  'EVM_SPEED_UP_TX',
  'EVM_CANCEL_TX',
  'EVM_GET_GAS_PRESETS',
  'EVM_ESTIMATE_REPLACEMENT_FEE',
  
  'SECURITY_CONNECTION_REQUEST',
  'SECURITY_CONNECTION_APPROVE',
  'SECURITY_CONNECTION_DENY',
  'SECURITY_CONNECTION_REVOKE',
  'SECURITY_GET_CONNECTIONS',
  'SECURITY_GET_ACTIVE_CONNECTIONS',
  'SECURITY_VERIFY_TRANSACTION',
  'SECURITY_TRANSACTION_DECISION',
  'SECURITY_GET_PENDING_VERIFICATIONS',
  'SECURITY_CHECK_DOMAIN',
  'SECURITY_DISMISS_WARNING',
  'SECURITY_REPORT_DOMAIN',
  'SECURITY_GET_SETTINGS',
  'SECURITY_SET_SETTINGS',
  'SECURITY_GET_DOMAIN_SETTINGS',
  'SECURITY_SET_DOMAIN_TRUST',
  'SECURITY_GET_PROGRAM_INFO',
  'SECURITY_SET_PROGRAM_TRUST',
  
  'GET_SOL_PRICE',
  'GET_ETH_PRICE',
  'GET_TOKEN_PRICES',
  
  'DAPP_REQUEST',
  'DAPP_APPROVE',
  'DAPP_REJECT',
  'DAPP_GET_PERMISSIONS',
  'DAPP_REVOKE_PERMISSION',
  'DAPP_REVOKE_ALL_PERMISSIONS',
  'DAPP_GET_PENDING_REQUESTS',
  'DAPP_CANCEL_REQUEST',
  'DAPP_GET_PROVIDER_STATE',
  'GET_TAB_ID',
  'DAPP_PAGE_UNLOAD',
  
  'WALLET_IMPORT_PRIVATE_KEY',
  'WALLET_EXPORT_PRIVATE_KEY',
  
  'AD_BLOCKER_TOGGLED',
]);

const PRIVILEGED_OPERATIONS = new Set([
  'WALLET_CREATE',
  'WALLET_IMPORT',
  'WALLET_UNLOCK',
  'WALLET_DELETE',
  'WALLET_SIGN_TRANSACTION',
  'WALLET_SIGN_MESSAGE',
  'WALLET_SEND_SOL',
  'WALLET_SEND_SPL_TOKEN',
  'WALLET_SEND_ETH',
  'WALLET_SEND_ERC20',
  'WALLET_EXPORT_ONE',
  'WALLET_DELETE_ONE',
  'WALLET_IMPORT_PRIVATE_KEY',
  'WALLET_EXPORT_PRIVATE_KEY',
  'EVM_SPEED_UP_TX',
  'EVM_CANCEL_TX',
  'DAPP_APPROVE',
]);

export function isValidMessageType(type: string): boolean {
  return ALLOWED_MESSAGE_TYPES.has(type);
}

export function isPrivilegedOperation(type: string): boolean {
  return PRIVILEGED_OPERATIONS.has(type);
}

export function isFromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.url && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    return sender.tab === undefined;
  }
  return false;
}

export function isFromOurContentScript(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.tab !== undefined;
}

export function validateMessageStructure(message: unknown): message is { type: string; payload?: unknown } {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  const msg = message as Record<string, unknown>;
  
  if (typeof msg.type !== 'string' || !msg.type) {
    return false;
  }
  
  return true;
}

export function validateMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender
): { valid: true; type: string } | { valid: false; error: string } {
  if (!validateMessageStructure(message)) {
    return { valid: false, error: 'Invalid message structure' };
  }
  
  const msg = message as { type: string; payload?: unknown };
  
  if (!isValidMessageType(msg.type)) {
    return { valid: false, error: `Unknown or disallowed message type: ${msg.type}` };
  }
  
  if (sender.id !== chrome.runtime.id) {
    return { valid: false, error: 'Message from unknown sender' };
  }
  
  if (isPrivilegedOperation(msg.type)) {
    if (!isFromExtensionPage(sender)) {
      return { valid: false, error: 'Privileged operation not allowed from this context' };
    }
  }
  
  return { valid: true, type: msg.type };
}

export const PayloadValidators = {
  WALLET_UNLOCK: (payload: unknown): boolean => {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return typeof p.password === 'string' && p.password.length > 0;
  },
  
  WALLET_CREATE: (payload: unknown): boolean => {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return typeof p.password === 'string' && p.password.length > 0;
  },
  
  WALLET_IMPORT: (payload: unknown): boolean => {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return typeof p.mnemonic === 'string' && 
           typeof p.password === 'string' && 
           p.mnemonic.length > 0 && 
           p.password.length > 0;
  },
  
  DAPP_REQUEST: (payload: unknown): boolean => {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return typeof p.id === 'string' &&
           typeof p.type === 'string' &&
           typeof p.chainType === 'string' &&
           typeof p.method === 'string' &&
           typeof p.origin === 'string';
  },
};
