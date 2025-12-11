import { PublicKey, AccountInfo, ParsedAccountData } from '@solana/web3.js';
import {
  SPLTokenBalance,
  CustomToken,
  TokenMetadata,
  DEFAULT_TOKEN_LIST,
  WalletError,
  WalletErrorCode,
} from './types';
import { getCurrentConnection } from './rpc';
import {
  getPublicAddress,
  getWalletSettings,
  saveWalletSettings,
  saveTokenMetadataToCache,
} from './storage';
import {
  tokenDedup,
  metadataDedup,
  tokenBalanceKey,
  metadataKey,
  TOKEN_BALANCE_CACHE_TTL,
  METADATA_CACHE_TTL,
} from './requestDedup';

// Token helpers look up SPL balances, enrich metadata, and manage custom tokens.
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const tokenMetadataMap: Map<string, TokenMetadata> = new Map(
  DEFAULT_TOKEN_LIST.map((token) => [token.mint, token]),
);

const JUPITER_TOKEN_API = 'https://tokens.jup.ag/token';

const JUPITER_TOKENS_LIST_API = 'https://tokens.jup.ag/tokens?tags=verified';

const DEXSCREENER_SEARCH_API = 'https://api.dexscreener.com/latest/dex/search';

const tokenMetadataCache: Map<string, TokenMetadata> = new Map();

const failedMetadataCache: Set<string> = new Set();

const FAILED_CACHE_DURATION = 5 * 60 * 1000;
let failedCacheResetAt: number = Date.now();

const API_REQUEST_TIMEOUT = 8000;

interface JupiterTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  daily_volume?: number;
}

export interface PopularToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  volume24h?: number;
  chainType?: 'solana' | 'evm';
}

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
    return null;
  }
}

