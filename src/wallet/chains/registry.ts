/**
 * Chain Registry - Single source of truth for all blockchain networks
 *
 * To add a new network:
 * 1. Add a new entry to CHAIN_REGISTRY with all required fields
 * 2. The chain will automatically appear in:
 *    - Chain selector UI
 *    - Wallet settings
 *    - Transaction history
 *    - Fee estimation
 *    - Token swaps (if swapTokens defined)
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Chain family determines the underlying protocol and adapter to use.
 * Add new families here when supporting fundamentally different chains.
 */
export type ChainFamily = 'evm' | 'solana' | 'bitcoin' | 'cosmos' | 'sui' | 'aptos';

/**
 * Network environment for mainnet/testnet switching
 */
export type NetworkEnvironment = 'mainnet' | 'testnet';

/**
 * L2 type for fee estimation purposes
 */
export type L2Type = 'optimism' | 'arbitrum' | 'zk-rollup';

/**
 * Token definition for swap interfaces and popular token lists
 */
export interface ChainToken {
  /** Contract address (or special address for native tokens) */
  address: string;
  /** Token symbol (e.g., ETH, USDC) */
  symbol: string;
  /** Human-readable name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Logo URL */
  logoUri: string;
  /** Whether this is the native gas token */
  isNative?: boolean;
}

/**
 * Testnet configuration
 */
export interface TestnetConfig {
  /** Numeric chain ID for testnet */
  chainId: number;
  /** RPC endpoints for testnet */
  rpcUrls: string[];
  /** Block explorer URL for testnet */
  explorerUrl: string;
  /** Block explorer API URL for testnet (optional) */
  explorerApiUrl?: string;
}

/**
 * Complete chain configuration - all data needed to support a network
 */
export interface ChainConfig {
  // ============ Identity ============
  /** Unique identifier used as key (e.g., 'ethereum', 'solana', 'polygon') */
  id: string;
  /** Chain family determines which adapter to use */
  family: ChainFamily;
  /** Human-readable chain name */
  name: string;
  /** Native token symbol */
  symbol: string;
  /** Native token decimals */
  decimals: number;
  /** Numeric chain ID (for EVM chains, this is the EIP-155 chain ID) */
  chainId: number;

  // ============ Network ============
  /** Primary RPC endpoints (ordered by preference) */
  rpcUrls: string[];
  /** Fallback RPC endpoints */
  fallbackRpcUrls?: string[];
  /** Block explorer URL */
  explorerUrl: string;
  /** Block explorer API URL (for transaction history) */
  explorerApiUrl?: string;
  /** Testnet configuration */
  testnet?: TestnetConfig;

  // ============ Features ============
  /** Whether this is an L2 chain */
  isL2?: boolean;
  /** L2 type for fee estimation */
  l2Type?: L2Type;
  /** Whether EIP-1559 is supported */
  supportsEIP1559?: boolean;
  /** Whether swaps are available */
  swapEnabled?: boolean;
  /** Swap router/aggregator to use */
  swapProvider?: 'jupiter' | 'paraswap' | '1inch' | 'uniswap';

  // ============ Derivation ============
  /** BIP-44 coin type (e.g., 60 for ETH, 501 for SOL) */
  coinType: number;
  /** Default derivation path template (use {index} for account index) */
  derivationPath: string;
  /** Alternative derivation paths (e.g., Ledger Live) */
  alternativeDerivationPaths?: Record<string, string>;

  // ============ Display ============
  /** Icon identifier for UI (corresponds to SVG component) */
  iconId: string;
  /** Chain color for UI theming */
  color: string;
  /** Short description for UI */
  description?: string;

  // ============ Tokens ============
  /** Native token address (use special address for native gas tokens) */
  nativeTokenAddress: string;
  /** Popular tokens for this chain (for swaps, portfolio view) */
  popularTokens?: ChainToken[];

