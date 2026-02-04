import React, { useState, useEffect, useMemo, useCallback } from 'react';

interface TokenIconProps {
  symbol: string;

  logoUri?: string;

  address?: string;

  chain: 'solana' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base' | 'bnb';

  size?: number;

  className?: string;
}

// TrustWallet fallback removed - causes 403 errors for unknown tokens
// Logos are now fetched via DexScreener/CoinGecko in swapTokens.ts

function getSolanaTokenListUrl(mint: string): string {
  if (!mint) return '';
  // Use jsDelivr CDN for better reliability (deprecated raw GitHub URLs often fail)
  return `https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/${mint}/logo.png`;
}

function getJupiterLogoUrl(mint: string): string {
  if (!mint) return '';
  return `https://tokens.jup.ag/token/${mint}/logo`;
}

function getCoinGeckoUrl(symbol: string): string {
  // CoinGecko uses numeric IDs and specific image filenames
  // Format: https://assets.coingecko.com/coins/images/{numericId}/small/{filename}.png
  const coinGeckoData: Record<string, { id: number; filename: string }> = {
    SOL: { id: 4128, filename: 'solana' },
    ETH: { id: 279, filename: 'ethereum' },
    WETH: { id: 2518, filename: 'weth' },
    USDC: { id: 6319, filename: 'usdc' },
    USDT: { id: 325, filename: 'tether' },
    DAI: { id: 9956, filename: 'dai-multi-collateral' },
    WBTC: { id: 7598, filename: 'wrapped-bitcoin' },
    BTC: { id: 1, filename: 'bitcoin' },
    MATIC: { id: 4713, filename: 'matic-token-icon' },
    BONK: { id: 28600, filename: 'bonk' },
    JUP: { id: 17752, filename: 'jup' },
    MSOL: { id: 15896, filename: 'msol' },
    STSOL: { id: 18169, filename: 'stsol' },
    ARB: { id: 16547, filename: 'photo_2023-03-29_21.47.00' },
    OP: { id: 25244, filename: 'Optimism' },
    BNB: { id: 825, filename: 'bnb-icon2_2x' },
    AVAX: { id: 12559, filename: 'avalanche-2' },
    LINK: { id: 877, filename: 'chainlink-new-logo' },
    UNI: { id: 12504, filename: 'uniswap' },
    AAVE: { id: 12645, filename: 'aave-token' },
  };

  const data = coinGeckoData[symbol.toUpperCase()];
  if (!data) return '';
  return `https://assets.coingecko.com/coins/images/${data.id}/small/${data.filename}.png`;
}

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

export const TokenIcon: React.FC<TokenIconProps> = ({
  symbol,
  logoUri,
  address,
  chain,
  size = 32,
  className = '',
}) => {
  const [fallbackIndex, setFallbackIndex] = useState(0);

  // Memoize fallback URLs to ensure stable reference
  const fallbackUrls = useMemo(() => {
    const urls: string[] = [];

    // Primary: use provided logoUri (from DexScreener/CoinGecko API)
    if (logoUri) {
      urls.push(logoUri);
    }

    // Solana-specific fallbacks (these work reliably)
    if (address && chain === 'solana') {
      urls.push(getJupiterLogoUrl(address));
      urls.push(getSolanaTokenListUrl(address));
    }
    // Note: No TrustWallet fallback for EVM - causes 403 errors for unknown tokens
    // EVM logos should be provided via logoUri from DexScreener/CoinGecko

    // Known token fallback via CoinGecko static mapping
    const cgUrl = getCoinGeckoUrl(symbol);
    if (cgUrl) {
      urls.push(cgUrl);
    }

    // Final fallback: generated placeholder with initials
    urls.push(getPlaceholderUrl(symbol, chain));

    return urls;
  }, [logoUri, address, chain, symbol]);

  // Reset fallback index when props change (token changed)
  useEffect(() => {
    setFallbackIndex(0);
  }, [logoUri, address, chain, symbol]);

  // Compute current src based on fallback index
  const currentSrc = fallbackUrls[fallbackIndex] || getPlaceholderUrl(symbol, chain);

  const handleError = useCallback(() => {
    setFallbackIndex((prev) => {
      const nextIndex = prev + 1;
      // Only increment if we haven't exhausted fallbacks
      if (nextIndex < fallbackUrls.length) {
        return nextIndex;
      }
      // Stay at current (placeholder will be used via fallbackUrls)
      return prev;
    });
  }, [fallbackUrls.length]);

  return (
    <img
      // Key forces remount when token changes to avoid stale error handlers
      key={`${address}-${logoUri}-${symbol}`}
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
