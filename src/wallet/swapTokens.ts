import type { EVMChainId } from './chains/types';
import { getTokenMetadata } from './chains/evm/tokens';

export interface SwapToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
  chainId?: string;
  verified?: boolean;
  balance?: string;
  usdValue?: number;
}

interface ParaSwapToken {
  symbol: string;
  address: string;
  decimals: number;
  img?: string;
  network?: number;
}

const PARASWAP_TOKEN_API = 'https://api.paraswap.io/tokens';

const TRUSTWALLET_TOKEN_LISTS: Record<EVMChainId, string> = {
  ethereum: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/tokenlist.json',
  polygon: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/polygon/tokenlist.json',
  arbitrum: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/arbitrum/tokenlist.json',
  optimism: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/optimism/tokenlist.json',
  base: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/base/tokenlist.json',
  bnb: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/smartchain/tokenlist.json',
};

const PARASWAP_CHAIN_IDS: Record<EVMChainId, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  bnb: 56,
};

const API_TIMEOUT = 15000;

const CACHE_DURATION = 5 * 60 * 1000;

interface TokenCache {
  tokens: SwapToken[];
  timestamp: number;
}

const tokenCache: Map<string, TokenCache> = new Map();

async function fetchWithTimeout(url: string, timeout: number = API_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getCacheKey(chainType: 'solana' | 'evm', chainId?: EVMChainId): string {
  return chainType === 'solana' ? 'solana' : `evm-${chainId || 'ethereum'}`;
}

function isCacheValid(cache: TokenCache | undefined): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION;
}

const DEXSCREENER_CHAIN_IDS: Record<EVMChainId, string> = {
  ethereum: 'ethereum',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  bnb: 'bsc',
};

async function fetchTokenLogo(
  address: string,
  chainId: EVMChainId
): Promise<string | undefined> {
  const dexScreenerChain = DEXSCREENER_CHAIN_IDS[chainId];
  
  if (dexScreenerChain) {
    try {
      const response = await fetchWithTimeout(
        `https://api.dexscreener.com/latest/dex/tokens/${address}`,
        5000
      );
      if (response.ok) {
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
          const pair = data.pairs[0];
          if (pair.baseToken?.address?.toLowerCase() === address.toLowerCase() && pair.info?.imageUrl) {
            return pair.info.imageUrl;
          }
          if (pair.quoteToken?.address?.toLowerCase() === address.toLowerCase() && pair.info?.imageUrl) {
            return pair.info.imageUrl;
          }
        }
      }
    } catch {
    }
  }
  
  try {
    const cgPlatforms: Record<EVMChainId, string> = {
      ethereum: 'ethereum',
      polygon: 'polygon-pos',
      arbitrum: 'arbitrum-one',
      optimism: 'optimistic-ethereum',
      base: 'base',
      bnb: 'binance-smart-chain',
    };
    const platform = cgPlatforms[chainId];
    if (platform) {
      const response = await fetchWithTimeout(
        `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address.toLowerCase()}`,
        5000
      );
      if (response.ok) {
        const data = await response.json();
        if (data.image?.small || data.image?.thumb) {
          return data.image.small || data.image.thumb;
        }
      }
    }
  } catch {
  }
  
  return undefined;
}

export async function fetchSolanaTokens(): Promise<SwapToken[]> {
  const cacheKey = getCacheKey('solana');
  const cached = tokenCache.get(cacheKey);
  
  if (isCacheValid(cached)) {
    return cached!.tokens;
  }

  const tokens = getDefaultSolanaTokens();
  
  tokenCache.set(cacheKey, { tokens, timestamp: Date.now() });

  return tokens;
}

const DEXSCREENER_SEARCH_API = 'https://api.dexscreener.com/latest/dex/search';
const DEXSCREENER_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens';

const JUPITER_TOKEN_API = 'https://tokens.jup.ag/token';

function getDexScreenerLogo(pair: { info?: { imageUrl?: string }; baseToken: { address: string; symbol: string } }): string {
  if (pair.info?.imageUrl) {
    return pair.info.imageUrl;
  }
  return `https://img.jup.ag/tokens/${pair.baseToken.address}`;
}

