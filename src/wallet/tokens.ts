/**
 * AINTIVIRUS Wallet Module - SPL Token Support
 * 
 * This module handles SPL token operations:
 * - Detect token accounts owned by the wallet
 * - Fetch token balances
 * - Resolve token metadata (name, symbol, logo) via Jupiter API
 * - Manage custom/manual token additions
 * 
 * Uses standard Solana RPC methods:
 * - getTokenAccountsByOwner: Get all token accounts
 * - getTokenAccountBalance: Get specific token balance
 * 
 * Uses Jupiter API for:
 * - Token metadata (name, symbol, logo) for any Solana token
 */

import {
  PublicKey,
  AccountInfo,
  ParsedAccountData,
} from '@solana/web3.js';
import {
  SPLTokenBalance,
  CustomToken,
  TokenMetadata,
  DEFAULT_TOKEN_LIST,
  WalletError,
  WalletErrorCode,
} from './types';
import { getCurrentConnection } from './rpc';
import { getPublicAddress, getWalletSettings, saveWalletSettings } from './storage';

// ============================================
// JUPITER API
// ============================================

/**
 * Jupiter Token API endpoint for metadata
 */
const JUPITER_TOKEN_API = 'https://tokens.jup.ag/token';

/**
 * Jupiter verified tokens list API
 */
const JUPITER_TOKENS_LIST_API = 'https://tokens.jup.ag/tokens?tags=verified';

/**
 * DexScreener API for meme coins and newer tokens
 * Has better coverage than Jupiter for unverified tokens
 */
const DEXSCREENER_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens';

/**
 * Cache for token metadata (mint -> metadata)
 */
const tokenMetadataCache: Map<string, TokenMetadata> = new Map();

/**
 * Cache for failed metadata lookups to avoid repeated requests
 */
const failedMetadataCache: Set<string> = new Set();

/**
 * Failed cache duration (5 minutes) - retry after this
 */
const FAILED_CACHE_DURATION = 5 * 60 * 1000;
let failedCacheResetAt: number = Date.now();

/**
 * Request timeout for external APIs
 */
const API_REQUEST_TIMEOUT = 8000;

/**
 * Jupiter token response type
 */
interface JupiterTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  daily_volume?: number;
}

/**
 * Popular token for display in token picker
 * Works for both Solana (mint) and EVM (address) tokens
 */
export interface PopularToken {
  mint: string; // For Solana: mint address, For EVM: contract address
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  volume24h?: number;
  chainType?: 'solana' | 'evm';
}

/**
 * DexScreener token response type
 */
interface DexScreenerResponse {
  pairs?: Array<{
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    info?: {
      imageUrl?: string;
    };
    priceUsd?: string;
  }>;
}

/**
 * Fetch token metadata from Jupiter API
 * 
 * @param mint - Token mint address
 * @returns Token metadata or null if not found
 */
async function fetchFromJupiter(mint: string): Promise<TokenMetadata | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);

    const response = await fetch(`${JUPITER_TOKEN_API}/${mint}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data: JupiterTokenInfo = await response.json();
    
    return {
      mint: data.address,
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      logoUri: data.logoURI,
    };
  } catch (error) {
    console.warn(`[AINTIVIRUS Wallet] Jupiter API failed for ${mint}:`, error);
    return null;
  }
}

/**
 * Fetch token metadata from DexScreener API
 * Better coverage for meme coins and newer tokens
 * 
 * @param mint - Token mint address
 * @returns Token metadata or null if not found
 */
async function fetchFromDexScreener(mint: string): Promise<TokenMetadata | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);

    const response = await fetch(`${DEXSCREENER_TOKEN_API}/${mint}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data: DexScreenerResponse = await response.json();
    
    // DexScreener returns pairs, get the first one with baseToken matching our mint
    const pair = data.pairs?.find(p => 
      p.baseToken.address.toLowerCase() === mint.toLowerCase()
    );
    
    if (!pair) {
      return null;
    }

    return {
      mint: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      decimals: 9, // DexScreener doesn't return decimals, assume 9 for Solana
      logoUri: pair.info?.imageUrl,
    };
  } catch (error) {
    console.warn(`[AINTIVIRUS Wallet] DexScreener API failed for ${mint}:`, error);
    return null;
  }
}

