

import React, { useState, useMemo } from 'react';
import { AddressChip } from './AddressChip';
import { ChainPill } from './ChainPill';
import { StatusChip } from './StatusChip';
import { StickyBottomCTA } from './StickyBottomCTA';
import { DetailsAccordion, DetailsRow, DetailsCodeBlock } from './DetailsAccordion';
import { ExplorerLinkIcon } from './ExplorerLinkIcon';
import { GasSettingsPanel, type GasSettings } from './GasSettingsPanel';
import type { ChainType, EVMChainId } from '@shared/types';


export type ReviewState = 'review' | 'pending' | 'success' | 'error';

export interface ReviewScreenProps {
  
  title?: string;
  
  fromAddress: string;
  
  fromLabel?: string;
  
  toAddress: string;
  
  toLabel?: string;
  
  isFirstTime?: boolean;
  
  chain: ChainType;
  
  evmChainId?: EVMChainId;
  
  testnet?: boolean;
  
  token: string;
  
  tokenLogo?: string;
  
  amount: number | string;
  
  fiatAmount?: number;
  
  fee?: number | string;
  
  feeFiat?: number;
  
  nativeSymbol?: string;
  
  totalFiat?: number;
  
  details?: {
    nonce?: number;
    gasLimit?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    data?: string;
    value?: string;
  };
  
  state?: ReviewState;
  
  txHash?: string;
  
  error?: string;
  
  onConfirm: () => void;
  
  onCancel: () => void;
  
  onDone?: () => void;
  
  confirmLabel?: string;
  
  loadingText?: string;
  
  className?: string;
  
  enableGasCustomization?: boolean;
  
  gasLimit?: bigint;
  
  onGasSettingsChange?: (settings: GasSettings) => void;
}


