/**
 * AINTIVIRUS Wallet - Multi-Chain Types and Interfaces
 * 
 * This module defines the chain abstraction layer that allows
 * the wallet to support multiple blockchain networks.
 * 
 * SECURITY:
 * - Chain adapters must verify chainId before signing
 * - Private keys must never leave the adapter context
 * - All operations must be chain-context aware
 */

// ============================================
// CHAIN IDENTIFICATION
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
 * Network environment
 */
export type NetworkEnvironment = 'mainnet' | 'testnet';

/**
 * Full chain identifier combining type and specific chain
 */
export interface ChainIdentifier {
  type: ChainType;
  /** For EVM chains, specifies which network */
  evmChainId?: EVMChainId;
}

// ============================================
// CHAIN CONFIGURATION
// ============================================

/**
 * L2 chain type for gas estimation
 * Note: Base uses OP Stack, so it's classified as 'optimism' for fee calculation
 */
export type L2Type = 'optimism' | 'arbitrum';

/**
 * Network-specific configuration
 */
export interface NetworkConfig {
  chainId: number;
  rpcUrls: string[];
}

/**
 * EVM chain configuration
 */
export interface EVMChainConfig {
  /** Numeric chain ID (EIP-155) */
  chainId: number;
  /** Human-readable chain name */
  name: string;
  /** Native token symbol */
  symbol: string;
  /** Native token decimals (usually 18) */
  decimals: number;
  /** Primary and fallback RPC URLs */
  rpcUrls: string[];
  /** Testnet configuration */
  testnet: NetworkConfig;
  /** Block explorer URL */
  explorer: string;
  /** Whether this is an L2 chain */
  isL2: boolean;
  /** L2 type for fee calculation */
  l2Type?: L2Type;
}

/**
 * Solana network configuration
 */
export interface SolanaChainConfig {
  name: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
  fallbackRpcUrls: string[];
  explorerUrl: string;
}

// ============================================
// ACCOUNT & KEY TYPES
// ============================================

/**
 * Chain-agnostic keypair representation
 * 
 * SECURITY: Contains private key material - handle with extreme care
 */
export interface ChainKeypair {
  /** Chain type this keypair belongs to */
  chainType: ChainType;
  /** Public address (base58 for Solana, 0x-prefixed hex for EVM) */
  address: string;
  /** Private key bytes - SENSITIVE */
  privateKey: Uint8Array | string;
  /** Original keypair object (Solana Keypair or ethers Wallet) */
  _raw?: unknown;
}

/**
 * Derivation path information
 */
export interface DerivationInfo {
  /** BIP-44 path */
  path: string;
  /** Account index in HD derivation */
  index: number;
}

// ============================================
// BALANCE TYPES
// ============================================

/**
 * Native token balance
 */
