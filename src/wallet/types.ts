import { PublicKey } from '@solana/web3.js';

// Shared wallet type definitions, enums, and constants used across Solana/EVM flows.
export type SolanaNetwork = 'mainnet-beta' | 'devnet';

/**
 * Build-time injected API key for Helius Solana RPC.
 *
 * - In development, you can provide it via a local `.env` file (not committed).
 * - In CI/production builds, inject it as an environment variable.
 */
const HELIUS_API_KEY = process.env.AINTIVIRUS_HELIUS_API_KEY;

function getHeliusRpcUrl(network: SolanaNetwork): string | null {
  if (!HELIUS_API_KEY) return null;

  const base =
    network === 'devnet' ? 'https://devnet.helius-rpc.com/' : 'https://mainnet.helius-rpc.com/';
  return `${base}?api-key=${encodeURIComponent(HELIUS_API_KEY)}`;
}

export interface NetworkConfig {
  name: SolanaNetwork;
  rpcUrl: string;
  fallbackRpcUrls: string[];
  explorerUrl: string;
}

export const NETWORK_CONFIGS: Record<SolanaNetwork, NetworkConfig> = {
  'mainnet-beta': {
    name: 'mainnet-beta',

    rpcUrl: getHeliusRpcUrl('mainnet-beta') ?? 'https://rpc.ankr.com/solana',
    fallbackRpcUrls: ['https://rpc.ankr.com/solana', 'https://solana-mainnet.rpc.extrnode.com'],
    explorerUrl: 'https://explorer.solana.com',
  },
  devnet: {
    name: 'devnet',

    rpcUrl: getHeliusRpcUrl('devnet') ?? 'https://rpc.ankr.com/solana_devnet',
    fallbackRpcUrls: ['https://rpc.ankr.com/solana_devnet'],
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
  },
};

export type WalletLockState = 'locked' | 'unlocked' | 'uninitialized';

export type ChainType = 'solana' | 'evm';

export type EVMChainId = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';

export type NetworkEnvironment = 'mainnet' | 'testnet';

export interface WalletState {
  lockState: WalletLockState;

  publicAddress: string | null;

  network: SolanaNetwork;

  activeWalletId: string | null;

  activeWalletLabel: string | null;

  activeAccountId: string | null;

  activeAccountName: string | null;

  walletCount: number;

  accountCount: number;

  activeChain: ChainType;

  activeEVMChain: EVMChainId | null;

  evmAddress: string | null;

  networkEnvironment: NetworkEnvironment;

  isWatchOnly: boolean;
}

export const MAX_RECENT_RECIPIENTS = 10;

export type RecentRecipientChainId = string;

export interface RecentRecipient {
  address: string;

  label?: string;

  lastUsedAt: number;

  useCount: number;
}

export type RecentRecipientsMap = Record<RecentRecipientChainId, RecentRecipient[]>;

export interface WalletSettings {
  network: SolanaNetwork;

  customRpcUrl?: string;

  autoLockMinutes: number;

  customTokens?: CustomToken[];

  hiddenTokens?: string[];

  activeChain?: ChainType;

  activeEVMChain?: EVMChainId | null;

  networkEnvironment?: NetworkEnvironment;

  customEVMTokens?: Partial<Record<EVMChainId, string[]>>;

  recentRecipients?: RecentRecipientsMap;
}

export const DEFAULT_WALLET_SETTINGS: WalletSettings = {
  network: 'mainnet-beta',
  autoLockMinutes: 15,
  customTokens: [],
  activeChain: 'solana',
  activeEVMChain: 'ethereum',
  networkEnvironment: 'mainnet',
  recentRecipients: {},
};

export interface RpcEndpointHealth {
  url: string;

  latencyMs: number;

  lastSuccess: number;

  lastFailure: number | null;

  failureCount: number;

  successCount: number;
}

export const DEFAULT_RPC_HEALTH: Record<string, RpcEndpointHealth> = {};