/**
 * Fetch token metadata from multiple sources with fallback
 * Priority: Cache -> Jupiter -> DexScreener
 * 
 * @param mint - Token mint address
 * @returns Token metadata or null if not found
 */
export async function fetchJupiterTokenMetadata(mint: string): Promise<TokenMetadata | null> {
  // Check cache first
  if (tokenMetadataCache.has(mint)) {
    return tokenMetadataCache.get(mint)!;
  }

  // Reset failed cache periodically
  if (Date.now() - failedCacheResetAt > FAILED_CACHE_DURATION) {
    failedMetadataCache.clear();
    failedCacheResetAt = Date.now();
  }

  // Skip if we recently failed to fetch this token
  if (failedMetadataCache.has(mint)) {
    return null;
  }

  // Try Jupiter first (fastest, has verified tokens)
  let metadata = await fetchFromJupiter(mint);
  
  // If Jupiter doesn't have it, try DexScreener (better meme coin coverage)
  if (!metadata) {
    metadata = await fetchFromDexScreener(mint);
  }

  if (metadata) {
    // Cache successful result
    tokenMetadataCache.set(mint, metadata);
    console.log(`[AINTIVIRUS Wallet] Found metadata for ${mint}: ${metadata.name} (${metadata.symbol})`);
    return metadata;
  }

  // Mark as failed to avoid repeated requests
  failedMetadataCache.add(mint);
  console.warn(`[AINTIVIRUS Wallet] No metadata found for ${mint} from any source`);
  return null;
}

/**
 * Batch fetch token metadata from Jupiter API
 * 
 * @param mints - Array of token mint addresses
 * @returns Map of mint to metadata
 */
export async function fetchJupiterTokenMetadataBatch(mints: string[]): Promise<Map<string, TokenMetadata>> {
  const result = new Map<string, TokenMetadata>();
  const mintsToFetch: string[] = [];

  // Check cache first
  for (const mint of mints) {
    const cached = tokenMetadataCache.get(mint);
    if (cached) {
      result.set(mint, cached);
    } else {
      mintsToFetch.push(mint);
    }
  }

  // If all cached, return early
  if (mintsToFetch.length === 0) {
    return result;
  }

  // Fetch remaining from Jupiter API (parallel individual requests)
  // Jupiter doesn't have a batch endpoint, so we fetch in parallel
  const fetchPromises = mintsToFetch.map(async (mint) => {
    const metadata = await fetchJupiterTokenMetadata(mint);
    if (metadata) {
      result.set(mint, metadata);
    }
  });

  await Promise.allSettled(fetchPromises);

  return result;
}

// ============================================
// TRENDING/POPULAR TOKENS
// ============================================

/**
 * CoinGecko API for top ERC-20 tokens
 */
const COINGECKO_TOP_TOKENS_API = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&category=ethereum-ecosystem';

/**
 * Static list of popular ERC-20 tokens (fallback)
 */