export interface ChainBalance {
  /** Balance in smallest unit (lamports/wei) */
  raw: bigint;
  /** Balance in standard units (SOL/ETH) */
  formatted: number;
  /** Token symbol */
  symbol: string;
  /** Decimal places */
  decimals: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Token balance (SPL or ERC-20)
 */
export interface TokenBalance {
  /** Token contract/mint address */
  address: string;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Raw balance */
  rawBalance: string;
  /** UI-friendly balance */
  uiBalance: number;
  /** Logo URI (optional) */
  logoUri?: string;
}

// ============================================
// TRANSACTION TYPES
// ============================================

/**
 * Transaction direction
 */
export type TxDirection = 'sent' | 'received' | 'self' | 'unknown';

/**
 * Transaction status
 */
export type TxStatus = 'pending' | 'confirmed' | 'failed';

/**
 * Unsigned transaction (chain-agnostic wrapper)
 */
export interface UnsignedChainTx {
  /** Chain this transaction is for */
  chainType: ChainType;
  /** For EVM: specific chain ID */
  evmChainId?: EVMChainId;
  /** Recipient address */
  to: string;
  /** Amount in smallest units */
  amount: bigint;
  /** Token address (null for native transfers) */
  tokenAddress?: string;
  /** Additional data (contract calls, memo) */
  data?: string;
  /** Raw transaction object */
  _raw?: unknown;
}

/**
 * Signed transaction ready for broadcast
 */
export interface SignedChainTx {
  /** Chain type */
  chainType: ChainType;
  /** Serialized signed transaction */
  serialized: string;
  /** Transaction hash/signature */
  hash: string;
  /** Raw signed transaction object */
  _raw?: unknown;
}

/**
 * Transaction broadcast result
 */
export interface TxResult {
  /** Transaction hash/signature */
  hash: string;
  /** Explorer URL */
  explorerUrl: string;
  /** Whether confirmation was received */
  confirmed: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Transaction history item
 */
export interface ChainTxHistoryItem {
  /** Transaction hash/signature */
  hash: string;
  /** Block timestamp (Unix seconds) */
  timestamp: number | null;
  /** Transaction direction */
  direction: TxDirection;
  /** Amount in smallest units */
  amount: bigint;
  /** Amount formatted */
  amountFormatted: number;
  /** Token symbol */
  symbol: string;
  /** Status */
  status: TxStatus;
  /** Fee paid */
  fee: bigint;
  /** Counterparty address */
  counterparty: string | null;
  /** Transaction type description */
  type: string;
  /** Block number/slot */
  block: number;
}

// ============================================
// FEE ESTIMATION
// ============================================

/**
 * Fee estimate for a transaction
 */
export interface ChainFeeEstimate {
  /** Estimated fee in smallest units */
  fee: bigint;
  /** Estimated fee formatted */
  feeFormatted: number;
  /** Fee token symbol */
  symbol: string;
  /** For EVM: gas price in gwei */
  gasPrice?: bigint;
  /** For EVM: estimated gas limit */
  gasLimit?: bigint;
  /** For EVM L2: L1 data fee */
  l1DataFee?: bigint;
  /** Priority/tip fee */
  priorityFee?: bigint;
}

// ============================================
// NETWORK STATUS
// ============================================

/**
 * Network connectivity status
 */
export interface NetworkStatus {
  /** Whether connected to RPC */
  connected: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Current block height/slot */
  blockHeight: number | null;
  /** Active RPC URL */
  rpcUrl: string;
}

// ============================================
// CHAIN ADAPTER INTERFACE
// ============================================

/**
 * Chain Adapter Interface
 * 
 * Implementations must provide all blockchain operations for a specific chain.
 * This abstraction allows the wallet to support multiple chains with consistent API.
 * 
 * SECURITY REQUIREMENTS:
 * - Never expose private keys outside the adapter
 * - Always verify chainId before signing
 * - Validate all addresses before operations
 * - Clear sensitive data from memory after use
 */
export interface ChainAdapter {
  // ---- Identification ----
  
  /** Chain type (solana or evm) */
  readonly chainType: ChainType;
  
  /** For EVM: specific chain identifier */
  readonly evmChainId?: EVMChainId;
  
  /** Human-readable chain name */
  readonly chainName: string;
  
  /** Native token symbol */
  readonly nativeSymbol: string;
  
  /** Current network environment */
  readonly network: NetworkEnvironment;
  
  // ---- Account Operations ----
  
  /**
   * Derive address from mnemonic
   * 
   * @param mnemonic - BIP-39 mnemonic phrase
   * @param index - Derivation index (default 0)
   * @returns Public address string
   */
  deriveAddress(mnemonic: string, index?: number): Promise<string>;
  
  /**
   * Get keypair from mnemonic for signing
   * 
   * SECURITY: Keypair contains private key - use immediately and discard
   * 
   * @param mnemonic - BIP-39 mnemonic phrase
   * @param index - Derivation index
   * @returns Chain keypair
   */
  getKeypair(mnemonic: string, index?: number): Promise<ChainKeypair>;
  
  /**
   * Validate an address format
   * 
   * @param address - Address to validate
   * @returns True if valid format
   */
  isValidAddress(address: string): boolean;
  
  // ---- Balance Operations ----
  