export interface EncryptedVault {
  salt: string;

  iv: string;

  ciphertext: string;

  publicKey: string;

  version: number;

  createdAt: number;
}

export const VAULT_VERSION = 1;
export const MULTI_WALLET_VAULT_VERSION = 2;

export const MAX_WALLETS = 100;

export const MAX_WALLET_LABEL_LENGTH = 32;

export interface WalletEntry {
  id: string;

  label: string;

  publicKey: string;

  evmAddress?: string;

  createdAt: number;

  derivationIndex: number;
}

export interface MultiWalletVault {
  version: 2;

  activeWalletId: string | null;

  wallets: WalletEntry[];

  masterSalt: string;

  masterVerifier: string;

  createdAt: number;
}

export interface EncryptedWalletData {
  [walletId: string]: {
    salt: string;

    iv: string;

    ciphertext: string;
  };
}

export const DEFAULT_MULTI_WALLET_VAULT: Omit<MultiWalletVault, 'masterSalt' | 'masterVerifier'> = {
  version: 2,
  activeWalletId: null,
  wallets: [],
  createdAt: 0,
};

export const HD_WALLET_VAULT_VERSION = 3;

export const MAX_ACCOUNTS_PER_WALLET = 20;

export const MAX_ACCOUNT_NAME_LENGTH = 32;

export type EVMDerivationPathType = 'standard' | 'ledger-live';

export type SolanaDerivationPathType = 'standard' | 'legacy';

export interface DerivedAccount {
  id: string;

  name: string;

  index: number;

  solanaAddress: string;

  evmAddress: string;

  createdAt: number;
}

export interface WatchOnlyAccount {
  id: string;

  name: string;

  chainType: 'solana' | 'evm';

  address: string;

  createdAt: number;
}

export interface WalletEntryV3 {
  id: string;

  label: string;

  accounts: DerivedAccount[];

  evmPathType: EVMDerivationPathType;

  solanaPathType: SolanaDerivationPathType;

  nextAccountIndex: number;

  createdAt: number;
}

export interface MultiWalletVaultV3 {
  version: 3;

  activeWalletId: string | null;

  activeAccountId: string | null;

  wallets: WalletEntryV3[];

  watchOnlyAccounts: WatchOnlyAccount[];

  masterSalt: string;

  masterVerifier: string;

  createdAt: number;
}

export interface UnsignedTransaction {
  serializedTransaction: string;

  description: string;

  estimatedFee: number;
}

export interface SignedTransaction {
  signedTransaction: string;

  signature: string;
}

export interface WalletBalance {
  lamports: number;

  sol: number;

  lastUpdated: number;
}

export const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

export const MNEMONIC_WORD_COUNT = 24;

export const PBKDF2_ITERATIONS_V1 = 100000;
export const PBKDF2_ITERATIONS_V2 = 310000;

export const PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_V2;

export type KdfVersion = 1 | 2;

export const SALT_LENGTH = 32;

export const IV_LENGTH = 12;

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

  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_TIMEOUT = 'TRANSACTION_TIMEOUT',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',

  MAX_WALLETS_REACHED = 'MAX_WALLETS_REACHED',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  INVALID_WALLET_LABEL = 'INVALID_WALLET_LABEL',
  CANNOT_DELETE_LAST_WALLET = 'CANNOT_DELETE_LAST_WALLET',
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',

  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  ADDRESS_ALREADY_EXISTS = 'ADDRESS_ALREADY_EXISTS',
  CANNOT_DELETE_LAST_ACCOUNT = 'CANNOT_DELETE_LAST_ACCOUNT',
  MAX_ACCOUNTS_REACHED = 'MAX_ACCOUNTS_REACHED',
  INVALID_ACCOUNT_NAME = 'INVALID_ACCOUNT_NAME',
}

