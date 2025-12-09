import React, { useState, useMemo } from 'react';
import type { EVMPendingTxInfo, EVMChainId } from '@shared/types';
import { SpeedUpModal } from './SpeedUpModal';
import { CancelModal } from './CancelModal';
import { ExplorerLinkIcon } from './ExplorerLinkIcon';
import { TxStatusBadge } from './TxStatusBadge';
import { TxConfirmationProgress } from './TxConfirmationProgress';
import {
  mapEVMStatus,
  getEVMProgress,
  type TxDisplayStatus,
  type EVMConfirmationProgress,
} from '@wallet/txStatus';


export interface TxDetailsDrawerProps {
  tx: EVMPendingTxInfo;
  onClose: () => void;
  onTxReplaced?: (oldHash: string, newHash: string) => void;
}


function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}


function estimateConfirmations(tx: EVMPendingTxInfo): number {
  if (tx.status !== 'mined') return 0;
  
  const secondsSinceMined = Math.floor((Date.now() - tx.submittedAt) / 1000);
  return Math.max(0, Math.floor(secondsSinceMined / 12));
}


export function TxDetailsDrawer({ tx, onClose, onTxReplaced }: TxDetailsDrawerProps) {
  const [showSpeedUp, setShowSpeedUp] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  
  const confirmations = useMemo(() => estimateConfirmations(tx), [tx]);
  
  const displayStatus: TxDisplayStatus = useMemo(() => {
    return mapEVMStatus(
      tx.status as 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced',
      confirmations,
      tx.chainId,
      tx.submittedAt
    );
  }, [tx.status, confirmations, tx.chainId, tx.submittedAt]);

  const progress: EVMConfirmationProgress = useMemo(() => {
    return getEVMProgress(confirmations, tx.chainId);
  }, [confirmations, tx.chainId]);

  const isPending = tx.status === 'pending';
  const showProgress = displayStatus === 'pending' || displayStatus === 'confirming';

  const handleSpeedUpSuccess = (newHash: string) => {
    setShowSpeedUp(false);
    onTxReplaced?.(tx.hash, newHash);
    onClose();
  };

  const handleCancelSuccess = (newHash: string) => {
    setShowCancel(false);
    onTxReplaced?.(tx.hash, newHash);
    onClose();
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose}>
        <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
          {}
          <div className="drawer-header">
            <h2>Transaction Details</h2>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>

          {}
          <div className="status-section">
            <TxStatusBadge
              status={displayStatus}
              size="lg"
              progress={progress}
            />
            {isPending && (
              <span className="pending-note">
                Transaction is waiting to be included in a block
              </span>
            )}
          </div>

          {}
          {showProgress && (
            <div className="confirmation-progress-section">
              <TxConfirmationProgress
                chainType="evm"
                status={displayStatus}
                progress={progress}
                chainId={tx.chainId}
                detailed={true}
              />
            </div>
          )}

          {}
          <div className="details-grid">
            <div className="detail-row">
              <span className="label">Hash</span>
              <div className="value-row">
                <span className="value monospace">{tx.hash}</span>
                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(tx.hash)}
                >
                  📋
                </button>
                <ExplorerLinkIcon
                  type="tx"
                  id={tx.hash}
                  chain="evm"
                  evmChainId={tx.chainId}
                  testnet={tx.testnet}
                  size={14}
                  title="View transaction on explorer"
                />
              </div>
            </div>

            <div className="detail-row">
              <span className="label">Nonce</span>
              <span className="value">#{tx.nonce}</span>
            </div>

            <div className="detail-row">
              <span className="label">From</span>
              <div className="value-row">
                <span className="value monospace">{tx.from}</span>
                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(tx.from)}
                >
                  📋
                </button>
                <ExplorerLinkIcon
                  type="address"
                  id={tx.from}
                  chain="evm"
                  evmChainId={tx.chainId}
                  testnet={tx.testnet}
                  size={14}
                  title="View sender on explorer"
                />
              </div>
            </div>

            <div className="detail-row">
              <span className="label">To</span>
              <div className="value-row">
                <span className="value monospace">{tx.to}</span>
                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(tx.to)}
                >
                  📋
                </button>
                <ExplorerLinkIcon
                  type="address"
                  id={tx.to}
                  chain="evm"
                  evmChainId={tx.chainId}
                  testnet={tx.testnet}
                  size={14}
                  title="View recipient on explorer"
                />
              </div>
            </div>

            <div className="detail-row">
              <span className="label">Value</span>
              <span className="value">{tx.valueFormatted} ETH</span>
            </div>

            <div className="detail-row">
              <span className="label">Max Fee</span>
              <span className="value">{tx.maxFeeGwei.toFixed(2)} gwei</span>
            </div>

            <div className="detail-row">
              <span className="label">Priority Fee</span>
              <span className="value">{tx.maxPriorityFeeGwei.toFixed(2)} gwei</span>
            </div>

            <div className="detail-row">
              <span className="label">Submitted</span>
              <span className="value">{formatDate(tx.submittedAt)}</span>
            </div>

            <div className="detail-row">
              <span className="label">Chain</span>
              <span className="value">{tx.chainId} {tx.testnet ? '(Testnet)' : ''}</span>
            </div>

            {tx.replacedBy && (
              <div className="detail-row">
                <span className="label">Replaced By</span>
                <span className="value monospace">{tx.replacedBy}</span>
              </div>
            )}

            {tx.errorReason && (
              <div className="detail-row">
                <span className="label">Error</span>
                <span className="value error">{tx.errorReason}</span>
              </div>
            )}
          </div>

          {}
          <div className="drawer-actions">
            <ExplorerLinkIcon
              type="tx"
              id={tx.hash}
              chain="evm"
              evmChainId={tx.chainId}
              testnet={tx.testnet}
              variant="button"
              label="View on Explorer"
              className="btn secondary"
            />

            {isPending && (
              <>
                <button
                  className="btn primary"
                  onClick={() => setShowSpeedUp(true)}
                >
                  ⚡ Speed Up
                </button>
                <button
                  className="btn danger"
                  onClick={() => setShowCancel(true)}
                >
                  ✕ Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {}
      {showSpeedUp && (
        <SpeedUpModal
          tx={tx}
          onClose={() => setShowSpeedUp(false)}
          onSuccess={handleSpeedUpSuccess}
        />
      )}

      {showCancel && (
        <CancelModal
          tx={tx}
          onClose={() => setShowCancel(false)}
          onSuccess={handleCancelSuccess}
        />
      )}

      <style>{`
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 1000;
        }
        .drawer-content {
          background: white;
          border-radius: 16px 16px 0 0;
          width: 100%;
          max-width: 480px;
          max-height: 85vh;
          overflow-y: auto;
          animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid #eee;
          position: sticky;
          top: 0;
          background: white;
        }
        .drawer-header h2 {
          margin: 0;
          font-size: 18px;
        }
        .close-btn {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #666;
          padding: 4px 8px;
        }
        .status-section {
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #eee;
        }
        .pending-note {
          font-size: 12px;
          color: #666;
          text-align: center;
        }
        .confirmation-progress-section {
          padding: 0 16px 16px;
          border-bottom: 1px solid #eee;
        }
        .details-grid {
          padding: 16px;
        }
        .detail-row {
          padding: 12px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-row .label {
          display: block;
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }
        .detail-row .value {
          font-size: 14px;
          font-weight: 500;
          word-break: break-all;
        }
        .detail-row .value.error {
          color: #d9534f;
        }
        .value-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .value-row .value {
          flex: 1;
        }
        .copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 2px;
          opacity: 0.6;
        }
        .copy-btn:hover {
          opacity: 1;
        }
        .monospace {
          font-family: monospace;
          font-size: 12px;
        }
        .drawer-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 16px;
          border-top: 1px solid #eee;
          position: sticky;
          bottom: 0;
          background: white;
        }
        .btn {
          flex: 1;
          min-width: calc(50% - 4px);
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          text-decoration: none;
        }
        .btn.primary {
          background: #007bff;
          color: white;
        }
        .btn.primary:hover {
          background: #0056b3;
        }
        .btn.secondary {
          background: #f0f0f0;
          color: #333;
        }
        .btn.secondary:hover {
          background: #e0e0e0;
        }
        .btn.danger {
          background: #fee;
          color: #d9534f;
        }
        .btn.danger:hover {
          background: #d9534f;
          color: white;
        }
      `}</style>
    </>
  );
}

export default TxDetailsDrawer;
