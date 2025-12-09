

import React, { useState, useCallback, useMemo } from 'react';
import { ExplorerLinkIcon } from './ExplorerLinkIcon';
import { CopyIcon, CheckIcon } from '../Icons';
import { useToast } from './ToastProvider';
import type { ChainType, EVMChainId } from '@shared/types';


export interface AddressChipProps {
  
  address: string;
  
  chain: ChainType;
  
  evmChainId?: EVMChainId;
  
  label?: string;
  
  testnet?: boolean;
  
  size?: 'sm' | 'md' | 'lg';
  
  showExplorer?: boolean;
  
  showCopyButton?: boolean;
  
  onCopy?: () => void;
  
  showFullOnHover?: boolean;
  
  isFirstTime?: boolean;
  
  className?: string;
  
  style?: React.CSSProperties;
}


function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address) return '';
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}


function getAddressColor(address: string): string {
  if (!address) return '#5b5fc7';
  
  
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    const char = address.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}


function generateIdenticonPattern(address: string): boolean[][] {
  if (!address) return Array(5).fill(Array(5).fill(false));
  
  const pattern: boolean[][] = [];
  const normalized = address.toLowerCase().replace('0x', '');
  
  for (let y = 0; y < 5; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < 3; x++) {
      const idx = (y * 3 + x) % normalized.length;
      const charCode = normalized.charCodeAt(idx);
      row.push(charCode % 2 === 0);
    }
    
    row.push(row[1]);
    row.push(row[0]);
    pattern.push(row);
  }
  
  return pattern;
}


interface IdenticonProps {
  address: string;
  size: number;
  className?: string;
}

const Identicon: React.FC<IdenticonProps> = ({ address, size, className = '' }) => {
  const pattern = useMemo(() => generateIdenticonPattern(address), [address]);
  const color = useMemo(() => getAddressColor(address), [address]);
  const cellSize = size / 5;
  
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`address-identicon ${className}`}
      role="img"
      aria-label="Address identicon"
    >
      <rect width={size} height={size} fill="var(--bg-tertiary)" rx={size * 0.2} />
      {pattern.map((row, y) =>
        row.map((filled, x) =>
          filled ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill={color}
            />
          ) : null
        )
      )}
    </svg>
  );
};


export const AddressChip: React.FC<AddressChipProps> = ({
  address,
  chain,
  evmChainId,
  label,
  testnet = false,
  size = 'md',
  showExplorer = true,
  showCopyButton = false,
  onCopy,
  showFullOnHover = true,
  isFirstTime = false,
  className = '',
  style,
}) => {
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();
  
  const handleCopy = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      addToast('Address copied', 'success');
      onCopy?.();
      
      
      setTimeout(() => setCopied(false), 800);
    } catch (err) {
      addToast('Failed to copy', 'error');
    }
  }, [address, addToast, onCopy]);
  
  
  const sizeConfig = {
    sm: {
      height: 28,
      iconSize: 16,
      padding: '4px 8px',
      fontSize: '11px',
      gap: '6px',
      truncateStart: 4,
      truncateEnd: 4,
    },
    md: {
      height: 32,
      iconSize: 20,
      padding: '6px 10px',
      fontSize: '12px',
      gap: '8px',
      truncateStart: 6,
      truncateEnd: 4,
    },
    lg: {
      height: 40,
      iconSize: 24,
      padding: '8px 12px',
      fontSize: '13px',
      gap: '10px',
      truncateStart: 8,
      truncateEnd: 6,
    },
  };
  
  const config = sizeConfig[size];
  const truncated = truncateAddress(address, config.truncateStart, config.truncateEnd);
  
  return (
    <>
      <div
        className={`address-chip address-chip-${size} ${copied ? 'copied' : ''} ${isFirstTime ? 'first-time' : ''} ${className}`}
        style={style}
        onClick={!showCopyButton ? handleCopy : undefined}
        role={!showCopyButton ? 'button' : undefined}
        tabIndex={!showCopyButton ? 0 : undefined}
        onKeyDown={!showCopyButton ? (e) => e.key === 'Enter' && handleCopy() : undefined}
        title={showFullOnHover ? address : undefined}
        aria-label={`${label || 'Address'}: ${address}${!showCopyButton ? '. Click to copy' : ''}`}
      >
        {}
        <Identicon address={address} size={config.iconSize} />
        
        {}
        <div className="address-chip-text">
          {label && (
            <span className="address-chip-label">{label}</span>
          )}
          <span className="address-chip-address">{truncated}</span>
        </div>
        
        {}
        {showCopyButton && (
          <button
            className="address-chip-copy"
            onClick={handleCopy}
            aria-label="Copy address"
            type="button"
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        )}
        
        {}
        {showExplorer && (
          <ExplorerLinkIcon
            type="address"
            id={address}
            chain={chain}
            evmChainId={evmChainId}
            testnet={testnet}
            size={config.iconSize - 4}
            className="address-chip-explorer"
          />
        )}
        
        {}
        {isFirstTime && (
          <span className="address-chip-warning" aria-label="First time sending to this address">
            ⚠
          </span>
        )}
      </div>
      
      <style>{`
        .address-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: ${config.padding};
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-chip, 9999px);
          cursor: pointer;
          transition: 
            background-color var(--transition-fast),
            border-color var(--transition-fast),
            box-shadow var(--transition-fast);
          max-width: 100%;
          user-select: none;
        }
        
        .address-chip:hover {
          background: var(--bg-hover);
          border-color: var(--border-default);
        }
        
        .address-chip:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }
        
        .address-chip:active {
          transform: scale(0.98);
        }
        
        .address-chip.copied {
          background: var(--success-muted);
          border-color: var(--success);
        }
        
        .address-chip.first-time {
          border-color: var(--warning);
          background: var(--warning-muted);
        }
        
        .address-chip-sm {
          height: ${sizeConfig.sm.height}px;
          font-size: ${sizeConfig.sm.fontSize};
        }
        
        .address-chip-md {
          height: ${sizeConfig.md.height}px;
          font-size: ${sizeConfig.md.fontSize};
        }
        
        .address-chip-lg {
          height: ${sizeConfig.lg.height}px;
          font-size: ${sizeConfig.lg.fontSize};
        }
        
        .address-identicon {
          flex-shrink: 0;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .address-chip-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
          gap: 1px;
        }
        
        .address-chip-label {
          font-size: inherit;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .address-chip-address {
          font-family: var(--font-mono);
          font-size: calc(100% - 1px);
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .address-chip-text:not(:has(.address-chip-label)) .address-chip-address {
          color: var(--text-primary);
          font-size: inherit;
        }
        
        .address-chip-copy {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          cursor: pointer;
          transition: 
            background-color var(--transition-fast),
            color var(--transition-fast);
          flex-shrink: 0;
        }
        
        .address-chip-copy:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        
        .address-chip.copied .address-chip-copy {
          color: var(--success);
        }
        
        .address-chip-explorer {
          flex-shrink: 0;
          opacity: 0.6;
          transition: opacity var(--transition-fast);
        }
        
        .address-chip:hover .address-chip-explorer {
          opacity: 1;
        }
        
        .address-chip-warning {
          font-size: 12px;
          flex-shrink: 0;
        }
        
        @keyframes chip-copied {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
          100% {
            transform: scale(1);
          }
        }
        
        .address-chip.copied {
          animation: chip-copied 200ms ease-out;
        }
        
        @media (prefers-reduced-motion: reduce) {
          .address-chip.copied {
            animation: none;
          }
          .address-chip:active {
            transform: none;
          }
        }
      `}</style>
    </>
  );
};

export default AddressChip;
