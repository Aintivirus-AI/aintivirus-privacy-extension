/**
 * SwapTokenSelector - Dynamic Token Selection for Swaps
 * 
 * Features:
 * - Search tokens by name, symbol, or contract address
 * - Shows user's held tokens with balances at the top
 * - Popular tokens section
 * - Searchable full token list from Jupiter (Solana) / ParaSwap (EVM)
 * - Custom token address input support
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TokenIcon } from './TokenIcon';
import {
  searchSwapTokens,
  getPopularTokens,
  fetchSolanaTokenByAddress,
  type SwapToken,
} from '../../wallet/swapTokens';
import type { SPLTokenBalance, EVMTokenBalance, EVMChainId } from '@shared/types';
import { SearchIcon, CloseIcon, CheckIcon } from '../Icons';

// ============================================================================
// Types
// ============================================================================

interface SwapTokenSelectorProps {
  /** Currently selected token */
  selectedToken: SwapToken | null;
  /** Callback when a token is selected */
  onSelect: (token: SwapToken) => void;
  /** Chain type for filtering */
  chainType: 'solana' | 'evm';
  /** EVM chain ID (required if chainType is 'evm') */
  evmChainId?: EVMChainId;
  /** User's Solana token balances (for showing held tokens) */
  solanaTokens?: SPLTokenBalance[];
  /** User's EVM token balances (for showing held tokens) */
  evmTokens?: EVMTokenBalance[];
  /** Native balance (SOL or ETH) */
  nativeBalance?: number;
  /** Token to exclude from selection (e.g., the other side of the swap) */
  excludeToken?: SwapToken | null;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Label for the selector */
  label?: string;
}

interface TokenListItemProps {
  token: SwapToken;
  isSelected: boolean;
  onClick: () => void;
  showBalance?: boolean;
}

// ============================================================================
// Token List Item Component
// ============================================================================

