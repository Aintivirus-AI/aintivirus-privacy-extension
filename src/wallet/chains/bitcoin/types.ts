export type BitcoinChainId = 'bitcoin' | 'bitcoincash' | 'litecoin' | 'zcash';

export type BitcoinAddressType = 'legacy' | 'segwit' | 'native-segwit' | 'taproot';

export interface BitcoinChainConfig {
  id: BitcoinChainId;
  name: string;
  symbol: string;
  decimals: number;
  /** BIP-44 coin type */
  coinType: number;
  /** Network parameters for address encoding */
  network: {
    messagePrefix: string;
    bech32: string;
    bip32: {
      public: number;
      private: number;
    };
    /** Version byte(s) for P2PKH addresses - single byte or array for multi-byte prefixes (e.g., Zcash) */
    pubKeyHash: number | number[];
    /** Version byte(s) for P2SH addresses - single byte or array for multi-byte prefixes (e.g., Zcash) */
    scriptHash: number | number[];
    wif: number;
  };
  /** Testnet network parameters */
  testnet?: {
    messagePrefix: string;
    bech32: string;
    bip32: {
      public: number;
      private: number;
    };
    /** Version byte(s) for P2PKH addresses - single byte or array for multi-byte prefixes (e.g., Zcash) */
    pubKeyHash: number | number[];
    /** Version byte(s) for P2SH addresses - single byte or array for multi-byte prefixes (e.g., Zcash) */
    scriptHash: number | number[];
    wif: number;
  };
  /** Default address type to use */
  defaultAddressType: BitcoinAddressType;
  /** Supported address types */
  supportedAddressTypes: BitcoinAddressType[];
  /** API base URLs */
  apiUrls: string[];
  /** Explorer URL */
  explorerUrl: string;
  /** Testnet explorer URL */
  testnetExplorerUrl?: string;
  /** Minimum relay fee in satoshis per byte */
  minRelayFee: number;
  /** Dust threshold in satoshis */
  dustThreshold: number;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number; // in satoshis
  script: string;
  address: string;
  confirmations: number;
}

export interface BitcoinTransaction {
  txid: string;
  version: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    scriptSig: string;
    sequence: number;
    addresses?: string[];
    value?: number;
  }>;
  vout: Array<{
    value: number;
    n: number;
    scriptPubKey: {
      hex: string;
      addresses?: string[];
      type: string;
    };
  }>;
  blockhash?: string;
  blockheight?: number;
  confirmations: number;
  time?: number;
  blocktime?: number;
  fees?: number;
}

export interface BitcoinBalance {
  confirmed: number; // in satoshis
  unconfirmed: number; // in satoshis
  total: number; // in satoshis
}

export interface BitcoinFeeEstimate {
  /** Fee rate in satoshis per byte */
  feeRate: number;
  /** Total fee in satoshis */
  totalFee: number;
  /** Estimated confirmation blocks */
  estimatedBlocks: number;
}

export interface UnsignedBitcoinTransaction {
  inputs: Array<{
    txid: string;
    vout: number;
    value: number;
    script: string;
    sequence?: number;
  }>;
  outputs: Array<{
    address: string;
    value: number;
  }>;
  changeAddress?: string;
  feeRate: number;
}

export interface SignedBitcoinTransaction {
  hex: string;
  txid: string;
}

export interface BitcoinKeypair {
  address: string;
  publicKey: string;
  privateKey: Uint8Array;
  wif: string;
  addressType: BitcoinAddressType;
}
