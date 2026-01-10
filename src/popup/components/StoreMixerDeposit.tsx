import React, { useState, useCallback } from 'react';
import type { WalletState } from '@shared/types';
import type { MixerMode } from './StoreMixer';
import {
  saveMixerNote,
  generateOrderId,
  type MixerNote,
} from '../utils/storeApi';

interface StoreMixerDepositProps {
  mode: MixerMode;
  walletState: WalletState | null;
  onUnlockWallet?: () => void;
  onBack: () => void;
  onSuccess: () => void;
}

// Predefined amounts for the mixer (in native token units)
const AMOUNTS: { value: string; label: string }[] = [
  { value: '0.1', label: '0.1' },
  { value: '0.5', label: '0.5' },
  { value: '1', label: '1' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '100', label: '100' },
];

/**
 * Generate cryptographic secret and nullifier
 * In production, use the mixer SDK's generateSecretAndNullifier
 */
function generateSecretAndNullifier(): { secret: string; nullifier: string } {
  const randomBytes = (length: number): string => {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  return {
    secret: '0x' + randomBytes(32),
    nullifier: '0x' + randomBytes(32),
  };
}

/**
 * Compute commitment from secret and nullifier
 * In production, use the mixer SDK's computeCommitment with Poseidon hash
 */
function computeCommitment(secret: string, nullifier: string): string {
  // Simple hash for demo - in production use Poseidon hash
  const combined = secret + nullifier;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
}

const StoreMixerDeposit: React.FC<StoreMixerDepositProps> = ({
  mode,
  walletState,
  onUnlockWallet,
  onBack,
  onSuccess,
}) => {
  const [selectedAmount, setSelectedAmount] = useState<string>('1');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'form' | 'confirm' | 'processing' | 'success'>('form');
  const [generatedNote, setGeneratedNote] = useState<{
    secret: string;
    nullifier: string;
    commitment: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const sourceChain = mode.startsWith('ETH') ? 'evm' : 'solana';
  const targetChain = mode.endsWith('ETH') ? 'evm' : 'solana';
  const sourceToken = mode.startsWith('ETH') ? 'ETH' : 'SOL';

  const handleGenerateNote = useCallback(() => {
    const { secret, nullifier } = generateSecretAndNullifier();
    const commitment = computeCommitment(secret, nullifier);
    setGeneratedNote({ secret, nullifier, commitment });
    setDepositStep('confirm');
  }, []);

  const handleDeposit = useCallback(async () => {
    if (!walletState || !generatedNote) return;

    setIsDepositing(true);
    setError(null);
    setDepositStep('processing');

    try {
      // In production, this would call the actual mixer SDK
      // For now, we simulate the deposit
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Generate a mock transaction hash
      const mockTxHash = '0x' + Array.from({ length: 64 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      setTxHash(mockTxHash);

      // Save the note to storage
      const note: MixerNote = {
        id: generateOrderId(),
        secret: generatedNote.secret,
        nullifier: generatedNote.nullifier,
        commitment: generatedNote.commitment,
        amount: selectedAmount,
        mode: sourceToken === 'ETH' ? 'ETH' : 'SOL',
        sourceChain,
        targetChain,
        depositTxHash: mockTxHash,
        createdAt: Date.now(),
        withdrawn: false,
      };

      await saveMixerNote(note);
      setDepositStep('success');
    } catch (err) {
      console.error('Deposit failed:', err);
      setError(err instanceof Error ? err.message : 'Deposit failed');
      setDepositStep('confirm');
    } finally {
      setIsDepositing(false);
    }
  }, [walletState, generatedNote, selectedAmount, sourceToken, sourceChain, targetChain]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Success view
  if (depositStep === 'success') {
    return (
      <div className="mixer-container">
        <div className="order-modal">
          <div className="order-modal-icon success">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          </div>
          <h3 className="order-modal-title">Deposit Successful!</h3>
          <p className="order-modal-message">
            Your {selectedAmount} {sourceToken} has been deposited. Save your note securely!
          </p>
          {txHash && (
            <div className="mixer-note-display">
              <div className="mixer-note-label">Transaction Hash</div>
              <div className="mixer-note-value">{txHash}</div>
            </div>
          )}
          <button className="order-modal-btn" onClick={onSuccess}>
            View My Notes
          </button>
        </div>
      </div>
    );
  }

  // Processing view
  if (depositStep === 'processing') {
    return (
      <div className="mixer-container">
        <div className="payment-processing">
          <div className="payment-processing-spinner" />
          <p className="payment-processing-text">
            Processing deposit...
          </p>
        </div>
      </div>
    );
  }

  // Confirm view
  if (depositStep === 'confirm' && generatedNote) {
    return (
      <div className="mixer-container">
        <div className="payment-header">
          <button className="payment-back-btn" onClick={() => setDepositStep('form')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="payment-title">Confirm Deposit</h3>
        </div>

        <div className="mixer-info-box">
          <div className="mixer-info-row">
            <span className="mixer-info-label">Amount</span>
            <span className="mixer-info-value">{selectedAmount} {sourceToken}</span>
          </div>
          <div className="mixer-info-row">
            <span className="mixer-info-label">Mode</span>
            <span className="mixer-info-value">{mode}</span>
          </div>
        </div>

        <div className="mixer-warning">
          <span className="mixer-warning-icon">⚠️</span>
          <span className="mixer-warning-text">
            <strong>IMPORTANT:</strong> Your deposit note is shown below. 
            Copy and save it securely. You will need it to withdraw your funds!
          </span>
        </div>

        <div className="mixer-note-display">
          <div className="mixer-note-label">
            Secret (click to copy)
          </div>
          <div 
            className="mixer-note-value" 
            onClick={() => copyToClipboard(generatedNote.secret)}
            style={{ cursor: 'pointer' }}
          >
            {generatedNote.secret.slice(0, 20)}...{generatedNote.secret.slice(-10)}
          </div>
        </div>

        <div className="mixer-note-display">
          <div className="mixer-note-label">
            Nullifier (click to copy)
          </div>
          <div 
            className="mixer-note-value" 
            onClick={() => copyToClipboard(generatedNote.nullifier)}
            style={{ cursor: 'pointer' }}
          >
            {generatedNote.nullifier.slice(0, 20)}...{generatedNote.nullifier.slice(-10)}
          </div>
        </div>

        <div className="mixer-note-display">
          <div className="mixer-note-label">
            Full Note (click to copy all)
          </div>
          <div 
            className="mixer-note-value" 
            onClick={() => copyToClipboard(JSON.stringify(generatedNote))}
            style={{ cursor: 'pointer' }}
          >
            Click to copy full note data
          </div>
        </div>

        {error && (
          <div className="store-error">
            <span>{error}</span>
          </div>
        )}

        <button
          className="mixer-action-btn"
          onClick={handleDeposit}
          disabled={isDepositing || !walletState}
        >
          {isDepositing ? 'Depositing...' : `Deposit ${selectedAmount} ${sourceToken}`}
        </button>
      </div>
    );
  }

  // Form view
  return (
    <div className="mixer-container">
      <div className="payment-header">
        <button className="payment-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="payment-title">Deposit - {mode}</h3>
      </div>

      <div className="mixer-amount-section">
        <span className="mixer-amount-label">Select Amount ({sourceToken})</span>
        <div className="mixer-amount-grid">
          {AMOUNTS.map((amt) => (
            <button
              key={amt.value}
              className={`mixer-amount-btn ${selectedAmount === amt.value ? 'selected' : ''}`}
              onClick={() => setSelectedAmount(amt.value)}
            >
              {amt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mixer-info-box">
        <div className="mixer-info-row">
          <span className="mixer-info-label">Deposit Amount</span>
          <span className="mixer-info-value">{selectedAmount} {sourceToken}</span>
        </div>
        <div className="mixer-info-row">
          <span className="mixer-info-label">Source Chain</span>
          <span className="mixer-info-value">
            {sourceChain === 'evm' ? 'Ethereum' : 'Solana'}
          </span>
        </div>
        <div className="mixer-info-row">
          <span className="mixer-info-label">Target Chain</span>
          <span className="mixer-info-value">
            {targetChain === 'evm' ? 'Ethereum' : 'Solana'}
          </span>
        </div>
        <div className="mixer-info-row">
          <span className="mixer-info-label">Fee</span>
          <span className="mixer-info-value">0.3%</span>
        </div>
      </div>

      {!walletState && (
        <div className="store-wallet-locked">
          <div className="store-wallet-warning">
            <span>🔒</span>
            <span>Wallet is locked. Unlock to deposit.</span>
          </div>
          {onUnlockWallet && (
            <button className="store-unlock-btn" onClick={onUnlockWallet}>
              Unlock Wallet
            </button>
          )}
        </div>
      )}

      <button
        className="mixer-action-btn"
        onClick={handleGenerateNote}
        disabled={!walletState}
      >
        Generate Note & Continue
      </button>
    </div>
  );
};

export default StoreMixerDeposit;