async function getTokenDecimalsFromJupiter(address: string): Promise<number | null> {
  try {
    const response = await fetchWithTimeout(
      `${JUPITER_TOKEN_API}/${address}`,
      5000
    );

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.decimals === 'number') {
        return data.decimals;
      }
    }
  } catch {
  }
  return null;
}

/**
 * Search tokens on DexScreener (finds any token with liquidity)
 * Then enriches with correct decimals from Jupiter API
 */
async function searchDexScreener(query: string): Promise<SwapToken[]> {
  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_SEARCH_API}?q=${encodeURIComponent(query)}`,
      10000
    );
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const pairs = data.pairs || [];
    
    // Check if query looks like an address - if so, filter for exact match only
    const isAddressQuery = isSolanaAddress(query.trim());
    const normalizedQuery = query.trim().toLowerCase();
    
    // Filter for Solana tokens and deduplicate by address
    const seenAddresses = new Set<string>();
    const tokens: SwapToken[] = [];
    
    for (const pair of pairs) {
      if (pair.chainId !== 'solana') continue;
      
      if (isAddressQuery) {
        if (pair.baseToken?.address === query.trim()) {
          if (!seenAddresses.has(pair.baseToken.address)) {
            seenAddresses.add(pair.baseToken.address);
            const decimals = await getTokenDecimalsFromJupiter(pair.baseToken.address) ?? 6;
            tokens.push({
              address: pair.baseToken.address,
              symbol: pair.baseToken.symbol,
              name: pair.baseToken.name || pair.baseToken.symbol,
              decimals,
              logoUri: getDexScreenerLogo(pair),
              verified: false,
              chainId: 'solana',
            });
            // For address search, we only need one exact match
            return tokens;
          }
        }
        if (pair.quoteToken?.address === query.trim()) {
          if (!seenAddresses.has(pair.quoteToken.address)) {
            seenAddresses.add(pair.quoteToken.address);
            const decimals = await getTokenDecimalsFromJupiter(pair.quoteToken.address) ?? 6;
            tokens.push({
              address: pair.quoteToken.address,
              symbol: pair.quoteToken.symbol,
              name: pair.quoteToken.name || pair.quoteToken.symbol,
              decimals,
              logoUri: getDexScreenerLogo(pair),
              verified: false,
              chainId: 'solana',
            });
            return tokens;
          }
        }
        continue;
      }
      
      if (pair.baseToken && !seenAddresses.has(pair.baseToken.address)) {
        seenAddresses.add(pair.baseToken.address);
        tokens.push({
          address: pair.baseToken.address,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name || pair.baseToken.symbol,
          decimals: 6,
          logoUri: getDexScreenerLogo(pair),
          verified: false,
          chainId: 'solana',
        });
      }
    }
    
    // Enrich tokens with correct decimals from Jupiter API (in parallel for speed)
    const enrichedTokens = await Promise.all(
      tokens.slice(0, 50).map(async (token) => {
        const decimals = await getTokenDecimalsFromJupiter(token.address);
        if (decimals !== null) {
          return { ...token, decimals };
        }
        return token;
      })
    );
    
    return enrichedTokens;
  } catch {
    return [];
  }
}

function isSolanaAddress(str: string): boolean {
  if (str.length < 32 || str.length > 44) return false;
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(str);
}

/**
 * Search Solana tokens by symbol, name, or address
 * Uses DexScreener exclusively for reliable token search
 */
export async function searchSolanaTokens(query: string): Promise<SwapToken[]> {
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  
  if (!trimmedQuery) {
    return getDefaultSolanaTokens();
  }

  if (isSolanaAddress(trimmedQuery)) {
    const tokenInfo = await fetchSolanaTokenByAddress(trimmedQuery);
    if (tokenInfo) return [tokenInfo];
    
    const jupiterToken = await fetchTokenFromJupiter(trimmedQuery);
    if (jupiterToken) return [jupiterToken];
    
    return [];
  }

  const defaultTokens = getDefaultSolanaTokens();
  const solToken = defaultTokens[0];
  const solMatches = normalizedQuery === 'sol' || 
                     normalizedQuery === 'solana' ||
                     'solana'.startsWith(normalizedQuery) ||
                     'sol'.startsWith(normalizedQuery);

  // Search using DexScreener
  const dexScreenerTokens = await searchDexScreener(query);

  // Combine results: add SOL if it matches the query
  let results = [...dexScreenerTokens];
  if (solMatches) {
    // Check if SOL is already in results (shouldn't be, but be safe)
    const hasSol = results.some(t => t.address === solToken.address);
    if (!hasSol) {
      results = [solToken, ...results];
    }
  }

  for (const token of defaultTokens.slice(1)) {
    const matches = token.symbol.toLowerCase().startsWith(normalizedQuery) ||
                    token.name.toLowerCase().startsWith(normalizedQuery);
    if (matches && !results.some(t => t.address === token.address)) {
      results.push(token);
    }
  }

  return results.sort((a, b) => {
    const aExact = a.symbol.toLowerCase() === normalizedQuery;
    const bExact = b.symbol.toLowerCase() === normalizedQuery;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    // Then by symbol match (starts with query)
    const aStartsWith = a.symbol.toLowerCase().startsWith(normalizedQuery);
    const bStartsWith = b.symbol.toLowerCase().startsWith(normalizedQuery);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    return a.symbol.localeCompare(b.symbol);
  }).slice(0, 100);
}

export async function fetchSolanaTokenByAddress(address: string): Promise<SwapToken | null> {
  const jupiterToken = await fetchTokenFromJupiter(address);
  if (jupiterToken) {
    return jupiterToken;
  }

  try {
    const dexResponse = await fetchWithTimeout(
      `${DEXSCREENER_TOKEN_API}/${address}`,
      10000
    );

    if (dexResponse.ok) {
      const data = await dexResponse.json();
      const pairs = data.pairs || [];
      
      const solanaPair = pairs.find((p: { chainId: string }) => p.chainId === 'solana');
      if (solanaPair) {
        const isBaseToken = solanaPair.baseToken?.address === address;
        const tokenData = isBaseToken ? solanaPair.baseToken : solanaPair.quoteToken;
        
        if (tokenData) {
          const logoUri = solanaPair.info?.imageUrl || getTokenLogoUrl(tokenData.address, tokenData.symbol);
          
          const decimals = await getTokenDecimalsFromJupiter(tokenData.address) ?? 6;
          
          return {
            address: tokenData.address,
            symbol: tokenData.symbol,
            name: tokenData.name || tokenData.symbol,
            decimals,
            logoUri,
            verified: false,
            chainId: 'solana',
          };
        }
      }
    }
  } catch {
  }

  return null;
}

async function fetchTokenFromJupiter(address: string): Promise<SwapToken | null> {
  try {
    const response = await fetchWithTimeout(
      `${JUPITER_TOKEN_API}/${address}`,
      10000
    );

    if (response.ok) {
      const data = await response.json();
      
      if (data && data.address) {
        return {
          address: data.address,
          symbol: data.symbol || 'UNKNOWN',
          name: data.name || data.symbol || 'Unknown Token',
          decimals: data.decimals || 9,
          logoUri: data.logoURI || `https://img.jup.ag/tokens/${address}`,
          verified: data.tags?.includes('verified') || data.tags?.includes('strict') || false,
          chainId: 'solana',
        };
      }
    }
  } catch {
    // Jupiter lookup failed
  }

  return null;
}

