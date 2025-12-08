/**
 * AINTIVIRUS Wallet - EVM RPC Client
 * 
 * This module provides an ethers.js-based RPC client with failover support
 * for all EVM-compatible chains.
 * 
 * Features:
 * - Automatic RPC failover on errors
 * - Connection caching with LRU eviction
 * - Health tracking per endpoint
 * - Request timeout handling
 * 
 * SECURITY:
 * - Uses public RPC endpoints (no API keys in code)
 * - No sensitive data sent to RPCs except signed transactions
 */

import {
  JsonRpcProvider,
  FetchRequest,
  Network,
  type Provider,
  type TransactionResponse,
  type TransactionReceipt,
  type Block,
} from 'ethers';
import type { EVMChainId, NetworkEnvironment } from '../types';
import { ChainError, ChainErrorCode } from '../types';
import {
  getEVMChainConfig,
  getNumericChainId,
  getEVMRpcUrls,
  MAX_RPC_RETRIES,
  RPC_TIMEOUT,
} from '../config';

// ============================================
// TYPES
// ============================================

/**
 * RPC endpoint health tracking
 */
interface RpcEndpointHealth {
  url: string;
  latencyMs: number;
  lastSuccess: number;
  lastFailure: number | null;
  failureCount: number;
  consecutiveFailures: number;
}

/**
 * Cached provider entry
 */
interface CachedProvider {
  provider: JsonRpcProvider;
  lastAccess: number;
  chainId: EVMChainId;
  testnet: boolean;
}

// ============================================
// STATE
// ============================================

/**
 * Provider cache (LRU-style)
 */
const providerCache: Map<string, CachedProvider> = new Map();

/**
 * Health tracking per RPC endpoint
 */
const rpcHealth: Map<string, RpcEndpointHealth> = new Map();

/**
 * Maximum cached providers
 */
const MAX_CACHE_SIZE = 20;

/**
 * Currently working RPC URL per chain
 */
const workingRpcUrls: Map<string, string> = new Map();

// ============================================
// PROVIDER MANAGEMENT
// ============================================

/**
 * Get cache key for provider
 */
function getProviderCacheKey(chainId: EVMChainId, testnet: boolean, rpcUrl: string): string {
  return `${chainId}-${testnet ? 'testnet' : 'mainnet'}-${rpcUrl}`;
}

/**
 * Get chain cache key (without specific RPC)
 */
function getChainCacheKey(chainId: EVMChainId, testnet: boolean): string {
  return `${chainId}-${testnet ? 'testnet' : 'mainnet'}`;
}

/**
 * Evict oldest cache entries
 */
function evictOldestProviders(): void {
  if (providerCache.size <= MAX_CACHE_SIZE) {
    return;
  }
  
  const entries = Array.from(providerCache.entries())
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key, entry] of toRemove) {
    entry.provider.destroy();
    providerCache.delete(key);
  }
}

/**
 * Create a new JsonRpcProvider with timeout
 * 
 * @param rpcUrl - RPC endpoint URL
 * @param chainId - Numeric chain ID
 * @returns Configured provider
 */
function createProvider(rpcUrl: string, chainId: number): JsonRpcProvider {
  // Create fetch request with timeout
  const fetchRequest = new FetchRequest(rpcUrl);
  fetchRequest.timeout = RPC_TIMEOUT;
  
  // Create static network to avoid unnecessary chainId calls
  const network = Network.from(chainId);
  
  return new JsonRpcProvider(fetchRequest, network, {
    staticNetwork: network,
    batchMaxCount: 1, // Disable batching for simpler error handling
  });
}

/**
 * Get or create a provider for a specific RPC URL
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param rpcUrl - Specific RPC URL
 * @returns JsonRpcProvider
 */
export function getProvider(
  chainId: EVMChainId,
  testnet: boolean,
  rpcUrl: string
): JsonRpcProvider {
  const cacheKey = getProviderCacheKey(chainId, testnet, rpcUrl);
  
  // Check cache
  const cached = providerCache.get(cacheKey);
  if (cached) {
    cached.lastAccess = Date.now();
    return cached.provider;
  }
  
  // Evict old entries
  evictOldestProviders();
  
  // Create new provider
  const numericChainId = getNumericChainId(chainId, testnet);
  const provider = createProvider(rpcUrl, numericChainId);
  
  // Cache it
  providerCache.set(cacheKey, {
    provider,
    lastAccess: Date.now(),
    chainId,
    testnet,
  });
  
  return provider;
}

