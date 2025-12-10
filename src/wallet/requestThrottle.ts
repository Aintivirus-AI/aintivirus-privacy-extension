

export interface ThrottleConfig {
  
  maxRequests: number;
  
  windowMs: number;
  
  maxConcurrent: number;
  
  backoffMultiplier: number;
  
  maxBackoffMs: number;
}

interface PendingRequest<T> {
  key: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: number;
  timestamp: number;
}

interface CoalescedRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}


const DEFAULT_CONFIG: ThrottleConfig = {
  maxRequests: 10,        
  windowMs: 1000,         
  maxConcurrent: 5,       
  backoffMultiplier: 2,   
  maxBackoffMs: 30000,    
};


class RequestThrottle {
  private config: ThrottleConfig;
  private requestTimestamps: number[] = [];
  private currentConcurrent = 0;
  private queue: PendingRequest<unknown>[] = [];
  private coalescedRequests: Map<string, CoalescedRequest<unknown>> = new Map();
  private backoffUntil = 0;
  private currentBackoffMs = 1000;
  private processing = false;

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  
  async execute<T>(
    key: string,
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    
    const coalesced = this.coalescedRequests.get(key);
    if (coalesced && Date.now() - coalesced.timestamp < 100) {
      
      return coalesced.promise as Promise<T>;
    }

    
    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        key,
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
        timestamp: Date.now(),
      });
      
      
      this.queue.sort((a, b) => b.priority - a.priority);
    });

    
    this.coalescedRequests.set(key, {
      promise: promise as Promise<unknown>,
      timestamp: Date.now(),
    });

    
    this.processQueue();

    return promise;
  }

  
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        
        const now = Date.now();
        if (now < this.backoffUntil) {
          await this.sleep(this.backoffUntil - now);
        }

        
        await this.waitForRateLimit();

        
        if (this.currentConcurrent >= this.config.maxConcurrent) {
          await this.sleep(50);
          continue;
        }

        
        const request = this.queue.shift();
        if (!request) break;

        
        this.currentConcurrent++;
        this.recordRequest();

        this.executeRequest(request);
      }
    } finally {
      this.processing = false;
    }
  }

  
  private async executeRequest(request: PendingRequest<unknown>): Promise<void> {
    try {
      const result = await request.execute();
      request.resolve(result);
      
      
      this.currentBackoffMs = 1000;
    } catch (error) {
      
      if (this.isRateLimitError(error)) {
        
        this.backoffUntil = Date.now() + this.currentBackoffMs;
        this.currentBackoffMs = Math.min(
          this.currentBackoffMs * this.config.backoffMultiplier,
          this.config.maxBackoffMs
        );
        
        this.queue.unshift(request);
      } else {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.currentConcurrent--;
      this.cleanupCoalesced(request.key);
    }
  }

  
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < this.config.windowMs
    );

    
    while (this.requestTimestamps.length >= this.config.maxRequests) {
      const oldestTs = this.requestTimestamps[0];
      const waitTime = oldestTs + this.config.windowMs - now + 10;
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
      
      this.requestTimestamps = this.requestTimestamps.filter(
        ts => Date.now() - ts < this.config.windowMs
      );
    }
  }

  
  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('throttle')
      );
    }
    return false;
  }

  
  private cleanupCoalesced(key: string): void {
    setTimeout(() => {
      const coalesced = this.coalescedRequests.get(key);
      if (coalesced && Date.now() - coalesced.timestamp > 5000) {
        this.coalescedRequests.delete(key);
      }
    }, 5000);
  }

  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  
  getQueueSize(): number {
    return this.queue.length;
  }

  
  getConcurrentCount(): number {
    return this.currentConcurrent;
  }

  
  clear(): void {
    for (const request of this.queue) {
      request.reject(new Error('Request cancelled'));
    }
    this.queue = [];
    this.coalescedRequests.clear();
  }
}


export const solanaThrottle = new RequestThrottle({
  maxRequests: 8,       
  windowMs: 1000,
  maxConcurrent: 4,     
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
});


export const evmThrottle = new RequestThrottle({
  maxRequests: 12,      
  windowMs: 1000,
  maxConcurrent: 6,     
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
});


export const externalApiThrottle = new RequestThrottle({
  maxRequests: 5,       
  windowMs: 1000,
  maxConcurrent: 3,     
  backoffMultiplier: 3, 
  maxBackoffMs: 60000,  
});


export async function throttledSolanaRpc<T>(
  key: string,
  execute: () => Promise<T>,
  priority: number = 0
): Promise<T> {
  return solanaThrottle.execute(key, execute, priority);
}


export async function throttledEvmRpc<T>(
  key: string,
  execute: () => Promise<T>,
  priority: number = 0
): Promise<T> {
  return evmThrottle.execute(key, execute, priority);
}


export async function throttledExternalApi<T>(
  key: string,
  execute: () => Promise<T>,
  priority: number = 0
): Promise<T> {
  return externalApiThrottle.execute(key, execute, priority);
}


export function isHardFailure(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('403') ||
      msg.includes('401') ||
      msg.includes('forbidden') ||
      msg.includes('unauthorized') ||
      msg.includes('access denied') ||
      msg.includes('api key') ||
      msg.includes('invalid api') ||
      msg.includes('-32052') 
    );
  }
  return false;
}


export function isSoftFailure(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('timeout') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('network') ||
      msg.includes('fetch failed')
    );
  }
  return false;
}


