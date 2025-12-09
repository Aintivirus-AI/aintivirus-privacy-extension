

export const DAPP_MESSAGE_SOURCE = {
  INPAGE: 'aintivirus-inpage',
  CONTENT: 'aintivirus-content',
  BACKGROUND: 'aintivirus-background',
} as const;

export type DAppMessageSource = typeof DAPP_MESSAGE_SOURCE[keyof typeof DAPP_MESSAGE_SOURCE];


export type DAppChainType = 'evm' | 'solana';


export type DAppMessageType =
  
  | 'DAPP_CONNECT'
  | 'DAPP_DISCONNECT'
  | 'DAPP_IS_CONNECTED'
  
  | 'EVM_REQUEST'
  | 'EVM_CHAIN_CHANGED'
  | 'EVM_ACCOUNTS_CHANGED'
  | 'EVM_CONNECT'
  | 'EVM_DISCONNECT'
  
  | 'SOLANA_CONNECT'
  | 'SOLANA_DISCONNECT'
  | 'SOLANA_SIGN_TRANSACTION'
  | 'SOLANA_SIGN_ALL_TRANSACTIONS'
  | 'SOLANA_SIGN_MESSAGE'
  | 'SOLANA_SIGN_AND_SEND'
  
  | 'DAPP_RESPONSE'
  | 'DAPP_ERROR'
  
  | 'DAPP_GET_STATE'
  | 'DAPP_APPROVAL_RESULT';


export interface DAppMessage<T = unknown> {
  
  id: string;
  
  source: DAppMessageSource;
  
  type: DAppMessageType;
  
  chainType: DAppChainType;
  
  payload: T;
  
  origin: string;
  
  timestamp: number;
}


export interface DAppResponse<T = unknown> {
  id: string;
  success: boolean;
  result?: T;
  error?: DAppError;
}


export interface DAppError {
  code: number;
  message: string;
  data?: unknown;
}


export const EIP1193_ERROR_CODES = {
  
  USER_REJECTED: 4001,
  
  UNAUTHORIZED: 4100,
  
  UNSUPPORTED_METHOD: 4200,
  
  DISCONNECTED: 4900,
  
  CHAIN_DISCONNECTED: 4901,
  
  INVALID_PARAMS: -32602,
  
  INTERNAL_ERROR: -32603,
  
  PARSE_ERROR: -32700,
  
  INVALID_REQUEST: -32600,
  
  METHOD_NOT_FOUND: -32601,
} as const;

export type EIP1193ErrorCode = typeof EIP1193_ERROR_CODES[keyof typeof EIP1193_ERROR_CODES];


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


export interface EVMRequestPayload {
  method: string;
  params?: unknown[];
}


export type EVMMethod =
  
  | 'eth_requestAccounts'
  | 'eth_accounts'
  | 'eth_coinbase'
  
  | 'eth_chainId'
  | 'net_version'
  
  | 'personal_sign'
  | 'eth_sign'
  | 'eth_signTypedData'
  | 'eth_signTypedData_v3'
  | 'eth_signTypedData_v4'
  
  | 'eth_sendTransaction'
  | 'eth_sendRawTransaction'
  | 'eth_getTransactionByHash'
  | 'eth_getTransactionReceipt'
  | 'eth_estimateGas'
  | 'eth_gasPrice'
  | 'eth_maxPriorityFeePerGas'
  | 'eth_feeHistory'
  
  | 'eth_blockNumber'
  | 'eth_getBlockByNumber'
  | 'eth_getBlockByHash'
  
  | 'eth_getBalance'
  | 'eth_getCode'
  | 'eth_getStorageAt'
  | 'eth_call'
  
  | 'wallet_switchEthereumChain'
  | 'wallet_addEthereumChain'
  | 'wallet_watchAsset'
  | 'wallet_getPermissions'
  | 'wallet_requestPermissions';


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


export interface SolanaConnectOptions {
  
  onlyIfTrusted?: boolean;
}


export interface SolanaSendOptions {
  skipPreflight?: boolean;
  preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
  maxRetries?: number;
  minContextSlot?: number;
}


export interface SerializedTransaction {
  
  data: string;
  
