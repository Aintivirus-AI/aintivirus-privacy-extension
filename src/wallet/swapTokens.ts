/**
 * Dynamic Token List Services for Swap
 * 
 * Provides token discovery and search for:
 * - Solana (via DexScreener API)
 * - EVM chains (via ParaSwap tokens API)
 */

import type { EVMChainId } from './chains/types';
import { getTokenMetadata } from './chains/evm/tokens';

// ============================================================================
// Types
// ============================================================================

export interface SwapToken {
  address: string; // mint for Solana, contract address for EVM
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
  chainId?: string;
  verified?: boolean;
  // Optional: balance info if user holds this token
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

// ============================================================================
// Configuration
// ============================================================================

// ParaSwap Token API - for EVM tokens
const PARASWAP_TOKEN_API = 'https://api.paraswap.io/tokens';

// Chain ID mapping for ParaSwap
const PARASWAP_CHAIN_IDS: Record<EVMChainId, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  bnb: 56,
};

// API timeout
const API_TIMEOUT = 15000;

// Cache duration (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Token list caches
interface TokenCache {
  tokens: SwapToken[];
  timestamp: number;
}

const tokenCache: Map<string, TokenCache> = new Map();

// ============================================================================
// Helper Functions
// ============================================================================

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

// ============================================================================
// Solana Token Functions (DexScreener-based)
// ============================================================================

/**
 * Get popular/default Solana tokens
 * Returns hardcoded popular tokens - reliable and fast
 */
export async function fetchSolanaTokens(): Promise<SwapToken[]> {
  const cacheKey = getCacheKey('solana');
  const cached = tokenCache.get(cacheKey);
  
  if (isCacheValid(cached)) {
    return cached!.tokens;
  }

  // Return popular tokens (hardcoded for reliability)
  const tokens = getDefaultSolanaTokens();
  
  // Cache the results
  tokenCache.set(cacheKey, { tokens, timestamp: Date.now() });

  return tokens;
}

// DexScreener API for searching any token
const DEXSCREENER_SEARCH_API = 'https://api.dexscreener.com/latest/dex/search';
const DEXSCREENER_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens';

// Jupiter Token API for token metadata (decimals, name, etc.)
const JUPITER_TOKEN_API = 'https://tokens.jup.ag/token';

/**
 * Get token logo from DexScreener's info or fallback to Jupiter CDN
 */
function getDexScreenerLogo(pair: { info?: { imageUrl?: string }; baseToken: { address: string; symbol: string } }): string {
  // DexScreener provides image URL in pair.info.imageUrl
  if (pair.info?.imageUrl) {
    return pair.info.imageUrl;
  }
  // Fallback to Jupiter CDN
  return `https://img.jup.ag/tokens/${pair.baseToken.address}`;
}

