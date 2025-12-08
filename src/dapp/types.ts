/**
 * AINTIVIRUS dApp Connectivity - Type Definitions
 * 
 * This module defines the message protocols, permission types, and queue types
 * for dApp connectivity. Used across inpage scripts, content scripts, and
 * the background service worker.
 * 
 * SECURITY ARCHITECTURE:
 * - Messages are strongly typed with source validation
 * - Permissions are scoped per-origin AND per-chain
 * - All sensitive operations require explicit user approval
 */

// ============================================
// MESSAGE PROTOCOL
// ============================================

/**
 * Message source identifiers for validation
 */
export const DAPP_MESSAGE_SOURCE = {
  INPAGE: 'aintivirus-inpage',
  CONTENT: 'aintivirus-content',
  BACKGROUND: 'aintivirus-background',
} as const;

export type DAppMessageSource = typeof DAPP_MESSAGE_SOURCE[keyof typeof DAPP_MESSAGE_SOURCE];

/**
 * Chain types supported by the wallet
 */
export type DAppChainType = 'evm' | 'solana';

/**
 * All message types for inpage <-> content <-> background communication
 */
export type DAppMessageType =
  // Connection lifecycle
  | 'DAPP_CONNECT'
  | 'DAPP_DISCONNECT'
  | 'DAPP_IS_CONNECTED'
  // EVM-specific methods
  | 'EVM_REQUEST'
  | 'EVM_CHAIN_CHANGED'
  | 'EVM_ACCOUNTS_CHANGED'
  | 'EVM_CONNECT'
  | 'EVM_DISCONNECT'
  // Solana-specific methods
  | 'SOLANA_CONNECT'
  | 'SOLANA_DISCONNECT'
  | 'SOLANA_SIGN_TRANSACTION'
  | 'SOLANA_SIGN_ALL_TRANSACTIONS'
  | 'SOLANA_SIGN_MESSAGE'
  | 'SOLANA_SIGN_AND_SEND'
  // Response types
  | 'DAPP_RESPONSE'
  | 'DAPP_ERROR'
  // Internal background messages
  | 'DAPP_GET_STATE'
  | 'DAPP_APPROVAL_RESULT';

/**
 * Message envelope for all dApp communication
 * 
 * SECURITY: Contains source field for origin validation
 */
export interface DAppMessage<T = unknown> {
  /** Unique message ID for request/response matching */
  id: string;
  /** Source identifier for validation */
  source: DAppMessageSource;
  /** Message type */
  type: DAppMessageType;
  /** Chain type (evm or solana) */
  chainType: DAppChainType;
  /** Message payload */
  payload: T;
  /** Origin of the requesting page */
  origin: string;
  /** Timestamp of message creation */
  timestamp: number;
}

/**
 * Response message structure
 */
export interface DAppResponse<T = unknown> {
  id: string;
  success: boolean;
  result?: T;
  error?: DAppError;
}

/**
 * Error structure following EIP-1193 conventions
 */
export interface DAppError {
  code: number;
  message: string;
  data?: unknown;
}

// ============================================
// EIP-1193 ERROR CODES
// ============================================

export const EIP1193_ERROR_CODES = {
  /** User rejected the request */
  USER_REJECTED: 4001,
  /** The requested method/account is not authorized */
  UNAUTHORIZED: 4100,
  /** The requested method is not supported */
  UNSUPPORTED_METHOD: 4200,
  /** The provider is disconnected */
  DISCONNECTED: 4900,
  /** The provider is not connected to the requested chain */
  CHAIN_DISCONNECTED: 4901,
  /** Invalid request parameters */
  INVALID_PARAMS: -32602,
  /** Internal error */
  INTERNAL_ERROR: -32603,
  /** Parse error */
  PARSE_ERROR: -32700,
  /** Invalid request */
  INVALID_REQUEST: -32600,
  /** Method not found */
  METHOD_NOT_FOUND: -32601,
} as const;

export type EIP1193ErrorCode = typeof EIP1193_ERROR_CODES[keyof typeof EIP1193_ERROR_CODES];

/**
 * Create an EIP-1193 compliant error
 */