/**
 * Get the best available provider for a chain
 * 
 * Uses working RPC if known, otherwise returns primary RPC provider
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @returns JsonRpcProvider
 */
export function getBestProvider(chainId: EVMChainId, testnet: boolean): JsonRpcProvider {
  const chainKey = getChainCacheKey(chainId, testnet);
  
  // Check for known working RPC
  const workingUrl = workingRpcUrls.get(chainKey);
  if (workingUrl) {
    return getProvider(chainId, testnet, workingUrl);
  }
  
  // Use primary RPC
  const rpcUrls = getEVMRpcUrls(chainId, testnet);
  return getProvider(chainId, testnet, rpcUrls[0]);
}

/**
 * Mark an RPC endpoint as working
 */
function markRpcWorking(chainId: EVMChainId, testnet: boolean, rpcUrl: string, latencyMs: number): void {
  const chainKey = getChainCacheKey(chainId, testnet);
  workingRpcUrls.set(chainKey, rpcUrl);
  
  // Update health tracking
  const health = rpcHealth.get(rpcUrl) || {
    url: rpcUrl,
    latencyMs: -1,
    lastSuccess: 0,
    lastFailure: null,
    failureCount: 0,
    consecutiveFailures: 0,
  };
  
  health.latencyMs = latencyMs;
  health.lastSuccess = Date.now();
  health.consecutiveFailures = 0;
  
  rpcHealth.set(rpcUrl, health);
}

/**
 * Mark an RPC endpoint as failed
 */
function markRpcFailed(rpcUrl: string): void {
  const health = rpcHealth.get(rpcUrl) || {
    url: rpcUrl,
    latencyMs: -1,
    lastSuccess: 0,
    lastFailure: null,
    failureCount: 0,
    consecutiveFailures: 0,
  };
  
  health.lastFailure = Date.now();
  health.failureCount++;
  health.consecutiveFailures++;
  
  rpcHealth.set(rpcUrl, health);
  
  // Remove from provider cache on repeated failures
  if (health.consecutiveFailures >= 3) {
    for (const [key, entry] of providerCache.entries()) {
      if (key.includes(rpcUrl)) {
        entry.provider.destroy();
        providerCache.delete(key);
      }
    }
  }
}

// ============================================
// FAILOVER OPERATIONS
// ============================================

/**
 * Execute an operation with RPC failover
 * 
 * Tries each RPC endpoint in sequence until one succeeds.
 * Updates health tracking based on results.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param operation - Async operation to perform with provider
 * @returns Result of the operation
 */
