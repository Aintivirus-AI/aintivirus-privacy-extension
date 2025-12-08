/**
 * AINTIVIRUS Wallet Module - Price Service
 * 
 * This module fetches real-time prices for SOL and SPL tokens.
 * Uses CoinGecko API as the primary source.
 * 
 * Features:
 * - SOL/USD price fetching
 * - SPL token price fetching (batch support)
 * - Price caching to avoid rate limits
 * - Fallback handling for failed requests
 */

// Price fetching is optional - errors are handled gracefully

// ============================================
// CONSTANTS
// ============================================

/**
 * CoinGecko API endpoints
 * Free, no API key required
 */
const COINGECKO_SIMPLE_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price';
const COINGECKO_TOKEN_PRICE_API = 'https://api.coingecko.com/api/v3/simple/token_price/solana';

/**
 * Jupiter Price API endpoint
 * Best coverage for Solana tokens including meme coins
 */
const JUPITER_PRICE_API = 'https://api.jup.ag/price/v2';

/**
 * DexScreener API for meme coin prices
 * Better coverage for newer/unverified tokens
 */
const DEXSCREENER_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens';

/**
 * SOL ID for CoinGecko
 */
const SOL_COINGECKO_ID = 'solana';

/**
 * ETH ID for CoinGecko
 */
const ETH_COINGECKO_ID = 'ethereum';

/**
 * SOL mint address (for cache key)
 */
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * ETH cache key
 */
const ETH_CACHE_KEY = 'ethereum-native';

/**
 * Cache duration in milliseconds (30 seconds)
 */
const CACHE_DURATION = 30 * 1000;

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT = 10000;

// ============================================
// TYPES
// ============================================

/**
 * Price data from CoinGecko API
 */