async function fetchFromDexScreener(mint: string): Promise<TokenMetadata | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);

    const response = await fetch(`${DEXSCREENER_SEARCH_API}?q=${mint}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data: DexScreenerResponse = await response.json();

    const pair = data.pairs?.find((p) => p.baseToken.address.toLowerCase() === mint.toLowerCase());

    if (!pair) {
      return null;
    }

    return {
      mint: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      decimals: 9,
      logoUri: pair.info?.imageUrl,
    };
  } catch (error) {
    return null;
  }
}

export async function fetchJupiterTokenMetadata(mint: string): Promise<TokenMetadata | null> {
  if (tokenMetadataCache.has(mint)) {
    return tokenMetadataCache.get(mint)!;
  }

  if (Date.now() - failedCacheResetAt > FAILED_CACHE_DURATION) {
    failedMetadataCache.clear();
    failedCacheResetAt = Date.now();
  }

  if (failedMetadataCache.has(mint)) {
    return null;
  }

  const cacheKey = metadataKey('solana', mint);

  return metadataDedup.execute(
    cacheKey,
    async () => {
      let metadata = await fetchFromDexScreener(mint);

      if (!metadata) {
        metadata = await fetchFromJupiter(mint);
      }

      if (metadata) {
        tokenMetadataCache.set(mint, metadata);

        // Also save to persistent storage
        await saveTokenMetadataToCache(mint, {
          symbol: metadata.symbol,
          name: metadata.name,
          decimals: metadata.decimals,
          logoUri: metadata.logoUri,
        });

        return metadata;
      }

      failedMetadataCache.add(mint);
      return null;
    },
    METADATA_CACHE_TTL,
  );
}

export async function fetchJupiterTokenMetadataBatch(
  mints: string[],
): Promise<Map<string, TokenMetadata>> {
  const result = new Map<string, TokenMetadata>();
  const mintsToFetch: string[] = [];

  for (const mint of mints) {
    const cached = tokenMetadataCache.get(mint);
    if (cached) {
      result.set(mint, cached);
    } else {
      mintsToFetch.push(mint);
    }
  }

  if (mintsToFetch.length === 0) {
    return result;
  }

  const fetchPromises = mintsToFetch.map(async (mint) => {
    const metadata = await fetchJupiterTokenMetadata(mint);
    if (metadata) {
      result.set(mint, metadata);
    }
  });

  await Promise.allSettled(fetchPromises);

  return result;
}

const COINGECKO_TOP_TOKENS_API =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&category=ethereum-ecosystem';

const POPULAR_ERC20_TOKENS: PopularToken[] = [
  {
    mint: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    chainType: 'evm',
  },
  {
    mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    chainType: 'evm',
  },
  {
    mint: '0x6B175474E89094C44Da98b954EedeC4b3ddC6F00a',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png',
    chainType: 'evm',
  },
  {
    mint: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    logoUri: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
    chainType: 'evm',
  },
  {
    mint: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
    chainType: 'evm',
  },
  {
    mint: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/12504/small/uniswap-logo.png',
    chainType: 'evm',
  },
  {
    mint: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    symbol: 'AAVE',
    name: 'Aave',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/12645/small/aave-token-round.png',
    chainType: 'evm',
  },
  {
    mint: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    symbol: 'MKR',
    name: 'Maker',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png',
    chainType: 'evm',
  },
  {
    mint: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    symbol: 'SHIB',
    name: 'Shiba Inu',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/11939/small/shiba.png',
    chainType: 'evm',
  },
  {
    mint: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg',
    chainType: 'evm',
  },
  {
    mint: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    chainType: 'evm',
  },
  {
    mint: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    symbol: 'LDO',
    name: 'Lido DAO',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/13573/small/Lido_DAO.png',
    chainType: 'evm',
  },
];

let solanaTrendingCache: PopularToken[] | null = null;
let solanaCacheTime: number = 0;
let evmTrendingCache: PopularToken[] | null = null;
let evmCacheTime: number = 0;
const TRENDING_CACHE_DURATION = 10 * 60 * 1000;

const TOP_TOKENS_LIMIT = 50;

export async function fetchPopularTokens(
  chainType: 'solana' | 'evm' = 'solana',
  forceRefresh: boolean = false,
): Promise<PopularToken[]> {
  if (chainType === 'evm') {
    return fetchEVMPopularTokens(forceRefresh);
  }
  return fetchSolanaPopularTokens(forceRefresh);
}

async function fetchSolanaPopularTokens(forceRefresh: boolean = false): Promise<PopularToken[]> {
  if (
    !forceRefresh &&
    solanaTrendingCache &&
    solanaTrendingCache.length > 0 &&
    Date.now() - solanaCacheTime < TRENDING_CACHE_DURATION
  ) {
    return solanaTrendingCache;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);

    const response = await fetch(JUPITER_TOKENS_LIST_API, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return solanaTrendingCache || [];
    }

    const data: JupiterTokenInfo[] = await response.json();

    const tokens: PopularToken[] = data
      .filter((t) => t.symbol && t.name && t.address)
      .map((t) => ({
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
    }

    return tokens;
  } catch (error) {
    return solanaTrendingCache || [];
  }
}

async function fetchEVMPopularTokens(forceRefresh: boolean = false): Promise<PopularToken[]> {
  if (
    !forceRefresh &&
    evmTrendingCache &&
    evmTrendingCache.length > 0 &&
    Date.now() - evmCacheTime < TRENDING_CACHE_DURATION
  ) {
    return evmTrendingCache;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);

    const response = await fetch(COINGECKO_TOP_TOKENS_API, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      evmTrendingCache = POPULAR_ERC20_TOKENS;
      evmCacheTime = Date.now();
      return POPULAR_ERC20_TOKENS;
    }

    const data = (await response.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      image: string;
      current_price: number;
      market_cap: number;
      platforms?: Record<string, string>;
    }>;

    const tokens: PopularToken[] = data
      .filter((t) => t.platforms?.ethereum)
      .map((t) => ({
        mint: t.platforms!.ethereum,
        symbol: t.symbol.toUpperCase(),
        name: t.name,
        decimals: 18,
        logoUri: t.image,
        volume24h: t.market_cap || 0,
        chainType: 'evm' as const,
      }))
      .slice(0, TOP_TOKENS_LIMIT);

    if (tokens.length < 10) {
      const seenAddresses = new Set(tokens.map((t) => t.mint.toLowerCase()));
      for (const token of POPULAR_ERC20_TOKENS) {
        if (!seenAddresses.has(token.mint.toLowerCase())) {
          tokens.push(token);
        }
      }
    }

    if (tokens.length > 0) {
      evmTrendingCache = tokens;
      evmCacheTime = Date.now();
    }

    return tokens;
  } catch (error) {
    if (!evmTrendingCache) {
      evmTrendingCache = POPULAR_ERC20_TOKENS;
      evmCacheTime = Date.now();
    }
    return evmTrendingCache;
  }
}

export function searchPopularTokens(query: string, tokens: PopularToken[]): PopularToken[] {
  if (!query.trim()) return tokens;

  const lowerQuery = query.toLowerCase().trim();

  return tokens.filter(
    (token) =>
      token.symbol.toLowerCase().includes(lowerQuery) ||
      token.name.toLowerCase().includes(lowerQuery) ||
      token.mint.toLowerCase().includes(lowerQuery),
  );
}

export function findPopularTokenByMint(mint: string, tokens: PopularToken[]): PopularToken | null {
  return tokens.find((t) => t.mint.toLowerCase() === mint.toLowerCase()) || null;
}

const TOKEN_CACHE_DURATION = 5 * 60 * 1000;

const STALE_REVALIDATE_WINDOW = 30 * 1000;

interface TokenCache {
  tokens: SPLTokenBalance[];
  fetchedAt: number;
  address: string;
}

let tokenCache: TokenCache | null = null;

export function clearTokenCache(): void {
  tokenCache = null;

  tokenDedup.invalidate(/^tokens:/);
}

function getCacheStatus(
  address: string,
  allowStale: boolean = false,
): { valid: boolean; stale: boolean } {
  if (!tokenCache) return { valid: false, stale: false };
  if (tokenCache.address !== address) return { valid: false, stale: false };

  const age = Date.now() - tokenCache.fetchedAt;

  if (age <= TOKEN_CACHE_DURATION) {
    return { valid: true, stale: false };
  }

  if (allowStale && age <= TOKEN_CACHE_DURATION + STALE_REVALIDATE_WINDOW) {
    return { valid: true, stale: true };
  }

  return { valid: false, stale: false };
}

function isCacheValid(address: string): boolean {
  return getCacheStatus(address).valid;
}

let backgroundRefreshInProgress = false;

export async function getTokenBalances(forceRefresh: boolean = false): Promise<SPLTokenBalance[]> {
  const address = await getPublicAddress();
  if (!address) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_INITIALIZED, 'No wallet found');
  }

  const cacheStatus = getCacheStatus(address, true);

  if (!forceRefresh && cacheStatus.valid) {
    if (cacheStatus.stale && !backgroundRefreshInProgress) {
      backgroundRefreshInProgress = true;
      const bgKey = tokenBalanceKey('solana', address, 'background');
      tokenDedup
        .execute(bgKey, () => fetchTokenBalancesInternal(address), 0)
        .finally(() => {
          backgroundRefreshInProgress = false;
        });
    }
    return tokenCache!.tokens;
  }

  const cacheKey = tokenBalanceKey('solana', address);
  return tokenDedup.execute(
    cacheKey,
    () => fetchTokenBalancesInternal(address),
    forceRefresh ? 0 : TOKEN_BALANCE_CACHE_TTL,
  );
}

async function fetchTokenBalancesInternal(address: string): Promise<SPLTokenBalance[]> {
  try {
    const connection = await getCurrentConnection();
    const publicKey = new PublicKey(address);

    type TokenAccountResult = Awaited<ReturnType<typeof connection.getParsedTokenAccountsByOwner>>;
    let tokenAccounts: TokenAccountResult;
    let token2022Accounts: TokenAccountResult = { value: [], context: { slot: 0 } };

    try {
      tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });
    } catch (error) {
      if (tokenCache && tokenCache.address === address) {
        return tokenCache.tokens;
      }
      throw error;
    }

    try {
      token2022Accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      });
    } catch {}

    const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];

    const tokens: SPLTokenBalance[] = [];
    const foundMints = new Set<string>();

    for (const account of allAccounts) {
      const parsed = parseTokenAccount(account);
      if (parsed) {
        tokens.push(parsed);
        foundMints.add(parsed.mint);
      }
    }

    const settings = await getWalletSettings();
    const customTokens = settings.customTokens || [];
    const hiddenTokens = new Set(settings.hiddenTokens || []);
    const customTokenMints = new Set(customTokens.map((t) => t.mint));

    const tokensToUnhide = new Set<string>();
    for (const token of tokens) {
      if (
        hiddenTokens.has(token.mint) &&
        !customTokenMints.has(token.mint) &&
        token.uiBalance > 0
      ) {
        tokensToUnhide.add(token.mint);
        hiddenTokens.delete(token.mint);
      }
    }

    if (tokensToUnhide.size > 0) {
      const newHiddenTokens = Array.from(hiddenTokens);
      await saveWalletSettings({ hiddenTokens: newHiddenTokens });
    }

    const visibleTokens = tokens.filter(
      (t) => !hiddenTokens.has(t.mint) || customTokenMints.has(t.mint),
    );
    tokens.length = 0;
    tokens.push(...visibleTokens);

    for (const token of tokens) {
      const customToken = customTokens.find(
        (ct) => ct.mint === token.mint && !ct.mint.startsWith('0x'),
      );
      if (customToken) {
        if (customToken.symbol) token.symbol = customToken.symbol;
        if (customToken.name) token.name = customToken.name;
        if (customToken.logoUri) token.logoUri = customToken.logoUri;
      }
    }

    for (const customToken of customTokens) {
      const isEVMToken = customToken.mint.startsWith('0x');
      if (isEVMToken) continue;

      if (!foundMints.has(customToken.mint) && !hiddenTokens.has(customToken.mint)) {
        const metadata = getTokenMetadata(customToken.mint);

        tokens.push({
          mint: customToken.mint,
          symbol: customToken.symbol || metadata?.symbol || truncateMint(customToken.mint),
          name: customToken.name || metadata?.name || 'Unknown Token',
          decimals: metadata?.decimals || 9,
          rawBalance: '0',
          uiBalance: 0,
          tokenAccount: null as unknown as string,
          logoUri: customToken.logoUri || metadata?.logoUri,
        });
      }
    }

    const unknownTokens = tokens
      .filter((t) => t.name === 'Unknown Token' || t.symbol.includes('...'))
      .slice(0, 10);

    if (unknownTokens.length > 0) {
      const batchSize = 3;
      for (let i = 0; i < unknownTokens.length; i += batchSize) {
        const batch = unknownTokens.slice(i, i + batchSize);
        const enrichedPromises = batch.map(async (token) => {
          try {
            const enriched = await enrichTokenWithJupiterMetadata(token);

            const idx = tokens.findIndex((t) => t.mint === token.mint);
            if (idx >= 0) {
              tokens[idx] = enriched;
            }
          } catch {}
        });
        await Promise.allSettled(enrichedPromises);
      }
    }

    tokens.sort((a, b) => {
      if (a.uiBalance > 0 && b.uiBalance === 0) return -1;
      if (a.uiBalance === 0 && b.uiBalance > 0) return 1;
      return b.uiBalance - a.uiBalance;
    });

    tokenCache = {
      tokens,
      fetchedAt: Date.now(),
      address,
    };

    return tokens;
  } catch (error) {
    if (tokenCache && tokenCache.address === address) {
      return tokenCache.tokens;
    }

    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      `Failed to fetch token balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

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

function parseTokenAccount(account: {
  pubkey: PublicKey;
  account: AccountInfo<ParsedAccountData>;
}): SPLTokenBalance | null {
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

    const metadata = getTokenMetadata(mint);

    const tokenBalance: SPLTokenBalance = {
      mint,
      symbol: metadata?.symbol || truncateMint(mint),
      name: metadata?.name || 'Unknown Token',
      decimals: tokenAmount.decimals,
      rawBalance: tokenAmount.amount,
      uiBalance: parseFloat(tokenAmount.uiAmountString || '0'),
      tokenAccount: account.pubkey.toBase58(),
      logoUri: metadata?.logoUri,
    };

    // Cache metadata if we have it
    if (metadata) {
      saveTokenMetadataToCache(mint, {
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        logoUri: metadata.logoUri,
      }).catch(() => {}); // Fire and forget
    }

    return tokenBalance;
  } catch (error) {
    return null;
  }
}

