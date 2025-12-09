

import React, { useState, useEffect } from 'react';


interface TokenIconProps {
  
  symbol: string;
  
  logoUri?: string;
  
  address?: string;
  
  chain: 'solana' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';
  
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
  };
  const chainName = chainMap[chain];
  if (!chainName || !address) return '';
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainName}/assets/${address}/logo.png`;
}


function getSolanaTokenListUrl(mint: string): string {
  if (!mint) return '';
  return `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`;
}


function getJupiterLogoUrl(mint: string): string {
  if (!mint) return '';
  return `https://tokens.jup.ag/token/${mint}/logo`;
}


function getCoinGeckoUrl(symbol: string): string {
  
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
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [fallbackIndex, setFallbackIndex] = useState(0);
  
  
  const getFallbackUrls = (): string[] => {
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
  };
  
  const fallbackUrls = getFallbackUrls();
  
  useEffect(() => {
    
    setFallbackIndex(0);
    setCurrentSrc(fallbackUrls[0] || getPlaceholderUrl(symbol, chain));
  }, [logoUri, address, chain, symbol]);
  
  const handleError = () => {
    
    const nextIndex = fallbackIndex + 1;
    if (nextIndex < fallbackUrls.length) {
      setFallbackIndex(nextIndex);
      setCurrentSrc(fallbackUrls[nextIndex]);
    } else {
      
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
