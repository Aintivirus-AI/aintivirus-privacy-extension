import React, { useState, useEffect, useMemo, useCallback } from 'react';

interface TokenIconProps {
  symbol: string;

  logoUri?: string;

  address?: string;

  chain: 'solana' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base' | 'bnb';

  size?: number;

  className?: string;
}

function getTrustWalletUrl(chain: string, address: string): string {
  const chainMap: Record<string, string> = {
    ethereum: 'ethereum',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    base: 'base',
    bnb: 'smartchain',
  };
  const chainName = chainMap[chain];
  if (!chainName || !address) return '';
  // Use jsDelivr CDN for better reliability
  return `https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/${chainName}/assets/${address}/logo.png`;
}

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
  const coinGeckoIds: Record<string, string> = {
    SOL: 'solana',
    ETH: 'ethereum',
    WETH: 'weth',
    USDC: 'usd-coin',
    USDT: 'tether',
    DAI: 'dai',
    WBTC: 'wrapped-bitcoin',
    BTC: 'bitcoin',
    MATIC: 'matic-network',
    BONK: 'bonk',
    JUP: 'jupiter-exchange-solana',
    mSOL: 'marinade-staked-sol',
    stSOL: 'lido-staked-sol',
    ARB: 'arbitrum',
    OP: 'optimism',
  };

  const id = coinGeckoIds[symbol.toUpperCase()];
  if (!id) return '';
  return `https://assets.coingecko.com/coins/images/${id}/small/${id}.png`;
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

    if (logoUri) {
      urls.push(logoUri);
    }

    if (address) {
      if (chain === 'solana') {
        urls.push(getJupiterLogoUrl(address));
        urls.push(getSolanaTokenListUrl(address));
      } else {
        urls.push(getTrustWalletUrl(chain, address));
      }
    }

    const cgUrl = getCoinGeckoUrl(symbol);
    if (cgUrl) {
      urls.push(cgUrl);
    }

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
