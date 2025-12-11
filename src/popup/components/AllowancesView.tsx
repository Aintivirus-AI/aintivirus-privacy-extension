import React, { useState, useEffect, useCallback } from 'react';
import { sendToBackground } from '@shared/messaging';
import type {
  EVMChainId,
  EVMAllowanceEntry,
  EVMTransactionResult,
  EVMRevokeFeeEstimate,
  EVMAllowanceDiscoveryResult,
} from '@shared/types';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'all 0.2s',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  refreshButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'all 0.2s',
  },
  filters: {
    display: 'flex',
    gap: '8px',
    padding: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    flexWrap: 'wrap',
  },
  filterButton: {
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    background: 'linear-gradient(135deg, #5b5fc7 0%, #9945FF 100%)',
    color: '#ffffff',
    border: '1px solid transparent',
  },
  searchInput: {
    flex: 1,
    minWidth: '120px',
    padding: '6px 12px',
    fontSize: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    outline: 'none',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '12px',
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#5b5fc7',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '12px',
    textAlign: 'center',
  },
  emptyIcon: {
    width: 48,
    height: 48,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  emptySubtext: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    opacity: 0.7,
  },
  errorState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '12px',
    textAlign: 'center',
  },
  errorText: {
    fontSize: '14px',
    color: '#ef4444',
  },
  retryButton: {
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #5b5fc7 0%, #9945FF 100%)',
    color: '#ffffff',
    cursor: 'pointer',
  },
  allowanceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  allowanceCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  allowanceHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  tokenLogo: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
  },
  tokenInfo: {
    flex: 1,
    minWidth: 0,
  },
  tokenSymbol: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
  },
  tokenName: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  allowanceDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spenderInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  spenderLabel: {
    fontSize: '12px',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  verifiedBadge: {
    color: '#22c55e',
    fontSize: '10px',
  },
  spenderAddress: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  allowanceAmount: {
    textAlign: 'right',
  },
  allowanceValue: {
    fontSize: '12px',
    fontWeight: 500,
  },
  infiniteAllowance: {
    color: '#fbbf24',
  },
  normalAllowance: {
    color: '#22c55e',
  },
  allowanceLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  revokeButton: {
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  revokeButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  warningBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px',
    background: 'rgba(251, 191, 36, 0.1)',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  warningIcon: {
    color: '#fbbf24',
    flexShrink: 0,
    marginTop: '2px',
  },
  warningText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  lastUpdated: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },

  dialogOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000,
  },
  dialog: {
    background: 'var(--bg-primary)',
    borderRadius: '12px',
    padding: '20px',
    maxWidth: '320px',
    width: '100%',
  },
  dialogTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    marginBottom: '12px',
  },
  dialogText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    lineHeight: 1.5,
  },
  dialogTokenInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  dialogFee: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginBottom: '16px',
  },
  dialogActions: {
    display: 'flex',
    gap: '8px',
  },
  dialogButton: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dialogCancelButton: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
  },
  dialogConfirmButton: {
    background: '#ef4444',
    color: '#ffffff',
  },
  successDialog: {
    textAlign: 'center',
  },
  successIcon: {
    width: 48,
    height: 48,
    color: '#22c55e',
    marginBottom: '12px',
  },
  explorerLink: {
    fontSize: '12px',
    color: '#5b5fc7',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
};

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M10 12L6 8L10 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    style={spinning ? { animation: 'spin 1s linear infinite' } : {}}
  >
    <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M8 2V5L11 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ShieldIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
    <path
      d="M24 4L40 10V22C40 32 32 40 24 44C16 40 8 32 8 22V10L24 4Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18 24L22 28L30 20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WarningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M7 5V7.5M7 9.5H7.005M12.25 7C12.25 9.8995 9.8995 12.25 7 12.25C4.10051 12.25 1.75 9.8995 1.75 7C1.75 4.10051 4.10051 1.75 7 1.75C9.8995 1.75 12.25 4.10051 12.25 7Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
    <path
      d="M16 24L22 30L32 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path
      d="M9 6.5V9.5C9 10.0523 8.55228 10.5 8 10.5H2.5C1.94772 10.5 1.5 10.0523 1.5 9.5V4C1.5 3.44772 1.94772 3 2.5 3H5.5M7.5 1.5H10.5V4.5M5.5 6.5L10.5 1.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const VerifiedIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="5" fill="currentColor" />
    <path
      d="M4 6L5.5 7.5L8 4.5"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface AllowancesViewProps {
  chainId: EVMChainId;
  evmAddress: string;
  onClose: () => void;
}

