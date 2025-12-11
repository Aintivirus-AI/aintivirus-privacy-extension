import type { EVMChainConfig, EVMChainId, SolanaChainConfig } from './types';

// Chain configuration data (RPC urls, explorers, derivation paths) for Solana/EVM networks.

export const EVM_CHAINS: Record<EVMChainId, EVMChainConfig> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    rpcUrls: [
      'https://eth.drpc.org',
      'https://ethereum.publicnode.com',
      'https://1rpc.io/eth',
      'https://rpc.ankr.com/eth',
      'https://eth.llamarpc.com',
      'https://rpc.mevblocker.io',
    ],
    testnet: {
      chainId: 11155111,
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
      chainId: 80002,
      rpcUrls: ['https://rpc-amoy.polygon.technology', 'https://polygon-amoy.drpc.org'],
    },
    explorer: 'https://polygonscan.com',
    isL2: false,
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
      chainId: 421614,
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
      chainId: 11155420,
      rpcUrls: ['https://sepolia.optimism.io', 'https://optimism-sepolia.publicnode.com'],
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
      chainId: 84532,
      rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia.publicnode.com'],
    },
    explorer: 'https://basescan.org',
    isL2: true,
    l2Type: 'optimism',
  },
};

export const SOLANA_CHAINS: Record<'mainnet-beta' | 'devnet', SolanaChainConfig> = {
  'mainnet-beta': {
    name: 'mainnet-beta',

    rpcUrl: process.env.AINTIVIRUS_HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.AINTIVIRUS_HELIUS_API_KEY)}`
      : 'https://api.mainnet-beta.solana.com',
    fallbackRpcUrls: ['https://api.mainnet-beta.solana.com'],
    explorerUrl: 'https://explorer.solana.com',
  },
  devnet: {
    name: 'devnet',

    rpcUrl: process.env.AINTIVIRUS_HELIUS_API_KEY
      ? `https://devnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.AINTIVIRUS_HELIUS_API_KEY)}`
      : 'https://api.devnet.solana.com',
    fallbackRpcUrls: ['https://api.devnet.solana.com'],
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
  },
};

import type { EVMDerivationPathType, SolanaDerivationPathType } from '../types';

export const DERIVATION_PATHS = {
  SOLANA: "m/44'/501'/0'/0'",

  EVM_PREFIX: "m/44'/60'/0'/0",

  getSolanaPath: (index: number, pathType: SolanaDerivationPathType = 'standard'): string => {
    if (pathType === 'legacy') {
      return "m/44'/501'/0'/0'";
    }

    return `m/44'/501'/${index}'/0'`;
  },

  getEVMPath: (index: number = 0, pathType: EVMDerivationPathType = 'standard'): string => {
    if (pathType === 'ledger-live') {
      return `m/44'/60'/${index}'/0/0`;
    }

    return `m/44'/60'/0'/0/${index}`;
  },

  getDefaultPathTypes: (): {
    evmPathType: EVMDerivationPathType;
    solanaPathType: SolanaDerivationPathType;
  } => ({
    evmPathType: 'standard',
    solanaPathType: 'standard',
  }),
} as const;

export function getEVMChainConfig(chainId: EVMChainId): EVMChainConfig {
  const config = EVM_CHAINS[chainId];
  if (!config) {
    throw new Error(`Unknown EVM chain: ${chainId}`);
  }
  return config;
}

export function getSolanaChainConfig(network: 'mainnet-beta' | 'devnet'): SolanaChainConfig {
  return SOLANA_CHAINS[network];
}

export function getNumericChainId(chainId: EVMChainId, testnet: boolean = false): number {
  const config = getEVMChainConfig(chainId);
  return testnet ? config.testnet.chainId : config.chainId;
}

export function getEVMRpcUrls(chainId: EVMChainId, testnet: boolean = false): string[] {
  const config = getEVMChainConfig(chainId);
  return testnet ? config.testnet.rpcUrls : config.rpcUrls;
}

export function getEVMExplorerUrl(chainId: EVMChainId, testnet: boolean = false): string {
  const config = getEVMChainConfig(chainId);

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

export function getSupportedEVMChains(): EVMChainId[] {
  return Object.keys(EVM_CHAINS) as EVMChainId[];
}

export function isL2Chain(chainId: EVMChainId): boolean {
  return getEVMChainConfig(chainId).isL2;
}

export function getL2Type(chainId: EVMChainId): 'optimism' | 'arbitrum' | undefined {
  return getEVMChainConfig(chainId).l2Type;
}

export const DEFAULT_EVM_CHAIN: EVMChainId = 'ethereum';

export const WEI_PER_ETH = BigInt(10) ** BigInt(18);

export const GWEI_PER_ETH = BigInt(10) ** BigInt(9);

export const DEFAULT_GAS_LIMIT = BigInt(21000);

export const ERC20_GAS_LIMIT = BigInt(65000);

export const TX_CONFIRMATION_TIMEOUT = 60000;

export const MAX_RPC_RETRIES = 3;

export const RPC_TIMEOUT = 5000;
