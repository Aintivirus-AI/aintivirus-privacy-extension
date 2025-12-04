/**
 * AINTIVIRUS Wallet Module - Type Definitions
 * 
 * SECURITY NOTE: This file defines the data structures for the wallet.
 * Sensitive types are clearly marked. Never log or expose sensitive data.
 */

import { PublicKey } from '@solana/web3.js';

// ============================================
// NETWORK CONFIGURATION
// ============================================

/**
 * Supported Solana networks
 */
export type SolanaNetwork = 'mainnet-beta' | 'devnet';

/**
 * RPC endpoint configuration
 */
export interface NetworkConfig {
  name: SolanaNetwork;
  rpcUrl: string;
  fallbackRpcUrls: string[];
  explorerUrl: string;
}

/**
 * Default RPC endpoints (public endpoints, no API keys)
 * SECURITY: These are public endpoints. For production, consider dedicated RPC.
 * 
 * Using multiple fallback endpoints because public Solana RPCs have rate limits.
 */
export const NETWORK_CONFIGS: Record<SolanaNetwork, NetworkConfig> = {
  'mainnet-beta': {
    name: 'mainnet-beta',
    rpcUrl: 'https://solana-mainnet.g.alchemy.com/v2/demo',
    fallbackRpcUrls: [
      'https://rpc.ankr.com/solana',
      'https://solana.public-rpc.com',
      'https://api.mainnet-beta.solana.com',
    ],
    explorerUrl: 'https://explorer.solana.com',
  },
  'devnet': {
    name: 'devnet',
    rpcUrl: 'https://rpc.ankr.com/solana_devnet',
    fallbackRpcUrls: [
      'https://api.devnet.solana.com',
    ],
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
  },
};

// ============================================
// WALLET STATE
// ============================================

/**
 * Wallet lock state
 */
export type WalletLockState = 'locked' | 'unlocked' | 'uninitialized';

/**
 * Public wallet state (safe to expose to UI)
 */
export interface WalletState {
  /** Current lock state */
  lockState: WalletLockState;
  /** Public address (base58 encoded) - safe to display */
  publicAddress: string | null;
  /** Currently selected network */
  network: SolanaNetwork;
}

/**
 * Wallet settings stored in chrome.storage
 */
export interface WalletSettings {
  /** Selected network */
  network: SolanaNetwork;
  /** Custom RPC URL override (optional) */
  customRpcUrl?: string;
  /** Auto-lock timeout in minutes (0 = never) */
  autoLockMinutes: number;
  /** Custom tokens added by user */
  customTokens?: CustomToken[];
}

/**
 * Default wallet settings
 */
export const DEFAULT_WALLET_SETTINGS: WalletSettings = {
  network: 'mainnet-beta',
  autoLockMinutes: 15,
  customTokens: [],
};

// ============================================
// RPC HEALTH TRACKING
// ============================================

/**
 * Health data for a single RPC endpoint
 */
export interface RpcEndpointHealth {
  /** RPC endpoint URL */
  url: string;
  /** Average latency in milliseconds (-1 if never measured) */
  latencyMs: number;
  /** Timestamp of last successful call */
  lastSuccess: number;
  /** Timestamp of last failed call (null if never failed) */
  lastFailure: number | null;
  /** Number of consecutive or recent failures */
  failureCount: number;
  /** Total successful calls */
  successCount: number;
}

/**
 * Default RPC health data
 */
export const DEFAULT_RPC_HEALTH: Record<string, RpcEndpointHealth> = {};

// ============================================
// ENCRYPTED STORAGE
// ============================================

/**
 * Encrypted vault structure stored in chrome.storage
 * 
 * SECURITY: The vault contains the encrypted mnemonic/private key.
 * - salt: Used for PBKDF2 key derivation (not secret, but unique per wallet)
 * - iv: Initialization vector for AES-GCM (not secret, but unique per encryption)
 * - ciphertext: The encrypted mnemonic (SECRET - only decryptable with password)
 * - publicKey: Stored for quick access without decryption (not secret)
 */
