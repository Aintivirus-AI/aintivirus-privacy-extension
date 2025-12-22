/**
 * Dynamic Token List Services for Swap
 * 
 * Provides token discovery and search for:
 * - Solana (via Jupiter token API)
 * - EVM chains (via ParaSwap tokens API)
 */

import type { EVMChainId } from './chains/types';

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

interface JupiterTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  daily_volume?: number;
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

// Jupiter Token API - for Solana tokens (verified tokens list)
const JUPITER_TOKEN_API = 'https://tokens.jup.ag';

// ParaSwap Token API - for EVM tokens
const PARASWAP_TOKEN_API = 'https://api.paraswap.io/tokens';

// Chain ID mapping for ParaSwap
const PARASWAP_CHAIN_IDS: Record<EVMChainId, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
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
// Solana Token Functions (Jupiter)
// ============================================================================

/**
 * Fetch all verified Solana tokens from Jupiter
 */
export async function fetchSolanaTokens(): Promise<SwapToken[]> {
  const cacheKey = getCacheKey('solana');
  const cached = tokenCache.get(cacheKey);
  
  if (isCacheValid(cached)) {
    return cached!.tokens;
  }

  try {
    // Fetch verified tokens - these are safe to swap
    const response = await fetchWithTimeout(`${JUPITER_TOKEN_API}/tokens?tags=verified`);
    
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const data: JupiterTokenInfo[] = await response.json();

    // Map to our token format and sort by daily volume
    const tokens: SwapToken[] = data
      .map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoUri: token.logoURI || getDefaultSolanaLogo(token.symbol),
        verified: true,
        chainId: 'solana',
      }))
      .sort((a, b) => {
        // Prioritize SOL, USDC, USDT
        const priority = ['SOL', 'USDC', 'USDT', 'JUP', 'BONK', 'WIF', 'RAY'];
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
  } catch (error) {
    console.error('Failed to fetch Solana tokens:', error);
    // Return default tokens on error
    return getDefaultSolanaTokens();
  }
}

/**
 * Search Solana tokens by symbol, name, or address
 */
export async function searchSolanaTokens(query: string): Promise<SwapToken[]> {
  const allTokens = await fetchSolanaTokens();
  const normalizedQuery = query.toLowerCase().trim();
  
  if (!normalizedQuery) {
    return allTokens.slice(0, 50); // Return top 50 by default
  }

  // Check if it's an address search
  if (normalizedQuery.length >= 32 && normalizedQuery.length <= 44) {
    // Search for exact address match
    const exactMatch = allTokens.find(
      (t) => t.address.toLowerCase() === normalizedQuery
    );
    if (exactMatch) return [exactMatch];
    
    // Try to fetch token info for unknown address
    const tokenInfo = await fetchSolanaTokenByAddress(normalizedQuery);
    if (tokenInfo) return [tokenInfo];
    
    return [];
  }

  // Search by symbol or name
  const results = allTokens.filter((token) => {
    const symbolMatch = token.symbol.toLowerCase().includes(normalizedQuery);
    const nameMatch = token.name.toLowerCase().includes(normalizedQuery);
    return symbolMatch || nameMatch;
  });

  // Sort: exact symbol match first, then partial matches
  return results.sort((a, b) => {
    const aExact = a.symbol.toLowerCase() === normalizedQuery;
    const bExact = b.symbol.toLowerCase() === normalizedQuery;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  }).slice(0, 50);
}

/**
 * Fetch a single Solana token by address (for custom token input)
 */
export async function fetchSolanaTokenByAddress(address: string): Promise<SwapToken | null> {
  try {
    // Try Jupiter's token lookup
    const response = await fetchWithTimeout(
      `${JUPITER_TOKEN_API}/token/${address}`,
      8000
    );

    if (response.ok) {
      const token: JupiterTokenInfo = await response.json();
      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoUri: token.logoURI || getDefaultSolanaLogo(token.symbol),
        verified: token.tags?.includes('verified') || false,
        chainId: 'solana',
      };
    }

    return null;
  } catch {
    return null;
  }
}

function getDefaultSolanaLogo(symbol: string): string {
  return `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png`;
}

function getDefaultSolanaTokens(): SwapToken[] {
  return [
    {
      address: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      verified: true,
    },
    {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      verified: true,
    },
    {
      address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
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
  } catch (error) {
    console.error(`Failed to fetch ${chainId} tokens:`, error);
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

  // Check if it's an address search
  if (normalizedQuery.startsWith('0x') && normalizedQuery.length === 42) {
    // Search for exact address match
    const exactMatch = allTokens.find(
      (t) => t.address.toLowerCase() === normalizedQuery
    );
    if (exactMatch) return [exactMatch];
    
    // For unknown addresses, return empty (could add on-chain lookup later)
    return [];
  }

  // Search by symbol
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

