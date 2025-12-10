/**
 * Test fixtures for AINTIVIRUS extension tests
 */

// Valid 24-word test mnemonic (DO NOT USE IN PRODUCTION)
export const TEST_MNEMONIC_24 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

// Valid 12-word test mnemonic (DO NOT USE IN PRODUCTION)
export const TEST_MNEMONIC_12 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Invalid mnemonic (wrong checksum)
export const INVALID_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';

// Test addresses derived from TEST_MNEMONIC_24
export const TEST_SOLANA_ADDRESS = 'BUFyxhc4YkFZaYRkPKYy3yp9pS5cKp1DXD1bVD8qFUoS';
export const TEST_EVM_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

// Test private keys (DO NOT USE IN PRODUCTION)
export const TEST_SOLANA_PRIVATE_KEY_BASE58 =
  '5MaiiCavjCmn9Hs1o3eznqDEhRwxo7pXiAYez7keQUviUkauRiTMD8DrESdrNjN8zd9mTmVhRvBJeg5vhyvgrAhG';
export const TEST_EVM_PRIVATE_KEY =
  '0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd';

// Recipient addresses for transaction tests
export const TEST_RECIPIENT_SOLANA = 'GrAkKfEpTKQuVHG2Y97Y2FF4i7y7Q5AHLK94JBy7Y5yv';
export const TEST_RECIPIENT_EVM = '0x742d35Cc6634C0532925a3b844Bc9e7595f7Ce51';

// Invalid addresses
export const INVALID_SOLANA_ADDRESS = 'invalid-solana-address';
export const INVALID_EVM_ADDRESS = '0xinvalid';
export const SHORT_EVM_ADDRESS = '0x742d35Cc';

// Test domain fixtures for phishing detection
export const LEGITIMATE_DOMAINS = [
  'phantom.app',
  'solana.com',
  'raydium.io',
  'jupiter.exchange',
  'magic.eden',
  'opensea.io',
  'uniswap.org',
  'metamask.io',
];

export const SCAM_DOMAINS = [
  'phantom-app.com',
  'solana-airdrop.xyz',
  'free-sol.net',
];

export const HOMOGLYPH_DOMAINS = [
  { domain: 'phant0m.app', target: 'phantom.app' },
  { domain: 'so1ana.com', target: 'solana.com' },
  { domain: 'metamаsk.io', target: 'metamask.io' }, // Cyrillic 'а'
];

export const TYPOSQUAT_DOMAINS = [
  { domain: 'phantmo.app', target: 'phantom.app' },
  { domain: 'sollana.com', target: 'solana.com' },
  { domain: 'uniswapp.org', target: 'uniswap.org' },
];

// Test threat intel data
export const MOCK_THREAT_INTEL_DATA = {
  legitimateDomains: LEGITIMATE_DOMAINS,
  scamDomains: SCAM_DOMAINS,
  suspiciousTlds: ['xyz', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'click', 'link'],
  homoglyphMap: {
    'o': ['0', 'ο', 'о'],
    'a': ['а', '@', '4'],
    'e': ['е', '3'],
    'i': ['і', '1', 'l'],
    'l': ['1', 'I', 'і'],
  },
  solanaKeywords: ['sol', 'solana', 'phantom', 'airdrop', 'claim', 'wallet', 'nft'],
};

// Test transaction fixtures
export const MOCK_EVM_TRANSACTION = {
  to: TEST_RECIPIENT_EVM,
  value: '1000000000000000000', // 1 ETH in wei
  data: '0x',
  gasLimit: '21000',
  maxFeePerGas: '50000000000', // 50 gwei
  maxPriorityFeePerGas: '2000000000', // 2 gwei
  nonce: 0,
  chainId: 1,
};

export const MOCK_ERC20_TRANSFER = {
  to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
  data: '0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7ce510000000000000000000000000000000000000000000000000000000005f5e100', // transfer(address,uint256)
  value: '0',
};