  // ============ Gas ============
  /** Default gas limit for native transfers */
  defaultGasLimit?: bigint;
  /** Default gas limit for token transfers */
  tokenGasLimit?: bigint;
  /** Gas price multiplier for fast transactions */
  gasPriceMultiplier?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Native token address used by many aggregators for EVM chains */
export const EVM_NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/** Wrapped SOL address */
export const WRAPPED_SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

// ============================================================================
// Chain Registry
// ============================================================================

/**
 * The master registry of all supported chains.
 * Add new chains here and they'll be available throughout the app.
 */
export const CHAIN_REGISTRY: Record<string, ChainConfig> = {
  // ============ Solana ============
  solana: {
    id: 'solana',
    family: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    chainId: 101, // Solana mainnet cluster identifier
    rpcUrls: ['https://rpc.ankr.com/solana', 'https://api.mainnet-beta.solana.com'],
    fallbackRpcUrls: ['https://solana-mainnet.rpc.extrnode.com'],
    explorerUrl: 'https://explorer.solana.com',
    testnet: {
      chainId: 102,
      rpcUrls: ['https://rpc.ankr.com/solana_devnet', 'https://api.devnet.solana.com'],
      explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
    },
    coinType: 501,
    derivationPath: "m/44'/501'/{index}'/0'",
    alternativeDerivationPaths: {
      legacy: "m/44'/501'/0'/0'",
    },
    iconId: 'solana',
    color: '#9945FF',
    description: 'Fast, low-cost blockchain',
    nativeTokenAddress: WRAPPED_SOL_ADDRESS,
    swapEnabled: true,
    swapProvider: 'jupiter',
    popularTokens: [
      {
        address: WRAPPED_SOL_ADDRESS,
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        isNative: true,
      },
      {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      },
      {
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
      },
      {
        address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
        symbol: 'JUP',
        name: 'Jupiter',
        decimals: 6,
        logoUri: 'https://static.jup.ag/jup/icon.png',
      },
      {
        address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        symbol: 'BONK',
        name: 'Bonk',
        decimals: 5,
        logoUri: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
      },
      {
        address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
        symbol: 'WIF',
        name: 'dogwifhat',
        decimals: 6,
        logoUri: 'https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betiez62dpxfhqixvhyg4.ipfs.w3s.link/',
      },
      {
        address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
        symbol: 'RAY',
        name: 'Raydium',
        decimals: 6,
        logoUri: 'https://raw.githubusercontent.com/raydium-io/media-assets/master/logo/logo-only-icon.svg',
      },
    ],
  },

  // ============ Ethereum ============
  ethereum: {
    id: 'ethereum',
    family: 'evm',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    chainId: 1,
    rpcUrls: [
      'https://eth.drpc.org',
      'https://ethereum.publicnode.com',
      'https://1rpc.io/eth',
      'https://rpc.ankr.com/eth',
      'https://eth.llamarpc.com',
    ],
    explorerUrl: 'https://etherscan.io',
    explorerApiUrl: 'https://api.etherscan.io/api',
    testnet: {
      chainId: 11155111,
      rpcUrls: [
        'https://rpc.sepolia.org',
        'https://rpc2.sepolia.org',
        'https://ethereum-sepolia.publicnode.com',
      ],
      explorerUrl: 'https://sepolia.etherscan.io',
      explorerApiUrl: 'https://api-sepolia.etherscan.io/api',
    },
    isL2: false,
    supportsEIP1559: true,
    coinType: 60,
    derivationPath: "m/44'/60'/0'/0/{index}",
    alternativeDerivationPaths: {
      'ledger-live': "m/44'/60'/{index}'/0/0",
    },
    iconId: 'ethereum',
    color: '#627EEA',
    description: 'The original smart contract platform',
    nativeTokenAddress: EVM_NATIVE_TOKEN_ADDRESS,
    defaultGasLimit: BigInt(21000),
    tokenGasLimit: BigInt(65000),
    swapEnabled: true,
    swapProvider: 'paraswap',
    popularTokens: [
      {
        address: EVM_NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        isNative: true,
      },
      {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      },
      {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      },
      {
        address: '0x6B175474E89094C44Da98b954EescdeCB5e6fBEf',
        symbol: 'DAI',
        name: 'Dai Stablecoin',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
      },
      {
        address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        decimals: 8,
        logoUri: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
      },
    ],
  },

  // ============ Polygon ============
  polygon: {
    id: 'polygon',
    family: 'evm',
    name: 'Polygon',
    symbol: 'MATIC',
    decimals: 18,
    chainId: 137,
    rpcUrls: [
      'https://polygon.llamarpc.com',
      'https://polygon-bor.publicnode.com',
      'https://1rpc.io/matic',
      'https://polygon.drpc.org',
      'https://polygon-rpc.com',
    ],
    explorerUrl: 'https://polygonscan.com',
    explorerApiUrl: 'https://api.polygonscan.com/api',
    testnet: {
      chainId: 80002,
      rpcUrls: ['https://rpc-amoy.polygon.technology', 'https://polygon-amoy.drpc.org'],
      explorerUrl: 'https://amoy.polygonscan.com',
      explorerApiUrl: 'https://api-amoy.polygonscan.com/api',
    },
    isL2: false,
    supportsEIP1559: true,
    coinType: 60, // Polygon uses same derivation as Ethereum
    derivationPath: "m/44'/60'/0'/0/{index}",
    iconId: 'polygon',
    color: '#8247E5',
    description: 'Ethereum scaling solution',
    nativeTokenAddress: EVM_NATIVE_TOKEN_ADDRESS,
    defaultGasLimit: BigInt(21000),
    tokenGasLimit: BigInt(65000),
    swapEnabled: true,
    swapProvider: 'paraswap',
    popularTokens: [
      {
        address: EVM_NATIVE_TOKEN_ADDRESS,
        symbol: 'MATIC',
        name: 'Polygon',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
        isNative: true,
      },
      {
        address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      },
      {
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      },
      {
        address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      },
    ],
  },

  // ============ Arbitrum ============
  arbitrum: {
    id: 'arbitrum',
    family: 'evm',
    name: 'Arbitrum One',
    symbol: 'ETH',
    decimals: 18,
    chainId: 42161,
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one.publicnode.com',
      'https://1rpc.io/arb',
      'https://arbitrum.drpc.org',
      'https://arbitrum.llamarpc.com',
    ],
    explorerUrl: 'https://arbiscan.io',
    explorerApiUrl: 'https://api.arbiscan.io/api',
    testnet: {
      chainId: 421614,
      rpcUrls: [
        'https://sepolia-rollup.arbitrum.io/rpc',
        'https://arbitrum-sepolia.publicnode.com',
      ],
      explorerUrl: 'https://sepolia.arbiscan.io',
      explorerApiUrl: 'https://api-sepolia.arbiscan.io/api',
    },
    isL2: true,
    l2Type: 'arbitrum',
    supportsEIP1559: true,
    coinType: 60,
    derivationPath: "m/44'/60'/0'/0/{index}",
    iconId: 'arbitrum',
    color: '#28A0F0',
    description: 'Optimistic rollup on Ethereum',
    nativeTokenAddress: EVM_NATIVE_TOKEN_ADDRESS,
    defaultGasLimit: BigInt(21000),
    tokenGasLimit: BigInt(65000),
    swapEnabled: true,
    swapProvider: 'paraswap',
    popularTokens: [
      {
        address: EVM_NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        isNative: true,
      },
      {
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      },
      {
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      },
      {
        address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
        symbol: 'ARB',
        name: 'Arbitrum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
      },
    ],
  },

