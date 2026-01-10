import React from 'react';
import type { MixerNote } from '../utils/storeApi';

interface StoreMixerNotesProps {
  notes: MixerNote[];
  onBack: () => void;
  onNoteSelect: (note: MixerNote) => void;
  onRefresh: () => void;
}

const StoreMixerNotes: React.FC<StoreMixerNotesProps> = ({
  notes,
  onBack,
  onNoteSelect,
  onRefresh,
}) => {
  const activeNotes = notes.filter((n) => !n.withdrawn);
  const withdrawnNotes = notes.filter((n) => n.withdrawn);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getChainLabel = (chain: string) => {
    return chain === 'evm' ? 'Ethereum' : 'Solana';
  };

  const copyNoteData = (note: MixerNote) => {
    const noteData = {
      secret: note.secret,
      nullifier: note.nullifier,
      commitment: note.commitment,
      amount: note.amount,
      mode: note.mode,
      sourceChain: note.sourceChain,
      targetChain: note.targetChain,
    };
    navigator.clipboard.writeText(JSON.stringify(noteData, null, 2));
  };

  return (
    <div className="mixer-container">
      <div className="payment-header">
        <button className="payment-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="payment-title">My Deposit Notes</h3>
        <button 
          className="payment-back-btn" 
          onClick={onRefresh}
          style={{ marginLeft: 'auto' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="mixer-empty">
          <div className="mixer-empty-icon">📝</div>
          <p className="mixer-empty-text">
            No deposit notes found.<br />
            Make a deposit to get started!
          </p>
        </div>
      ) : (
        <>
          {/* Active Notes */}
          {activeNotes.length > 0 && (
            <>
              <div className="mixer-amount-label" style={{ marginBottom: '8px' }}>
                Available for Withdrawal ({activeNotes.length})
              </div>
              <div className="mixer-notes-list">
                {activeNotes.map((note) => (
                  <div
                    key={note.id}
                    className="mixer-note-card"
                    onClick={() => onNoteSelect(note)}
                  >
                    <div className="mixer-note-header">
                      <span className="mixer-note-amount">
                        {note.amount} {note.mode}
                      </span>
                      <span className="mixer-note-status active">Available</span>
                    </div>
                    <div className="mixer-note-details">
                      <div>
                        {getChainLabel(note.sourceChain)} → {getChainLabel(note.targetChain)}
                      </div>
                      <div>Deposited: {formatDate(note.createdAt)}</div>
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                      <button
                        className="mixer-amount-btn"
                        style={{ flex: 1, padding: '6px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyNoteData(note);
                        }}
                      >
                        Copy Note
                      </button>
                      <button
                        className="mixer-amount-btn selected"
                        style={{ flex: 1, padding: '6px' }}
                        onClick={() => onNoteSelect(note)}
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Withdrawn Notes */}
          {withdrawnNotes.length > 0 && (
            <>
              <div className="mixer-amount-label" style={{ marginTop: '16px', marginBottom: '8px' }}>
                Withdrawn ({withdrawnNotes.length})
              </div>
              <div className="mixer-notes-list">
                {withdrawnNotes.map((note) => (
                  <div
                    key={note.id}
                    className="mixer-note-card withdrawn"
                  >
                    <div className="mixer-note-header">
                      <span className="mixer-note-amount">
                        {note.amount} {note.mode}
                      </span>
                      <span className="mixer-note-status withdrawn">Withdrawn</span>
                    </div>
                    <div className="mixer-note-details">
                      <div>
                        {getChainLabel(note.sourceChain)} → {getChainLabel(note.targetChain)}
                      </div>
                      <div>Withdrawn: {note.withdrawnAt ? formatDate(note.withdrawnAt) : 'N/A'}</div>
                      {note.withdrawTxHash && (
                        <div style={{ fontSize: '10px', marginTop: '4px' }}>
                          Tx: {note.withdrawTxHash.slice(0, 10)}...{note.withdrawTxHash.slice(-6)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="mixer-warning" style={{ marginTop: '16px' }}>
        <span className="mixer-warning-icon">💡</span>
        <span className="mixer-warning-text">
          Always backup your notes externally. Click "Copy Note" to save the full note data.
        </span>
      </div>
    </div>
  );
};

export default StoreMixerNotes;
