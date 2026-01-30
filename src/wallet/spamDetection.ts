/**
 * Intelligent Spam Token Detection
 *
 * This module provides multi-signal spam token detection to identify and filter
 * likely spam/scam/dust tokens while being extremely careful not to exclude real tokens.
 *
 * Detection Philosophy:
 * - Be conservative: It's better to show a spam token than hide a real one
 * - Use multiple signals: No single signal should trigger spam classification
 * - Allow user override: Users can always unhide tokens they want to see
 * - Trust verified sources: Tokens from Jupiter verified list are never spam
 */

import type { SPLTokenBalance, EVMTokenBalance } from './types';

/** Configuration for spam detection thresholds */
export interface SpamDetectionConfig {
  /** Enable spam detection (default: true) */
  enabled: boolean;
  /** Hide tokens that look like spam (default: true, but show warning badge) */
  autoHideSpam: boolean;
  /** Minimum confidence score to flag as spam (0-100, default: 70) */
  minConfidenceThreshold: number;
  /** User-whitelisted token addresses (never flag as spam) */
  whitelistedTokens: string[];
}

export const DEFAULT_SPAM_CONFIG: SpamDetectionConfig = {
  enabled: true,
  autoHideSpam: false, // Default: show but flag (don't auto-hide, be conservative)
  minConfidenceThreshold: 70,
  whitelistedTokens: [],
};

/** Spam detection result for a token */
export interface SpamDetectionResult {
  /** Whether the token is likely spam */
  isSpam: boolean;
  /** Confidence score 0-100 (higher = more confident it's spam) */
  confidence: number;
  /** Reasons why it was flagged (for transparency) */
  reasons: string[];
  /** Specific signals that were detected */
  signals: SpamSignal[];
}

export interface SpamSignal {
  type: SpamSignalType;
  weight: number;
  description: string;
}

export type SpamSignalType =
  | 'url_in_name' // URL/domain in token name/symbol
  | 'phishing_keywords' // Known phishing/scam keywords
  | 'homoglyph_attack' // Unicode look-alike characters
  | 'impersonation' // Trying to look like a known token
  | 'suspicious_characters' // Unusual characters, emojis, etc.
  | 'excessive_length' // Unreasonably long name/symbol
  | 'promotional_text' // "FREE", "CLAIM", "AIRDROP" etc.
  | 'round_dust_amount' // Suspiciously round small amounts
  | 'zero_value' // No market value or liquidity
  | 'no_metadata' // Failed to fetch any metadata
  | 'generic_name'; // Very generic/template-like name

/** Well-known token symbols that shouldn't be flagged */
const KNOWN_TOKEN_SYMBOLS = new Set([
  'SOL',
  'WSOL',
  'USDC',
  'USDT',
  'BONK',
  'JUP',
  'RAY',
  'ORCA',
  'MSOL',
  'JSOL',
  'BSOL',
  'JITOSOL',
  'WIF',
  'PYTH',
  'JTO',
  'TNSR',
  'W',
  'KMNO',
  'DRIFT',
  'IO',
  'RENDER',
  'HNT',
  'MOBILE',
  'IOT',
  // EVM
  'ETH',
  'WETH',
  'DAI',
  'LINK',
  'UNI',
  'AAVE',
  'MKR',
  'SHIB',
  'PEPE',
  'WBTC',
  'LDO',
  'ARB',
  'OP',
  'MATIC',
  'BNB',
  'WBNB',
]);

/** Known legitimate token mints/addresses that should never be flagged */
const VERIFIED_TOKEN_ADDRESSES = new Set([
  // Solana
  'So11111111111111111111111111111111111111112', // wSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH (Wormhole)
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', // ORCA
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', // PYTH
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', // JTO
  'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6', // TNSR
  // EVM common
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0x6b175474e89094c44da98b954eedeac5b3ddc6e0', // DAI
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
]);

// Patterns for spam detection

