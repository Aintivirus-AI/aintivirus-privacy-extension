import { priceDedup, priceKey, batchPriceKey, PRICE_CACHE_TTL } from './requestDedup';

// Price helpers cache USD quotes from CoinGecko/Jupiter so the wallet UI can
// display native token valuations without flooding the APIs.

const COINGECKO_SIMPLE_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price';
const COINGECKO_TOKEN_PRICE_SOLANA_API =
  'https://api.coingecko.com/api/v3/simple/token_price/solana';
const COINGECKO_TOKEN_PRICE_ETHEREUM_API =
  'https://api.coingecko.com/api/v3/simple/token_price/ethereum';

const JUPITER_PRICE_API = 'https://api.jup.ag/price/v2';

const DEXSCREENER_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens';

const SOL_COINGECKO_ID = 'solana';

const ETH_COINGECKO_ID = 'ethereum';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

const ETH_CACHE_KEY = 'ethereum-native';

const CACHE_DURATION = 30 * 1000;

const REQUEST_TIMEOUT = 10000;

export interface CoinGeckoPriceData {
  [id: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

export interface PriceWithChange {
  price: number;
  change24h: number | null;
}

interface CachedPrice {
  price: number;
  timestamp: number;
}

export interface TokenPrice {
  mint: string;
  priceUsd: number;
  symbol?: string;
}

const priceCache: Map<string, CachedPrice> = new Map();

function isCacheValid(entry: CachedPrice | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

export function clearPriceCache(): void {
  priceCache.clear();
}

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

export async function getSolPrice(): Promise<number | null> {
  const result = await getSolPriceWithChange();
  return result?.price ?? null;
}

async function fetchBatchedNativePrices(): Promise<void> {
  try {
    const response = await fetchWithTimeout(
      `${COINGECKO_SIMPLE_PRICE_API}?ids=${SOL_COINGECKO_ID},${ETH_COINGECKO_ID}&vs_currencies=usd&include_24hr_change=true`,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: CoinGeckoPriceData = await response.json();
    const now = Date.now();

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
    throw error;
  }
}

export async function getSolPriceWithChange(): Promise<PriceWithChange | null> {
  const cached = priceCache.get(SOL_MINT);
  const cached24h = priceCache.get(`${SOL_MINT}_24h`);
  if (isCacheValid(cached)) {
    return {
      price: cached!.price,
      change24h: cached24h?.price ?? null,
    };
  }

  const cacheKey = priceKey('sol-native', 'usd');

  return priceDedup.execute(
    cacheKey,
    async () => {
      try {
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
        if (cached) {
          return {
            price: cached.price,
            change24h: cached24h?.price ?? null,
          };
        }

        throw error;
      }
    },
    PRICE_CACHE_TTL,
  );
}

export async function getEthPrice(): Promise<number | null> {
  const result = await getEthPriceWithChange();
  return result?.price ?? null;
}

export async function getEthPriceWithChange(): Promise<PriceWithChange | null> {
  const cached = priceCache.get(ETH_CACHE_KEY);
  const cached24h = priceCache.get(`${ETH_CACHE_KEY}_24h`);
  if (isCacheValid(cached)) {
    return {
      price: cached!.price,
      change24h: cached24h?.price ?? null,
    };
  }

  const cacheKey = priceKey('eth-native', 'usd');

  return priceDedup.execute(
    cacheKey,
    async () => {
      try {
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
        if (cached) {
          return {
            price: cached.price,
            change24h: cached24h?.price ?? null,
          };
        }

        throw error;
      }
    },
    PRICE_CACHE_TTL,
  );
}

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

async function getJupiterTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (mints.length === 0) {
    return result;
  }

  try {
    const idsParam = mints.join(',');
    const response = await fetchWithTimeout(
      `${JUPITER_PRICE_API}?ids=${idsParam}`,
      REQUEST_TIMEOUT,
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

          priceCache.set(mint, {
            price,
            timestamp: Date.now(),
          });
        }
      }
    }
  } catch (error) {}

  return result;
}

interface DexScreenerPriceResponse {
  pairs?: Array<{
    baseToken: {
      address: string;
    };
    priceUsd?: string;
  }>;
}

async function getDexScreenerPrices(mints: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (mints.length === 0) {
    return result;
  }

  const addressesParam = mints.join(',');

  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_TOKEN_API}/${addressesParam}`,
      REQUEST_TIMEOUT,
    );

    if (!response.ok) {
      return result;
    }

    const data: DexScreenerPriceResponse = await response.json();

    if (data.pairs) {
      for (const pair of data.pairs) {
        if (pair.priceUsd && pair.baseToken.address) {
          const price = parseFloat(pair.priceUsd);
          const rawAddress = pair.baseToken.address;
          // For EVM addresses, normalize to lowercase for consistent lookups
          // DexScreener returns checksummed EVM addresses but we query with lowercase
          // Solana addresses are case-sensitive base58, so don't lowercase those
          const mint = isEVMAddress(rawAddress) ? rawAddress.toLowerCase() : rawAddress;

          if (!isNaN(price) && price > 0 && !result.has(mint)) {
            result.set(mint, price);

            priceCache.set(mint, {
              price,
              timestamp: Date.now(),
            });
          }
        }
      }
    }
  } catch (error) {}

  return result;
}

function isEVMAddress(address: string): boolean {
  return address.startsWith('0x') && address.length === 42;
}

export async function getTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const mintsToFetch: string[] = [];

  for (const mint of mints) {
    const cached = priceCache.get(mint);
    if (isCacheValid(cached)) {
      result.set(mint, cached!.price);
    } else {
      mintsToFetch.push(mint);
    }
  }

  if (mintsToFetch.length === 0) {
    return result;
  }

  const solanaMints: string[] = [];
  const evmAddresses: string[] = [];

  for (const mint of mintsToFetch) {
    if (isEVMAddress(mint)) {
      evmAddresses.push(mint);
    } else {
      solanaMints.push(mint);
    }
  }

  const cacheKey = batchPriceKey(mintsToFetch.slice().sort(), 'usd');

  const fetchedPrices = await priceDedup.execute(
    cacheKey,
    async () => {
      const batchResult = new Map<string, number>();

      if (solanaMints.length > 0) {
        const jupiterPrices = await getJupiterTokenPrices(solanaMints);

        let stillMissing: string[] = [];
        for (const mint of solanaMints) {
          const jupPrice = jupiterPrices.get(mint);
          if (jupPrice !== undefined) {
            batchResult.set(mint, jupPrice);
          } else {
            stillMissing.push(mint);
          }
        }

        if (stillMissing.length > 0) {
          const dexScreenerPrices = await getDexScreenerPrices(stillMissing);

          const afterDexScreener: string[] = [];
          for (const mint of stillMissing) {
            const price = dexScreenerPrices.get(mint);
            if (price !== undefined) {
              batchResult.set(mint, price);
            } else {
              afterDexScreener.push(mint);
            }
          }
          stillMissing = afterDexScreener;
        }

        if (stillMissing.length > 0) {
          try {
            const contractsParam = stillMissing.join(',');
            const response = await fetchWithTimeout(
              `${COINGECKO_TOKEN_PRICE_SOLANA_API}?contract_addresses=${contractsParam}&vs_currencies=usd`,
            );

            if (response.ok) {
              const data: CoinGeckoPriceData = await response.json();

              for (const mint of stillMissing) {
                const mintLower = mint.toLowerCase();
                if (data[mintLower]?.usd) {
                  const price = data[mintLower].usd;
                  batchResult.set(mint, price);

                  priceCache.set(mint, {
                    price,
                    timestamp: Date.now(),
                  });
                }
              }
            }
          } catch (error) {}
        }
      }

      if (evmAddresses.length > 0) {
        const dexScreenerPrices = await getDexScreenerPrices(evmAddresses);

        let stillMissing: string[] = [];
        for (const address of evmAddresses) {
          const price = dexScreenerPrices.get(address);
          if (price !== undefined) {
            batchResult.set(address, price);
          } else {
            stillMissing.push(address);
          }
        }

        if (stillMissing.length > 0) {
          try {
            const contractsParam = stillMissing.join(',');
            const response = await fetchWithTimeout(
              `${COINGECKO_TOKEN_PRICE_ETHEREUM_API}?contract_addresses=${contractsParam}&vs_currencies=usd`,
            );

            if (response.ok) {
              const data: CoinGeckoPriceData = await response.json();

              for (const address of stillMissing) {
                const addressLower = address.toLowerCase();
                if (data[addressLower]?.usd) {
                  const price = data[addressLower].usd;
                  batchResult.set(address, price);

                  priceCache.set(address, {
                    price,
                    timestamp: Date.now(),
                  });
                }
              }
            }
          } catch (error) {}
        }
      }

      return batchResult;
    },
    PRICE_CACHE_TTL,
  );

  for (const [mint, price] of fetchedPrices.entries()) {
    result.set(mint, price);
  }

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

export async function getTokenPrice(mint: string): Promise<number | null> {
  const prices = await getTokenPrices([mint]);
  return prices.get(mint) || null;
}

export function formatUsd(
  amount: number,
  options: { compact?: boolean; showSign?: boolean } = {},
): string {
  const { compact = false, showSign = false } = options;

  if (amount === 0) {
    return '$0.00';
  }

  if (amount > 0 && amount < 0.01) {
    return '<$0.01';
  }

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

export function calculatePortfolioValue(
  solBalance: number,
  solPrice: number,
  tokenBalances: Array<{ mint: string; uiBalance: number }>,
  tokenPrices: Map<string, number>,
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

export function formatPriceChange(change: number): string {
  const percentage = change * 100;
  const sign = percentage >= 0 ? '+' : '';
  return `${sign}${percentage.toFixed(2)}%`;
}
