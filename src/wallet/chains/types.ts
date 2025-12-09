

export type ChainType = 'solana' | 'evm';


export type EVMChainId = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';


export type NetworkEnvironment = 'mainnet' | 'testnet';


export interface ChainIdentifier {
  type: ChainType;
  
  evmChainId?: EVMChainId;
}


export type L2Type = 'optimism' | 'arbitrum';


export interface NetworkConfig {
  chainId: number;
  rpcUrls: string[];
}


export interface EVMChainConfig {
  
  chainId: number;
  
  name: string;
  
  symbol: string;
  
  decimals: number;
  
  rpcUrls: string[];
  
  testnet: NetworkConfig;
  
  explorer: string;
  
  isL2: boolean;
  
  l2Type?: L2Type;
}


export interface SolanaChainConfig {
  name: 'mainnet-beta' | 'devnet';
  rpcUrl: string;
  fallbackRpcUrls: string[];
  explorerUrl: string;
}


export interface ChainKeypair {
  
  chainType: ChainType;
  
  address: string;
  
  privateKey: Uint8Array | string;
  
  _raw?: unknown;
}


export interface DerivationInfo {
  
  path: string;
  
  index: number;
}


export interface ChainBalance {
  
  raw: bigint;
  
  formatted: number;
  
  symbol: string;
  
  decimals: number;
  
  lastUpdated: number;
}


export interface TokenBalance {
  
  address: string;
  
  symbol: string;
  
  name: string;
  
  decimals: number;
  
  rawBalance: string;
  
  uiBalance: number;
  
  logoUri?: string;
}


export type TxDirection = 'sent' | 'received' | 'self' | 'unknown';


export type TxStatus = 'pending' | 'confirmed' | 'failed';


export interface UnsignedChainTx {
  
  chainType: ChainType;
  
  evmChainId?: EVMChainId;
  
  to: string;
  
  amount: bigint;
  
  tokenAddress?: string;
  
  data?: string;
  
  _raw?: unknown;
}


export interface SignedChainTx {
  
  chainType: ChainType;
  
  serialized: string;
  
  hash: string;
  
  _raw?: unknown;
}


export interface TxResult {
  
  hash: string;
  
  explorerUrl: string;
  
  confirmed: boolean;
  
  error?: string;
}


export interface ChainTxHistoryItem {
  
  hash: string;
  
  timestamp: number | null;
  
  direction: TxDirection;
  
  amount: bigint;
  
  amountFormatted: number;
  
  symbol: string;
  
  status: TxStatus;
  
  fee: bigint;
  
  counterparty: string | null;
  
  type: string;
  
  block: number;
}


export interface ChainFeeEstimate {
  
  fee: bigint;
  
  feeFormatted: number;
  
  symbol: string;
  
  gasPrice?: bigint;
  
  gasLimit?: bigint;
  
  l1DataFee?: bigint;
  
  priorityFee?: bigint;
}


export interface NetworkStatus {
  
  connected: boolean;
  
  latencyMs: number;
  
  blockHeight: number | null;
  
  rpcUrl: string;
}


export interface ChainAdapter {
  
  
  readonly chainType: ChainType;
  
  
  readonly evmChainId?: EVMChainId;
  
  
  readonly chainName: string;
  
  
  readonly nativeSymbol: string;
  
  
  readonly network: NetworkEnvironment;
  
  
  deriveAddress(mnemonic: string, index?: number): Promise<string>;
  
  
  getKeypair(mnemonic: string, index?: number): Promise<ChainKeypair>;
  
  
  isValidAddress(address: string): boolean;
  
  
  getBalance(address: string): Promise<ChainBalance>;
  
  
  getTokenBalances(address: string): Promise<TokenBalance[]>;
  
  
  createTransfer(from: string, to: string, amount: bigint): Promise<UnsignedChainTx>;
  
  
  createTokenTransfer(
    from: string,
    to: string,
    tokenAddress: string,
    amount: bigint
  ): Promise<UnsignedChainTx>;
  
  
  estimateFee(tx: UnsignedChainTx): Promise<ChainFeeEstimate>;
  
  
  signTransaction(tx: UnsignedChainTx, keypair: ChainKeypair): Promise<SignedChainTx>;
  
  
  broadcastTransaction(signedTx: SignedChainTx): Promise<TxResult>;
  
  
  getTransactionHistory(
    address: string,
    limit?: number,
    before?: string
  ): Promise<{ transactions: ChainTxHistoryItem[]; hasMore: boolean; cursor: string | null }>;
  
  
  getNetworkStatus(): Promise<NetworkStatus>;
  
  
  setNetwork(network: NetworkEnvironment): void;
  
  
  getAddressExplorerUrl(address: string): string;
  
  
  getTxExplorerUrl(hash: string): string;
}


export type ChainAdapterFactory = (
  chainId?: EVMChainId,
  network?: NetworkEnvironment
) => ChainAdapter;


export enum ChainErrorCode {
  
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_GAS = 'INSUFFICIENT_GAS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  SIGNING_FAILED = 'SIGNING_FAILED',
  BROADCAST_FAILED = 'BROADCAST_FAILED',
  
  
  INVALID_CHAIN = 'INVALID_CHAIN',
  CHAIN_MISMATCH = 'CHAIN_MISMATCH',
  UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
  
  
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
}


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

