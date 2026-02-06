export type ChainFamily = 'evm' | 'solana' | 'bitcoin' | 'tron' | 'monero' | 'cosmos' | 'sui' | 'aptos';

export type NetworkEnvironment = 'mainnet' | 'testnet';

export type L2Type = 'optimism' | 'arbitrum' | 'zk-rollup';

export interface ChainToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
  isNative?: boolean;
}

export interface TestnetConfig {
  chainId: number;
  rpcUrls: string[];
  explorerUrl: string;
  explorerApiUrl?: string;
}

export interface ChainConfig {
  id: string;
  family: ChainFamily;
  name: string;
  symbol: string;
  decimals: number;
  chainId: number;

  rpcUrls: string[];
  fallbackRpcUrls?: string[];
  explorerUrl: string;
  explorerApiUrl?: string;
  testnet?: TestnetConfig;

  isL2?: boolean;
  l2Type?: L2Type;
  supportsEIP1559?: boolean;
  swapEnabled?: boolean;
  swapProvider?: 'jupiter' | 'paraswap' | '1inch' | 'uniswap';

  coinType: number;
  derivationPath: string;
  alternativeDerivationPaths?: Record<string, string>;

  iconId: string;
  color: string;
  description?: string;

  nativeTokenAddress: string;
  popularTokens?: ChainToken[];

  defaultGasLimit?: bigint;
  tokenGasLimit?: bigint;
  gasPriceMultiplier?: number;
}

export const EVM_NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const WRAPPED_SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

