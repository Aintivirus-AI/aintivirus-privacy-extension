/**
 * AINTIVIRUS dApp Connectivity - Pending Requests Component
 * 
 * Shows list of pending dApp requests waiting for user approval.
 */

import React, { useState, useEffect } from 'react';
import { QueuedRequest, ApprovalType } from '../../dapp/types';

// ============================================
// STYLES
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  badge: {
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: 600,
    background: '#ef4444',
    color: '#ffffff',
    borderRadius: '10px',
    minWidth: '20px',
    textAlign: 'center' as const,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '12px',
  },
  emptyIcon: {
    width: 48,
    height: 48,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '14px',
    color: '#64748b',
    textAlign: 'center' as const,
  },
  requestList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  requestItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  requestHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  favicon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  faviconImage: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  requestInfo: {
    flex: 1,
    minWidth: 0,
  },
  siteName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  requestDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  typeBadge: {
    fontSize: '10px',
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
  },
  timeAgo: {
    fontSize: '11px',
    color: '#64748b',
  },
  requestActions: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  viewButton: {
    background: 'linear-gradient(135deg, #5b5fc7 0%, #9945FF 100%)',
    color: '#ffffff',
  },
  cancelButton: {
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#5b5fc7',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// ============================================
// PROPS
// ============================================

interface Props {
  onViewRequest?: (requestId: string) => void;
}

// ============================================
// COMPONENT
// ============================================

export function PendingRequests({ onViewRequest }: Props) {
  const [requests, setRequests] = useState<QueuedRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingRequests();
    
    // Poll for updates
    const interval = setInterval(loadPendingRequests, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadPendingRequests() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DAPP_GET_PENDING_REQUESTS',
        payload: undefined,
      });

      if (response.success && response.data) {
        setRequests(response.data as QueuedRequest[]);
      }
    } catch (error) {
      console.error('Failed to load pending requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(requestId: string) {
    try {
      await chrome.runtime.sendMessage({
        type: 'DAPP_CANCEL_REQUEST',
        payload: { requestId },
      });

      // Refresh list
      loadPendingRequests();
    } catch (error) {
      console.error('Failed to cancel request:', error);
    }
  }

  function handleView(requestId: string) {
    // Open approval window for this request
    chrome.windows.create({
      url: chrome.runtime.getURL(`approval.html?requestId=${requestId}`),
      type: 'popup',
      width: 400,
      height: 600,
      focused: true,
    });
  }

  const formatOrigin = (origin: string): string => {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch {
      return origin;
    }
  };

  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(diff / 60000);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    return new Date(timestamp).toLocaleTimeString();
  };

  const getTypeBadgeStyle = (approvalType: ApprovalType): React.CSSProperties => {
    const baseStyle = { ...styles.typeBadge };
    
    switch (approvalType) {
      case 'connect':
        return { ...baseStyle, background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
      case 'sign':
      case 'signMessage':
        return { ...baseStyle, background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' };
      case 'transaction':
        return { ...baseStyle, background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' };
      case 'switchChain':
      case 'addChain':
        return { ...baseStyle, background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' };
      default:
        return { ...baseStyle, background: 'rgba(255, 255, 255, 0.1)', color: '#94a3b8' };
    }
  };

  const getApprovalTypeLabel = (approvalType: ApprovalType): string => {
    switch (approvalType) {
      case 'connect': return 'Connect';
      case 'sign': return 'Sign';
      case 'signMessage': return 'Sign Message';
      case 'transaction': return 'Transaction';
      case 'switchChain': return 'Switch Network';
      case 'addChain': return 'Add Network';
      default: return 'Request';
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loading}>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  const pendingOnly = requests.filter(r => r.status === 'pending');

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      
      <div style={styles.header}>
        <span style={styles.title}>Pending Requests</span>
        {pendingOnly.length > 0 && (
          <span style={styles.badge}>{pendingOnly.length}</span>
        )}
      </div>

      {pendingOnly.length === 0 ? (
        <div style={styles.emptyState}>
          <svg style={styles.emptyIcon} viewBox="0 0 48 48" fill="none">
            <rect x="8" y="12" width="32" height="24" rx="4" stroke="#64748b" strokeWidth="2"/>
            <path d="M8 20h32" stroke="#64748b" strokeWidth="2"/>
            <circle cx="24" cy="28" r="4" stroke="#64748b" strokeWidth="2"/>
          </svg>
          <span style={styles.emptyText}>
            No pending requests.<br/>
            New requests will appear here.
          </span>
        </div>
      ) : (
        <div style={styles.requestList}>
          {pendingOnly.map((request) => (
            <div key={request.id} style={styles.requestItem}>
              <div style={styles.requestHeader}>
                <div style={styles.favicon}>
                  {request.favicon ? (
                    <img 
                      src={request.favicon} 
                      alt="" 
                      style={styles.faviconImage}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#64748b"/>
                    </svg>
                  )}
                </div>
                
                <div style={styles.requestInfo}>
                  <div style={styles.siteName}>
                    {request.title || formatOrigin(request.origin)}
                  </div>
                  <div style={styles.requestDetails}>
                    <span style={getTypeBadgeStyle(request.approvalType)}>
                      {getApprovalTypeLabel(request.approvalType)}
                    </span>
                    <span style={styles.timeAgo}>
                      {formatTime(request.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div style={styles.requestActions}>
                <button
                  style={{ ...styles.actionButton, ...styles.cancelButton }}
                  onClick={() => handleCancel(request.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                >
                  Cancel
                </button>
                <button
                  style={{ ...styles.actionButton, ...styles.viewButton }}
                  onClick={() => handleView(request.id)}
                >
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PendingRequests;
