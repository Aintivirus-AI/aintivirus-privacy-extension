import React, { useEffect, useState, useCallback } from 'react';
import { FeatureFlags, DEFAULT_FEATURE_FLAGS, SitePrivacyMode } from '@shared/types';
import { getFeatureFlags, setFeatureFlag, FEATURE_FLAG_META, onFeatureFlagsChange } from '@shared/featureFlags';
import { sendToBackground } from '@shared/messaging';
import type {
  WalletState,
  WalletBalance,
  TransactionHistoryItem,
  SPLTokenBalance,
  SendTransactionResult,
  FeeEstimate,
} from '@shared/types';
import {
  ShieldIcon,
  ShieldCheckIcon,
  WalletIcon,
  LockIcon,
  SettingsIcon,
  SendIcon,
  ReceiveIcon,
  HistoryIcon,
  CopyIcon,
  CheckIcon,
  CloseIcon,
  BellIcon,
  BoltIcon,
  LockClosedIcon,
  BlockIcon,
  CodeIcon,
  ActivityIcon,
  KeyIcon,
  SwapIcon,
  ExternalLinkIcon,
  RefreshIcon,
} from './Icons';


interface PrivacyStats {
  totalBlockedRequests: number;
  totalCookiesDeleted: number;
  activeRuleCount: number;
  currentTabBlocked: number;
  scriptsIntercepted: number;
  requestsModified: number;
}

type MainTab = 'security' | 'wallet';
type WalletView = 'dashboard' | 'send' | 'receive' | 'history';

// --- Utils ---

function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatSol(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) return amount.toExponential(2);
  return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}


function getFeatureIcon(iconName: string): React.ReactNode {
  switch (iconName) {
    case 'shield': return <ShieldIcon size={16} />;
    case 'wallet': return <WalletIcon size={16} />;
    case 'bell': return <BellIcon size={16} />;
    default: return <ShieldIcon size={16} />;
  }
}

// --- Security Tab ---