  // ============ Optimism ============
  optimism: {
    id: 'optimism',
    family: 'evm',
    name: 'Optimism',
    symbol: 'ETH',
    decimals: 18,
    chainId: 10,
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism.publicnode.com',
      'https://1rpc.io/op',
      'https://optimism.drpc.org',
      'https://optimism.llamarpc.com',
    ],
    explorerUrl: 'https://optimistic.etherscan.io',
    explorerApiUrl: 'https://api-optimistic.etherscan.io/api',
    testnet: {
      chainId: 11155420,
      rpcUrls: ['https://sepolia.optimism.io', 'https://optimism-sepolia.publicnode.com'],
      explorerUrl: 'https://sepolia-optimism.etherscan.io',
      explorerApiUrl: 'https://api-sepolia-optimistic.etherscan.io/api',
    },
    isL2: true,
    l2Type: 'optimism',
    supportsEIP1559: true,
    coinType: 60,
    derivationPath: "m/44'/60'/0'/0/{index}",
    iconId: 'optimism',
    color: '#FF0420',
    description: 'Optimistic rollup on Ethereum',
    nativeTokenAddress: EVM_NATIVE_TOKEN_ADDRESS,
    defaultGasLimit: BigInt(21000),
    tokenGasLimit: BigInt(65000),
    swapEnabled: true,
    swapProvider: 'paraswap',
    popularTokens: [
      {
        address: EVM_NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        isNative: true,
      },
      {
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      },
      {
        address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      },
      {
        address: '0x4200000000000000000000000000000000000042',
        symbol: 'OP',
        name: 'Optimism',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
      },
    ],
  },

  // ============ Base ============
  base: {
    id: 'base',
    family: 'evm',
    name: 'Base',
    symbol: 'ETH',
    decimals: 18,
    chainId: 8453,
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://1rpc.io/base',
      'https://base.drpc.org',
      'https://base.publicnode.com',
    ],
    explorerUrl: 'https://basescan.org',
    explorerApiUrl: 'https://api.basescan.org/api',
    testnet: {
      chainId: 84532,
      rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia.publicnode.com'],
      explorerUrl: 'https://sepolia.basescan.org',
      explorerApiUrl: 'https://api-sepolia.basescan.org/api',
    },
    isL2: true,
    l2Type: 'optimism', // Base uses OP Stack
    supportsEIP1559: true,
    coinType: 60,
    derivationPath: "m/44'/60'/0'/0/{index}",
    iconId: 'base',
    color: '#0052FF',
    description: 'Coinbase L2 on Ethereum',
    nativeTokenAddress: EVM_NATIVE_TOKEN_ADDRESS,
    defaultGasLimit: BigInt(21000),
    tokenGasLimit: BigInt(65000),
    swapEnabled: true,
    swapProvider: 'paraswap',
    popularTokens: [
      {
        address: EVM_NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        isNative: true,
      },
      {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      },
      {
        address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        symbol: 'DAI',
        name: 'Dai Stablecoin',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
      },
      {
        address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
        symbol: 'cbETH',
        name: 'Coinbase Wrapped ETH',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/27008/small/cbeth.png',
      },
    ],
  },

  // ============================================================================
  // TEMPLATE: Add new chains below following this pattern
  // ============================================================================
  /*
  newchain: {
    id: 'newchain',
    family: 'evm', // or 'solana', 'cosmos', etc.
    name: 'New Chain',
    symbol: 'TOKEN',
    decimals: 18,
    chainId: 12345,
    rpcUrls: ['https://rpc.newchain.io'],
    explorerUrl: 'https://explorer.newchain.io',
    testnet: {
      chainId: 12346,
      rpcUrls: ['https://testnet-rpc.newchain.io'],
      explorerUrl: 'https://testnet.explorer.newchain.io',
    },
    coinType: 60,
    derivationPath: "m/44'/60'/0'/0/{index}",
    iconId: 'newchain',
    color: '#123456',
    nativeTokenAddress: EVM_NATIVE_TOKEN_ADDRESS,
    swapEnabled: false,
    popularTokens: [
      {
        address: EVM_NATIVE_TOKEN_ADDRESS,
        symbol: 'TOKEN',
        name: 'New Chain',
        decimals: 18,
        logoUri: 'https://example.com/logo.png',
        isNative: true,
      },
    ],
  },
  */
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a chain configuration by ID
 */