async function enrichTokenWithJupiterMetadata(token: SPLTokenBalance): Promise<SPLTokenBalance> {
  if (token.name !== 'Unknown Token' && !token.symbol.includes('...')) {
    return token;
  }

  const jupiterMetadata = await fetchJupiterTokenMetadata(token.mint);

  if (jupiterMetadata) {
    const enriched = {
      ...token,
      symbol: jupiterMetadata.symbol,
      name: jupiterMetadata.name,
      logoUri: jupiterMetadata.logoUri || token.logoUri,
    };

    // Cache to persistent storage
    await saveTokenMetadataToCache(token.mint, {
      symbol: enriched.symbol,
      name: enriched.name,
      decimals: enriched.decimals,
      logoUri: enriched.logoUri,
    });

    return enriched;
  }

  return token;
}

export function getTokenMetadata(mint: string): TokenMetadata | undefined {
  return tokenMetadataMap.get(mint);
}

export async function addCustomToken(
  mint: string,
  symbol?: string,
  name?: string,
  logoUri?: string,
): Promise<void> {
  const isEVMAddress = mint.startsWith('0x') && mint.length === 42;

  if (isEVMAddress) {
    const { isValidEVMAddress } = await import('./keychain');

    if (!isValidEVMAddress(mint)) {
      throw new WalletError(WalletErrorCode.INVALID_RECIPIENT, 'Invalid token contract address');
    }

    const settings = await getWalletSettings();
    const chainId = settings.activeEVMChain || 'ethereum';
    const testnet = settings.networkEnvironment === 'testnet';

    const { isERC20Token } = await import('./chains/evm/tokens');
    const isValid = await isERC20Token(chainId, testnet, mint);

    if (!isValid) {
      throw new WalletError(
        WalletErrorCode.TOKEN_NOT_FOUND,
        'Token contract not found or invalid ERC-20 token',
      );
    }
  } else {
    try {
      new PublicKey(mint);
    } catch {
      throw new WalletError(WalletErrorCode.INVALID_RECIPIENT, 'Invalid token mint address');
    }

    const tokenExists = await verifyTokenMint(mint);
    if (!tokenExists) {
      throw new WalletError(WalletErrorCode.TOKEN_NOT_FOUND, 'Token mint not found on-chain');
    }
  }

  const { invalidateSettingsCache } = await import('./storage');
  invalidateSettingsCache();

  const settings = await getWalletSettings();
  const customTokens = settings.customTokens || [];
  const hiddenTokens = settings.hiddenTokens || [];

  const normalizedMint = isEVMAddress ? mint.toLowerCase() : mint;

  const existingIndex = customTokens.findIndex((t) => {
    const normalizedToken = isEVMAddress ? t.mint.toLowerCase() : t.mint;
    return normalizedToken === normalizedMint;
  });

  const newToken: CustomToken = {
    mint: normalizedMint,
    symbol,
    name,
    logoUri,
    addedAt: Date.now(),
  };

  if (existingIndex >= 0) {
    customTokens[existingIndex] = newToken;
  } else {
    customTokens.push(newToken);
  }

  const newHiddenTokens = hiddenTokens.filter((t) => {
    if (isEVMAddress) {
      return t.toLowerCase() !== normalizedMint;
    }
    return t !== normalizedMint;
  });

  await saveWalletSettings({
    customTokens,
    hiddenTokens: newHiddenTokens,
  });

  await saveTokenMetadataToCache(normalizedMint, {
    symbol: symbol,
    name: name,
    logoUri: logoUri,
  });

  clearTokenCache();
}