export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export type WalletMessageType =
  | 'WALLET_CREATE'
  | 'WALLET_IMPORT'
  | 'WALLET_UNLOCK'
  | 'WALLET_LOCK'
  | 'WALLET_EXISTS'
  | 'WALLET_GET_STATE'
  | 'WALLET_DELETE'
  | 'WALLET_LIST'
  | 'WALLET_ADD'
  | 'WALLET_IMPORT_ADD'
  | 'WALLET_SWITCH'
  | 'WALLET_RENAME'
  | 'WALLET_DELETE_ONE'
  | 'WALLET_EXPORT_ONE'
  | 'WALLET_GET_ACTIVE'
  | 'WALLET_GET_BALANCE'
  | 'WALLET_GET_ADDRESS'
  | 'WALLET_GET_ADDRESS_QR'
  | 'WALLET_SET_NETWORK'
  | 'WALLET_GET_NETWORK'
  | 'WALLET_GET_NETWORK_STATUS'
  | 'WALLET_SIGN_TRANSACTION'
  | 'WALLET_SIGN_MESSAGE'
  | 'WALLET_GET_SETTINGS'
  | 'WALLET_SET_SETTINGS'
  | 'WALLET_SEND_SOL'
  | 'WALLET_SEND_SPL_TOKEN'
  | 'WALLET_ESTIMATE_FEE'
  | 'WALLET_GET_HISTORY'
  | 'WALLET_GET_TOKENS'
  | 'WALLET_ADD_TOKEN'
  | 'WALLET_REMOVE_TOKEN'
  | 'WALLET_GET_POPULAR_TOKENS'
  | 'WALLET_GET_TOKEN_METADATA'
  | 'WALLET_GET_RPC_HEALTH'
  | 'WALLET_ADD_RPC'
  | 'WALLET_REMOVE_RPC'
  | 'WALLET_TEST_RPC'
  | 'WALLET_SET_CHAIN'
  | 'WALLET_SET_EVM_CHAIN'
  | 'WALLET_GET_EVM_BALANCE'
  | 'WALLET_SEND_ETH'
  | 'WALLET_SEND_ERC20'
  | 'WALLET_GET_EVM_TOKENS'
  | 'WALLET_GET_EVM_HISTORY'
  | 'WALLET_ESTIMATE_EVM_FEE'
  | 'WALLET_GET_EVM_ADDRESS'
  | 'EVM_GET_PENDING_TXS'
  | 'EVM_SPEED_UP_TX'
  | 'EVM_CANCEL_TX'
  | 'EVM_GET_GAS_PRESETS'
  | 'EVM_ESTIMATE_REPLACEMENT_FEE'
  | 'WALLET_GET_ALLOWANCES'
  | 'WALLET_ESTIMATE_REVOKE_FEE'
  | 'WALLET_REVOKE_ALLOWANCE'
  | 'WALLET_IMPORT_PRIVATE_KEY'
  | 'WALLET_EXPORT_PRIVATE_KEY'
  // Jupiter Swap
  | 'WALLET_SWAP_QUOTE'
  | 'WALLET_SWAP_EXECUTE'
  | 'WALLET_SWAP_AVAILABLE'
  | 'WALLET_SWAP_REFERRAL_STATUS';

export interface WalletMessagePayloads {
  WALLET_CREATE: { password: string };
  WALLET_IMPORT: { mnemonic: string; password: string };
  WALLET_UNLOCK: { password: string };
  WALLET_LOCK: undefined;
  WALLET_EXISTS: undefined;
  WALLET_GET_STATE: undefined;
  WALLET_DELETE: { password: string };

  WALLET_LIST: undefined;
  WALLET_ADD: { password?: string; label?: string };
  WALLET_IMPORT_ADD: { mnemonic: string; password?: string; label?: string };
  WALLET_SWITCH: { walletId: string; password?: string };
  WALLET_RENAME: { walletId: string; label: string };
  WALLET_DELETE_ONE: { walletId: string; password: string };
  WALLET_EXPORT_ONE: { walletId: string; password: string };
  WALLET_GET_ACTIVE: undefined;

