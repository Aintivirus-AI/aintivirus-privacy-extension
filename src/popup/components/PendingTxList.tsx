import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { sendToBackground } from '@shared/messaging';
import type { EVMPendingTxInfo, EVMChainId } from '@shared/types';
import { ExplorerLinkIcon } from './ExplorerLinkIcon';
import { TxStatusBadge, TxStatusDot } from './TxStatusBadge';
import { TxProgressIndicator } from './TxConfirmationProgress';
import {
  mapEVMStatus,
  getEVMProgress,
  type TxDisplayStatus,
} from '@wallet/txStatus';

// ============================================
// TYPES
// ============================================

export interface PendingTxListProps {
  chainId?: EVMChainId;
  address?: string;
  onSelectTx?: (tx: EVMPendingTxInfo) => void;
  onSpeedUp?: (tx: EVMPendingTxInfo) => void;
  onCancel?: (tx: EVMPendingTxInfo) => void;
  compact?: boolean;
}

// ============================================
// HELPERS
// ============================================

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function truncateHash(hash: string, chars: number = 6): string {
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/**
 * Map raw tx status to display status
 */
function getDisplayStatus(tx: EVMPendingTxInfo): TxDisplayStatus {
  // For mined transactions, estimate confirmations based on time
  const confirmations = tx.status === 'mined' 
    ? Math.max(0, Math.floor((Date.now() - tx.submittedAt) / 12000))
    : 0;
  
  return mapEVMStatus(
    tx.status as 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced',
    confirmations,
    tx.chainId,
    tx.submittedAt
  );
}

// ============================================
// COMPONENT
// ============================================

export function PendingTxList({
  chainId,
  address,
  onSelectTx,
  onSpeedUp,
  onCancel,
  compact = false,
}: PendingTxListProps) {
  const [transactions, setTransactions] = useState<EVMPendingTxInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    try {
      const response = await sendToBackground<EVMPendingTxInfo[]>({
        type: 'EVM_GET_PENDING_TXS',
        payload: { evmChainId: chainId, address },
      });

      if (response.success && response.data) {
        setTransactions(response.data);
      } else {
        setError(response.error || 'Failed to load transactions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [chainId, address]);

  // Initial load
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Auto-refresh every 15 seconds for pending txs
  useEffect(() => {
    const hasPending = transactions.some(tx => tx.status === 'pending');
    if (!hasPending) return;

    const interval = setInterval(loadTransactions, 15000);
    return () => clearInterval(interval);
  }, [transactions, loadTransactions]);

  if (loading) {
    return (
      <div className="pending-tx-list loading">
        <div className="spinner"></div>
        <span>Loading transactions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pending-tx-list error">
        <span>⚠️ {error}</span>
        <button onClick={loadTransactions}>Retry</button>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="pending-tx-list empty">
        <span>No pending transactions</span>
      </div>
    );
  }

  const pendingTxs = transactions.filter(tx => tx.status === 'pending');
  const recentTxs = transactions.filter(tx => tx.status !== 'pending').slice(0, 5);

  return (
    <div className={`pending-tx-list ${compact ? 'compact' : ''}`}>
      {/* Pending Section */}
      {pendingTxs.length > 0 && (
        <div className="tx-section">
          <h4 className="section-title">
            <TxStatusDot status="pending" size={8} />
            Pending ({pendingTxs.length})
          </h4>
          
          {pendingTxs.map((tx) => {
            const displayStatus = getDisplayStatus(tx);
            return (
              <div
                key={tx.hash}
                className="tx-item pending"
                onClick={() => onSelectTx?.(tx)}
              >
                <div className="tx-main">
                  <div className="tx-hash-row">
                    <span className="tx-hash">{truncateHash(tx.hash)}</span>
                    <span className="tx-nonce">#{tx.nonce}</span>
                    <TxStatusBadge status={displayStatus} size="sm" showLabel={false} />
                  </div>
                  
                  <div className="tx-details">
                    <span className="tx-value">{tx.valueFormatted} ETH</span>
                    <span className="tx-to">→ {truncateHash(tx.to, 4)}</span>
                  </div>
                  
                  <div className="tx-meta">
                    <span className="tx-time">{formatTimeAgo(tx.submittedAt)}</span>
                    <span className="tx-fee">{tx.maxFeeGwei.toFixed(1)} gwei</span>
                  </div>
                </div>

                <ExplorerLinkIcon
                  type="tx"
                  id={tx.hash}
                  chain="evm"
                  evmChainId={tx.chainId}
                  testnet={tx.testnet}
                  size={14}
                />

                {!compact && (onSpeedUp || onCancel) && (
                  <div className="tx-actions">
                    {onSpeedUp && (
                      <button
                        className="action-btn speed-up"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSpeedUp(tx);
                        }}
                      >
                        ⚡ Speed Up
                      </button>
                    )}
                    {onCancel && (
                      <button
                        className="action-btn cancel"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancel(tx);
                        }}
                      >
                        ✕ Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Section */}
      {recentTxs.length > 0 && !compact && (
        <div className="tx-section">
          <h4 className="section-title">Recent</h4>
          
          {recentTxs.map((tx) => {
            const displayStatus = getDisplayStatus(tx);
            return (
              <div
                key={tx.hash}
                className={`tx-item ${tx.status}`}
                onClick={() => onSelectTx?.(tx)}
              >
                <div className="tx-main">
                  <div className="tx-hash-row">
                    <span className="tx-hash">{truncateHash(tx.hash)}</span>
                    <TxStatusBadge status={displayStatus} size="sm" />
                  </div>
                  
                  <div className="tx-details">
                    <span className="tx-value">{tx.valueFormatted} ETH</span>
                    <span className="tx-time">{formatTimeAgo(tx.submittedAt)}</span>
                  </div>
                </div>

                <ExplorerLinkIcon
                  type="tx"
                  id={tx.hash}
                  chain="evm"
                  evmChainId={tx.chainId}
                  testnet={tx.testnet}
                  size={14}
                />
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .pending-tx-list {
          padding: 12px;
        }
        .pending-tx-list.loading,
        .pending-tx-list.error,
        .pending-tx-list.empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 24px;
          color: #666;
          font-size: 14px;
        }
        .pending-tx-list.error button {
          padding: 4px 12px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
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
        .tx-section {
          margin-bottom: 16px;
        }
        .section-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          margin: 0 0 8px 0;
        }
        .tx-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: white;
          border: 1px solid #eee;
          border-radius: 8px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tx-item:hover {
          border-color: #007bff;
          background: #f8f9fa;
        }
        .tx-item.pending {
          border-left: 3px solid #f0ad4e;
        }
        .tx-item.mined {
          border-left: 3px solid #5cb85c;
        }
        .tx-item.failed {
          border-left: 3px solid #d9534f;
        }
        .tx-main {
          flex: 1;
          min-width: 0;
        }
        .tx-hash-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .tx-hash {
          font-family: monospace;
          font-size: 13px;
          color: #333;
        }
        .tx-nonce {
          font-size: 11px;
          color: #999;
          background: #f0f0f0;
          padding: 1px 4px;
          border-radius: 3px;
        }
        .tx-details {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }
        .tx-value {
          font-weight: 500;
        }
        .tx-meta {
          display: flex;
          gap: 12px;
          font-size: 11px;
          color: #999;
        }
        .tx-actions {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .action-btn {
          padding: 4px 10px;
          border: none;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .action-btn.speed-up {
          background: #e7f3ff;
          color: #007bff;
        }
        .action-btn.speed-up:hover {
          background: #007bff;
          color: white;
        }
        .action-btn.cancel {
          background: #fee;
          color: #d9534f;
        }
        .action-btn.cancel:hover {
          background: #d9534f;
          color: white;
        }
        .explorer-link {
          padding: 4px 8px;
          color: #007bff;
          text-decoration: none;
          font-size: 14px;
        }
        .explorer-link:hover {
          background: #e7f3ff;
          border-radius: 4px;
        }
        .pending-tx-list.compact .tx-item {
          padding: 8px;
        }
        .pending-tx-list.compact .tx-details,
        .pending-tx-list.compact .tx-meta {
          display: none;
        }
      `}</style>
    </div>
  );
}

export default PendingTxList;