function formatAmount(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  if (num === 0) return '0';
  if (Math.abs(num) < 0.0001) return num.toExponential(2);
  if (Math.abs(num) < 1) return num.toFixed(6);
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatFiat(value: number | undefined): string {
  if (value === undefined) return '';
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}


export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  title = 'Review Transaction',
  fromAddress,
  fromLabel,
  toAddress,
  toLabel,
  isFirstTime = false,
  chain,
  evmChainId,
  testnet = false,
  token,
  tokenLogo,
  amount,
  fiatAmount,
  fee,
  feeFiat,
  nativeSymbol = 'ETH',
  totalFiat,
  details,
  state = 'review',
  txHash,
  error,
  onConfirm,
  onCancel,
  onDone,
  confirmLabel = 'Confirm',
  loadingText = 'Sending...',
  className = '',
  enableGasCustomization = false,
  gasLimit,
  onGasSettingsChange,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showAdvancedGas, setShowAdvancedGas] = useState(false);
  
  const formattedAmount = useMemo(() => formatAmount(amount), [amount]);
  const formattedFee = useMemo(() => fee ? formatAmount(fee) : undefined, [fee]);
  const formattedFiatAmount = useMemo(() => formatFiat(fiatAmount), [fiatAmount]);
  const formattedFeeFiat = useMemo(() => formatFiat(feeFiat), [feeFiat]);
  const formattedTotal = useMemo(() => formatFiat(totalFiat), [totalFiat]);
  
  
  if (state === 'success' || state === 'pending') {
    return (
      <>
        <div className={`review-screen review-${state} ${className}`}>
          <div className="review-result">
            <div className="review-result-icon">
              {state === 'pending' ? (
                <div className="result-spinner" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            
            <h2 className="review-result-title">
              {state === 'pending' ? 'Transaction Pending' : 'Transaction Sent'}
            </h2>
            
            <div className="review-result-amount">
              {formattedAmount} {token}
            </div>
            
            <StatusChip 
              status={state === 'pending' ? 'pending' : 'confirmed'} 
              size="md" 
            />
            
            {txHash && (
              <div className="review-result-actions">
                <ExplorerLinkIcon
                  type="tx"
                  id={txHash}
                  chain={chain}
                  evmChainId={evmChainId}
                  testnet={testnet}
                  variant="button"
                  label="View on Explorer"
                  className="explorer-btn"
                />
              </div>
            )}
          </div>
          
          <div className="review-result-footer">
            <button
              className="review-done-btn"
              onClick={onDone || onCancel}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
        
        <style>{`
          .review-screen {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          
          .review-result {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-6, 24px);
            text-align: center;
            gap: var(--space-4, 16px);
          }
          
          .review-result-icon {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .review-pending .review-result-icon {
            background: var(--status-pending-bg);
          }
          
          .review-success .review-result-icon {
            background: var(--success-muted);
            color: var(--success);
          }
          
          .review-result-icon svg {
            width: 32px;
            height: 32px;
          }
          
          .result-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--status-pending-bg);
            border-top-color: var(--status-pending-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          
          .review-result-title {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
          }
          
          .review-result-amount {
            font-size: 24px;
            font-weight: 600;
            font-family: var(--font-mono);
            color: var(--text-primary);
            font-variant-numeric: tabular-nums;
          }
          
          .review-result-actions {
            margin-top: var(--space-4, 16px);
          }
          
          .explorer-btn {
            padding: 10px 20px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md, 10px);
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all var(--transition-fast);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          
          .explorer-btn:hover {
            background: var(--bg-hover);
            border-color: var(--accent-primary);
          }
          
          .review-result-footer {
            padding: var(--space-4, 16px);
            border-top: 1px solid var(--border-subtle);
          }
          
          .review-done-btn {
            width: 100%;
            padding: var(--space-4, 16px);
            background: var(--accent-primary);
            border: none;
            border-radius: var(--radius-md, 10px);
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color var(--transition-fast);
          }
          
          .review-done-btn:hover {
            background: var(--accent-hover);
          }
          
          @media (prefers-reduced-motion: reduce) {
            .result-spinner {
              animation: none;
            }
          }
        `}</style>
      </>
    );
  }
  
  
  if (state === 'error') {
    return (
      <>
        <div className={`review-screen review-error ${className}`}>
          <div className="review-result">
            <div className="review-result-icon error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </div>
            
            <h2 className="review-result-title">Transaction Failed</h2>
            
            {error && (
              <p className="review-error-message">{error}</p>
            )}
          </div>
          
          <div className="review-result-footer">
            <button
              className="review-retry-btn"
              onClick={onConfirm}
              type="button"
            >
              Try Again
            </button>
            <button
              className="review-cancel-btn"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
        
        <style>{`
          .review-error .review-result-icon {
            background: var(--error-muted);
            color: var(--error);
          }
          
          .review-error-message {
            margin: 0;
            font-size: 13px;
            color: var(--error);
            max-width: 280px;
          }
          
          .review-result-footer {
            display: flex;
            flex-direction: column;
            gap: var(--space-2, 8px);
          }
          
          .review-retry-btn,
          .review-cancel-btn {
            width: 100%;
            padding: var(--space-4, 16px);
            border-radius: var(--radius-md, 10px);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition-fast);
          }
          
          .review-retry-btn {
            background: var(--accent-primary);
            border: none;
            color: white;
          }
          
          .review-retry-btn:hover {
            background: var(--accent-hover);
          }
          
          .review-cancel-btn {
            background: transparent;
            border: 1px solid var(--border-default);
            color: var(--text-secondary);
          }
          
          .review-cancel-btn:hover {
            background: var(--bg-tertiary);
          }
        `}</style>
      </>
    );
  }
  
  
  return (
    <>
      <StickyBottomCTA
        primaryLabel={confirmLabel}
        onPrimary={onConfirm}
        secondaryLabel="Cancel"
        onSecondary={onCancel}
        loading={false}
        loadingText={loadingText}
        className={`review-screen ${className}`}
      >
        <div className="review-content">
          <h2 className="review-title">{title}</h2>
          
          {}
          <div className="review-chain">
            <ChainPill chain={chain} evmChainId={evmChainId} testnet={testnet} variant="full" />
          </div>
          
          {}
          <div className="review-field">
            <span className="review-field-label">From</span>
            <AddressChip
              address={fromAddress}
              label={fromLabel}
              chain={chain}
              evmChainId={evmChainId}
              testnet={testnet}
              size="md"
            />
          </div>
          
          {}
          <div className="review-field">
            <span className="review-field-label">To</span>
            <AddressChip
              address={toAddress}
              label={toLabel}
              chain={chain}
              evmChainId={evmChainId}
              testnet={testnet}
              size="md"
              isFirstTime={isFirstTime}
            />
            {isFirstTime && (
              <div className="review-warning">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4M12 17h.01M21.73 18l-8-14a2 2 0 00-3.46 0l-8 14A2 2 0 004 21h16a2 2 0 001.73-3z" />
                </svg>
                <span>First time sending to this address</span>
              </div>
            )}
          </div>
          
          {}
          <div className="review-amount-card">
            <div className="review-amount-row">
              <span className="review-amount-label">Amount</span>
              <div className="review-amount-value">
                <span className="review-amount-token">
                  {formattedAmount} {token}
                </span>
                {formattedFiatAmount && (
                  <span className="review-amount-fiat">{formattedFiatAmount}</span>
                )}
              </div>
            </div>
            
            {formattedFee && (
              <div className="review-amount-row">
                <span className="review-amount-label">Network Fee</span>
                <div className="review-amount-value">
                  <span className="review-amount-token">
                    {formattedFee} {nativeSymbol}
                  </span>
                  {formattedFeeFiat && (
                    <span className="review-amount-fiat">{formattedFeeFiat}</span>
                  )}
                </div>
              </div>
            )}
            
            {formattedTotal && (
              <>
                <div className="review-amount-divider" />
                <div className="review-amount-row total">
                  <span className="review-amount-label">Total</span>
                  <span className="review-amount-total">{formattedTotal}</span>
                </div>
              </>
            )}
          </div>
          
          {}
          {enableGasCustomization && chain === 'evm' && evmChainId && onGasSettingsChange && (
            <div className="review-advanced-section">
              <button
                type="button"
                className="review-advanced-toggle"
                onClick={() => setShowAdvancedGas(!showAdvancedGas)}
              >
                <span className="toggle-icon">{showAdvancedGas ? '▼' : '▶'}</span>
                <span>Advanced</span>
              </button>
              
              {showAdvancedGas && (
                <div className="review-advanced-content">
                  <GasSettingsPanel
                    chainId={evmChainId}
                    gasLimit={gasLimit ?? 21000n}
                    onFeesChange={onGasSettingsChange}
                  />
                </div>
              )}
            </div>
          )}
          
          {}
          {details && Object.keys(details).length > 0 && (
            <DetailsAccordion
              title="Transaction Details"
              expanded={showDetails}
              onToggle={setShowDetails}
            >
              {details.nonce !== undefined && (
                <DetailsRow label="Nonce" value={String(details.nonce)} />
              )}
              {details.gasLimit && (
                <DetailsRow label="Gas Limit" value={details.gasLimit} mono />
              )}
              {details.maxFeePerGas && (
                <DetailsRow label="Max Fee" value={details.maxFeePerGas} mono />
              )}
              {details.maxPriorityFeePerGas && (
                <DetailsRow label="Priority Fee" value={details.maxPriorityFeePerGas} mono />
              )}
              {details.value && (
                <DetailsRow label="Value (Wei)" value={details.value} mono />
              )}
              {details.data && details.data !== '0x' && (
                <DetailsCodeBlock data={details.data} label="Data" />
              )}
            </DetailsAccordion>
          )}
        </div>
      </StickyBottomCTA>
      
      <style>{`
        .review-content {
          padding: var(--space-4, 16px);
          display: flex;
          flex-direction: column;
          gap: var(--space-4, 16px);
        }
        
        .review-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          text-align: center;
        }
        
        .review-chain {
          display: flex;
          justify-content: center;
        }
        
        .review-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-2, 8px);
        }
        
        .review-field-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        
        .review-warning {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          background: var(--warning-muted);
          border: 1px solid var(--warning);
          border-radius: 6px;
          font-size: 11px;
          color: var(--warning);
        }
        
        .review-amount-card {
          padding: var(--space-4, 16px);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg, 14px);
          display: flex;
          flex-direction: column;
          gap: var(--space-3, 12px);
        }
        
        .review-amount-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        
        .review-amount-label {
          font-size: 13px;
          color: var(--text-secondary);
        }
        
        .review-amount-value {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }
        
        .review-amount-token {
          font-size: 14px;
          font-weight: 600;
          font-family: var(--font-mono);
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        
        .review-amount-fiat {
          font-size: 12px;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }
        
        .review-amount-divider {
          height: 1px;
          background: var(--border-subtle);
        }
        
        .review-amount-row.total .review-amount-label {
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .review-amount-total {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        
        .review-advanced-section {
          margin-top: var(--space-2, 8px);
        }
        
        .review-advanced-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 0;
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: color var(--transition-fast);
        }
        
        .review-advanced-toggle:hover {
          color: var(--text-primary);
        }
        
        .review-advanced-toggle .toggle-icon {
          font-size: 10px;
          width: 12px;
        }
        
        .review-advanced-content {
          margin-top: var(--space-2, 8px);
          padding: var(--space-3, 12px);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 10px);
        }
      `}</style>
    </>
  );
};

export default ReviewScreen;
