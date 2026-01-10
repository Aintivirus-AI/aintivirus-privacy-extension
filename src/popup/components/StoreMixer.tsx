import React, { useState, useEffect } from 'react';
import type { WalletState } from '@shared/types';
import { getMixerNotes, type MixerNote } from '../utils/storeApi';
import StoreMixerDeposit from './StoreMixerDeposit';
import StoreMixerWithdraw from './StoreMixerWithdraw';
import StoreMixerNotes from './StoreMixerNotes';

export type MixerMode = 'ETH-ETH' | 'SOL-SOL' | 'ETH-SOL' | 'SOL-ETH';
export type MixerView = 'main' | 'deposit' | 'notes' | 'withdraw';

interface StoreMixerProps {
  walletState: WalletState | null;
  onUnlockWallet?: () => void;
}

const MIXER_MODES: { id: MixerMode; label: string; icon: string; desc: string }[] = [
  { id: 'ETH-ETH', label: 'ETH → ETH', icon: '⟲', desc: 'Mix on Ethereum' },
  { id: 'SOL-SOL', label: 'SOL → SOL', icon: '⟲', desc: 'Mix on Solana' },
  { id: 'ETH-SOL', label: 'ETH → SOL', icon: '→', desc: 'Cross-chain' },
  { id: 'SOL-ETH', label: 'SOL → ETH', icon: '→', desc: 'Cross-chain' },
];

const StoreMixer: React.FC<StoreMixerProps> = ({ walletState, onUnlockWallet }) => {
  const [view, setView] = useState<MixerView>('main');
  const [selectedMode, setSelectedMode] = useState<MixerMode | null>(null);
  const [notes, setNotes] = useState<MixerNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<MixerNote | null>(null);

  // Load notes on mount
  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const loadedNotes = await getMixerNotes();
      setNotes(loadedNotes);
    } catch (err) {
      console.error('Failed to load mixer notes:', err);
    }
  };

  const handleModeSelect = (mode: MixerMode) => {
    setSelectedMode(mode);
    setView('deposit');
  };

  const handleDepositSuccess = () => {
    loadNotes();
    setView('notes');
    setSelectedMode(null);
  };

  const handleWithdrawSuccess = () => {
    loadNotes();
    setView('notes');
    setSelectedNote(null);
  };

  const handleNoteSelect = (note: MixerNote) => {
    if (note.withdrawn) return;
    setSelectedNote(note);
    setView('withdraw');
  };

  const activeNotes = notes.filter((n) => !n.withdrawn);

  // Render sub-views
  if (view === 'deposit' && selectedMode) {
    return (
      <StoreMixerDeposit
        mode={selectedMode}
        walletState={walletState}
        onUnlockWallet={onUnlockWallet}
        onBack={() => {
          setView('main');
          setSelectedMode(null);
        }}
        onSuccess={handleDepositSuccess}
      />
    );
  }

  if (view === 'withdraw' && selectedNote) {
    return (
      <StoreMixerWithdraw
        note={selectedNote}
        walletState={walletState}
        onUnlockWallet={onUnlockWallet}
        onBack={() => {
          setView('main');
          setSelectedNote(null);
        }}
        onSuccess={handleWithdrawSuccess}
      />
    );
  }

  if (view === 'notes') {
    return (
      <StoreMixerNotes
        notes={notes}
        onBack={() => setView('main')}
        onNoteSelect={handleNoteSelect}
        onRefresh={loadNotes}
      />
    );
  }

  // Main view - mode selection
  return (
    <div className="mixer-container">
      <div className="mixer-header">
        <h3 className="mixer-title">Privacy Mixer</h3>
        <p className="mixer-subtitle">
          Mix your assets for enhanced privacy
        </p>
      </div>

      {/* Mixer Tabs */}
      <div className="mixer-tabs">
        <button
          className="mixer-tab active"
          onClick={() => setView('main')}
        >
          Deposit
        </button>
        <button
          className="mixer-tab"
          onClick={() => setView('notes')}
        >
          Withdraw {activeNotes.length > 0 && `(${activeNotes.length})`}
        </button>
      </div>

      {/* Mode Selection Grid */}
      <div className="mixer-mode-selector">
        {MIXER_MODES.map((mode) => (
          <button
            key={mode.id}
            className={`mixer-mode-btn ${selectedMode === mode.id ? 'selected' : ''}`}
            onClick={() => handleModeSelect(mode.id)}
          >
            <span className="mixer-mode-icon">{mode.icon}</span>
            <span className="mixer-mode-label">{mode.label}</span>
            <span className="mixer-mode-desc">{mode.desc}</span>
          </button>
        ))}
      </div>

      {/* Warning */}
      <div className="mixer-warning">
        <span className="mixer-warning-icon">⚠️</span>
        <span className="mixer-warning-text">
          Keep your deposit note safe! You'll need it to withdraw your funds.
          Losing the note means losing access to your deposited funds.
        </span>
      </div>

      {/* Wallet Status */}
      {!walletState && (
        <div className="store-wallet-locked">
          <div className="store-wallet-warning">
            <span>🔒</span>
            <span>Wallet is locked. Unlock to use the mixer.</span>
          </div>
          {onUnlockWallet && (
            <button className="store-unlock-btn" onClick={onUnlockWallet}>
              Unlock Wallet
            </button>
          )}
        </div>
      )}

      {walletState && (
        <div className="mixer-info-box">
          <div className="mixer-info-row">
            <span className="mixer-info-label">Connected Wallet</span>
            <span className="mixer-info-value">
              {(walletState.activeChain === 'solana' ? walletState.publicAddress : walletState.evmAddress)?.slice(0, 6)}...
              {(walletState.activeChain === 'solana' ? walletState.publicAddress : walletState.evmAddress)?.slice(-4)}
            </span>
          </div>
          <div className="mixer-info-row">
            <span className="mixer-info-label">Chain</span>
            <span className="mixer-info-value">
              {walletState.activeChain === 'solana' ? 'Solana' : 'Ethereum'}
            </span>
          </div>
          {activeNotes.length > 0 && (
            <div className="mixer-info-row">
              <span className="mixer-info-label">Active Notes</span>
              <span className="mixer-info-value">{activeNotes.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StoreMixer;