export interface CoinGeckoPriceData {
  [id: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

/**
 * Price with 24h change
 */
export interface PriceWithChange {
  price: number;
  change24h: number | null;
}

/**
 * Cached price entry
 */
interface CachedPrice {
  price: number;
  timestamp: number;
}

/**
 * Price result for a token
 */
export interface TokenPrice {
  mint: string;
  priceUsd: number;
  symbol?: string;
}

// ============================================
// CACHE
// ============================================

/**
 * Price cache map: mint -> { price, timestamp }
 */
const priceCache: Map<string, CachedPrice> = new Map();

/**
 * Check if cached price is still valid
 */
function isCacheValid(entry: CachedPrice | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

/**
 * Clear all cached prices
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, timeout: number = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get SOL price in USD
 * 
 * @returns SOL price in USD, or null if unavailable
 */
export async function getSolPrice(): Promise<number | null> {
  const result = await getSolPriceWithChange();
  return result?.price ?? null;
}

/**
 * Batched price fetch for both SOL and ETH
 * Reduces API calls from 2 to 1 when both are needed
 */
async function fetchBatchedNativePrices(): Promise<void> {
  try {
    const response = await fetchWithTimeout(
      `${COINGECKO_SIMPLE_PRICE_API}?ids=${SOL_COINGECKO_ID},${ETH_COINGECKO_ID}&vs_currencies=usd&include_24hr_change=true`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: CoinGeckoPriceData = await response.json();
    const now = Date.now();
    
    // Cache SOL price
    if (data[SOL_COINGECKO_ID]?.usd) {
      priceCache.set(SOL_MINT, {
        price: data[SOL_COINGECKO_ID].usd,
        timestamp: now,
      });
      if (data[SOL_COINGECKO_ID].usd_24h_change !== undefined) {
        priceCache.set(`${SOL_MINT}_24h`, {
          price: data[SOL_COINGECKO_ID].usd_24h_change,
          timestamp: now,
        });
      }
    }
    
    // Cache ETH price
    if (data[ETH_COINGECKO_ID]?.usd) {
      priceCache.set(ETH_CACHE_KEY, {
        price: data[ETH_COINGECKO_ID].usd,
        timestamp: now,
      });
      if (data[ETH_COINGECKO_ID].usd_24h_change !== undefined) {
        priceCache.set(`${ETH_CACHE_KEY}_24h`, {
          price: data[ETH_COINGECKO_ID].usd_24h_change,
          timestamp: now,
        });
      }
    }
  } catch (error) {
    console.warn('[AINTIVIRUS Wallet] Batched price fetch failed:', error);
    throw error;
  }
}

/**
 * Get SOL price in USD with 24h change
 * 
 * @returns Price with 24h change, or null if unavailable
 */
export async function getSolPriceWithChange(): Promise<PriceWithChange | null> {
  // Check cache first
  const cached = priceCache.get(SOL_MINT);
  const cached24h = priceCache.get(`${SOL_MINT}_24h`);
  if (isCacheValid(cached)) {
    return {
      price: cached!.price,
      change24h: cached24h?.price ?? null,
    };
  }

  try {
    // Fetch both SOL and ETH in one call (batched)
    await fetchBatchedNativePrices();
    
    const newCached = priceCache.get(SOL_MINT);
    const newCached24h = priceCache.get(`${SOL_MINT}_24h`);
    
    if (newCached) {
      return {
        price: newCached.price,
        change24h: newCached24h?.price ?? null,
      };
    }
    
    throw new Error('SOL price not in response');
  } catch (error) {
    // Return cached value if available (even if stale)
    if (cached) {
      return {
        price: cached.price,
        change24h: cached24h?.price ?? null,
      };
    }
    
    throw error;
  }
}

/**
 * Get ETH price in USD
 * 
 * @returns ETH price in USD, or null if unavailable
 */
export async function getEthPrice(): Promise<number | null> {
  const result = await getEthPriceWithChange();
  return result?.price ?? null;
}

/**
 * Get ETH price in USD with 24h change
 * 
 * @returns Price with 24h change, or null if unavailable
 */
export async function getEthPriceWithChange(): Promise<PriceWithChange | null> {
  // Check cache first
  const cached = priceCache.get(ETH_CACHE_KEY);
  const cached24h = priceCache.get(`${ETH_CACHE_KEY}_24h`);
  if (isCacheValid(cached)) {
    return {
      price: cached!.price,
      change24h: cached24h?.price ?? null,
    };
  }

  try {
    // Fetch both SOL and ETH in one call (batched)
    await fetchBatchedNativePrices();
    
    const newCached = priceCache.get(ETH_CACHE_KEY);
    const newCached24h = priceCache.get(`${ETH_CACHE_KEY}_24h`);
    
    if (newCached) {
      return {
        price: newCached.price,
        change24h: newCached24h?.price ?? null,
      };
    }
    
    throw new Error('ETH price not in response');
  } catch (error) {
    // Return cached value if available (even if stale)
    if (cached) {
      return {
        price: cached.price,
        change24h: cached24h?.price ?? null,
      };
    }
    
    throw error;
  }
}

/**
 * Jupiter Price API response type
 */
interface JupiterPriceData {
  data: {
    [mint: string]: {
      id: string;
      type: string;
      price: string;
    };
  };
  timeTaken: number;
}

/**
 * Get prices for multiple tokens using Jupiter Price API
 * Jupiter has the best coverage for Solana tokens including meme coins
 * 
 * @param mints - Array of token mint addresses
 * @returns Map of mint address to price
 */
async function getJupiterTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  if (mints.length === 0) {
    return result;
  }

  try {
    // Jupiter accepts comma-separated mint addresses
    const idsParam = mints.join(',');
    const response = await fetchWithTimeout(
      `${JUPITER_PRICE_API}?ids=${idsParam}`,
      REQUEST_TIMEOUT
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: JupiterPriceData = await response.json();
    
    for (const mint of mints) {
      if (data.data[mint]?.price) {
        const price = parseFloat(data.data[mint].price);
        if (!isNaN(price) && price > 0) {
          result.set(mint, price);
          
          // Cache the result
          priceCache.set(mint, {
            price,
            timestamp: Date.now(),
          });
        }
      }
    }
  } catch (error) {
    console.warn('[AINTIVIRUS Wallet] Jupiter price fetch failed:', error);
  }

  return result;
}

/**
 * DexScreener API response type
 */
interface DexScreenerPriceResponse {
  pairs?: Array<{
    baseToken: {
      address: string;
    };
    priceUsd?: string;
  }>;
}

/**
 * Get prices from DexScreener API (one token at a time)
 * Better coverage for meme coins
 * 
 * @param mints - Array of token mint addresses
 * @returns Map of mint address to price
 */
async function getDexScreenerPrices(mints: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  if (mints.length === 0) {
    return result;
  }

  // DexScreener supports comma-separated addresses
  const addressesParam = mints.join(',');
  
  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_TOKEN_API}/${addressesParam}`,
      REQUEST_TIMEOUT
    );
    
    if (!response.ok) {
      return result;
    }

    const data: DexScreenerPriceResponse = await response.json();
    
    if (data.pairs) {
      for (const pair of data.pairs) {
        if (pair.priceUsd && pair.baseToken.address) {
          const price = parseFloat(pair.priceUsd);
          const mint = pair.baseToken.address;
          
          // Only set if we don't already have a price for this mint
          // (DexScreener may return multiple pairs for same token)
          if (!isNaN(price) && price > 0 && !result.has(mint)) {
            result.set(mint, price);
            
            // Cache the result
            priceCache.set(mint, {
              price,
              timestamp: Date.now(),
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn('[AINTIVIRUS Wallet] DexScreener price fetch failed:', error);
  }

  return result;
}

/**
 * Get prices for multiple tokens
 * Uses Jupiter Price API as primary source (best Solana coverage)
 * Falls back to DexScreener for meme coins, then CoinGecko
 * 
 * @param mints - Array of token mint addresses
 * @returns Map of mint address to price
 */
export async function getTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const mintsToFetch: string[] = [];

  // Check cache first
  for (const mint of mints) {
    const cached = priceCache.get(mint);
    if (isCacheValid(cached)) {
      result.set(mint, cached!.price);
    } else {
      mintsToFetch.push(mint);
    }
  }

  // If all prices are cached, return early
  if (mintsToFetch.length === 0) {
    return result;
  }

  // Try Jupiter first (best coverage for Solana tokens)
  const jupiterPrices = await getJupiterTokenPrices(mintsToFetch);
  
  // Merge Jupiter results and track what's still missing
  let stillMissing: string[] = [];
  for (const mint of mintsToFetch) {
    const jupPrice = jupiterPrices.get(mint);
    if (jupPrice !== undefined) {
      result.set(mint, jupPrice);
    } else {
      stillMissing.push(mint);
    }
  }

  // Try DexScreener for remaining tokens (better meme coin coverage)
  if (stillMissing.length > 0) {
    const dexScreenerPrices = await getDexScreenerPrices(stillMissing);
    
    const afterDexScreener: string[] = [];
    for (const mint of stillMissing) {
      const price = dexScreenerPrices.get(mint);
      if (price !== undefined) {
        result.set(mint, price);
      } else {
        afterDexScreener.push(mint);
      }
    }
    stillMissing = afterDexScreener;
  }

  // Fallback to CoinGecko for remaining tokens
  if (stillMissing.length > 0) {
    try {
      const contractsParam = stillMissing.join(',');
      const response = await fetchWithTimeout(
        `${COINGECKO_TOKEN_PRICE_API}?contract_addresses=${contractsParam}&vs_currencies=usd`
      );
      
      if (response.ok) {
        const data: CoinGeckoPriceData = await response.json();
        
        for (const mint of stillMissing) {
          // CoinGecko returns lowercase contract addresses
          const mintLower = mint.toLowerCase();
          if (data[mintLower]?.usd) {
            const price = data[mintLower].usd;
            result.set(mint, price);
            
            // Cache the result
            priceCache.set(mint, {
              price,
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (error) {
      // Ignore CoinGecko errors, we have Jupiter as primary
      console.warn('[AINTIVIRUS Wallet] CoinGecko fallback failed:', error);
    }
  }

  // Use stale cache values for any remaining missing mints
  for (const mint of mintsToFetch) {
    if (!result.has(mint)) {
      const cached = priceCache.get(mint);
      if (cached) {
        result.set(mint, cached.price);
      }
    }
  }

  return result;
}

/**
 * Get price for a single token
 * 
 * @param mint - Token mint address
 * @returns Token price in USD or null if not found
 */
export async function getTokenPrice(mint: string): Promise<number | null> {
  const prices = await getTokenPrices([mint]);
  return prices.get(mint) || null;
}

// ============================================
// FORMATTING UTILITIES
// ============================================

/**
 * Format USD amount for display
 * 
 * @param amount - Amount in USD
 * @param options - Formatting options
 * @returns Formatted USD string
 */
export function formatUsd(
  amount: number,
  options: { compact?: boolean; showSign?: boolean } = {}
): string {
  const { compact = false, showSign = false } = options;

  if (amount === 0) {
    return '$0.00';
  }

  // For very small amounts
  if (amount > 0 && amount < 0.01) {
    return '<$0.01';
  }

  // Format options
  const formatOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  if (compact && amount >= 1000) {
    formatOptions.notation = 'compact';
    formatOptions.maximumFractionDigits = 1;
  }

  const formatted = new Intl.NumberFormat('en-US', formatOptions).format(Math.abs(amount));
  
  if (showSign && amount > 0) {
    return `+${formatted}`;
  } else if (amount < 0) {
    return `-${formatted}`;
  }
  
  return formatted;
}

/**
 * Calculate total portfolio value in USD
 * 
 * @param solBalance - SOL balance
 * @param solPrice - SOL price in USD
 * @param tokenBalances - Array of { mint, uiBalance } pairs
 * @param tokenPrices - Map of mint to USD price
 * @returns Total portfolio value in USD
 */
export function calculatePortfolioValue(
  solBalance: number,
  solPrice: number,
  tokenBalances: Array<{ mint: string; uiBalance: number }>,
  tokenPrices: Map<string, number>
): number {
  let total = solBalance * solPrice;

  for (const token of tokenBalances) {
    const price = tokenPrices.get(token.mint);
    if (price) {
      total += token.uiBalance * price;
    }
  }

  return total;
}

/**
 * Format price change percentage
 * 
 * @param change - Price change as decimal (e.g., 0.05 for 5%)
 * @returns Formatted percentage string
 */
export function formatPriceChange(change: number): string {
  const percentage = change * 100;
  const sign = percentage >= 0 ? '+' : '';
  return `${sign}${percentage.toFixed(2)}%`;
}
