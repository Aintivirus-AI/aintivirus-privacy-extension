import React, { useState, useEffect, useCallback } from 'react';
import { sendToBackground } from '@shared/messaging';
import type { EVMChainId, EVMGasPresets } from '@shared/types';

// ============================================
// TYPES
// ============================================

export type GasPreset = 'slow' | 'market' | 'fast' | 'custom';

export interface GasSettings {
  preset: GasPreset;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
  customNonce?: number;
}

export interface GasSettingsPanelProps {
  chainId: EVMChainId;
  isReplacement?: boolean;
  originalFees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  txHash?: string;
  gasLimit?: bigint;
  onFeesChange: (settings: GasSettings) => void;
  disabled?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const PRESET_LABELS: Record<GasPreset, { label: string; description: string }> = {
  slow: { label: 'Slow', description: '~5 minutes' },
  market: { label: 'Market', description: '~2 minutes' },
  fast: { label: 'Fast', description: '~30 seconds' },
  custom: { label: 'Custom', description: 'Set your own' },
};

const WARNING_GWEI_THRESHOLD = 500;
const ERROR_GWEI_THRESHOLD = 2000;
const MIN_REPLACEMENT_BUMP_PERCENT = 10;

// ============================================
// COMPONENT
// ============================================

export function GasSettingsPanel({
  chainId,
  isReplacement = false,
  originalFees,
  txHash,
  gasLimit = 21000n,
  onFeesChange,
  disabled = false,
}: GasSettingsPanelProps) {
  const [preset, setPreset] = useState<GasPreset>('market');
  const [presets, setPresets] = useState<EVMGasPresets | null>(null);
  const [customMaxFee, setCustomMaxFee] = useState<string>('');
  const [customPriorityFee, setCustomPriorityFee] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customNonce, setCustomNonce] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Load gas presets
  useEffect(() => {
    async function loadPresets() {
      setLoading(true);
      setError(null);

      try {
        if (isReplacement && txHash) {
          // Load replacement-specific presets
          const response = await sendToBackground<EVMGasPresets>({
            type: 'EVM_GET_GAS_PRESETS',
            payload: { evmChainId: chainId, txHash },
          });

          if (response.success && response.data) {
            setPresets(response.data);
            // Initialize custom fields with market values
            setCustomMaxFee(response.data.market.maxFeeGwei.toFixed(2));
            setCustomPriorityFee(response.data.market.maxPriorityFeeGwei.toFixed(2));
          } else {
            setError('Failed to load gas presets');
          }
        } else {
          // Load standard presets (TODO: implement standard gas preset fetching)
          // For now, use placeholder values
          const placeholderPresets: EVMGasPresets = {
            slow: { maxFeeGwei: 20, maxPriorityFeeGwei: 1, estimatedWaitTime: '~5 minutes' },
            market: { maxFeeGwei: 30, maxPriorityFeeGwei: 2, estimatedWaitTime: '~2 minutes' },
            fast: { maxFeeGwei: 50, maxPriorityFeeGwei: 3, estimatedWaitTime: '~30 seconds' },
            original: { maxFeeGwei: 0, maxPriorityFeeGwei: 0 },
          };
          setPresets(placeholderPresets);
          setCustomMaxFee('30');
          setCustomPriorityFee('2');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load gas presets');
      } finally {
        setLoading(false);
      }
    }

    loadPresets();
  }, [chainId, isReplacement, txHash]);

  // Calculate current fees based on selection
  const getCurrentFees = useCallback((): { maxFee: bigint; priorityFee: bigint } | null => {
    if (!presets) return null;

    let maxFeeGwei: number;
    let priorityFeeGwei: number;

    if (preset === 'custom') {
      maxFeeGwei = parseFloat(customMaxFee) || 0;
      priorityFeeGwei = parseFloat(customPriorityFee) || 0;
    } else {
      maxFeeGwei = presets[preset].maxFeeGwei;
      priorityFeeGwei = presets[preset].maxPriorityFeeGwei;
    }

    return {
      maxFee: BigInt(Math.floor(maxFeeGwei * 1e9)),
      priorityFee: BigInt(Math.floor(priorityFeeGwei * 1e9)),
    };
  }, [preset, presets, customMaxFee, customPriorityFee]);

  // Validate fees and update parent
  useEffect(() => {
    const fees = getCurrentFees();
    if (!fees) return;

    // Validate
    const maxFeeGwei = Number(fees.maxFee) / 1e9;
    
    if (maxFeeGwei > ERROR_GWEI_THRESHOLD) {
      setError(`Max fee ${maxFeeGwei.toFixed(2)} gwei exceeds safety limit of ${ERROR_GWEI_THRESHOLD} gwei`);
      return;
    }

    if (isReplacement && originalFees) {
      const originalMaxGwei = Number(originalFees.maxFeePerGas) / 1e9;
      const minRequiredGwei = originalMaxGwei * (1 + MIN_REPLACEMENT_BUMP_PERCENT / 100);
      
      if (maxFeeGwei < minRequiredGwei) {
        setError(`Must be at least ${minRequiredGwei.toFixed(2)} gwei (10% bump)`);
        return;
      }
    }

    setError(null);

    if (maxFeeGwei > WARNING_GWEI_THRESHOLD) {
      setWarning(`Gas fee is higher than usual (${maxFeeGwei.toFixed(2)} gwei)`);
    } else {
      setWarning(null);
    }

    // Notify parent
    onFeesChange({
      preset,
      maxFeePerGas: fees.maxFee,
      maxPriorityFeePerGas: fees.priorityFee,
      gasLimit,
      customNonce: customNonce ? parseInt(customNonce, 10) : undefined,
    });
  }, [preset, presets, customMaxFee, customPriorityFee, customNonce, gasLimit, isReplacement, originalFees, getCurrentFees, onFeesChange]);

  // Calculate estimated cost
  const estimatedCost = (() => {
    const fees = getCurrentFees();
    if (!fees) return null;
    const costWei = fees.maxFee * gasLimit;
    return Number(costWei) / 1e18;
  })();

  if (loading) {
    return (
      <div className="gas-settings-panel loading">
        <div className="spinner"></div>
        <span>Loading gas prices...</span>
      </div>
    );
  }

  return (
    <div className={`gas-settings-panel ${disabled ? 'disabled' : ''}`}>
      {/* Preset Buttons */}
      <div className="gas-presets">
        {(['slow', 'market', 'fast'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={`preset-btn ${preset === p ? 'active' : ''}`}
            onClick={() => setPreset(p)}
            disabled={disabled}
          >
            <span className="preset-label">{PRESET_LABELS[p].label}</span>
            {presets && (
              <span className="preset-fee">{presets[p].maxFeeGwei.toFixed(1)} gwei</span>
            )}
            <span className="preset-time">{PRESET_LABELS[p].description}</span>
          </button>
        ))}
      </div>

      {/* Show original if replacement */}
      {isReplacement && presets?.original && (
        <div className="original-fee-info">
          <span className="label">Original:</span>
          <span className="value">{presets.original.maxFeeGwei.toFixed(2)} gwei</span>
          <span className="note">(min +10% required)</span>
        </div>
      )}

      {/* Advanced Toggle */}
      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setShowAdvanced(!showAdvanced)}
        disabled={disabled}
      >
        <span>{showAdvanced ? '▼' : '▶'} Advanced</span>
      </button>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="advanced-options">
          <div className="input-group">
            <label>Max Fee (gwei)</label>
            <input
              type="number"
              value={customMaxFee}
              onChange={(e) => {
                setCustomMaxFee(e.target.value);
                setPreset('custom');
              }}
              placeholder="Max fee per gas"
              disabled={disabled}
              step="0.1"
              min="0"
            />
          </div>

          <div className="input-group">
            <label>Priority Fee (gwei)</label>
            <input
              type="number"
              value={customPriorityFee}
              onChange={(e) => {
                setCustomPriorityFee(e.target.value);
                setPreset('custom');
              }}
              placeholder="Priority fee"
              disabled={disabled}
              step="0.1"
              min="0"
            />
          </div>

          <div className="input-group">
            <label>Custom Nonce (optional)</label>
            <input
              type="number"
              value={customNonce}
              onChange={(e) => setCustomNonce(e.target.value)}
              placeholder="Leave empty for auto"
              disabled={disabled || isReplacement}
              min="0"
            />
            {isReplacement && (
              <span className="note">Nonce locked for replacement</span>
            )}
          </div>
        </div>
      )}

      {/* Estimated Cost */}
      {estimatedCost !== null && (
        <div className="estimated-cost">
          <span className="label">Max Cost:</span>
          <span className="value">{estimatedCost.toFixed(6)} ETH</span>
        </div>
      )}

      {/* Warnings and Errors */}
      {warning && !error && (
        <div className="gas-warning">
          ⚠️ {warning}
        </div>
      )}
      {error && (
        <div className="gas-error">
          ❌ {error}
        </div>
      )}

      <style>{`
        .gas-settings-panel {
          padding: 12px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 8px;
        }
        .gas-settings-panel.disabled {
          opacity: 0.6;
          pointer-events: none;
        }
        .gas-settings-panel.loading {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: center;
          padding: 24px;
        }
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #ccc;
          border-top-color: #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .gas-presets {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .preset-btn {
          flex: 1;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          transition: all 0.2s;
        }
        .preset-btn:hover {
          border-color: #007bff;
        }
        .preset-btn.active {
          border-color: #007bff;
          background: #e7f3ff;
        }
        .preset-label {
          font-weight: 600;
          font-size: 12px;
        }
        .preset-fee {
          font-size: 11px;
          color: #666;
        }
        .preset-time {
          font-size: 10px;
          color: #999;
        }
        .original-fee-info {
          display: flex;
          gap: 6px;
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
          padding: 6px 8px;
          background: rgba(0,0,0,0.05);
          border-radius: 4px;
        }
        .original-fee-info .note {
          color: #999;
          font-style: italic;
        }
        .advanced-toggle {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          font-size: 12px;
          padding: 4px 0;
          margin-bottom: 8px;
        }
        .advanced-toggle:hover {
          color: #333;
        }
        .advanced-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 12px;
          background: white;
          border-radius: 6px;
          margin-bottom: 12px;
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .input-group label {
          font-size: 12px;
          font-weight: 500;
          color: #666;
        }
        .input-group input {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }
        .input-group input:focus {
          outline: none;
          border-color: #007bff;
        }
        .input-group .note {
          font-size: 10px;
          color: #999;
          font-style: italic;
        }
        .estimated-cost {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-top: 1px solid #eee;
          font-size: 13px;
        }
        .estimated-cost .label {
          color: #666;
        }
        .estimated-cost .value {
          font-weight: 600;
        }
        .gas-warning {
          padding: 8px;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          font-size: 12px;
          color: #856404;
          margin-top: 8px;
        }
        .gas-error {
          padding: 8px;
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          font-size: 12px;
          color: #721c24;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}

export default GasSettingsPanel;
