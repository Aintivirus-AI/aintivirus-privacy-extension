/**
 * Monero chain types
 * 
 * Monero is a privacy-focused cryptocurrency with unique cryptographic features.
 * This implementation supports watch-only wallets using view keys.
 */

export interface MoneroWatchOnlyConfig {
  /** Standard Monero address (starts with 4 for mainnet) */
  address: string;
  /** Private view key (64 hex characters) */
  viewKey: string;
  /** Optional: Wallet creation height for faster sync */
  restoreHeight?: number;
}

export interface MoneroBalance {
  /** Confirmed balance in piconeros (1 XMR = 1e12 piconeros) */
  balance: bigint;
  /** Unconfirmed/pending balance */
  unlockedBalance: bigint;
  /** Balance in XMR */
  balanceXmr: number;
  /** Number of outputs */
  outputCount: number;
}

export interface MoneroOutput {
  /** Transaction hash */
  txHash: string;
  /** Output index */
  index: number;
  /** Amount in piconeros */
  amount: bigint;
  /** Public key of the output */
  publicKey: string;
  /** Whether the output is spent */
  spent: boolean;
  /** Block height */
  blockHeight: number;
  /** Timestamp */
  timestamp: number;
}

export interface MoneroTransaction {
  /** Transaction hash */
  hash: string;
  /** Block height (0 if unconfirmed) */
  blockHeight: number;
  /** Timestamp */
  timestamp: number;
  /** Confirmations */
  confirmations: number;
  /** Total received amount (for watch-only, we can only see incoming) */
  amount: bigint;
  /** Transaction fee (may not be available for watch-only) */
  fee?: bigint;
  /** Whether this is an incoming transaction */
  isIncoming: boolean;
  /** Payment ID if present */
  paymentId?: string;
}

export interface MoneroNetworkInfo {
  /** Current block height */
  height: number;
  /** Network hashrate */
  difficulty: bigint;
  /** Block timestamp */
  timestamp: number;
  /** Whether node is synchronized */
  synchronized: boolean;
}

export interface MoneroNodeConfig {
  /** Node URL */
  url: string;
  /** Node name for display */
  name: string;
  /** Whether this is a testnet node */
  testnet: boolean;
}
