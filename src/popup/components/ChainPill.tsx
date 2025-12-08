/**
 * AINTIVIRUS - ChainPill Component
 * 
 * Shows blockchain network indicator with:
 * - Chain icon/logo
 * - Chain name
 * - Optional testnet indicator
 * - Consistent colors per chain
 * 
 * Accessible: uses both color AND icon (not color-only)
 * 
 * @example
 * <ChainPill chain="evm" evmChainId={1} />
 * <ChainPill chain="solana" testnet />
 */

import React, { useMemo } from 'react';
import type { ChainType, EVMChainId } from '@shared/types';

// ============================================
// TYPES
// ============================================

export interface ChainPillProps {
  /** Chain type */
  chain: ChainType;
  /** EVM chain ID (for EVM chains) */
  evmChainId?: EVMChainId;
  /** Is this a testnet? */
  testnet?: boolean;
  /** Size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Show full name or abbreviation */
  variant?: 'full' | 'short' | 'icon-only';
  /** Additional CSS class */
  className?: string;
}

// ============================================
// CHAIN CONFIG
// ============================================

interface ChainConfig {
  name: string;
  shortName: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

// Map EVMChainId string type to config
const EVM_CHAINS: Record<string, ChainConfig> = {
  // String-based chain IDs (matching EVMChainId type)
  ethereum: {
    name: 'Ethereum',
    shortName: 'ETH',
    color: '#627EEA',
    bgColor: 'rgba(98, 126, 234, 0.12)',
    icon: <EthereumIcon />,
  },
  optimism: {
    name: 'Optimism',
    shortName: 'OP',
    color: '#FF0420',
    bgColor: 'rgba(255, 4, 32, 0.12)',
    icon: <OptimismIcon />,
  },
  polygon: {
    name: 'Polygon',
    shortName: 'MATIC',
    color: '#8247E5',
    bgColor: 'rgba(130, 71, 229, 0.12)',
    icon: <PolygonIcon />,
  },
  arbitrum: {
    name: 'Arbitrum',
    shortName: 'ARB',
    color: '#28A0F0',
    bgColor: 'rgba(40, 160, 240, 0.12)',
    icon: <ArbitrumIcon />,
  },
  base: {
    name: 'Base',
    shortName: 'BASE',
    color: '#0052FF',
    bgColor: 'rgba(0, 82, 255, 0.12)',
    icon: <BaseIcon />,
  },
  // Numeric chain IDs as strings (for fallback/legacy support)
  '1': {
    name: 'Ethereum',
    shortName: 'ETH',
    color: '#627EEA',
    bgColor: 'rgba(98, 126, 234, 0.12)',
    icon: <EthereumIcon />,
  },
  '10': {
    name: 'Optimism',
    shortName: 'OP',
    color: '#FF0420',
    bgColor: 'rgba(255, 4, 32, 0.12)',
    icon: <OptimismIcon />,
  },
  '56': {
    name: 'BNB Chain',
    shortName: 'BNB',
    color: '#F0B90B',
    bgColor: 'rgba(240, 185, 11, 0.12)',
    icon: <BnbIcon />,
  },
  '137': {
    name: 'Polygon',
    shortName: 'MATIC',
    color: '#8247E5',
    bgColor: 'rgba(130, 71, 229, 0.12)',
    icon: <PolygonIcon />,
  },
  '42161': {
    name: 'Arbitrum',
    shortName: 'ARB',
    color: '#28A0F0',
    bgColor: 'rgba(40, 160, 240, 0.12)',
    icon: <ArbitrumIcon />,
  },
  '8453': {
    name: 'Base',
    shortName: 'BASE',
    color: '#0052FF',
    bgColor: 'rgba(0, 82, 255, 0.12)',
    icon: <BaseIcon />,
  },
};

const SOLANA_CONFIG: ChainConfig = {
  name: 'Solana',
  shortName: 'SOL',
  color: '#9945FF',
  bgColor: 'rgba(153, 69, 255, 0.12)',
  icon: <SolanaIcon />,
};

const DEFAULT_CONFIG: ChainConfig = {
  name: 'Unknown',
  shortName: '???',
  color: '#9898a8',
  bgColor: 'rgba(152, 152, 168, 0.12)',
  icon: <UnknownIcon />,
};

// ============================================
// ICONS
// ============================================

function EthereumIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1L3 8l5 3 5-3L8 1z" opacity="0.6" />
      <path d="M8 11L3 8l5 7 5-7-5 3z" />
    </svg>
  );
}

function PolygonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M11 6L8 4 5 6v4l3 2 3-2V6z" />
    </svg>
  );
}

function ArbitrumIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2L3 5v6l5 3 5-3V5L8 2zm0 2l3 1.8v3.4L8 11 5 9.2V5.8L8 4z" />
    </svg>
  );
}

function OptimismIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="5" />
    </svg>
  );
}

function BaseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="5" />
      <path d="M6 8h4" stroke="white" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function BnbIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3L5 6l1.5 1.5L8 6l1.5 1.5L11 6 8 3zM4 8l1.5-1.5L7 8 5.5 9.5 4 8zM12 8l-1.5-1.5L9 8l1.5 1.5L12 8zM8 10l-1.5-1.5L5 10l3 3 3-3-1.5-1.5L8 10z" />
    </svg>
  );
}

function SolanaIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 11h8l2-2H5l-2 2zM3 5h8l2 2H5L3 5zM3 8h10l-2 2H3l2-2z" />
    </svg>
  );
}

function UnknownIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="5" opacity="0.3" />
      <text x="8" y="11" fontSize="8" textAnchor="middle" fill="currentColor">?</text>
    </svg>
  );
}

// ============================================
// COMPONENT
// ============================================

export const ChainPill: React.FC<ChainPillProps> = ({
  chain,
  evmChainId,
  testnet = false,
  size = 'sm',
  variant = 'short',
  className = '',
}) => {
  const config = useMemo((): ChainConfig => {
    if (chain === 'solana') {
      return SOLANA_CONFIG;
    }
    if (chain === 'evm' && evmChainId) {
      return EVM_CHAINS[evmChainId] || DEFAULT_CONFIG;
    }
    return DEFAULT_CONFIG;
  }, [chain, evmChainId]);
  
  const displayName = variant === 'full' ? config.name : config.shortName;
  
  const sizeStyles = {
    xs: {
      height: '18px',
      padding: '2px 6px',
      fontSize: '9px',
      iconSize: '10px',
      gap: '3px',
    },
    sm: {
      height: '22px',
      padding: '3px 8px',
      fontSize: '10px',
      iconSize: '12px',
      gap: '4px',
    },
    md: {
      height: '28px',
      padding: '4px 10px',
      fontSize: '11px',
      iconSize: '14px',
      gap: '5px',
    },
  };
  
  const s = sizeStyles[size];
  
  return (
    <>
      <span
        className={`chain-pill chain-pill-${size} ${testnet ? 'testnet' : ''} ${className}`}
        style={{
          '--chain-color': config.color,
          '--chain-bg': config.bgColor,
        } as React.CSSProperties}
        role="img"
        aria-label={`${config.name}${testnet ? ' Testnet' : ''}`}
      >
        <span className="chain-pill-icon" aria-hidden="true">
          {config.icon}
        </span>
        {variant !== 'icon-only' && (
          <span className="chain-pill-name">
            {displayName}
            {testnet && <span className="chain-pill-testnet">T</span>}
          </span>
        )}
      </span>
      
      <style>{`
        .chain-pill {
          display: inline-flex;
          align-items: center;
          gap: ${s.gap};
          height: ${s.height};
          padding: ${s.padding};
          background: var(--chain-bg);
          color: var(--chain-color);
          border-radius: 9999px;
          font-size: ${s.fontSize};
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
          flex-shrink: 0;
        }
        
        .chain-pill-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: ${s.iconSize};
          height: ${s.iconSize};
        }
        
        .chain-pill-icon svg {
          width: 100%;
          height: 100%;
        }
        
        .chain-pill-name {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        
        .chain-pill-testnet {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          height: 12px;
          background: var(--chain-color);
          color: white;
          border-radius: 50%;
          font-size: 8px;
          font-weight: 700;
          margin-left: 2px;
        }
        
        .chain-pill.testnet {
          border: 1px dashed var(--chain-color);
        }
      `}</style>
    </>
  );
};

export default ChainPill;
