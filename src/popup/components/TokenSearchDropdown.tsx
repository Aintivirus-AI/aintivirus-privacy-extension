import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendToBackground } from '@shared/messaging';
import { TokenIcon } from './TokenIcon';

interface TokenSearchResult {
  address: string;
  symbol: string;
  name: string;
  logoUri?: string;
  decimals?: number;
}

interface TokenSearchDropdownProps {
  value: string;

  onChange: (value: string) => void;

  onTokenSelect: (token: TokenSearchResult) => void;

  chainType: 'solana' | 'evm';

  placeholder?: string;

  isSearching?: boolean;

  setIsSearching?: (searching: boolean) => void;
}

const DEXSCREENER_SEARCH_API = 'https://api.dexscreener.com/latest/dex/search';

interface DexScreenerPair {
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  info?: {
    imageUrl?: string;
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

async function searchDexScreener(query: string): Promise<TokenSearchResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${DEXSCREENER_SEARCH_API}?q=${query}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data: DexScreenerResponse = await response.json();

    const pair = data.pairs?.find((p) => p.baseToken.address.toLowerCase() === query.toLowerCase());

    if (!pair) {
      return null;
    }
    return {
      address: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      logoUri: pair.info?.imageUrl,
      decimals: 9,
    };
  } catch (error) {
    return null;
  }
}

export const TokenSearchDropdown: React.FC<TokenSearchDropdownProps> = ({
  value,
  onChange,
  onTokenSelect,
  chainType,
  placeholder,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<TokenSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchedRef = useRef<string>('');

  const isValidAddress = useCallback(
    (addr: string) => {
      const trimmed = addr.trim();
      if (chainType === 'evm') {
        return trimmed.length === 42 && trimmed.startsWith('0x');
      }

      return trimmed.length >= 32 && trimmed.length <= 44;
    },
    [chainType],
  );

  useEffect(() => {
    const trimmedValue = value.trim();

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!trimmedValue || !isValidAddress(trimmedValue)) {
      setSearchResult(null);
      setSearchError(null);
      setIsOpen(false);
      lastSearchedRef.current = '';
      return;
    }

    if (trimmedValue === lastSearchedRef.current) {
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      lastSearchedRef.current = trimmedValue;
      try {
        if (chainType === 'evm') {
          const res = await sendToBackground({
            type: 'WALLET_GET_TOKEN_METADATA',
            payload: { mint: trimmedValue },
          });

          if (res.success && res.data) {
            const metadata = res.data as { symbol: string; name: string; logoUri?: string };
            setSearchResult({
              address: trimmedValue,
              symbol: metadata.symbol,
              name: metadata.name,
              logoUri: metadata.logoUri,
            });
            setIsOpen(true);
            setIsSearching(false);
            return;
          }
        }

        const result = await searchDexScreener(trimmedValue);

        if (result) {
          setSearchResult(result);
          setIsOpen(true);
        } else {
          setSearchResult(null);
          setSearchError('Token not found. You can still add it manually.');
        }
      } catch (error) {
        setSearchError('Search failed. You can enter details manually.');
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [value, chainType, isValidAddress]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleTokenSelect = useCallback(() => {
    if (searchResult) {
      onTokenSelect(searchResult);
      setIsOpen(false);
    }
  }, [searchResult, onTokenSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && searchResult && isOpen) {
        e.preventDefault();
        handleTokenSelect();
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [searchResult, isOpen, handleTokenSelect],
  );

  return (
    <div className="token-search-dropdown" ref={containerRef}>
      <div className="token-search-input-wrapper">
        <input
          type="text"
          className="form-input"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => searchResult && setIsOpen(true)}
          autoComplete="off"
          style={{ textAlign: 'left' }}
        />
        {isSearching && (
          <div className="token-search-spinner" title="Searching...">
            <div className="spinner-small"></div>
          </div>
        )}
      </div>

      {}
      {value.trim() &&
        isValidAddress(value.trim()) &&
        !isSearching &&
        !searchResult &&
        searchError && <div className="token-search-status error">{searchError}</div>}

      {}
      {isOpen && searchResult && (
        <div className="token-search-results">
          <div className="token-search-header">Token Found</div>
          <div className="token-search-item" onClick={handleTokenSelect} role="option">
            <TokenIcon
              symbol={searchResult.symbol}
              logoUri={searchResult.logoUri}
              address={searchResult.address}
              chain={chainType === 'evm' ? 'ethereum' : 'solana'}
              size={32}
            />
            <div className="token-search-info">
              <span className="token-search-symbol">{searchResult.symbol}</span>
              <span className="token-search-name">{searchResult.name}</span>
            </div>
            <span className="token-search-action">Click to select</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenSearchDropdown;