// Test token fixtures
export const MOCK_TOKENS = {
  USDC: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  USDT: {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
};

// Test wallet state
export const MOCK_WALLET_STATE = {
  lockState: 'unlocked' as const,
  publicAddress: TEST_SOLANA_ADDRESS,
  network: 'mainnet-beta' as const,
  activeWalletId: 'wallet-1',
  activeWalletLabel: 'Main Wallet',
  activeAccountId: 'account-1',
  activeAccountName: 'Account 1',
  walletCount: 1,
  accountCount: 1,
  activeChain: 'solana' as const,
  activeEVMChain: 'ethereum' as const,
  evmAddress: TEST_EVM_ADDRESS,
  networkEnvironment: 'mainnet' as const,
  isWatchOnly: false,
};

// Test wallet balance
export const MOCK_WALLET_BALANCE = {
  lamports: 1000000000,
  sol: 1.0,
  lastUpdated: Date.now(),
};

// Test EVM balance
export const MOCK_EVM_BALANCE = {
  wei: '1000000000000000000',
  formatted: 1.0,
  symbol: 'ETH',
  lastUpdated: Date.now(),
};

// Test password that meets requirements
export const TEST_STRONG_PASSWORD = 'TestPassword123!';
export const TEST_WEAK_PASSWORD = 'weak';
export const TEST_NO_SPECIAL_PASSWORD = 'TestPassword123';
export const TEST_NO_UPPERCASE_PASSWORD = 'testpassword123!';
export const TEST_SHORT_PASSWORD = 'Test1!';

// Function selectors for EVM decoding
export const EVM_FUNCTION_SELECTORS = {
  transfer: '0xa9059cbb',
  approve: '0x095ea7b3',
  transferFrom: '0x23b872dd',
  swap: '0x7ff36ab5',
  multicall: '0xac9650d8',
};

// Typed data for EIP-712 tests
export const MOCK_TYPED_DATA = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit',
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  message: {
    owner: TEST_EVM_ADDRESS,
    spender: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    value: '1000000000',
    nonce: 0,
    deadline: Math.floor(Date.now() / 1000) + 3600,
  },
};

// Dapp connection fixtures
export const MOCK_DAPP_ORIGIN = 'https://raydium.io';
export const MOCK_DAPP_FAVICON = 'https://raydium.io/favicon.ico';
export const MOCK_DAPP_TITLE = 'Raydium';

// Privacy/blocking fixtures
export const MOCK_BLOCKED_REQUESTS = [
  {
    url: 'https://ads.example.com/tracker.js',
    type: 'script',
    blocked: true,
    rule: '||ads.example.com^',
    timestamp: Date.now(),
  },
  {
    url: 'https://analytics.example.com/pixel.gif',
    type: 'image',
    blocked: true,
    rule: '||analytics.example.com^',
    timestamp: Date.now(),
  },
];

export const MOCK_PRIVACY_SETTINGS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  blockThirdPartyCookies: true,
  customFilterLists: [],
};

// Fingerprinting test fixtures
export const MOCK_FINGERPRINT_SETTINGS = {
  enabled: true,
  protectCanvas: true,
  protectWebGL: true,
  protectAudio: true,
  protectFonts: true,
  protectClientRects: true,
  noiseLevel: 'medium' as const,
};

// Message fixtures
export const createMockMessage = <T extends string, P>(type: T, payload?: P) => ({
  type,
  payload,
});

// Chrome storage mock data
export const MOCK_STORAGE_DATA = {
  featureFlags: {
    privacy: true,
    wallet: true,
    notifications: true,
  },
  initialized: true,
  version: '0.2.0',
};

// Aliases for backward compatibility with various test files
export const MOCK_MNEMONIC = TEST_MNEMONIC_24;
export const MOCK_PASSWORD = TEST_STRONG_PASSWORD;
export const MOCK_SALT = 'a'.repeat(64);
export const MOCK_IV = 'b'.repeat(32);
export const MOCK_DOMAIN = 'example.com';
export const MOCK_PHISHING_DOMAIN = 'phantom-app.com';
export const MOCK_LEGIT_DOMAIN = 'phantom.app';
export const MOCK_SUSPICIOUS_TLD_DOMAIN = 'solana.xyz';
export const MOCK_HOMOGLYPH_DOMAIN = 'phant0m.app';
export const MOCK_TYPOSQUAT_DOMAIN = 'phantmo.app';
export const MOCK_SOLANA_ADDRESS = TEST_SOLANA_ADDRESS;
export const MOCK_EVM_ADDRESS_VALID = TEST_EVM_ADDRESS;
export const MOCK_EVM_ADDRESS_INVALID = INVALID_EVM_ADDRESS;