export async function withFailover<T>(
  chainId: EVMChainId,
  testnet: boolean,
  operation: (provider: JsonRpcProvider) => Promise<T>
): Promise<T> {
  const rpcUrls = getEVMRpcUrls(chainId, testnet);
  const chainKey = getChainCacheKey(chainId, testnet);
  
  // Try working RPC first if available
  const workingUrl = workingRpcUrls.get(chainKey);
  if (workingUrl && !rpcUrls.includes(workingUrl)) {
    rpcUrls.unshift(workingUrl);
  } else if (workingUrl) {
    // Move working URL to front
    const idx = rpcUrls.indexOf(workingUrl);
    if (idx > 0) {
      rpcUrls.splice(idx, 1);
      rpcUrls.unshift(workingUrl);
    }
  }
  
  let lastError: Error | null = null;
  
  for (const rpcUrl of rpcUrls) {
    const startTime = performance.now();
    
    try {
      const provider = getProvider(chainId, testnet, rpcUrl);
      const result = await operation(provider);
      
      // Mark as working
      const latency = Math.round(performance.now() - startTime);
      markRpcWorking(chainId, testnet, rpcUrl, latency);
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[EVM Client] RPC ${rpcUrl} failed:`, lastError.message);
      
      markRpcFailed(rpcUrl);
      
      // Continue to next RPC
      continue;
    }
  }
  
  // All RPCs failed
  throw new ChainError(
    ChainErrorCode.NETWORK_ERROR,
    `All RPC endpoints failed for ${chainId}. Last error: ${lastError?.message || 'Unknown error'}`,
    'evm'
  );
}

/**
 * Execute with retry logic (single RPC, multiple attempts)
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param operation - Async operation to perform
 * @param maxRetries - Maximum retry attempts
 * @returns Result of the operation
 */
export async function withRetry<T>(
  chainId: EVMChainId,
  testnet: boolean,
  operation: (provider: JsonRpcProvider) => Promise<T>,
  maxRetries: number = MAX_RPC_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await withFailover(chainId, testnet, operation);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw new ChainError(
    ChainErrorCode.NETWORK_ERROR,
    `Operation failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`,
    'evm'
  );
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Clear all cached providers
 */
export function clearProviderCache(): void {
  for (const entry of providerCache.values()) {
    entry.provider.destroy();
  }
  providerCache.clear();
  workingRpcUrls.clear();
}

/**
 * Clear cache for a specific chain
 */
export function clearChainCache(chainId: EVMChainId, testnet: boolean): void {
  const chainKey = getChainCacheKey(chainId, testnet);
  workingRpcUrls.delete(chainKey);
  
  for (const [key, entry] of providerCache.entries()) {
    if (entry.chainId === chainId && entry.testnet === testnet) {
      entry.provider.destroy();
      providerCache.delete(key);
    }
  }
}

/**
 * Get RPC health statistics
 */
export function getRpcHealthStats(): Map<string, RpcEndpointHealth> {
  return new Map(rpcHealth);
}

// ============================================
// HIGH-LEVEL RPC OPERATIONS
// ============================================

/**
 * Get current block number
 */
export async function getBlockNumber(chainId: EVMChainId, testnet: boolean): Promise<number> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getBlockNumber();
  });
}

/**
 * Get native balance for an address
 */
export async function getBalance(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<bigint> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getBalance(address);
  });
}

/**
 * Get transaction count (nonce) for an address
 */
export async function getTransactionCount(
  chainId: EVMChainId,
  testnet: boolean,
  address: string,
  blockTag: 'latest' | 'pending' = 'pending'
): Promise<number> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getTransactionCount(address, blockTag);
  });
}

/**
 * Get current gas price
 */
export async function getGasPrice(chainId: EVMChainId, testnet: boolean): Promise<bigint> {
  return withFailover(chainId, testnet, async (provider) => {
    const feeData = await provider.getFeeData();
    return feeData.gasPrice || BigInt(0);
  });
}

/**
 * Get fee data (EIP-1559 compatible)
 */
export async function getFeeData(
  chainId: EVMChainId,
  testnet: boolean
): Promise<{
  gasPrice: bigint | null;
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
}> {
  return withFailover(chainId, testnet, async (provider) => {
    const feeData = await provider.getFeeData();
    return {
      gasPrice: feeData.gasPrice,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };
  });
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  chainId: EVMChainId,
  testnet: boolean,
  tx: {
    from: string;
    to: string;
    value?: bigint;
    data?: string;
  }
): Promise<bigint> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.estimateGas(tx);
  });
}

/**
 * Send a signed transaction
 */
export async function sendTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  signedTx: string
): Promise<TransactionResponse> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.broadcastTransaction(signedTx);
  });
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  txHash: string,
  confirmations: number = 1,
  timeout: number = 60000
): Promise<TransactionReceipt | null> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.waitForTransaction(txHash, confirmations, timeout);
  });
}

/**
 * Get transaction receipt
 */
export async function getTransactionReceipt(
  chainId: EVMChainId,
  testnet: boolean,
  txHash: string
): Promise<TransactionReceipt | null> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getTransactionReceipt(txHash);
  });
}

/**
 * Get latest block
 */
export async function getBlock(
  chainId: EVMChainId,
  testnet: boolean,
  blockTag: 'latest' | 'pending' | number = 'latest'
): Promise<Block | null> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getBlock(blockTag);
  });
}

/**
 * Call a contract method (read-only)
 */
export async function call(
  chainId: EVMChainId,
  testnet: boolean,
  tx: {
    to: string;
    data: string;
  }
): Promise<string> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.call(tx);
  });
}

/**
 * Get code at an address (to check if it's a contract)
 */
export async function getCode(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<string> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getCode(address);
  });
}



