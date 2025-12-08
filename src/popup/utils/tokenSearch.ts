/**
 * Token Search/Filter Utilities
 * 
 * Pure functions for searching and filtering tokens in the wallet.
 * Supports search by symbol, name, or address (mint/contract).
 */

import type { SPLTokenBalance, EVMTokenBalance } from '@shared/types';

/**
 * Token search result with match information
 */
export interface TokenSearchMatch {
  /** Which field matched: symbol, name, or address */
  matchField: 'symbol' | 'name' | 'address';
  /** Start index of match in the matched field */
  matchStart: number;
  /** Length of the match */
  matchLength: number;
}

/**
 * SPL Token with search match info
 */
export interface SPLTokenWithMatch extends SPLTokenBalance {
  searchMatch?: TokenSearchMatch;
}

/**
 * EVM Token with search match info
 */
export interface EVMTokenWithMatch extends EVMTokenBalance {
  searchMatch?: TokenSearchMatch;
}

/**
 * Native token representation for search
 */
export interface NativeToken {
  type: 'native';
  chain: 'solana' | 'evm';
  symbol: string;
  name: string;
  address?: string; // Native tokens don't have addresses, but we include for interface consistency
}

export interface NativeTokenWithMatch extends NativeToken {
  searchMatch?: TokenSearchMatch;
}

/**
 * Filter options for token search
 */
export interface TokenFilterOptions {
  /** Search query string */
  query: string;
  /** Whether to include hidden/spam tokens (future use) */
  includeHidden?: boolean;
  /** Whether to include zero-balance tokens */
  includeZeroBalance?: boolean;
  /** List of pinned token addresses to always show first */
  pinnedAddresses?: string[];
}

/**
 * Case-insensitive search for a query within text
 * Returns match info if found, undefined otherwise
 */
function findMatch(text: string, query: string): { start: number; length: number } | undefined {
  if (!query || !text) return undefined;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return undefined;
  return { start: index, length: query.length };
}

/**
 * Check if an SPL token matches the search query
 * Returns match info if found
 */
function matchSPLToken(token: SPLTokenBalance, query: string): TokenSearchMatch | undefined {
  if (!query.trim()) return undefined;

  const q = query.trim();

  // Try symbol first (most common search)
  const symbolMatch = findMatch(token.symbol, q);
  if (symbolMatch) {
    return { matchField: 'symbol', matchStart: symbolMatch.start, matchLength: symbolMatch.length };
  }

  // Try name
  const nameMatch = findMatch(token.name, q);
  if (nameMatch) {
    return { matchField: 'name', matchStart: nameMatch.start, matchLength: nameMatch.length };
  }

  // Try mint address
  const mintMatch = findMatch(token.mint, q);
  if (mintMatch) {
    return { matchField: 'address', matchStart: mintMatch.start, matchLength: mintMatch.length };
  }

  return undefined;
}

/**
 * Check if an EVM token matches the search query
 * Returns match info if found
 */
function matchEVMToken(token: EVMTokenBalance, query: string): TokenSearchMatch | undefined {
  if (!query.trim()) return undefined;

  const q = query.trim();

  // Try symbol first
  const symbolMatch = findMatch(token.symbol, q);
  if (symbolMatch) {
    return { matchField: 'symbol', matchStart: symbolMatch.start, matchLength: symbolMatch.length };
  }

  // Try name
  const nameMatch = findMatch(token.name, q);
  if (nameMatch) {
    return { matchField: 'name', matchStart: nameMatch.start, matchLength: nameMatch.length };
  }

  // Try contract address
  const addressMatch = findMatch(token.address, q);
  if (addressMatch) {
    return { matchField: 'address', matchStart: addressMatch.start, matchLength: addressMatch.length };
  }

  return undefined;
}

/**
 * Check if a native token (SOL/ETH) matches the search query
 */
function matchNativeToken(token: NativeToken, query: string): TokenSearchMatch | undefined {
  if (!query.trim()) return undefined;

  const q = query.trim();

  // Try symbol
  const symbolMatch = findMatch(token.symbol, q);
  if (symbolMatch) {
    return { matchField: 'symbol', matchStart: symbolMatch.start, matchLength: symbolMatch.length };
  }

  // Try name
  const nameMatch = findMatch(token.name, q);
  if (nameMatch) {
    return { matchField: 'name', matchStart: nameMatch.start, matchLength: nameMatch.length };
  }

  return undefined;
}

/**
 * Filter SPL tokens by search query
 * Returns filtered tokens with match information for highlighting
 */
