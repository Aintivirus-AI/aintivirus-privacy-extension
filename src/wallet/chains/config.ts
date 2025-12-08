/**
 * AINTIVIRUS Wallet - Chain Configurations
 * 
 * This module contains all chain-specific configurations including
 * RPC endpoints, chain IDs, explorers, and network settings.
 * 
 * SECURITY:
 * - Uses public RPC endpoints (no API keys stored in code)
 * - Multiple fallback endpoints for reliability
 * - Chain IDs are verified during transactions
 */

import type { EVMChainConfig, EVMChainId, SolanaChainConfig } from './types';

// ============================================
// EVM CHAIN CONFIGURATIONS
// ============================================

/**
 * EVM chain configurations
 * 
 * Each chain includes:
 * - Mainnet and testnet chain IDs
 * - Multiple RPC endpoints for failover
 * - Block explorer URLs
 * - L2 fee model information
 */
export const EVM_CHAINS: Record<EVMChainId, EVMChainConfig> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    rpcUrls: [
      'https://eth.llamarpc.com',
      'https://ethereum.publicnode.com',
      'https://1rpc.io/eth',
      'https://eth.drpc.org',
      'https://rpc.mevblocker.io',
    ],
    testnet: {
      chainId: 11155111, // Sepolia
      rpcUrls: [
        'https://rpc.sepolia.org',
        'https://rpc2.sepolia.org',
        'https://ethereum-sepolia.publicnode.com',
      ],
    },
    explorer: 'https://etherscan.io',
    isL2: false,
  },

  polygon: {
    chainId: 137,
    name: 'Polygon',
    symbol: 'MATIC',
    decimals: 18,
    rpcUrls: [
      'https://polygon.llamarpc.com',
      'https://polygon-bor.publicnode.com',
      'https://1rpc.io/matic',
      'https://polygon.drpc.org',
      'https://polygon-rpc.com',
    ],
    testnet: {
      chainId: 80002, // Amoy (new testnet, Mumbai deprecated)
      rpcUrls: [
        'https://rpc-amoy.polygon.technology',
        'https://polygon-amoy.drpc.org',
      ],
    },
    explorer: 'https://polygonscan.com',
    isL2: false, // Polygon is a sidechain, not an L2
  },

  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    symbol: 'ETH',
    decimals: 18,
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one.publicnode.com',
      'https://1rpc.io/arb',
      'https://arbitrum.drpc.org',
      'https://arbitrum.llamarpc.com',
    ],
    testnet: {
      chainId: 421614, // Arbitrum Sepolia
      rpcUrls: [
        'https://sepolia-rollup.arbitrum.io/rpc',
        'https://arbitrum-sepolia.publicnode.com',
      ],
    },
    explorer: 'https://arbiscan.io',
    isL2: true,
    l2Type: 'arbitrum',
  },

  optimism: {
    chainId: 10,
    name: 'Optimism',
    symbol: 'ETH',
    decimals: 18,
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism.publicnode.com',
      'https://1rpc.io/op',
      'https://optimism.drpc.org',
      'https://optimism.llamarpc.com',
    ],
    testnet: {
      chainId: 11155420, // OP Sepolia
      rpcUrls: [
        'https://sepolia.optimism.io',
        'https://optimism-sepolia.publicnode.com',
      ],
    },
    explorer: 'https://optimistic.etherscan.io',
    isL2: true,
    l2Type: 'optimism',
  },

  base: {
    chainId: 8453,
    name: 'Base',
    symbol: 'ETH',
    decimals: 18,
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://1rpc.io/base',
      'https://base.drpc.org',
      'https://base.publicnode.com',
    ],
    testnet: {
      chainId: 84532, // Base Sepolia
      rpcUrls: [
        'https://sepolia.base.org',
        'https://base-sepolia.publicnode.com',
      ],
    },
    explorer: 'https://basescan.org',
    isL2: true,
    l2Type: 'optimism', // Base uses OP Stack
  },
};

// ============================================
// SOLANA CHAIN CONFIGURATIONS
// ============================================

/**
 * Solana network configurations
 * 
 * Matches existing configurations in types.ts but centralized here
 */
export const SOLANA_CHAINS: Record<'mainnet-beta' | 'devnet', SolanaChainConfig> = {
  'mainnet-beta': {
    name: 'mainnet-beta',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    fallbackRpcUrls: [
      'https://solana.public-rpc.com',
      'https://solana-mainnet.rpc.extrnode.com',
      'https://mainnet.helius-rpc.com/?api-key=demo',
    ],
    explorerUrl: 'https://explorer.solana.com',
  },
  devnet: {
    name: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    fallbackRpcUrls: [
      'https://devnet.helius-rpc.com/?api-key=demo',
    ],
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
  },
};

// ============================================
// DERIVATION PATHS
// ============================================

import type { EVMDerivationPathType, SolanaDerivationPathType } from '../types';

/**
 * BIP-44 derivation paths
 * 
 * Solana Standard: m/44'/501'/{account}'/0' (Phantom, Solflare)
 * Solana Legacy: m/44'/501'/0'/0' (index=0 only)
 * EVM Standard: m/44'/60'/0'/0/{index} (MetaMask, most wallets)
 * EVM Ledger Live: m/44'/60'/{index}'/0/0 (Ledger Live)
 */