export async function removeCustomToken(mint: string): Promise<void> {
  const { invalidateSettingsCache } = await import('./storage');
  invalidateSettingsCache();

  const settings = await getWalletSettings();
  const customTokens = settings.customTokens || [];
  const hiddenTokens = settings.hiddenTokens || [];

  const isEVMAddress = mint.startsWith('0x');
  const normalizedMint = isEVMAddress ? mint.toLowerCase() : mint;

  const filteredCustom = customTokens.filter((t) => {
    const normalizedToken = isEVMAddress ? t.mint.toLowerCase() : t.mint;
    return normalizedToken !== normalizedMint;
  });

  const alreadyHidden = isEVMAddress
    ? hiddenTokens.some((h) => h.toLowerCase() === normalizedMint)
    : hiddenTokens.includes(mint);

  const newHiddenTokens = alreadyHidden ? hiddenTokens : [...hiddenTokens, normalizedMint];

  const wasInCustomTokens = filteredCustom.length < customTokens.length;

  await saveWalletSettings({
    customTokens: filteredCustom,
    hiddenTokens: newHiddenTokens,
  });

  clearTokenCache();
}

export function getTokenLogo(mint: string): string | undefined {
  const metadata = getTokenMetadata(mint);
  return metadata?.logoUri;
}