  isVersioned: boolean;
}


export interface SitePermission {
  
  origin: string;
  
  chainType: DAppChainType;
  
  accounts: string[];
  
  chains: string[];
  
  connectedAt: number;
  
  lastAccessed: number;
  
  remember: boolean;
  
  label?: string;
}


export interface PermissionStore {
  
  version: number;
  
  permissions: Record<string, SitePermission>;
  
  settings: PermissionSettings;
}


export interface PermissionSettings {
  
  autoRevokeAfterDays: number;
  
  requireApprovalPerTransaction: boolean;
  
  maxConnectedSites: number;
}

export const DEFAULT_PERMISSION_SETTINGS: PermissionSettings = {
  autoRevokeAfterDays: 0,
  requireApprovalPerTransaction: true,
  maxConnectedSites: 0,
};


export type QueuedRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'expired' | 'cancelled';


export type ApprovalType = 'connect' | 'sign' | 'signMessage' | 'transaction' | 'switchChain' | 'addChain';


export interface QueuedRequest {
  
  id: string;
  
  nonce: string;
  
  origin: string;
  
  tabId: number;
  
  chainType: DAppChainType;
  
  method: string;
  
  params: unknown;
  
  approvalType: ApprovalType;
  
  createdAt: number;
  
  expiresAt: number;
  
  status: QueuedRequestStatus;
  
  favicon?: string;
  
  title?: string;
  
  result?: unknown;
  
  error?: DAppError;
}


export interface RequestQueueStore {
  
  version: number;
  
  requests: QueuedRequest[];
  
  timeoutMs: number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000; 


export interface ApprovalWindowData {
  
  requestId: string;
  
  approvalType: ApprovalType;
  
  origin: string;
  
  chainType: DAppChainType;
  
  method: string;
  
  params: unknown;
  
  availableAccounts: AccountInfo[];
  
  currentChainId: string;
  
  favicon?: string;
  
  title?: string;
}


export interface AccountInfo {
  address: string;
  label?: string;
  balance?: string;
  isActive: boolean;
}


export interface ApprovalResult {
  
  requestId: string;
  
  approved: boolean;
  
  selectedAccounts?: string[];
  
  remember?: boolean;
  
  error?: string;
}


export interface EVMProviderState {
  
  isConnected: boolean;
  
  chainId: string;
  
  accounts: string[];
  
  networkVersion: string;
}


export interface SolanaProviderState {
  
  isConnected: boolean;
  
  publicKey: string | null;
  
  network: 'mainnet-beta' | 'devnet' | 'testnet';
}


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


export function isValidDAppSource(source: unknown): source is DAppMessageSource {
  return (
    source === DAPP_MESSAGE_SOURCE.INPAGE ||
    source === DAPP_MESSAGE_SOURCE.CONTENT ||
    source === DAPP_MESSAGE_SOURCE.BACKGROUND
  );
}


export function isFromInpage(msg: DAppMessage): boolean {
  return msg.source === DAPP_MESSAGE_SOURCE.INPAGE;
}


export function isFromContent(msg: DAppMessage): boolean {
  return msg.source === DAPP_MESSAGE_SOURCE.CONTENT;
}


export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}


export function generateSecureNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}


export function createPermissionKey(origin: string, chainType: DAppChainType): string {
  return `${origin}:${chainType}`;
}


export function parsePermissionKey(key: string): { origin: string; chainType: DAppChainType } | null {
  const lastColonIndex = key.lastIndexOf(':');
  if (lastColonIndex === -1) return null;
  
  const origin = key.substring(0, lastColonIndex);
  const chainType = key.substring(lastColonIndex + 1) as DAppChainType;
  
  if (chainType !== 'evm' && chainType !== 'solana') return null;
  
  return { origin, chainType };
}


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


export function toHexChainId(chainId: number | string): string {
  if (typeof chainId === 'string') {
    if (chainId.startsWith('0x')) return chainId;
    return `0x${parseInt(chainId, 10).toString(16)}`;
  }
  return `0x${chainId.toString(16)}`;
}


export function fromHexChainId(hexChainId: string): number {
  return parseInt(hexChainId, 16);
}
