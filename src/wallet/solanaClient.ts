/**
 * AINTIVIRUS Wallet Module - Solana Client Abstraction
 * 
 * Thin abstraction layer over @solana/web3.js Connection that:
 * - Uses RPC health manager for smart endpoint selection
 * - Provides automatic failover between endpoints
 * - Tracks latency and success/failure rates
 * - Supports user-configured custom endpoints
 * 
 * SECURITY:
 * - Only HTTPS endpoints are used
 * - No API keys are stored or transmitted
 * - Connection state is isolated per-operation
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  Commitment,
} from '@solana/web3.js';
import {
  SolanaNetwork,
  NETWORK_CONFIGS,
  WalletBalance,
  WalletError,
  WalletErrorCode,
} from './types';
import { getWalletSettings } from './storage';
import {
  getBestRpcEndpoint,
  getSortedRpcEndpoints,
  recordRpcSuccess,
  recordRpcFailure,
  getRpcHealthSummary,
} from './rpcHealth';

// ============================================
// CLIENT CONFIGURATION
// ============================================

/**
 * Default commitment level for RPC calls
 * 'confirmed' provides a good balance of speed and reliability
 */
const DEFAULT_COMMITMENT: Commitment = 'confirmed';

/**
 * Timeout for RPC calls in milliseconds
 */
const RPC_TIMEOUT = 30000;

/**
 * Maximum number of retry attempts
 */
const MAX_RETRIES = 3;

// ============================================
// CONNECTION MANAGEMENT
// ============================================

/**
 * Create a new Connection with consistent configuration
 */
function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, {
    commitment: DEFAULT_COMMITMENT,
    confirmTransactionInitialTimeout: RPC_TIMEOUT,
  });
}

/**
 * Execute an RPC operation with automatic failover
 * 
 * @param network - Network to use
 * @param operation - Async operation to perform with connection
 * @param customRpcUrl - Optional override to use a specific endpoint
 * @returns Result of the operation
 */