export function formatTokenBalance(balance: number, decimals: number = 2): string {
  if (balance === 0) return '0';
  if (balance < 0.01) return '<0.01';
  return balance.toFixed(decimals);
}

function truncateMint(mint: string): string {
  return `${mint.slice(0, 4)}...`;
}

export async function verifyTokenMint(mint: string): Promise<boolean> {
  try {
    const connection = await getCurrentConnection();
    const mintPubkey = new PublicKey(mint);
    const accountInfo = await connection.getAccountInfo(mintPubkey);

    if (!accountInfo) {
      return false;
    }

    const owner = accountInfo.owner.toBase58();
    return owner === TOKEN_PROGRAM_ID.toBase58() || owner === TOKEN_2022_PROGRAM_ID.toBase58();
  } catch {
    return false;
  }
}

export function getTokenLogoUrls(token: SPLTokenBalance): string[] {
  const urls: string[] = [];

  if (token.logoUri) {
    urls.push(token.logoUri);
  }

  urls.push(
    `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`,
  );

  urls.push(`https://tokens.jup.ag/token/${token.mint}/logo`);

  urls.push(generateTokenPlaceholder(token.symbol));

  return urls;
}

export function generateTokenPlaceholder(symbol: string): string {
  const initials = symbol.slice(0, 2).toUpperCase();
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="#1a1a24" stroke="#9945FF" stroke-width="2"/>
      <text x="50" y="60" text-anchor="middle" fill="#f0f0f5" font-size="24" font-family="system-ui">
        ${initials}
      </text>
    </svg>
  `)
  );
}