export function getChain(chainId: string): ChainConfig | undefined {
  return CHAIN_REGISTRY[chainId];
}

/**
 * Get a chain configuration by ID, throwing if not found
 */
export function getChainOrThrow(chainId: string): ChainConfig {
  const chain = CHAIN_REGISTRY[chainId];
  if (!chain) {
    throw new Error(`Unknown chain: ${chainId}`);
  }
  return chain;
}

/**
 * Get chain by numeric chain ID (useful for EVM chains)
 */
export function getChainByNumericId(numericChainId: number, testnet = false): ChainConfig | undefined {
  return Object.values(CHAIN_REGISTRY).find((chain) => {
    if (testnet && chain.testnet) {
      return chain.testnet.chainId === numericChainId;
    }
    return chain.chainId === numericChainId;
  });
}

/**
 * Get all chains of a specific family
 */
export function getChainsByFamily(family: ChainFamily): ChainConfig[] {
  return Object.values(CHAIN_REGISTRY).filter((chain) => chain.family === family);
}

/**
 * Get all EVM chains
 */
export function getEVMChains(): ChainConfig[] {
  return getChainsByFamily('evm');
}

/**
 * Get all chain IDs
 */
export function getAllChainIds(): string[] {
  return Object.keys(CHAIN_REGISTRY);
}