const POPULAR_ERC20_TOKENS: PopularToken[] = [
  { mint: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6, logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png', chainType: 'evm' },
  { mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png', chainType: 'evm' },
  { mint: '0x6B175474E89094C44Da98b954EescdeCB5d C6F00a', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png', chainType: 'evm' },
  { mint: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8, logoUri: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png', chainType: 'evm' },
  { mint: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png', chainType: 'evm' },
  { mint: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/12504/small/uniswap-logo.png', chainType: 'evm' },
  { mint: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', symbol: 'AAVE', name: 'Aave', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/12645/small/aave-token-round.png', chainType: 'evm' },
  { mint: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', symbol: 'MKR', name: 'Maker', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png', chainType: 'evm' },
  { mint: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/11939/small/shiba.png', chainType: 'evm' },
  { mint: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'PEPE', name: 'Pepe', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg', chainType: 'evm' },
  { mint: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/2518/small/weth.png', chainType: 'evm' },
  { mint: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', symbol: 'LDO', name: 'Lido DAO', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/13573/small/Lido_DAO.png', chainType: 'evm' },
];

/**
 * Cache for trending tokens (separate for Solana and EVM)
 */
let solanaTrendingCache: PopularToken[] | null = null;
let solanaCacheTime: number = 0;
let evmTrendingCache: PopularToken[] | null = null;
let evmCacheTime: number = 0;
const TRENDING_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

/**
 * Number of top tokens to fetch and display
 */
const TOP_TOKENS_LIMIT = 50;

/**
 * Fetch popular/trending tokens based on chain type
 * 
 * @param chainType - 'solana' or 'evm'
 * @param forceRefresh - Force refresh even if cached
 * @returns Array of popular tokens
 */
export async function fetchPopularTokens(chainType: 'solana' | 'evm' = 'solana', forceRefresh: boolean = false): Promise<PopularToken[]> {
  console.log(`[AINTIVIRUS Wallet] Fetching popular tokens for ${chainType}...`);
  
  if (chainType === 'evm') {
    return fetchEVMPopularTokens(forceRefresh);
  }
  return fetchSolanaPopularTokens(forceRefresh);
}

/**
 * Fetch popular Solana tokens from Jupiter verified list
 */
async function fetchSolanaPopularTokens(forceRefresh: boolean = false): Promise<PopularToken[]> {
  // Use cache if available and not expired
  if (!forceRefresh && solanaTrendingCache && solanaTrendingCache.length > 0 && Date.now() - solanaCacheTime < TRENDING_CACHE_DURATION) {
    console.log(`[AINTIVIRUS Wallet] Using cached Solana tokens (${solanaTrendingCache.length})`);
    return solanaTrendingCache;
  }

  try {
    console.log('[AINTIVIRUS Wallet] Fetching Solana tokens from Jupiter...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);

    const response = await fetch(JUPITER_TOKENS_LIST_API, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[AINTIVIRUS Wallet] Jupiter API failed:', response.status);
      return solanaTrendingCache || [];
    }

    const data: JupiterTokenInfo[] = await response.json();
    console.log(`[AINTIVIRUS Wallet] Jupiter returned ${data.length} tokens`);
    
    // Filter and sort by volume, take top tokens
    const tokens: PopularToken[] = data
      .filter(t => t.symbol && t.name && t.address)
      .map(t => ({
        mint: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoUri: t.logoURI,
        volume24h: t.daily_volume || 0,
        chainType: 'solana' as const,
      }))
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
      .slice(0, TOP_TOKENS_LIMIT);

    if (tokens.length > 0) {
      solanaTrendingCache = tokens;
      solanaCacheTime = Date.now();
      console.log(`[AINTIVIRUS Wallet] Cached ${tokens.length} Solana tokens`);
    }

    return tokens;
  } catch (error) {
    console.warn('[AINTIVIRUS Wallet] Error fetching Solana tokens:', error);
    return solanaTrendingCache || [];
  }
}

/**
 * Fetch popular EVM tokens
 */
async function fetchEVMPopularTokens(forceRefresh: boolean = false): Promise<PopularToken[]> {
  // Use cache if available and not expired
  if (!forceRefresh && evmTrendingCache && evmTrendingCache.length > 0 && Date.now() - evmCacheTime < TRENDING_CACHE_DURATION) {
    console.log(`[AINTIVIRUS Wallet] Using cached EVM tokens (${evmTrendingCache.length})`);
    return evmTrendingCache;
  }

  try {
    console.log('[AINTIVIRUS Wallet] Fetching EVM tokens from CoinGecko...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);

    const response = await fetch(COINGECKO_TOP_TOKENS_API, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[AINTIVIRUS Wallet] CoinGecko API failed:', response.status);
      // Return static list as fallback
      evmTrendingCache = POPULAR_ERC20_TOKENS;
      evmCacheTime = Date.now();
      return POPULAR_ERC20_TOKENS;
    }

    const data = await response.json() as Array<{
      id: string;
      symbol: string;
      name: string;
      image: string;
      current_price: number;
      market_cap: number;
      platforms?: Record<string, string>;
    }>;

    console.log(`[AINTIVIRUS Wallet] CoinGecko returned ${data.length} tokens`);

    // Map CoinGecko response to PopularToken, only include tokens with Ethereum addresses
    const tokens: PopularToken[] = data
      .filter(t => t.platforms?.ethereum)
      .map(t => ({
        mint: t.platforms!.ethereum,
        symbol: t.symbol.toUpperCase(),
        name: t.name,
        decimals: 18, // Most ERC-20 tokens use 18 decimals
        logoUri: t.image,
        volume24h: t.market_cap || 0,
        chainType: 'evm' as const,
      }))
      .slice(0, TOP_TOKENS_LIMIT);

    // If CoinGecko didn't return enough, merge with static list
    if (tokens.length < 10) {
      const seenAddresses = new Set(tokens.map(t => t.mint.toLowerCase()));
      for (const token of POPULAR_ERC20_TOKENS) {
        if (!seenAddresses.has(token.mint.toLowerCase())) {
          tokens.push(token);
        }
      }
    }

    if (tokens.length > 0) {
      evmTrendingCache = tokens;
      evmCacheTime = Date.now();
      console.log(`[AINTIVIRUS Wallet] Cached ${tokens.length} EVM tokens`);
    }

    return tokens;
  } catch (error) {
    console.warn('[AINTIVIRUS Wallet] Error fetching EVM tokens:', error);
    // Return static list as fallback
    if (!evmTrendingCache) {
      evmTrendingCache = POPULAR_ERC20_TOKENS;
      evmCacheTime = Date.now();
    }
    return evmTrendingCache;
  }
}


/**
 * Search popular tokens by symbol, name, or address
 * 
 * @param query - Search query
 * @param tokens - List of popular tokens to search
 * @returns Filtered tokens matching the query
 */
export function searchPopularTokens(query: string, tokens: PopularToken[]): PopularToken[] {
  if (!query.trim()) return tokens;
  
  const lowerQuery = query.toLowerCase().trim();
  
  return tokens.filter(token => 
    token.symbol.toLowerCase().includes(lowerQuery) ||
    token.name.toLowerCase().includes(lowerQuery) ||
    token.mint.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Find a token by its mint address in the popular tokens list
 * 
 * @param mint - Token mint address
 * @param tokens - List of popular tokens
 * @returns Token if found, null otherwise
 */
export function findPopularTokenByMint(mint: string, tokens: PopularToken[]): PopularToken | null {
  return tokens.find(t => t.mint.toLowerCase() === mint.toLowerCase()) || null;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * SPL Token Program ID
 */
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Token 2022 Program ID
 */
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/**
 * Cache duration for token data (2 minutes)
 */
const TOKEN_CACHE_DURATION = 2 * 60 * 1000;

// ============================================
// TOKEN METADATA CACHE
// ============================================

/**
 * Create a token metadata map from the default list for quick lookup
 */
const tokenMetadataMap: Map<string, TokenMetadata> = new Map(
  DEFAULT_TOKEN_LIST.map(token => [token.mint, token])
);

/**
 * Cached token balances
 */
interface TokenCache {
  tokens: SPLTokenBalance[];
  fetchedAt: number;
  address: string;
}

let tokenCache: TokenCache | null = null;

/**
 * Clear the token cache
 */
export function clearTokenCache(): void {
  tokenCache = null;
}

/**
 * Check if cache is valid
 */
function isCacheValid(address: string): boolean {
  if (!tokenCache) return false;
  if (tokenCache.address !== address) return false;
  if (Date.now() - tokenCache.fetchedAt > TOKEN_CACHE_DURATION) return false;
  return true;
}

// ============================================
// TOKEN DETECTION
// ============================================

/**
 * Get all SPL token balances for the wallet
 * 
 * @param forceRefresh - Force refresh even if cached
 * @returns Array of token balances
 */
export async function getTokenBalances(
  forceRefresh: boolean = false
): Promise<SPLTokenBalance[]> {
  // Get wallet address
  const address = await getPublicAddress();
  if (!address) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }

  // Use cache if available
  if (!forceRefresh && isCacheValid(address)) {
    return tokenCache!.tokens;
  }

  try {
    const connection = await getCurrentConnection();
    const publicKey = new PublicKey(address);

    // Fetch token accounts from both token programs
    const [tokenAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }).catch(() => ({ value: [] })), // Token 2022 might not exist on devnet
    ]);

    // Combine accounts
    const allAccounts = [
      ...tokenAccounts.value,
      ...token2022Accounts.value,
    ];

    // Parse token balances - include zero balances too
    const tokens: SPLTokenBalance[] = [];
    const foundMints = new Set<string>();

    for (const account of allAccounts) {
      const parsed = parseTokenAccount(account);
      if (parsed) {
        tokens.push(parsed);
        foundMints.add(parsed.mint);
      }
    }

    // Get custom tokens from settings
    const settings = await getWalletSettings();
    const customTokens = settings.customTokens || [];

    // Merge custom token metadata for tokens we found
    for (const token of tokens) {
      const customToken = customTokens.find(ct => ct.mint === token.mint);
      if (customToken) {
        if (customToken.symbol) token.symbol = customToken.symbol;
        if (customToken.name) token.name = customToken.name;
      }
    }

    // Add custom tokens that weren't found in token accounts (zero balance)
    for (const customToken of customTokens) {
      if (!foundMints.has(customToken.mint)) {
        // Try to get token info from chain
        const tokenInfo = await getTokenMintInfo(customToken.mint);
        const metadata = getTokenMetadata(customToken.mint);
        
        tokens.push({
          mint: customToken.mint,
          symbol: customToken.symbol || metadata?.symbol || truncateMint(customToken.mint),
          name: customToken.name || metadata?.name || 'Unknown Token',
          decimals: tokenInfo?.decimals || 9,
          rawBalance: '0',
          uiBalance: 0,
          tokenAccount: null as unknown as string, // No token account yet
          logoUri: metadata?.logoUri,
        });
      }
    }

    // Enrich unknown tokens with Jupiter metadata (in parallel)
    const unknownTokens = tokens.filter(
      t => t.name === 'Unknown Token' || t.symbol.includes('...')
    );
    
    if (unknownTokens.length > 0) {
      const enrichedPromises = unknownTokens.map(async (token) => {
        const enriched = await enrichTokenWithJupiterMetadata(token);
        // Update the token in-place
        const idx = tokens.findIndex(t => t.mint === token.mint);
        if (idx >= 0) {
          tokens[idx] = enriched;
        }
      });
      await Promise.allSettled(enrichedPromises);
    }

    // Sort: tokens with balance first (highest), then zero balance tokens
    tokens.sort((a, b) => {
      if (a.uiBalance > 0 && b.uiBalance === 0) return -1;
      if (a.uiBalance === 0 && b.uiBalance > 0) return 1;
      return b.uiBalance - a.uiBalance;
    });

    // Update cache
    tokenCache = {
      tokens,
      fetchedAt: Date.now(),
      address,
    };

    return tokens;
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      `Failed to fetch token balances: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get token mint info from chain
 * 
 * @param mint - Token mint address
 * @returns Token decimals and supply info, or null if not found
 */
async function getTokenMintInfo(mint: string): Promise<{ decimals: number } | null> {
  try {
    const connection = await getCurrentConnection();
    const mintPubkey = new PublicKey(mint);
    const accountInfo = await connection.getParsedAccountInfo(mintPubkey);
    
    if (accountInfo.value && 'parsed' in accountInfo.value.data) {
      const parsed = accountInfo.value.data.parsed;
      if (parsed.type === 'mint' && parsed.info) {
        return { decimals: parsed.info.decimals };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a token account into SPLTokenBalance (basic parsing without metadata)
 * 
 * @param account - Parsed token account from RPC
 * @returns Basic SPLTokenBalance or null if invalid
 */
function parseTokenAccount(
  account: {
    pubkey: PublicKey;
    account: AccountInfo<ParsedAccountData>;
  }
): SPLTokenBalance | null {
  try {
    const data = account.account.data;
    
    if (data.program !== 'spl-token') {
      return null;
    }

    const parsed = data.parsed;
    if (!parsed || parsed.type !== 'account') {
      return null;
    }

    const info = parsed.info;
    const mint = info.mint as string;
    const tokenAmount = info.tokenAmount;

    if (!tokenAmount) {
      return null;
    }

    // Get metadata from default list first
    const metadata = getTokenMetadata(mint);

    return {
      mint,
      symbol: metadata?.symbol || truncateMint(mint),
      name: metadata?.name || 'Unknown Token',
      decimals: tokenAmount.decimals,
      rawBalance: tokenAmount.amount,
      uiBalance: parseFloat(tokenAmount.uiAmountString || '0'),
      tokenAccount: account.pubkey.toBase58(),
      logoUri: metadata?.logoUri,
    };
  } catch (error) {
    console.error('[AINTIVIRUS Wallet] Failed to parse token account:', error);
    return null;
  }
}

/**
 * Enrich token with Jupiter metadata if it's an unknown token
 * 
 * @param token - Token balance to enrich
 * @returns Enriched token balance
 */
async function enrichTokenWithJupiterMetadata(token: SPLTokenBalance): Promise<SPLTokenBalance> {
  // If token already has proper metadata (not truncated mint or Unknown), skip
  if (token.name !== 'Unknown Token' && !token.symbol.includes('...')) {
    return token;
  }

  // Try to get metadata from Jupiter
  const jupiterMetadata = await fetchJupiterTokenMetadata(token.mint);
  
  if (jupiterMetadata) {
    return {
      ...token,
      symbol: jupiterMetadata.symbol,
      name: jupiterMetadata.name,
      logoUri: jupiterMetadata.logoUri || token.logoUri,
    };
  }

  return token;
}

/**
 * Get token metadata from the known list
 * 
 * @param mint - Token mint address
 * @returns Token metadata or undefined
 */
export function getTokenMetadata(mint: string): TokenMetadata | undefined {
  return tokenMetadataMap.get(mint);
}

// ============================================
// CUSTOM TOKEN MANAGEMENT
// ============================================

/**
 * Add a custom token to the wallet
 * 
 * @param mint - Token mint address
 * @param symbol - Optional custom symbol
 * @param name - Optional custom name
 */
export async function addCustomToken(
  mint: string,
  symbol?: string,
  name?: string
): Promise<void> {
  // Validate mint address
  try {
    new PublicKey(mint);
  } catch {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Invalid token mint address'
    );
  }

  // Check if token exists on-chain
  const tokenExists = await verifyTokenMint(mint);
  if (!tokenExists) {
    throw new WalletError(
      WalletErrorCode.TOKEN_NOT_FOUND,
      'Token mint not found on-chain'
    );
  }

  // Get current settings
  const settings = await getWalletSettings();
  const customTokens = settings.customTokens || [];

  // Check if already added
  const existingIndex = customTokens.findIndex(t => t.mint === mint);
  
  const newToken: CustomToken = {
    mint,
    symbol,
    name,
    addedAt: Date.now(),
  };

  if (existingIndex >= 0) {
    // Update existing
    customTokens[existingIndex] = newToken;
  } else {
    // Add new
    customTokens.push(newToken);
  }

  // Save settings
  await saveWalletSettings({ customTokens });

  // Clear cache to refresh token list
  clearTokenCache();

  console.log(`[AINTIVIRUS Wallet] Added custom token: ${mint}`);
}

/**
 * Remove a custom token from the wallet
 * 
 * @param mint - Token mint address to remove
 */
export async function removeCustomToken(mint: string): Promise<void> {
  const settings = await getWalletSettings();
  const customTokens = settings.customTokens || [];

  const filtered = customTokens.filter(t => t.mint !== mint);

  await saveWalletSettings({ customTokens: filtered });

  // Clear cache
  clearTokenCache();

  console.log(`[AINTIVIRUS Wallet] Removed custom token: ${mint}`);
}

/**
 * Get list of custom tokens
 * 
 * @returns Array of custom tokens
 */
export async function getCustomTokens(): Promise<CustomToken[]> {
  const settings = await getWalletSettings();
  return settings.customTokens || [];
}

// ============================================
// TOKEN VALIDATION
// ============================================

/**
 * Verify that a token mint exists on-chain
 * 
 * @param mint - Token mint address
 * @returns True if mint exists and is valid
 */
export async function verifyTokenMint(mint: string): Promise<boolean> {
  try {
    const connection = await getCurrentConnection();
    const mintPubkey = new PublicKey(mint);
    
    // Try to get mint account info
    const accountInfo = await connection.getAccountInfo(mintPubkey);
    
    if (!accountInfo) {
      return false;
    }

    // Check if owned by token program
    const owner = accountInfo.owner.toBase58();
    return (
      owner === TOKEN_PROGRAM_ID.toBase58() ||
      owner === TOKEN_2022_PROGRAM_ID.toBase58()
    );
  } catch {
    return false;
  }
}

/**
 * Get specific token balance for a mint
 * 
 * @param mint - Token mint address
 * @returns Token balance or null if not held
 */
export async function getTokenBalance(mint: string): Promise<SPLTokenBalance | null> {
  const tokens = await getTokenBalances();
  return tokens.find(t => t.mint === mint) || null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Truncate mint address for display as symbol fallback
 * 
 * @param mint - Full mint address
 * @returns Truncated string
 */
function truncateMint(mint: string): string {
  return `${mint.slice(0, 4)}...`;
}

/**
 * Format token balance for display
 * 
 * @param balance - UI balance amount
 * @param decimals - Token decimals
 * @returns Formatted string
 */
export function formatTokenBalance(balance: number, decimals: number = 6): string {
  // For very small balances, show more precision
  if (balance > 0 && balance < 0.001) {
    return balance.toExponential(2);
  }
  
  // For normal balances, show reasonable precision
  const precision = Math.min(decimals, 6);
  return balance.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

/**
 * Get total value of tokens in SOL (placeholder for future price integration)
 * 
 * Note: This is a placeholder. Real implementation would need price feeds.
 * 
 * @param tokens - Array of token balances
 * @returns Estimated value (0 for now without price data)
 */
export function estimateTokenValueInSol(tokens: SPLTokenBalance[]): number {
  // Without price feeds, we can't estimate value
  // This is a placeholder for future integration
  return 0;
}

/**
 * Check if a token is a known stablecoin
 * 
 * @param mint - Token mint address
 * @returns True if stablecoin
 */
export function isStablecoin(mint: string): boolean {
  const stablecoins = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  ];
  return stablecoins.includes(mint);
}

/**
 * Check if a token is wrapped SOL
 * 
 * @param mint - Token mint address
 * @returns True if wSOL
 */
export function isWrappedSol(mint: string): boolean {
  return mint === 'So11111111111111111111111111111111111111112';
}

/**
 * Get token logo with multiple fallback sources
 * 
 * Resolution order:
 * 1. Token's logoUri (from metadata)
 * 2. Solana Token List (GitHub)
 * 3. Jupiter Token List
 * 4. Generated placeholder
 * 
 * @param token - Token balance
 * @returns Logo URI or placeholder
 */
export function getTokenLogo(token: SPLTokenBalance): string {
  if (token.logoUri) {
    return token.logoUri;
  }
  
  // Try Solana Token List
  const solanaTokenListUrl = `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`;
  
  return solanaTokenListUrl;
}

/**
 * Get multiple logo URL options for a token (for fallback handling)
 * 
 * @param token - Token balance
 * @returns Array of logo URLs to try in order
 */
export function getTokenLogoUrls(token: SPLTokenBalance): string[] {
  const urls: string[] = [];
  
  // 1. Token's logoUri from metadata
  if (token.logoUri) {
    urls.push(token.logoUri);
  }
  
  // 2. Solana Token List
  urls.push(`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`);
  
  // 3. Jupiter aggregator (popular Solana tokens)
  urls.push(`https://tokens.jup.ag/token/${token.mint}/logo`);
  
  // 4. Generated placeholder (always works)
  urls.push(generateTokenPlaceholder(token.symbol));
  
  return urls;
}

/**
 * Generate a placeholder SVG for tokens without logos
 * 
 * @param symbol - Token symbol
 * @returns Data URL for placeholder SVG
 */
export function generateTokenPlaceholder(symbol: string): string {
  const initials = symbol.slice(0, 2).toUpperCase();
  return 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="#1a1a24" stroke="#9945FF" stroke-width="2"/>
      <text x="50" y="60" text-anchor="middle" fill="#f0f0f5" font-size="24" font-family="system-ui">
        ${initials}
      </text>
    </svg>
  `);
}



