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

// ============================================
// MULTI-CHAIN TYPES
// ============================================

/**
 * Supported chain types
 */
export type ChainType = 'solana' | 'evm';

/**
 * Supported EVM chain identifiers
 */
export type EVMChainId = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';

/**
 * Network environment for all chains
 */
export type NetworkEnvironment = 'mainnet' | 'testnet';

/**
 * Public wallet state (safe to expose to UI)
 */
export interface WalletState {
  /** Current lock state */
  lockState: WalletLockState;
  /** Public address (base58 encoded for Solana, 0x for EVM) - safe to display */
  publicAddress: string | null;
  /** Currently selected Solana network (legacy, kept for backwards compatibility) */
  network: SolanaNetwork;
  /** Active wallet ID (for multi-wallet support) */
  activeWalletId: string | null;
  /** Active wallet label */
  activeWalletLabel: string | null;
  /** Active account ID within the wallet */
  activeAccountId: string | null;
  /** Active account name */
  activeAccountName: string | null;
  /** Total number of wallets */
  walletCount: number;
  /** Total number of accounts in active wallet */
  accountCount: number;
  /** Active chain type */
  activeChain: ChainType;
  /** Active EVM chain (when activeChain is 'evm') */
  activeEVMChain: EVMChainId | null;
  /** EVM address for current wallet (derived from same mnemonic) */
  evmAddress: string | null;
  /** Network environment (mainnet/testnet) */
  networkEnvironment: NetworkEnvironment;
  /** Whether current account is watch-only */
  isWatchOnly: boolean;
}

// ============================================
// RECENT RECIPIENTS
// ============================================

/**
 * Maximum number of recent recipients stored per chain
 */
export const MAX_RECENT_RECIPIENTS = 10;

/**
 * Chain identifier for recent recipients storage
 * - For Solana: 'solana:mainnet-beta' or 'solana:devnet'
 * - For EVM: 'evm:1' (mainnet), 'evm:137' (polygon), etc.
 */
export type RecentRecipientChainId = string;

/**
 * A recent recipient entry stored in wallet settings
 */
export interface RecentRecipient {
  /** Recipient address (base58 for Solana, 0x for EVM) */
  address: string;
  /** User-assigned label (optional, e.g., "Alice", "Cold Wallet") */
  label?: string;
  /** Last used timestamp (ms since epoch) */
  lastUsedAt: number;
  /** Number of times this recipient was used */
  useCount: number;
}

/**
 * Recent recipients indexed by chain identifier
 */
export type RecentRecipientsMap = Record<RecentRecipientChainId, RecentRecipient[]>;

/**
 * Wallet settings stored in chrome.storage
 */
export interface WalletSettings {
  /** Selected Solana network (legacy) */
  network: SolanaNetwork;
  /** Custom RPC URL override (optional) */
  customRpcUrl?: string;
  /** Auto-lock timeout in minutes (0 = never) */
  autoLockMinutes: number;
  /** Custom tokens added by user (Solana SPL tokens) */
  customTokens?: CustomToken[];
  /** Active chain type */
  activeChain?: ChainType;
  /** Active EVM chain */
  activeEVMChain?: EVMChainId | null;
  /** Network environment (mainnet/testnet) */
  networkEnvironment?: NetworkEnvironment;
  /** Custom EVM tokens per chain */
  customEVMTokens?: Partial<Record<EVMChainId, string[]>>;
  /** Recent recipients per chain (max 10 per chain) */
  recentRecipients?: RecentRecipientsMap;
}

/**
 * Default wallet settings
 */
