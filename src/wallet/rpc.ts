/**
 * AINTIVIRUS Wallet Module - Solana RPC Abstraction
 * 
 * This module handles all Solana RPC communications.
 * 
 * Features:
 * - Network switching (mainnet/devnet)
 * - Balance retrieval
 * - Connection health checks
 * - Transaction preparation (no sending)
 * 
 * SECURITY:
 * - Only public RPC endpoints are used (no API keys stored)
 * - No transaction broadcasting (read-only + signing)
 * - No telemetry or external calls except Solana RPC
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  SolanaNetwork,
  NetworkConfig,
  NETWORK_CONFIGS,
  WalletBalance,
  WalletError,
  WalletErrorCode,
} from './types';
import { getWalletSettings, saveWalletSettings } from './storage';

// ============================================
// CONNECTION MANAGEMENT
// ============================================

/**
 * Maximum number of connections to cache
 * SECURITY: Prevents unbounded memory growth
 */
const MAX_CACHE_SIZE = 10;

/**
 * LRU cache for connection instances
 * SECURITY: Connections are stateless and safe to cache
 * Uses access order to implement LRU eviction
 */
interface CachedConnection {
  connection: Connection;
  lastAccess: number;
}

const connectionCache: Map<string, CachedConnection> = new Map();

/**
 * Track which RPC endpoints are working
 */
let workingRpcUrl: string | null = null;

/**
 * Evict oldest entries from cache when it exceeds max size
 * Implements LRU eviction based on lastAccess timestamp
 */
function evictOldestCacheEntries(): void {
  if (connectionCache.size <= MAX_CACHE_SIZE) {
    return;
  }
  
  // Sort entries by last access time (oldest first)
  const entries = Array.from(connectionCache.entries())
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  
  // Remove oldest entries until we're at max size
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toRemove) {
    connectionCache.delete(key);
  }
}

/**
 * Get or create a Connection for the specified network
 * 
 * PERFORMANCE: Implements LRU caching with max size to prevent memory leaks
 * 
 * @param network - Network to connect to
 * @param customRpcUrl - Optional custom RPC URL override
 * @returns Solana Connection instance
 */
export function getConnection(
  network: SolanaNetwork,
  customRpcUrl?: string
): Connection {
  const rpcUrl = customRpcUrl || workingRpcUrl || NETWORK_CONFIGS[network].rpcUrl;
  
  // Check cache
  const cached = connectionCache.get(rpcUrl);
  if (cached) {
    // Update access time for LRU
    cached.lastAccess = Date.now();
    return cached.connection;
  }
  
  // Evict old entries before adding new one
  evictOldestCacheEntries();
  
  // Create new connection
  // SECURITY: 'confirmed' commitment provides good balance of speed/reliability
  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  });
  
  // Cache it with access time
  connectionCache.set(rpcUrl, {
    connection,
    lastAccess: Date.now(),
  });
  
  return connection;
}

/**
 * Get all RPC URLs for a network (primary + fallbacks)
 */
function getAllRpcUrls(network: SolanaNetwork): string[] {
  const config = NETWORK_CONFIGS[network];
  return [config.rpcUrl, ...config.fallbackRpcUrls];
}

/**
 * Get connection for current network settings with fallback support
 * 
 * @returns Connection for the currently configured network
 */
export async function getCurrentConnection(): Promise<Connection> {
  const settings = await getWalletSettings();
  
  // If custom RPC is set, use it directly
  if (settings.customRpcUrl) {
    return getConnection(settings.network, settings.customRpcUrl);
  }
  
  // If we have a known working URL, use it
  if (workingRpcUrl) {
    return getConnection(settings.network, workingRpcUrl);
  }
  
  return getConnection(settings.network);
}

/**
 * Try an RPC operation with fallback to other endpoints
 * 
 * @param network - Network to use
 * @param operation - Async operation to perform with connection
 * @returns Result of the operation
 */
