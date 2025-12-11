// Lightweight deduplication/cache helpers so wallet RPCs reuse in-flight requests
// and keep results cached per key.
interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

interface CachedResult<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

// Dedup class tracks pending promises and caches results to avoid duplicate RPC calls.
export class RequestDeduplicator {
  private pendingRequests: Map<string, PendingRequest<any>> = new Map();
  private resultCache: Map<string, CachedResult<any>> = new Map();
  private maxCacheSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxCacheSize: number = 100) {
    this.maxCacheSize = maxCacheSize;

    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  async execute<T>(key: string, fetcher: () => Promise<T>, cacheTtlMs: number = 0): Promise<T> {
    if (cacheTtlMs > 0) {
      const cached = this.resultCache.get(key);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.value as T;
      }
    }

    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending.promise as Promise<T>;
    }

    const promise = this.executeRequest(key, fetcher, cacheTtlMs);
    this.pendingRequests.set(key, { promise, timestamp: Date.now() });

    return promise;
  }

  private async executeRequest<T>(
    key: string,
    fetcher: () => Promise<T>,
    cacheTtlMs: number,
  ): Promise<T> {
    try {
      const result = await fetcher();

      if (cacheTtlMs > 0) {
        this.cacheResult(key, result, cacheTtlMs);
      }

      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  private cacheResult<T>(key: string, value: T, ttlMs: number): void {
    if (this.resultCache.size >= this.maxCacheSize) {
      this.evictOldest();
    }

    this.resultCache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  private evictOldest(): void {
    const entries = Array.from(this.resultCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    const toRemove = entries.slice(0, Math.ceil(this.maxCacheSize / 4));
    for (const [key] of toRemove) {
      this.resultCache.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [key, cached] of this.resultCache.entries()) {
      if (now - cached.timestamp >= cached.ttl) {
        this.resultCache.delete(key);
      }
    }

    for (const [key, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > 60000) {
        this.pendingRequests.delete(key);
      }
    }
  }

  invalidate(keyOrPattern: string | RegExp): void {
    if (typeof keyOrPattern === 'string') {
      this.resultCache.delete(keyOrPattern);
    } else {
      for (const key of this.resultCache.keys()) {
        if (keyOrPattern.test(key)) {
          this.resultCache.delete(key);
        }
      }
    }
  }

  clear(): void {
    this.resultCache.clear();
    this.pendingRequests.clear();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  getStats(): { pendingCount: number; cacheSize: number } {
    return {
      pendingCount: this.pendingRequests.size,
      cacheSize: this.resultCache.size,
    };
  }
}

export const balanceDedup = new RequestDeduplicator(50);

export const tokenDedup = new RequestDeduplicator(100);

export const priceDedup = new RequestDeduplicator(200);

export const historyDedup = new RequestDeduplicator(50);

export const rpcHealthDedup = new RequestDeduplicator(20);

export const metadataDedup = new RequestDeduplicator(500);

export function balanceKey(chain: string, address: string, network?: string): string {
  return `balance:${chain}:${address}:${network || 'mainnet'}`;
}

export function tokenBalanceKey(chain: string, address: string, network?: string): string {
  return `tokens:${chain}:${address}:${network || 'mainnet'}`;
}

export function priceKey(tokenId: string, currency: string = 'usd'): string {
  return `price:${tokenId}:${currency}`;
}

export function batchPriceKey(tokenIds: string[], currency: string = 'usd'): string {
  return `prices:${tokenIds.sort().join(',')}:${currency}`;
}

export function historyKey(
  chain: string,
  address: string,
  limit: number,
  network?: string,
): string {
  return `history:${chain}:${address}:${limit}:${network || 'mainnet'}`;
}

export function metadataKey(chain: string, tokenAddress: string): string {
  return `metadata:${chain}:${tokenAddress}`;
}

export const BALANCE_CACHE_TTL = 15_000;

export const TOKEN_BALANCE_CACHE_TTL = 30_000;

export const PRICE_CACHE_TTL = 60_000;

export const HISTORY_CACHE_TTL = 20_000;

export const METADATA_CACHE_TTL = 3_600_000;

export const RPC_HEALTH_CACHE_TTL = 30_000;

export async function batchRequests<K, V>(
  keys: K[],
  batchFetcher: (keys: K[]) => Promise<Map<K, V>>,
  deduplicator: RequestDeduplicator,
  keyGenerator: (k: K) => string,
  cacheTtl: number = 0,
): Promise<Map<K, V>> {
  const results = new Map<K, V>();
  const keysToFetch: K[] = [];

  for (const key of keys) {
    const cacheKey = keyGenerator(key);
    const cached = await deduplicator.execute(`check:${cacheKey}`, async () => null, 0);
    if (cached !== null) {
      results.set(key, cached);
    } else {
      keysToFetch.push(key);
    }
  }

  if (keysToFetch.length > 0) {
    const batchKey = `batch:${keysToFetch.map((k) => keyGenerator(k)).join(',')}`;

    const fetched = await deduplicator.execute(batchKey, () => batchFetcher(keysToFetch), cacheTtl);

    for (const [key, value] of fetched.entries()) {
      results.set(key, value);
    }
  }

  return results;
}