export function createEIP1193Error(
  code: EIP1193ErrorCode,
  message?: string,
  data?: unknown
): DAppError {
  const defaultMessages: Record<number, string> = {
    [EIP1193_ERROR_CODES.USER_REJECTED]: 'User rejected the request',
    [EIP1193_ERROR_CODES.UNAUTHORIZED]: 'Unauthorized',
    [EIP1193_ERROR_CODES.UNSUPPORTED_METHOD]: 'Unsupported method',
    [EIP1193_ERROR_CODES.DISCONNECTED]: 'Disconnected',
    [EIP1193_ERROR_CODES.CHAIN_DISCONNECTED]: 'Chain disconnected',
    [EIP1193_ERROR_CODES.INVALID_PARAMS]: 'Invalid params',
    [EIP1193_ERROR_CODES.INTERNAL_ERROR]: 'Internal error',
    [EIP1193_ERROR_CODES.PARSE_ERROR]: 'Parse error',
    [EIP1193_ERROR_CODES.INVALID_REQUEST]: 'Invalid request',
    [EIP1193_ERROR_CODES.METHOD_NOT_FOUND]: 'Method not found',
  };

  return {
    code,
    message: message || defaultMessages[code] || 'Unknown error',
    data,
  };
}

// ============================================
// EVM REQUEST TYPES
// ============================================

/**
 * EVM RPC request structure
 */
export interface EVMRequestPayload {
  method: string;
  params?: unknown[];
}

/**
 * Supported EVM methods
 */
export type EVMMethod =
  // Account methods
  | 'eth_requestAccounts'
  | 'eth_accounts'
  | 'eth_coinbase'
  // Chain methods
  | 'eth_chainId'
  | 'net_version'
  // Signing methods
  | 'personal_sign'
  | 'eth_sign'
  | 'eth_signTypedData'
  | 'eth_signTypedData_v3'
  | 'eth_signTypedData_v4'
  // Transaction methods
  | 'eth_sendTransaction'
  | 'eth_sendRawTransaction'
  | 'eth_getTransactionByHash'
  | 'eth_getTransactionReceipt'
  | 'eth_estimateGas'
  | 'eth_gasPrice'
  | 'eth_maxPriorityFeePerGas'
  | 'eth_feeHistory'
  // Block methods
  | 'eth_blockNumber'
  | 'eth_getBlockByNumber'
  | 'eth_getBlockByHash'
  // Balance/state methods
  | 'eth_getBalance'
  | 'eth_getCode'
  | 'eth_getStorageAt'
  | 'eth_call'
  // Wallet methods
  | 'wallet_switchEthereumChain'
  | 'wallet_addEthereumChain'
  | 'wallet_watchAsset'
  | 'wallet_getPermissions'
  | 'wallet_requestPermissions';

/**
 * Transaction parameters for eth_sendTransaction
 */
export interface EVMTransactionParams {
  from: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}

/**
 * Chain parameters for wallet_addEthereumChain
 */
export interface AddEthereumChainParams {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  iconUrls?: string[];
}

// ============================================
// SOLANA REQUEST TYPES
// ============================================

/**
 * Solana connect options
 */
export interface SolanaConnectOptions {
  /** Only connect if already trusted (don't prompt) */
  onlyIfTrusted?: boolean;
}

/**
 * Solana transaction send options
 */
export interface SolanaSendOptions {
  skipPreflight?: boolean;
  preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
  maxRetries?: number;
  minContextSlot?: number;
}

/**
 * Serialized transaction format for message passing
 */
export interface SerializedTransaction {
  /** Base64 encoded transaction */
  data: string;
  /** Whether it's a versioned transaction */
  isVersioned: boolean;
}

// ============================================
// PERMISSION TYPES
// ============================================

/**
 * Permission record for a connected site
 * 
 * SECURITY: Permissions are scoped per-origin AND per-chain
 */
export interface SitePermission {
  /** Origin URL (e.g., https://app.uniswap.org) */
  origin: string;
  /** Chain type this permission applies to */
  chainType: DAppChainType;
  /** Allowed account addresses */
  accounts: string[];
  /** Allowed chain IDs (hex for EVM, string for Solana networks) */
  chains: string[];
  /** Timestamp when connection was first established */
  connectedAt: number;
  /** Timestamp of last access */
  lastAccessed: number;
  /** Whether to auto-approve future connect requests */
  remember: boolean;
  /** Optional user-assigned label */
  label?: string;
}

/**
 * Permission storage structure
 */
export interface PermissionStore {
  /** Version for migrations */
  version: number;
  /** All permissions keyed by `${origin}:${chainType}` */
  permissions: Record<string, SitePermission>;
  /** Global settings */
  settings: PermissionSettings;
}

/**
 * Global permission settings
 */
export interface PermissionSettings {
  /** Auto-lock timeout for permissions (0 = never) */
  autoRevokeAfterDays: number;
  /** Whether to require approval for each transaction */
  requireApprovalPerTransaction: boolean;
  /** Maximum connected sites (0 = unlimited) */
  maxConnectedSites: number;
}