export const AllowancesView: React.FC<AllowancesViewProps> = ({ chainId, evmAddress, onClose }) => {
  const [allowances, setAllowances] = useState<EVMAllowanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number>(0);
  const [fromCache, setFromCache] = useState(false);

  const [showInfiniteOnly, setShowInfiniteOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'amount' | 'token' | 'spender'>('amount');

  const [revokeDialog, setRevokeDialog] = useState<{
    allowance: EVMAllowanceEntry;
    feeEstimate: EVMRevokeFeeEstimate | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const [successDialog, setSuccessDialog] = useState<{
    hash: string;
    explorerUrl: string;
    tokenSymbol: string;
    spenderLabel: string;
  } | null>(null);

  const fetchAllowances = useCallback(
    async (force: boolean = false) => {
      try {
        if (force) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const response = await sendToBackground({
          type: 'WALLET_GET_ALLOWANCES',
          payload: { evmChainId: chainId, forceRefresh: force },
        });

        if (response.success && response.data) {
          const result = response.data as EVMAllowanceDiscoveryResult;
          setAllowances(result.allowances);
          setFetchedAt(result.fetchedAt);
          setFromCache(result.fromCache);
        } else {
          setError(response.error || 'Failed to load allowances');
        }
      } catch (err) {
        setError('Failed to load allowances');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [chainId],
  );

  useEffect(() => {
    fetchAllowances();
  }, [fetchAllowances]);

  const handleRevoke = async (allowance: EVMAllowanceEntry) => {
    setRevokeDialog({
      allowance,
      feeEstimate: null,
      loading: true,
      error: null,
    });

    try {
      const response = await sendToBackground({
        type: 'WALLET_ESTIMATE_REVOKE_FEE',
        payload: {
          evmChainId: chainId,
          tokenAddress: allowance.tokenAddress,
          spenderAddress: allowance.spenderAddress,
        },
      });

      if (response.success && response.data) {
        setRevokeDialog((prev) =>
          prev
            ? {
                ...prev,
                feeEstimate: response.data as EVMRevokeFeeEstimate,
                loading: false,
              }
            : null,
        );
      } else {
        setRevokeDialog((prev) =>
          prev
            ? {
                ...prev,
                error: response.error || 'Failed to estimate fee',
                loading: false,
              }
            : null,
        );
      }
    } catch {
      setRevokeDialog((prev) =>
        prev
          ? {
              ...prev,
              error: 'Failed to estimate fee',
              loading: false,
            }
          : null,
      );
    }
  };

  const confirmRevoke = async () => {
    if (!revokeDialog) return;

    const { allowance } = revokeDialog;
    setRevokeDialog((prev) => (prev ? { ...prev, loading: true, error: null } : null));

    try {
      const response = await sendToBackground({
        type: 'WALLET_REVOKE_ALLOWANCE',
        payload: {
          evmChainId: chainId,
          tokenAddress: allowance.tokenAddress,
          spenderAddress: allowance.spenderAddress,
        },
      });

      if (response.success && response.data) {
        const result = response.data as EVMTransactionResult;
        setRevokeDialog(null);
        setSuccessDialog({
          hash: result.hash,
          explorerUrl: result.explorerUrl,
          tokenSymbol: allowance.tokenSymbol,
          spenderLabel: allowance.spenderLabel || truncateAddress(allowance.spenderAddress),
        });

        fetchAllowances(true);
      } else {
        setRevokeDialog((prev) =>
          prev
            ? {
                ...prev,
                error: response.error || 'Revoke failed',
                loading: false,
              }
            : null,
        );
      }
    } catch {
      setRevokeDialog((prev) =>
        prev
          ? {
              ...prev,
              error: 'Failed to revoke allowance',
              loading: false,
            }
          : null,
      );
    }
  };

  const truncateAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;

    return new Date(timestamp).toLocaleDateString();
  };

  const filteredAllowances = allowances
    .filter((a) => {
      if (showInfiniteOnly && !a.isInfinite) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          a.tokenSymbol.toLowerCase().includes(query) ||
          a.tokenName.toLowerCase().includes(query) ||
          (a.spenderLabel && a.spenderLabel.toLowerCase().includes(query)) ||
          a.spenderAddress.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'amount':
          if (a.isInfinite && !b.isInfinite) return -1;
          if (!a.isInfinite && b.isInfinite) return 1;
          return b.allowanceFormatted - a.allowanceFormatted;
        case 'token':
          return a.tokenSymbol.localeCompare(b.tokenSymbol);
        case 'spender':
          return (a.spenderLabel || a.spenderAddress).localeCompare(
            b.spenderLabel || b.spenderAddress,
          );
        default:
          return 0;
      }
    });

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backButton} onClick={onClose} title="Back">
            <ArrowLeftIcon />
          </button>
          <span style={styles.title}>Token Allowances</span>
        </div>
        <button
          style={styles.refreshButton}
          onClick={() => fetchAllowances(true)}
          disabled={refreshing}
          title="Refresh"
        >
          <RefreshIcon spinning={refreshing} />
        </button>
      </div>

      {}
      {!loading && !error && allowances.length > 0 && (
        <div style={styles.filters}>
          <button
            style={{
              ...styles.filterButton,
              ...(showInfiniteOnly ? styles.filterButtonActive : {}),
            }}
            onClick={() => setShowInfiniteOnly(!showInfiniteOnly)}
          >
            Unlimited Only
          </button>
          <button
            style={{
              ...styles.filterButton,
              ...(sortBy === 'amount' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setSortBy('amount')}
          >
            By Amount
          </button>
          <button
            style={{
              ...styles.filterButton,
              ...(sortBy === 'token' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setSortBy('token')}
          >
            By Token
          </button>
          <input
            type="text"
            placeholder="Search..."
            style={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {}
      <div style={styles.content}>
        {loading ? (
          <div style={styles.loadingState}>
            <div style={styles.spinner} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Scanning allowances...
            </span>
          </div>
        ) : error ? (
          <div style={styles.errorState}>
            <span style={styles.errorText}>{error}</span>
            <button style={styles.retryButton} onClick={() => fetchAllowances()}>
              Retry
            </button>
          </div>
        ) : allowances.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ ...styles.emptyIcon, color: '#22c55e' }}>
              <ShieldIcon />
            </div>
            <span style={styles.emptyText}>No active allowances found</span>
            <span style={styles.emptySubtext}>Your tokens are not approved to any contracts.</span>
          </div>
        ) : (
          <>
            {}
            <div style={styles.warningBanner}>
              <span style={styles.warningIcon}>
                <WarningIcon />
              </span>
              <span style={styles.warningText}>
                Revoking allowances costs gas. Verify the spender before revoking — some protocols
                require active allowances to function.
              </span>
            </div>

            {}
            <div style={styles.allowanceList}>
              {filteredAllowances.map((allowance, index) => (
                <div
                  key={`${allowance.tokenAddress}-${allowance.spenderAddress}`}
                  style={styles.allowanceCard}
                >
                  <div style={styles.allowanceHeader}>
                    <img
                      src={
                        allowance.tokenLogoUri ||
                        `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1a1a25" stroke="#627eea" stroke-width="2"/><text x="50" y="60" text-anchor="middle" fill="#e8e8ef" font-size="24">${allowance.tokenSymbol.slice(0, 2)}</text></svg>`)}`
                      }
                      alt={allowance.tokenSymbol}
                      style={styles.tokenLogo}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1a1a25" stroke="#627eea" stroke-width="2"/><text x="50" y="60" text-anchor="middle" fill="#e8e8ef" font-size="24">${allowance.tokenSymbol.slice(0, 2)}</text></svg>`)}`;
                      }}
                    />
                    <div style={styles.tokenInfo}>
                      <div style={styles.tokenSymbol}>{allowance.tokenSymbol}</div>
                      <div style={styles.tokenName}>{allowance.tokenName}</div>
                    </div>
                  </div>

                  <div style={styles.allowanceDetails}>
                    <div style={styles.spenderInfo}>
                      <div style={styles.spenderLabel}>
                        {allowance.spenderLabel || 'Unknown Protocol'}
                        {allowance.spenderVerified && (
                          <span style={styles.verifiedBadge} title="Verified Protocol">
                            <VerifiedIcon />
                          </span>
                        )}
                      </div>
                      <div style={styles.spenderAddress}>
                        {truncateAddress(allowance.spenderAddress)}
                      </div>
                    </div>
                    <div style={styles.allowanceAmount}>
                      <div
                        style={{
                          ...styles.allowanceValue,
                          ...(allowance.isInfinite
                            ? styles.infiniteAllowance
                            : styles.normalAllowance),
                        }}
                      >
                        {allowance.isInfinite
                          ? 'Unlimited'
                          : allowance.allowanceFormatted.toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })}
                      </div>
                      <div style={styles.allowanceLabel}>
                        {allowance.isInfinite ? '⚠️ High Risk' : 'Allowed'}
                      </div>
                    </div>
                  </div>

                  <button style={styles.revokeButton} onClick={() => handleRevoke(allowance)}>
                    Revoke Allowance
                  </button>
                </div>
              ))}
            </div>

            {filteredAllowances.length === 0 && (
              <div style={styles.emptyState}>
                <span style={styles.emptyText}>No matching allowances</span>
                <span style={styles.emptySubtext}>Try adjusting your filters</span>
              </div>
            )}
          </>
        )}
      </div>

      {}
      {!loading && !error && fetchedAt > 0 && (
        <div style={styles.lastUpdated}>
          {fromCache ? 'Cached' : 'Updated'} {formatTime(fetchedAt)}
        </div>
      )}

      {}
      {revokeDialog && (
        <div
          style={styles.dialogOverlay}
          onClick={() => !revokeDialog.loading && setRevokeDialog(null)}
        >
          <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={styles.dialogTitle}>Revoke Allowance?</div>
            <div style={styles.dialogText}>
              This will revoke {revokeDialog.allowance.tokenSymbol} approval for:
            </div>
            <div style={styles.dialogTokenInfo}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
                  {revokeDialog.allowance.spenderLabel || 'Unknown Protocol'}
                </div>
                <div
                  style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}
                >
                  {truncateAddress(revokeDialog.allowance.spenderAddress)}
                </div>
              </div>
            </div>

            {revokeDialog.loading && !revokeDialog.feeEstimate && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                <div style={styles.spinner} />
              </div>
            )}

            {revokeDialog.feeEstimate && (
              <div style={styles.dialogFee}>
                Network fee: ~{revokeDialog.feeEstimate.totalFeeFormatted.toFixed(6)} ETH
              </div>
            )}

            {revokeDialog.error && (
              <div style={{ ...styles.dialogText, color: '#ef4444', marginBottom: '16px' }}>
                {revokeDialog.error}
              </div>
            )}

            <div style={styles.dialogActions}>
              <button
                style={{ ...styles.dialogButton, ...styles.dialogCancelButton }}
                onClick={() => setRevokeDialog(null)}
                disabled={revokeDialog.loading}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.dialogButton,
                  ...styles.dialogConfirmButton,
                  ...(revokeDialog.loading || !revokeDialog.feeEstimate
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}),
                }}
                onClick={confirmRevoke}
                disabled={revokeDialog.loading || !revokeDialog.feeEstimate}
              >
                {revokeDialog.loading ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {successDialog && (
        <div style={styles.dialogOverlay} onClick={() => setSuccessDialog(null)}>
          <div
            style={{ ...styles.dialog, ...styles.successDialog }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ ...styles.successIcon, color: '#22c55e' }}>
              <CheckCircleIcon />
            </div>
            <div style={styles.dialogTitle}>Allowance Revoked!</div>
            <div style={styles.dialogText}>
              {successDialog.tokenSymbol} approval for {successDialog.spenderLabel} has been
              revoked.
            </div>
            <a
              href={successDialog.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.explorerLink}
            >
              View on Explorer <ExternalLinkIcon />
            </a>
            <div style={{ ...styles.dialogActions, marginTop: '16px' }}>
              <button
                style={{
                  ...styles.dialogButton,
                  ...styles.dialogCancelButton,
                  flex: 'none',
                  width: '100%',
                }}
                onClick={() => setSuccessDialog(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllowancesView;
