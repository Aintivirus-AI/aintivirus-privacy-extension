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
  const formattedFee = useMemo(() => (fee ? formatAmount(fee) : undefined), [fee]);
  const formattedFiatAmount = useMemo(() => formatFiat(fiatAmount), [fiatAmount]);
  const formattedFeeFiat = useMemo(() => formatFiat(feeFiat), [feeFiat]);
  const formattedTotal = useMemo(() => formatFiat(totalFiat), [totalFiat]);

  if (state === 'success' || state === 'pending') {
    return (
      <>
        <div className={`review-screen review-${state} ${className}`}>
          <div className="review-result">
            {/* Celebration background effects */}
            <div className="celebration-bg" />
            
            <div className="review-result-icon">
              {state === 'pending' ? (
                <div className="result-spinner">
                  <div className="spinner-track" />
                  <div className="spinner-glow" />
                </div>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="success-check">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>

            <h2 className="review-result-title">
              {state === 'pending' ? 'Transaction Pending' : 'Transaction Sent!'}
            </h2>
            
            <p className="review-result-subtitle">
              {state === 'pending' ? 'Waiting for network confirmation...' : 'Your transaction was successful'}
            </p>

            <div className="review-result-amount-card">
              <span className="amount-label">Amount</span>
              <span className="amount-value">
                {formattedAmount} {token}
              </span>
              {formattedFiatAmount && (
                <span className="amount-fiat">{formattedFiatAmount}</span>
              )}
            </div>

            <StatusChip status={state === 'pending' ? 'pending' : 'confirmed'} size="md" />

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
            <button className="review-done-btn" onClick={onDone || onCancel} type="button">
              Done
            </button>
          </div>
        </div>

        <style>{`
          .review-screen {
            display: flex;
            flex-direction: column;
            height: 100%;
            position: relative;
            overflow: hidden;
          }
          
          .celebration-bg {
            position: absolute;
            top: 0;
            left: 50%;
            width: 300%;
            height: 300%;
            transform: translateX(-50%);
            background: 
              radial-gradient(circle at 30% 20%, rgba(34, 197, 94, 0.12) 0%, transparent 25%),
              radial-gradient(circle at 70% 30%, rgba(99, 102, 241, 0.1) 0%, transparent 20%),
              radial-gradient(circle at 50% 60%, rgba(139, 92, 246, 0.08) 0%, transparent 25%);
            animation: celebratePulse 4s ease-in-out infinite alternate;
            pointer-events: none;
          }
          
          @keyframes celebratePulse {
            from { opacity: 0.5; transform: translateX(-50%) scale(1); }
            to { opacity: 1; transform: translateX(-50%) scale(1.1); }
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
            position: relative;
            z-index: 1;
          }
          
          .review-result-icon {
            width: 88px;
            height: 88px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            animation: iconPop 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          }
          
          @keyframes iconPop {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.15); }
            70% { transform: scale(0.95); }
            100% { transform: scale(1); opacity: 1; }
          }
          
          .review-pending .review-result-icon {
            background: linear-gradient(135deg, rgba(212, 165, 52, 0.15) 0%, rgba(212, 165, 52, 0.1) 100%);
            box-shadow: 
              0 0 0 8px rgba(212, 165, 52, 0.1),
              0 0 0 16px rgba(212, 165, 52, 0.05),
              0 8px 32px rgba(212, 165, 52, 0.2);
          }
          
          .review-success .review-result-icon {
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            box-shadow: 
              0 0 0 8px rgba(34, 197, 94, 0.15),
              0 0 0 16px rgba(34, 197, 94, 0.08),
              0 12px 40px rgba(34, 197, 94, 0.3);
            color: white;
          }
          
          .review-success .review-result-icon::after {
            content: '';
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, transparent 50%);
            pointer-events: none;
          }
          
          .success-check {
            width: 44px;
            height: 44px;
            animation: checkDraw 0.5s ease-out 0.3s both;
          }
          
          @keyframes checkDraw {
            from { stroke-dasharray: 50; stroke-dashoffset: 50; }
            to { stroke-dashoffset: 0; }
          }
          
          .result-spinner {
            width: 44px;
            height: 44px;
            position: relative;
          }
          
          .spinner-track {
            width: 100%;
            height: 100%;
            border: 3px solid rgba(212, 165, 52, 0.2);
            border-top-color: #d4a534;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          
          .spinner-glow {
            position: absolute;
            inset: -6px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(212, 165, 52, 0.4) 0%, transparent 70%);
            animation: glowPulse 2s ease-in-out infinite;
          }
          
          @keyframes glowPulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
          
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          
          .review-result-title {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--text-primary);
            letter-spacing: -0.02em;
            animation: titleFade 0.4s ease-out 0.2s both;
          }
          
          @keyframes titleFade {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .review-result-subtitle {
            margin: 0;
            font-size: 0.875rem;
            color: var(--text-muted);
            animation: titleFade 0.4s ease-out 0.25s both;
          }
          
          .review-result-amount-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: var(--space-5, 20px);
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: var(--radius-xl, 18px);
            min-width: 200px;
            animation: cardReveal 0.5s ease-out 0.35s both;
            backdrop-filter: blur(10px);
          }
          
          @keyframes cardReveal {
            from { opacity: 0; transform: translateY(15px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          
          .review-success .review-result-amount-card {
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(99, 102, 241, 0.08) 100%);
            border-color: rgba(34, 197, 94, 0.2);
          }
          
          .amount-label {
            font-size: 0.6875rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-muted);
          }
          
          .amount-value {
            font-size: 1.75rem;
            font-weight: 700;
            font-family: var(--font-mono);
            font-variant-numeric: tabular-nums;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, var(--text-primary) 0%, #22c55e 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          
          .amount-fiat {
            font-size: 0.875rem;
            color: var(--text-muted);
            font-family: var(--font-mono);
          }
          
          .review-result-actions {
            margin-top: var(--space-4, 16px);
            animation: buttonFade 0.4s ease-out 0.5s both;
          }
          
          @keyframes buttonFade {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .explorer-btn {
            padding: 12px 24px;
            background: linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%);
            border: none;
            border-radius: var(--radius-full, 9999px);
            color: white;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 
              0 4px 16px rgba(99, 102, 241, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }
          
          .explorer-btn:hover {
            transform: translateY(-2px) scale(1.02);
            box-shadow: 
              0 8px 24px rgba(99, 102, 241, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.25);
          }
          
          .review-result-footer {
            padding: var(--space-4, 16px);
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            animation: footerSlide 0.4s ease-out 0.55s both;
            position: relative;
            z-index: 1;
          }
          
          @keyframes footerSlide {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .review-done-btn {
            width: 100%;
            padding: var(--space-4, 16px);
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: var(--radius-xl, 18px);
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            backdrop-filter: blur(10px);
          }
          
          .review-done-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
          }
          
          @media (prefers-reduced-motion: reduce) {
            .result-spinner .spinner-track,
            .celebration-bg,
            .spinner-glow {
              animation: none;
            }
            .review-result-icon,
            .success-check,
            .review-result-title,
            .review-result-subtitle,
            .review-result-amount-card,
            .review-result-actions,
            .review-result-footer {
              animation: none;
              opacity: 1;
              transform: none;
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
            {/* Error background effect */}
            <div className="error-bg" />
            
            <div className="review-result-icon error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="error-x">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </div>

            <h2 className="review-result-title">Transaction Failed</h2>
            
            <p className="review-result-subtitle">Something went wrong with your transaction</p>

            {error && (
              <div className="error-card">
                <div className="error-card-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                </div>
                <p className="review-error-message">{error}</p>
              </div>
            )}
          </div>

          <div className="review-result-footer error-footer">
            <button className="review-retry-btn" onClick={onConfirm} type="button">
              Try Again
            </button>
            <button className="review-cancel-btn" onClick={onCancel} type="button">
              Cancel
            </button>
          </div>
        </div>

        <style>{`
          .review-error {
            position: relative;
            overflow: hidden;
          }
          
          .error-bg {
            position: absolute;
            top: 0;
            left: 50%;
            width: 300%;
            height: 300%;
            transform: translateX(-50%);
            background: radial-gradient(circle at 50% 30%, rgba(239, 68, 68, 0.1) 0%, transparent 40%);
            animation: errorPulse 3s ease-in-out infinite;
            pointer-events: none;
          }
          
          @keyframes errorPulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          
          .review-result {
            position: relative;
            z-index: 1;
          }
          
          .review-error .review-result-icon {
            width: 88px;
            height: 88px;
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.1) 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 
              0 0 0 8px rgba(239, 68, 68, 0.1),
              0 0 0 16px rgba(239, 68, 68, 0.05),
              0 8px 32px rgba(239, 68, 68, 0.2);
            animation: errorShake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
          }
          
          @keyframes errorShake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
            20%, 40%, 60%, 80% { transform: translateX(4px); }
          }
          
          .error-x {
            width: 44px;
            height: 44px;
            color: #ef4444;
          }
          
          .review-error .review-result-title {
            color: var(--text-primary);
            animation: fadeIn 0.4s ease-out 0.2s both;
          }
          
          .review-error .review-result-subtitle {
            color: var(--text-muted);
            animation: fadeIn 0.4s ease-out 0.25s both;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .error-card {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: var(--space-4, 16px);
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.06) 100%);
            border: 1px solid rgba(239, 68, 68, 0.25);
            border-radius: var(--radius-lg, 14px);
            max-width: 300px;
            animation: cardSlide 0.4s ease-out 0.3s both;
          }
          
          @keyframes cardSlide {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .error-card-icon {
            flex-shrink: 0;
            color: #ef4444;
            margin-top: 2px;
          }
          
          .review-error-message {
            margin: 0;
            font-size: 0.8125rem;
            color: rgba(239, 68, 68, 0.9);
            line-height: 1.5;
            text-align: left;
          }
          
          .error-footer {
            display: flex;
            flex-direction: column;
            gap: var(--space-3, 12px);
            padding: var(--space-4, 16px);
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            position: relative;
            z-index: 1;
            animation: footerSlide 0.4s ease-out 0.4s both;
          }
          
          @keyframes footerSlide {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .review-retry-btn,
          .review-cancel-btn {
            width: 100%;
            padding: var(--space-4, 16px);
            border-radius: var(--radius-xl, 18px);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          }
          
          .review-retry-btn {
            background: linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%);
            border: none;
            color: white;
            box-shadow: 
              0 4px 16px rgba(99, 102, 241, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }
          
          .review-retry-btn:hover {
            transform: translateY(-2px);
            box-shadow: 
              0 8px 24px rgba(99, 102, 241, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.25);
          }
          
          .review-cancel-btn {
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--text-secondary);
            backdrop-filter: blur(10px);
          }
          
          .review-cancel-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
          }
          
          @media (prefers-reduced-motion: reduce) {
            .error-bg,
            .review-error .review-result-icon,
            .review-error .review-result-title,
            .review-error .review-result-subtitle,
            .error-card,
            .error-footer {
              animation: none;
              opacity: 1;
              transform: none;
            }
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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
              {details.gasLimit && <DetailsRow label="Gas Limit" value={details.gasLimit} mono />}
              {details.maxFeePerGas && (
                <DetailsRow label="Max Fee" value={details.maxFeePerGas} mono />
              )}
              {details.maxPriorityFeePerGas && (
                <DetailsRow label="Priority Fee" value={details.maxPriorityFeePerGas} mono />
              )}
              {details.value && <DetailsRow label="Value (Wei)" value={details.value} mono />}
              {details.data && details.data !== '0x' && (
                <DetailsCodeBlock data={details.data} label="Data" />
              )}
            </DetailsAccordion>
          )}
        </div>
      </StickyBottomCTA>

      <style>{`
        .review-content {
          padding: var(--space-5, 20px);
          display: flex;
          flex-direction: column;
          gap: var(--space-4, 16px);
          animation: contentFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes contentFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .review-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          text-align: center;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-primary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .review-chain {
          display: flex;
          justify-content: center;
          animation: fadeInUp 0.4s ease-out 0.1s both;
        }
        
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .review-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-2, 8px);
          padding: var(--space-4, 16px);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: var(--radius-lg, 14px);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          animation: fadeInUp 0.4s ease-out both;
        }
        
        .review-field:nth-child(3) { animation-delay: 0.15s; }
        .review-field:nth-child(4) { animation-delay: 0.2s; }
        
        .review-field:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.1);
          transform: translateX(4px);
        }
        
        .review-field-label {
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        
        .review-warning {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(251, 191, 36, 0.08) 100%);
          border: 1px solid rgba(251, 191, 36, 0.35);
          border-radius: var(--radius-lg, 14px);
          font-size: 0.75rem;
          color: var(--warning);
          animation: warningPulse 2s ease-in-out infinite;
        }
        
        @keyframes warningPulse {
          0%, 100% { 
            border-color: rgba(251, 191, 36, 0.35);
            box-shadow: 0 0 0 0 rgba(251, 191, 36, 0);
          }
          50% { 
            border-color: rgba(251, 191, 36, 0.5);
            box-shadow: 0 0 12px rgba(251, 191, 36, 0.15);
          }
        }
        
        .review-amount-card {
          padding: var(--space-5, 20px);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: var(--radius-xl, 18px);
          display: flex;
          flex-direction: column;
          gap: var(--space-4, 16px);
          animation: fadeInUp 0.4s ease-out 0.25s both;
          backdrop-filter: blur(10px);
          box-shadow: 
            0 4px 20px rgba(99, 102, 241, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        
        .review-amount-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        
        .review-amount-label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary);
        }
        
        .review-amount-value {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        
        .review-amount-token {
          font-size: 1rem;
          font-weight: 600;
          font-family: var(--font-mono);
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        
        .review-amount-fiat {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          font-family: var(--font-mono);
        }
        
        .review-amount-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.3), transparent);
        }
        
        .review-amount-row.total .review-amount-label {
          font-weight: 700;
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        
        .review-amount-total {
          font-size: 1.25rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-primary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .review-advanced-section {
          margin-top: var(--space-2, 8px);
          animation: fadeInUp 0.4s ease-out 0.3s both;
        }
        
        .review-advanced-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: var(--radius-lg, 14px);
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          width: 100%;
        }
        
        .review-advanced-toggle:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.12);
        }
        
        .review-advanced-toggle .toggle-icon {
          font-size: 0.625rem;
          width: 14px;
          opacity: 0.7;
          transition: transform 0.2s ease;
        }
        
        .review-advanced-content {
          margin-top: var(--space-3, 12px);
          padding: var(--space-4, 16px);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: var(--radius-lg, 14px);
          animation: expandIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes expandIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .review-content,
          .review-chain,
          .review-field,
          .review-amount-card,
          .review-advanced-section,
          .review-advanced-content {
            animation: none;
          }
          .review-warning {
            animation: none;
          }
        }
      `}</style>
    </>
  );
};

export default ReviewScreen;
