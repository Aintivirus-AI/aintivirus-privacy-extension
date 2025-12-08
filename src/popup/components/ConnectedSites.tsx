/**
 * AINTIVIRUS dApp Connectivity - Connected Sites Component
 * 
 * Shows list of connected dApps with ability to revoke permissions.
 */

import React, { useState, useEffect } from 'react';
import { SitePermission } from '../../dapp/types';

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
  disconnectAll: {
    fontSize: '12px',
    color: '#ef4444',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 0.2s',
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
  siteList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  siteItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    transition: 'background 0.2s',
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
  siteInfo: {
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
  siteDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  chainBadge: {
    fontSize: '10px',
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
  },
  accountCount: {
    fontSize: '11px',
    color: '#64748b',
  },
  connectedTime: {
    fontSize: '11px',
    color: '#64748b',
  },
  revokeButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#ef4444',
    background: 'rgba(239, 68, 68, 0.1)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    flexShrink: 0,
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
  onBack?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function ConnectedSites({ onBack }: Props) {
  const [sites, setSites] = useState<SitePermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConnectedSites();
  }, []);

  async function loadConnectedSites() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DAPP_GET_PERMISSIONS',
        payload: undefined,
      });

      if (response.success && response.data) {
        setSites(response.data as SitePermission[]);
      }
    } catch (error) {
      console.error('Failed to load connected sites:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(origin: string, chainType?: 'evm' | 'solana') {
    try {
      await chrome.runtime.sendMessage({
        type: 'DAPP_REVOKE_PERMISSION',
        payload: { origin, chainType },
      });

      // Refresh list
      loadConnectedSites();
    } catch (error) {
      console.error('Failed to revoke permission:', error);
    }
  }

  async function handleRevokeAll() {
    if (!confirm('Disconnect from all sites?')) return;

    try {
      await chrome.runtime.sendMessage({
        type: 'DAPP_REVOKE_ALL_PERMISSIONS',
        payload: undefined,
      });

      // Refresh list
      loadConnectedSites();
    } catch (error) {
      console.error('Failed to revoke all permissions:', error);
    }
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
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
  };

  const getChainBadgeStyle = (chainType: string): React.CSSProperties => {
    if (chainType === 'solana') {
      return {
        ...styles.chainBadge,
        background: 'rgba(153, 69, 255, 0.2)',
        color: '#9945FF',
      };
    }
    return {
      ...styles.chainBadge,
      background: 'rgba(98, 126, 234, 0.2)',
      color: '#627EEA',
    };
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

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      
      <div style={styles.header}>
        <span style={styles.title}>Connected Sites</span>
        {sites.length > 0 && (
          <button
            style={styles.disconnectAll}
            onClick={handleRevokeAll}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Disconnect All
          </button>
        )}
      </div>

      {sites.length === 0 ? (
        <div style={styles.emptyState}>
          <svg style={styles.emptyIcon} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#64748b" strokeWidth="2" strokeDasharray="4 4"/>
            <path d="M24 16v8M24 28v2" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={styles.emptyText}>
            No connected sites.<br/>
            Connect to a dApp to see it here.
          </span>
        </div>
      ) : (
        <div style={styles.siteList}>
          {sites.map((site) => (
            <div key={`${site.origin}:${site.chainType}`} style={styles.siteItem}>
              <div style={styles.favicon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#64748b"/>
                </svg>
              </div>
              
              <div style={styles.siteInfo}>
                <div style={styles.siteName}>{formatOrigin(site.origin)}</div>
                <div style={styles.siteDetails}>
                  <span style={getChainBadgeStyle(site.chainType)}>
                    {site.chainType}
                  </span>
                  <span style={styles.accountCount}>
                    {site.accounts.length} account{site.accounts.length !== 1 ? 's' : ''}
                  </span>
                  <span style={styles.connectedTime}>
                    {formatTime(site.lastAccessed)}
                  </span>
                </div>
              </div>
              
              <button
                style={styles.revokeButton}
                onClick={() => handleRevoke(site.origin, site.chainType)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConnectedSites;
