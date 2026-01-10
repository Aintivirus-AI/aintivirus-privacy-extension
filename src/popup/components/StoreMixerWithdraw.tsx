import React, { useState, useCallback } from 'react';
import type { WalletState } from '@shared/types';
import { markNoteWithdrawn, type MixerNote } from '../utils/storeApi';

interface StoreMixerWithdrawProps {
  note: MixerNote;
  walletState: WalletState | null;
  onUnlockWallet?: () => void;
  onBack: () => void;
  onSuccess: () => void;
}

const StoreMixerWithdraw: React.FC<StoreMixerWithdrawProps> = ({
  note,
  walletState,
  onUnlockWallet,
  onBack,
  onSuccess,
}) => {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState<'form' | 'processing' | 'success'>('form');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const targetChainLabel = note.targetChain === 'evm' ? 'Ethereum' : 'Solana';
  const targetToken = note.targetChain === 'evm' ? 'ETH' : 'SOL';

  // Basic address validation
  const isValidAddress = useCallback((address: string, chain: string) => {
    if (!address) return false;
    if (chain === 'evm') {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    } else {
      // Solana addresses are base58 encoded, 32-44 characters
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }
  }, []);

  const handleWithdraw = useCallback(async () => {
    if (!walletState || !recipientAddress) return;
    if (!isValidAddress(recipientAddress, note.targetChain)) {
      setError(`Invalid ${targetChainLabel} address`);
      return;
    }

    setIsWithdrawing(true);
    setError(null);
    setWithdrawStep('processing');

    try {
      // In production, this would:
      // 1. Generate a ZK proof using the secret/nullifier
      // 2. Call the mixer contract's withdraw function
      // For now, we simulate the withdrawal
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Generate a mock transaction hash
      const mockTxHash = '0x' + Array.from({ length: 64 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      setTxHash(mockTxHash);

      // Mark the note as withdrawn
      await markNoteWithdrawn(note.id, mockTxHash);
      
      setWithdrawStep('success');
    } catch (err) {
      console.error('Withdrawal failed:', err);
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
      setWithdrawStep('form');
    } finally {
      setIsWithdrawing(false);
    }
  }, [walletState, recipientAddress, note, targetChainLabel, isValidAddress]);

  // Success view
  if (withdrawStep === 'success') {
    return (
      <div className="mixer-container">
        <div className="order-modal">
          <div className="order-modal-icon success">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          </div>
          <h3 className="order-modal-title">Withdrawal Successful!</h3>
          <p className="order-modal-message">
            {note.amount} {targetToken} has been sent to your address.
          </p>
          {txHash && (
            <div className="mixer-note-display">
              <div className="mixer-note-label">Transaction Hash</div>
              <div className="mixer-note-value">{txHash}</div>
            </div>
          )}
          <button className="order-modal-btn" onClick={onSuccess}>
            Done
          </button>
        </div>
      </div>
    );
  }

  // Processing view
  if (withdrawStep === 'processing') {
    return (
      <div className="mixer-container">
        <div className="payment-processing">
          <div className="payment-processing-spinner" />
          <p className="payment-processing-text">
            Generating proof and processing withdrawal...
          </p>
          <p className="payment-processing-text" style={{ fontSize: '12px', marginTop: '8px' }}>
            This may take a moment
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mixer-container">
      <div className="payment-header">
        <button className="payment-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="payment-title">Withdraw Funds</h3>
      </div>

      {/* Note Info */}
      <div className="mixer-info-box">
        <div className="mixer-info-row">
          <span className="mixer-info-label">Amount</span>
          <span className="mixer-info-value">{note.amount} {note.mode}</span>
        </div>
        <div className="mixer-info-row">
          <span className="mixer-info-label">Target Chain</span>
          <span className="mixer-info-value">{targetChainLabel}</span>
        </div>
        <div className="mixer-info-row">
          <span className="mixer-info-label">You Receive</span>
          <span className="mixer-info-value">{note.amount} {targetToken}</span>
        </div>
      </div>

      {/* Recipient Address */}
      <div className="giftcard-select-group">
        <label className="giftcard-label">Recipient Address ({targetChainLabel})</label>
        <input
          type="text"
          className="mixer-recipient-input"
          placeholder={note.targetChain === 'evm' 
            ? '0x...' 
            : 'Enter Solana address'
          }
          value={recipientAddress}
          onChange={(e) => {
            setRecipientAddress(e.target.value);
            setError(null);
          }}
        />
        {recipientAddress && !isValidAddress(recipientAddress, note.targetChain) && (
          <span className="giftcard-amount-range" style={{ color: '#ef4444' }}>
            Invalid {targetChainLabel} address format
          </span>
        )}
      </div>

      {/* Use connected wallet button */}
      {walletState && walletState.activeChain === (note.targetChain === 'evm' ? 'evm' : 'solana') && (
        <button
          className="mixer-amount-btn"
          style={{ width: '100%', marginBottom: '8px' }}
          onClick={() => {
            const addr = walletState.activeChain === 'solana' 
              ? walletState.publicAddress 
              : walletState.evmAddress;
            if (addr) setRecipientAddress(addr);
          }}
        >
          Use Connected Wallet (
          {(walletState.activeChain === 'solana' ? walletState.publicAddress : walletState.evmAddress)?.slice(0, 6)}...
          {(walletState.activeChain === 'solana' ? walletState.publicAddress : walletState.evmAddress)?.slice(-4)}
          )
        </button>
      )}

      {/* Warning */}
      <div className="mixer-warning">
        <span className="mixer-warning-icon">⚠️</span>
        <span className="mixer-warning-text">
          Double-check the recipient address. Withdrawals cannot be reversed!
        </span>
      </div>

      {error && (
        <div className="store-error">
          <span>{error}</span>
        </div>
      )}

      {!walletState && (
        <div className="store-wallet-locked">
          <div className="store-wallet-warning">
            <span>🔒</span>
            <span>Wallet is locked. Unlock to withdraw.</span>
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
        onClick={handleWithdraw}
        disabled={
          isWithdrawing || 
          !walletState || 
          !recipientAddress || 
          !isValidAddress(recipientAddress, note.targetChain)
        }
      >
        {isWithdrawing ? 'Processing...' : `Withdraw ${note.amount} ${targetToken}`}
      </button>
    </div>
  );
};

export default StoreMixerWithdraw;