export async function withFallbackRpc<T>(
  network: SolanaNetwork,
  operation: (connection: Connection) => Promise<T>
): Promise<T> {
  const rpcUrls = getAllRpcUrls(network);
  let lastError: Error | null = null;
  
  for (const rpcUrl of rpcUrls) {
    try {
      const connection = getConnection(network, rpcUrl);
      const result = await operation(connection);
      
      // Mark this URL as working
      workingRpcUrl = rpcUrl;
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[AINTIVIRUS Wallet] RPC ${rpcUrl} failed:`, lastError.message);
      
      // Clear this connection from cache so we try fresh next time
      connectionCache.delete(rpcUrl);
      
      // Continue to next fallback
      continue;
    }
  }
  
  // All endpoints failed
  throw new WalletError(
    WalletErrorCode.NETWORK_ERROR,
    `All RPC endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Clear the connection cache
 * Useful when switching networks or RPC endpoints
 */
export function clearConnectionCache(): void {
  connectionCache.clear();
  workingRpcUrl = null;
}

// ============================================
// NETWORK MANAGEMENT
// ============================================

/**
 * Get current network configuration
 * 
 * @returns Current network config
 */
export async function getCurrentNetwork(): Promise<NetworkConfig> {
  const settings = await getWalletSettings();
  return NETWORK_CONFIGS[settings.network];
}

/**
 * Switch to a different network
 * 
 * @param network - Network to switch to
 */
export async function setNetwork(network: SolanaNetwork): Promise<void> {
  await saveWalletSettings({ network });
  // Clear cache to ensure fresh connections
  clearConnectionCache();
}

/**
 * Get network status (connectivity and latency)
 * 
 * @returns Connection status with latency measurement
 */
export async function getNetworkStatus(): Promise<{
  connected: boolean;
  latency: number;
  blockHeight: number | null;
}> {
  try {
    const settings = await getWalletSettings();
    
    const result = await withFallbackRpc(settings.network, async (connection) => {
      const startTime = performance.now();
      const blockHeight = await connection.getBlockHeight();
      const latency = Math.round(performance.now() - startTime);
      return { blockHeight, latency };
    });
    
    return {
      connected: true,
      latency: result.latency,
      blockHeight: result.blockHeight,
    };
  } catch (error) {
    return {
      connected: false,
      latency: -1,
      blockHeight: null,
    };
  }
}

// ============================================
// BALANCE OPERATIONS
// ============================================

/**
 * Get SOL balance for an address
 * 
 * @param address - Base58-encoded public key
 * @returns Balance information
 */
export async function getBalance(address: string): Promise<WalletBalance> {
  try {
    const settings = await getWalletSettings();
    const publicKey = new PublicKey(address);
    
    const lamports = await withFallbackRpc(settings.network, async (connection) => {
      return await connection.getBalance(publicKey);
    });
    
    return {
      lamports,
      sol: lamports / LAMPORTS_PER_SOL,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      `Failed to fetch balance: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get balance with retry logic (uses fallback RPCs internally)
 * 
 * @param address - Base58-encoded public key
 * @param maxRetries - Maximum number of retry attempts
 * @returns Balance information
 */
export async function getBalanceWithRetry(
  address: string,
  maxRetries: number = 2
): Promise<WalletBalance> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await getBalance(address);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      // Clear working RPC on failure so fallback logic re-evaluates
      clearConnectionCache();
      // Wait before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  throw new WalletError(
    WalletErrorCode.RPC_ERROR,
    `Failed to fetch balance after ${maxRetries} attempts: ${lastError?.message}`
  );
}

// ============================================
// TRANSACTION UTILITIES
// ============================================

/**
 * Get recent blockhash for transaction construction
 * 
 * SECURITY: Blockhash is public information, safe to fetch.
 * 
 * @returns Recent blockhash and last valid block height
 */
export async function getRecentBlockhash(): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  try {
    const settings = await getWalletSettings();
    
    return await withFallbackRpc(settings.network, async (connection) => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      return { blockhash, lastValidBlockHeight };
    });
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      'Failed to fetch recent blockhash'
    );
  }
}

/**
 * Estimate transaction fee
 * 
 * @param transaction - Unsigned transaction
 * @returns Estimated fee in lamports
 */
export async function estimateTransactionFee(
  transaction: Transaction | VersionedTransaction
): Promise<number> {
  try {
    const connection = await getCurrentConnection();
    
    // For versioned transactions
    if (transaction instanceof VersionedTransaction) {
      const fee = await connection.getFeeForMessage(transaction.message);
      return fee.value || 5000; // Default to 5000 lamports if null
    }
    
    // For legacy transactions
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
 * Convert base64 to Uint8Array (browser-compatible)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 (browser-compatible)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Deserialize a transaction from base64
 * 
 * SECURITY: Only deserializes, does not execute.
 * Used for inspecting transactions before signing.
 * 
 * @param serializedTransaction - Base64-encoded transaction
 * @returns Deserialized transaction
 */
export function deserializeTransaction(
  serializedTransaction: string
): Transaction | VersionedTransaction {
  try {
    const bytes = base64ToUint8Array(serializedTransaction);
    
    // Try versioned transaction first
    try {
      return VersionedTransaction.deserialize(bytes);
    } catch {
      // Fall back to legacy transaction
      return Transaction.from(bytes);
    }
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.SIGNING_FAILED,
      'Failed to deserialize transaction'
    );
  }
}

/**
 * Serialize a transaction to base64
 * 
 * @param transaction - Transaction to serialize
 * @returns Base64-encoded transaction
 */
export function serializeTransaction(
  transaction: Transaction | VersionedTransaction
): string {
  try {
    const serialized = transaction.serialize();
    return uint8ArrayToBase64(new Uint8Array(serialized));
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.SIGNING_FAILED,
      'Failed to serialize transaction'
    );
  }
}

// ============================================
// ACCOUNT INFORMATION
// ============================================

/**
 * Check if an account exists and is funded
 * 
 * @param address - Base58-encoded public key
 * @returns True if account exists with non-zero balance
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
 * 
 * @param dataSize - Size of account data in bytes
 * @returns Minimum lamports required for rent exemption
 */
export async function getMinimumBalanceForRentExemption(
  dataSize: number = 0
): Promise<number> {
  try {
    const connection = await getCurrentConnection();
    return await connection.getMinimumBalanceForRentExemption(dataSize);
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      'Failed to fetch rent exemption minimum'
    );
  }
}

// ============================================
// EXPLORER URLS
// ============================================

/**
 * Get explorer URL for an address
 * 
 * @param address - Base58-encoded public key
 * @returns Explorer URL for the address
 */
export async function getAddressExplorerUrl(address: string): Promise<string> {
  const config = await getCurrentNetwork();
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/address/${address}${clusterParam}`;
}

/**
 * Get explorer URL for a transaction
 * 
 * @param signature - Transaction signature
 * @returns Explorer URL for the transaction
 */
export async function getTransactionExplorerUrl(signature: string): Promise<string> {
  const config = await getCurrentNetwork();
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/tx/${signature}${clusterParam}`;
}