export const CHAIN_REGISTRY: Record<string, ChainConfig> = {
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
        logoUri: 'https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png',
        isNative: true,
      },
      {
        address: 'BAezfVmia8UYLt4rst6PCU4dvL2i2qHzqn4wGhytpNJW',
        symbol: 'AINTI',
        name: 'Aintivirus',
        decimals: 6,
        logoUri: 'https://tokens.jup.ag/token/BAezfVmia8UYLt4rst6PCU4dvL2i2qHzqn4wGhytpNJW/logo',
      },
      {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
      },
      {
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
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
        logoUri: 'https://cdn.jsdelivr.net/gh/raydium-io/media-assets@master/logo/logo-only-icon.svg',
      },
    ],
  },

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

  polygon: {
    id: 'polygon',
    family: 'evm',
    name: 'Polygon',
    symbol: 'POL',
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
        symbol: 'POL',
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

  bnb: {
    id: 'bnb',
    family: 'evm',
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    decimals: 18,
    chainId: 56,
    rpcUrls: [
      'https://bsc-dataseed.binance.org',
      'https://bsc.publicnode.com',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed1.ninicoin.io',
      'https://bsc.drpc.org',
    ],
    explorerUrl: 'https://bscscan.com',
    explorerApiUrl: 'https://api.bscscan.com/api',
    testnet: {
      chainId: 97,
      rpcUrls: ['https://bsc-testnet.publicnode.com', 'https://data-seed-prebsc-1-s1.binance.org:8545'],
      explorerUrl: 'https://testnet.bscscan.com',
      explorerApiUrl: 'https://api-testnet.bscscan.com/api',
    },
    isL2: false,
    supportsEIP1559: false,
    coinType: 60,
    derivationPath: "m/44'/60'/0'/0/{index}",
    iconId: 'bnb',
    color: '#F0B90B',
    description: 'Binance Smart Chain',
    nativeTokenAddress: EVM_NATIVE_TOKEN_ADDRESS,
    defaultGasLimit: BigInt(21000),
    tokenGasLimit: BigInt(65000),
    swapEnabled: true,
    swapProvider: 'paraswap',
    popularTokens: [
      {
        address: EVM_NATIVE_TOKEN_ADDRESS,
        symbol: 'BNB',
        name: 'BNB',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
        isNative: true,
      },
      {
        address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/9576/small/BUSD.png',
      },
      {
        address: '0x55d398326f99059fF775485246999027B3197955',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      },
      {
        address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      },
      {
        address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
        symbol: 'ETH',
        name: 'Binance-Peg Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      },
      {
        address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
        symbol: 'CAKE',
        name: 'PancakeSwap',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo.png',
      },
    ],
  },

  // ============ Bitcoin ============
  bitcoin: {
    id: 'bitcoin',
    family: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    chainId: 0, // Bitcoin doesn't use numeric chain IDs like EVM
    rpcUrls: ['https://blockstream.info/api', 'https://mempool.space/api'],
    explorerUrl: 'https://blockstream.info',
    explorerApiUrl: 'https://blockstream.info/api',
    testnet: {
      chainId: 0,
      rpcUrls: ['https://blockstream.info/testnet/api'],
      explorerUrl: 'https://blockstream.info/testnet',
    },
    coinType: 0,
    derivationPath: "m/84'/0'/0'/0/{index}", // BIP-84 Native SegWit
    alternativeDerivationPaths: {
      legacy: "m/44'/0'/0'/0/{index}",
      segwit: "m/49'/0'/0'/0/{index}",
    },
    iconId: 'bitcoin',
    color: '#F7931A',
    description: 'The original cryptocurrency',
    nativeTokenAddress: 'btc',
    swapEnabled: false,
  },

  bitcoincash: {
    id: 'bitcoincash',
    family: 'bitcoin',
    name: 'Bitcoin Cash',
    symbol: 'BCH',
    decimals: 8,
    chainId: 0,
    rpcUrls: ['https://api.blockchair.com/bitcoin-cash'],
    explorerUrl: 'https://blockchair.com/bitcoin-cash',
    coinType: 145,
    derivationPath: "m/44'/145'/0'/0/{index}",
    iconId: 'bitcoincash',
    color: '#8DC351',
    description: 'Fast, low-fee Bitcoin fork',
    nativeTokenAddress: 'bch',
    swapEnabled: false,
  },

  litecoin: {
    id: 'litecoin',
    family: 'bitcoin',
    name: 'Litecoin',
    symbol: 'LTC',
    decimals: 8,
    chainId: 0,
    rpcUrls: ['https://api.blockchair.com/litecoin'],
    explorerUrl: 'https://blockchair.com/litecoin',
    coinType: 2,
    derivationPath: "m/84'/2'/0'/0/{index}", // BIP-84 Native SegWit
    alternativeDerivationPaths: {
      legacy: "m/44'/2'/0'/0/{index}",
    },
    iconId: 'litecoin',
    color: '#345D9D',
    description: 'Silver to Bitcoin\'s gold',
    nativeTokenAddress: 'ltc',
    swapEnabled: false,
  },

  zcash: {
    id: 'zcash',
    family: 'bitcoin',
    name: 'Zcash',
    symbol: 'ZEC',
    decimals: 8,
    chainId: 0,
    rpcUrls: ['https://api.blockchair.com/zcash'],
    explorerUrl: 'https://blockchair.com/zcash',
    coinType: 133,
    derivationPath: "m/44'/133'/0'/0/{index}",
    iconId: 'zcash',
    color: '#ECB244',
    description: 'Privacy-focused cryptocurrency',
    nativeTokenAddress: 'zec',
    swapEnabled: false,
  },

  tron: {
    id: 'tron',
    family: 'tron',
    name: 'TRON',
    symbol: 'TRX',
    decimals: 6,
    chainId: 728126428, // TRON's chain ID
    rpcUrls: ['https://api.trongrid.io'],
    fallbackRpcUrls: ['https://api.shasta.trongrid.io'],
    explorerUrl: 'https://tronscan.org',
    testnet: {
      chainId: 2494104990,
      rpcUrls: ['https://nile.trongrid.io'],
      explorerUrl: 'https://nile.tronscan.org',
    },
    coinType: 195,
    derivationPath: "m/44'/195'/0'/0/{index}",
    iconId: 'tron',
    color: '#FF0013',
    description: 'High-throughput blockchain',
    nativeTokenAddress: 'trx',
    swapEnabled: false, // Disabled: SunSwap contract integration not yet implemented
    // swapProvider: 'sunswap', // TODO: Enable when SunSwap integration is complete
    popularTokens: [
      {
        address: 'trx',
        symbol: 'TRX',
        name: 'TRON',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
        isNative: true,
      },
      {
        address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      },
      {
        address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      },
      {
        address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
        symbol: 'SUN',
        name: 'Sun Token',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/12424/small/sun_logo.png',
      },
    ],
  },

  monero: {
    id: 'monero',
    family: 'monero',
    name: 'Monero',
    symbol: 'XMR',
    decimals: 12,
    chainId: 0, // Monero doesn't use chain IDs
    rpcUrls: [
      'https://node.moneroworld.com:18089',
      'https://nodes.hashvault.pro:18081',
      'https://xmr-node.cakewallet.com:18081',
    ],
    explorerUrl: 'https://xmrchain.net',
    testnet: {
      chainId: 0,
      rpcUrls: ['https://stagenet.xmr-tw.org:38081'],
      explorerUrl: 'https://stagenet.xmrchain.net',
    },
    coinType: 128,
    derivationPath: '', // Not used for watch-only
    iconId: 'monero',
    color: '#FF6600',
    description: 'Privacy-focused cryptocurrency (Watch-Only)',
    nativeTokenAddress: 'xmr',
    swapEnabled: false,
    // Note: This is a watch-only implementation
    // Users import their address and view key
  },
};

export function getChain(chainId: string): ChainConfig | undefined {
  return CHAIN_REGISTRY[chainId];
}

export function getChainOrThrow(chainId: string): ChainConfig {
  const chain = CHAIN_REGISTRY[chainId];
  if (!chain) {
    throw new Error(`Unknown chain: ${chainId}`);
  }
  return chain;
}

export function getChainByNumericId(numericChainId: number, testnet = false): ChainConfig | undefined {
  return Object.values(CHAIN_REGISTRY).find((chain) => {
    if (testnet && chain.testnet) {
      return chain.testnet.chainId === numericChainId;
    }
    return chain.chainId === numericChainId;
  });
}

export function getChainsByFamily(family: ChainFamily): ChainConfig[] {
  return Object.values(CHAIN_REGISTRY).filter((chain) => chain.family === family);
}

export function getEVMChains(): ChainConfig[] {
  return getChainsByFamily('evm');
}

export function getAllChainIds(): string[] {
  return Object.keys(CHAIN_REGISTRY);
}

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

export function getExplorerUrl(chainId: string, testnet = false): string {
  const chain = getChainOrThrow(chainId);
  if (testnet && chain.testnet) {
    return chain.testnet.explorerUrl;
  }
  return chain.explorerUrl;
}

export function getExplorerApiUrl(chainId: string, testnet = false): string | undefined {
  const chain = getChainOrThrow(chainId);
  if (testnet && chain.testnet) {
    return chain.testnet.explorerApiUrl;
  }
  return chain.explorerApiUrl;
}

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

export function getNumericChainId(chainId: string, testnet = false): number {
  const chain = getChainOrThrow(chainId);
  if (testnet && chain.testnet) {
    return chain.testnet.chainId;
  }
  return chain.chainId;
}

export function isL2Chain(chainId: string): boolean {
  const chain = getChain(chainId);
  return chain?.isL2 ?? false;
}

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

export function getPopularTokens(chainId: string): ChainToken[] {
  const chain = getChain(chainId);
  return chain?.popularTokens ?? [];
}

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

export function isValidChainId(chainId: string): boolean {
  return chainId in CHAIN_REGISTRY;
}

export function isEVMChain(chainId: string): boolean {
  const chain = getChain(chainId);
  return chain?.family === 'evm';
}

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
export type EVMChainId = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base' | 'bnb';
export type ChainType = 'solana' | 'evm';

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

export function chainIdToLegacy(chainId: string): { chainType: ChainType; evmChainId?: EVMChainId } {
  const chain = getChainOrThrow(chainId);
  if (chain.family === 'solana') {
    return { chainType: 'solana' };
  }
  if (chain.family === 'evm') {
    return { chainType: 'evm', evmChainId: chainId as EVMChainId };
  }
  return { chainType: 'evm', evmChainId: chainId as EVMChainId };
}