  WALLET_GET_BALANCE: { forceRefresh?: boolean };
  WALLET_GET_ADDRESS: undefined;
  WALLET_GET_ADDRESS_QR: { size?: number };
  WALLET_SET_NETWORK: { network: SolanaNetwork };
  WALLET_GET_NETWORK: undefined;
  WALLET_GET_NETWORK_STATUS: undefined;
  WALLET_SIGN_TRANSACTION: { serializedTransaction: string };
  WALLET_SIGN_MESSAGE: { message: string };
  WALLET_GET_SETTINGS: undefined;
  WALLET_SET_SETTINGS: Partial<WalletSettings>;

  WALLET_SEND_SOL: SendTransactionParams;
  WALLET_SEND_SPL_TOKEN: {
    recipient: string;
    amount: number;
    mint: string;
    decimals: number;
    tokenAccount?: string;
  };
  WALLET_ESTIMATE_FEE: { recipient: string; amountSol: number };

  WALLET_GET_HISTORY: { limit?: number; before?: string; forceRefresh?: boolean };

  WALLET_GET_TOKENS: { forceRefresh?: boolean };
  WALLET_ADD_TOKEN: { mint: string; symbol?: string; name?: string; logoUri?: string };
  WALLET_REMOVE_TOKEN: { mint: string };
  WALLET_GET_POPULAR_TOKENS: { chainType?: 'solana' | 'evm' } | undefined;
  WALLET_GET_TOKEN_METADATA: { mint: string };

  WALLET_GET_RPC_HEALTH: undefined;
  WALLET_ADD_RPC: { network: SolanaNetwork; url: string };
  WALLET_REMOVE_RPC: { network: SolanaNetwork; url: string };
  WALLET_TEST_RPC: { url: string };

  WALLET_SET_CHAIN: { chain: ChainType; evmChainId?: EVMChainId | null };
  WALLET_SET_EVM_CHAIN: { evmChainId: EVMChainId };
  WALLET_GET_EVM_BALANCE: { evmChainId?: EVMChainId | null };
  WALLET_SEND_ETH: EVMSendParams;
  WALLET_SEND_ERC20: EVMTokenSendParams;
  WALLET_GET_EVM_TOKENS: { evmChainId?: EVMChainId | null; forceRefresh?: boolean };
  WALLET_GET_EVM_HISTORY: { evmChainId?: EVMChainId | null; limit?: number };
  WALLET_ESTIMATE_EVM_FEE: {
    evmChainId?: EVMChainId | null;
    recipient: string;
    amount: string;
    tokenAddress?: string;
  };
  WALLET_GET_EVM_ADDRESS: undefined;

  EVM_GET_PENDING_TXS: { evmChainId?: EVMChainId; address?: string };
  EVM_SPEED_UP_TX: {
    txHash: string;
    bumpPercent?: number;
    customMaxFeePerGas?: string;
    customMaxPriorityFeePerGas?: string;
  };
  EVM_CANCEL_TX: { txHash: string; bumpPercent?: number };
  EVM_GET_GAS_PRESETS: { evmChainId: EVMChainId; txHash: string };
  EVM_ESTIMATE_REPLACEMENT_FEE: { txHash: string; bumpPercent?: number };

  WALLET_GET_ALLOWANCES: { evmChainId: EVMChainId; forceRefresh?: boolean };
  WALLET_ESTIMATE_REVOKE_FEE: {
    evmChainId: EVMChainId;
    tokenAddress: string;
    spenderAddress: string;
  };
  WALLET_REVOKE_ALLOWANCE: { evmChainId: EVMChainId; tokenAddress: string; spenderAddress: string };

