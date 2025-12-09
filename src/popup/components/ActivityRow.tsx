

import React, { useMemo } from 'react';
import { StatusChip, StatusType } from './StatusChip';
import { ChainPill } from './ChainPill';
import type { ChainType, EVMChainId } from '@shared/types';


export type ActivityAction = 
  | 'sent'
  | 'received'
  | 'swapped'
  | 'approved'
  | 'revoked'
  | 'minted'
  | 'burned'
  | 'staked'
  | 'unstaked'
  | 'contract'
  | 'unknown';

export interface ActivityRowProps {
  
  action: ActivityAction;
  
  token: string;
  
  tokenLogo?: string;
  
  amount?: number | string;
  
  fiatValue?: number;
  
  nativeAmount?: number;
  
  nativeSymbol?: string;
  
  counterparty?: string;
  
  counterpartyLabel?: string;
  
  timestamp: number;
  
  status: StatusType;
  
  chain: ChainType;
  
  evmChainId?: EVMChainId;
  
  testnet?: boolean;
  
  onClick?: () => void;
  
  txHash?: string;
  
  className?: string;
}


function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

function formatAmount(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '';
  
  if (num === 0) return '0';
  if (Math.abs(num) < 0.0001) return num.toExponential(2);
  if (Math.abs(num) < 1) return num.toFixed(4);
  if (Math.abs(num) < 1000) return num.toFixed(2);
  
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatFiat(value: number | undefined): string {
  if (value === undefined || value === null) return '';
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getActionLabel(action: ActivityAction): string {
  const labels: Record<ActivityAction, string> = {
    sent: 'Sent',
    received: 'Received',
    swapped: 'Swapped',
    approved: 'Approved',
    revoked: 'Revoked',
    minted: 'Minted',
    burned: 'Burned',
    staked: 'Staked',
    unstaked: 'Unstaked',
    contract: 'Contract Call',
    unknown: 'Transaction',
  };
  return labels[action] || 'Transaction';
}

function getActionColor(action: ActivityAction): string {
  switch (action) {
    case 'sent':
      return 'var(--error, #c44c4c)';
    case 'received':
      return 'var(--success, #3d9970)';
    case 'swapped':
      return 'var(--accent-primary, #5b5fc7)';
    case 'approved':
    case 'revoked':
      return 'var(--warning, #d4a534)';
    default:
      return 'var(--text-secondary)';
  }
}


interface ActionIconProps {
  action: ActivityAction;
  tokenLogo?: string;
}

const ActionIcon: React.FC<ActionIconProps> = ({ action, tokenLogo }) => {
  const color = getActionColor(action);
  
  const icons: Record<ActivityAction, React.ReactNode> = {
    sent: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M7 17L17 7M17 7H7M17 7V17" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    received: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M17 7L7 17M7 17H17M7 17V7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    swapped: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M16 3L20 7L16 11M4 7H20M8 21L4 17L8 13M20 17H4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    approved: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    revoked: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M9 15L15 9M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    minted: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M12 5V19M5 12H19" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    burned: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M19 12H5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    staked: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 17L12 22L22 17" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 12L12 17L22 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    unstaked: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M12 22V2M5 5L12 2L19 5M5 19L12 22L19 19" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    contract: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M16 18L22 12L16 6M8 6L2 12L8 18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    unknown: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };
  
  return (
    <>
      <div className="activity-icon">
        {tokenLogo ? (
          <img 
            src={tokenLogo} 
            alt="" 
            className="activity-token-logo"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
        <div className="activity-action-icon">
          {icons[action]}
        </div>
      </div>
      
      <style>{`
        .activity-icon {
          position: relative;
          width: 36px;
          height: 36px;
          flex-shrink: 0;
        }
        
        .activity-token-logo {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--bg-tertiary);
        }
        
        .activity-action-icon {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 18px;
          height: 18px;
          background: var(--bg-secondary);
          border: 2px solid var(--bg-secondary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .activity-action-icon svg {
          width: 12px;
          height: 12px;
        }
        
        .activity-icon:not(:has(.activity-token-logo)) {
          background: var(--bg-tertiary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .activity-icon:not(:has(.activity-token-logo)) .activity-action-icon {
          position: static;
          width: 20px;
          height: 20px;
          background: transparent;
          border: none;
        }
        
        .activity-icon:not(:has(.activity-token-logo)) .activity-action-icon svg {
          width: 16px;
          height: 16px;
        }
      `}</style>
    </>
  );
};


export const ActivityRow: React.FC<ActivityRowProps> = ({
  action,
  token,
  tokenLogo,
  amount,
  fiatValue,
  nativeAmount,
  nativeSymbol,
  counterparty,
  counterpartyLabel,
  timestamp,
  status,
  chain,
  evmChainId,
  testnet = false,
  onClick,
  className = '',
}) => {
  const actionLabel = useMemo(() => getActionLabel(action), [action]);
  const relativeTime = useMemo(() => formatRelativeTime(timestamp), [timestamp]);
  const formattedAmount = useMemo(() => formatAmount(amount), [amount]);
  const formattedFiat = useMemo(() => formatFiat(fiatValue), [fiatValue]);
  const displayCounterparty = useMemo(() => {
    if (counterpartyLabel) return counterpartyLabel;
    if (counterparty) return truncateAddress(counterparty);
    return null;
  }, [counterparty, counterpartyLabel]);
  
  const amountPrefix = action === 'sent' ? '−' : action === 'received' ? '+' : '';
  const amountColor = action === 'sent' 
    ? 'var(--error)' 
    : action === 'received' 
      ? 'var(--success)' 
      : 'var(--text-primary)';
  
  return (
    <>
      <div 
        className={`activity-row ${onClick ? 'clickable' : ''} ${className}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      >
        <ActionIcon action={action} tokenLogo={tokenLogo} />
        
        <div className="activity-details">
          <div className="activity-line1">
            <span className="activity-action">
              {actionLabel} {token}
            </span>
            <div className="activity-chips">
              <StatusChip status={status} size="xs" iconOnly />
              <ChainPill chain={chain} evmChainId={evmChainId} testnet={testnet} size="xs" variant="icon-only" />
            </div>
          </div>
          
          <div className="activity-line2">
            {displayCounterparty && (
              <span className="activity-counterparty">
                {action === 'sent' ? 'To ' : action === 'received' ? 'From ' : ''}
                {displayCounterparty}
              </span>
            )}
            <span className="activity-time">{relativeTime}</span>
          </div>
        </div>
        
        <div className="activity-amounts">
          {formattedFiat && (
            <span 
              className="activity-fiat"
              style={{ color: amountColor }}
            >
              {amountPrefix}{formattedFiat}
            </span>
          )}
          {formattedAmount && (
            <span className="activity-native">
              {amountPrefix}{formattedAmount} {token}
            </span>
          )}
        </div>
      </div>
      
      <style>{`
        .activity-row {
          display: flex;
          align-items: center;
          gap: var(--space-3, 12px);
          padding: var(--space-3, 12px);
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 10px);
          transition: 
            background-color var(--transition-fast),
            border-color var(--transition-fast);
        }
        
        .activity-row.clickable {
          cursor: pointer;
        }
        
        .activity-row.clickable:hover {
          background: var(--bg-tertiary);
          border-color: var(--border-default);
        }
        
        .activity-row.clickable:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }
        
        .activity-details {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        
        .activity-line1 {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .activity-action {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .activity-chips {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        
        .activity-line2 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-muted);
        }
        
        .activity-counterparty {
          font-family: var(--font-mono);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .activity-time {
          flex-shrink: 0;
        }
        
        .activity-amounts {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          flex-shrink: 0;
        }
        
        .activity-fiat {
          font-size: 13px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        
        .activity-native {
          font-size: 11px;
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </>
  );
};

export default ActivityRow;