interface SecurityTabProps {
  flags: FeatureFlags;
  stats: PrivacyStats;
  currentSite: { domain: string; mode: SitePrivacyMode } | null;
  onToggle: (id: keyof FeatureFlags) => void;
  onSiteModeChange: (mode: SitePrivacyMode) => void;
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  flags,
  stats,
  currentSite,
  onToggle,
  onSiteModeChange,
}) => {
  const handleTrackersClick = () => {
    // Open settings page directly with trackers tab hash
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html#trackers') });
  };

  const handleScriptsClick = () => {
    // Open settings page directly with scripts tab hash
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html#scripts') });
  };

  return (
    <div className="popup-content">
      {flags.privacy && (
        <section className="section">
          <div className="stats-grid">
            <div 
              className="stat-card clickable" 
              onClick={handleTrackersClick}
              title="Click to view blocked trackers"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleTrackersClick()}
            >
              <span className="stat-value">
                {formatNumber(stats.totalBlockedRequests)}
              </span>
              <span className="stat-label">Trackers</span>
            </div>
            <div 
              className="stat-card clickable"
              onClick={handleScriptsClick}
              title="Click to view intercepted scripts"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleScriptsClick()}
            >
              <span className="stat-value">{formatNumber(stats.scriptsIntercepted)}</span>
              <span className="stat-label">Scripts</span>
            </div>
            <div className="stat-card highlight">
              <span className="stat-value">{stats.currentTabBlocked}</span>
              <span className="stat-label">This Tab</span>
            </div>
          </div>
          <div className="stats-footer">
            <span className="status-dot" />
            <span>{stats.activeRuleCount.toLocaleString()} rules active</span>
          </div>
        </section>
      )}

      {flags.privacy && currentSite && (
        <section className="section">
          <div className="site-controls">
            <div className="site-info">
              <span className="site-label">Current Site</span>
              <span className="site-domain" title={currentSite.domain}>
                {currentSite.domain.length > 25
                  ? currentSite.domain.substring(0, 22) + '...'
                  : currentSite.domain}
              </span>
            </div>
            <div className="mode-buttons" role="radiogroup" aria-label="Site privacy mode">
              <button
                className={`mode-btn ${currentSite.mode === 'normal' ? 'active' : ''}`}
                onClick={() => onSiteModeChange('normal')}
                aria-checked={currentSite.mode === 'normal'}
                role="radio"
                title="Block third-party trackers"
              >
                <ShieldIcon size={18} />
                <span className="mode-btn-label">Normal</span>
              </button>
              <button
                className={`mode-btn ${currentSite.mode === 'strict' ? 'active' : ''}`}
                onClick={() => onSiteModeChange('strict')}
                aria-checked={currentSite.mode === 'strict'}
                role="radio"
                title="Maximum protection"
              >
                <LockClosedIcon size={18} />
                <span className="mode-btn-label">Strict</span>
              </button>
              <button
                className={`mode-btn ${currentSite.mode === 'disabled' ? 'active' : ''}`}
                onClick={() => onSiteModeChange('disabled')}
                aria-checked={currentSite.mode === 'disabled'}
                role="radio"
                title="Disable protection"
              >
                <BoltIcon size={18} />
                <span className="mode-btn-label">Trusted</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-header">
          <span className="section-title">Protection Features</span>
        </div>
        <div className="feature-list" role="list">
          {FEATURE_FLAG_META.map((feature) => (
            <div
              key={feature.id}
              className={`feature-item ${flags[feature.id] ? 'enabled' : ''}`}
              role="listitem"
            >
              <div className="feature-info">
                <div className="feature-icon">
                  {getFeatureIcon(feature.icon)}
                </div>
                <div className="feature-text">
                  <span className="feature-name" id={`feature-${feature.id}-label`}>
                    {feature.name}
                  </span>
                  <span className="feature-desc" id={`feature-${feature.id}-desc`}>
                    {feature.description}
                  </span>
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={flags[feature.id]}
                  onChange={() => onToggle(feature.id)}
                  aria-labelledby={`feature-${feature.id}-label`}
                  aria-describedby={`feature-${feature.id}-desc`}
                />
                <span className="toggle-track" aria-hidden="true" />
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// --- Wallet Tab ---

interface WalletTabProps {
  walletState: WalletState | null;
  onStateChange: () => void;
}

const WalletTab: React.FC<WalletTabProps> = ({ walletState, onStateChange }) => {
  const [view, setView] = useState<WalletView>('dashboard');
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = async () => {
    if (!password) return;
    setUnlocking(true);
    setUnlockError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_UNLOCK',
        payload: { password },
      });

      if (response.success) {
        setPassword('');
        onStateChange();
      } else {
        setUnlockError(response.error || 'Failed to unlock');
      }
    } catch {
      setUnlockError('Failed to unlock wallet');
    } finally {
      setUnlocking(false);
    }
  };

  if (!walletState || walletState.lockState === 'uninitialized') {
    return (
      <div className="popup-content">
        <WalletSetup onComplete={onStateChange} />
      </div>
    );
  }

  if (walletState.lockState === 'locked') {
    return (
      <div className="popup-content">
        <div className="wallet-locked">
          <div className="wallet-locked-icon">
            <LockIcon size={32} />
          </div>
          <h3>Wallet Locked</h3>
          <form className="unlock-form" onSubmit={(e) => { e.preventDefault(); handleUnlock(); }}>
            <input
              type="password"
              className="form-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {unlockError && <div className="form-error">{unlockError}</div>}
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={!password || unlocking}
            >
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-content">
      <div className="wallet-container">
        {view === 'dashboard' && (
          <WalletDashboard
            address={walletState.publicAddress!}
            network={walletState.network}
            onSend={() => setView('send')}
            onReceive={() => setView('receive')}
            onHistory={() => setView('history')}
            onLock={onStateChange}
          />
        )}
        {view === 'send' && (
          <SendForm
            address={walletState.publicAddress!}
            onClose={() => setView('dashboard')}
            onSuccess={() => setView('dashboard')}
          />
        )}
        {view === 'receive' && (
          <ReceiveView
            address={walletState.publicAddress!}
            onClose={() => setView('dashboard')}
          />
        )}
        {view === 'history' && (
          <HistoryView
            address={walletState.publicAddress!}
            network={walletState.network}
            onClose={() => setView('dashboard')}
          />
        )}
      </div>
    </div>
  );
};

const WalletSetup: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [mode, setMode] = useState<'select' | 'create' | 'import'>('select');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const handleCreate = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_CREATE',
        payload: { password },
      });

      if (response.success && response.data) {
        const data = response.data as { mnemonic: string; publicAddress: string };
        setGeneratedMnemonic(data.mnemonic);
        setStep(2);
      } else {
        setError(response.error || 'Failed to create wallet');
      }
    } catch {
      setError('Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!mnemonic.trim()) {
      setError('Please enter your recovery phrase');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_IMPORT',
        payload: { mnemonic: mnemonic.trim(), password },
      });

      if (response.success) {
        onComplete();
      } else {
        setError(response.error || 'Failed to import wallet');
      }
    } catch {
      setError('Failed to import wallet');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'select') {
    return (
      <div className="wallet-setup">
        <div className="wallet-setup-icon">
          <WalletIcon size={32} />
        </div>
        <h3>Welcome to AINTIVIRUS Wallet</h3>
        <p>Secure Solana wallet built into your browser</p>
        <div className="wallet-setup-actions">
          <button className="btn btn-primary btn-block" onClick={() => setMode('create')}>
            Create New Wallet
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setMode('import')}>
            Import Existing Wallet
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    if (step === 1) {
      return (
        <div className="wallet-setup">
          <div className="wallet-setup-icon">
            <KeyIcon size={32} />
          </div>
          <h3>Set Your Password</h3>
          <p>This password encrypts your wallet</p>
          <div className="unlock-form">
            <input
              type="password"
              className="form-input"
              placeholder="Password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              className="form-input"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {error && <div className="form-error">{error}</div>}
            <button
              className="btn btn-primary btn-block"
              onClick={handleCreate}
              disabled={loading || !password || !confirmPassword}
            >
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
            <button
              className="btn btn-secondary btn-block"
              onClick={() => { setMode('select'); setError(''); }}
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="wallet-setup">
        <div className="wallet-setup-icon">
          <KeyIcon size={32} />
        </div>
        <h3>Save Your Recovery Phrase</h3>
        <p style={{ color: 'var(--warning)', marginBottom: 'var(--space-md)' }}>
          Write these words down and store them safely. Anyone with this phrase can access your wallet.
        </p>
        <div className="full-address" style={{ marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
          {generatedMnemonic}
        </div>
        <button className="btn btn-primary btn-block" onClick={onComplete}>
          I've Saved My Phrase
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-setup">
      <div className="wallet-setup-icon">
        <ReceiveIcon size={32} />
      </div>
      <h3>Import Wallet</h3>
      <p>Enter your 12 or 24 word recovery phrase</p>
      <div className="unlock-form">
        <textarea
          className="form-input form-textarea"
          placeholder="Enter recovery phrase..."
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          rows={3}
        />
        <input
          type="password"
          className="form-input"
          placeholder="Set password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="form-error">{error}</div>}
        <button
          className="btn btn-primary btn-block"
          onClick={handleImport}
          disabled={loading || !mnemonic || !password}
        >
          {loading ? 'Importing...' : 'Import Wallet'}
        </button>
        <button
          className="btn btn-secondary btn-block"
          onClick={() => { setMode('select'); setError(''); }}
        >
          Back
        </button>
      </div>
    </div>
  );
};

interface WalletDashboardProps {
  address: string;
  network: string;
  onSend: () => void;
  onReceive: () => void;
  onHistory: () => void;
  onLock: () => void;
}

interface ConnectionRecordUI {
  id: string;
  domain: string;
  timestamp: number;
  approved: boolean;
  revoked: boolean;
}

const WalletDashboard: React.FC<WalletDashboardProps> = ({
  address,
  network,
  onSend,
  onReceive,
  onHistory,
  onLock,
}) => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [tokens, setTokens] = useState<SPLTokenBalance[]>([]);
  const [history, setHistory] = useState<TransactionHistoryItem[]>([]);
  const [connections, setConnections] = useState<ConnectionRecordUI[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'activity' | 'tokens' | 'security'>('activity');

  useEffect(() => {
    fetchData();
  }, [address]);

  const fetchData = async () => {
    setLoadingBalance(true);

    const balanceRes = await sendToBackground({ type: 'WALLET_GET_BALANCE', payload: undefined });
    if (balanceRes.success && balanceRes.data) {
      setBalance(balanceRes.data as WalletBalance);
    }
    setLoadingBalance(false);

    const historyRes = await sendToBackground({
      type: 'WALLET_GET_HISTORY',
      payload: { limit: 5 },
    });
    if (historyRes.success && historyRes.data) {
      const result = historyRes.data as { transactions: TransactionHistoryItem[] };
      setHistory(result.transactions);
    }

    const tokensRes = await sendToBackground({ type: 'WALLET_GET_TOKENS', payload: undefined });
    if (tokensRes.success && tokensRes.data) {
      setTokens(tokensRes.data as SPLTokenBalance[]);
    }

    const connectionsRes = await sendToBackground({
      type: 'SECURITY_GET_CONNECTIONS',
      payload: { limit: 10 },
    });
    if (connectionsRes.success && connectionsRes.data) {
      setConnections(connectionsRes.data as ConnectionRecordUI[]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleRevokeConnection = async (domain: string) => {
    await sendToBackground({
      type: 'SECURITY_CONNECTION_REVOKE',
      payload: { domain },
    });
    const connectionsRes = await sendToBackground({
      type: 'SECURITY_GET_CONNECTIONS',
      payload: { limit: 10 },
    });
    if (connectionsRes.success && connectionsRes.data) {
      setConnections(connectionsRes.data as ConnectionRecordUI[]);
    }
  };

  const handleLock = async () => {
    await sendToBackground({ type: 'WALLET_LOCK', payload: undefined });
    onLock();
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <div className="wallet-header">
        <div className="network-badge">
          <span className={`network-dot ${network === 'devnet' ? 'devnet' : ''}`} />
          <span>{network === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}</span>
        </div>
        <div className="wallet-header-actions">
          <button 
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`} 
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh wallet"
          >
            <RefreshIcon size={14} />
          </button>
          <button className="lock-btn" onClick={handleLock}>
            <LockIcon size={12} />
            <span>Lock</span>
          </button>
        </div>
      </div>

      <div className="balance-card">
        {loadingBalance ? (
          <div className="balance-amount">
            <span className="balance-value">...</span>
          </div>
        ) : (
          <div className="balance-amount">
            <span className="balance-value">{balance ? formatSol(balance.sol) : '0'}</span>
            <span className="balance-symbol">SOL</span>
          </div>
        )}
        <div className="address-display" onClick={copyAddress} title="Click to copy">
          <span className="address-text">{truncateAddress(address, 6)}</span>
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </div>
      </div>

      <div className="wallet-actions">
        <button className="wallet-action-btn" onClick={onSend}>
          <SendIcon size={20} />
          <span className="action-label">Send</span>
        </button>
        <button className="wallet-action-btn" onClick={onReceive}>
          <ReceiveIcon size={20} />
          <span className="action-label">Receive</span>
        </button>
        <button className="wallet-action-btn" onClick={onHistory}>
          <HistoryIcon size={20} />
          <span className="action-label">History</span>
        </button>
      </div>

      <div className="wallet-tabs">
        <button
          className={`wallet-tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
        <button
          className={`wallet-tab ${activeTab === 'tokens' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokens')}
        >
          Tokens ({tokens.length})
        </button>
        <button
          className={`wallet-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Security
        </button>
      </div>

      {activeTab === 'activity' && (
        <div className={`tx-list ${refreshing ? 'refreshing' : ''}`}>
          {refreshing ? (
            <div className="empty-state">
              <div className="spinner" />
              <span style={{ marginTop: '8px', display: 'block' }}>Refreshing...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="empty-state">No transactions yet</div>
          ) : (
            history.map((tx) => (
              <div
                key={tx.signature}
                className="tx-item"
                onClick={() => window.open(`https://explorer.solana.com/tx/${tx.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`, '_blank')}
              >
                <div className={`tx-icon ${tx.direction}`}>
                  {tx.direction === 'sent' ? <SendIcon size={16} /> : tx.direction === 'received' ? <ReceiveIcon size={16} /> : <SwapIcon size={16} />}
                </div>
                <div className="tx-details">
                  <div className="tx-type">{tx.type}</div>
                  <div className="tx-time">{formatTime(tx.timestamp)}</div>
                </div>
                <div className="tx-amount">
                  <div className={`tx-value ${tx.direction}`}>
                    {tx.direction === 'sent' ? '-' : tx.direction === 'received' ? '+' : ''}
                    {formatSol(tx.amountSol)} SOL
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'tokens' && (
        <div className="token-list">
          {tokens.length === 0 ? (
            <div className="empty-state">No tokens found</div>
          ) : (
            tokens.map((token) => (
              <div key={token.mint} className="token-item">
                <img
                  src={token.logoUri || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1a1a25" stroke="#5b5fc7" stroke-width="2"/><text x="50" y="60" text-anchor="middle" fill="#e8e8ef" font-size="24">${token.symbol.slice(0, 2)}</text></svg>`)}`}
                  alt={token.symbol}
                  className="token-logo"
                />
                <div className="token-info">
                  <div className="token-symbol">{token.symbol}</div>
                  <div className="token-name">{token.name}</div>
                </div>
                <div className="token-balance">
                  <div className="token-balance-value">
                    {token.uiBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className="security-tab">
          <div className="security-section">
            <div className="security-section-header">
              <span className="security-section-title"> Connected Sites</span>
              <span className="security-section-count">
                {connections.filter(c => c.approved && !c.revoked).length}
              </span>
            </div>
            <p className="security-disclaimer">
              These sites have been granted access to view your wallet address. 
              Revoking here removes our record; the site may still request access again.
            </p>
            <div className="connection-list">
              {connections.filter(c => c.approved && !c.revoked).length === 0 ? (
                <div className="empty-state">No active connections</div>
              ) : (
                connections
                  .filter(c => c.approved && !c.revoked)
                  .map((conn) => (
                    <div key={conn.id} className="connection-item">
                      <div className="connection-info">
                        <div className="connection-domain">{conn.domain}</div>
                        <div className="connection-time">
                          Connected {formatTime(Math.floor(conn.timestamp / 1000))}
                        </div>
                      </div>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRevokeConnection(conn.domain)}
                      >
                        Revoke
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
          <div className="security-info">
            <div className="security-info-icon">
              <ShieldCheckIcon size={16} />
            </div>
            <div className="security-info-text">
              <strong>Security Monitoring Active</strong>
              <p>
                AINTIVIRUS monitors wallet connections and analyzes transactions.
                This is informational only and cannot guarantee safety.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface SendFormProps {
  address: string;
  onClose: () => void;
  onSuccess: () => void;
}

const SendForm: React.FC<SendFormProps> = ({ address, onClose, onSuccess }) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<SendTransactionResult | null>(null);

  useEffect(() => {
    fetchBalance();
  }, []);

  useEffect(() => {
    if (recipient && amount && parseFloat(amount) > 0) {
      estimateFee();
    }
  }, [recipient, amount]);

  const fetchBalance = async () => {
    const res = await sendToBackground({ type: 'WALLET_GET_BALANCE', payload: undefined });
    if (res.success && res.data) {
      setBalance(res.data as WalletBalance);
    }
  };

  const estimateFee = async () => {
    try {
      const res = await sendToBackground({
        type: 'WALLET_ESTIMATE_FEE',
        payload: { recipient, amountSol: parseFloat(amount) },
      });
      if (res.success && res.data) {
        setFeeEstimate(res.data as FeeEstimate);
      }
    } catch {
    }
  };

  const handleMax = () => {
    if (balance && feeEstimate) {
      const max = Math.max(0, balance.sol - feeEstimate.feeSol - 0.000005);
      setAmount(max.toFixed(9).replace(/\.?0+$/, ''));
    } else if (balance) {
      setAmount((balance.sol - 0.000005).toFixed(9).replace(/\.?0+$/, ''));
    }
  };

  const handleSend = async () => {
    setError('');

    if (!recipient) {
      setError('Please enter a recipient address');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSending(true);

    try {
      const res = await sendToBackground({
        type: 'WALLET_SEND_SOL',
        payload: { recipient, amountSol: amountNum },
      });

      if (res.success && res.data) {
        setSuccess(res.data as SendTransactionResult);
      } else {
        setError(res.error || 'Transaction failed');
      }
    } catch {
      setError('Transaction failed');
    } finally {
      setSending(false);
    }
  };

  if (success) {
    return (
      <div className="tx-success">
        <div className="tx-success-icon">
          <CheckIcon size={32} />
        </div>
        <h3>Transaction Sent!</h3>
        <div className="tx-success-amount">{amount} SOL</div>
        <a
          href={success.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="explorer-link"
        >
          View on Explorer
          <ExternalLinkIcon size={14} />
        </a>
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <button className="btn btn-secondary btn-block" onClick={onSuccess}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="send-form">
      <div className="form-header">
        <h3>Send SOL</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="form-group">
        <label className="form-label">Recipient Address</label>
        <input
          type="text"
          className={`form-input ${error && !recipient ? 'error' : ''}`}
          placeholder="Enter Solana address..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          Amount (Balance: {balance ? formatSol(balance.sol) : '0'} SOL)
        </label>
        <div className="amount-input-wrapper">
          <input
            type="text"
            className={`form-input ${error && !amount ? 'error' : ''}`}
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <button className="max-btn" onClick={handleMax}>MAX</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {feeEstimate && (
        <div className="fee-display">
          <span className="fee-label">Network Fee</span>
          <span className="fee-value">~{feeEstimate.feeSol.toFixed(6)} SOL</span>
        </div>
      )}

      <button
        className="btn btn-primary btn-block"
        onClick={handleSend}
        disabled={sending || !recipient || !amount}
      >
        {sending ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
};

interface ReceiveViewProps {
  address: string;
  onClose: () => void;
}

const ReceiveView: React.FC<ReceiveViewProps> = ({ address, onClose }) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchQR();
  }, [address]);

  const fetchQR = async () => {
    const res = await sendToBackground({
      type: 'WALLET_GET_ADDRESS_QR',
      payload: { size: 160 },
    });
    if (res.success && res.data) {
      setQrCode(res.data as string);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="receive-view">
      <div className="form-header">
        <h3>Receive SOL</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
        Scan QR code or copy address to receive SOL and tokens
      </p>

      <div className="qr-container">
        {qrCode ? (
          <img src={qrCode} alt="Wallet QR Code" />
        ) : (
          <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        )}
      </div>

      <div className="full-address" onClick={copyAddress}>
        {address}
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={copyAddress}
        style={{ marginTop: 'var(--space-md)' }}
      >
        {copied ? 'Copied!' : 'Copy Address'}
      </button>
    </div>
  );
};

interface HistoryViewProps {
  address: string;
  network: string;
  onClose: () => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ address, network, onClose }) => {
  const [history, setHistory] = useState<TransactionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    const res = await sendToBackground({
      type: 'WALLET_GET_HISTORY',
      payload: { limit: 20 },
    });
    if (res.success && res.data) {
      const result = res.data as { transactions: TransactionHistoryItem[] };
      setHistory(result.transactions);
    }
    setLoading(false);
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="send-form">
      <div className="form-header">
        <h3>Transaction History</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">No transactions yet</div>
      ) : (
        <div className="tx-list" style={{ maxHeight: '280px' }}>
          {history.map((tx) => (
            <div
              key={tx.signature}
              className="tx-item"
              onClick={() => window.open(`https://explorer.solana.com/tx/${tx.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`, '_blank')}
            >
              <div className={`tx-icon ${tx.direction}`}>
                {tx.direction === 'sent' ? <SendIcon size={16} /> : tx.direction === 'received' ? <ReceiveIcon size={16} /> : <SwapIcon size={16} />}
              </div>
              <div className="tx-details">
                <div className="tx-type">{tx.type}</div>
                <div className="tx-time">{formatTime(tx.timestamp)}</div>
              </div>
              <div className="tx-amount">
                <div className={`tx-value ${tx.direction}`}>
                  {tx.direction === 'sent' ? '-' : tx.direction === 'received' ? '+' : ''}
                  {formatSol(tx.amountSol)} SOL
                </div>
                <div className="tx-status">{tx.status}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MainTab>('security');
  const [stats, setStats] = useState<PrivacyStats>({
    totalBlockedRequests: 0,
    totalCookiesDeleted: 0,
    activeRuleCount: 0,
    currentTabBlocked: 0,
    scriptsIntercepted: 0,
    requestsModified: 0,
  });
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentSite, setCurrentSite] = useState<{ domain: string; mode: SitePrivacyMode } | null>(null);
  const [walletState, setWalletState] = useState<WalletState | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const response = await sendToBackground({ type: 'GET_PRIVACY_METRICS', payload: undefined });
      if (response.success && response.data) {
        const metrics = response.data as {
          totalBlockedRequests: number;
          totalCookiesDeleted: number;
          activeRuleCount: number;
          scriptsIntercepted: number;
          requestsModified: number;
          recentBlocked: { tabId: number }[];
        };

        let currentTabBlocked = 0;
        if (currentTabId && metrics.recentBlocked) {
          currentTabBlocked = metrics.recentBlocked.filter(r => r.tabId === currentTabId).length;
        }

        setStats({
          totalBlockedRequests: metrics.totalBlockedRequests || 0,
          totalCookiesDeleted: metrics.totalCookiesDeleted || 0,
          activeRuleCount: metrics.activeRuleCount || 0,
          scriptsIntercepted: metrics.scriptsIntercepted || 0,
          requestsModified: metrics.requestsModified || 0,
          currentTabBlocked,
        });
      }
    } catch (error) {
      console.error('Failed to fetch privacy stats:', error);
    }
  }, [currentTabId]);

  const fetchSiteMode = useCallback(async (domain: string) => {
    try {
      const response = await sendToBackground({
        type: 'GET_SITE_PRIVACY_MODE',
        payload: { domain },
      });
      if (response.success && response.data !== undefined) {
        setCurrentSite({ domain, mode: response.data as SitePrivacyMode });
      }
    } catch (error) {
      console.error('Failed to fetch site mode:', error);
    }
  }, []);

  const fetchWalletState = useCallback(async () => {
    try {
      const response = await sendToBackground({ type: 'WALLET_GET_STATE', payload: undefined });
      if (response.success && response.data) {
        setWalletState(response.data as WalletState);
      }
    } catch (error) {
      console.error('Failed to fetch wallet state:', error);
    }
  }, []);

  const handleSiteModeChange = async (mode: SitePrivacyMode) => {
    if (!currentSite) return;

    try {
      await sendToBackground({
        type: 'SET_SITE_PRIVACY_MODE',
        payload: { domain: currentSite.domain, mode },
      });
      setCurrentSite(prev => prev ? { ...prev, mode } : null);
    } catch (error) {
      console.error('Failed to set site mode:', error);
    }
  };

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        if (tabs[0].id) {
          setCurrentTabId(tabs[0].id);
        }
        if (tabs[0].url) {
          const domain = extractDomain(tabs[0].url);
          if (domain) {
            fetchSiteMode(domain);
          }
        }
      }
    });

    getFeatureFlags().then((loadedFlags) => {
      setFlags(loadedFlags);
      setLoading(false);
    });

    fetchWalletState();

    const unsubscribe = onFeatureFlagsChange((newFlags) => {
      setFlags(newFlags);
    });

    return unsubscribe;
  }, [fetchSiteMode, fetchWalletState]);

  useEffect(() => {
    if (flags.privacy) {
      fetchStats();
      const interval = setInterval(fetchStats, 2000);
      return () => clearInterval(interval);
    }
  }, [flags.privacy, fetchStats]);

  const handleToggle = async (id: keyof FeatureFlags) => {
    const newValue = !flags[id];
    setFlags((prev) => ({ ...prev, [id]: newValue }));
    await setFeatureFlag(id, newValue);
  };

  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-brand">
          <img src="icons/binary_john.jpg" alt="AINTIVIRUS" className="logo-icon" />
          <span className="logo-text">Aintivirus Privacy Extension</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={openSettings} title="Settings">
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      <nav className="tab-bar" role="tablist">
        <button
          className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
          role="tab"
          aria-selected={activeTab === 'security'}
        >
          <ShieldIcon size={16} />
          <span>Privacy</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}
          onClick={() => setActiveTab('wallet')}
          role="tab"
          aria-selected={activeTab === 'wallet'}
        >
          <WalletIcon size={16} />
          <span>Wallet</span>
        </button>
      </nav>

      {activeTab === 'security' && (
        <SecurityTab
          flags={flags}
          stats={stats}
          currentSite={currentSite}
          onToggle={handleToggle}
          onSiteModeChange={handleSiteModeChange}
        />
      )}

      {activeTab === 'wallet' && (
        <WalletTab
          walletState={walletState}
          onStateChange={fetchWalletState}
        />
      )}

      <footer className="popup-footer">
        <div className={`status-badge ${flags.privacy ? '' : 'inactive'}`}>
          <span className={`status-dot ${flags.privacy ? '' : 'inactive'}`} />
          <span>{flags.privacy ? 'Protection Active' : 'Protection Off'}</span>
        </div>
        <span className="version-text">v0.1.0</span>
      </footer>
    </div>
  );
};

export default App;