const TokenListItem: React.FC<TokenListItemProps> = ({
  token,
  isSelected,
  onClick,
  showBalance = false,
}) => {
  const fallbackLogo = token.chainId === 'solana'
    ? 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
    : 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';

  return (
    <button
      className={`swap-token-list-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      <TokenIcon
        symbol={token.symbol}
        logoUri={token.logoUri}
        address={token.address}
        chain={token.chainId === 'solana' ? 'solana' : 'ethereum'}
        size={36}
      />
      <div className="swap-token-list-item-info">
        <div className="swap-token-list-item-symbol">
          {token.symbol}
          {token.verified && (
            <span className="swap-token-verified" title="Verified">
              <CheckIcon size={12} />
            </span>
          )}
        </div>
        <div className="swap-token-list-item-name">{token.name}</div>
      </div>
      {showBalance && token.balance && (
        <div className="swap-token-list-item-balance">
          {parseFloat(token.balance).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}
        </div>
      )}
      {isSelected && (
        <div className="swap-token-list-item-check">
          <CheckIcon size={16} />
        </div>
      )}
    </button>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const SwapTokenSelector: React.FC<SwapTokenSelectorProps> = ({
  selectedToken,
  onSelect,
  chainType,
  evmChainId = 'ethereum',
  solanaTokens = [],
  evmTokens = [],
  nativeBalance = 0,
  excludeToken,
  placeholder = 'Search tokens...',
  disabled = false,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SwapToken[]>([]);
  const [popularTokens, setPopularTokens] = useState<SwapToken[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPopular, setIsLoadingPopular] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get user's held tokens formatted as SwapTokens
  const userTokens = useMemo((): SwapToken[] => {
    if (chainType === 'solana') {
      const held: SwapToken[] = [];
      
      // Add native SOL if has balance
      if (nativeBalance > 0) {
        held.push({
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          verified: true,
          balance: nativeBalance.toString(),
          chainId: 'solana',
        });
      }
      
      // Add SPL tokens
      solanaTokens.forEach((token) => {
        if (token.uiBalance > 0) {
          held.push({
            address: token.mint,
            symbol: token.symbol || 'Unknown',
            name: token.name || token.symbol || 'Unknown Token',
            decimals: token.decimals,
            logoUri: token.logoUri || '',
            balance: token.uiBalance.toString(),
            chainId: 'solana',
            verified: true,
          });
        }
      });
      
      return held;
    } else {
      const held: SwapToken[] = [];
      const nativeSymbol = evmChainId === 'polygon' ? 'MATIC' : 'ETH';
      const nativeLogo = evmChainId === 'polygon'
        ? 'https://assets.coingecko.com/coins/images/4713/small/polygon.png'
        : 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';
      
      // Add native token if has balance
      if (nativeBalance > 0) {
        held.push({
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: nativeSymbol,
          name: nativeSymbol === 'MATIC' ? 'Polygon' : 'Ethereum',
          decimals: 18,
          logoUri: nativeLogo,
          verified: true,
          balance: nativeBalance.toString(),
          chainId: evmChainId,
        });
      }
      
      // Add ERC20 tokens
      evmTokens.forEach((token) => {
        if (token.uiBalance > 0) {
          held.push({
            address: token.address,
            symbol: token.symbol,
            name: token.name || token.symbol,
            decimals: token.decimals,
            logoUri: token.logoUri || '',
            balance: token.uiBalance.toString(),
            chainId: evmChainId,
            verified: true,
          });
        }
      });
      
      return held;
    }
  }, [chainType, solanaTokens, evmTokens, nativeBalance, evmChainId]);

  // Load popular tokens on mount or chain change
  useEffect(() => {
    let cancelled = false;
    
    const loadPopular = async () => {
      setIsLoadingPopular(true);
      try {
        const tokens = await getPopularTokens(chainType, evmChainId, 20);
        if (!cancelled) {
          setPopularTokens(tokens);
        }
      } catch (error) {
        console.error('Failed to load popular tokens:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingPopular(false);
        }
      }
    };

    loadPopular();
    
    return () => {
      cancelled = true;
    };
  }, [chainType, evmChainId]);

  // Handle search with debouncing
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = searchQuery.trim();
    
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchSwapTokens(trimmedQuery, chainType, evmChainId);
        setSearchResults(results);
      } catch (error) {
        console.error('Token search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, chainType, evmChainId]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleOpen = useCallback(() => {
    if (!disabled) {
      setIsOpen(true);
      setSearchQuery('');
    }
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
  }, []);

  const handleSelect = useCallback((token: SwapToken) => {
    onSelect(token);
    handleClose();
  }, [onSelect, handleClose]);

  // Filter out excluded token from all lists
  const filterExcluded = useCallback((tokens: SwapToken[]): SwapToken[] => {
    if (!excludeToken) return tokens;
    return tokens.filter((t) => t.address.toLowerCase() !== excludeToken.address.toLowerCase());
  }, [excludeToken]);

  // Tokens to display based on search state
  const displayTokens = useMemo(() => {
    const query = searchQuery.trim();
    
    if (query) {
      return filterExcluded(searchResults);
    }
    
    // Merge user tokens with popular tokens, removing duplicates
    const userAddresses = new Set(userTokens.map((t) => t.address.toLowerCase()));
    const filteredPopular = popularTokens.filter(
      (t) => !userAddresses.has(t.address.toLowerCase())
    );
    
    return filterExcluded([...userTokens, ...filteredPopular]);
  }, [searchQuery, searchResults, userTokens, popularTokens, filterExcluded]);

  const fallbackLogo = chainType === 'solana'
    ? 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
    : 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';

  return (
    <div className="swap-token-selector-container" ref={containerRef}>
      {label && <label className="swap-token-selector-label">{label}</label>}
      
      {/* Selected Token Button */}
      <button
        className={`swap-token-selector-button ${disabled ? 'disabled' : ''}`}
        onClick={handleOpen}
        disabled={disabled}
        type="button"
      >
        {selectedToken ? (
          <>
            <TokenIcon
              symbol={selectedToken.symbol}
              logoUri={selectedToken.logoUri}
              address={selectedToken.address}
              chain={chainType === 'solana' ? 'solana' : 'ethereum'}
              size={28}
            />
            <span className="swap-token-selector-symbol">{selectedToken.symbol}</span>
          </>
        ) : (
          <span className="swap-token-selector-placeholder">Select token</span>
        )}
        <svg
          className="swap-token-selector-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="swap-token-selector-backdrop" 
          onClick={handleClose}
        />
      )}

      {/* Dropdown Modal */}
      {isOpen && (
        <div className="swap-token-selector-modal">
          <div className="swap-token-selector-header">
            <h3>Select a token</h3>
            <button
              className="swap-token-selector-close"
              onClick={handleClose}
              type="button"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {/* Search Input */}
          <div className="swap-token-selector-search">
            <SearchIcon size={16} />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
            />
            {searchQuery && (
              <button
                className="swap-token-selector-clear"
                onClick={() => setSearchQuery('')}
                type="button"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>

          {/* Token List */}
          <div className="swap-token-selector-list">
            {isSearching || isLoadingPopular ? (
              <div className="swap-token-selector-loading">
                <div className="swap-token-selector-spinner" />
                <span>Searching tokens...</span>
              </div>
            ) : displayTokens.length === 0 ? (
              <div className="swap-token-selector-empty">
                {searchQuery ? (
                  <>
                    <p>No tokens found for "{searchQuery}"</p>
                    <p className="swap-token-selector-hint">
                      Try searching by name, symbol, or paste a token address
                    </p>
                  </>
                ) : (
                  <p>No tokens available</p>
                )}
              </div>
            ) : (
              <>
                {/* User's Tokens Section */}
                {!searchQuery && userTokens.length > 0 && (
                  <>
                    <div className="swap-token-selector-section-header">
                      Your Tokens
                    </div>
                    {filterExcluded(userTokens).map((token) => (
                      <TokenListItem
                        key={`user-${token.address}`}
                        token={token}
                        isSelected={selectedToken?.address === token.address}
                        onClick={() => handleSelect(token)}
                        showBalance={true}
                      />
                    ))}
                  </>
                )}

                {/* Popular Tokens Section */}
                {!searchQuery && popularTokens.length > 0 && (
                  <>
                    <div className="swap-token-selector-section-header">
                      Popular Tokens
                    </div>
                    {filterExcluded(
                      popularTokens.filter(
                        (t) => !userTokens.some(
                          (ut) => ut.address.toLowerCase() === t.address.toLowerCase()
                        )
                      )
                    ).map((token) => (
                      <TokenListItem
                        key={`popular-${token.address}`}
                        token={token}
                        isSelected={selectedToken?.address === token.address}
                        onClick={() => handleSelect(token)}
                      />
                    ))}
                  </>
                )}

                {/* Search Results */}
                {searchQuery && searchResults.length > 0 && (
                  <>
                    <div className="swap-token-selector-section-header">
                      Search Results
                    </div>
                    {filterExcluded(searchResults).map((token) => (
                      <TokenListItem
                        key={`search-${token.address}`}
                        token={token}
                        isSelected={selectedToken?.address === token.address}
                        onClick={() => handleSelect(token)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Hint */}
          <div className="swap-token-selector-footer">
            <span>
              {chainType === 'solana' 
                ? 'Powered by Jupiter' 
                : 'Powered by ParaSwap'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwapTokenSelector;