export function filterSPLTokens(
  tokens: SPLTokenBalance[],
  options: TokenFilterOptions
): SPLTokenWithMatch[] {
  const { query, includeZeroBalance = true, pinnedAddresses = [] } = options;
  const trimmedQuery = query.trim();

  // If no query, return all tokens (possibly filtered by other options)
  if (!trimmedQuery) {
    let result = tokens;
    if (!includeZeroBalance) {
      result = result.filter(t => t.uiBalance > 0);
    }
    // Sort pinned tokens first
    if (pinnedAddresses.length > 0) {
      result = sortWithPinned(result, pinnedAddresses, t => t.mint);
    }
    return result;
  }

  // Filter tokens that match the query
  const matched: SPLTokenWithMatch[] = [];
  for (const token of tokens) {
    // Skip zero balance if not included
    if (!includeZeroBalance && token.uiBalance === 0) continue;

    const match = matchSPLToken(token, trimmedQuery);
    if (match) {
      matched.push({ ...token, searchMatch: match });
    }
  }

  // Sort: pinned first, then by match quality (symbol > name > address)
  return sortSearchResults(matched, pinnedAddresses, t => t.mint);
}

/**
 * Filter EVM tokens by search query
 */
export function filterEVMTokens(
  tokens: EVMTokenBalance[],
  options: TokenFilterOptions
): EVMTokenWithMatch[] {
  const { query, includeZeroBalance = true, pinnedAddresses = [] } = options;
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    let result = tokens;
    if (!includeZeroBalance) {
      result = result.filter(t => t.uiBalance > 0);
    }
    if (pinnedAddresses.length > 0) {
      result = sortWithPinned(result, pinnedAddresses, t => t.address);
    }
    return result;
  }

  const matched: EVMTokenWithMatch[] = [];
  for (const token of tokens) {
    if (!includeZeroBalance && token.uiBalance === 0) continue;

    const match = matchEVMToken(token, trimmedQuery);
    if (match) {
      matched.push({ ...token, searchMatch: match });
    }
  }

  return sortSearchResults(matched, pinnedAddresses, t => t.address);
}

/**
 * Check if native token (SOL/ETH) matches search query
 */
export function filterNativeToken(
  token: NativeToken,
  query: string
): NativeTokenWithMatch | null {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return token; // No query = show all

  const match = matchNativeToken(token, trimmedQuery);
  if (match) {
    return { ...token, searchMatch: match };
  }
  return null;
}

/**
 * Sort tokens with pinned tokens first
 */
function sortWithPinned<T>(
  tokens: T[],
  pinnedAddresses: string[],
  getAddress: (t: T) => string
): T[] {
  if (pinnedAddresses.length === 0) return tokens;

  const pinnedSet = new Set(pinnedAddresses.map(a => a.toLowerCase()));
  
  return [...tokens].sort((a, b) => {
    const aIsPinned = pinnedSet.has(getAddress(a).toLowerCase());
    const bIsPinned = pinnedSet.has(getAddress(b).toLowerCase());
    
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });
}

/**
 * Sort search results by match quality
 * Priority: symbol match > name match > address match
 * Within same priority, pinned tokens come first
 */
function sortSearchResults<T extends { searchMatch?: TokenSearchMatch }>(
  tokens: T[],
  pinnedAddresses: string[],
  getAddress: (t: T) => string
): T[] {
  const pinnedSet = new Set(pinnedAddresses.map(a => a.toLowerCase()));

  const matchPriority = (field: TokenSearchMatch['matchField'] | undefined): number => {
    switch (field) {
      case 'symbol': return 0;
      case 'name': return 1;
      case 'address': return 2;
      default: return 3;
    }
  };

  return [...tokens].sort((a, b) => {
    // First, sort by match quality
    const aPriority = matchPriority(a.searchMatch?.matchField);
    const bPriority = matchPriority(b.searchMatch?.matchField);
    if (aPriority !== bPriority) return aPriority - bPriority;

    // Then by pinned status
    const aIsPinned = pinnedSet.has(getAddress(a).toLowerCase());
    const bIsPinned = pinnedSet.has(getAddress(b).toLowerCase());
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;

    // Finally by match position (earlier match = better)
    const aStart = a.searchMatch?.matchStart ?? Infinity;
    const bStart = b.searchMatch?.matchStart ?? Infinity;
    return aStart - bStart;
  });
}

/**
 * Highlight matched text in a string
 * Returns an array of { text, highlighted } segments for rendering
 */
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export function highlightMatch(
  text: string,
  matchStart: number,
  matchLength: number
): HighlightSegment[] {
  if (matchStart < 0 || matchLength <= 0 || matchStart >= text.length) {
    return [{ text, highlighted: false }];
  }

  const segments: HighlightSegment[] = [];
  
  // Before match
  if (matchStart > 0) {
    segments.push({ text: text.slice(0, matchStart), highlighted: false });
  }
  
  // Match
  const matchEnd = Math.min(matchStart + matchLength, text.length);
  segments.push({ text: text.slice(matchStart, matchEnd), highlighted: true });
  
  // After match
  if (matchEnd < text.length) {
    segments.push({ text: text.slice(matchEnd), highlighted: false });
  }

  return segments;
}

/**
 * Check if there are any search results
 */
export function hasSearchResults(
  solMatches: boolean,
  ethMatches: boolean,
  splTokens: SPLTokenWithMatch[],
  evmTokens: EVMTokenWithMatch[]
): boolean {
  return solMatches || ethMatches || splTokens.length > 0 || evmTokens.length > 0;
}