/**
 * Generate a placeholder for unknown tokens
 * Only used when no logo URI is available and we can't find one from Jupiter
 */
function getDefaultSolanaLogo(_symbol: string): string {
  // Return a generic crypto placeholder - NOT the SOL logo
  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239CA3AF"%3E%3Ccircle cx="12" cy="12" r="10" stroke="%236B7280" stroke-width="1" fill="%231F2937"/%3E%3Ctext x="12" y="16" text-anchor="middle" font-size="10" fill="%239CA3AF"%3E%3F%3C/text%3E%3C/svg%3E';
}

function getTokenLogoUrl(address: string, _symbol: string): string {
  return `https://img.jup.ag/tokens/${address}`;
}

function getDefaultSolanaTokens(): SwapToken[] {
  return [
    {
      address: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      logoUri: 'https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png',
      verified: true,
    },
    {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      logoUri: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
      verified: true,
    },
    {
      address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      logoUri: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
      verified: true,
    },
    {
      address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: 'JUP',
      name: 'Jupiter',
      decimals: 6,
      logoUri: 'https://static.jup.ag/jup/icon.png',
      verified: true,
    },
    {
      address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      symbol: 'BONK',
      name: 'Bonk',
      decimals: 5,
      logoUri: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
      verified: true,
    },
  ];
}