/**
 * Get all supported chains as display items for UI
 */
export function getSupportedChainsForDisplay(): Array<{
  id: string;
  family: ChainFamily;
  name: string;
  symbol: string;
  iconId: string;
  color: string;
}> {
  return Object.values(CHAIN_REGISTRY).map((chain) => ({
    id: chain.id,
    family: chain.family,
    name: chain.name,
    symbol: chain.symbol,
    iconId: chain.iconId,
    color: chain.color,
  }));
}

/**
 * Get RPC URLs for a chain
 */
export function getRpcUrls(chainId: string, testnet = false): string[] {
  const chain = getChainOrThrow(chainId);
  if (testnet && chain.testnet) {
    return chain.testnet.rpcUrls;
  }
  return chain.rpcUrls;
}

/**
 * Get explorer URL for a chain
 */
export function getExplorerUrl(chainId: string, testnet = false): string {
  const chain = getChainOrThrow(chainId);
  if (testnet && chain.testnet) {
    return chain.testnet.explorerUrl;
  }
  return chain.explorerUrl;
}

/**
 * Get explorer API URL for a chain
 */
export function getExplorerApiUrl(chainId: string, testnet = false): string | undefined {
  const chain = getChainOrThrow(chainId);
  if (testnet && chain.testnet) {
    return chain.testnet.explorerApiUrl;
  }
  return chain.explorerApiUrl;
}

/**
 * Get address explorer URL
 */
export function getAddressExplorerUrl(chainId: string, address: string, testnet = false): string {
  const explorerUrl = getExplorerUrl(chainId, testnet);
  const chain = getChainOrThrow(chainId);

  if (chain.family === 'solana') {
    const clusterParam = testnet ? '?cluster=devnet' : '';
    return `${explorerUrl}/address/${address}${clusterParam}`;
  }

  return `${explorerUrl}/address/${address}`;
}

/**
 * Get transaction explorer URL
 */
export function getTxExplorerUrl(chainId: string, txHash: string, testnet = false): string {
  const explorerUrl = getExplorerUrl(chainId, testnet);
  const chain = getChainOrThrow(chainId);

  if (chain.family === 'solana') {
    const clusterParam = testnet ? '?cluster=devnet' : '';
    return `${explorerUrl}/tx/${txHash}${clusterParam}`;
  }

  return `${explorerUrl}/tx/${txHash}`;
}