export const DEFAULT_PERMISSION_SETTINGS: PermissionSettings = {
  autoRevokeAfterDays: 0,
  requireApprovalPerTransaction: true,
  maxConnectedSites: 0,
};

// ============================================
// REQUEST QUEUE TYPES
// ============================================

/**
 * Status of a queued request
 */
export type QueuedRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'expired' | 'cancelled';

/**
 * Type of approval needed
 */
export type ApprovalType = 'connect' | 'sign' | 'signMessage' | 'transaction' | 'switchChain' | 'addChain';

/**
 * A request waiting for user approval
 */
export interface QueuedRequest {
  /** Unique request ID */
  id: string;
  /** 
   * Crypto-random nonce for response matching.
   * MV3 SECURITY: Only content script generates this nonce.
   * Background must return it in response for validation.
   */
  nonce: string;
  /** Origin of the requesting page */
  origin: string;
  /** Tab ID of the requesting page */
  tabId: number;
  /** Chain type */
  chainType: DAppChainType;
  /** RPC method name */
  method: string;
  /** Method parameters */
  params: unknown;
  /** Type of approval needed */
  approvalType: ApprovalType;
  /** Timestamp when request was created */
  createdAt: number;
  /** 
   * Absolute timestamp when this request expires.
   * MV3: Used by chrome.alarms for expiration.
   */
  expiresAt: number;
  /** Current status */
  status: QueuedRequestStatus;
  /** Favicon URL if available */
  favicon?: string;
  /** Page title if available */
  title?: string;
  /** Result if approved (persisted for SW restart recovery) */
  result?: unknown;
  /** Error if rejected (persisted for SW restart recovery) */
  error?: DAppError;
}

/**
 * Request queue storage structure
 */
