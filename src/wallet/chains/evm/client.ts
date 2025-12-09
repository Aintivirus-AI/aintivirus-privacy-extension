

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
import {
  BalanceCache,
  NonceCache,
  GasPriceCache,
  BlockNumberCache,
} from './rpcCache';


interface RpcEndpointHealth {
  url: string;
  latencyMs: number;
  lastSuccess: number;
  lastFailure: number | null;
  failureCount: number;
  consecutiveFailures: number;
}


interface CachedProvider {
  provider: JsonRpcProvider;
  lastAccess: number;
  chainId: EVMChainId;
  testnet: boolean;
}


const providerCache: Map<string, CachedProvider> = new Map();


const rpcHealth: Map<string, RpcEndpointHealth> = new Map();


const MAX_CACHE_SIZE = 20;


const workingRpcUrls: Map<string, string> = new Map();


function getProviderCacheKey(chainId: EVMChainId, testnet: boolean, rpcUrl: string): string {
  return `${chainId}-${testnet ? 'testnet' : 'mainnet'}-${rpcUrl}`;
}


function getChainCacheKey(chainId: EVMChainId, testnet: boolean): string {
  return `${chainId}-${testnet ? 'testnet' : 'mainnet'}`;
}


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


function createProvider(rpcUrl: string, chainId: number): JsonRpcProvider {
  
  const fetchRequest = new FetchRequest(rpcUrl);
  fetchRequest.timeout = RPC_TIMEOUT;
  
  
  const network = Network.from(chainId);
  
  return new JsonRpcProvider(fetchRequest, network, {
    staticNetwork: network,
    
    
    batchMaxCount: 10,
    batchStallTime: 10, 
  });
}


export function getProvider(
  chainId: EVMChainId,
  testnet: boolean,
  rpcUrl: string
): JsonRpcProvider {
  const cacheKey = getProviderCacheKey(chainId, testnet, rpcUrl);
  
  
  const cached = providerCache.get(cacheKey);
  if (cached) {
    cached.lastAccess = Date.now();
    return cached.provider;
  }
  
  
  evictOldestProviders();
  
  
  const numericChainId = getNumericChainId(chainId, testnet);
  const provider = createProvider(rpcUrl, numericChainId);
  
  
  providerCache.set(cacheKey, {
    provider,
    lastAccess: Date.now(),
    chainId,
    testnet,
  });
  
  return provider;
}


export function getBestProvider(chainId: EVMChainId, testnet: boolean): JsonRpcProvider {
  const chainKey = getChainCacheKey(chainId, testnet);
  
  
  const workingUrl = workingRpcUrls.get(chainKey);
  if (workingUrl) {
    return getProvider(chainId, testnet, workingUrl);
  }
  
  
  const rpcUrls = getEVMRpcUrls(chainId, testnet);
  return getProvider(chainId, testnet, rpcUrls[0]);
}


function markRpcWorking(chainId: EVMChainId, testnet: boolean, rpcUrl: string, latencyMs: number): void {
  const chainKey = getChainCacheKey(chainId, testnet);
  workingRpcUrls.set(chainKey, rpcUrl);
  
  
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
  
  
  if (health.consecutiveFailures >= 3) {
    for (const [key, entry] of providerCache.entries()) {
      if (key.includes(rpcUrl)) {
        entry.provider.destroy();
        providerCache.delete(key);
      }
    }
  }
}


export async function withFailover<T>(
  chainId: EVMChainId,
  testnet: boolean,
  operation: (provider: JsonRpcProvider) => Promise<T>
): Promise<T> {
  const rpcUrls = getEVMRpcUrls(chainId, testnet);
  const chainKey = getChainCacheKey(chainId, testnet);
  
  
  const workingUrl = workingRpcUrls.get(chainKey);
  if (workingUrl && !rpcUrls.includes(workingUrl)) {
    rpcUrls.unshift(workingUrl);
  } else if (workingUrl) {
    
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
      
      
      const latency = Math.round(performance.now() - startTime);
      markRpcWorking(chainId, testnet, rpcUrl, latency);
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      markRpcFailed(rpcUrl);
      
      
      continue;
    }
  }
  
  
  throw new ChainError(
    ChainErrorCode.NETWORK_ERROR,
    `All RPC endpoints failed for ${chainId}. Last error: ${lastError?.message || 'Unknown error'}`,
    'evm'
  );
}


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


export function clearProviderCache(): void {
  for (const entry of providerCache.values()) {
    entry.provider.destroy();
  }
  providerCache.clear();
  workingRpcUrls.clear();
}


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


export function getRpcHealthStats(): Map<string, RpcEndpointHealth> {
  return new Map(rpcHealth);
}


export async function getBlockNumber(chainId: EVMChainId, testnet: boolean): Promise<number> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getBlockNumber();
  });
}


interface BalanceCacheEntry {
  balance: bigint;
  timestamp: number;
}

const balanceCache: Map<string, BalanceCacheEntry> = new Map();
const BALANCE_CACHE_TTL = 30000; 
const balanceRequests: Map<string, Promise<bigint>> = new Map();

function getBalanceCacheKey(chainId: EVMChainId, testnet: boolean, address: string): string {
  return `${chainId}:${testnet}:${address.toLowerCase()}`;
}


export async function getBalance(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<bigint> {
  const cacheKey = getBalanceCacheKey(chainId, testnet, address);
  
  
  const cached = balanceCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < BALANCE_CACHE_TTL) {
      return cached.balance;
    }
  }
  
  
  const inFlight = balanceRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }
  
  
  const request = withFailover(chainId, testnet, async (provider) => {
    return await provider.getBalance(address);
  }).then((balance) => {
    
    balanceCache.set(cacheKey, {
      balance,
      timestamp: Date.now(),
    });
    return balance;
  }).finally(() => {
    balanceRequests.delete(cacheKey);
  });
  
  balanceRequests.set(cacheKey, request);
  return request;
}


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


export async function getGasPrice(chainId: EVMChainId, testnet: boolean): Promise<bigint> {
  return withFailover(chainId, testnet, async (provider) => {
    const feeData = await provider.getFeeData();
    return feeData.gasPrice || BigInt(0);
  });
}


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


export async function sendTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  signedTx: string
): Promise<TransactionResponse> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.broadcastTransaction(signedTx);
  });
}


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


export async function getTransactionReceipt(
  chainId: EVMChainId,
  testnet: boolean,
  txHash: string
): Promise<TransactionReceipt | null> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getTransactionReceipt(txHash);
  });
}


export async function getBlock(
  chainId: EVMChainId,
  testnet: boolean,
  blockTag: 'latest' | 'pending' | number = 'latest'
): Promise<Block | null> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getBlock(blockTag);
  });
}


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


export async function getCode(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<string> {
  return withFailover(chainId, testnet, async (provider) => {
    return await provider.getCode(address);
  });
}