  /**
   * Get native token balance
   * 
   * @param address - Account address
   * @returns Native balance
   */
  getBalance(address: string): Promise<ChainBalance>;
  
  /**
   * Get token balances (SPL or ERC-20)
   * 
   * @param address - Account address
   * @returns Array of token balances
   */
  getTokenBalances(address: string): Promise<TokenBalance[]>;
  
  // ---- Transaction Operations ----
  
  /**
   * Create unsigned native transfer transaction
   * 
   * @param from - Sender address
   * @param to - Recipient address
   * @param amount - Amount in smallest units
   * @returns Unsigned transaction
   */
  createTransfer(from: string, to: string, amount: bigint): Promise<UnsignedChainTx>;
  
  /**
   * Create unsigned token transfer transaction
   * 
   * @param from - Sender address
   * @param to - Recipient address
   * @param tokenAddress - Token contract/mint address
   * @param amount - Amount in smallest units
   * @returns Unsigned transaction
   */
  createTokenTransfer(
    from: string,
    to: string,
    tokenAddress: string,
    amount: bigint
  ): Promise<UnsignedChainTx>;
  
  /**
   * Estimate transaction fee
   * 
   * @param tx - Unsigned transaction
   * @returns Fee estimate
   */
  estimateFee(tx: UnsignedChainTx): Promise<ChainFeeEstimate>;
  
  /**
   * Sign a transaction
   * 
   * SECURITY: Verifies chainId matches before signing
   * 
   * @param tx - Unsigned transaction
   * @param keypair - Signing keypair
   * @returns Signed transaction
   */
  signTransaction(tx: UnsignedChainTx, keypair: ChainKeypair): Promise<SignedChainTx>;
  
  /**
   * Broadcast signed transaction to network
   * 
   * @param signedTx - Signed transaction
   * @returns Transaction result
   */
  broadcastTransaction(signedTx: SignedChainTx): Promise<TxResult>;
  
  /**
   * Get transaction history
   * 
   * @param address - Account address
   * @param limit - Maximum transactions to return
   * @param before - Cursor for pagination
   * @returns Transaction history
   */
  getTransactionHistory(
    address: string,
    limit?: number,
    before?: string
  ): Promise<{ transactions: ChainTxHistoryItem[]; hasMore: boolean; cursor: string | null }>;
  
  // ---- Network Operations ----
  
  /**
   * Get network connectivity status
   * 
   * @returns Network status
   */
  getNetworkStatus(): Promise<NetworkStatus>;
  
  /**
   * Switch network environment
   * 
   * @param network - Target network
   */
  setNetwork(network: NetworkEnvironment): void;
  
  /**
   * Get explorer URL for address
   * 
   * @param address - Account address
   * @returns Explorer URL
   */
  getAddressExplorerUrl(address: string): string;
  
  /**
   * Get explorer URL for transaction
   * 
   * @param hash - Transaction hash
   * @returns Explorer URL
   */
  getTxExplorerUrl(hash: string): string;
}

// ============================================
// ADAPTER FACTORY TYPE
// ============================================

/**
 * Chain adapter factory function type
 */
export type ChainAdapterFactory = (
  chainId?: EVMChainId,
  network?: NetworkEnvironment
) => ChainAdapter;

// ============================================
// ERROR TYPES
// ============================================

/**
 * Chain-specific error codes
 */
export enum ChainErrorCode {
  // General
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  // Transaction
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_GAS = 'INSUFFICIENT_GAS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  SIGNING_FAILED = 'SIGNING_FAILED',
  BROADCAST_FAILED = 'BROADCAST_FAILED',
  
  // Chain
  INVALID_CHAIN = 'INVALID_CHAIN',
  CHAIN_MISMATCH = 'CHAIN_MISMATCH',
  UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
  
  // Token
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
}

/**
 * Chain error class
 */
export class ChainError extends Error {
  constructor(
    public readonly code: ChainErrorCode,
    message: string,
    public readonly chainType?: ChainType
  ) {
    super(message);
    this.name = 'ChainError';
  }
}