  WALLET_IMPORT_PRIVATE_KEY: { privateKey: string; password?: string; label?: string };
  WALLET_EXPORT_PRIVATE_KEY: { walletId: string; password: string; chain: 'solana' | 'evm' };
  // Jupiter Swap
  WALLET_SWAP_QUOTE: {
    inputMint: string;
    outputMint: string;
    inputAmount: string;
    inputDecimals: number;
    outputDecimals: number;
    slippageBps?: number;
  };
  WALLET_SWAP_EXECUTE: {
    inputMint: string;
    outputMint: string;
    inputAmount: string;
    inputDecimals: number;
    slippageBps?: number;
  };
  WALLET_SWAP_AVAILABLE: undefined;
  WALLET_SWAP_REFERRAL_STATUS: undefined;
}

export interface WalletMessageResponses {
  WALLET_CREATE: { mnemonic: string; publicAddress: string; walletId: string };
  WALLET_IMPORT: { publicAddress: string; walletId: string };
  WALLET_UNLOCK: { publicAddress: string };
  WALLET_LOCK: void;
  WALLET_EXISTS: boolean;
  WALLET_GET_STATE: WalletState;
  WALLET_DELETE: void;

  WALLET_LIST: WalletEntry[];
  WALLET_ADD: { mnemonic: string; publicAddress: string; walletId: string };
  WALLET_IMPORT_ADD: { publicAddress: string; walletId: string };
  WALLET_SWITCH: { publicAddress: string; walletId: string };
  WALLET_RENAME: void;
  WALLET_DELETE_ONE: void;
  WALLET_EXPORT_ONE: { mnemonic: string };
  WALLET_GET_ACTIVE: {
    walletId: string | null;
    publicAddress: string | null;
    label: string | null;
  };

  WALLET_GET_BALANCE: WalletBalance;
  WALLET_GET_ADDRESS: string;
  WALLET_GET_ADDRESS_QR: string;
  WALLET_SET_NETWORK: void;
  WALLET_GET_NETWORK: SolanaNetwork;
  WALLET_GET_NETWORK_STATUS: { connected: boolean; latency: number };
  WALLET_SIGN_TRANSACTION: SignedTransaction;
  WALLET_SIGN_MESSAGE: { signature: string };
  WALLET_GET_SETTINGS: WalletSettings;
  WALLET_SET_SETTINGS: void;

  WALLET_SEND_SOL: SendTransactionResult;
  WALLET_SEND_SPL_TOKEN: SendTransactionResult;
  WALLET_ESTIMATE_FEE: FeeEstimate;
  WALLET_GET_HISTORY: TransactionHistoryResult;
  WALLET_GET_TOKENS: SPLTokenBalance[];
  WALLET_ADD_TOKEN: void;
  WALLET_REMOVE_TOKEN: void;

  WALLET_GET_RPC_HEALTH: RpcHealthSummary;
  WALLET_ADD_RPC: { success: boolean; error?: string };
  WALLET_REMOVE_RPC: void;
  WALLET_TEST_RPC: { success: boolean; latencyMs?: number; blockHeight?: number; error?: string };

  WALLET_SET_CHAIN: void;
  WALLET_SET_EVM_CHAIN: void;
  WALLET_GET_EVM_BALANCE: EVMBalance;
  WALLET_SEND_ETH: EVMTransactionResult;
  WALLET_SEND_ERC20: EVMTransactionResult;
  WALLET_GET_EVM_TOKENS: EVMTokenBalance[];
  WALLET_GET_EVM_HISTORY: { transactions: any[]; hasMore: boolean };
  WALLET_ESTIMATE_EVM_FEE: EVMFeeEstimate;
  WALLET_GET_EVM_ADDRESS: string;

  EVM_GET_PENDING_TXS: EVMPendingTxInfo[];
  EVM_SPEED_UP_TX: EVMTransactionResult;
  EVM_CANCEL_TX: EVMTransactionResult;
  EVM_GET_GAS_PRESETS: EVMGasPresets;
  EVM_ESTIMATE_REPLACEMENT_FEE: EVMReplacementFeeEstimate;