/** URL patterns in token names */
const URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{2,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/i;

/** Domain-like patterns */
const DOMAIN_PATTERN = /\b[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|org|net|io|xyz|app|finance|claim|airdrop)\b/i;

/** Phishing/scam keywords that are suspicious in token names */
const PHISHING_KEYWORDS = [
  'claim',
  'free',
  'airdrop',
  'reward',
  'bonus',
  'gift',
  'giveaway',
  'promo',
  'prize',
  'winner',
  'congratulations',
  'congrats',
  'visit',
  'redeem',
  'unlock',
  'activate',
  'verify',
  'validate',
  'connect wallet',
  'link wallet',
  'sync wallet',
  'update required',
  'action required',
  'limited time',
  'urgent',
  'expires',
  'expiring',
  'hurry',
  'act now',
  'dont miss',
  "don't miss",
  'last chance',
  'final',
  'exclusive',
  'selected',
  'chosen',
  'eligible',
  'qualification',
];

/** Promotional patterns that are suspicious */
const PROMOTIONAL_PATTERNS = [
  /\bfree\s+\w+/i,
  /\bclaim\s+(?:your|now|here|at)/i,
  /\bairdrop\s+(?:live|now|claim)/i,
  /\$\d+(?:,\d{3})*(?:\.\d+)?\s*(?:reward|bonus|free)/i,
  /\bvisit\s+\S+\.\S+/i,
  /\bgo\s+to\s+\S+\.\S+/i,
];

/** Characters that are suspicious in token names (potential homoglyph attacks) */
const HOMOGLYPH_MAP: Record<string, string[]> = {
  a: ['а', 'А', 'ạ', 'ą', 'α', 'ά', 'Α'],
  c: ['с', 'С', 'ç', 'ć', 'Ç', 'Ć'],
  e: ['е', 'Е', 'ẹ', 'ę', 'ε', 'έ', 'Ε'],
  i: ['і', 'І', 'ị', 'ι', 'ί', 'Ι'],
  o: ['о', 'О', 'ọ', 'ο', 'ό', '0', 'Ο'],
  p: ['р', 'Р', 'ρ', 'Ρ'],
  s: ['ѕ', 'Ѕ', '$', '5'],
  u: ['υ', 'ụ', 'Υ'],
  x: ['х', 'Х', 'χ', 'Χ'],
  y: ['у', 'У', 'ỳ', 'γ', 'Υ'],
};

/** All homoglyph characters flattened */
const ALL_HOMOGLYPHS = new Set(Object.values(HOMOGLYPH_MAP).flat());

/** Suspicious round amounts that are often used in dust attacks */
const SUSPICIOUS_ROUND_AMOUNTS = new Set([
  0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000,
  1000000000, 888, 888888, 8888888, 999, 999999, 777, 777777, 666, 666666, 123456, 111111, 222222,
  333333, 444444, 555555,
]);

/**
 * Main spam detection function for SPL tokens
 */
export function detectSpamToken(
  token: SPLTokenBalance,
  config: SpamDetectionConfig = DEFAULT_SPAM_CONFIG,
): SpamDetectionResult {
  // Early exit if disabled or whitelisted
  if (!config.enabled) {
    return { isSpam: false, confidence: 0, reasons: [], signals: [] };
  }

  // Never flag verified tokens
  if (VERIFIED_TOKEN_ADDRESSES.has(token.mint)) {
    return { isSpam: false, confidence: 0, reasons: [], signals: [] };
  }

  // Check user whitelist
  if (config.whitelistedTokens.includes(token.mint)) {
    return { isSpam: false, confidence: 0, reasons: [], signals: [] };
  }

  const signals: SpamSignal[] = [];
  const name = token.name || '';
  const symbol = token.symbol || '';
  const combined = `${name} ${symbol}`.toLowerCase();

  // Signal 1: URL in name/symbol (high confidence)
  if (URL_PATTERN.test(name) || URL_PATTERN.test(symbol)) {
    signals.push({
      type: 'url_in_name',
      weight: 40,
      description: 'Contains URL or website address',
    });
  } else if (DOMAIN_PATTERN.test(name) || DOMAIN_PATTERN.test(symbol)) {
    signals.push({
      type: 'url_in_name',
      weight: 35,
      description: 'Contains domain-like pattern',
    });
  }

  // Signal 2: Phishing keywords
  const foundKeywords = PHISHING_KEYWORDS.filter((keyword) => combined.includes(keyword));
  if (foundKeywords.length >= 2) {
    signals.push({
      type: 'phishing_keywords',
      weight: 30,
      description: `Contains suspicious keywords: ${foundKeywords.slice(0, 3).join(', ')}`,
    });
  } else if (foundKeywords.length === 1) {
    signals.push({
      type: 'phishing_keywords',
      weight: 15,
      description: `Contains suspicious keyword: ${foundKeywords[0]}`,
    });
  }

  // Signal 3: Promotional patterns
  const hasPromoPattern = PROMOTIONAL_PATTERNS.some((pattern) => pattern.test(combined));
  if (hasPromoPattern) {
    signals.push({
      type: 'promotional_text',
      weight: 25,
      description: 'Contains promotional/scam pattern',
    });
  }

  // Signal 4: Homoglyph characters (impersonation attempt)
  const hasHomoglyphs = [...name, ...symbol].some((char) => ALL_HOMOGLYPHS.has(char));
  if (hasHomoglyphs) {
    signals.push({
      type: 'homoglyph_attack',
      weight: 35,
      description: 'Contains suspicious look-alike characters',
    });
  }

  // Signal 5: Non-ASCII characters in symbol (real tokens use ASCII)
  const hasNonAsciiSymbol = /[^\x00-\x7F]/.test(symbol);
  if (hasNonAsciiSymbol && symbol.length > 0) {
    signals.push({
      type: 'suspicious_characters',
      weight: 20,
      description: 'Symbol contains non-ASCII characters',
    });
  }

  // Signal 6: Excessive length
  if (symbol.length > 12) {
    signals.push({
      type: 'excessive_length',
      weight: 15,
      description: `Symbol unusually long (${symbol.length} chars)`,
    });
  }
  if (name.length > 50) {
    signals.push({
      type: 'excessive_length',
      weight: 10,
      description: `Name unusually long (${name.length} chars)`,
    });
  }

  // Signal 7: Impersonation of known tokens
  const impersonationCheck = checkImpersonation(symbol, name);
  if (impersonationCheck) {
    signals.push({
      type: 'impersonation',
      weight: impersonationCheck.weight,
      description: impersonationCheck.description,
    });
  }

  // Signal 8: Suspicious round amounts (dust attack pattern)
  if (token.uiBalance > 0 && token.uiBalance < 0.01) {
    // Very small balance
    if (SUSPICIOUS_ROUND_AMOUNTS.has(token.uiBalance)) {
      signals.push({
        type: 'round_dust_amount',
        weight: 10,
        description: 'Suspiciously round small amount',
      });
    }
  } else if (SUSPICIOUS_ROUND_AMOUNTS.has(token.uiBalance)) {
    // Suspiciously round larger amount
    signals.push({
      type: 'round_dust_amount',
      weight: 5,
      description: 'Suspiciously round amount',
    });
  }

  // Signal 9: Generic/template name
  if (isGenericName(name)) {
    signals.push({
      type: 'generic_name',
      weight: 10,
      description: 'Generic or template-like name',
    });
  }

  // Signal 10: No logo and unknown metadata
  if (!token.logoUri && name === 'Unknown Token') {
    signals.push({
      type: 'no_metadata',
      weight: 15,
      description: 'No metadata available for this token',
    });
  }

  // Calculate total confidence score
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const confidence = Math.min(100, totalWeight);
  const reasons = signals.map((s) => s.description);

  // Determine if it's spam based on confidence threshold
  const isSpam = confidence >= config.minConfidenceThreshold;

  return {
    isSpam,
    confidence,
    reasons,
    signals,
  };
}

/**
 * Spam detection for EVM tokens
 */
export function detectSpamEVMToken(
  token: EVMTokenBalance,
  config: SpamDetectionConfig = DEFAULT_SPAM_CONFIG,
): SpamDetectionResult {
  // Early exit if disabled or whitelisted
  if (!config.enabled) {
    return { isSpam: false, confidence: 0, reasons: [], signals: [] };
  }

  // Normalize address for comparison
  const normalizedAddress = token.address.toLowerCase();

  // Never flag verified tokens
  if (VERIFIED_TOKEN_ADDRESSES.has(normalizedAddress)) {
    return { isSpam: false, confidence: 0, reasons: [], signals: [] };
  }

  // Check user whitelist
  if (config.whitelistedTokens.some((t) => t.toLowerCase() === normalizedAddress)) {
    return { isSpam: false, confidence: 0, reasons: [], signals: [] };
  }

  // Convert to SPLTokenBalance-like structure and reuse logic
  const pseudoToken: SPLTokenBalance = {
    mint: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    rawBalance: token.rawBalance,
    uiBalance: token.uiBalance,
    tokenAccount: '',
    logoUri: token.logoUri,
  };

  return detectSpamToken(pseudoToken, config);
}

/**
 * Check if a token is trying to impersonate a known token
 */
function checkImpersonation(
  symbol: string,
  name: string,
): { weight: number; description: string } | null {
  const normalizedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalizedName = name.toLowerCase();

  // Check for exact known symbols with different casing/spacing
  for (const knownSymbol of KNOWN_TOKEN_SYMBOLS) {
    // Skip if it's exactly the same (might be legitimate)
    if (normalizedSymbol === knownSymbol) {
      continue;
    }

    // Check for very similar symbols (1-2 char difference)
    if (normalizedSymbol.length >= 3 && levenshteinDistance(normalizedSymbol, knownSymbol) <= 1) {
      return {
        weight: 40,
        description: `May be impersonating ${knownSymbol}`,
      };
    }

    // Check for prefixed/suffixed versions
    if (
      normalizedSymbol !== knownSymbol &&
      (normalizedSymbol.startsWith(knownSymbol) || normalizedSymbol.endsWith(knownSymbol))
    ) {
      // Common legitimate prefixes (wrapped, staked, etc.)
      const legitimatePrefixes = ['W', 'S', 'ST', 'X', 'A', 'C', 'B', 'M', 'J'];
      const legitimateSuffixes = ['2', 'V2', 'LP', 'PERP'];

      const prefix = normalizedSymbol.replace(knownSymbol, '');
      const isLegitimate =
        legitimatePrefixes.includes(prefix) || legitimateSuffixes.includes(prefix);

      if (!isLegitimate && prefix.length <= 3) {
        return {
          weight: 25,
          description: `Similar to known token ${knownSymbol}`,
        };
      }
    }
  }

  // Check name for impersonation patterns
  const impersonationPatterns = [
    { pattern: /\bsolana\s+2/i, real: 'Solana' },
    { pattern: /\bphantom\s+token/i, real: 'Phantom Wallet' },
    { pattern: /\bjupiter\s+(?:2|v2|new)/i, real: 'Jupiter' },
    { pattern: /\braydium\s+(?:2|v2|new)/i, real: 'Raydium' },
  ];

  for (const { pattern, real } of impersonationPatterns) {
    if (pattern.test(name)) {
      return {
        weight: 35,
        description: `May be impersonating ${real}`,
      };
    }
  }

  return null;
}

/**
 * Check if a name is suspiciously generic
 */
function isGenericName(name: string): boolean {
  const genericPatterns = [
    /^token$/i,
    /^new token$/i,
    /^test token$/i,
    /^my token$/i,
    /^unknown$/i,
    /^untitled$/i,
    /^token \d+$/i,
    /^coin$/i,
    /^cryptocurrency$/i,
  ];

  return genericPatterns.some((pattern) => pattern.test(name.trim()));
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Batch spam detection for multiple tokens
 */
export function detectSpamTokensBatch(
  tokens: SPLTokenBalance[],
  config: SpamDetectionConfig = DEFAULT_SPAM_CONFIG,
): Map<string, SpamDetectionResult> {
  const results = new Map<string, SpamDetectionResult>();

  for (const token of tokens) {
    results.set(token.mint, detectSpamToken(token, config));
  }

  return results;
}

/**
 * Batch spam detection for EVM tokens
 */
export function detectSpamEVMTokensBatch(
  tokens: EVMTokenBalance[],
  config: SpamDetectionConfig = DEFAULT_SPAM_CONFIG,
): Map<string, SpamDetectionResult> {
  const results = new Map<string, SpamDetectionResult>();

  for (const token of tokens) {
    results.set(token.address.toLowerCase(), detectSpamEVMToken(token, config));
  }

  return results;
}

/**
 * Filter out spam tokens from a list (keeping tokens that pass threshold)
 */
export function filterSpamTokens<T extends SPLTokenBalance | EVMTokenBalance>(
  tokens: T[],
  config: SpamDetectionConfig = DEFAULT_SPAM_CONFIG,
): { clean: T[]; spam: T[]; results: Map<string, SpamDetectionResult> } {
  const clean: T[] = [];
  const spam: T[] = [];
  const results = new Map<string, SpamDetectionResult>();

  for (const token of tokens) {
    const isSPL = 'mint' in token;
    const address = isSPL ? (token as SPLTokenBalance).mint : (token as EVMTokenBalance).address;

    const result = isSPL
      ? detectSpamToken(token as SPLTokenBalance, config)
      : detectSpamEVMToken(token as EVMTokenBalance, config);

    results.set(address, result);

    if (result.isSpam) {
      spam.push(token);
    } else {
      clean.push(token);
    }
  }

  return { clean, spam, results };
}

/**
 * Get human-readable spam reason summary
 */
export function getSpamReasonSummary(result: SpamDetectionResult): string {
  if (!result.isSpam || result.reasons.length === 0) {
    return '';
  }

  if (result.reasons.length === 1) {
    return result.reasons[0];
  }

  return `${result.reasons[0]} (+${result.reasons.length - 1} more)`;
}

/**
 * Determine if a token should be visually flagged (but not hidden)
 */
export function shouldFlagToken(result: SpamDetectionResult): boolean {
  // Flag if there's any confidence > 30, even if below spam threshold
  return result.confidence >= 30;
}

/**
 * Get the appropriate warning level for UI display
 */
export function getSpamWarningLevel(
  result: SpamDetectionResult,
): 'none' | 'low' | 'medium' | 'high' {
  if (result.confidence < 30) return 'none';
  if (result.confidence < 50) return 'low';
  if (result.confidence < 70) return 'medium';
  return 'high';
}
