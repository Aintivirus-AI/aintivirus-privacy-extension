/**
 * AINTIVIRUS dApp Bridge - Constants
 * 
 * Shared constants for message passing between inpage, content, and background scripts.
 */

/**
 * Message source identifiers
 */
export const MESSAGE_SOURCE = {
  INPAGE: 'aintivirus-inpage',
  CONTENT: 'aintivirus-content',
  BACKGROUND: 'aintivirus-background',
} as const;

/**
 * Message type prefixes for filtering
 */
export const MESSAGE_PREFIX = 'AINTIVIRUS_DAPP_';

/**
 * Provider identification
 */
export const PROVIDER_INFO = {
  NAME: 'Aintivirus',
  VERSION: '1.0.0',
  // EVM provider flags
  EVM: {
    IS_METAMASK: false,
    IS_AINTIVIRUS: true,
  },
  // Solana provider flags
  SOLANA: {
    IS_PHANTOM: false,
    IS_AINTIVIRUS: true,
  },
} as const;

/**
 * Supported EVM chain IDs
 */
export const EVM_CHAIN_IDS = {
  ETHEREUM: '0x1',
  POLYGON: '0x89',
  ARBITRUM: '0xa4b1',
  OPTIMISM: '0xa',
  BASE: '0x2105',
  // Testnets
  GOERLI: '0x5',
  SEPOLIA: '0xaa36a7',
  MUMBAI: '0x13881',
} as const;

/**
 * Chain ID to network name mapping
 */
export const EVM_CHAIN_NAMES: Record<string, string> = {
  '0x1': 'Ethereum Mainnet',
  '0x89': 'Polygon',
  '0xa4b1': 'Arbitrum One',
  '0xa': 'Optimism',
  '0x2105': 'Base',
  '0x5': 'Goerli Testnet',
  '0xaa36a7': 'Sepolia Testnet',
  '0x13881': 'Mumbai Testnet',
};

/**
 * Solana network names
 */
export const SOLANA_NETWORKS = {
  MAINNET: 'mainnet-beta',
  DEVNET: 'devnet',
  TESTNET: 'testnet',
} as const;

/**
 * Request timeout values
 */
export const TIMEOUTS = {
  /** Request expiration timeout (5 minutes) */
  REQUEST_EXPIRY_MS: 5 * 60 * 1000,
  /** Response wait timeout (30 seconds) */
  RESPONSE_WAIT_MS: 30 * 1000,
  /** Approval window timeout (10 minutes) */
  APPROVAL_WINDOW_MS: 10 * 60 * 1000,
} as const;

/**
 * Storage keys
 */
export const STORAGE_KEYS = {
  PERMISSIONS: 'dappPermissions',
  REQUEST_QUEUE: 'dappRequestQueue',
  PROVIDER_STATE: 'dappProviderState',
} as const;

/**
 * Approval window dimensions
 */
export const APPROVAL_WINDOW = {
  WIDTH: 400,
  HEIGHT: 600,
  TYPE: 'popup' as const,
} as const;
