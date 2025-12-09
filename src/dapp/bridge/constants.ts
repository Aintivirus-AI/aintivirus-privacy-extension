

export const MESSAGE_SOURCE = {
  INPAGE: 'aintivirus-inpage',
  CONTENT: 'aintivirus-content',
  BACKGROUND: 'aintivirus-background',
} as const;


export const MESSAGE_PREFIX = 'AINTIVIRUS_DAPP_';


export const PROVIDER_INFO = {
  NAME: 'Aintivirus',
  VERSION: '1.0.0',
  
  EVM: {
    IS_METAMASK: false,
    IS_AINTIVIRUS: true,
  },
  
  SOLANA: {
    IS_PHANTOM: false,
    IS_AINTIVIRUS: true,
  },
} as const;


export const EVM_CHAIN_IDS = {
  ETHEREUM: '0x1',
  POLYGON: '0x89',
  ARBITRUM: '0xa4b1',
  OPTIMISM: '0xa',
  BASE: '0x2105',
  
  GOERLI: '0x5',
  SEPOLIA: '0xaa36a7',
  MUMBAI: '0x13881',
} as const;


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


export const SOLANA_NETWORKS = {
  MAINNET: 'mainnet-beta',
  DEVNET: 'devnet',
  TESTNET: 'testnet',
} as const;


export const TIMEOUTS = {
  
  REQUEST_EXPIRY_MS: 5 * 60 * 1000,
  
  RESPONSE_WAIT_MS: 30 * 1000,
  
  APPROVAL_WINDOW_MS: 10 * 60 * 1000,
} as const;


export const STORAGE_KEYS = {
  PERMISSIONS: 'dappPermissions',
  REQUEST_QUEUE: 'dappRequestQueue',
  PROVIDER_STATE: 'dappProviderState',
} as const;


export const APPROVAL_WINDOW = {
  WIDTH: 400,
  HEIGHT: 600,
  TYPE: 'popup' as const,
} as const;
