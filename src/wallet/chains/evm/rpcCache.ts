

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}


const CACHE_TTL = {
  
  CHAIN_ID: 5 * 60 * 1000,        
  GAS_PRICE: 12 * 1000,            
  BLOCK_NUMBER: 12 * 1000,         
  
  
  BALANCE: 30 * 1000,              
  NONCE: 15 * 1000,                
  TOKEN_BALANCE: 30 * 1000,        
  
  
  TRANSACTION_COUNT: 15 * 1000,    
  ESTIMATE_GAS: 20 * 1000,         
  
  
  TX_RECEIPT: 5 * 1000,            
  TX_RECEIPT_CONFIRMED: 5 * 60 * 1000, 
} as const;


const balanceCache = new Map<string, CacheEntry<string>>();


const nonceCache = new Map<string, CacheEntry<number>>();


const gasPriceCache = new Map<string, CacheEntry<string>>();


const blockNumberCache = new Map<string, CacheEntry<number>>();


const txReceiptCache = new Map<string, CacheEntry<unknown>>();


const tokenBalanceCache = new Map<string, CacheEntry<string>>();


const estimateGasCache = new Map<string, CacheEntry<string>>();


function getBalanceKey(chainId: number, address: string): string {
  return `${chainId}_${address.toLowerCase()}`;
}

function getNonceKey(chainId: number, address: string): string {
  return `${chainId}_${address.toLowerCase()}`;
}

function getGasPriceKey(chainId: number): string {
  return `${chainId}`;
}

function getBlockNumberKey(chainId: number): string {
  return `${chainId}`;
}

function getTxReceiptKey(chainId: number, txHash: string): string {
  return `${chainId}_${txHash.toLowerCase()}`;
}

function getTokenBalanceKey(chainId: number, tokenAddress: string, walletAddress: string): string {
  return `${chainId}_${tokenAddress.toLowerCase()}_${walletAddress.toLowerCase()}`;
}

function getEstimateGasKey(chainId: number, from: string, to?: string, data?: string): string {
  
  return `${chainId}_${from.toLowerCase()}_${to?.toLowerCase() || 'none'}_${data || '0x'}`;
}


function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  if (now > entry.expiresAt) {
    
    cache.delete(key);
    return null;
  }
  
  return entry.value;
}


function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number): void {
  const now = Date.now();
  cache.set(key, {
    value,
    timestamp: now,
    expiresAt: now + ttl,
  });
  
  
  if (cache.size > 1000) {
    const cutoff = now - (5 * 60 * 1000); 
    for (const [k, entry] of cache.entries()) {
      if (entry.timestamp < cutoff) {
        cache.delete(k);
      }
    }
  }
}


export const BalanceCache = {
  get(chainId: number, address: string): string | null {
    return getCached(balanceCache, getBalanceKey(chainId, address));
  },
  
  set(chainId: number, address: string, balance: string): void {
    setCached(balanceCache, getBalanceKey(chainId, address), balance, CACHE_TTL.BALANCE);
  },
  
  invalidate(chainId: number, address: string): void {
    balanceCache.delete(getBalanceKey(chainId, address));
  },
  
  clear(): void {
    balanceCache.clear();
  },
};


export const NonceCache = {
  get(chainId: number, address: string): number | null {
    return getCached(nonceCache, getNonceKey(chainId, address));
  },
  
  set(chainId: number, address: string, nonce: number): void {
    setCached(nonceCache, getNonceKey(chainId, address), nonce, CACHE_TTL.NONCE);
  },
  
  invalidate(chainId: number, address: string): void {
    nonceCache.delete(getNonceKey(chainId, address));
  },
  
  increment(chainId: number, address: string): void {
    const key = getNonceKey(chainId, address);
    const current = getCached(nonceCache, key);
    if (current !== null) {
      setCached(nonceCache, key, current + 1, CACHE_TTL.NONCE);
    }
  },
  
  clear(): void {
    nonceCache.clear();
  },
};


export const GasPriceCache = {
  get(chainId: number): string | null {
    return getCached(gasPriceCache, getGasPriceKey(chainId));
  },
  
  set(chainId: number, gasPrice: string): void {
    setCached(gasPriceCache, getGasPriceKey(chainId), gasPrice, CACHE_TTL.GAS_PRICE);
  },
  
  clear(): void {
    gasPriceCache.clear();
  },
};


export const BlockNumberCache = {
  get(chainId: number): number | null {
    return getCached(blockNumberCache, getBlockNumberKey(chainId));
  },
  
  set(chainId: number, blockNumber: number): void {
    setCached(blockNumberCache, getBlockNumberKey(chainId), blockNumber, CACHE_TTL.BLOCK_NUMBER);
  },
  
  clear(): void {
    blockNumberCache.clear();
  },
};


export const TxReceiptCache = {
  get(chainId: number, txHash: string): unknown | null {
    return getCached(txReceiptCache, getTxReceiptKey(chainId, txHash));
  },
  
  set(chainId: number, txHash: string, receipt: unknown, confirmed: boolean = false): void {
    const ttl = confirmed ? CACHE_TTL.TX_RECEIPT_CONFIRMED : CACHE_TTL.TX_RECEIPT;
    setCached(txReceiptCache, getTxReceiptKey(chainId, txHash), receipt, ttl);
  },
  
  clear(): void {
    txReceiptCache.clear();
  },
};


export const TokenBalanceCache = {
  get(chainId: number, tokenAddress: string, walletAddress: string): string | null {
    return getCached(tokenBalanceCache, getTokenBalanceKey(chainId, tokenAddress, walletAddress));
  },
  
  set(chainId: number, tokenAddress: string, walletAddress: string, balance: string): void {
    setCached(tokenBalanceCache, getTokenBalanceKey(chainId, tokenAddress, walletAddress), balance, CACHE_TTL.TOKEN_BALANCE);
  },
  
  invalidate(chainId: number, tokenAddress: string, walletAddress: string): void {
    tokenBalanceCache.delete(getTokenBalanceKey(chainId, tokenAddress, walletAddress));
  },
  
  clear(): void {
    tokenBalanceCache.clear();
  },
};


export const EstimateGasCache = {
  get(chainId: number, from: string, to?: string, data?: string): string | null {
    return getCached(estimateGasCache, getEstimateGasKey(chainId, from, to, data));
  },
  
  set(chainId: number, from: string, gasLimit: string, to?: string, data?: string): void {
    setCached(estimateGasCache, getEstimateGasKey(chainId, from, to, data), gasLimit, CACHE_TTL.ESTIMATE_GAS);
  },
  
  clear(): void {
    estimateGasCache.clear();
  },
};


export function clearAllRpcCaches(): void {
  BalanceCache.clear();
  NonceCache.clear();
  GasPriceCache.clear();
  BlockNumberCache.clear();
  TxReceiptCache.clear();
  TokenBalanceCache.clear();
  EstimateGasCache.clear();
}


export function getRpcCacheStats(): Record<string, number> {
  return {
    balance: balanceCache.size,
    nonce: nonceCache.size,
    gasPrice: gasPriceCache.size,
    blockNumber: blockNumberCache.size,
    txReceipt: txReceiptCache.size,
    tokenBalance: tokenBalanceCache.size,
    estimateGas: estimateGasCache.size,
    total: balanceCache.size + nonceCache.size + gasPriceCache.size + 
           blockNumberCache.size + txReceiptCache.size + tokenBalanceCache.size +
           estimateGasCache.size,
  };
}

