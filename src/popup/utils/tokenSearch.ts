

import type { SPLTokenBalance, EVMTokenBalance } from '@shared/types';


export interface TokenSearchMatch {
  
  matchField: 'symbol' | 'name' | 'address';
  
  matchStart: number;
  
  matchLength: number;
}


export interface SPLTokenWithMatch extends SPLTokenBalance {
  searchMatch?: TokenSearchMatch;
}


export interface EVMTokenWithMatch extends EVMTokenBalance {
  searchMatch?: TokenSearchMatch;
}


export interface NativeToken {
  type: 'native';
  chain: 'solana' | 'evm';
  symbol: string;
  name: string;
  address?: string; 
}

export interface NativeTokenWithMatch extends NativeToken {
  searchMatch?: TokenSearchMatch;
}


export interface TokenFilterOptions {
  
  query: string;
  
  includeHidden?: boolean;
  
  includeZeroBalance?: boolean;
  
  pinnedAddresses?: string[];
}


function findMatch(text: string, query: string): { start: number; length: number } | undefined {
  if (!query || !text) return undefined;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return undefined;
  return { start: index, length: query.length };
}


function matchSPLToken(token: SPLTokenBalance, query: string): TokenSearchMatch | undefined {
  if (!query.trim()) return undefined;

  const q = query.trim();

  
  const symbolMatch = findMatch(token.symbol, q);
  if (symbolMatch) {
    return { matchField: 'symbol', matchStart: symbolMatch.start, matchLength: symbolMatch.length };
  }

  
  const nameMatch = findMatch(token.name, q);
  if (nameMatch) {
    return { matchField: 'name', matchStart: nameMatch.start, matchLength: nameMatch.length };
  }

  
  const mintMatch = findMatch(token.mint, q);
  if (mintMatch) {
    return { matchField: 'address', matchStart: mintMatch.start, matchLength: mintMatch.length };
  }

  return undefined;
}


function matchEVMToken(token: EVMTokenBalance, query: string): TokenSearchMatch | undefined {
  if (!query.trim()) return undefined;

  const q = query.trim();

  
  const symbolMatch = findMatch(token.symbol, q);
  if (symbolMatch) {
    return { matchField: 'symbol', matchStart: symbolMatch.start, matchLength: symbolMatch.length };
  }

  
  const nameMatch = findMatch(token.name, q);
  if (nameMatch) {
    return { matchField: 'name', matchStart: nameMatch.start, matchLength: nameMatch.length };
  }

  
  const addressMatch = findMatch(token.address, q);
  if (addressMatch) {
    return { matchField: 'address', matchStart: addressMatch.start, matchLength: addressMatch.length };
  }

  return undefined;
}


function matchNativeToken(token: NativeToken, query: string): TokenSearchMatch | undefined {
  if (!query.trim()) return undefined;

  const q = query.trim();

  
  const symbolMatch = findMatch(token.symbol, q);
  if (symbolMatch) {
    return { matchField: 'symbol', matchStart: symbolMatch.start, matchLength: symbolMatch.length };
  }

  
  const nameMatch = findMatch(token.name, q);
  if (nameMatch) {
    return { matchField: 'name', matchStart: nameMatch.start, matchLength: nameMatch.length };
  }

  return undefined;
}


export function filterSPLTokens(
  tokens: SPLTokenBalance[],
  options: TokenFilterOptions
): SPLTokenWithMatch[] {
  const { query, includeZeroBalance = true, pinnedAddresses = [] } = options;
  const trimmedQuery = query.trim();

  
  if (!trimmedQuery) {
    let result = tokens;
    if (!includeZeroBalance) {
      result = result.filter(t => t.uiBalance > 0);
    }
    
    if (pinnedAddresses.length > 0) {
      result = sortWithPinned(result, pinnedAddresses, t => t.mint);
    }
    return result;
  }

  
  const matched: SPLTokenWithMatch[] = [];
  for (const token of tokens) {
    
    if (!includeZeroBalance && token.uiBalance === 0) continue;

    const match = matchSPLToken(token, trimmedQuery);
    if (match) {
      matched.push({ ...token, searchMatch: match });
    }
  }

  
  return sortSearchResults(matched, pinnedAddresses, t => t.mint);
}


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


export function filterNativeToken(
  token: NativeToken,
  query: string
): NativeTokenWithMatch | null {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return token; 

  const match = matchNativeToken(token, trimmedQuery);
  if (match) {
    return { ...token, searchMatch: match };
  }
  return null;
}


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
    
    const aPriority = matchPriority(a.searchMatch?.matchField);
    const bPriority = matchPriority(b.searchMatch?.matchField);
    if (aPriority !== bPriority) return aPriority - bPriority;

    
    const aIsPinned = pinnedSet.has(getAddress(a).toLowerCase());
    const bIsPinned = pinnedSet.has(getAddress(b).toLowerCase());
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;

    
    const aStart = a.searchMatch?.matchStart ?? Infinity;
    const bStart = b.searchMatch?.matchStart ?? Infinity;
    return aStart - bStart;
  });
}


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
  
  
  if (matchStart > 0) {
    segments.push({ text: text.slice(0, matchStart), highlighted: false });
  }
  
  
  const matchEnd = Math.min(matchStart + matchLength, text.length);
  segments.push({ text: text.slice(matchStart, matchEnd), highlighted: true });
  
  
  if (matchEnd < text.length) {
    segments.push({ text: text.slice(matchEnd), highlighted: false });
  }

  return segments;
}


export function hasSearchResults(
  solMatches: boolean,
  ethMatches: boolean,
  splTokens: SPLTokenWithMatch[],
  evmTokens: EVMTokenWithMatch[]
): boolean {
  return solMatches || ethMatches || splTokens.length > 0 || evmTokens.length > 0;
}