export const DERIVATION_PATHS = {
  /** Solana derivation path (single account, legacy) */
  SOLANA: "m/44'/501'/0'/0'",
  
  /** EVM derivation path prefix (append index) */
  EVM_PREFIX: "m/44'/60'/0'/0",
  
  /**
   * Get Solana derivation path for a given index and path type
   * 
   * @param index - Account index
   * @param pathType - 'standard' or 'legacy'
   * @returns Full derivation path
   */
  getSolanaPath: (index: number, pathType: SolanaDerivationPathType = 'standard'): string => {
    if (pathType === 'legacy') {
      // Legacy path only supports index 0
      return "m/44'/501'/0'/0'";
    }
    // Standard path: m/44'/501'/{index}'/0'
    return `m/44'/501'/${index}'/0'`;
  },
  
  /**
   * Get full EVM derivation path for an index
   * @param index - Account index (default 0)
   * @param pathType - 'standard' or 'ledger-live' (default 'standard')
   */
  getEVMPath: (index: number = 0, pathType: EVMDerivationPathType = 'standard'): string => {
    if (pathType === 'ledger-live') {
      // Ledger Live: m/44'/60'/{index}'/0/0
      return `m/44'/60'/${index}'/0/0`;
    }
    // Standard: m/44'/60'/0'/0/{index}
    return `m/44'/60'/0'/0/${index}`;
  },
  
  /**
   * Get default path types for a new wallet
   */
  getDefaultPathTypes: (): { evmPathType: EVMDerivationPathType; solanaPathType: SolanaDerivationPathType } => ({
    evmPathType: 'standard',
    solanaPathType: 'standard',
  }),
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get EVM chain configuration by chain ID
 * 
 * @param chainId - EVM chain identifier
 * @returns Chain configuration
 */
export function getEVMChainConfig(chainId: EVMChainId): EVMChainConfig {
  const config = EVM_CHAINS[chainId];
  if (!config) {
    throw new Error(`Unknown EVM chain: ${chainId}`);
  }
  return config;
}

/**
 * Get Solana chain configuration
 * 
 * @param network - Solana network name
 * @returns Chain configuration
 */
export function getSolanaChainConfig(network: 'mainnet-beta' | 'devnet'): SolanaChainConfig {
  return SOLANA_CHAINS[network];
}

/**
 * Get numeric chain ID for EVM chain
 * 
 * @param chainId - Chain identifier
 * @param testnet - Whether to get testnet chain ID
 * @returns Numeric chain ID
 */
export function getNumericChainId(chainId: EVMChainId, testnet: boolean = false): number {
  const config = getEVMChainConfig(chainId);
  return testnet ? config.testnet.chainId : config.chainId;
}

/**
 * Get RPC URLs for an EVM chain
 * 
 * @param chainId - Chain identifier
 * @param testnet - Whether to get testnet RPCs
 * @returns Array of RPC URLs
 */
export function getEVMRpcUrls(chainId: EVMChainId, testnet: boolean = false): string[] {
  const config = getEVMChainConfig(chainId);
  return testnet ? config.testnet.rpcUrls : config.rpcUrls;
}

/**
 * Get explorer URL for EVM chain
 * 
 * @param chainId - Chain identifier
 * @param testnet - Whether testnet
 * @returns Explorer base URL
 */
export function getEVMExplorerUrl(chainId: EVMChainId, testnet: boolean = false): string {
  const config = getEVMChainConfig(chainId);
  
  // Most explorers use subdomains for testnets
  if (testnet) {
    switch (chainId) {
      case 'ethereum':
        return 'https://sepolia.etherscan.io';
      case 'polygon':
        return 'https://amoy.polygonscan.com';
      case 'arbitrum':
        return 'https://sepolia.arbiscan.io';
      case 'optimism':
        return 'https://sepolia-optimism.etherscan.io';
      case 'base':
        return 'https://sepolia.basescan.org';
    }
  }
  
  return config.explorer;
}

/**
 * Get all supported EVM chain IDs
 * 
 * @returns Array of chain identifiers
 */
export function getSupportedEVMChains(): EVMChainId[] {
  return Object.keys(EVM_CHAINS) as EVMChainId[];
}

/**
 * Check if a chain is an L2
 * 
 * @param chainId - Chain identifier
 * @returns True if L2
 */
export function isL2Chain(chainId: EVMChainId): boolean {
  return getEVMChainConfig(chainId).isL2;
}

/**
 * Get L2 type for gas estimation
 * 
 * @param chainId - Chain identifier
 * @returns L2 type or undefined for L1
 */
export function getL2Type(chainId: EVMChainId): 'optimism' | 'arbitrum' | undefined {
  return getEVMChainConfig(chainId).l2Type;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default EVM chain when none selected
 */
export const DEFAULT_EVM_CHAIN: EVMChainId = 'ethereum';

/**
 * Wei per ETH (10^18)
 */
export const WEI_PER_ETH = BigInt(10) ** BigInt(18);

/**
 * Gwei per ETH (10^9)
 */
export const GWEI_PER_ETH = BigInt(10) ** BigInt(9);

/**
 * Default gas limit for simple ETH transfers
 */
export const DEFAULT_GAS_LIMIT = BigInt(21000);

/**
 * Default gas limit for ERC-20 transfers
 */
export const ERC20_GAS_LIMIT = BigInt(65000);

/**
 * Transaction confirmation timeout (60 seconds)
 */
export const TX_CONFIRMATION_TIMEOUT = 60000;

/**
 * Maximum RPC retry attempts
 */
export const MAX_RPC_RETRIES = 3;

/**
 * RPC request timeout (30 seconds)
 */
export const RPC_TIMEOUT = 30000;



