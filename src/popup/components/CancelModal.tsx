import React, { useState, useCallback, useEffect } from 'react';
import { sendToBackground } from '@shared/messaging';
import type { EVMPendingTxInfo, EVMReplacementFeeEstimate, EVMTransactionResult } from '@shared/types';

// ============================================
// TYPES
// ============================================

export interface CancelModalProps {
  tx: EVMPendingTxInfo;
  onClose: () => void;
  onSuccess: (newHash: string) => void;
}

// ============================================
// COMPONENT
// ============================================

export function CancelModal({ tx, onClose, onSuccess }: CancelModalProps) {
  const [feeEstimate, setFeeEstimate] = useState<EVMReplacementFeeEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Load fee estimate for cancellation
  useEffect(() => {
    async function loadEstimate() {
      try {
        const response = await sendToBackground<EVMReplacementFeeEstimate>({
          type: 'EVM_ESTIMATE_REPLACEMENT_FEE',
          payload: { txHash: tx.hash, bumpPercent: 15 },
        });

        if (response.success && response.data) {
          setFeeEstimate(response.data);
        }
      } catch (err) {
        console.error('Failed to load fee estimate:', err);
      }
    }

    loadEstimate();
  }, [tx.hash]);

  const handleCancel = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await sendToBackground<EVMTransactionResult>({
        type: 'EVM_CANCEL_TX',
        payload: { txHash: tx.hash, bumpPercent: 15 },
      });

      if (response.success && response.data) {
        onSuccess(response.data.hash);
      } else {
        setError(response.error || 'Failed to cancel transaction');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel transaction');
    } finally {
      setLoading(false);
    }
  }, [tx.hash, onSuccess]);

  // Calculate cancellation fee (21000 gas for self-transfer)
  const cancellationFee = feeEstimate
    ? (feeEstimate.maxFeeGwei * 21000) / 1e9
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚫 Cancel Transaction</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="cancel-body">
          {/* Warning Section */}
          <div className="warning-section">
            <div className="warning-icon">⚠️</div>
            <p>
              Canceling a transaction sends a 0 ETH transfer to yourself with a higher fee,
              replacing the original pending transaction.
            </p>
          </div>

          {/* Transaction Info */}
          <div className="tx-info-section">
            <h3>Transaction to Cancel</h3>
            <div className="info-row">
              <span className="label">Hash</span>
              <span className="value monospace">
                {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Nonce</span>
              <span className="value">#{tx.nonce}</span>
            </div>
            <div className="info-row">
              <span className="label">Amount</span>
              <span className="value">{tx.valueFormatted} ETH</span>
            </div>
            <div className="info-row">
              <span className="label">To</span>
              <span className="value monospace">{tx.to.slice(0, 10)}...{tx.to.slice(-8)}</span>
            </div>
          </div>

          {/* Cancellation Cost */}
          <div className="cost-section">
            <h3>Cancellation Cost</h3>
            <div className="cost-amount">
              <span className="eth">{cancellationFee?.toFixed(6) ?? '—'} ETH</span>
              <span className="note">This fee is required to replace the transaction</span>
            </div>
          </div>

          {/* Confirmation Checkbox */}
          <label className="confirm-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I understand this will cost gas and cannot be undone</span>
          </label>

          {/* Error */}
          {error && (
            <div className="error-box">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose} disabled={loading}>
            Keep Transaction
          </button>
          <button
            className="btn danger"
            onClick={handleCancel}
            disabled={loading || !confirmed}
          >
            {loading ? 'Canceling...' : 'Cancel Transaction'}
          </button>
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-content {
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 400px;
            max-height: 90vh;
            overflow-y: auto;
          }
          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            border-bottom: 1px solid #eee;
          }
          .modal-header h2 {
            margin: 0;
            font-size: 18px;
          }
          .close-btn {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #666;
          }
          .cancel-body {
            padding: 16px;
          }
          .warning-section {
            display: flex;
            gap: 12px;
            padding: 12px;
            background: #fff3cd;
            border-radius: 8px;
            margin-bottom: 16px;
          }
          .warning-icon {
            font-size: 24px;
          }
          .warning-section p {
            margin: 0;
            font-size: 13px;
            color: #856404;
            line-height: 1.4;
          }
          .tx-info-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
          }
          .tx-info-section h3 {
            margin: 0 0 8px 0;
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 13px;
          }
          .info-row .label {
            color: #666;
          }
          .info-row .value {
            font-weight: 500;
          }
          .monospace {
            font-family: monospace;
          }
          .cost-section {
            background: #fee;
            border: 1px solid #fcc;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
          }
          .cost-section h3 {
            margin: 0 0 8px 0;
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
          }
          .cost-amount {
            text-align: center;
          }
          .cost-amount .eth {
            display: block;
            font-size: 20px;
            font-weight: 600;
            color: #d9534f;
            margin-bottom: 4px;
          }
          .cost-amount .note {
            font-size: 11px;
            color: #999;
          }
          .confirm-checkbox {
            display: flex;
            gap: 8px;
            align-items: flex-start;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            color: #666;
          }
          .confirm-checkbox input {
            margin-top: 2px;
          }
          .error-box {
            margin-top: 12px;
            padding: 12px;
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            border-radius: 8px;
            font-size: 13px;
            color: #721c24;
          }
          .modal-actions {
            display: flex;
            gap: 12px;
            padding: 16px;
            border-top: 1px solid #eee;
          }
          .btn {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .btn.danger {
            background: #d9534f;
            color: white;
          }
          .btn.danger:hover:not(:disabled) {
            background: #c9302c;
          }
          .btn.secondary {
            background: #f0f0f0;
            color: #333;
          }
          .btn.secondary:hover:not(:disabled) {
            background: #e0e0e0;
          }
        `}</style>
      </div>
    </div>
  );
}

export default CancelModal;
