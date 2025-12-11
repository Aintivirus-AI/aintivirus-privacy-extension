import { useState, useCallback, useEffect } from 'react';
import { sendToBackground } from '@shared/messaging';
import type {
  EVMPendingTxInfo,
  EVMReplacementFeeEstimate,
  EVMTransactionResult,
} from '@shared/types';
import { GasSettingsPanel, type GasSettings } from './GasSettingsPanel';

export interface SpeedUpModalProps {
  tx: EVMPendingTxInfo;
  onClose: () => void;
  onSuccess: (newHash: string) => void;
}

export function SpeedUpModal({ tx, onClose, onSuccess }: SpeedUpModalProps) {
  const [gasSettings, setGasSettings] = useState<GasSettings | null>(null);
  const [feeEstimate, setFeeEstimate] = useState<EVMReplacementFeeEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'configure' | 'confirm'>('configure');

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
      } catch {
        // Fee estimation is best-effort; the user can still proceed.
      }
    }

    loadEstimate();
  }, [tx.hash]);

  const handleConfirm = useCallback(async () => {
    if (!gasSettings) return;

    setLoading(true);
    setError(null);

    try {
      const response = await sendToBackground<EVMTransactionResult>({
        type: 'EVM_SPEED_UP_TX',
        payload: {
          txHash: tx.hash,
          customMaxFeePerGas: gasSettings.maxFeePerGas.toString(),
          customMaxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas.toString(),
        },
      });

      if (response.success && response.data) {
        onSuccess(response.data.hash);
      } else {
        setError(response.error || 'Failed to speed up transaction');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to speed up transaction');
    } finally {
      setLoading(false);
    }
  }, [tx.hash, gasSettings, onSuccess]);

  const handleGasChange = useCallback((settings: GasSettings) => {
    setGasSettings(settings);
  }, []);

  const estimatedCost = gasSettings
    ? Number(gasSettings.maxFeePerGas * gasSettings.gasLimit) / 1e18
    : null;

  const costIncrease = feeEstimate?.costDifferenceEth ?? 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚡ Speed Up Transaction</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {step === 'configure' && (
          <>
            {/* Current transaction snapshot (what we’re replacing). */}
            <div className="tx-info-section">
              <div className="info-row">
                <span className="label">Transaction</span>
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
                <span className="label">Current Fee</span>
                <span className="value">{tx.maxFeeGwei.toFixed(2)} gwei</span>
              </div>
            </div>

            {/* Configure replacement fees (must bump the original). */}
            <div className="gas-section">
              <h3>New Gas Settings</h3>
              <GasSettingsPanel
                chainId={tx.chainId}
                isReplacement={true}
                originalFees={{
                  maxFeePerGas: BigInt(Math.floor(tx.maxFeeGwei * 1e9)),
                  maxPriorityFeePerGas: BigInt(Math.floor(tx.maxPriorityFeeGwei * 1e9)),
                }}
                txHash={tx.hash}
                gasLimit={21000n}
                onFeesChange={handleGasChange}
              />
            </div>

            {/* Show the estimated delta cost (if available). */}
            {feeEstimate && (
              <div className="cost-comparison">
                <div className="comparison-row">
                  <span className="label">Additional Cost</span>
                  <span className="value increase">+{costIncrease.toFixed(6)} ETH</span>
                </div>
                <div className="comparison-row">
                  <span className="label">Increase</span>
                  <span className="value">+{feeEstimate.percentIncrease.toFixed(1)}%</span>
                </div>
              </div>
            )}

            {/* Warning from the estimator (e.g., unusually high fees). */}
            {feeEstimate?.warning && <div className="warning-box">⚠️ {feeEstimate.warning}</div>}

            {/* Primary actions for this step. */}
            <div className="modal-actions">
              <button className="btn secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => setStep('confirm')}
                disabled={!gasSettings}
              >
                Review Speed Up
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="confirm-section">
              <div className="confirm-icon">⚡</div>
              <h3>Confirm Speed Up</h3>
              <p>This will replace your pending transaction with a higher fee.</p>

              <div className="confirm-details">
                <div className="detail-row">
                  <span>New Max Fee</span>
                  <span className="monospace">
                    {gasSettings ? (Number(gasSettings.maxFeePerGas) / 1e9).toFixed(2) : '—'} gwei
                  </span>
                </div>
                <div className="detail-row">
                  <span>Max Cost</span>
                  <span>{estimatedCost?.toFixed(6) ?? '—'} ETH</span>
                </div>
              </div>

              {error && <div className="error-box">❌ {error}</div>}
            </div>

            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setStep('configure')}
                disabled={loading}
              >
                Back
              </button>
              <button className="btn primary" onClick={handleConfirm} disabled={loading}>
                {loading ? 'Processing...' : 'Speed Up'}
              </button>
            </div>
          </>
        )}

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
          .tx-info-section {
            padding: 16px;
            background: #f8f9fa;
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
          .gas-section {
            padding: 16px;
          }
          .gas-section h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: #333;
          }
          .cost-comparison {
            padding: 12px 16px;
            background: #fff3cd;
            margin: 0 16px;
            border-radius: 8px;
          }
          .comparison-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            padding: 2px 0;
          }
          .comparison-row .increase {
            color: #d9534f;
            font-weight: 600;
          }
          .warning-box {
            margin: 12px 16px;
            padding: 12px;
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            font-size: 13px;
            color: #856404;
          }
          .error-box {
            margin: 12px 0;
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
          .btn.primary {
            background: #007bff;
            color: white;
          }
          .btn.primary:hover:not(:disabled) {
            background: #0056b3;
          }
          .btn.secondary {
            background: #f0f0f0;
            color: #333;
          }
          .btn.secondary:hover:not(:disabled) {
            background: #e0e0e0;
          }
          .confirm-section {
            padding: 24px 16px;
            text-align: center;
          }
          .confirm-icon {
            font-size: 48px;
            margin-bottom: 16px;
          }
          .confirm-section h3 {
            margin: 0 0 8px 0;
          }
          .confirm-section p {
            margin: 0 0 16px 0;
            color: #666;
            font-size: 14px;
          }
          .confirm-details {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
            text-align: left;
          }
          .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 13px;
          }
        `}</style>
      </div>
    </div>
  );
}

export default SpeedUpModal;
