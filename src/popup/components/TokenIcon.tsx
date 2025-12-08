/**
 * TokenIcon Component
 * 
 * Displays token logos with fallback to generated placeholders.
 * Supports both Solana SPL tokens and EVM tokens.
 * 
 * Logo resolution order:
 * 1. Provided logoUri from token metadata
 * 2. Known token lists (TrustWallet, Solana Token List, Jupiter)
 * 3. Generated SVG placeholder with token initials
 */

import React, { useState, useEffect } from 'react';

// ============================================
// TYPES
// ============================================

interface TokenIconProps {
  /** Token symbol (e.g., "USDC") */
  symbol: string;
  /** Logo URI from token metadata (optional) */
  logoUri?: string;
  /** Token address/mint for lookup (optional) */
  address?: string;
  /** Chain type for determining logo source */
  chain: 'solana' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';
  /** Size in pixels (default: 32) */
  size?: number;
  /** Additional CSS class */
  className?: string;
}

// ============================================
// LOGO URL GENERATORS
// ============================================

/**
 * Get TrustWallet assets URL for EVM tokens
 */
function getTrustWalletUrl(chain: string, address: string): string {
  const chainMap: Record<string, string> = {
    ethereum: 'ethereum',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    base: 'base',
  };
  const chainName = chainMap[chain];
  if (!chainName || !address) return '';
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainName}/assets/${address}/logo.png`;
}

/**
 * Get Solana Token List URL for SPL tokens
 */
function getSolanaTokenListUrl(mint: string): string {
  if (!mint) return '';
  return `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`;
}

/**
 * Get Jupiter Token logo URL (best coverage for Solana tokens including meme coins)
 */
function getJupiterLogoUrl(mint: string): string {
  if (!mint) return '';
  return `https://tokens.jup.ag/token/${mint}/logo`;
}

/**
 * Get CoinGecko URL for tokens (requires API lookup, used as last resort)
 * Note: This is a static mapping for common tokens
 */
function getCoinGeckoUrl(symbol: string): string {
  // Static mapping for common tokens
  const coinGeckoIds: Record<string, string> = {
    'SOL': 'solana',
    'ETH': 'ethereum',
    'WETH': 'weth',
    'USDC': 'usd-coin',
    'USDT': 'tether',
    'DAI': 'dai',
    'WBTC': 'wrapped-bitcoin',
    'BTC': 'bitcoin',
    'MATIC': 'matic-network',
    'BONK': 'bonk',
    'JUP': 'jupiter-exchange-solana',
    'mSOL': 'marinade-staked-sol',
    'stSOL': 'lido-staked-sol',
    'ARB': 'arbitrum',
    'OP': 'optimism',
  };
  
  const id = coinGeckoIds[symbol.toUpperCase()];
  if (!id) return '';
  return `https://assets.coingecko.com/coins/images/${id}/small/${id}.png`;
}

/**
 * Generate fallback placeholder SVG URL
 */
function getPlaceholderUrl(symbol: string, chain: string): string {
  const colors: Record<string, string> = {
    solana: '#9945FF',
    ethereum: '#627eea',
    polygon: '#8247e5',
    arbitrum: '#28a0f0',
    optimism: '#ff0420',
    base: '#0052ff',
  };
  
  const strokeColor = colors[chain] || '#6366f1';
  const initials = symbol.slice(0, 2).toUpperCase();
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="#1a1a25" stroke="${strokeColor}" stroke-width="2"/>
    <text x="50" y="60" text-anchor="middle" fill="#e8e8ef" font-size="24" font-family="system-ui, -apple-system, sans-serif">${initials}</text>
  </svg>`;
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ============================================
// COMPONENT
// ============================================

export const TokenIcon: React.FC<TokenIconProps> = ({
  symbol,
  logoUri,
  address,
  chain,
  size = 32,
  className = '',
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [fallbackIndex, setFallbackIndex] = useState(0);
  
  // Generate fallback URLs in priority order
  const getFallbackUrls = (): string[] => {
    const urls: string[] = [];
    
    // 1. Provided logoUri (highest priority)
    if (logoUri) {
      urls.push(logoUri);
    }
    
    // 2. Chain-specific token lists
    if (address) {
      if (chain === 'solana') {
        // Jupiter has the best coverage for Solana tokens (including meme coins)
        urls.push(getJupiterLogoUrl(address));
        urls.push(getSolanaTokenListUrl(address));
      } else {
        urls.push(getTrustWalletUrl(chain, address));
      }
    }
    
    // 3. CoinGecko (for common tokens)
    const cgUrl = getCoinGeckoUrl(symbol);
    if (cgUrl) {
      urls.push(cgUrl);
    }
    
    // 4. Placeholder (always last)
    urls.push(getPlaceholderUrl(symbol, chain));
    
    return urls;
  };
  
  const fallbackUrls = getFallbackUrls();
  
  useEffect(() => {
    // Reset to first URL when props change
    setFallbackIndex(0);
    setCurrentSrc(fallbackUrls[0] || getPlaceholderUrl(symbol, chain));
  }, [logoUri, address, chain, symbol]);
  
  const handleError = () => {
    // Try next fallback URL
    const nextIndex = fallbackIndex + 1;
    if (nextIndex < fallbackUrls.length) {
      setFallbackIndex(nextIndex);
      setCurrentSrc(fallbackUrls[nextIndex]);
    } else {
      // All fallbacks failed, use placeholder
      setCurrentSrc(getPlaceholderUrl(symbol, chain));
    }
  };
  
  return (
    <img
      src={currentSrc}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      className={`token-icon ${className}`}
      onError={handleError}
      style={{
        borderRadius: '50%',
        objectFit: 'cover',
      }}
    />
  );
};

export default TokenIcon;
