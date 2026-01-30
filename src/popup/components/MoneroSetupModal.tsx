import { useState, useCallback } from 'react';
import { sendToBackground } from '@shared/messaging';
import { isValidMoneroAddress, isValidViewKey } from '@wallet/chains/monero/validation';

export interface MoneroSetupModalProps {
  onClose: () => void;
  onSuccess: (address: string) => void;
  testnet?: boolean;
  /** Pre-fill with existing configuration for editing */
  initialConfig?: {
    address?: string;
    viewKey?: string;
    restoreHeight?: number;
  };
}

export function MoneroSetupModal({ onClose, onSuccess, testnet = false, initialConfig }: MoneroSetupModalProps) {
  const [address, setAddress] = useState(initialConfig?.address || '');
  const [viewKey, setViewKey] = useState(initialConfig?.viewKey || '');
  const [restoreHeight, setRestoreHeight] = useState(initialConfig?.restoreHeight?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showViewKey, setShowViewKey] = useState(false);

  const addressValid = address.length === 0 || isValidMoneroAddress(address, testnet);
  const viewKeyValid = viewKey.length === 0 || isValidViewKey(viewKey);
  const canSubmit = address.length > 0 && viewKey.length > 0 && addressValid && viewKeyValid;

  const handleSave = useCallback(async () => {
    if (!isValidMoneroAddress(address, testnet)) {
      setError('Invalid Monero address. Standard addresses are 95 characters and start with "4".');
      return;
    }

    if (!isValidViewKey(viewKey)) {
      setError('Invalid view key. Must be 64 hexadecimal characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config: { address: string; viewKey: string; restoreHeight?: number } = {
        address: address.trim(),
        viewKey: viewKey.trim().toLowerCase(),
      };

      if (restoreHeight.trim()) {
        const height = parseInt(restoreHeight.trim(), 10);
        if (!isNaN(height) && height >= 0) {
          config.restoreHeight = height;
        }
      }

      const response = await sendToBackground({
        type: 'WALLET_SET_SETTINGS',
        payload: {
          moneroWatchOnly: config,
        },
      });

      if (response.success) {
        onSuccess(address);
      } else {
        setError(response.error || 'Failed to save Monero configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  }, [address, viewKey, restoreHeight, testnet, onSuccess]);

  return (
    <div className="xmr-overlay" onClick={onClose}>
      <div className="xmr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="xmr-header">
          <div className="xmr-title-group">
            <div className="xmr-icon">
              <svg width="24" height="24" viewBox="0 0 256 256" fill="none">
                <circle cx="128" cy="128" r="128" fill="#FF6600"/>
                <path d="M128 32L128 160M128 160L80 112M128 160L176 112" stroke="white" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 128 128)"/>
                <path d="M64 192H192" stroke="white" strokeWidth="16" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2>Import Monero Wallet</h2>
              <p className="xmr-subtitle">Watch-only mode</p>
            </div>
          </div>
          <button className="xmr-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="xmr-body">
          <div className="xmr-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <p>
              Enter your public address and view key to track incoming transactions. 
              Your spend key is never stored — sending is not available.
            </p>
          </div>

          <div className="xmr-field">
            <label htmlFor="xmr-address">
              Public Address
              {address.length > 0 && (
                <span className={`xmr-counter ${addressValid ? '' : 'invalid'}`}>
                  {address.length}/95
                </span>
              )}
            </label>
            <textarea
              id="xmr-address"
              placeholder="4..."
              value={address}
              onChange={(e) => setAddress(e.target.value.replace(/\s/g, ''))}
              className={address.length > 0 && !addressValid ? 'invalid' : ''}
              rows={2}
              spellCheck={false}
              autoComplete="off"
            />
            {address.length > 0 && !addressValid && (
              <span className="xmr-error">Must be 95 characters starting with "4"</span>
            )}
          </div>

          <div className="xmr-field">
            <label htmlFor="xmr-viewkey">
              Private View Key
              {viewKey.length > 0 && (
                <span className={`xmr-counter ${viewKeyValid ? '' : 'invalid'}`}>
                  {viewKey.length}/64
                </span>
              )}
            </label>
            <div className="xmr-input-wrap">
              <input
                id="xmr-viewkey"
                type={showViewKey ? 'text' : 'password'}
                placeholder="64 hexadecimal characters"
                value={viewKey}
                onChange={(e) => setViewKey(e.target.value.replace(/\s/g, ''))}
                className={viewKey.length > 0 && !viewKeyValid ? 'invalid' : ''}
                spellCheck={false}
                autoComplete="off"
              />
              <button 
                type="button" 
                className="xmr-toggle-vis"
                onClick={() => setShowViewKey(!showViewKey)}
                aria-label={showViewKey ? 'Hide view key' : 'Show view key'}
              >
                {showViewKey ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {viewKey.length > 0 && !viewKeyValid && (
              <span className="xmr-error">Must be 64 hexadecimal characters</span>
            )}
          </div>

          <div className="xmr-field xmr-optional">
            <label htmlFor="xmr-height">
              Restore Height
              <span className="xmr-opt-tag">Optional</span>
            </label>
            <input
              id="xmr-height"
              type="number"
              placeholder="Block height (e.g., 2800000)"
              value={restoreHeight}
              onChange={(e) => setRestoreHeight(e.target.value)}
              min="0"
            />
            <span className="xmr-hint">Speeds up initial sync if you know when your wallet was created</span>
          </div>

          {error && (
            <div className="xmr-error-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        <div className="xmr-footer">
          <button className="xmr-btn xmr-btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button 
            className="xmr-btn xmr-btn-primary" 
            onClick={handleSave} 
            disabled={loading || !canSubmit}
          >
            {loading ? (
              <>
                <span className="xmr-spinner" />
                Saving...
              </>
            ) : (
              'Import Wallet'
            )}
          </button>
        </div>

        <style>{`
          .xmr-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
            animation: xmr-fade-in 0.15s ease-out;
          }
          @keyframes xmr-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .xmr-modal {
            background: var(--bg-primary, #ffffff);
            border-radius: 16px;
            width: 92%;
            max-width: 400px;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
            animation: xmr-slide-up 0.2s ease-out;
          }
          @keyframes xmr-slide-up {
            from { opacity: 0; transform: translateY(10px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .xmr-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            padding: 20px 20px 16px;
            border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.08));
          }
          .xmr-title-group {
            display: flex;
            gap: 14px;
            align-items: center;
          }
          .xmr-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #ff6600 0%, #ff8533 100%);
            box-shadow: 0 4px 12px rgba(255, 102, 0, 0.3);
          }
          .xmr-icon svg {
            width: 24px;
            height: 24px;
          }
          .xmr-header h2 {
            margin: 0;
            font-family: var(--font-sans);
            font-size: 17px;
            font-weight: 600;
            color: var(--text-primary, #1a1a1a);
            letter-spacing: -0.01em;
          }
          .xmr-subtitle {
            margin: 2px 0 0;
            font-family: var(--font-sans);
            font-size: 12px;
            color: var(--text-muted, #888);
          }
          .xmr-close {
            background: var(--bg-secondary, #f5f5f5);
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text-muted, #666);
            transition: all 0.15s;
            flex-shrink: 0;
          }
          .xmr-close:hover {
            background: var(--bg-tertiary, #eaeaea);
            color: var(--text-primary, #333);
          }
          .xmr-body {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
          }
          .xmr-notice {
            display: flex;
            gap: 10px;
            padding: 12px 14px;
            background: var(--bg-secondary, #f8f9fa);
            border-radius: 10px;
            margin-bottom: 20px;
            border: 1px solid var(--border-color, rgba(0,0,0,0.06));
          }
          .xmr-notice svg {
            flex-shrink: 0;
            color: var(--text-muted, #888);
            margin-top: 1px;
          }
          .xmr-notice p {
            margin: 0;
            font-family: var(--font-sans);
            font-size: 12px;
            color: var(--text-secondary, #666);
            line-height: 1.5;
          }
          .xmr-field {
            margin-bottom: 18px;
          }
          .xmr-field:last-of-type {
            margin-bottom: 0;
          }
          .xmr-field label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-family: var(--font-sans);
            font-size: 13px;
            font-weight: 500;
            color: var(--text-primary, #1a1a1a);
            margin-bottom: 8px;
          }
          .xmr-counter {
            font-family: var(--font-mono);
            font-size: 11px;
            font-weight: 400;
            color: var(--text-muted, #999);
            font-variant-numeric: tabular-nums;
          }
          .xmr-counter.invalid {
            color: #e53935;
          }
          .xmr-opt-tag {
            font-family: var(--font-sans);
            font-size: 10px;
            font-weight: 500;
            color: var(--text-muted, #999);
            background: var(--bg-secondary, #f0f0f0);
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
          }
          .xmr-field input,
          .xmr-field textarea {
            width: 100%;
            padding: 12px 14px;
            border: 1.5px solid var(--border-color, #e0e0e0);
            border-radius: 10px;
            font-size: 13px;
            font-family: var(--font-mono);
            background: var(--bg-primary, #fff);
            color: var(--text-primary, #1a1a1a);
            transition: all 0.15s;
            box-sizing: border-box;
          }
          .xmr-field textarea {
            resize: none;
            min-height: 64px;
            line-height: 1.5;
          }
          .xmr-field input::placeholder,
          .xmr-field textarea::placeholder {
            color: var(--text-muted, #bbb);
          }
          .xmr-field input:focus,
          .xmr-field textarea:focus {
            outline: none;
            border-color: #ff6600;
            box-shadow: 0 0 0 3px rgba(255, 102, 0, 0.12);
          }
          .xmr-field input.invalid,
          .xmr-field textarea.invalid {
            border-color: #e53935;
          }
          .xmr-field input.invalid:focus,
          .xmr-field textarea.invalid:focus {
            box-shadow: 0 0 0 3px rgba(229, 57, 53, 0.12);
          }
          .xmr-input-wrap {
            position: relative;
          }
          .xmr-input-wrap input {
            padding-right: 44px;
          }
          .xmr-toggle-vis {
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            padding: 8px;
            cursor: pointer;
            color: var(--text-muted, #888);
            border-radius: 6px;
            transition: all 0.15s;
          }
          .xmr-toggle-vis:hover {
            color: var(--text-primary, #333);
            background: var(--bg-secondary, #f5f5f5);
          }
          .xmr-error {
            display: block;
            font-family: var(--font-sans);
            font-size: 11px;
            color: #e53935;
            margin-top: 6px;
          }
          .xmr-hint {
            display: block;
            font-family: var(--font-sans);
            font-size: 11px;
            color: var(--text-muted, #999);
            margin-top: 6px;
          }
          .xmr-optional label {
            color: var(--text-secondary, #666);
          }
          .xmr-error-box {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 16px;
            padding: 12px 14px;
            background: rgba(229, 57, 53, 0.08);
            border: 1px solid rgba(229, 57, 53, 0.2);
            border-radius: 10px;
            font-family: var(--font-sans);
            font-size: 13px;
            color: #c62828;
          }
          .xmr-error-box svg {
            flex-shrink: 0;
          }
          .xmr-footer {
            display: flex;
            gap: 10px;
            padding: 16px 20px 20px;
            border-top: 1px solid var(--border-color, rgba(0,0,0,0.06));
          }
          .xmr-btn {
            flex: 1;
            padding: 12px 16px;
            border: none;
            border-radius: 10px;
            font-family: var(--font-sans);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          .xmr-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .xmr-btn-primary {
            background: linear-gradient(135deg, #ff6600 0%, #ff7a1a 100%);
            color: white;
            box-shadow: 0 2px 8px rgba(255, 102, 0, 0.3);
          }
          .xmr-btn-primary:hover:not(:disabled) {
            background: linear-gradient(135deg, #e55a00 0%, #ff6600 100%);
            box-shadow: 0 4px 12px rgba(255, 102, 0, 0.4);
            transform: translateY(-1px);
          }
          .xmr-btn-primary:active:not(:disabled) {
            transform: translateY(0);
          }
          .xmr-btn-secondary {
            background: var(--bg-secondary, #f5f5f5);
            color: var(--text-primary, #333);
          }
          .xmr-btn-secondary:hover:not(:disabled) {
            background: var(--bg-tertiary, #eaeaea);
          }
          .xmr-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: xmr-spin 0.8s linear infinite;
          }
          @keyframes xmr-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default MoneroSetupModal;