  WALLET_GET_ALLOWANCES: EVMAllowanceDiscoveryResult;
  WALLET_ESTIMATE_REVOKE_FEE: EVMRevokeFeeEstimate;
  WALLET_REVOKE_ALLOWANCE: EVMTransactionResult;

  WALLET_IMPORT_PRIVATE_KEY: { publicAddress: string; evmAddress: string; walletId: string };
  WALLET_EXPORT_PRIVATE_KEY: { privateKey: string };
  // Jupiter Swap
  WALLET_SWAP_QUOTE: SwapQuoteResult;
  WALLET_SWAP_EXECUTE: SwapExecuteResult;
  WALLET_SWAP_AVAILABLE: boolean;
  WALLET_SWAP_REFERRAL_STATUS: SwapReferralStatus;
}

export interface RpcHealthSummary {
  endpoints: (RpcEndpointHealth & { score: number; isCustom: boolean })[];
  bestEndpoint: string;
  healthyCount: number;
  unhealthyCount: number;
}

// Jupiter Swap Types
export interface SwapQuoteResult {
  /** Input token mint address */
  inputMint: string;
  /** Output token mint address */
  outputMint: string;
  /** Input amount in smallest units */
  inputAmount: string;
  /** Output amount in smallest units */
  outputAmount: string;
  /** Formatted input amount for display */
  inputAmountFormatted: string;
  /** Formatted output amount for display */
  outputAmountFormatted: string;
  /** Minimum received amount considering slippage */
  minimumReceivedFormatted: string;
  /** Price impact percentage */
  priceImpact: string;
  /** Platform fee if referral is enabled */
  platformFeeFormatted: string | null;
  /** Route description (e.g., "Raydium → Orca") */
  route: string;
  /** Raw quote data for execution */
  rawQuote: unknown;
}

export interface SwapExecuteResult {
  /** Transaction signature */
  signature: string;
  /** Explorer URL for the transaction */
  explorerUrl: string;
  /** Input amount in smallest units */
  inputAmount: string;
  /** Output amount in smallest units */
  outputAmount: string;
  /** Input token mint */
  inputMint: string;
  /** Output token mint */
  outputMint: string;
}

export interface SwapReferralStatus {
  /** Whether referral fees are enabled */
  enabled: boolean;
  /** Fee in basis points (e.g., 50 = 0.5%) */
  feeBps: number;
  /** Referral account public key if configured */
  referralAccount: string | null;
}

export type TransactionDirection = 'sent' | 'received' | 'unknown';

export type TransactionStatus = 'confirmed' | 'pending' | 'failed';

export interface SendTransactionParams {
  recipient: string;

  amountSol: number;

  memo?: string;
}

export interface SendTransactionResult {
  signature: string;

  explorerUrl: string;
}

export interface FeeEstimate {
  feeLamports: number;

  feeSol: number;

  priorityFee: number;
}

export interface TransactionHistoryItem {
  signature: string;

  timestamp: number | null;

  direction: TransactionDirection;

  amountLamports: number;

  amountSol: number;

  status: TransactionStatus;

  feeLamports: number;

  counterparty: string | null;

  type: string;

  slot: number;

  tokenInfo?: {
    mint: string;

    symbol?: string;

    name?: string;

    decimals: number;

    amount: number;

    logoUri?: string;
  };
}

export interface TransactionHistoryResult {
  transactions: TransactionHistoryItem[];

  hasMore: boolean;

  cursor: string | null;
}

export interface SPLTokenBalance {
  mint: string;

  symbol: string;

  name: string;

  decimals: number;

  rawBalance: string;

  uiBalance: number;

  tokenAccount: string;

  logoUri?: string;
}

export interface CustomToken {
  mint: string;

  symbol?: string;

  name?: string;

  logoUri?: string;

  addedAt: number;
}

export interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