export interface EncryptedVault {
  /** PBKDF2 salt (base64 encoded) */
  salt: string;
  /** AES-GCM initialization vector (base64 encoded) */
  iv: string;
  /** Encrypted mnemonic (base64 encoded) */
  ciphertext: string;
  /** Public key for display without unlock (base58 encoded) */
  publicKey: string;
  /** Vault version for future migrations */
  version: number;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Current vault version
 */
export const VAULT_VERSION = 1;

// ============================================
// TRANSACTION TYPES
// ============================================

/**
 * Unsigned transaction for signing
 * 
 * SECURITY: This represents a transaction before signing.
 * The signing operation requires the private key in memory.
 */
export interface UnsignedTransaction {
  /** Serialized transaction (base64) */
  serializedTransaction: string;
  /** Human-readable description */
  description: string;
  /** Estimated fee in lamports */
  estimatedFee: number;
}

/**
 * Signed transaction ready for broadcast
 * 
 * SECURITY: Contains signed data but NOT the private key.
 * Safe to store temporarily for broadcast.
 */
export interface SignedTransaction {
  /** Signed serialized transaction (base64) */
  signedTransaction: string;
  /** Transaction signature (base58) */
  signature: string;
}

// ============================================
// BALANCE AND ACCOUNT INFO
// ============================================

/**
 * Account balance information
 */
export interface WalletBalance {
  /** Balance in lamports */
  lamports: number;
  /** Balance in SOL (lamports / 1e9) */
  sol: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

// ============================================
// DERIVATION CONSTANTS
// ============================================

/**
 * BIP-44 derivation path for Solana
 * m/44'/501'/0'/0'
 * 
 * - 44' = BIP-44 purpose
 * - 501' = Solana coin type
 * - 0' = Account index
 * - 0' = Change (external)
 */
export const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

/**
 * Mnemonic word count (24 words = 256 bits of entropy)
 */
export const MNEMONIC_WORD_COUNT = 24;

// ============================================
// CRYPTO CONSTANTS
// ============================================

/**
 * PBKDF2 iterations for password-based key derivation
 * 
 * SECURITY: 100,000 iterations provides reasonable protection against
 * brute-force attacks while keeping unlock times acceptable (~100-300ms).
 */
export const PBKDF2_ITERATIONS = 100000;

/**
 * Salt length in bytes
 */
export const SALT_LENGTH = 32;

/**
 * AES-GCM IV length in bytes
 */
export const IV_LENGTH = 12;

// ============================================
// ERROR TYPES
// ============================================

/**
 * Wallet-specific error codes
 */
export enum WalletErrorCode {
  WALLET_NOT_INITIALIZED = 'WALLET_NOT_INITIALIZED',
  WALLET_ALREADY_EXISTS = 'WALLET_ALREADY_EXISTS',
  WALLET_LOCKED = 'WALLET_LOCKED',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
  INVALID_MNEMONIC = 'INVALID_MNEMONIC',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  RPC_ERROR = 'RPC_ERROR',
  SIGNING_FAILED = 'SIGNING_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  // Phase 6 additions
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_TIMEOUT = 'TRANSACTION_TIMEOUT',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
}

/**
 * Wallet error with code for programmatic handling
 */
export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

// ============================================
// MESSAGE TYPES (for background script communication)
// ============================================

/**
 * Wallet message types for inter-component communication
 */
export type WalletMessageType =
  // Wallet lifecycle
  | 'WALLET_CREATE'
  | 'WALLET_IMPORT'
  | 'WALLET_UNLOCK'
  | 'WALLET_LOCK'
  | 'WALLET_EXISTS'
  | 'WALLET_GET_STATE'
  | 'WALLET_DELETE'
  // Balance and account
  | 'WALLET_GET_BALANCE'
  | 'WALLET_GET_ADDRESS'
  | 'WALLET_GET_ADDRESS_QR'
  // Network
  | 'WALLET_SET_NETWORK'
  | 'WALLET_GET_NETWORK'
  | 'WALLET_GET_NETWORK_STATUS'
  // Transaction signing (no send)
  | 'WALLET_SIGN_TRANSACTION'
  | 'WALLET_SIGN_MESSAGE'
  // Settings
  | 'WALLET_GET_SETTINGS'
  | 'WALLET_SET_SETTINGS'
  // Phase 6: Transactions
  | 'WALLET_SEND_SOL'
  | 'WALLET_ESTIMATE_FEE'
  // Phase 6: History
  | 'WALLET_GET_HISTORY'
  // Phase 6: Tokens
  | 'WALLET_GET_TOKENS'
  | 'WALLET_ADD_TOKEN'
  | 'WALLET_REMOVE_TOKEN'
  // RPC Health & Configuration
  | 'WALLET_GET_RPC_HEALTH'
  | 'WALLET_ADD_RPC'
  | 'WALLET_REMOVE_RPC'
  | 'WALLET_TEST_RPC';

/**
 * Payload types for wallet messages
 */
export interface WalletMessagePayloads {
  WALLET_CREATE: { password: string };
  WALLET_IMPORT: { mnemonic: string; password: string };
  WALLET_UNLOCK: { password: string };
  WALLET_LOCK: undefined;
  WALLET_EXISTS: undefined;
  WALLET_GET_STATE: undefined;
  WALLET_DELETE: { password: string };
  WALLET_GET_BALANCE: undefined;
  WALLET_GET_ADDRESS: undefined;
  WALLET_GET_ADDRESS_QR: { size?: number };
  WALLET_SET_NETWORK: { network: SolanaNetwork };
  WALLET_GET_NETWORK: undefined;
  WALLET_GET_NETWORK_STATUS: undefined;
  WALLET_SIGN_TRANSACTION: { serializedTransaction: string };
  WALLET_SIGN_MESSAGE: { message: string };
  WALLET_GET_SETTINGS: undefined;
  WALLET_SET_SETTINGS: Partial<WalletSettings>;
  // Phase 6: Transactions
  WALLET_SEND_SOL: SendTransactionParams;
  WALLET_ESTIMATE_FEE: { recipient: string; amountSol: number };
  // Phase 6: History
  WALLET_GET_HISTORY: { limit?: number; before?: string };
  // Phase 6: Tokens
  WALLET_GET_TOKENS: undefined;
  WALLET_ADD_TOKEN: { mint: string; symbol?: string; name?: string };
  WALLET_REMOVE_TOKEN: { mint: string };
  // RPC Health & Configuration
  WALLET_GET_RPC_HEALTH: undefined;
  WALLET_ADD_RPC: { network: SolanaNetwork; url: string };
  WALLET_REMOVE_RPC: { network: SolanaNetwork; url: string };
  WALLET_TEST_RPC: { url: string };
}

/**
 * Response types for wallet messages
 */
export interface WalletMessageResponses {
  WALLET_CREATE: { mnemonic: string; publicAddress: string };
  WALLET_IMPORT: { publicAddress: string };
  WALLET_UNLOCK: { publicAddress: string };
  WALLET_LOCK: void;
  WALLET_EXISTS: boolean;
  WALLET_GET_STATE: WalletState;
  WALLET_DELETE: void;
  WALLET_GET_BALANCE: WalletBalance;
  WALLET_GET_ADDRESS: string;
  WALLET_GET_ADDRESS_QR: string; // data URL
  WALLET_SET_NETWORK: void;
  WALLET_GET_NETWORK: SolanaNetwork;
  WALLET_GET_NETWORK_STATUS: { connected: boolean; latency: number };
  WALLET_SIGN_TRANSACTION: SignedTransaction;
  WALLET_SIGN_MESSAGE: { signature: string };
  WALLET_GET_SETTINGS: WalletSettings;
  WALLET_SET_SETTINGS: void;
  // Phase 6 additions
  WALLET_SEND_SOL: SendTransactionResult;
  WALLET_ESTIMATE_FEE: FeeEstimate;
  WALLET_GET_HISTORY: TransactionHistoryResult;
  WALLET_GET_TOKENS: SPLTokenBalance[];
  WALLET_ADD_TOKEN: void;
  WALLET_REMOVE_TOKEN: void;
  // RPC Health & Configuration
  WALLET_GET_RPC_HEALTH: RpcHealthSummary;
  WALLET_ADD_RPC: { success: boolean; error?: string };
  WALLET_REMOVE_RPC: void;
  WALLET_TEST_RPC: { success: boolean; latencyMs?: number; blockHeight?: number; error?: string };
}

/**
 * RPC health summary for UI display
 */
export interface RpcHealthSummary {
  endpoints: (RpcEndpointHealth & { score: number; isCustom: boolean })[];
  bestEndpoint: string;
  healthyCount: number;
  unhealthyCount: number;
}

// ============================================
// PHASE 6: TRANSACTION TYPES
// ============================================

/**
 * Direction of a transaction relative to the wallet
 */
export type TransactionDirection = 'sent' | 'received' | 'unknown';

/**
 * Status of a transaction
 */
export type TransactionStatus = 'confirmed' | 'pending' | 'failed';

/**
 * Parameters for sending SOL
 */
export interface SendTransactionParams {
  /** Recipient's public key (base58) */
  recipient: string;
  /** Amount to send in SOL */
  amountSol: number;
  /** Optional memo for the transaction */
  memo?: string;
}

/**
 * Result of sending a transaction
 */
export interface SendTransactionResult {
  /** Transaction signature (base58) */
  signature: string;
  /** Explorer URL for the transaction */
  explorerUrl: string;
}

/**
 * Fee estimate for a transaction
 */
export interface FeeEstimate {
  /** Estimated fee in lamports */
  feeLamports: number;
  /** Estimated fee in SOL */
  feeSol: number;
  /** Priority fee (if applicable) */
  priorityFee: number;
}

/**
 * A single transaction history item
 */
export interface TransactionHistoryItem {
  /** Transaction signature (base58) */
  signature: string;
  /** Block time (Unix timestamp in seconds) */
  timestamp: number | null;
  /** Transaction direction relative to wallet */
  direction: TransactionDirection;
  /** Amount transferred in lamports */
  amountLamports: number;
  /** Amount transferred in SOL */
  amountSol: number;
  /** Transaction status */
  status: TransactionStatus;
  /** Fee paid in lamports */
  feeLamports: number;
  /** Counterparty address (sender if received, recipient if sent) */
  counterparty: string | null;
  /** Transaction type description */
  type: string;
  /** Slot number */
  slot: number;
}

/**
 * Paginated transaction history result
 */
export interface TransactionHistoryResult {
  /** List of transactions */
  transactions: TransactionHistoryItem[];
  /** Has more transactions available */
  hasMore: boolean;
  /** Cursor for fetching next page (last signature) */
  cursor: string | null;
}

// ============================================
// PHASE 6: SPL TOKEN TYPES
// ============================================

/**
 * SPL Token balance information
 */
export interface SPLTokenBalance {
  /** Token mint address (base58) */
  mint: string;
  /** Token symbol (e.g., "USDC") */
  symbol: string;
  /** Token name (e.g., "USD Coin") */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Raw balance (in smallest units) */
  rawBalance: string;
  /** UI balance (human-readable) */
  uiBalance: number;
  /** Token account address */
  tokenAccount: string;
  /** Logo URI (optional) */
  logoUri?: string;
}

/**
 * Custom token entry for manual addition
 */
export interface CustomToken {
  /** Token mint address (base58) */
  mint: string;
  /** Custom symbol override */
  symbol?: string;
  /** Custom name override */
  name?: string;
  /** Added timestamp */
  addedAt: number;
}

/**
 * Popular SPL tokens with metadata
 */
export interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

/**
 * Default token list for popular SPL tokens
 */
export const DEFAULT_TOKEN_LIST: TokenMetadata[] = [
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
  },
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'wSOL',
    name: 'Wrapped SOL',
    decimals: 9,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade staked SOL',
    decimals: 9,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
  },
  {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoUri: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
  },
  {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logoUri: 'https://static.jup.ag/jup/icon.png',
  },
];