/**
 * Get numeric chain ID for a chain
 */
export function getNumericChainId(chainId: string, testnet = false): number {
  const chain = getChainOrThrow(chainId);
  if (testnet && chain.testnet) {
    return chain.testnet.chainId;
  }
  return chain.chainId;
}

/**
 * Check if a chain is an L2
 */
export function isL2Chain(chainId: string): boolean {
  const chain = getChain(chainId);
  return chain?.isL2 ?? false;
}

/**
 * Get L2 type for fee estimation
 */
export function getL2Type(chainId: string): L2Type | undefined {
  const chain = getChain(chainId);
  return chain?.l2Type;
}

/**
 * Get derivation path for a chain
 */
export function getDerivationPath(chainId: string, index = 0, pathType?: string): string {
  const chain = getChainOrThrow(chainId);

  if (pathType && chain.alternativeDerivationPaths?.[pathType]) {
    return chain.alternativeDerivationPaths[pathType].replace('{index}', index.toString());
  }

  return chain.derivationPath.replace('{index}', index.toString());
}

/**
 * Get popular tokens for a chain (for swaps, portfolio)
 */
export function getPopularTokens(chainId: string): ChainToken[] {
  const chain = getChain(chainId);
  return chain?.popularTokens ?? [];
}

/**
 * Get native token for a chain
 */
export function getNativeToken(chainId: string): ChainToken | undefined {
  const tokens = getPopularTokens(chainId);
  return tokens.find((t) => t.isNative);
}

/**
 * Check if swap is enabled for a chain
 */
export function isSwapEnabled(chainId: string): boolean {
  const chain = getChain(chainId);
  return chain?.swapEnabled ?? false;
}

/**
 * Get swap provider for a chain
 */
export function getSwapProvider(chainId: string): string | undefined {
  const chain = getChain(chainId);
  return chain?.swapProvider;
}

/**
 * Build a chain identifier string for storage keys
 */
export function buildChainKey(chainId: string, testnet = false): string {
  const chain = getChainOrThrow(chainId);
  const numericId = testnet && chain.testnet ? chain.testnet.chainId : chain.chainId;
  return `${chain.family}:${numericId}`;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a chain ID is valid
 */
export function isValidChainId(chainId: string): boolean {
  return chainId in CHAIN_REGISTRY;
}

/**
 * Check if a chain is EVM-compatible
 */
export function isEVMChain(chainId: string): boolean {
  const chain = getChain(chainId);
  return chain?.family === 'evm';
}

/**
 * Check if a chain is Solana
 */
export function isSolanaChain(chainId: string): boolean {
  const chain = getChain(chainId);
  return chain?.family === 'solana';
}

// ============================================================================
// Backward Compatibility
// ============================================================================

/**
 * Legacy type aliases for backward compatibility
 * @deprecated Use ChainConfig and registry functions instead
 */
export type EVMChainId = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';
export type ChainType = 'solana' | 'evm';

/**
 * Get supported EVM chain IDs (for backward compatibility)
 * @deprecated Use getChainsByFamily('evm') instead
 */
export function getSupportedEVMChains(): EVMChainId[] {
  return getChainsByFamily('evm').map((chain) => chain.id as EVMChainId);
}

/**
 * Convert legacy ChainType + EVMChainId to new chain ID format
 */
export function legacyToChainId(chainType: ChainType, evmChainId?: EVMChainId | null): string {
  if (chainType === 'solana') {
    return 'solana';
  }
  return evmChainId ?? 'ethereum';
}

/**
 * Convert new chain ID to legacy format
 */
export function chainIdToLegacy(chainId: string): { chainType: ChainType; evmChainId?: EVMChainId } {
  const chain = getChainOrThrow(chainId);
  if (chain.family === 'solana') {
    return { chainType: 'solana' };
  }
  return { chainType: 'evm', evmChainId: chainId as EVMChainId };
}