export async function executeWithFailover<T>(
  network: SolanaNetwork,
  operation: (connection: Connection) => Promise<T>,
  customRpcUrl?: string
): Promise<T> {
  // If custom RPC is specified, try it first
  if (customRpcUrl) {
    try {
      const connection = createConnection(customRpcUrl);
      const startTime = performance.now();
      const result = await operation(connection);
      const latencyMs = Math.round(performance.now() - startTime);
      
      await recordRpcSuccess(customRpcUrl, latencyMs);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await recordRpcFailure(customRpcUrl, errorMessage);
      // Fall through to try other endpoints
    }
  }
  
  // Get sorted endpoints by health
  const endpoints = await getSortedRpcEndpoints(network);
  let lastError: Error | null = null;
  let attempts = 0;
  
  for (const rpcUrl of endpoints) {
    if (attempts >= MAX_RETRIES) {
      break;
    }
    
    // Skip the custom URL if we already tried it
    if (customRpcUrl && rpcUrl === customRpcUrl) {
      continue;
    }
    
    try {
      const connection = createConnection(rpcUrl);
      const startTime = performance.now();
      const result = await operation(connection);
      const latencyMs = Math.round(performance.now() - startTime);
      
      await recordRpcSuccess(rpcUrl, latencyMs);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await recordRpcFailure(rpcUrl, lastError.message);
      attempts++;
      
      console.warn(`[SolanaClient] RPC ${rpcUrl} failed (attempt ${attempts}):`, lastError.message);
    }
  }
  
  // All endpoints failed
  throw new WalletError(
    WalletErrorCode.NETWORK_ERROR,
    `All RPC endpoints failed after ${attempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

// ============================================
// HIGH-LEVEL API
// ============================================

/**
 * Get a Connection for the current network settings
 * Prefers the best healthy endpoint
 */
export async function getConnection(): Promise<Connection> {
  const settings = await getWalletSettings();
  
  // If user has a custom RPC set, use it
  if (settings.customRpcUrl) {
    return createConnection(settings.customRpcUrl);
  }
  
  // Get the best endpoint based on health
  const bestUrl = await getBestRpcEndpoint(settings.network);
  return createConnection(bestUrl);
}

/**
 * Get SOL balance for an address
 */
export async function getBalance(address: string): Promise<WalletBalance> {
  const settings = await getWalletSettings();
  const publicKey = new PublicKey(address);
  
  const lamports = await executeWithFailover(
    settings.network,
    async (connection) => connection.getBalance(publicKey),
    settings.customRpcUrl
  );
  
  return {
    lamports,
    sol: lamports / LAMPORTS_PER_SOL,
    lastUpdated: Date.now(),
  };
}

/**
 * Get network status (connectivity and latency)
 */
export async function getNetworkStatus(): Promise<{
  connected: boolean;
  latency: number;
  blockHeight: number | null;
  endpoint: string;
}> {
  const settings = await getWalletSettings();
  
  try {
    const bestUrl = settings.customRpcUrl || await getBestRpcEndpoint(settings.network);
    const connection = createConnection(bestUrl);
    
    const startTime = performance.now();
    const blockHeight = await connection.getBlockHeight();
    const latency = Math.round(performance.now() - startTime);
    
    await recordRpcSuccess(bestUrl, latency);
    
    return {
      connected: true,
      latency,
      blockHeight,
      endpoint: bestUrl,
    };
  } catch (error) {
    return {
      connected: false,
      latency: -1,
      blockHeight: null,
      endpoint: 'none',
    };
  }
}

/**
 * Get recent blockhash for transaction construction
 */
export async function getRecentBlockhash(): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  const settings = await getWalletSettings();
  
  return executeWithFailover(
    settings.network,
    async (connection) => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      return { blockhash, lastValidBlockHeight };
    },
    settings.customRpcUrl
  );
}

/**
 * Estimate transaction fee
 */
export async function estimateTransactionFee(
  transaction: Transaction | VersionedTransaction
): Promise<number> {
  try {
    const connection = await getConnection();
    
    if (transaction instanceof VersionedTransaction) {
      const fee = await connection.getFeeForMessage(transaction.message);
      return fee.value || 5000;
    }
    
    const { blockhash } = await getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    
    const message = transaction.compileMessage();
    const fee = await connection.getFeeForMessage(message);
    
    return fee.value || 5000;
  } catch (error) {
    // Return default fee estimate if RPC fails
    return 5000; // 0.000005 SOL
  }
}

/**
 * Send a signed transaction
 */
export async function sendTransaction(
  signedTransaction: Transaction | VersionedTransaction
): Promise<string> {
  const settings = await getWalletSettings();
  
  return executeWithFailover(
    settings.network,
    async (connection) => {
      const serialized = signedTransaction.serialize();
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: DEFAULT_COMMITMENT,
      });
      return signature;
    },
    settings.customRpcUrl
  );
}

/**
 * Confirm a transaction
 */
export async function confirmTransaction(
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<boolean> {
  const settings = await getWalletSettings();
  
  try {
    const result = await executeWithFailover(
      settings.network,
      async (connection) => {
        return connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });
      },
      settings.customRpcUrl
    );
    
    return !result.value.err;
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_TIMEOUT,
      'Transaction confirmation timed out'
    );
  }
}

/**
 * Get transaction details
 */
export async function getTransaction(signature: string) {
  const settings = await getWalletSettings();
  
  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    },
    settings.customRpcUrl
  );
}

/**
 * Get multiple transactions
 */
export async function getTransactions(
  address: string,
  options?: { limit?: number; before?: string }
) {
  const settings = await getWalletSettings();
  const publicKey = new PublicKey(address);
  
  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getSignaturesForAddress(publicKey, {
        limit: options?.limit || 20,
        before: options?.before,
      });
    },
    settings.customRpcUrl
  );
}

/**
 * Get token accounts for an address
 */
export async function getTokenAccounts(address: string) {
  const settings = await getWalletSettings();
  const publicKey = new PublicKey(address);
  
  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
    },
    settings.customRpcUrl
  );
}

/**
 * Check if an account exists
 */
export async function accountExists(address: string): Promise<boolean> {
  try {
    const balance = await getBalance(address);
    return balance.lamports > 0;
  } catch {
    return false;
  }
}

/**
 * Get minimum balance for rent exemption
 */
export async function getMinimumBalanceForRentExemption(dataSize: number = 0): Promise<number> {
  const settings = await getWalletSettings();
  
  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getMinimumBalanceForRentExemption(dataSize);
    },
    settings.customRpcUrl
  );
}

// ============================================
// EXPLORER URLS
// ============================================

/**
 * Get explorer URL for an address
 */
export async function getAddressExplorerUrl(address: string): Promise<string> {
  const settings = await getWalletSettings();
  const config = NETWORK_CONFIGS[settings.network];
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/address/${address}${clusterParam}`;
}

/**
 * Get explorer URL for a transaction
 */
export async function getTransactionExplorerUrl(signature: string): Promise<string> {
  const settings = await getWalletSettings();
  const config = NETWORK_CONFIGS[settings.network];
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/tx/${signature}${clusterParam}`;
}

// ============================================
// HEALTH & DIAGNOSTICS
// ============================================

/**
 * Get RPC health summary for current network
 */
export async function getRpcHealth() {
  const settings = await getWalletSettings();
  return getRpcHealthSummary(settings.network);
}