export const DEFAULT_WALLET_SETTINGS: WalletSettings = {
  network: 'mainnet-beta',
  autoLockMinutes: 15,
  customTokens: [],
  activeChain: 'solana',
  activeEVMChain: 'ethereum',
  networkEnvironment: 'mainnet',
  recentRecipients: {},
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
 * Version 1: Single wallet
 * Version 2: Multi-wallet support
 */
export const VAULT_VERSION = 1;
export const MULTI_WALLET_VAULT_VERSION = 2;

/**
 * Maximum number of wallets per user profile
 */
export const MAX_WALLETS = 100;

/**
 * Maximum length for wallet labels
 */
export const MAX_WALLET_LABEL_LENGTH = 32;

// ============================================
// MULTI-WALLET TYPES
// ============================================

/**
 * Single wallet entry (public info, safe to expose to UI)
 * 
 * SECURITY: This contains only public information about a wallet.
 * Private keys and mnemonics are stored separately in EncryptedWalletData.
 */
export interface WalletEntry {
  /** Unique wallet identifier (UUID v4) */
  id: string;
  /** User-editable label/nickname (max 32 chars) */
  label: string;
  /** Solana public key / address (base58 encoded) */
  publicKey: string;
  /** EVM address (0x-prefixed, checksummed) - derived from same mnemonic */
  evmAddress?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Derivation index for HD wallet support (currently always 0) */
  derivationIndex: number;
}

/**
 * Multi-wallet vault structure stored in chrome.storage
 * 
 * SECURITY: This stores wallet metadata and references.
 * Encrypted mnemonics are stored separately in EncryptedWalletData.
 */
export interface MultiWalletVault {
  /** Vault version (2 for multi-wallet) */
  version: 2;
  /** Currently active wallet ID (null if none) */
  activeWalletId: string | null;
  /** List of all wallet entries */
  wallets: WalletEntry[];
  /** Master salt for password verification */
  masterSalt: string;
  /** Master verifier hash for password validation without decryption */
  masterVerifier: string;
  /** Vault creation timestamp */
  createdAt: number;
}

/**
 * Encrypted wallet data stored separately from vault metadata
 * 
 * SECURITY: Contains encrypted mnemonics indexed by wallet ID.
 * Each wallet has its own salt and IV for additional security.
 */
export interface EncryptedWalletData {
  [walletId: string]: {
    /** PBKDF2 salt for this wallet (base64 encoded) */
    salt: string;
    /** AES-GCM IV for this wallet (base64 encoded) */
    iv: string;
    /** Encrypted mnemonic (base64 encoded) */
    ciphertext: string;
  };
}

/**
 * Default empty multi-wallet vault
 */
export const DEFAULT_MULTI_WALLET_VAULT: Omit<MultiWalletVault, 'masterSalt' | 'masterVerifier'> = {
  version: 2,
  activeWalletId: null,
  wallets: [],
  createdAt: 0,
};

// ============================================
// HD WALLET & MULTI-ACCOUNT TYPES (V3)
// ============================================

/**
 * Vault version for HD wallet support
 */
export const HD_WALLET_VAULT_VERSION = 3;

/**
 * Maximum accounts per wallet
 */
export const MAX_ACCOUNTS_PER_WALLET = 20;

/**
 * Maximum length for account names
 */
export const MAX_ACCOUNT_NAME_LENGTH = 32;

/**
 * Derivation path type for EVM
 */
export type EVMDerivationPathType = 'standard' | 'ledger-live';

/**
 * Derivation path type for Solana
 */
export type SolanaDerivationPathType = 'standard' | 'legacy';

/**
 * A derived account within an HD wallet
 */
export interface DerivedAccount {
  /** Unique account identifier (UUID v4) */
  id: string;
  /** User-editable account name */
  name: string;
  /** Derivation index (0, 1, 2, ...) */
  index: number;
  /** Solana address (base58 encoded) */
  solanaAddress: string;
  /** EVM address (0x-prefixed, checksummed) */
  evmAddress: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Watch-only account (no private key)
 */
export interface WatchOnlyAccount {
  /** Unique account identifier (UUID v4) */
  id: string;
  /** User-editable account name */
  name: string;
  /** Chain type this address belongs to */
  chainType: 'solana' | 'evm';
  /** The watched address */
  address: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * V3 wallet entry with HD account support
 * 
 * SECURITY: Contains only public information.
 * Private keys and mnemonics are stored separately.
 */
export interface WalletEntryV3 {
  /** Unique wallet identifier (UUID v4) */
  id: string;
  /** User-editable label/nickname */
  label: string;
  /** Derived accounts within this wallet */
  accounts: DerivedAccount[];
  /** EVM derivation path type */
  evmPathType: EVMDerivationPathType;
  /** Solana derivation path type */
  solanaPathType: SolanaDerivationPathType;
  /** Next account index to use for derivation */
  nextAccountIndex: number;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Multi-wallet vault V3 with HD account support
 * 
 * SECURITY: This stores wallet metadata and references.
 * Encrypted mnemonics are stored separately in EncryptedWalletData.
 */
export interface MultiWalletVaultV3 {
  /** Vault version (3 for HD wallet) */
  version: 3;
  /** Currently active wallet ID (null if none or watch-only active) */
  activeWalletId: string | null;
  /** Currently active account ID within the wallet */
  activeAccountId: string | null;
  /** List of all HD wallet entries */
  wallets: WalletEntryV3[];
  /** Watch-only accounts */
  watchOnlyAccounts: WatchOnlyAccount[];
  /** Master salt for password verification */
  masterSalt: string;
  /** Master verifier hash for password validation */
  masterVerifier: string;
  /** Vault creation timestamp */
  createdAt: number;
}

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
 * PBKDF2 iteration counts by KDF version
 * 
 * V1: 100,000 iterations - original, still acceptable
 * V2: 310,000 iterations - OWASP 2023 recommendation for SHA-256
 * 
 * SECURITY: Higher iteration counts provide better protection against
 * brute-force attacks. V2 is recommended for new vaults.
 * Existing V1 vaults are automatically migrated to V2 on successful unlock.
 */
export const PBKDF2_ITERATIONS_V1 = 100000;
export const PBKDF2_ITERATIONS_V2 = 310000;

/** Current default iteration count (for new vaults) */
export const PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_V2;

/** Type for KDF version */
export type KdfVersion = 1 | 2;

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
  // Multi-wallet additions
  MAX_WALLETS_REACHED = 'MAX_WALLETS_REACHED',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  INVALID_WALLET_LABEL = 'INVALID_WALLET_LABEL',
  CANNOT_DELETE_LAST_WALLET = 'CANNOT_DELETE_LAST_WALLET',
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',
  // HD wallet / account additions
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  ADDRESS_ALREADY_EXISTS = 'ADDRESS_ALREADY_EXISTS',
  CANNOT_DELETE_LAST_ACCOUNT = 'CANNOT_DELETE_LAST_ACCOUNT',
  MAX_ACCOUNTS_REACHED = 'MAX_ACCOUNTS_REACHED',
  INVALID_ACCOUNT_NAME = 'INVALID_ACCOUNT_NAME',
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
  // Multi-wallet management
  | 'WALLET_LIST'
  | 'WALLET_ADD'
  | 'WALLET_IMPORT_ADD'
  | 'WALLET_SWITCH'
  | 'WALLET_RENAME'
  | 'WALLET_DELETE_ONE'
  | 'WALLET_EXPORT_ONE'
  | 'WALLET_GET_ACTIVE'
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
  | 'WALLET_SEND_SPL_TOKEN'
  | 'WALLET_ESTIMATE_FEE'
  // Phase 6: History
  | 'WALLET_GET_HISTORY'
  // Phase 6: Tokens
  | 'WALLET_GET_TOKENS'
  | 'WALLET_ADD_TOKEN'
  | 'WALLET_REMOVE_TOKEN'
  | 'WALLET_GET_POPULAR_TOKENS'
  | 'WALLET_GET_TOKEN_METADATA'
  // RPC Health & Configuration
  | 'WALLET_GET_RPC_HEALTH'
  | 'WALLET_ADD_RPC'
  | 'WALLET_REMOVE_RPC'
  | 'WALLET_TEST_RPC'
  // Multi-chain support
  | 'WALLET_SET_CHAIN'
  | 'WALLET_SET_EVM_CHAIN'
  | 'WALLET_GET_EVM_BALANCE'
  | 'WALLET_SEND_ETH'
  | 'WALLET_SEND_ERC20'
  | 'WALLET_GET_EVM_TOKENS'
  | 'WALLET_GET_EVM_HISTORY'
  | 'WALLET_ESTIMATE_EVM_FEE'
  | 'WALLET_GET_EVM_ADDRESS'
  // EVM Pending Transaction Controls
  | 'EVM_GET_PENDING_TXS'
  | 'EVM_SPEED_UP_TX'
  | 'EVM_CANCEL_TX'
  | 'EVM_GET_GAS_PRESETS'
  | 'EVM_ESTIMATE_REPLACEMENT_FEE'
  // EVM Allowance Management
  | 'WALLET_GET_ALLOWANCES'
  | 'WALLET_ESTIMATE_REVOKE_FEE'
  | 'WALLET_REVOKE_ALLOWANCE'
  // Private key import/export
  | 'WALLET_IMPORT_PRIVATE_KEY'
  | 'WALLET_EXPORT_PRIVATE_KEY';

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
  // Multi-wallet management
  WALLET_LIST: undefined;
  WALLET_ADD: { password: string; label?: string };
  WALLET_IMPORT_ADD: { mnemonic: string; password: string; label?: string };
  WALLET_SWITCH: { walletId: string; password: string };
  WALLET_RENAME: { walletId: string; label: string };
  WALLET_DELETE_ONE: { walletId: string; password: string };
  WALLET_EXPORT_ONE: { walletId: string; password: string };
  WALLET_GET_ACTIVE: undefined;
  // Balance and account
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
  WALLET_SEND_SPL_TOKEN: { recipient: string; amount: number; mint: string; decimals: number; tokenAccount?: string };
  WALLET_ESTIMATE_FEE: { recipient: string; amountSol: number };
  // Phase 6: History
  WALLET_GET_HISTORY: { limit?: number; before?: string; forceRefresh?: boolean };
  // Phase 6: Tokens
  WALLET_GET_TOKENS: undefined;
  WALLET_ADD_TOKEN: { mint: string; symbol?: string; name?: string };
  WALLET_REMOVE_TOKEN: { mint: string };
  WALLET_GET_POPULAR_TOKENS: { chainType?: 'solana' | 'evm' } | undefined;
  WALLET_GET_TOKEN_METADATA: { mint: string };
  // RPC Health & Configuration
  WALLET_GET_RPC_HEALTH: undefined;
  WALLET_ADD_RPC: { network: SolanaNetwork; url: string };
  WALLET_REMOVE_RPC: { network: SolanaNetwork; url: string };
  WALLET_TEST_RPC: { url: string };
  // Multi-chain support
  WALLET_SET_CHAIN: { chain: ChainType; evmChainId?: EVMChainId | null };
  WALLET_SET_EVM_CHAIN: { evmChainId: EVMChainId };
  WALLET_GET_EVM_BALANCE: { evmChainId?: EVMChainId | null };
  WALLET_SEND_ETH: EVMSendParams;
  WALLET_SEND_ERC20: EVMTokenSendParams;
  WALLET_GET_EVM_TOKENS: { evmChainId?: EVMChainId | null };
  WALLET_GET_EVM_HISTORY: { evmChainId?: EVMChainId | null; limit?: number };
  WALLET_ESTIMATE_EVM_FEE: { evmChainId?: EVMChainId | null; recipient: string; amount: string; tokenAddress?: string };
  WALLET_GET_EVM_ADDRESS: undefined;
  // EVM Pending Transaction Controls
  EVM_GET_PENDING_TXS: { evmChainId?: EVMChainId; address?: string };
  EVM_SPEED_UP_TX: { txHash: string; bumpPercent?: number; customMaxFeePerGas?: string; customMaxPriorityFeePerGas?: string };
  EVM_CANCEL_TX: { txHash: string; bumpPercent?: number };
  EVM_GET_GAS_PRESETS: { evmChainId: EVMChainId; txHash: string };
  EVM_ESTIMATE_REPLACEMENT_FEE: { txHash: string; bumpPercent?: number };
  // EVM Allowance Management
  WALLET_GET_ALLOWANCES: { evmChainId: EVMChainId; forceRefresh?: boolean };
  WALLET_ESTIMATE_REVOKE_FEE: { evmChainId: EVMChainId; tokenAddress: string; spenderAddress: string };
  WALLET_REVOKE_ALLOWANCE: { evmChainId: EVMChainId; tokenAddress: string; spenderAddress: string };
  // Private key import/export
  WALLET_IMPORT_PRIVATE_KEY: { privateKey: string; password: string; label?: string };
  WALLET_EXPORT_PRIVATE_KEY: { walletId: string; password: string; chain: 'solana' | 'evm' };
}

/**
 * Response types for wallet messages
 */
export interface WalletMessageResponses {
  WALLET_CREATE: { mnemonic: string; publicAddress: string; walletId: string };
  WALLET_IMPORT: { publicAddress: string; walletId: string };
  WALLET_UNLOCK: { publicAddress: string };
  WALLET_LOCK: void;
  WALLET_EXISTS: boolean;
  WALLET_GET_STATE: WalletState;
  WALLET_DELETE: void;
  // Multi-wallet management
  WALLET_LIST: WalletEntry[];
  WALLET_ADD: { mnemonic: string; publicAddress: string; walletId: string };
  WALLET_IMPORT_ADD: { publicAddress: string; walletId: string };
  WALLET_SWITCH: { publicAddress: string; walletId: string };
  WALLET_RENAME: void;
  WALLET_DELETE_ONE: void;
  WALLET_EXPORT_ONE: { mnemonic: string };
  WALLET_GET_ACTIVE: { walletId: string | null; publicAddress: string | null; label: string | null };
  // Balance and account
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
  WALLET_SEND_SPL_TOKEN: SendTransactionResult;
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
  // Multi-chain support
  WALLET_SET_CHAIN: void;
  WALLET_SET_EVM_CHAIN: void;
  WALLET_GET_EVM_BALANCE: EVMBalance;
  WALLET_SEND_ETH: EVMTransactionResult;
  WALLET_SEND_ERC20: EVMTransactionResult;
  WALLET_GET_EVM_TOKENS: EVMTokenBalance[];
  WALLET_GET_EVM_HISTORY: { transactions: any[]; hasMore: boolean };
  WALLET_ESTIMATE_EVM_FEE: EVMFeeEstimate;
  WALLET_GET_EVM_ADDRESS: string;
  // EVM Pending Transaction Controls
  EVM_GET_PENDING_TXS: EVMPendingTxInfo[];
  EVM_SPEED_UP_TX: EVMTransactionResult;
  EVM_CANCEL_TX: EVMTransactionResult;
  EVM_GET_GAS_PRESETS: EVMGasPresets;
  EVM_ESTIMATE_REPLACEMENT_FEE: EVMReplacementFeeEstimate;
  // EVM Allowance Management
  WALLET_GET_ALLOWANCES: EVMAllowanceDiscoveryResult;
  WALLET_ESTIMATE_REVOKE_FEE: EVMRevokeFeeEstimate;
  WALLET_REVOKE_ALLOWANCE: EVMTransactionResult;
  // Private key import/export
  WALLET_IMPORT_PRIVATE_KEY: { publicAddress: string; evmAddress: string; walletId: string };
  WALLET_EXPORT_PRIVATE_KEY: { privateKey: string };
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
  /** Token info for SPL token transfers */
  tokenInfo?: {
    /** Token mint address */
    mint: string;
    /** Token symbol (if known) */
    symbol?: string;
    /** Token name (if known) */
    name?: string;
    /** Token decimals */
    decimals: number;
    /** Token amount (UI formatted) */
    amount: number;
    /** Token logo URI */
    logoUri?: string;
  };
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

// ============================================
// EVM-SPECIFIC TYPES
// ============================================

/**
 * Parameters for sending ETH/native tokens on EVM
 */
export interface EVMSendParams {
  /** Recipient address (0x-prefixed) */
  recipient: string;
  /** Amount in ETH (e.g., "0.1") */
  amount: string;
  /** Optional EVM chain ID override */
  evmChainId?: EVMChainId | null;
}

/**
 * Parameters for sending ERC-20 tokens
 */
export interface EVMTokenSendParams {
  /** Recipient address (0x-prefixed) */
  recipient: string;
  /** Token contract address */
  tokenAddress: string;
  /** Amount in token units (e.g., "100" for 100 USDC) */
  amount: string;
  /** Token decimals */
  decimals: number;
  /** Optional EVM chain ID override */
  evmChainId?: EVMChainId;
}

/**
 * EVM balance information
 */
export interface EVMBalance {
  /** Balance in wei */
  wei: string;
  /** Balance in ETH */
  formatted: number;
  /** Native token symbol */
  symbol: string;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * EVM token balance
 */
export interface EVMTokenBalance {
  /** Token contract address */
  address: string;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Raw balance in smallest units */
  rawBalance: string;
  /** UI-friendly balance */
  uiBalance: number;
  /** Logo URI */
  logoUri?: string;
}

/**
 * EVM fee estimate
 */
export interface EVMFeeEstimate {
  /** Gas limit */
  gasLimit: string;
  /** Gas price in gwei */
  gasPriceGwei: number;
  /** Total fee in ETH */
  totalFeeEth: number;
  /** Total fee in wei */
  totalFeeWei: string;
  /** L1 data fee for L2 chains */
  l1DataFee?: string;
  /** Whether EIP-1559 is used */
  isEIP1559: boolean;
}

/**
 * EVM transaction result
 */
export interface EVMTransactionResult {
  /** Transaction hash */
  hash: string;
  /** Explorer URL */
  explorerUrl: string;
  /** Whether confirmed */
  confirmed: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Chain display information for UI
 */
export interface ChainDisplayInfo {
  /** Chain type */
  type: ChainType;
  /** EVM chain ID (if EVM) */
  evmChainId?: EVMChainId;
  /** Display name */
  name: string;
  /** Native token symbol */
  symbol: string;
  /** Chain icon/logo identifier */
  icon: string;
  /** Whether it's a testnet */
  isTestnet: boolean;
}

/**
 * Supported chains for UI display
 */
export const SUPPORTED_CHAINS: ChainDisplayInfo[] = [
  { type: 'solana', name: 'Solana', symbol: 'SOL', icon: 'solana', isTestnet: false },
  { type: 'evm', evmChainId: 'ethereum', name: 'Ethereum', symbol: 'ETH', icon: 'ethereum', isTestnet: false },
  { type: 'evm', evmChainId: 'polygon', name: 'Polygon', symbol: 'MATIC', icon: 'polygon', isTestnet: false },
  { type: 'evm', evmChainId: 'arbitrum', name: 'Arbitrum', symbol: 'ETH', icon: 'arbitrum', isTestnet: false },
  { type: 'evm', evmChainId: 'optimism', name: 'Optimism', symbol: 'ETH', icon: 'optimism', isTestnet: false },
  { type: 'evm', evmChainId: 'base', name: 'Base', symbol: 'ETH', icon: 'base', isTestnet: false },
];

/**
 * Multi-chain vault version
 * Version 3: Adds EVM address support
 */
export const MULTI_CHAIN_VAULT_VERSION = 3;

// ============================================
// EVM PENDING TRANSACTION TYPES
// ============================================

/**
 * Pending transaction status
 */
export type EVMPendingTxStatus = 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced';

/**
 * Pending transaction info for UI display
 */
export interface EVMPendingTxInfo {
  /** Transaction hash */
  hash: string;
  /** Transaction nonce */
  nonce: number;
  /** Chain identifier */
  chainId: EVMChainId;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Value in ETH (formatted) */
  valueFormatted: string;
  /** Max fee per gas in gwei */
  maxFeeGwei: number;
  /** Max priority fee in gwei */
  maxPriorityFeeGwei: number;
  /** Submission timestamp */
  submittedAt: number;
  /** Current status */
  status: EVMPendingTxStatus;
  /** Whether this is testnet */
  testnet: boolean;
  /** Explorer URL */
  explorerUrl: string;
  /** Replaced by hash (if replaced) */
  replacedBy?: string;
  /** Error reason (if failed/dropped) */
  errorReason?: string;
}

/**
 * Gas presets for replacement transactions
 */
export interface EVMGasPresets {
  slow: {
    maxFeeGwei: number;
    maxPriorityFeeGwei: number;
    estimatedWaitTime: string;
  };
  market: {
    maxFeeGwei: number;
    maxPriorityFeeGwei: number;
    estimatedWaitTime: string;
  };
  fast: {
    maxFeeGwei: number;
    maxPriorityFeeGwei: number;
    estimatedWaitTime: string;
  };
  original: {
    maxFeeGwei: number;
    maxPriorityFeeGwei: number;
  };
}

/**
 * Replacement fee estimate
 */
export interface EVMReplacementFeeEstimate {
  /** Recommended max fee per gas in gwei */
  maxFeeGwei: number;
  /** Recommended priority fee in gwei */
  maxPriorityFeeGwei: number;
  /** Minimum required max fee for replacement */
  minimumMaxFeeGwei: number;
  /** Current network max fee */
  networkMaxFeeGwei: number;
  /** Estimated cost difference in ETH */
  costDifferenceEth: number;
  /** Percent increase from original */
  percentIncrease: number;
  /** Whether fee exceeds warning threshold */
  exceedsWarning: boolean;
  /** Warning message if applicable */
  warning?: string;
}

// ============================================
// EVM ALLOWANCE TYPES
// ============================================

/**
 * Token allowance information
 */
export interface EVMTokenAllowance {
  /** Token contract address */
  tokenAddress: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Token name */
  tokenName: string;
  /** Token decimals */
  tokenDecimals: number;
  /** Token logo URI */
  tokenLogoUri?: string;
  /** Spender contract address */
  spenderAddress: string;
  /** Known spender name if available */
  spenderLabel?: string;
  /** Whether spender is verified */
  spenderVerified?: boolean;
  /** Raw allowance amount (bigint as string) */
  allowanceRaw: string;
  /** Formatted allowance amount */
  allowanceFormatted: number;
  /** Whether this is an infinite/unlimited allowance */
  isInfinite: boolean;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Allowance discovery result
 */
export interface EVMAllowanceDiscoveryResult {
  /** List of discovered allowances */
  allowances: EVMTokenAllowance[];
  /** Whether from cache */
  fromCache: boolean;
  /** When data was fetched */
  fetchedAt: number;
}

/**
 * Revoke fee estimate
 */
export interface EVMRevokeFeeEstimate {
  /** Estimated gas limit */
  gasLimit: string;
  /** Total fee in wei */
  totalFeeWei: string;
  /** Total fee in native token (ETH) */
  totalFeeFormatted: number;
}

/**
 * Alias for EVMTokenAllowance for backwards compatibility
 */
export type EVMAllowanceEntry = EVMTokenAllowance;

