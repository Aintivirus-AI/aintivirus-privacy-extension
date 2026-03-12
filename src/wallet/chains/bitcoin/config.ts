import type { BitcoinChainConfig, BitcoinChainId } from './types';

const BITCOIN_MAINNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

const BITCOIN_TESTNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

const LITECOIN_MAINNET = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const LITECOIN_TESTNET = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'tltc',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0x3a,
  wif: 0xef,
};

// Bitcoin Cash mainnet (uses same network params as Bitcoin but different address format)
const BITCOINCASH_MAINNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: '', // BCH uses CashAddr, not bech32
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

const ZCASH_MAINNET = {
  messagePrefix: '\x18Zcash Signed Message:\n',
  bech32: '',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: [0x1c, 0xb8],
  scriptHash: [0x1c, 0xbd],
  wif: 0x80,
};

export const BITCOIN_CHAINS: Record<BitcoinChainId, BitcoinChainConfig> = {
  bitcoin: {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    coinType: 0,
    network: BITCOIN_MAINNET,
    testnet: BITCOIN_TESTNET,
    defaultAddressType: 'native-segwit',
    supportedAddressTypes: ['legacy', 'segwit', 'native-segwit', 'taproot'],
    apiUrls: [
      'https://blockstream.info/api',
      'https://mempool.space/api',
    ],
    explorerUrl: 'https://blockstream.info',
    testnetExplorerUrl: 'https://blockstream.info/testnet',
    minRelayFee: 1,
    dustThreshold: 546,
  },

  bitcoincash: {
    id: 'bitcoincash',
    name: 'Bitcoin Cash',
    symbol: 'BCH',
    decimals: 8,
    coinType: 145,
    network: BITCOINCASH_MAINNET,
    defaultAddressType: 'legacy', // BCH primarily uses legacy addresses with CashAddr format
    supportedAddressTypes: ['legacy'],
    apiUrls: [
      'https://api.blockchair.com/bitcoin-cash',
    ],
    explorerUrl: 'https://blockchair.com/bitcoin-cash',
    minRelayFee: 1,
    dustThreshold: 546,
  },

  litecoin: {
    id: 'litecoin',
    name: 'Litecoin',
    symbol: 'LTC',
    decimals: 8,
    coinType: 2,
    network: LITECOIN_MAINNET,
    testnet: LITECOIN_TESTNET,
    defaultAddressType: 'native-segwit',
    supportedAddressTypes: ['legacy', 'segwit', 'native-segwit'],
    apiUrls: [
      'https://api.blockchair.com/litecoin',
    ],
    explorerUrl: 'https://litecoinspace.org',
    minRelayFee: 1,
    dustThreshold: 1000, // Increased from 546 for safety margin against network rejection
  },

  zcash: {
    id: 'zcash',
    name: 'Zcash',
    symbol: 'ZEC',
    decimals: 8,
    coinType: 133,
    network: ZCASH_MAINNET,
    defaultAddressType: 'legacy', // Zcash transparent uses t-addresses (legacy-like)
    supportedAddressTypes: ['legacy'],
    apiUrls: [
      'https://api.blockchair.com/zcash',
    ],
    explorerUrl: 'https://blockchair.com/zcash',
    minRelayFee: 1,
    dustThreshold: 546,
  },
};

export function getBitcoinChainConfig(chainId: BitcoinChainId): BitcoinChainConfig {
  const config = BITCOIN_CHAINS[chainId];
  if (!config) {
    throw new Error(`Unknown Bitcoin-family chain: ${chainId}`);
  }
  return config;
}

/**
 * Get derivation path for a Bitcoin-family chain
 * BIP-84 for native segwit (bc1...), BIP-44 for legacy
 */
export function getBitcoinDerivationPath(
  chainId: BitcoinChainId,
  accountIndex: number,
  addressType: 'legacy' | 'segwit' | 'native-segwit' | 'taproot' = 'native-segwit',
  isChange: boolean = false,
  addressIndex: number = 0
): string {
  const config = getBitcoinChainConfig(chainId);
  const coinType = config.coinType;
  const changeIndex = isChange ? 1 : 0;

  switch (addressType) {
    case 'legacy':
      // BIP-44: m/44'/coin'/account'/change/address
      return `m/44'/${coinType}'/${accountIndex}'/${changeIndex}/${addressIndex}`;
    case 'segwit':
      // BIP-49: m/49'/coin'/account'/change/address
      return `m/49'/${coinType}'/${accountIndex}'/${changeIndex}/${addressIndex}`;
    case 'native-segwit':
      // BIP-84: m/84'/coin'/account'/change/address
      return `m/84'/${coinType}'/${accountIndex}'/${changeIndex}/${addressIndex}`;
    case 'taproot':
      // BIP-86: m/86'/coin'/account'/change/address
      return `m/86'/${coinType}'/${accountIndex}'/${changeIndex}/${addressIndex}`;
    default:
      return `m/84'/${coinType}'/${accountIndex}'/${changeIndex}/${addressIndex}`;
  }
}

/**
 * Get explorer URL for an address
 */
export function getBitcoinAddressExplorerUrl(
  chainId: BitcoinChainId,
  address: string,
  testnet: boolean = false
): string {
  const config = getBitcoinChainConfig(chainId);
  const baseUrl = testnet && config.testnetExplorerUrl 
    ? config.testnetExplorerUrl 
    : config.explorerUrl;
  
  return `${baseUrl}/address/${address}`;
}

/**
 * Get explorer URL for a transaction
 */
export function getBitcoinTxExplorerUrl(
  chainId: BitcoinChainId,
  txid: string,
  testnet: boolean = false
): string {
  const config = getBitcoinChainConfig(chainId);
  const baseUrl = testnet && config.testnetExplorerUrl 
    ? config.testnetExplorerUrl 
    : config.explorerUrl;
  
  return `${baseUrl}/tx/${txid}`;
}
