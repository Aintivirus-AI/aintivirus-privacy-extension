

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


const MAX_CACHE_SIZE = 10;


interface CachedConnection {
  connection: Connection;
  lastAccess: number;
}

const connectionCache: Map<string, CachedConnection> = new Map();


let workingRpcUrl: string | null = null;


connectionCache.clear();


function evictOldestCacheEntries(): void {
  if (connectionCache.size <= MAX_CACHE_SIZE) {
    return;
  }
  
  
  const entries = Array.from(connectionCache.entries())
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  
  
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toRemove) {
    connectionCache.delete(key);
  }
}


export function getConnection(
  network: SolanaNetwork,
  customRpcUrl?: string
): Connection {
  const rpcUrl = customRpcUrl || workingRpcUrl || NETWORK_CONFIGS[network].rpcUrl;
  
  
  const cached = connectionCache.get(rpcUrl);
  if (cached) {
    
    cached.lastAccess = Date.now();
    return cached.connection;
  }
  
  
  evictOldestCacheEntries();
  
  
  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, 
    disableRetryOnRateLimit: true,
  });
  
  
  connectionCache.set(rpcUrl, {
    connection,
    lastAccess: Date.now(),
  });
  
  return connection;
}


function getAllRpcUrls(network: SolanaNetwork): string[] {
  const config = NETWORK_CONFIGS[network];
  return [config.rpcUrl, ...config.fallbackRpcUrls];
}


export async function getCurrentConnection(): Promise<Connection> {
  const settings = await getWalletSettings();
  
  
  if (settings.customRpcUrl) {
    return getConnection(settings.network, settings.customRpcUrl);
  }
  
  
  if (workingRpcUrl) {
    return getConnection(settings.network, workingRpcUrl);
  }
  
  return getConnection(settings.network);
}


function isHardFailure(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('403') ||
    msg.includes('401') ||
    msg.includes('forbidden') ||
    msg.includes('unauthorized') ||
    msg.includes('access denied') ||
    msg.includes('api key')
  );
}


export async function withFallbackRpc<T>(
  network: SolanaNetwork,
  operation: (connection: Connection) => Promise<T>
): Promise<T> {
  const rpcUrls = getAllRpcUrls(network);
  let lastError: Error | null = null;
  const failedUrls: Set<string> = new Set();
  
  for (const rpcUrl of rpcUrls) {
    
    if (failedUrls.has(rpcUrl)) {
      continue;
    }
    
    try {
      const connection = getConnection(network, rpcUrl);
      const result = await operation(connection);
      
      
      workingRpcUrl = rpcUrl;
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      
      connectionCache.delete(rpcUrl);
      
      
      if (isHardFailure(lastError)) {
        failedUrls.add(rpcUrl);

      }
      
      
      continue;
    }
  }
  
  
  throw new WalletError(
    WalletErrorCode.NETWORK_ERROR,
    `All RPC endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`
  );
}


export function clearConnectionCache(): void {
  connectionCache.clear();
  workingRpcUrl = null;
}


export async function getCurrentNetwork(): Promise<NetworkConfig> {
  const settings = await getWalletSettings();
  return NETWORK_CONFIGS[settings.network];
}


export async function setNetwork(network: SolanaNetwork): Promise<void> {
  await saveWalletSettings({ network });
  
  clearConnectionCache();
}


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


const balanceRequests: Map<string, Promise<WalletBalance>> = new Map();


interface BalanceCacheEntry {
  balance: WalletBalance;
  timestamp: number;
}
const balanceCache: Map<string, BalanceCacheEntry> = new Map();
const BALANCE_CACHE_TTL = 30000; 
const BALANCE_STALE_TTL = 120000; 


export async function getBalance(address: string): Promise<WalletBalance> {
  
  const cached = balanceCache.get(address);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    
    
    if (age < BALANCE_CACHE_TTL) {
      return cached.balance;
    }
    
    
    if (age < BALANCE_STALE_TTL) {
      
      if (!balanceRequests.has(address)) {
        fetchBalanceInternal(address).catch(() => {
          
        });
      }
      return cached.balance;
    }
  }
  
  
  const inFlight = balanceRequests.get(address);
  if (inFlight) {
    return inFlight;
  }
  
  
  const request = fetchBalanceInternal(address);
  balanceRequests.set(address, request);
  
  try {
    return await request;
  } finally {
    balanceRequests.delete(address);
  }
}


async function fetchBalanceInternal(address: string): Promise<WalletBalance> {
  try {
    const settings = await getWalletSettings();
    const publicKey = new PublicKey(address);
    
    const lamports = await withFallbackRpc(settings.network, async (connection) => {
      return await connection.getBalance(publicKey);
    });
    
    const balance: WalletBalance = {
      lamports,
      sol: lamports / LAMPORTS_PER_SOL,
      lastUpdated: Date.now(),
    };
    
    
    balanceCache.set(address, {
      balance,
      timestamp: Date.now(),
    });
    
    return balance;
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


export function clearBalanceCache(): void {
  balanceCache.clear();
  balanceRequests.clear();

}


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
      
      clearConnectionCache();
      
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


export async function estimateTransactionFee(
  transaction: Transaction | VersionedTransaction
): Promise<number> {
  try {
    const connection = await getCurrentConnection();
    
    
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
    
    return 5000; 
  }
}


function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}


function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


export function deserializeTransaction(
  serializedTransaction: string
): Transaction | VersionedTransaction {
  try {
    const bytes = base64ToUint8Array(serializedTransaction);
    
    
    try {
      return VersionedTransaction.deserialize(bytes);
    } catch {
      
      return Transaction.from(bytes);
    }
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.SIGNING_FAILED,
      'Failed to deserialize transaction'
    );
  }
}


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


export async function accountExists(address: string): Promise<boolean> {
  try {
    const balance = await getBalance(address);
    return balance.lamports > 0;
  } catch {
    return false;
  }
}


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


export async function getAddressExplorerUrl(address: string): Promise<string> {
  const config = await getCurrentNetwork();
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/address/${address}${clusterParam}`;
}


export async function getTransactionExplorerUrl(signature: string): Promise<string> {
  const config = await getCurrentNetwork();
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/tx/${signature}${clusterParam}`;
}