export const DEFAULT_TOKEN_LIST: TokenMetadata[] = [
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUri:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
  },
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'wSOL',
    name: 'Wrapped SOL',
    decimals: 9,
    logoUri:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade staked SOL',
    decimals: 9,
    logoUri:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
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

export interface EVMSendParams {
  recipient: string;

  amount: string;

  evmChainId?: EVMChainId | null;
}

export interface EVMTokenSendParams {
  recipient: string;

  tokenAddress: string;

  amount: string;

  decimals: number;

  evmChainId?: EVMChainId;
}

export interface EVMBalance {
  wei: string;

  formatted: number;

  symbol: string;

  lastUpdated: number;
}

export interface EVMTokenBalance {
  address: string;

  symbol: string;

  name: string;

  decimals: number;

  rawBalance: string;

  uiBalance: number;

  logoUri?: string;
}

export interface EVMFeeEstimate {
  gasLimit: string;

  gasPriceGwei: number;

  totalFeeEth: number;

  totalFeeWei: string;

  l1DataFee?: string;

  isEIP1559: boolean;
}

export interface EVMTransactionResult {
  hash: string;

  explorerUrl: string;

  confirmed: boolean;

  error?: string;
}

export interface ChainDisplayInfo {
  type: ChainType;

  evmChainId?: EVMChainId;

  name: string;

  symbol: string;

  icon: string;

  isTestnet: boolean;
}

export const SUPPORTED_CHAINS: ChainDisplayInfo[] = [
  { type: 'solana', name: 'Solana', symbol: 'SOL', icon: 'solana', isTestnet: false },
  {
    type: 'evm',
    evmChainId: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    icon: 'ethereum',
    isTestnet: false,
  },
  {
    type: 'evm',
    evmChainId: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    icon: 'polygon',
    isTestnet: false,
  },
  {
    type: 'evm',
    evmChainId: 'arbitrum',
    name: 'Arbitrum',
    symbol: 'ETH',
    icon: 'arbitrum',
    isTestnet: false,
  },
  {
    type: 'evm',
    evmChainId: 'optimism',
    name: 'Optimism',
    symbol: 'ETH',
    icon: 'optimism',
    isTestnet: false,
  },
  { type: 'evm', evmChainId: 'base', name: 'Base', symbol: 'ETH', icon: 'base', isTestnet: false },
];

export const MULTI_CHAIN_VAULT_VERSION = 3;

export type EVMPendingTxStatus = 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced';

export interface EVMPendingTxInfo {
  hash: string;

  nonce: number;

  chainId: EVMChainId;

  from: string;

  to: string;

  valueFormatted: string;

  maxFeeGwei: number;

  maxPriorityFeeGwei: number;

  submittedAt: number;

  status: EVMPendingTxStatus;

  testnet: boolean;

  explorerUrl: string;

  replacedBy?: string;

  errorReason?: string;
}

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

export interface EVMReplacementFeeEstimate {
  maxFeeGwei: number;

  maxPriorityFeeGwei: number;

  minimumMaxFeeGwei: number;

  networkMaxFeeGwei: number;

  costDifferenceEth: number;

  percentIncrease: number;

  exceedsWarning: boolean;

  warning?: string;
}

export interface EVMTokenAllowance {
  tokenAddress: string;

  tokenSymbol: string;

  tokenName: string;

  tokenDecimals: number;

  tokenLogoUri?: string;

  spenderAddress: string;

  spenderLabel?: string;

  spenderVerified?: boolean;

  allowanceRaw: string;

  allowanceFormatted: number;

  isInfinite: boolean;

  lastUpdated: number;
}

export interface EVMAllowanceDiscoveryResult {
  allowances: EVMTokenAllowance[];

  fromCache: boolean;

  fetchedAt: number;
}

export interface EVMRevokeFeeEstimate {
  gasLimit: string;

  totalFeeWei: string;

  totalFeeFormatted: number;
}

export type EVMAllowanceEntry = EVMTokenAllowance;
