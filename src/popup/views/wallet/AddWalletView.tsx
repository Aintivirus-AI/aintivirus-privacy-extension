/**
 * Add Wallet View - Create or import additional wallets
 */

import React, { useState } from 'react';
import { sendToBackground } from '@shared/messaging';
import { CloseIcon, EyeIcon, EyeOffIcon, WalletIcon } from '../../Icons';

export interface AddWalletViewProps {
  onClose: () => void;
  onComplete: () => void;
}

export const AddWalletView: React.FC<AddWalletViewProps> = ({ onClose, onComplete }) => {
  const [mode, setMode] = useState<'select' | 'create' | 'import' | 'importPrivateKey'>('select');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [label, setLabel] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);

  // No password needed - wallet is already unlocked when this view is accessible
  const handleCreate = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_ADD',
        payload: { label: label || undefined },
      });

      if (response.success && response.data) {
        const data = response.data as { mnemonic: string; publicAddress: string; walletId: string };
        setGeneratedMnemonic(data.mnemonic);
        setStep(2);
      } else {
        setError(response.error || 'Failed to create wallet');
      }
    } catch {
      setError('Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!mnemonic.trim()) {
      setError('Recovery phrase is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_IMPORT_ADD',
        payload: {
          mnemonic: mnemonic.trim(),
          label: label || undefined,
        },
      });

      if (response.success) {
        onComplete();
      } else {
        setError(response.error || 'Failed to import wallet');
      }
    } catch {
      setError('Failed to import wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleImportPrivateKey = async () => {
    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_IMPORT_PRIVATE_KEY',
        payload: {
          privateKey: privateKey.trim(),
          label: label || undefined,
        },
      });

      if (response.success) {
        onComplete();
      } else {
        setError(response.error || 'Failed to import wallet from private key');
      }
    } catch {
      setError('Failed to import wallet from private key');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'select') {
    return (
      <div className="add-wallet-view">
        <div className="form-header">
          <h3>Add Wallet</h3>
          <button className="close-btn" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="wallet-setup-actions">
          <button className="btn btn-primary btn-block" onClick={() => setMode('create')}>
            Create New Wallet
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setMode('import')}>
            Import with Recovery Phrase
          </button>
          <button
            className="btn btn-secondary btn-block"
            onClick={() => setMode('importPrivateKey')}
          >
            Import with Private Key
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    if (step === 1) {
      return (
        <div className="add-wallet-view">
          <div className="form-header">
            <h3>Create New Wallet</h3>
            <button className="close-btn" onClick={onClose}>
              <CloseIcon size={14} />
            </button>
          </div>
          <div className="unlock-form">
            <input
              type="text"
              className="form-input"
              placeholder="Wallet label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={32}
            />
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
            <button
              className="btn btn-secondary btn-block"
              onClick={() => {
                setMode('select');
                setError('');
              }}
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="add-wallet-view">
        <div className="form-header">
          <h3>Save Recovery Phrase</h3>
          <button className="close-btn" onClick={onComplete}>
            <CloseIcon size={14} />
          </button>
        </div>
        <p
          style={{ color: 'var(--warning)', marginBottom: 'var(--space-md)', fontSize: '0.75rem' }}
        >
          Write these words down and store them safely. Anyone with this phrase can access this
          wallet.
        </p>
        <div className="full-address" style={{ marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
          {generatedMnemonic}
        </div>
        <button className="btn btn-primary btn-block" onClick={onComplete}>
          I've Saved My Phrase
        </button>
      </div>
    );
  }

  if (mode === 'importPrivateKey') {
    return (
      <div className="add-wallet-view">
        <div className="form-header">
          <h3>Import Private Key</h3>
          <button className="close-btn" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="unlock-form">
          <input
            type="text"
            className="form-input"
            placeholder="Wallet label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={32}
          />
          <div className="password-input-wrapper">
            <input
              type={showPrivateKey ? 'text' : 'password'}
              className="form-input"
              placeholder="Enter private key (Base58 or Hex)"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              tabIndex={-1}
            >
              {showPrivateKey ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p
            style={{
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
              marginTop: '-8px',
              marginBottom: 'var(--space-sm)',
            }}
          >
            Accepts Solana (Base58/Hex) or EVM (0x hex) private keys
          </p>
          {error && <div className="form-error">{error}</div>}
          <button
            className="btn btn-primary btn-block"
            onClick={handleImportPrivateKey}
            disabled={loading || !privateKey}
          >
            {loading ? 'Importing...' : 'Import Wallet'}
          </button>
          <button
            className="btn btn-secondary btn-block"
            onClick={() => {
              setMode('select');
              setError('');
              setPrivateKey('');
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Import with recovery phrase
  return (
    <div className="add-wallet-view">
      <div className="form-header">
        <h3>Import Wallet</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="unlock-form">
        <input
          type="text"
          className="form-input"
          placeholder="Wallet label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={32}
        />
        <div className="password-input-wrapper">
          <textarea
            className={`form-input form-textarea modern-scroll ${showMnemonic ? '' : 'mask-text'}`}
            placeholder="Enter 12 or 24 word recovery phrase..."
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            rows={3}
            style={{ fontFamily: 'monospace' }}
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowMnemonic(!showMnemonic)}
            tabIndex={-1}
            style={{ top: '10px' }}
          >
            {showMnemonic ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button
          className="btn btn-primary btn-block"
          onClick={handleImport}
          disabled={loading || !mnemonic}
        >
          {loading ? 'Importing...' : 'Import Wallet'}
        </button>
        <button
          className="btn btn-secondary btn-block"
          onClick={() => {
            setMode('select');
            setError('');
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
};

export default AddWalletView;