/**
 * Fetch token decimals from Jupiter API
 * This is crucial for correct swap calculations
 */
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
    // Jupiter lookup failed
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
      
      // If searching by address, only return exact matches
      if (isAddressQuery) {
        // Check both baseToken and quoteToken for exact address match
        if (pair.baseToken?.address === query.trim()) {
          if (!seenAddresses.has(pair.baseToken.address)) {
            seenAddresses.add(pair.baseToken.address);
            // Fetch correct decimals from Jupiter (pump.fun tokens are typically 6 decimals)
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
            // Fetch correct decimals from Jupiter
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
      
      // For non-address search, add base token if not seen
      if (pair.baseToken && !seenAddresses.has(pair.baseToken.address)) {
        seenAddresses.add(pair.baseToken.address);
        tokens.push({
          address: pair.baseToken.address,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name || pair.baseToken.symbol,
          decimals: 6, // Default to 6 for pump.fun tokens, will be enriched below
          logoUri: getDexScreenerLogo(pair),
          verified: false, // DexScreener tokens are not verified by default
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

/**
 * Check if a string looks like a Solana address (base58 encoded, 32-44 chars)
 * Solana addresses use base58 characters: 1-9, A-H, J-N, P-Z, a-k, m-z (no 0, I, O, l)
 */
function isSolanaAddress(str: string): boolean {
  if (str.length < 32 || str.length > 44) return false;
  // Base58 alphabet (no 0, I, O, l)
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
    // Return default tokens when no query
    return getDefaultSolanaTokens();
  }

  // Check if it's an address search (Solana addresses are base58, case-sensitive)
  // IMPORTANT: Don't lowercase the address - Solana addresses are case-sensitive!
  if (isSolanaAddress(trimmedQuery)) {
    // Try to fetch token info for the address (use original case)
    const tokenInfo = await fetchSolanaTokenByAddress(trimmedQuery);
    if (tokenInfo) return [tokenInfo];
    
    // If DexScreener didn't find it, try Jupiter API as fallback
    const jupiterToken = await fetchTokenFromJupiter(trimmedQuery);
    if (jupiterToken) return [jupiterToken];
    
    return [];
  }

  // Check if searching for native SOL (DexScreener doesn't return native tokens)
  const defaultTokens = getDefaultSolanaTokens();
  const solToken = defaultTokens[0]; // SOL is first in the list
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

  // Also check for other default tokens (USDC, USDT, JUP, BONK) by name/symbol
  for (const token of defaultTokens.slice(1)) { // Skip SOL, already handled
    const matches = token.symbol.toLowerCase().startsWith(normalizedQuery) ||
                    token.name.toLowerCase().startsWith(normalizedQuery);
    if (matches && !results.some(t => t.address === token.address)) {
      results.push(token);
    }
  }

  // Sort: exact symbol match first, then by symbol starts with query
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

/**
 * Fetch a single Solana token by address (for custom token input)
 * Uses DexScreener for token info and Jupiter for decimals
 */
export async function fetchSolanaTokenByAddress(address: string): Promise<SwapToken | null> {
  // First try Jupiter API as it has correct decimals
  const jupiterToken = await fetchTokenFromJupiter(address);
  if (jupiterToken) {
    return jupiterToken;
  }

  // Fallback to DexScreener if Jupiter doesn't have the token
  try {
    const dexResponse = await fetchWithTimeout(
      `${DEXSCREENER_TOKEN_API}/${address}`,
      10000
    );

    if (dexResponse.ok) {
      const data = await dexResponse.json();
      const pairs = data.pairs || [];
      
      // Find a Solana pair for this token
      const solanaPair = pairs.find((p: { chainId: string }) => p.chainId === 'solana');
      if (solanaPair) {
        // Determine if this address is base or quote token
        const isBaseToken = solanaPair.baseToken?.address === address;
        const tokenData = isBaseToken ? solanaPair.baseToken : solanaPair.quoteToken;
        
        if (tokenData) {
          // Get logo from DexScreener info if available
          const logoUri = solanaPair.info?.imageUrl || getTokenLogoUrl(tokenData.address, tokenData.symbol);
          
          // Fetch correct decimals from Jupiter API (pump.fun tokens are typically 6 decimals)
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
    // DexScreener lookup failed; return null to try other sources
  }

  return null;
}

/**
 * Fetch token metadata from Jupiter API (fallback for DexScreener)
 * Jupiter has comprehensive token data for all tradeable Solana tokens
 */
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

/**
 * Get token logo URL - prefer Jupiter's CDN which has logos for most tradeable tokens
 * Returns the Jupiter CDN URL for the token address
 */
function getTokenLogoUrl(address: string, _symbol: string): string {
  // Jupiter's logo CDN - this endpoint serves logos for all tokens in their registry
  // Format: https://img.jup.ag/tokens/{address}
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

// ============================================================================
// EVM Token Functions (ParaSwap)
// ============================================================================

/**
 * Fetch all tokens for an EVM chain from ParaSwap
 */
export async function fetchEVMTokens(chainId: EVMChainId = 'ethereum'): Promise<SwapToken[]> {
  const cacheKey = getCacheKey('evm', chainId);
  const cached = tokenCache.get(cacheKey);
  
  if (isCacheValid(cached)) {
    return cached!.tokens;
  }

  try {
    const networkId = PARASWAP_CHAIN_IDS[chainId];
    const response = await fetchWithTimeout(`${PARASWAP_TOKEN_API}/${networkId}`);
    
    if (!response.ok) {
      throw new Error(`ParaSwap API error: ${response.status}`);
    }

    const data = await response.json();
    const tokenList: ParaSwapToken[] = data.tokens || [];

    // Map to our token format
    const tokens: SwapToken[] = tokenList
      .map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.symbol, // ParaSwap doesn't always provide name
        decimals: token.decimals,
        logoUri: token.img || getDefaultEVMLogo(chainId),
        verified: true,
        chainId,
      }))
      .sort((a, b) => {
        // Prioritize native token and major stablecoins
        const nativeSymbols = getNativeSymbol(chainId);
        const priority = [nativeSymbols, 'WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
        const aIdx = priority.indexOf(a.symbol);
        const bIdx = priority.indexOf(b.symbol);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.symbol.localeCompare(b.symbol);
      });

    // Cache the results
    tokenCache.set(cacheKey, { tokens, timestamp: Date.now() });

    return tokens;
  } catch {
    // Fall back to default tokens on error
    return getDefaultEVMTokens(chainId);
  }
}

/**
 * Search EVM tokens by symbol, name, or address
 */
export async function searchEVMTokens(
  query: string,
  chainId: EVMChainId = 'ethereum'
): Promise<SwapToken[]> {
  const allTokens = await fetchEVMTokens(chainId);
  const normalizedQuery = query.toLowerCase().trim();
  
  if (!normalizedQuery) {
    return allTokens.slice(0, 50); // Return top 50 by default
  }

  // Check if it's an address search (0x + 40 hex chars)
  const isAddressSearch = normalizedQuery.startsWith('0x') && normalizedQuery.length === 42;
  
  if (isAddressSearch) {
    // Search for exact address match in cached tokens
    const exactMatch = allTokens.find(
      (t) => t.address.toLowerCase() === normalizedQuery
    );
    if (exactMatch) return [exactMatch];
    
    // Not in cache - try to fetch token info from blockchain
    try {
      const metadata = await getTokenMetadata(chainId, false, normalizedQuery);
      
      // Check if we got valid metadata (not just defaults)
      if (metadata && metadata.symbol !== '???' && metadata.name !== 'Unknown Token') {
        return [{
          address: metadata.address,
          symbol: metadata.symbol,
          name: metadata.name,
          decimals: metadata.decimals,
          logoUri: metadata.logoUri || '',
          verified: false, // Mark as unverified since it's not in the official list
        }];
      }
      
      // Even if we only got partial info, return it so user can try
      if (metadata && metadata.symbol !== '???') {
        return [{
          address: metadata.address,
          symbol: metadata.symbol,
          name: metadata.name || metadata.symbol,
          decimals: metadata.decimals,
          logoUri: metadata.logoUri || '',
          verified: false,
        }];
      }
    } catch (error) {
      console.warn('[swapTokens] Failed to fetch on-chain token metadata:', error);
    }
    
    return [];
  }

  // Search by symbol or name
  const results = allTokens.filter((token) => {
    const symbolMatch = token.symbol.toLowerCase().includes(normalizedQuery);
    const nameMatch = token.name.toLowerCase().includes(normalizedQuery);
    return symbolMatch || nameMatch;
  });

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

// Native token address used by ParaSwap for all EVM chains
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

// ============================================================================
// Unified Search Functions
// ============================================================================

/**
 * Search tokens across the appropriate chain
 */
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

/**
 * Clear token cache (useful when switching networks)
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}