export interface RequestQueueStore {
  /** Version for migrations */
  version: number;
  /** All pending requests */
  requests: QueuedRequest[];
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// APPROVAL WINDOW TYPES
// ============================================

/**
 * Data passed to approval window
 */
export interface ApprovalWindowData {
  /** Request ID being approved */
  requestId: string;
  /** Type of approval */
  approvalType: ApprovalType;
  /** Origin requesting approval */
  origin: string;
  /** Chain type */
  chainType: DAppChainType;
  /** Method being called */
  method: string;
  /** Method parameters */
  params: unknown;
  /** Available accounts to choose from */
  availableAccounts: AccountInfo[];
  /** Current chain ID */
  currentChainId: string;
  /** Favicon URL */
  favicon?: string;
  /** Page title */
  title?: string;
}

/**
 * Account info for approval UI
 */
export interface AccountInfo {
  address: string;
  label?: string;
  balance?: string;
  isActive: boolean;
}

/**
 * Result from approval window
 */
export interface ApprovalResult {
  /** Request ID */
  requestId: string;
  /** Whether approved */
  approved: boolean;
  /** Selected accounts (for connect) */
  selectedAccounts?: string[];
  /** Whether to remember this site */
  remember?: boolean;
  /** Error message if rejected */
  error?: string;
}

// ============================================
// PROVIDER STATE TYPES
// ============================================

/**
 * EVM provider state
 */
export interface EVMProviderState {
  /** Whether connected to a site */
  isConnected: boolean;
  /** Current chain ID (hex) */
  chainId: string;
  /** Connected accounts */
  accounts: string[];
  /** Network version */
  networkVersion: string;
}

/**
 * Solana provider state
 */
export interface SolanaProviderState {
  /** Whether connected to a site */
  isConnected: boolean;
  /** Connected public key (base58) */
  publicKey: string | null;
  /** Current network */
  network: 'mainnet-beta' | 'devnet' | 'testnet';
}

// ============================================
// BACKGROUND MESSAGE TYPES
// ============================================

/**
 * Message types for popup/approval -> background communication
 */
export type DAppBackgroundMessageType =
  | 'DAPP_REQUEST'
  | 'DAPP_APPROVE'
  | 'DAPP_REJECT'
  | 'DAPP_GET_PERMISSIONS'
  | 'DAPP_REVOKE_PERMISSION'
  | 'DAPP_REVOKE_ALL_PERMISSIONS'
  | 'DAPP_GET_PENDING_REQUESTS'
  | 'DAPP_CANCEL_REQUEST'
  | 'DAPP_GET_PROVIDER_STATE'
  | 'DAPP_SWITCH_CHAIN'
  | 'DAPP_ADD_CHAIN';

/**
 * Payload types for background messages
 */
export interface DAppBackgroundPayloads {
  DAPP_REQUEST: {
    chainType: DAppChainType;
    method: string;
    params: unknown;
    origin: string;
    tabId: number;
    favicon?: string;
    title?: string;
  };
  DAPP_APPROVE: {
    requestId: string;
    selectedAccounts?: string[];
    remember?: boolean;
  };
  DAPP_REJECT: {
    requestId: string;
    reason?: string;
  };
  DAPP_GET_PERMISSIONS: undefined;
  DAPP_REVOKE_PERMISSION: {
    origin: string;
    chainType?: DAppChainType;
  };
  DAPP_REVOKE_ALL_PERMISSIONS: undefined;
  DAPP_GET_PENDING_REQUESTS: undefined;
  DAPP_CANCEL_REQUEST: {
    requestId: string;
  };
  DAPP_GET_PROVIDER_STATE: {
    chainType: DAppChainType;
    origin: string;
  };
  DAPP_SWITCH_CHAIN: {
    chainId: string;
  };
  DAPP_ADD_CHAIN: AddEthereumChainParams;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a message is a valid DAppMessage
 */
export function isDAppMessage(value: unknown): value is DAppMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    typeof msg.id === 'string' &&
    typeof msg.source === 'string' &&
    typeof msg.type === 'string' &&
    typeof msg.chainType === 'string' &&
    typeof msg.origin === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

/**
 * Check if source is valid (from our extension)
 */
export function isValidDAppSource(source: unknown): source is DAppMessageSource {
  return (
    source === DAPP_MESSAGE_SOURCE.INPAGE ||
    source === DAPP_MESSAGE_SOURCE.CONTENT ||
    source === DAPP_MESSAGE_SOURCE.BACKGROUND
  );
}

/**
 * Check if a message is from our inpage script
 */
export function isFromInpage(msg: DAppMessage): boolean {
  return msg.source === DAPP_MESSAGE_SOURCE.INPAGE;
}

/**
 * Check if a message is from our content script
 */
export function isFromContent(msg: DAppMessage): boolean {
  return msg.source === DAPP_MESSAGE_SOURCE.CONTENT;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a cryptographically secure nonce for request validation.
 * MV3 SECURITY: Used to prevent response spoofing.
 */
export function generateSecureNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a permission key from origin and chain type
 */
export function createPermissionKey(origin: string, chainType: DAppChainType): string {
  return `${origin}:${chainType}`;
}

/**
 * Parse a permission key back to origin and chain type
 */
export function parsePermissionKey(key: string): { origin: string; chainType: DAppChainType } | null {
  const lastColonIndex = key.lastIndexOf(':');
  if (lastColonIndex === -1) return null;
  
  const origin = key.substring(0, lastColonIndex);
  const chainType = key.substring(lastColonIndex + 1) as DAppChainType;
  
  if (chainType !== 'evm' && chainType !== 'solana') return null;
  
  return { origin, chainType };
}

/**
 * Determine approval type from method name
 */
export function getApprovalType(method: string, chainType: DAppChainType): ApprovalType {
  if (chainType === 'evm') {
    switch (method) {
      case 'eth_requestAccounts':
      case 'wallet_requestPermissions':
        return 'connect';
      case 'personal_sign':
      case 'eth_sign':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4':
        return 'signMessage';
      case 'eth_sendTransaction':
        return 'transaction';
      case 'wallet_switchEthereumChain':
        return 'switchChain';
      case 'wallet_addEthereumChain':
        return 'addChain';
      default:
        return 'sign';
    }
  } else {
    switch (method) {
      case 'connect':
        return 'connect';
      case 'signMessage':
        return 'signMessage';
      case 'signTransaction':
      case 'signAllTransactions':
        return 'sign';
      case 'signAndSendTransaction':
        return 'transaction';
      default:
        return 'sign';
    }
  }
}

/**
 * Check if a method requires user approval
 */
export function requiresApproval(method: string, chainType: DAppChainType): boolean {
  if (chainType === 'evm') {
    const approvalMethods = [
      'eth_requestAccounts',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
      'eth_sendTransaction',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_requestPermissions',
    ];
    return approvalMethods.includes(method);
  } else {
    const approvalMethods = [
      'connect',
      'signTransaction',
      'signAllTransactions',
      'signMessage',
      'signAndSendTransaction',
    ];
    return approvalMethods.includes(method);
  }
}

/**
 * Convert chain ID to hex format
 */
export function toHexChainId(chainId: number | string): string {
  if (typeof chainId === 'string') {
    if (chainId.startsWith('0x')) return chainId;
    return `0x${parseInt(chainId, 10).toString(16)}`;
  }
  return `0x${chainId.toString(16)}`;
}

/**
 * Convert hex chain ID to number
 */
export function fromHexChainId(hexChainId: string): number {
  return parseInt(hexChainId, 16);
}
