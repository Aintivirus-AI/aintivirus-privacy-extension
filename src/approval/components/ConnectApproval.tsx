import React, { useState, useMemo } from 'react';
import { QueuedRequest, AccountInfo } from '../../dapp/types';
import { formatOrigin } from '../../shared/utils/formatOrigin';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  siteInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
  },
  favicon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faviconImage: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  origin: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    textAlign: 'center' as const,
  },
  originContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  idnWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: 'rgba(234, 179, 8, 0.2)',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#eab308',
  },
  asciiHost: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#94a3b8',
  },
  requestText: {
    fontSize: '14px',
    color: '#94a3b8',
    textAlign: 'center' as const,
  },
  chainBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#94a3b8',
  },
  accountList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  accountItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  accountItemSelected: {
    background: 'rgba(91, 95, 199, 0.2)',
    border: '1px solid #5b5fc7',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: '2px solid #475569',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxSelected: {
    background: '#5b5fc7',
    borderColor: '#5b5fc7',
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
  },
  accountAddress: {
    fontSize: '12px',
    color: '#64748b',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  accountBalance: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  rememberSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
  },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    background: '#334155',
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  toggleActive: {
    background: '#5b5fc7',
  },
  toggleKnob: {
    position: 'absolute' as const,
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    background: '#ffffff',
    transition: 'left 0.2s',
  },
  toggleKnobActive: {
    left: 18,
  },
  rememberText: {
    flex: 1,
  },
  rememberTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
  },
  rememberDesc: {
    fontSize: '12px',
    color: '#64748b',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
  },
  button: {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: 'none',
  },
  rejectButton: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
  },
  approveButton: {
    background: 'linear-gradient(135deg, #5b5fc7 0%, #9945FF 100%)',
    color: '#ffffff',
  },
  approveButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

interface Props {
  request: QueuedRequest;
  accounts: AccountInfo[];
  onApprove: (selectedAccounts: string[], remember: boolean) => void;
  onReject: (reason?: string) => void;
}

export function ConnectApproval({ request, accounts, onApprove, onReject }: Props) {
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    accounts.filter(a => a.isActive).map(a => a.address)
  );
  const [remember, setRemember] = useState(false);

  const toggleAccount = (address: string) => {
    if (selectedAccounts.includes(address)) {
      setSelectedAccounts(selectedAccounts.filter(a => a !== address));
    } else {
      setSelectedAccounts([...selectedAccounts, address]);
    }
  };

  const handleApprove = () => {
    if (selectedAccounts.length === 0) return;
    onApprove(selectedAccounts, remember);
  };

  const getChainBadgeStyle = (): React.CSSProperties => {
    if (request.chainType === 'solana') {
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

  const formattedOrigin = useMemo(() => formatOrigin(request.origin), [request.origin]);

  return (
    <div style={styles.container}>
      <div style={styles.siteInfo}>
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="#64748b"/>
            </svg>
          )}
        </div>
        <div style={styles.originContainer}>
          <span style={styles.origin}>{formattedOrigin.etldPlusOne}</span>
          {(formattedOrigin.isIDN || formattedOrigin.isSuspicious) && (
            <div style={styles.idnWarning}>
              <span>⚠️ International Domain</span>
              <span style={styles.asciiHost}>ASCII: {formattedOrigin.asciiHost}</span>
            </div>
          )}
        </div>
        <span style={styles.requestText}>wants to connect to your wallet</span>
        <span style={getChainBadgeStyle()}>
          {request.chainType === 'solana' ? 'Solana' : 'Ethereum'}
        </span>
      </div>

      <div style={styles.section}>
        <span style={styles.sectionTitle}>Select Account</span>
        <div style={styles.accountList}>
          {accounts.map(account => (
            <div
              key={account.address}
              style={{
                ...styles.accountItem,
                ...(selectedAccounts.includes(account.address) ? styles.accountItemSelected : {}),
              }}
              onClick={() => toggleAccount(account.address)}
            >
              <div
                style={{
                  ...styles.checkbox,
                  ...(selectedAccounts.includes(account.address) ? styles.checkboxSelected : {}),
                }}
              >
                {selectedAccounts.includes(account.address) && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div style={styles.accountInfo}>
                <div style={styles.accountLabel}>{account.label || 'Account'}</div>
                <div style={styles.accountAddress}>
                  {account.address.slice(0, 6)}...{account.address.slice(-4)}
                </div>
                {account.balance && (
                  <div style={styles.accountBalance}>{account.balance}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.rememberSection}>
        <div
          style={{
            ...styles.toggle,
            ...(remember ? styles.toggleActive : {}),
          }}
          onClick={() => setRemember(!remember)}
        >
          <div
            style={{
              ...styles.toggleKnob,
              ...(remember ? styles.toggleKnobActive : {}),
            }}
          />
        </div>
        <div style={styles.rememberText}>
          <div style={styles.rememberTitle}>Remember this site</div>
          <div style={styles.rememberDesc}>Auto-connect next time</div>
        </div>
      </div>

      <div style={styles.buttons}>
        <button
          style={{ ...styles.button, ...styles.rejectButton }}
          onClick={() => onReject()}
        >
          Cancel
        </button>
        <button
          style={{
            ...styles.button,
            ...styles.approveButton,
            ...(selectedAccounts.length === 0 ? styles.approveButtonDisabled : {}),
          }}
          onClick={handleApprove}
          disabled={selectedAccounts.length === 0}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

export default ConnectApproval;