async function fetchTrustWalletTokens(chainId: EVMChainId): Promise<SwapToken[]> {
  const listUrl = TRUSTWALLET_TOKEN_LISTS[chainId];
  if (!listUrl) return [];
  
  try {
    const response = await fetchWithTimeout(listUrl, 10000);
    if (!response.ok) return [];
    
    const data = await response.json();
    const tokenList = data.tokens || [];
    
    return tokenList
      .filter((t: { address?: string; symbol?: string }) => t.address && t.symbol)
      .map((token: { address: string; symbol: string; name?: string; decimals?: number; logoURI?: string }) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name || token.symbol,
        decimals: token.decimals || 18,
        logoUri: token.logoURI || getDefaultEVMLogo(chainId),
        verified: true,
        chainId,
      }))
      .slice(0, 200);
  } catch {
    return [];
  }
}

export async function fetchEVMTokens(chainId: EVMChainId = 'ethereum'): Promise<SwapToken[]> {
  const cacheKey = getCacheKey('evm', chainId);
  const cached = tokenCache.get(cacheKey);
  
  if (isCacheValid(cached)) {
    return cached!.tokens;
  }

  let tokens: SwapToken[] = [];

  try {
    const networkId = PARASWAP_CHAIN_IDS[chainId];
    const response = await fetchWithTimeout(`${PARASWAP_TOKEN_API}/${networkId}`);
    
    if (response.ok) {
      const data = await response.json();
      const tokenList: ParaSwapToken[] = data.tokens || [];

      tokens = tokenList.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.symbol,
        decimals: token.decimals,
        logoUri: token.img || getDefaultEVMLogo(chainId),
        verified: true,
        chainId,
      }));
    }
  } catch (error) {
    console.warn('[swapTokens] ParaSwap API failed (may be geo-blocked):', error);
  }

  // If ParaSwap failed or returned empty, try TrustWallet CDN fallback
  // This works in OFAC-sanctioned countries since it's just static JSON on CDN
  if (tokens.length === 0) {
    console.log('[swapTokens] Trying TrustWallet CDN fallback for token list');
    tokens = await fetchTrustWalletTokens(chainId);
  }

  if (tokens.length === 0) {
    return getDefaultEVMTokens(chainId);
  }

  // Sort tokens: prioritize native token and major stablecoins
  tokens.sort((a, b) => {
    const nativeSymbols = getNativeSymbol(chainId);
    const priority = [nativeSymbols, 'WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
    const aIdx = priority.indexOf(a.symbol);
    const bIdx = priority.indexOf(b.symbol);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

  tokenCache.set(cacheKey, { tokens, timestamp: Date.now() });

  return tokens;
}

export async function searchEVMTokens(
  query: string,
  chainId: EVMChainId = 'ethereum'
): Promise<SwapToken[]> {
  const allTokens = await fetchEVMTokens(chainId);
  const normalizedQuery = query.toLowerCase().trim();
  
  if (!normalizedQuery) {
    return allTokens.slice(0, 50);
  }

  let customTokens: SwapToken[] = [];
  try {
    const { getWalletSettings, getCachedTokenMetadata } = await import('./storage');
    const settings = await getWalletSettings();
    const evmCustomTokens = (settings.customTokens || []).filter(
      (t) => t.mint.startsWith('0x') && t.mint.length === 42
    );
    
    for (const ct of evmCustomTokens) {
      const cachedMeta = await getCachedTokenMetadata(ct.mint.toLowerCase());
      
      customTokens.push({
        address: ct.mint,
        symbol: ct.symbol || cachedMeta?.symbol || ct.mint.slice(0, 6) + '...',
        name: ct.name || cachedMeta?.name || 'Custom Token',
        decimals: cachedMeta?.decimals || 18,
        logoUri: ct.logoUri || cachedMeta?.logoUri || '',
        verified: false,
        chainId,
      });
    }
  } catch (error) {
    // Continue without custom tokens if storage access fails
    console.warn('[swapTokens] Could not load custom tokens:', error);
  }

  // Check if it's an address search (0x + 40 hex chars)
  const isAddressSearch = normalizedQuery.startsWith('0x') && normalizedQuery.length === 42;
  
  if (isAddressSearch) {
    // Search for exact address match in cached API tokens
    const exactMatch = allTokens.find(
      (t) => t.address.toLowerCase() === normalizedQuery
    );
    if (exactMatch) return [exactMatch];
    
    const customMatch = customTokens.find(
      (t) => t.address.toLowerCase() === normalizedQuery
    );
    if (customMatch && customMatch.symbol && !customMatch.symbol.includes('...')) {
      return [customMatch];
    }
    
    try {
      const { getCachedTokenMetadata, saveTokenMetadataToCache } = await import('./storage');
      const cachedMeta = await getCachedTokenMetadata(normalizedQuery);
      
      if (cachedMeta && cachedMeta.symbol && cachedMeta.symbol !== '???') {
        let logoUri = cachedMeta.logoUri || '';
        
        // If no logo in cache, try to fetch from external sources
        if (!logoUri) {
          try {
            const fetchedLogo = await fetchTokenLogo(normalizedQuery, chainId);
            if (fetchedLogo) {
              logoUri = fetchedLogo;
              // Update cache with logo
              await saveTokenMetadataToCache(normalizedQuery, {
                symbol: cachedMeta.symbol,
                name: cachedMeta.name,
                decimals: cachedMeta.decimals,
                logoUri,
              });
            }
          } catch {
          }
        }
        
        return [{
          address: normalizedQuery,
          symbol: cachedMeta.symbol,
          name: cachedMeta.name || cachedMeta.symbol,
          decimals: cachedMeta.decimals || 18,
          logoUri,
          verified: false,
          chainId,
        }];
      }
    } catch {
      // Continue to RPC fallback
    }
    
    // Not in cache - try to fetch token info from blockchain
    try {
      const metadata = await getTokenMetadata(chainId, false, normalizedQuery);
      
      if (metadata && metadata.symbol !== '???' && metadata.name !== 'Unknown Token') {
        let logoUri = metadata.logoUri || '';
        if (!logoUri) {
          try {
            const fetchedLogo = await fetchTokenLogo(normalizedQuery, chainId);
            if (fetchedLogo) {
              logoUri = fetchedLogo;
              try {
                const { saveTokenMetadataToCache } = await import('./storage');
                await saveTokenMetadataToCache(normalizedQuery, {
                  symbol: metadata.symbol,
                  name: metadata.name,
                  decimals: metadata.decimals,
                  logoUri,
                });
              } catch {
                // Caching failed, continue without
              }
            }
          } catch {
            // Logo fetch failed, continue without
          }
        }
        
        return [{
          address: metadata.address,
          symbol: metadata.symbol,
          name: metadata.name,
          decimals: metadata.decimals,
          logoUri,
          verified: false, // Mark as unverified since it's not in the official list
          chainId,
        }];
      }
      
      // Even if we only got partial info, return it so user can try
      if (metadata && metadata.symbol !== '???') {
        // Try to fetch logo for partial metadata too
        let logoUri = metadata.logoUri || '';
        if (!logoUri) {
          try {
            const fetchedLogo = await fetchTokenLogo(normalizedQuery, chainId);
            if (fetchedLogo) logoUri = fetchedLogo;
          } catch {
            // Logo fetch failed, continue without
          }
        }
        
        return [{
          address: metadata.address,
          symbol: metadata.symbol,
          name: metadata.name || metadata.symbol,
          decimals: metadata.decimals,
          logoUri,
          verified: false,
          chainId,
        }];
      }
    } catch (error) {
      console.warn('[swapTokens] Failed to fetch on-chain token metadata:', error);
    }
    
    if (customMatch) {
      return [customMatch];
    }
    
    return [];
  }

  // Search by symbol or name - include both API tokens AND custom tokens
  const apiResults = allTokens.filter((token) => {
    const symbolMatch = token.symbol.toLowerCase().includes(normalizedQuery);
    const nameMatch = token.name.toLowerCase().includes(normalizedQuery);
    return symbolMatch || nameMatch;
  });
  
  const customResults = customTokens.filter((token) => {
    const symbolMatch = token.symbol.toLowerCase().includes(normalizedQuery);
    const nameMatch = token.name.toLowerCase().includes(normalizedQuery);
    return symbolMatch || nameMatch;
  });
  
  // Merge results, custom tokens first (user's tokens), avoiding duplicates
  const apiAddresses = new Set(apiResults.map((t) => t.address.toLowerCase()));
  const uniqueCustom = customResults.filter(
    (t) => !apiAddresses.has(t.address.toLowerCase())
  );
  const results = [...uniqueCustom, ...apiResults];

  // Sort: exact symbol match first
  return results.sort((a, b) => {
    const aExact = a.symbol.toLowerCase() === normalizedQuery;
    const bExact = b.symbol.toLowerCase() === normalizedQuery;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  }).slice(0, 50);
}

function getNativeSymbol(chainId: EVMChainId): string {
  switch (chainId) {
    case 'polygon':
      return 'MATIC';
    default:
      return 'ETH';
  }
}

function getDefaultEVMLogo(chainId: EVMChainId): string {
  switch (chainId) {
    case 'polygon':
      return 'https://assets.coingecko.com/coins/images/4713/small/polygon.png';
    default:
      return 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';
  }
}

const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function getDefaultEVMTokens(chainId: EVMChainId): SwapToken[] {
  const nativeLogo = getDefaultEVMLogo(chainId);
  
  const commonTokens: Record<EVMChainId, SwapToken[]> = {
    ethereum: [
      {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        verified: true,
      },
      {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        verified: true,
      },
      {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
        verified: true,
      },
      {
        address: '0x6B175474E89094C44Da98b954EescdeCB5e6fBEf',
        symbol: 'DAI',
        name: 'Dai Stablecoin',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
        verified: true,
      },
      {
        address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        decimals: 8,
        logoUri: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
        verified: true,
      },
    ],
    polygon: [
      {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'MATIC',
        name: 'Polygon',
        decimals: 18,
        logoUri: nativeLogo,
        verified: true,
      },
      {
        address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        verified: true,
      },
      {
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
        verified: true,
      },
    ],
    arbitrum: [
      {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        verified: true,
      },
      {
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        verified: true,
      },
      {
        address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
        symbol: 'ARB',
        name: 'Arbitrum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
        verified: true,
      },
    ],
    optimism: [
      {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        verified: true,
      },
      {
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        verified: true,
      },
      {
        address: '0x4200000000000000000000000000000000000042',
        symbol: 'OP',
        name: 'Optimism',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
        verified: true,
      },
    ],
    base: [
      {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        verified: true,
      },
      {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        verified: true,
      },
    ],
    bnb: [
      {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: 'BNB',
        name: 'BNB',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
        verified: true,
      },
      {
        address: '0x55d398326f99059fF775485246999027B3197955',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
        verified: true,
      },
      {
        address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        verified: true,
      },
      {
        address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/9576/small/BUSD.png',
        verified: true,
      },
      {
        address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
        symbol: 'CAKE',
        name: 'PancakeSwap',
        decimals: 18,
        logoUri: 'https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo.png',
        verified: true,
      },
    ],
  };

  return commonTokens[chainId] || commonTokens.ethereum;
}

export async function searchSwapTokens(
  query: string,
  chainType: 'solana' | 'evm',
  evmChainId?: EVMChainId
): Promise<SwapToken[]> {
  if (chainType === 'solana') {
    return searchSolanaTokens(query);
  }
  return searchEVMTokens(query, evmChainId || 'ethereum');
}

/**
 * Get popular/default tokens for a chain
 */
export async function getPopularTokens(
  chainType: 'solana' | 'evm',
  evmChainId?: EVMChainId,
  limit: number = 20
): Promise<SwapToken[]> {
  if (chainType === 'solana') {
    const tokens = await fetchSolanaTokens();
    return tokens.slice(0, limit);
  }
  const tokens = await fetchEVMTokens(evmChainId || 'ethereum');
  return tokens.slice(0, limit);
}

export function clearTokenCache(): void {
  tokenCache.clear();
}


