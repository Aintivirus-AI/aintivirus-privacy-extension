/**
 * AINTIVIRUS Wallet Module - SPL Token Support
 * 
 * This module handles SPL token operations:
 * - Detect token accounts owned by the wallet
 * - Fetch token balances
 * - Resolve token metadata (name, symbol, logo)
 * - Manage custom/manual token additions
 * 
 * Uses standard Solana RPC methods:
 * - getTokenAccountsByOwner: Get all token accounts
 * - getTokenAccountBalance: Get specific token balance
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

    // Parse token balances
    const tokens: SPLTokenBalance[] = [];

    for (const account of allAccounts) {
      const parsed = parseTokenAccount(account);
      if (parsed && parsed.uiBalance > 0) {
        tokens.push(parsed);
      }
    }

    // Get custom tokens from settings
    const settings = await getWalletSettings();
    const customTokens = settings.customTokens || [];

    // Merge custom token metadata
    for (const token of tokens) {
      const customToken = customTokens.find(ct => ct.mint === token.mint);
      if (customToken) {
        if (customToken.symbol) token.symbol = customToken.symbol;
        if (customToken.name) token.name = customToken.name;
      }
    }

    // Sort by UI balance (highest first)
    tokens.sort((a, b) => b.uiBalance - a.uiBalance);

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
 * Parse a token account into SPLTokenBalance
 * 
 * @param account - Parsed token account from RPC
 * @returns SPLTokenBalance or null if invalid
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

    // Get metadata from default list or generate defaults
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
 * Get token logo with fallback
 * 
 * @param token - Token balance
 * @returns Logo URI or placeholder
 */
export function getTokenLogo(token: SPLTokenBalance): string {
  if (token.logoUri) {
    return token.logoUri;
  }
  
  // Return a generic token placeholder
  // In production, you might use a service like Solana FM or Jupiter
  return 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="#1a1a24" stroke="#6366f1" stroke-width="2"/>
      <text x="50" y="60" text-anchor="middle" fill="#f0f0f5" font-size="24" font-family="system-ui">
        ${token.symbol.slice(0, 2).toUpperCase()}
      </text>
    </svg>
  `);
}



