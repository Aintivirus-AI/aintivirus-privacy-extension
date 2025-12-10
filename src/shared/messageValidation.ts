/**
 * Message validation utilities for secure message passing
 * Ensures only valid, expected messages are processed by the extension
 */

/**
 * Allowed message types from content scripts and extension pages
 */
const ALLOWED_MESSAGE_TYPES = new Set([
  // Feature flags
  'GET_FEATURE_FLAGS',
  'SET_FEATURE_FLAG',
  
  // Content script lifecycle
  'CONTENT_SCRIPT_READY',
  'PING',
  
  // Settings
  'OPEN_SETTINGS',
  
  // Privacy/Ad blocker
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
  
  // Threat intel
  'GET_THREAT_INTEL_HEALTH',
  'REFRESH_THREAT_INTEL',
  'GET_THREAT_INTEL_SOURCES',
  'ADD_THREAT_INTEL_SOURCE',
  'REMOVE_THREAT_INTEL_SOURCE',
  'TOGGLE_THREAT_INTEL_SOURCE',
  
  // Fingerprinting
  'GET_FINGERPRINT_SETTINGS',
  'SET_FINGERPRINT_SETTINGS',
  'GET_FINGERPRINT_STATUS',
  
  // Wallet - lifecycle
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
  
  // Wallet - network
  'WALLET_SET_NETWORK',
  'WALLET_GET_NETWORK',
  'WALLET_GET_NETWORK_STATUS',
  
  // Wallet - signing (privileged)
  'WALLET_SIGN_TRANSACTION',
  'WALLET_SIGN_MESSAGE',
  
  // Wallet - settings
  'WALLET_GET_SETTINGS',
  'WALLET_SET_SETTINGS',
  
  // Wallet - transactions
  'WALLET_SEND_SOL',
  'WALLET_SEND_SPL_TOKEN',
  'WALLET_ESTIMATE_FEE',
  
  // Wallet - history & tokens
  'WALLET_GET_HISTORY',
  'WALLET_GET_TOKENS',
  'WALLET_ADD_TOKEN',
  'WALLET_REMOVE_TOKEN',
  'WALLET_GET_POPULAR_TOKENS',
  'WALLET_GET_TOKEN_METADATA',
  
  // Wallet - RPC
  'WALLET_GET_RPC_HEALTH',
  'WALLET_ADD_RPC',
  'WALLET_REMOVE_RPC',
  'WALLET_TEST_RPC',
  
  // Wallet - multi-wallet
  'WALLET_LIST',
  'WALLET_ADD',
  'WALLET_IMPORT_ADD',
  'WALLET_SWITCH',
  'WALLET_RENAME',
  'WALLET_DELETE_ONE',
  'WALLET_EXPORT_ONE',
  'WALLET_GET_ACTIVE',
  
  // Wallet - chains
  'WALLET_SET_CHAIN',
  'WALLET_SET_EVM_CHAIN',
  'WALLET_GET_EVM_BALANCE',
  'WALLET_SEND_ETH',
  'WALLET_SEND_ERC20',
  'WALLET_GET_EVM_TOKENS',
  'WALLET_GET_EVM_HISTORY',
  'WALLET_ESTIMATE_EVM_FEE',
  'WALLET_GET_EVM_ADDRESS',
  
  // EVM - pending transactions
  'EVM_GET_PENDING_TXS',
  'EVM_SPEED_UP_TX',
  'EVM_CANCEL_TX',
  'EVM_GET_GAS_PRESETS',
  'EVM_ESTIMATE_REPLACEMENT_FEE',
  
  // Security
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
  
  // Prices
  'GET_SOL_PRICE',
  'GET_ETH_PRICE',
  'GET_TOKEN_PRICES',
  
  // dApp
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
  
  // Private key import/export
  'WALLET_IMPORT_PRIVATE_KEY',
  'WALLET_EXPORT_PRIVATE_KEY',
  
  // Ad blocker toggle
  'AD_BLOCKER_TOGGLED',
]);

/**
 * Privileged operations that should only be callable from extension pages
 * (not from content scripts or web pages)
 */
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

/**
 * Check if a message type is valid
 */
export function isValidMessageType(type: string): boolean {
  return ALLOWED_MESSAGE_TYPES.has(type);
}

/**
 * Check if a message type is privileged
 */
export function isPrivilegedOperation(type: string): boolean {
  return PRIVILEGED_OPERATIONS.has(type);
}

/**
 * Check if sender is from an extension page (not content script)
 */
export function isFromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  // Extension pages have a URL that starts with chrome-extension://<extension-id>/
  if (sender.url && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    // Make sure it's not a content script by checking that tab is undefined
    return sender.tab === undefined;
  }
  return false;
}

/**
 * Check if sender is from our own content script
 */
export function isFromOurContentScript(sender: chrome.runtime.MessageSender): boolean {
  // Content scripts have sender.tab defined and sender.id matches our extension
  return sender.id === chrome.runtime.id && sender.tab !== undefined;
}

/**
 * Validate message structure
 */
export function validateMessageStructure(message: unknown): message is { type: string; payload?: unknown } {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  const msg = message as Record<string, unknown>;
  
  // Must have a 'type' field that is a string
  if (typeof msg.type !== 'string' || !msg.type) {
    return false;
  }
  
  return true;
}

/**
 * Validate message sender and type
 * Returns error string if invalid, null if valid
 */
export function validateMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender
): { valid: true; type: string } | { valid: false; error: string } {
  // Check message structure
  if (!validateMessageStructure(message)) {
    return { valid: false, error: 'Invalid message structure' };
  }
  
  const msg = message as { type: string; payload?: unknown };
  
  // Check if message type is allowed
  if (!isValidMessageType(msg.type)) {
    return { valid: false, error: `Unknown or disallowed message type: ${msg.type}` };
  }
  
  // Check if sender is valid (must be from our extension)
  if (sender.id !== chrome.runtime.id) {
    return { valid: false, error: 'Message from unknown sender' };
  }
  
  // Check if privileged operation
  if (isPrivilegedOperation(msg.type)) {
    // Privileged operations must come from extension pages, not content scripts
    if (!isFromExtensionPage(sender)) {
      return { valid: false, error: 'Privileged operation not allowed from this context' };
    }
  }
  
  return { valid: true, type: msg.type };
}

/**
 * Payload validators for specific message types
 */
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
