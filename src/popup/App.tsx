import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  WalletEntry,
  ChainType,
  EVMChainId,
  EVMBalance,
  EVMTokenBalance,
  EVMFeeEstimate,
} from '@shared/types';
import { SUPPORTED_CHAINS } from '@shared/types';
import { openExplorerUrl, getExplorerUrl } from '@shared/explorer';
import { ExplorerLinkIcon } from './components/ExplorerLinkIcon';
import { RecentRecipientsDropdown } from './components/RecentRecipientsDropdown';
import { TokenIcon } from './components/TokenIcon';
import { useHideBalances, useSessionSetting, SESSION_KEYS } from './hooks/useSessionSetting';
import { useRecentRecipients } from './hooks/useRecentRecipients';
import { useDebounce } from './hooks/useDebounce';
import {
  formatHiddenBalance,
  formatHiddenUsd,
  formatHiddenTxAmount,
  HIDDEN_BALANCE,
} from './utils/balancePrivacy';
import {
  filterSPLTokens,
  filterEVMTokens,
  filterNativeToken,
  highlightMatch,
  type SPLTokenWithMatch,
  type EVMTokenWithMatch,
  type NativeTokenWithMatch,
  type HighlightSegment,
} from './utils/tokenSearch';
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
  ChevronIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  SearchIcon,
} from './Icons';
import { getPasswordStrengthFeedback } from '../wallet/crypto';


interface PrivacyStats {
  totalBlockedRequests: number;
  totalCookiesDeleted: number;
  activeRuleCount: number;
  currentTabBlocked: number;
  scriptsIntercepted: number;
  requestsModified: number;
}

type MainTab = 'security' | 'wallet';
type WalletView = 'dashboard' | 'send' | 'receive' | 'history' | 'manage' | 'add-wallet' | 'swap';

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
  // For very small amounts, show actual value with appropriate decimals
  if (amount < 0.0001) {
    // Find the first significant digit and show 2 significant figures
    const str = amount.toFixed(8);
    // Remove trailing zeros but keep at least one digit after decimal
    return str.replace(/\.?0+$/, '') || '0';
  }
  if (amount < 1) {
    // For amounts less than 1, show up to 6 decimal places
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  }
  // For larger amounts, show up to 4 decimal places
  return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount > 0 && amount < 0.01) return '<$0.01';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}


function getFeatureIcon(iconName: string): React.ReactNode {
  switch (iconName) {
    case 'shield': return <ShieldIcon size={16} />;
    case 'wallet': return <WalletIcon size={16} />;
    case 'bell': return <BellIcon size={16} />;
    default: return <ShieldIcon size={16} />;
  }
}

/**
 * Render text with highlighted matching segments
 */
const HighlightedText: React.FC<{ text: string; segments: HighlightSegment[] }> = ({ segments }) => (
  <>
    {segments.map((seg, i) => 
      seg.highlighted ? (
        <mark key={i} className="token-search-highlight">{seg.text}</mark>
      ) : (
        <span key={i}>{seg.text}</span>
      )
    )}
  </>
);

// --- Security Tab ---

interface SecurityTabProps {
  flags: FeatureFlags;
  stats: PrivacyStats;
  currentSite: { domain: string; mode: SitePrivacyMode } | null;
  onToggle: (id: keyof FeatureFlags) => void;
  onSiteModeChange: (mode: SitePrivacyMode) => void;
  adBlockerEnabled: boolean;
  onAdBlockerToggle: (enabled: boolean) => void;
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  flags,
  stats,
  currentSite,
  onToggle,
  onSiteModeChange,
  adBlockerEnabled,
  onAdBlockerToggle,
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
      {/* Stats - show when ad blocker is enabled */}
      {adBlockerEnabled && (
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

      {/* Per-site controls - show when ad blocker is enabled */}
      {adBlockerEnabled && currentSite && (
        <section className="section">
          <div className="site-controls">
            <div className="site-info">
              <span className="site-label">For this site</span>
              <span className="site-domain" title={currentSite.domain}>
                {currentSite.domain.length > 25
                  ? currentSite.domain.substring(0, 22) + '...'
                  : currentSite.domain}
              </span>
            </div>
            <div className="mode-buttons mode-buttons-2col" role="radiogroup" aria-label="Site blocking mode">
              <button
                className={`mode-btn ${currentSite.mode !== 'disabled' ? 'active' : ''}`}
                onClick={() => onSiteModeChange('normal')}
                aria-checked={currentSite.mode !== 'disabled'}
                role="radio"
                title="Block ads on this site"
              >
                <ShieldCheckIcon size={18} />
                <span className="mode-btn-label">Block Ads</span>
              </button>
              <button
                className={`mode-btn trusted ${currentSite.mode === 'disabled' ? 'active' : ''}`}
                onClick={() => onSiteModeChange('disabled')}
                aria-checked={currentSite.mode === 'disabled'}
                role="radio"
                title="Allow all ads on this site"
              >
                <BoltIcon size={18} />
                <span className="mode-btn-label">Allow Ads</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Protection Features */}
      <section className="section">
        <div className="section-header">
          <span className="section-title">Protection Features</span>
        </div>
        <div className="feature-list" role="list">
          {/* Ad Blocker - first in the list */}
          <div
            className={`feature-item ${adBlockerEnabled ? 'enabled' : ''}`}
            role="listitem"
          >
            <div className="feature-info">
              <div className="feature-icon">
                <BlockIcon size={16} />
              </div>
              <div className="feature-text">
                <span className="feature-name" id="feature-adblocker-label">
                  Ad Blocker
                </span>
                <span className="feature-desc" id="feature-adblocker-desc">
                  Block ads and trackers on all websites
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={adBlockerEnabled}
                onChange={() => onAdBlockerToggle(!adBlockerEnabled)}
                aria-labelledby="feature-adblocker-label"
                aria-describedby="feature-adblocker-desc"
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>
          
          {/* Other feature flags */}
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
  hideBalances: boolean;
  onToggleHideBalances: () => void;
  privacyEnabled: boolean;
}

const WalletTab: React.FC<WalletTabProps> = ({ walletState, onStateChange, hideBalances, onToggleHideBalances, privacyEnabled }) => {
  const [view, setView] = useState<WalletView>('dashboard');
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [switchingToWalletId, setSwitchingToWalletId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedTokenForSend, setSelectedTokenForSend] = useState<SelectedTokenForSend | null>(null);
  // Key to force WalletDashboard remount after successful send
  const [dashboardKey, setDashboardKey] = useState(0);

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
      <div className="popup-content locked-screen-content">
        <div className="locked-screen-bg">
          <div className="locked-bg-gradient" />
          <div className="locked-bg-pattern" />
        </div>
        <div className="wallet-locked">
          <div className="wallet-locked-header">
            <div className="wallet-locked-icon-wrapper">
              <div className="wallet-locked-icon-glow" />
              <div className="wallet-locked-icon">
                <LockIcon size={28} />
              </div>
            </div>
            <h2 className="wallet-locked-title">Wallet Locked</h2>
            <p className="wallet-locked-subtitle">Enter your password to access your wallet</p>
          </div>
          <form className="unlock-form" onSubmit={(e) => { e.preventDefault(); handleUnlock(); }}>
            <div className="unlock-input-group">
              <label className="unlock-label">Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input unlock-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>
            {unlockError && (
              <div className="unlock-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {unlockError}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-block unlock-btn"
              disabled={!password || unlocking}
            >
              {unlocking ? (
                <>
                  <span className="unlock-spinner" />
                  Unlocking...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                  Unlock Wallet
                </>
              )}
            </button>
          </form>
          <div className="wallet-locked-footer">
            <div className="locked-security-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Secured with encryption
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-content">
      <div className="wallet-container">
        {view === 'dashboard' && (
          <WalletDashboard
            key={dashboardKey}
            address={walletState.publicAddress!}
            network={walletState.network}
            activeWalletId={walletState.activeWalletId}
            activeWalletLabel={walletState.activeWalletLabel}
            walletCount={walletState.walletCount}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            evmAddress={walletState.evmAddress || null}
            onSend={() => {
              setSelectedTokenForSend(null);
              setView('send');
            }}
            onSendToken={(token) => {
              setSelectedTokenForSend(token);
              setView('send');
            }}
            onReceive={() => setView('receive')}
            onHistory={() => setView('history')}
            onSwap={() => setView('swap')}
            onLock={onStateChange}
            onManageWallets={() => setView('manage')}
            onWalletSwitch={() => setView('manage')}
            onChainChange={async (chain, evmChainId) => {
              console.log('[ChainChange] Switching to:', chain, evmChainId);
              const result = await sendToBackground({
                type: 'WALLET_SET_CHAIN',
                payload: { chain, evmChainId },
              });
              console.log('[ChainChange] SET_CHAIN result:', result);
              // Refresh wallet state after chain change
              await onStateChange();
              console.log('[ChainChange] State refreshed');
            }}
            hideBalances={hideBalances}
            onToggleHideBalances={onToggleHideBalances}
            privacyEnabled={privacyEnabled}
          />
        )}
        {view === 'send' && (
          <SendForm
            address={walletState.publicAddress!}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            evmAddress={walletState.evmAddress || null}
            onClose={() => {
              setSelectedTokenForSend(null);
              setView('dashboard');
            }}
            onSuccess={async () => {
              setSelectedTokenForSend(null);
              setView('dashboard');
              // Increment key to force WalletDashboard remount with fresh data
              setDashboardKey(k => k + 1);
              // Multiple refreshes to catch transaction propagation
              // First refresh after 1.5s
              setTimeout(() => {
                setDashboardKey(k => k + 1);
              }, 1500);
              // Second refresh after 5s for slower propagation
              setTimeout(() => {
                setDashboardKey(k => k + 1);
              }, 5000);
            }}
            hideBalances={hideBalances}
            selectedToken={selectedTokenForSend}
          />
        )}
        {view === 'receive' && (
          <ReceiveView
            address={walletState.activeChain === 'solana' 
              ? walletState.publicAddress! 
              : (walletState.evmAddress || walletState.publicAddress!)}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            onClose={() => setView('dashboard')}
          />
        )}
        {view === 'history' && (
          <HistoryView
            address={walletState.activeChain === 'solana'
              ? walletState.publicAddress!
              : (walletState.evmAddress || walletState.publicAddress!)}
            network={walletState.network}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            onClose={() => setView('dashboard')}
            hideBalances={hideBalances}
          />
        )}
        {view === 'swap' && (
          <SwapView
            address={walletState.activeChain === 'solana'
              ? walletState.publicAddress!
              : (walletState.evmAddress || walletState.publicAddress!)}
            network={walletState.network}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            onClose={() => setView('dashboard')}
          />
        )}
        {view === 'manage' && (
          <ManageWalletsView
            activeWalletId={walletState.activeWalletId}
            onClose={() => setView('dashboard')}
            onAddWallet={() => setView('add-wallet')}
            onWalletSwitch={onStateChange}
          />
        )}
        {view === 'add-wallet' && (
          <AddWalletView
            onClose={() => setView('manage')}
            onComplete={() => { setView('dashboard'); onStateChange(); }}
          />
        )}
      </div>
    </div>
  );
};

const WalletSetup: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [mode, setMode] = useState<'select' | 'create' | 'import' | 'importPrivateKey'>('select');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showImportConfirmPassword, setShowImportConfirmPassword] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const handleCreate = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const feedback = getPasswordStrengthFeedback(password);
    if (!feedback.valid) {
      setError(feedback.message);
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
    const feedback = getPasswordStrengthFeedback(password);
    if (!feedback.valid) {
      setError(feedback.message);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
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

  const handleImportPrivateKey = async () => {
    const feedback = getPasswordStrengthFeedback(password);
    if (!feedback.valid) {
      setError(feedback.message);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!privateKey.trim()) {
      setError('Please enter your private key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_IMPORT_PRIVATE_KEY',
        payload: { privateKey: privateKey.trim(), password },
      });

      if (response.success) {
        onComplete();
      } else {
        setError(response.error || 'Failed to import wallet from private key');
      }
    } catch {
      setError('Failed to import wallet from private key');
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
            Import with Recovery Phrase
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setMode('importPrivateKey')}>
            Import with Private Key
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
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
            <p className="password-criteria">
              Minimum 10 chars with upper, lower, number, and special character
            </p>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
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

  if (mode === 'importPrivateKey') {
    return (
      <div className="wallet-setup">
        <div className="wallet-setup-icon">
          <LockIcon size={32} />
        </div>
        <h3>Import Private Key</h3>
        <p>Enter your Solana or EVM private key</p>
        <div className="unlock-form">
          <div className="password-input-wrapper">
            <input
              type={showPrivateKey ? 'text' : 'password'}
              className="form-input"
              placeholder="Enter private key (Base58 or Hex)"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              tabIndex={-1}
            >
              {showPrivateKey ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: 'var(--space-sm)' }}>
            Accepts Solana (Base58/Hex) or EVM (0x hex) private keys
          </p>
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Set password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <div className="password-input-wrapper">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p className="password-criteria">
            Minimum 10 chars with upper, lower, number, and special character
          </p>
          {error && <div className="form-error">{error}</div>}
          <button
            className="btn btn-primary btn-block"
            onClick={handleImportPrivateKey}
            disabled={loading || !privateKey || !password}
          >
            {loading ? 'Importing...' : 'Import Wallet'}
          </button>
          <button
            className="btn btn-secondary btn-block"
            onClick={() => { setMode('select'); setError(''); setPrivateKey(''); }}
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
        <ReceiveIcon size={32} />
      </div>
      <h3>Import Wallet</h3>
      <p>Enter your 12 or 24 word recovery phrase</p>
      <div className="unlock-form">
        <textarea
          className="form-input form-textarea modern-scroll"
          placeholder="Enter recovery phrase..."
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          rows={3}
        />
        <div className="password-input-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            className="form-input"
            placeholder="Set password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
        <div className="password-input-wrapper">
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            className="form-input"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            tabIndex={-1}
          >
            {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
        <p className="password-criteria">
          Minimum 10 chars with upper, lower, number, and special character
        </p>
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

/**
 * Selected token for sending (when clicking on a token in the list)
 * Supports both Solana SPL tokens (mint) and EVM ERC20 tokens (address)
 */
interface SelectedTokenForSend {
  /** Token mint address (Solana SPL tokens) */
  mint?: string;
  /** Token contract address (EVM ERC20 tokens) */
  address?: string;
  symbol: string;
  name: string;
  decimals: number;
  uiBalance: number;
  logoUri?: string;
  /** Token account address (Solana SPL tokens only) */
  tokenAccount?: string;
  /** Chain type to distinguish between Solana and EVM tokens */
  chain: 'solana' | 'evm';
}

interface WalletDashboardProps {
  address: string;
  network: string;
  activeWalletId: string | null;
  activeWalletLabel: string | null;
  walletCount: number;
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  evmAddress: string | null;
  onSend: () => void;
  onSendToken: (token: SelectedTokenForSend) => void;
  onReceive: () => void;
  onHistory: () => void;
  onSwap: () => void;
  onLock: () => void;
  onManageWallets: () => void;
  onWalletSwitch: () => void;
  onChainChange: (chain: ChainType, evmChainId?: EVMChainId) => void;
  hideBalances: boolean;
  onToggleHideBalances: () => void;
  privacyEnabled: boolean;
}

// Chain icons with actual logos
const ChainIcon: React.FC<{ chain: ChainType; evmChainId?: EVMChainId; size?: number }> = ({
  chain,
  evmChainId,
  size = 16,
}) => {
  // Get the chain logo URL
  const getLogoUrl = (): string => {
    if (chain === 'solana') {
      return 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
    }
    
    // EVM chain logos from trusted sources
    switch (evmChainId) {
      case 'ethereum':
        return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
      case 'polygon':
        return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png';
      case 'arbitrum':
        return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png';
      case 'optimism':
        return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png';
      case 'base':
        return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png';
      default:
        return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
    }
  };

  // Fallback color for error state
  const getFallbackColor = () => {
    if (chain === 'solana') return '#9945FF';
    switch (evmChainId) {
      case 'ethereum': return '#627EEA';
      case 'polygon': return '#8247E5';
      case 'arbitrum': return '#28A0F0';
      case 'optimism': return '#FF0420';
      case 'base': return '#0052FF';
      default: return '#627EEA';
    }
  };

  const getFallbackLetter = () => {
    if (chain === 'solana') return 'S';
    switch (evmChainId) {
      case 'ethereum': return 'E';
      case 'polygon': return 'P';
      case 'arbitrum': return 'A';
      case 'optimism': return 'O';
      case 'base': return 'B';
      default: return 'E';
    }
  };

  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    // Fallback to colored circle with letter
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: getFallbackColor(),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.6,
          fontWeight: 'bold',
          color: 'white',
        }}
      >
        {getFallbackLetter()}
      </div>
    );
  }

  return (
    <img
      src={getLogoUrl()}
      alt={chain === 'solana' ? 'Solana' : evmChainId || 'Chain'}
      width={size}
      height={size}
      style={{
        borderRadius: '50%',
        objectFit: 'cover',
      }}
      onError={() => setHasError(true)}
    />
  );
};

// Chain Selector Component
const ChainSelector: React.FC<{
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  onChainChange: (chain: ChainType, evmChainId?: EVMChainId) => void;
  onOpen?: () => void;
  forceClose?: boolean;
}> = ({ activeChain, activeEVMChain, onChainChange, onOpen, forceClose }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when forceClose changes to true
  useEffect(() => {
    if (forceClose) {
      setIsOpen(false);
    }
  }, [forceClose]);

  console.log('[ChainSelector] Rendering, activeChain:', activeChain, 'SUPPORTED_CHAINS:', SUPPORTED_CHAINS.length);

  const getCurrentChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    const chain = SUPPORTED_CHAINS.find(
      c => c.type === 'evm' && c.evmChainId === activeEVMChain
    );
    return chain?.name || 'Ethereum';
  };

  return (
    <div className="chain-selector-container">
      <button
        className="chain-selector-btn"
        onClick={() => {
          console.log('[ChainSelector] Toggle dropdown, isOpen:', !isOpen);
          if (!isOpen && onOpen) {
            onOpen();
          }
          setIsOpen(!isOpen);
        }}
        title="Switch chain"
      >
        <ChainIcon chain={activeChain} evmChainId={activeEVMChain || undefined} size={20} />
        <span className="chain-selector-label">{getCurrentChainName()}</span>
        <span className={`chain-selector-arrow ${isOpen ? 'open' : ''}`}>
          <ChevronIcon size={14} />
        </span>
      </button>
      {isOpen && (
        <div className="chain-selector-dropdown">
          <div className="chain-selector-header">
            <span>Select Network</span>
          </div>
          <div className="chain-selector-list">
            {SUPPORTED_CHAINS.map((chain) => {
              const isActive =
                (chain.type === 'solana' && activeChain === 'solana') ||
                (chain.type === 'evm' &&
                  activeChain === 'evm' &&
                  chain.evmChainId === activeEVMChain);

              return (
                <button
                  key={chain.type === 'solana' ? 'solana' : chain.evmChainId}
                  className={`chain-selector-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    console.log('[ChainSelector] Clicked:', chain.type, chain.evmChainId);
                    onChainChange(chain.type, chain.evmChainId);
                    setIsOpen(false);
                  }}
                >
                  <ChainIcon
                    chain={chain.type}
                    evmChainId={chain.evmChainId}
                    size={24}
                  />
                  <div className="chain-item-info">
                    <span className="chain-item-name">{chain.name}</span>
                    <span className="chain-item-symbol">{chain.symbol}</span>
                  </div>
                  {isActive && <CheckIcon size={16} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

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
  activeWalletId,
  activeWalletLabel,
  walletCount,
  activeChain,
  activeEVMChain,
  evmAddress,
  onSend,
  onSendToken,
  onReceive,
  onHistory,
  onSwap,
  onLock,
  onManageWallets,
  onWalletSwitch,
  onChainChange,
  hideBalances,
  onToggleHideBalances,
  privacyEnabled,
}) => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [evmBalance, setEvmBalance] = useState<EVMBalance | null>(null);
  const [tokens, setTokens] = useState<SPLTokenBalance[]>([]);
  const [evmTokens, setEvmTokens] = useState<EVMTokenBalance[]>([]);
  const [history, setHistory] = useState<TransactionHistoryItem[]>([]);
  const [connections, setConnections] = useState<ConnectionRecordUI[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'activity' | 'tokens' | 'security'>('activity');
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [solChange24h, setSolChange24h] = useState<number | null>(null);
  const [ethChange24h, setEthChange24h] = useState<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const prevSolPriceRef = useRef<number | null>(null);
  const prevEthPriceRef = useRef<number | null>(null);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [showAddToken, setShowAddToken] = useState(false);
  const [addTokenMint, setAddTokenMint] = useState('');
  const [addTokenSymbol, setAddTokenSymbol] = useState('');
  const [addTokenName, setAddTokenName] = useState('');
  const [addTokenError, setAddTokenError] = useState('');
  const [addingToken, setAddingToken] = useState(false);
  
  // Add token form state
  const [autoDetecting, setAutoDetecting] = useState(false);
  
  // Token search state
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(tokenSearchQuery, 250);
  
  // Hide dust tokens (< $1 value)
  const [hideDustTokens, setHideDustTokens] = useState(false);

  // Current display address based on active chain
  const displayAddress = activeChain === 'solana' ? address : (evmAddress || address);

  // Get native symbol for current chain
  const getNativeSymbol = () => {
    if (activeChain === 'solana') return 'SOL';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.symbol || 'ETH';
  };

  // Get chain display name
  const getChainDisplayName = () => {
    if (activeChain === 'solana') return 'Solana';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };

  // Filtered tokens based on search query
  const filteredSPLTokens = useMemo((): SPLTokenWithMatch[] => {
    let filtered = filterSPLTokens(tokens, { query: debouncedSearchQuery });
    // Apply dust filter if enabled
    if (hideDustTokens) {
      filtered = filtered.filter(token => {
        const price = tokenPrices[token.mint];
        const value = price ? token.uiBalance * price : 0;
        return value >= 1;
      });
    }
    return filtered;
  }, [tokens, debouncedSearchQuery, hideDustTokens, tokenPrices]);

  const filteredEVMTokens = useMemo((): EVMTokenWithMatch[] => {
    let filtered = filterEVMTokens(evmTokens, { query: debouncedSearchQuery });
    // EVM tokens don't have prices yet, so skip dust filter for now
    return filtered;
  }, [evmTokens, debouncedSearchQuery]);

  // Check if native tokens match search (also check dust filter)
  const solTokenMatch = useMemo((): NativeTokenWithMatch | null => {
    // Check dust filter for SOL
    if (hideDustTokens && balance && solPrice !== null) {
      const solValue = balance.sol * solPrice;
      if (solValue < 1) return null;
    }
    return filterNativeToken(
      { type: 'native', chain: 'solana', symbol: 'SOL', name: 'Solana' },
      debouncedSearchQuery
    );
  }, [debouncedSearchQuery, hideDustTokens, balance, solPrice]);

  const ethTokenMatch = useMemo((): NativeTokenWithMatch | null => {
    if (!evmAddress) return null;
    // Check dust filter for ETH
    if (hideDustTokens && evmBalance && ethPrice !== null) {
      const ethValue = evmBalance.formatted * ethPrice;
      if (ethValue < 1) return null;
    }
    return filterNativeToken(
      { type: 'native', chain: 'evm', symbol: 'ETH', name: 'Ethereum' },
      debouncedSearchQuery
    );
  }, [evmAddress, debouncedSearchQuery, hideDustTokens, evmBalance, ethPrice]);

  // Check if we have any search results (for active chain only)
  const hasTokenSearchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim() && !hideDustTokens) return true; // No filters = show all
    if (activeChain === 'solana') {
      return solTokenMatch !== null || filteredSPLTokens.length > 0;
    } else {
      return ethTokenMatch !== null || filteredEVMTokens.length > 0;
    }
  }, [debouncedSearchQuery, hideDustTokens, activeChain, solTokenMatch, ethTokenMatch, filteredSPLTokens, filteredEVMTokens]);

  // Count visible tokens for tab badge (for active chain only)
  const visibleTokenCount = useMemo(() => {
    if (activeChain === 'solana') {
      let count = solTokenMatch !== null ? 1 : 0;
      count += filteredSPLTokens.length;
      return count;
    } else {
      let count = ethTokenMatch !== null ? 1 : 0;
      count += filteredEVMTokens.length;
      return count;
    }
  }, [activeChain, solTokenMatch, ethTokenMatch, filteredSPLTokens, filteredEVMTokens]);

  // Calculate total portfolio value in USD (active chain only: native + tokens)
  const totalPortfolioValue = useMemo(() => {
    let total = 0;
    
    if (activeChain === 'solana') {
      // Add SOL native value
      if (balance && solPrice !== null) {
        total += balance.sol * solPrice;
      }
      // Add SPL token values
      tokens.forEach((token) => {
        const price = tokenPrices[token.mint];
        if (price) {
          total += token.uiBalance * price;
        }
      });
    } else if (activeChain === 'evm') {
      // Add ETH native value
      if (evmBalance && ethPrice !== null) {
        total += evmBalance.formatted * ethPrice;
      }
      // EVM token values (prices not fetched separately yet)
    }
    
    return total;
  }, [activeChain, balance, solPrice, evmBalance, ethPrice, tokens, tokenPrices]);

  const fetchData = useCallback(async (forceRefresh: boolean = false) => {
    setLoadingBalance(true);

    // Always fetch Solana balance
    const balanceRes = await sendToBackground({ type: 'WALLET_GET_BALANCE', payload: undefined });
    if (balanceRes.success && balanceRes.data) {
      setBalance(balanceRes.data as WalletBalance);
    }

    // Always fetch EVM balance if we have an EVM address
    if (evmAddress) {
      const evmBalanceRes = await sendToBackground({ 
        type: 'WALLET_GET_EVM_BALANCE', 
        payload: { evmChainId: activeEVMChain || 'ethereum' } 
      });
      if (evmBalanceRes.success && evmBalanceRes.data) {
        setEvmBalance(evmBalanceRes.data as EVMBalance);
      }
    }

    // Fetch history based on chain
    if (activeChain === 'solana') {
      const historyRes = await sendToBackground({
        type: 'WALLET_GET_HISTORY',
        payload: { limit: 5, forceRefresh },
      });
      if (historyRes.success && historyRes.data) {
        const result = historyRes.data as { transactions: TransactionHistoryItem[] };
        setHistory(result.transactions);
      }
    } else if (evmAddress) {
      // EVM history (note: limited without indexer API) - only if we have an EVM address
      const evmHistoryRes = await sendToBackground({
        type: 'WALLET_GET_EVM_HISTORY',
        payload: { evmChainId: activeEVMChain, limit: 5 },
      });
      if (evmHistoryRes.success && evmHistoryRes.data) {
        // For now, EVM history is limited - show empty
        setHistory([]);
      }
    } else {
      // No EVM address available (e.g., Solana-only private key import)
      setHistory([]);
    }

    // Always fetch tokens from ALL chains
    const tokensRes = await sendToBackground({ type: 'WALLET_GET_TOKENS', payload: undefined });
    let fetchedTokens: SPLTokenBalance[] = [];
    if (tokensRes.success && tokensRes.data) {
      fetchedTokens = tokensRes.data as SPLTokenBalance[];
      setTokens(fetchedTokens);
    }

    // Always fetch EVM tokens too
    if (evmAddress) {
      const evmTokensRes = await sendToBackground({ 
        type: 'WALLET_GET_EVM_TOKENS', 
        payload: { evmChainId: activeEVMChain || 'ethereum' } 
      });
      if (evmTokensRes.success && evmTokensRes.data) {
        setEvmTokens(evmTokensRes.data as EVMTokenBalance[]);
      }
    }

    const connectionsRes = await sendToBackground({
      type: 'SECURITY_GET_CONNECTIONS',
      payload: { limit: 10 },
    });
    if (connectionsRes.success && connectionsRes.data) {
      setConnections(connectionsRes.data as ConnectionRecordUI[]);
    }

    // Fetch SOL price with 24h change
    const priceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
    if (priceRes.success && priceRes.data) {
      const data = priceRes.data as { price: number; change24h: number | null };
      setSolPrice(data.price);
      setSolChange24h(data.change24h);
    }

    // Fetch ETH price with 24h change
    const ethPriceRes = await sendToBackground({ type: 'GET_ETH_PRICE', payload: undefined });
    if (ethPriceRes.success && ethPriceRes.data) {
      const data = ethPriceRes.data as { price: number; change24h: number | null };
      setEthPrice(data.price);
      setEthChange24h(data.change24h);
    }

    // Fetch token prices if we have tokens
    if (fetchedTokens.length > 0) {
      const mints = fetchedTokens.map(t => t.mint);
      const tokenPricesRes = await sendToBackground({ 
        type: 'GET_TOKEN_PRICES', 
        payload: { mints } 
      });
      if (tokenPricesRes.success && tokenPricesRes.data) {
        setTokenPrices(tokenPricesRes.data as Record<string, number>);
      }
    }

    // Only stop loading after all data (balance + prices) are fetched
    setLoadingBalance(false);
  }, [activeChain, activeEVMChain]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time price updates every 5 seconds with flash animation
  useEffect(() => {
    const updatePrices = async () => {
      // Fetch SOL price with 24h change
      const solPriceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
      if (solPriceRes.success && solPriceRes.data) {
        const data = solPriceRes.data as { price: number; change24h: number | null };
        const newPrice = data.price;
        
        // Compare with previous price and trigger flash (only for active chain)
        if (activeChain === 'solana' && prevSolPriceRef.current !== null && newPrice !== prevSolPriceRef.current) {
          if (newPrice > prevSolPriceRef.current) {
            setPriceFlash('up');
          } else {
            setPriceFlash('down');
          }
          setTimeout(() => setPriceFlash(null), 1200);
        }
        
        prevSolPriceRef.current = newPrice;
        setSolPrice(newPrice);
        setSolChange24h(data.change24h);
      }

      // Fetch ETH price with 24h change
      const ethPriceRes = await sendToBackground({ type: 'GET_ETH_PRICE', payload: undefined });
      if (ethPriceRes.success && ethPriceRes.data) {
        const data = ethPriceRes.data as { price: number; change24h: number | null };
        const newPrice = data.price;
        
        // Compare with previous price and trigger flash (only for active chain)
        if (activeChain === 'evm' && prevEthPriceRef.current !== null && newPrice !== prevEthPriceRef.current) {
          if (newPrice > prevEthPriceRef.current) {
            setPriceFlash('up');
          } else {
            setPriceFlash('down');
          }
          setTimeout(() => setPriceFlash(null), 1200);
        }
        
        prevEthPriceRef.current = newPrice;
        setEthPrice(newPrice);
        setEthChange24h(data.change24h);
      }
    };

    // Update prices every 5 seconds
    const interval = setInterval(updatePrices, 5000);

    return () => clearInterval(interval);
  }, [activeChain]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(true); // Force refresh to bypass cache
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
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddToken = async () => {
    if (!addTokenMint.trim()) {
      setAddTokenError('Please enter a token mint address');
      return;
    }

    setAddingToken(true);
    setAddTokenError('');

    try {
      const res = await sendToBackground({
        type: 'WALLET_ADD_TOKEN',
        payload: {
          mint: addTokenMint.trim(),
          symbol: addTokenSymbol.trim() || undefined,
          name: addTokenName.trim() || undefined,
        },
      });

      if (res.success) {
        setShowAddToken(false);
        setAddTokenMint('');
        setAddTokenSymbol('');
        setAddTokenName('');
        handleRefresh();
      } else {
        setAddTokenError(res.error || 'Failed to add token');
      }
    } catch {
      setAddTokenError('Failed to add token');
    } finally {
      setAddingToken(false);
    }
  };

  const handleRemoveToken = async (mint: string) => {
    try {
      await sendToBackground({
        type: 'WALLET_REMOVE_TOKEN',
        payload: { mint },
      });
      handleRefresh();
    } catch {
      // Silently fail
    }
  };


  // Auto-detect token metadata when address is pasted
  const debouncedAddTokenMint = useDebounce(addTokenMint, 500);
  useEffect(() => {
    if (!debouncedAddTokenMint.trim() || !showAddToken) return;
    
    const trimmedMint = debouncedAddTokenMint.trim();
    // Check if it looks like a valid address (Solana: 32-44 chars, EVM: 42 chars starting with 0x)
    const isValidSolana = trimmedMint.length >= 32 && trimmedMint.length <= 44;
    const isValidEVM = trimmedMint.length === 42 && trimmedMint.startsWith('0x');
    if (!isValidSolana && !isValidEVM) return;
    
    const autoDetect = async () => {
      setAutoDetecting(true);
      try {
        const res = await sendToBackground({
          type: 'WALLET_GET_TOKEN_METADATA',
          payload: { mint: trimmedMint },
        });
        if (res.success && res.data) {
          const metadata = res.data as { symbol: string; name: string; logoUri?: string };
          if (!addTokenSymbol && metadata.symbol) setAddTokenSymbol(metadata.symbol);
          if (!addTokenName && metadata.name) setAddTokenName(metadata.name);
        }
      } catch (err) {
        console.error('Auto-detect failed:', err);
      } finally {
        setAutoDetecting(false);
      }
    };
    
    autoDetect();
  }, [debouncedAddTokenMint, showAddToken, addTokenSymbol, addTokenName]);

  // Reset add token form state when closing
  const handleCloseAddToken = () => {
    setShowAddToken(false);
    setAddTokenMint('');
    setAddTokenSymbol('');
    setAddTokenName('');
    setAddTokenError('');
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

  // Get current balance value based on chain
  const getCurrentBalance = () => {
    if (activeChain === 'solana') {
      return balance ? formatSol(balance.sol) : '0';
    }
    return evmBalance ? formatSol(evmBalance.formatted) : '0';
  };

  // Check if all dashboard data is still loading
  // loadingBalance tracks the full data fetch (balance, tokens, prices, history, connections)
  // We also verify the active chain's required display data is available
  // For Solana: also wait for token prices if there are tokens (needed for portfolio calculation)
  const isAllDataLoading = loadingBalance || 
    (activeChain === 'solana'
      ? (balance === null || solPrice === null || (tokens.length > 0 && Object.keys(tokenPrices).length === 0))
      : (evmBalance === null || ethPrice === null));

  return (
    <>
      {isAllDataLoading && (
        <div className="wallet-loading-overlay">
          <div className="wallet-loading-spinner"></div>
        </div>
      )}
      <div className="wallet-header">
        <div className="wallet-header-left">
          <button 
            className="wallet-selector-btn"
            onClick={onManageWallets}
            title="Manage wallets"
          >
            <WalletIcon size={14} />
            <span className="wallet-selector-label">
              {activeWalletLabel || 'Wallet'}
            </span>
            {walletCount > 1 && (
              <span className="wallet-count-badge">{walletCount}</span>
            )}
          </button>
        </div>
        <div className="wallet-header-actions">
          <button
            className="icon-btn hide-balance-btn"
            onClick={onToggleHideBalances}
            title={hideBalances ? 'Show balances' : 'Hide balances'}
            aria-label={hideBalances ? 'Show balances' : 'Hide balances'}
            aria-pressed={hideBalances}
          >
            {hideBalances ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
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

      {/* Network selector on its own row */}
      <div className="network-selector-row">
        <span className="network-selector-label">Network</span>
        <ChainSelector
          activeChain={activeChain}
          activeEVMChain={activeEVMChain}
          onChainChange={onChainChange}
        />
      </div>

      <div className="balance-card">
        {loadingBalance ? (
          <div className="balance-amount">
            <span className="balance-value">...</span>
          </div>
        ) : (
          <div className="balance-amount">
            {/* Total USD value (active chain: native + tokens) */}
            <span className={`balance-value ${priceFlash === 'up' ? 'price-flash-up' : priceFlash === 'down' ? 'price-flash-down' : ''}`}>
              {(activeChain === 'solana' ? solPrice !== null : ethPrice !== null)
                ? formatHiddenUsd(formatUsd(totalPortfolioValue), hideBalances)
                : '$--'}
            </span>
            {/* 24h change indicator - based on native token price change */}
            {!hideBalances && (
              <span className={`balance-change ${
                activeChain === 'solana' 
                  ? (solChange24h !== null ? (solChange24h >= 0 ? 'positive' : 'negative') : '')
                  : (ethChange24h !== null ? (ethChange24h >= 0 ? 'positive' : 'negative') : '')
              }`}>
                {activeChain === 'solana' && solChange24h !== null && balance && solPrice !== null && (() => {
                  const currentValue = balance.sol * solPrice;
                  const dollarChange = currentValue * (solChange24h / (100 + solChange24h));
                  const sign = solChange24h >= 0 ? '+' : '';
                  return (
                    <>
                      {sign}{formatUsd(dollarChange)} ({sign}{solChange24h.toFixed(2)}%) <span className="change-period">24h</span>
                    </>
                  );
                })()}
                {activeChain === 'evm' && ethChange24h !== null && evmBalance && ethPrice !== null && (() => {
                  const currentValue = evmBalance.formatted * ethPrice;
                  const dollarChange = currentValue * (ethChange24h / (100 + ethChange24h));
                  const sign = ethChange24h >= 0 ? '+' : '';
                  return (
                    <>
                      {sign}{formatUsd(dollarChange)} ({sign}{ethChange24h.toFixed(2)}%) <span className="change-period">24h</span>
                    </>
                  );
                })()}
              </span>
            )}
          </div>
        )}
        <div className="address-display" onClick={copyAddress} title="Click to copy">
          <span className="address-text">{truncateAddress(displayAddress, 6)}</span>
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
        <button className="wallet-action-btn" onClick={onSwap}>
          <SwapIcon size={20} />
          <span className="action-label">Swap</span>
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
          Tokens ({debouncedSearchQuery.trim() ? visibleTokenCount : (activeChain === 'solana' ? 1 + tokens.length : 1 + evmTokens.length)})
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
          {activeChain === 'solana' ? (
            history.length === 0 ? (
              <div className="empty-state">No transactions yet</div>
            ) : (
              history.map((tx) => {
                // Get token info from loaded tokens if available
                const tokenMeta = tx.tokenInfo ? tokens.find(t => t.mint === tx.tokenInfo?.mint) : null;
                const tokenSymbol = (tokenMeta?.symbol || tx.tokenInfo?.mint.slice(0, 4) + '...' || 'Token').toUpperCase();
                const tokenLogoUri = tokenMeta?.logoUri;
                
                return (
                  <div
                    key={tx.signature}
                    className="tx-item"
                    onClick={() => openExplorerUrl('tx', tx.signature, 'solana', undefined, { testnet: network === 'devnet' })}
                  >
                    <div className={`tx-icon ${tx.direction}`}>
                      {tx.direction === 'sent' ? <SendIcon size={16} /> : tx.direction === 'received' ? <ReceiveIcon size={16} /> : <SwapIcon size={16} />}
                    </div>
                    <div className="tx-details">
                      <div className="tx-type">
                        {tx.tokenInfo ? `${tx.direction === 'sent' ? 'Sent' : 'Received'} ${tokenSymbol}` : tx.type}
                      </div>
                      <div className="tx-time">{formatTime(tx.timestamp)}</div>
                    </div>
                    <div className="tx-amount">
                      <div className={`tx-value ${tx.direction}`}>
                        {tx.tokenInfo 
                          ? formatHiddenTxAmount(tx.tokenInfo.amount, tx.direction, tokenSymbol, (val) => val.toLocaleString(undefined, { maximumFractionDigits: 4 }), hideBalances)
                          : formatHiddenTxAmount(tx.amountSol, tx.direction, 'SOL', formatSol, hideBalances)
                        }
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            <div className="empty-state">
              <p>Transaction history for EVM chains requires viewing on the block explorer.</p>
              <ExplorerLinkIcon
                type="address"
                id={evmAddress || ''}
                chain="evm"
                evmChainId={activeEVMChain || 'ethereum'}
                variant="button"
                label="View on Explorer"
                className="btn btn-secondary"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'tokens' && (
        <div className="tokens-tab">
          {showAddToken ? (
            <div className="add-token-form">
              <div className="form-header">
                <h3>Add Custom Token</h3>
                <button className="close-btn" onClick={handleCloseAddToken}>
                  <CloseIcon size={14} />
                </button>
              </div>
              
              <div className="form-group">
                <label className="form-label">
                  Token {activeChain === 'evm' ? 'Contract' : 'Mint'} Address *
                  {autoDetecting && <span className="auto-detecting"> (detecting...)</span>}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={activeChain === 'evm' ? 'Enter token contract address...' : 'Enter token mint address...'}
                  value={addTokenMint}
                  onChange={(e) => setAddTokenMint(e.target.value)}
                  style={{ textAlign: 'left' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Symbol
                  {addTokenSymbol && !autoDetecting && <span className="auto-detected"> (auto-detected)</span>}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. USDC"
                  value={addTokenSymbol}
                  onChange={(e) => setAddTokenSymbol(e.target.value)}
                  style={{ textAlign: 'left' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Name
                  {addTokenName && !autoDetecting && <span className="auto-detected"> (auto-detected)</span>}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. USD Coin"
                  value={addTokenName}
                  onChange={(e) => setAddTokenName(e.target.value)}
                  style={{ textAlign: 'left' }}
                />
              </div>
              {addTokenError && <div className="form-error">{addTokenError}</div>}
              <button
                className="btn btn-primary btn-block"
                onClick={handleAddToken}
                disabled={addingToken || !addTokenMint.trim()}
              >
                {addingToken ? 'Adding...' : 'Add Token'}
              </button>
            </div>
          ) : (
            <>
              {/* Token Search Bar */}
              <div className="token-search-bar">
                <SearchIcon size={16} />
                <input
                  type="text"
                  className="token-search-input"
                  placeholder="Search by name, symbol, or address..."
                  value={tokenSearchQuery}
                  onChange={(e) => setTokenSearchQuery(e.target.value)}
                  aria-label="Search tokens"
                />
                {tokenSearchQuery && (
                  <button
                    className="token-search-clear"
                    onClick={() => setTokenSearchQuery('')}
                    aria-label="Clear search"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
              
              {/* Hide Dust Tokens Toggle */}
              <div className="token-filter-row">
                <button
                  className={`token-filter-btn ${hideDustTokens ? 'active' : ''}`}
                  onClick={() => setHideDustTokens(!hideDustTokens)}
                  title={hideDustTokens ? 'Show all tokens' : 'Hide tokens worth less than $1'}
                >
                  <EyeOffIcon size={14} />
                  <span>Hide &lt;$1</span>
                </button>
              </div>

              {/* Token List */}
              {hasTokenSearchResults ? (
                <div className="token-list">
                  {/* SOL - Shown when Solana chain is active and matches search */}
                  {activeChain === 'solana' && solTokenMatch && (() => {
                    const canSend = balance && balance.sol > 0;
                    return (
                      <div 
                        className={`token-item sol-token ${canSend ? 'token-item-clickable' : ''}`}
                        onClick={() => canSend && onSend()}
                        title={canSend ? 'Send SOL' : undefined}
                        style={{ cursor: canSend ? 'pointer' : 'default' }}
                      >
                        <TokenIcon
                          symbol="SOL"
                          logoUri="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                          address="So11111111111111111111111111111111111111112"
                          chain="solana"
                          size={32}
                          className="token-logo"
                        />
                        <div className="token-info">
                          <div className="token-symbol">
                            {solTokenMatch.searchMatch?.matchField === 'symbol' ? (
                              <HighlightedText 
                                text="SOL" 
                                segments={highlightMatch('SOL', solTokenMatch.searchMatch.matchStart, solTokenMatch.searchMatch.matchLength)} 
                              />
                            ) : 'SOL'}
                          </div>
                          <div className="token-name">
                            {solTokenMatch.searchMatch?.matchField === 'name' ? (
                              <HighlightedText 
                                text="Solana" 
                                segments={highlightMatch('Solana', solTokenMatch.searchMatch.matchStart, solTokenMatch.searchMatch.matchLength)} 
                              />
                            ) : 'Solana'}
                          </div>
                        </div>
                        <div className="token-balance">
                          <div className={`token-balance-value ${priceFlash === 'up' ? 'price-flash-up' : priceFlash === 'down' ? 'price-flash-down' : ''}`}>
                            {solPrice !== null && balance
                              ? formatHiddenUsd(formatUsd(balance.sol * solPrice), hideBalances)
                              : '$--'}
                          </div>
                          <div className="token-balance-secondary">
                            {hideBalances ? HIDDEN_BALANCE : (balance ? formatSol(balance.sol) : '0')} SOL
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ETH - Shown when EVM chain is active and matches search */}
                  {activeChain === 'evm' && ethTokenMatch && (() => {
                    const canSend = evmBalance && evmBalance.formatted > 0;
                    return (
                      <div 
                        className={`token-item ${canSend ? 'token-item-clickable' : ''}`}
                        onClick={() => canSend && onSend()}
                        title={canSend ? 'Send ETH' : undefined}
                        style={{ cursor: canSend ? 'pointer' : 'default' }}
                      >
                        <TokenIcon
                          symbol="ETH"
                          logoUri="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png"
                          address="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
                          chain="ethereum"
                          size={32}
                          className="token-logo"
                        />
                        <div className="token-info">
                          <div className="token-symbol">
                            {ethTokenMatch.searchMatch?.matchField === 'symbol' ? (
                              <HighlightedText 
                                text="ETH" 
                                segments={highlightMatch('ETH', ethTokenMatch.searchMatch.matchStart, ethTokenMatch.searchMatch.matchLength)} 
                              />
                            ) : 'ETH'}
                          </div>
                          <div className="token-name">
                            {ethTokenMatch.searchMatch?.matchField === 'name' ? (
                              <HighlightedText 
                                text="Ethereum" 
                                segments={highlightMatch('Ethereum', ethTokenMatch.searchMatch.matchStart, ethTokenMatch.searchMatch.matchLength)} 
                              />
                            ) : 'Ethereum'}
                          </div>
                        </div>
                        <div className="token-balance">
                          <div className={`token-balance-value ${priceFlash === 'up' ? 'price-flash-up' : priceFlash === 'down' ? 'price-flash-down' : ''}`}>
                            {ethPrice !== null && evmBalance
                              ? formatHiddenUsd(formatUsd(evmBalance.formatted * ethPrice), hideBalances)
                              : '$--'}
                          </div>
                          <div className="token-balance-secondary">
                            {hideBalances ? HIDDEN_BALANCE : (evmBalance ? formatSol(evmBalance.formatted) : '0')} ETH
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* SPL Tokens - Only shown when Solana chain is active */}
                  {activeChain === 'solana' && filteredSPLTokens.map((token) => {
                    const tokenPrice = tokenPrices[token.mint];
                    const tokenValue = tokenPrice ? token.uiBalance * tokenPrice : null;
                    const canDelete = token.uiBalance === 0;
                    const match = token.searchMatch;
                    const canSend = token.uiBalance > 0;
                    return (
                      <div 
                        key={token.mint} 
                        className={`token-item ${canSend ? 'token-item-clickable' : ''}`}
                        onClick={() => {
                          if (canSend) {
                            onSendToken({
                              mint: token.mint,
                              symbol: token.symbol,
                              name: token.name,
                              decimals: token.decimals,
                              uiBalance: token.uiBalance,
                              logoUri: token.logoUri,
                              tokenAccount: token.tokenAccount,
                              chain: 'solana',
                            });
                          }
                        }}
                        title={canSend ? `Send ${token.symbol.toUpperCase()}` : undefined}
                        style={{ cursor: canSend ? 'pointer' : 'default' }}
                      >
                        <TokenIcon
                          symbol={token.symbol}
                          logoUri={token.logoUri}
                          address={token.mint}
                          chain="solana"
                          size={32}
                          className="token-logo"
                        />
                        <div className="token-info">
                          <div className="token-symbol">
                            {match?.matchField === 'symbol' ? (
                              <HighlightedText 
                                text={token.symbol} 
                                segments={highlightMatch(token.symbol, match.matchStart, match.matchLength)} 
                              />
                            ) : token.symbol}
                          </div>
                          <div className="token-name">
                            {match?.matchField === 'name' ? (
                              <HighlightedText 
                                text={token.name} 
                                segments={highlightMatch(token.name, match.matchStart, match.matchLength)} 
                              />
                            ) : token.name}
                          </div>
                          {match?.matchField === 'address' && (
                            <div className="token-address-match">
                              <HighlightedText 
                                text={token.mint} 
                                segments={highlightMatch(token.mint, match.matchStart, match.matchLength)} 
                              />
                            </div>
                          )}
                        </div>
                        <div className="token-balance">
                          <div className="token-balance-value">
                            {tokenValue !== null
                              ? formatHiddenUsd(formatUsd(tokenValue), hideBalances)
                              : '$--'}
                          </div>
                          <div className="token-balance-secondary">
                            {hideBalances ? HIDDEN_BALANCE : token.uiBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {token.symbol.toUpperCase()}
                          </div>
                        </div>
                        <span onClick={(e) => e.stopPropagation()}>
                          <ExplorerLinkIcon
                            type="token"
                            id={token.mint}
                            chain="solana"
                            testnet={network === 'devnet'}
                            size={14}
                            title={`View ${token.symbol.toUpperCase()} on explorer`}
                          />
                        </span>
                        {canDelete && (
                          <button
                            className="token-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveToken(token.mint);
                            }}
                            title="Remove token"
                          >
                            <TrashIcon size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* ERC20 Tokens - Only shown when EVM chain is active */}
                  {activeChain === 'evm' && filteredEVMTokens.map((token) => {
                    const match = token.searchMatch;
                    const canSend = token.uiBalance > 0;
                    return (
                      <div 
                        key={token.address} 
                        className={`token-item ${canSend ? 'token-item-clickable' : ''}`}
                        onClick={() => {
                          if (canSend) {
                            onSendToken({
                              address: token.address,
                              symbol: token.symbol,
                              name: token.name,
                              decimals: token.decimals,
                              uiBalance: token.uiBalance,
                              logoUri: token.logoUri,
                              chain: 'evm',
                            });
                          }
                        }}
                        title={canSend ? `Send ${token.symbol.toUpperCase()}` : undefined}
                        style={{ cursor: canSend ? 'pointer' : 'default' }}
                      >
                        <TokenIcon
                          symbol={token.symbol}
                          logoUri={token.logoUri}
                          address={token.address}
                          chain={activeEVMChain || 'ethereum'}
                          size={32}
                          className="token-logo"
                        />
                        <div className="token-info">
                          <div className="token-symbol">
                            {match?.matchField === 'symbol' ? (
                              <HighlightedText 
                                text={token.symbol} 
                                segments={highlightMatch(token.symbol, match.matchStart, match.matchLength)} 
                              />
                            ) : token.symbol}
                          </div>
                          <div className="token-name">
                            {match?.matchField === 'name' ? (
                              <HighlightedText 
                                text={token.name} 
                                segments={highlightMatch(token.name, match.matchStart, match.matchLength)} 
                              />
                            ) : token.name}
                          </div>
                          {match?.matchField === 'address' && (
                            <div className="token-address-match">
                              <HighlightedText 
                                text={token.address} 
                                segments={highlightMatch(token.address, match.matchStart, match.matchLength)} 
                              />
                            </div>
                          )}
                        </div>
                        <div className="token-balance">
                          <div className="token-balance-value">
                            {hideBalances ? HIDDEN_BALANCE : token.uiBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </div>
                        </div>
                        <span onClick={(e) => e.stopPropagation()}>
                          <ExplorerLinkIcon
                            type="token"
                            id={token.address}
                            chain="evm"
                            evmChainId={activeEVMChain || 'ethereum'}
                            size={14}
                            title={`View ${token.symbol.toUpperCase()} on explorer`}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Empty state when search has no results */
                <div className="token-search-empty">
                  <SearchIcon size={32} />
                  <p className="token-search-empty-title">No tokens found</p>
                  <p className="token-search-empty-text">
                    No tokens match "{debouncedSearchQuery}"
                  </p>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setTokenSearchQuery('')}
                  >
                    Clear search
                  </button>
                </div>
              )}
              <button 
                className="btn btn-secondary btn-block add-token-btn"
                onClick={() => setShowAddToken(true)}
              >
                <PlusIcon size={14} />
                Add Custom Token
              </button>
            </>
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
          <div className={`security-info ${!privacyEnabled ? 'inactive' : ''}`}>
            <div className="security-info-icon">
              <ShieldCheckIcon size={16} />
            </div>
            <div className="security-info-text">
              <strong>{privacyEnabled ? 'Wallet Security Active' : 'Wallet Security Off'}</strong>
              <p>
                {privacyEnabled 
                  ? 'AINTIVIRUS monitors wallet connections and analyzes transactions. This is informational only and cannot guarantee safety.'
                  : 'Wallet security is currently disabled. Enable it in Settings to monitor wallet connections and analyze transactions.'}
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
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  evmAddress: string | null;
  onClose: () => void;
  onSuccess: () => void;
  hideBalances: boolean;
  /** Pre-selected token for sending (when clicking on a token in the list) */
  selectedToken?: SelectedTokenForSend | null;
}

const SendForm: React.FC<SendFormProps> = ({ 
  address, 
  activeChain, 
  activeEVMChain,
  evmAddress,
  onClose, 
  onSuccess,
  hideBalances,
  selectedToken,
}) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [evmFeeEstimate, setEvmFeeEstimate] = useState<EVMFeeEstimate | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [evmBalance, setEvmBalance] = useState<EVMBalance | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<SendTransactionResult | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showLargeTransferWarning, setShowLargeTransferWarning] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<{
    warnOnLargeTransfers: boolean;
    largeTransferThreshold: number;
  }>({ warnOnLargeTransfers: true, largeTransferThreshold: 100 });
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [amountMode, setAmountMode] = useState<'token' | 'usd'>('token');

  // Load security settings and token price on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load security settings
        const res = await sendToBackground({ type: 'SECURITY_GET_SETTINGS', payload: undefined });
        if (res.success && res.data) {
          const settings = res.data as { warnOnLargeTransfers?: boolean; largeTransferThreshold?: number };
          setSecuritySettings({
            warnOnLargeTransfers: settings.warnOnLargeTransfers ?? true,
            largeTransferThreshold: settings.largeTransferThreshold ?? 100,
          });
        }

        // Load token price
        if (selectedToken?.chain === 'solana' && selectedToken.mint && activeChain === 'solana') {
          // For SPL tokens, fetch the specific token price
          const priceRes = await sendToBackground({ 
            type: 'GET_TOKEN_PRICES', 
            payload: { mints: [selectedToken.mint] } 
          });
          if (priceRes.success && priceRes.data) {
            const prices = priceRes.data as Record<string, number>;
            if (prices[selectedToken.mint]) {
              setTokenPrice(prices[selectedToken.mint]);
            }
          }
        } else if (selectedToken?.chain === 'evm' && activeChain === 'evm') {
          // For ERC20 tokens, we don't have a price endpoint yet, so use ETH price as fallback
          // TODO: Add ERC20 token price fetching
          const priceRes = await sendToBackground({ type: 'GET_ETH_PRICE', payload: undefined });
          if (priceRes.success && priceRes.data) {
            const data = priceRes.data as { price: number; change24h: number | null };
            // For now, we don't have individual token prices for ERC20, so set to null
            setTokenPrice(null);
          }
        } else if (activeChain === 'solana') {
          const priceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
          if (priceRes.success && priceRes.data) {
            const data = priceRes.data as { price: number; change24h: number | null };
            setTokenPrice(data.price);
          }
        } else {
          const priceRes = await sendToBackground({ type: 'GET_ETH_PRICE', payload: undefined });
          if (priceRes.success && priceRes.data) {
            const data = priceRes.data as { price: number; change24h: number | null };
            setTokenPrice(data.price);
          }
        }
      } catch (e) {
        console.warn('Failed to load security settings or price:', e);
      }
    };
    loadData();
  }, [activeChain, selectedToken]);

  // Calculate USD value of the transfer
  const getTransferUsdValue = (tokenAmount: number): number => {
    if (!tokenPrice || typeof tokenPrice !== 'number' || isNaN(tokenPrice) || isNaN(tokenAmount)) return 0;
    return tokenAmount * tokenPrice;
  };

  // Convert USD to token amount
  const usdToToken = (usdAmount: number): number => {
    if (!tokenPrice || tokenPrice === 0 || typeof tokenPrice !== 'number' || isNaN(tokenPrice)) return 0;
    const result = usdAmount / tokenPrice;
    return isNaN(result) ? 0 : result;
  };

  // Get the actual token amount to send (converts if in USD mode)
  const getTokenAmountToSend = (): number => {
    const inputAmount = parseFloat(amount) || 0;
    if (amountMode === 'usd') {
      return usdToToken(inputAmount);
    }
    return inputAmount;
  };

  // Get display conversion (shows the opposite of current mode)
  const getConversionDisplay = (): string => {
    const inputAmount = parseFloat(amount) || 0;
    if (inputAmount === 0 || !tokenPrice) return '';
    
    // Use the token symbol for SPL tokens, otherwise use native symbol
    const tokenSymbol = (selectedToken ? selectedToken.symbol : getNativeSymbol()).toUpperCase();
    
    if (amountMode === 'usd') {
      const tokenAmount = usdToToken(inputAmount);
      return `≈ ${tokenAmount.toFixed(6)} ${tokenSymbol}`;
    } else {
      const usdAmount = getTransferUsdValue(inputAmount);
      return `≈ $${usdAmount.toFixed(2)} USD`;
    }
  };

  // Recent recipients hook for dropdown
  const { addRecipient } = useRecentRecipients(
    activeChain,
    'mainnet-beta', // TODO: Get actual network from wallet state
    activeEVMChain,
    recipient // Filter query
  );

  // Get native symbol for current chain
  const getNativeSymbol = () => {
    if (activeChain === 'solana') return 'SOL';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.symbol || 'ETH';
  };

  // Determine if we're sending a token or native currency (defined early for use in JSX)
  // Supports both Solana SPL tokens and EVM ERC20 tokens
  const isSendingToken = selectedToken && (
    (selectedToken.chain === 'solana' && activeChain === 'solana') ||
    (selectedToken.chain === 'evm' && activeChain === 'evm')
  );
  const isSendingSolanaToken = selectedToken?.chain === 'solana' && activeChain === 'solana';
  const isSendingEvmToken = selectedToken?.chain === 'evm' && activeChain === 'evm';
  const symbol = (isSendingToken ? selectedToken.symbol : getNativeSymbol()).toUpperCase();

  // Get chain name for display
  const getChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };

  // Get current balance based on chain
  const getCurrentBalance = () => {
    if (activeChain === 'solana') {
      return balance?.sol || 0;
    }
    return evmBalance?.formatted || 0;
  };

  useEffect(() => {
    fetchBalance();
  }, [activeChain, activeEVMChain]);

  useEffect(() => {
    if (recipient && amount && parseFloat(amount) > 0) {
      estimateFee();
    }
  }, [recipient, amount, activeChain, activeEVMChain]);

  const fetchBalance = async () => {
    if (activeChain === 'solana') {
      const res = await sendToBackground({ type: 'WALLET_GET_BALANCE', payload: undefined });
      if (res.success && res.data) {
        setBalance(res.data as WalletBalance);
      }
    } else {
      const res = await sendToBackground({ 
        type: 'WALLET_GET_EVM_BALANCE', 
        payload: { evmChainId: activeEVMChain } 
      });
      if (res.success && res.data) {
        setEvmBalance(res.data as EVMBalance);
      }
    }
  };

  const estimateFee = async () => {
    try {
      const tokenAmount = getTokenAmountToSend();
      if (activeChain === 'solana') {
        const res = await sendToBackground({
          type: 'WALLET_ESTIMATE_FEE',
          payload: { recipient, amountSol: tokenAmount },
        });
        if (res.success && res.data) {
          setFeeEstimate(res.data as FeeEstimate);
        }
      } else {
        const res = await sendToBackground({
          type: 'WALLET_ESTIMATE_EVM_FEE',
          payload: { 
            evmChainId: activeEVMChain, 
            recipient, 
            amount: tokenAmount.toString() 
          },
        });
        if (res.success && res.data) {
          setEvmFeeEstimate(res.data as EVMFeeEstimate);
        }
      }
    } catch {
    }
  };

  const handleMax = () => {
    let maxTokenAmount = 0;
    
    // Solana rent-exempt minimum for a basic account (~0.00089 SOL)
    // We use 0.001 SOL to be safe and account for potential rent changes
    const SOLANA_RENT_EXEMPT_MIN = 0.001;
    
    if (activeChain === 'solana') {
      // For SPL tokens, use the token balance directly
      if (isSendingSolanaToken && selectedToken) {
        maxTokenAmount = selectedToken.uiBalance;
      } else if (balance) {
        // Use fee estimate if available, otherwise use a safe default (0.000015 SOL covers most transactions)
        const estimatedFee = feeEstimate?.feeSol || 0.000015;
        // Deduct: network fee + rent-exempt minimum + small buffer
        // This ensures the sender's account stays above rent-exempt threshold
        maxTokenAmount = Math.max(0, balance.sol - estimatedFee - SOLANA_RENT_EXEMPT_MIN - 0.000005);
      }
    } else {
      // For ERC20 tokens, use the token balance directly
      if (isSendingEvmToken && selectedToken) {
        maxTokenAmount = selectedToken.uiBalance;
      } else if (evmBalance) {
        // Use fee estimate if available, otherwise use a safe default
        const estimatedFee = evmFeeEstimate?.totalFeeEth || 0.002;
        maxTokenAmount = Math.max(0, evmBalance.formatted - estimatedFee);
      }
    }

    // Convert to appropriate mode
    if (amountMode === 'usd' && tokenPrice) {
      const maxUsd = maxTokenAmount * tokenPrice;
      setAmount(maxUsd.toFixed(2));
    } else {
      const decimals = isSendingToken && selectedToken ? selectedToken.decimals : (activeChain === 'solana' ? 9 : 18);
      setAmount(maxTokenAmount.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, ''));
    }
    
    // Clear any previous error when using max
    setError('');
  };

  const handleSend = async () => {
    setError('');

    if (!recipient) {
      setError('Please enter a recipient address');
      return;
    }

    const inputAmount = parseFloat(amount);
    if (isNaN(inputAmount) || inputAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Get the actual token amount to send
    const tokenAmountToSend = getTokenAmountToSend();
    
    // Validate the converted token amount (important for USD mode)
    if (isNaN(tokenAmountToSend) || tokenAmountToSend <= 0) {
      setError(amountMode === 'usd' && !tokenPrice 
        ? 'Unable to convert USD - price data unavailable. Please try again or enter amount in SOL.'
        : 'Please enter a valid amount');
      return;
    }

    // Check if amount exceeds available balance
    const availableBalance = isSendingToken && selectedToken 
      ? selectedToken.uiBalance 
      : (activeChain === 'solana' ? (balance?.sol || 0) : (evmBalance?.formatted || 0));
    
    // Solana rent-exempt minimum (~0.00089 SOL, we use 0.001 to be safe)
    const SOLANA_RENT_EXEMPT_MIN = 0.001;
    
    // For native currency, account for fees and rent-exempt minimum (Solana only)
    let effectiveMax: number;
    if (isSendingToken) {
      effectiveMax = availableBalance;
    } else if (activeChain === 'solana') {
      // Solana: deduct fee + rent-exempt minimum
      const fee = feeEstimate?.feeSol || 0.000015;
      effectiveMax = Math.max(0, availableBalance - fee - SOLANA_RENT_EXEMPT_MIN - 0.000005);
    } else {
      // EVM: just deduct fee
      const fee = evmFeeEstimate?.totalFeeEth || 0.002;
      effectiveMax = Math.max(0, availableBalance - fee);
    }
    
    if (tokenAmountToSend > availableBalance) {
      const formattedBalance = availableBalance.toLocaleString(undefined, { maximumFractionDigits: 6 });
      setError(`Insufficient balance. You have ${formattedBalance} ${symbol} available.`);
      return;
    }
    
    // Warn if sending native currency and amount + fee (+ rent for Solana) exceeds balance
    if (!isSendingToken && tokenAmountToSend > effectiveMax) {
      if (activeChain === 'solana') {
        setError(`Amount plus network fee and rent reserve exceeds your balance. Click MAX to use the maximum sendable amount.`);
      } else {
        setError(`Amount plus network fee exceeds your balance. Click MAX to use the maximum sendable amount.`);
      }
      return;
    }
    
    // For SPL tokens, check if user has enough SOL/ETH for the network fee
    if (isSendingToken) {
      const nativeBalance = activeChain === 'solana' ? (balance?.sol || 0) : (evmBalance?.formatted || 0);
      const requiredFee = activeChain === 'solana' 
        ? (feeEstimate?.feeSol || 0.00001) // Default minimum SOL fee
        : (evmFeeEstimate?.totalFeeEth || 0.001);
      
      if (nativeBalance < requiredFee) {
        const nativeSymbol = activeChain === 'solana' ? 'SOL' : getNativeSymbol();
        setError(`Insufficient ${nativeSymbol} for network fee. You need ~${requiredFee.toFixed(6)} ${nativeSymbol} but have ${nativeBalance.toFixed(6)} ${nativeSymbol}.`);
        return;
      }
    }
    
    // Check for large transfer warning based on USD value
    const usdValue = getTransferUsdValue(tokenAmountToSend);
    if (securitySettings.warnOnLargeTransfers && usdValue >= securitySettings.largeTransferThreshold) {
      setShowLargeTransferWarning(true);
      return;
    }

    // Show review screen before sending
    setShowReview(true);
  };

  const proceedAfterLargeTransferWarning = () => {
    setShowLargeTransferWarning(false);
    setShowReview(true);
  };

  const confirmSend = async () => {
    setError('');
    setSending(true);

    try {
      let res;
      const tokenAmountToSend = getTokenAmountToSend();
      
      if (activeChain === 'solana') {
        // Check if we're sending an SPL token or native SOL
        if (isSendingSolanaToken && selectedToken?.mint) {
          res = await sendToBackground({
            type: 'WALLET_SEND_SPL_TOKEN',
            payload: { 
              recipient, 
              amount: tokenAmountToSend,
              mint: selectedToken.mint,
              decimals: selectedToken.decimals,
              tokenAccount: selectedToken.tokenAccount,
            },
          });
        } else {
          res = await sendToBackground({
            type: 'WALLET_SEND_SOL',
            payload: { recipient, amountSol: tokenAmountToSend },
          });
        }
      } else {
        // EVM chain - check if we're sending an ERC20 token or native ETH
        if (isSendingEvmToken && selectedToken?.address) {
          res = await sendToBackground({
            type: 'WALLET_SEND_ERC20',
            payload: { 
              recipient, 
              amount: tokenAmountToSend.toString(),
              tokenAddress: selectedToken.address,
              decimals: selectedToken.decimals,
              evmChainId: activeEVMChain || undefined,
            },
          });
        } else {
          res = await sendToBackground({
            type: 'WALLET_SEND_ETH',
            payload: { 
              recipient, 
              amount: tokenAmountToSend.toString(),
              evmChainId: activeEVMChain 
            },
          });
        }
      }

      if (res.success && res.data) {
        setSuccess(res.data as SendTransactionResult);
        setShowReview(false);
        
        // Save recipient to recent recipients after successful send
        try {
          await addRecipient(recipient);
        } catch (e) {
          // Don't fail the transaction if saving recipient fails
          console.warn('Failed to save recent recipient:', e);
        }
      } else {
        setError(res.error || 'Transaction failed');
      }
    } catch {
      setError('Transaction failed');
    } finally {
      setSending(false);
    }
  };

  // Large Transfer Warning Modal
  if (showLargeTransferWarning) {
    return (
      <div className="send-form">
        <div className="form-header">
          <h3>⚠️ Large Transfer Warning</h3>
          <button className="close-btn" onClick={() => setShowLargeTransferWarning(false)}>
            <CloseIcon size={14} />
          </button>
        </div>
        
        <div style={{
          background: 'var(--warning-muted)',
          border: '1px solid var(--warning)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-lg)',
          marginBottom: 'var(--space-lg)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>⚠️</div>
          <h4 style={{ color: 'var(--warning)', marginBottom: 'var(--space-sm)' }}>
            Large Transfer Detected
          </h4>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
            You are about to send <strong style={{ color: 'var(--text-primary)' }}>{getTokenAmountToSend().toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })} {symbol}</strong>
            {tokenPrice && (
              <span> (~${getTransferUsdValue(getTokenAmountToSend()).toFixed(2)} USD)</span>
            )}
            {' '}which exceeds your warning threshold of <strong style={{ color: 'var(--text-primary)' }}>${securitySettings.largeTransferThreshold} USD</strong>.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Please verify this is intentional before proceeding.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => setShowLargeTransferWarning(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={proceedAfterLargeTransferWarning}
          >
            Proceed Anyway
          </button>
        </div>
        
        <p style={{ 
          color: 'var(--text-muted)', 
          fontSize: '0.6875rem', 
          textAlign: 'center',
          marginTop: 'var(--space-md)',
        }}>
          You can adjust this threshold in Settings → Wallet → Transaction Warnings
        </p>
      </div>
    );
  }

  // Transaction Review Screen
  if (showReview && !success) {
    const chain = SUPPORTED_CHAINS.find(
      c => activeChain === 'solana' 
        ? c.type === 'solana' 
        : (c.type === 'evm' && c.evmChainId === activeEVMChain)
    );
    
    const fee = activeChain === 'solana' 
      ? feeEstimate?.feeSol || 0 
      : evmFeeEstimate?.totalFeeEth || 0;

    const reviewTokenAmount = getTokenAmountToSend();
    const reviewUsdValue = getTransferUsdValue(reviewTokenAmount);

    return (
      <div className="tx-review">
        <div className="tx-review-header">
          <h3>Review Transaction</h3>
          <button className="close-btn" onClick={() => setShowReview(false)}>
            <CloseIcon size={16} />
          </button>
        </div>
        
        <div className="tx-review-chain">
          {isSendingToken && selectedToken ? (
            // Show token icon and name for SPL tokens
            <>
              <TokenIcon
                symbol={selectedToken.symbol}
                logoUri={selectedToken.logoUri}
                address={selectedToken.mint}
                chain="solana"
                size={20}
              />
              <span>{selectedToken.name || selectedToken.symbol.toUpperCase()}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>on {chain?.name || 'Solana'}</span>
            </>
          ) : (
            // Show chain icon and name for native currency
            <>
              <ChainIcon chain={activeChain} evmChainId={activeEVMChain || undefined} size={20} />
              <span>{chain?.name || 'Unknown Chain'}</span>
            </>
          )}
        </div>

        <div className="tx-review-section">
          <span className="tx-review-label">Amount</span>
          <div style={{ textAlign: 'right' }}>
            <span className="tx-review-value">{reviewTokenAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })} {symbol}</span>
            {tokenPrice && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ≈ ${reviewUsdValue.toFixed(2)} USD
              </div>
            )}
          </div>
        </div>

        <div className="tx-review-section">
          <span className="tx-review-label">To</span>
          <span className="tx-review-address">{truncateAddress(recipient, 8)}</span>
        </div>

        <div className="tx-review-section">
          <span className="tx-review-label">Network Fee</span>
          <span className="tx-review-value">~{fee.toFixed(6)} {getNativeSymbol()}</span>
        </div>

        <div className="tx-review-section tx-review-total">
          <span className="tx-review-label">Total</span>
          {isSendingToken ? (
            // For SPL tokens, show token amount and fee on separate lines
            <div className="tx-review-total-breakdown">
              <div className="tx-review-total-primary">
                {reviewTokenAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })} {symbol}
              </div>
              <div className="tx-review-total-fee">
                + {fee.toFixed(6)} SOL network fee
              </div>
            </div>
          ) : (
            // For native currency, add them together
            <span className="tx-review-value">
              ~{(reviewTokenAmount + fee).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })} {getNativeSymbol()}
            </span>
          )}
        </div>

        {error && <div className="tx-review-error">{error}</div>}

        <div className="tx-review-actions">
          <button 
            className="btn-secondary" 
            onClick={() => setShowReview(false)}
            disabled={sending}
          >
            Cancel
          </button>
          <button 
            className="btn-primary" 
            onClick={confirmSend}
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Confirm Send'}
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="tx-success">
        <div className="tx-success-icon">
          <CheckIcon size={32} />
        </div>
        <h3>Transaction Sent!</h3>
        <div className="tx-success-amount">{getTokenAmountToSend().toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 })} {symbol}</div>
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

  const chainName = getChainName();
  const currentBalance = isSendingToken ? selectedToken.uiBalance : getCurrentBalance();

  // Get fee display based on chain (always in native currency)
  const getFeeDisplay = () => {
    if (activeChain === 'solana' && feeEstimate) {
      return `~${feeEstimate.feeSol.toFixed(6)} SOL`;
    }
    if (activeChain === 'evm' && evmFeeEstimate) {
      return `~${evmFeeEstimate.totalFeeEth.toFixed(6)} ${getNativeSymbol()}`;
    }
    return null;
  };

  const feeDisplay = getFeeDisplay();

  return (
    <div className="send-form">
      <div className="form-header">
        {isSendingToken ? (
          <div className="send-token-header">
            <TokenIcon
              symbol={selectedToken.symbol}
              logoUri={selectedToken.logoUri}
              address={selectedToken.mint}
              chain="solana"
              size={24}
            />
            <h3>Send {selectedToken.symbol.toUpperCase()}</h3>
          </div>
        ) : (
          <h3>Send {symbol}</h3>
        )}
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="form-group">
        <label className="form-label">Recipient Address</label>
        <RecentRecipientsDropdown
          value={recipient}
          onSelect={setRecipient}
          onChange={setRecipient}
          chainType={activeChain}
          solanaNetwork="mainnet-beta"
          evmChainId={activeEVMChain}
          placeholder={`Enter ${chainName} address...`}
          hasError={!!(error && !recipient)}
        />
      </div>

      <div className="form-group">
        <div className="form-label-row">
          <label className="form-label">
            Amount in {amountMode === 'usd' ? 'USD' : symbol} (Balance: {hideBalances ? HIDDEN_BALANCE : formatSol(currentBalance)} {symbol})
          </label>
          {tokenPrice && (
            <button
              type="button"
              className="amount-mode-toggle"
              onClick={() => {
                // Convert the current amount when switching modes
                const currentAmount = parseFloat(amount) || 0;
                if (currentAmount > 0) {
                  if (amountMode === 'token') {
                    // Switching to USD: convert token to USD
                    const usdAmount = currentAmount * tokenPrice;
                    setAmount(usdAmount.toFixed(2));
                  } else {
                    // Switching to token: convert USD to token
                    const tokenAmount = currentAmount / tokenPrice;
                    const decimals = activeChain === 'solana' ? 6 : 8;
                    setAmount(tokenAmount.toFixed(decimals));
                  }
                }
                setAmountMode(amountMode === 'token' ? 'usd' : 'token');
              }}
              title={`Switch to ${amountMode === 'token' ? 'USD' : symbol}`}
            >
              {amountMode === 'token' ? '$' : symbol}
            </button>
          )}
        </div>
        <div className="amount-input-wrapper">
          {amountMode === 'usd' && <span className="amount-prefix">$</span>}
          <input
            type="text"
            className={`form-input ${error && !amount ? 'error' : ''} ${amountMode === 'usd' ? 'has-prefix' : ''}`}
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          {amountMode === 'token' && <span className="amount-suffix">{symbol}</span>}
          <button className="max-btn" onClick={handleMax}>MAX</button>
        </div>
        {amount && parseFloat(amount) > 0 && tokenPrice && (
          <div className="amount-conversion">
            {getConversionDisplay()}
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {feeDisplay && (
        <div className="fee-display">
          <span className="fee-label">Network Fee</span>
          <span className="fee-value">{feeDisplay}</span>
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
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  onClose: () => void;
}

const ReceiveView: React.FC<ReceiveViewProps> = ({ address, activeChain, activeEVMChain, onClose }) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Get symbol for current chain
  const getSymbol = () => {
    if (activeChain === 'solana') return 'SOL';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.symbol || 'ETH';
  };

  // Get chain name for display
  const getChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };

  useEffect(() => {
    // Generate QR code URL for the address (works for any chain)
    // Using qrserver.com free API for cross-chain QR generation
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(address)}`;
    setQrCode(qrUrl);
  }, [address]);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const symbol = getSymbol();
  const chainName = getChainName();

  return (
    <div className="receive-view">
      <div className="form-header">
        <h3>Receive {symbol}</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
        Scan QR code or copy address to receive {symbol} and tokens on {chainName}
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
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  onClose: () => void;
  hideBalances: boolean;
}

const HistoryView: React.FC<HistoryViewProps> = ({ address, network, activeChain, activeEVMChain, onClose, hideBalances }) => {
  const [history, setHistory] = useState<TransactionHistoryItem[]>([]);
  const [tokens, setTokens] = useState<SPLTokenBalance[]>([]);
  const [loading, setLoading] = useState(true);

  // Get symbol for current chain
  const getSymbol = () => {
    if (activeChain === 'solana') return 'SOL';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.symbol || 'ETH';
  };

  // Get chain name for display
  const getChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };

  useEffect(() => {
    fetchHistory();
  }, [activeChain, activeEVMChain]);

  const fetchHistory = async () => {
    setLoading(true);
    
    if (activeChain === 'solana') {
      // Fetch both history and tokens in parallel
      const [historyRes, tokensRes] = await Promise.all([
        sendToBackground({
          type: 'WALLET_GET_HISTORY',
          payload: { limit: 20 },
        }),
        sendToBackground({ type: 'WALLET_GET_TOKENS', payload: undefined }),
      ]);
      
      if (historyRes.success && historyRes.data) {
        const result = historyRes.data as { transactions: TransactionHistoryItem[] };
        setHistory(result.transactions);
      }
      
      if (tokensRes.success && tokensRes.data) {
        setTokens(tokensRes.data as SPLTokenBalance[]);
      }
    } else {
      // For EVM chains, we don't have transaction history yet
      // Show empty state with link to explorer
      setHistory([]);
    }
    setLoading(false);
  };
  
  // Helper to get token metadata from mint address
  const getTokenMeta = (mint: string) => {
    return tokens.find(t => t.mint === mint);
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleString();
  };

  const symbol = getSymbol();
  const chainName = getChainName();

  // For EVM chains, show a link to the explorer instead of transaction list
  if (activeChain === 'evm') {
    return (
      <div className="send-form">
        <div className="form-header">
          <h3>Transaction History</h3>
          <button className="close-btn" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
          <p style={{ marginBottom: 'var(--space-md)' }}>
            View your {chainName} transaction history on the block explorer.
          </p>
          <ExplorerLinkIcon
            type="address"
            id={address}
            chain="evm"
            evmChainId={activeEVMChain || 'ethereum'}
            variant="button"
            label={`View on ${chainName === 'Ethereum' ? 'Etherscan' : chainName + 'scan'}`}
            className="btn btn-primary"
          />
        </div>
      </div>
    );
  }

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
        <div className="tx-list" style={{ maxHeight: '450px', overflowY: 'auto' }}>
          {history.map((tx) => {
            // Look up token metadata from tokens list
            const tokenMeta = tx.tokenInfo ? getTokenMeta(tx.tokenInfo.mint) : null;
            const tokenSymbol = (tokenMeta?.symbol || tx.tokenInfo?.symbol || (tx.tokenInfo?.mint ? tx.tokenInfo.mint.slice(0, 4) + '...' : null))?.toUpperCase() || null;
            const tokenLogoUri = tokenMeta?.logoUri;
            
            return (
              <div
                key={tx.signature}
                className="tx-item"
                onClick={() => openExplorerUrl('tx', tx.signature, activeChain, activeEVMChain || undefined, { testnet: network === 'devnet' })}
              >
                <div className={`tx-icon ${tx.direction}`}>
                  {tx.direction === 'sent' ? <SendIcon size={16} /> : tx.direction === 'received' ? <ReceiveIcon size={16} /> : <SwapIcon size={16} />}
                </div>
                <div className="tx-details">
                  <div className="tx-type">
                    {tx.tokenInfo ? `${tx.direction === 'sent' ? 'Sent' : 'Received'} ${tokenSymbol}` : tx.type}
                  </div>
                  <div className="tx-time">{formatTime(tx.timestamp)}</div>
                </div>
                <div className="tx-amount">
                  <div className={`tx-value ${tx.direction}`}>
                    {tx.tokenInfo 
                      ? formatHiddenTxAmount(tx.tokenInfo.amount, tx.direction, tokenSymbol || 'Token', (val) => val.toLocaleString(undefined, { maximumFractionDigits: 4 }), hideBalances)
                      : formatHiddenTxAmount(tx.amountSol, tx.direction, symbol, formatSol, hideBalances)
                    }
                  </div>
                  <div className="tx-status">{tx.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- Swap View ---

interface SwapViewProps {
  address: string;
  network: string;
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  onClose: () => void;
}

const SwapView: React.FC<SwapViewProps> = ({ address, network, activeChain, activeEVMChain, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Get chain name for display
  const getChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    const chain = SUPPORTED_CHAINS.find(c => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };

  // Get DEX info based on chain
  const getDexInfo = () => {
    if (activeChain === 'solana') {
      return {
        name: 'Jupiter',
        description: 'Swap tokens using Jupiter, the leading Solana DEX aggregator. Get the best rates across all Solana liquidity sources.',
        url: network === 'devnet' 
          ? 'https://jup.ag/swap/SOL-USDC?network=devnet'
          : 'https://jup.ag/swap/SOL-USDC',
        note: 'Jupiter will open in a new window. Connect Phantom, Solflare, or another wallet there to swap.',
      };
    }
    
    // EVM chains - use Uniswap (supports Ethereum, Arbitrum, Optimism, Base, Polygon)
    const chainIdMap: Record<EVMChainId, number> = {
      ethereum: 1,
      polygon: 137,
      arbitrum: 42161,
      optimism: 10,
      base: 8453,
    };
    
    const chainId = activeEVMChain ? chainIdMap[activeEVMChain] : 1;
    const chainName = getChainName();
    
    return {
      name: 'Uniswap',
      description: `Swap tokens using Uniswap on ${chainName}. Get the best rates with automatic routing.`,
      url: `https://app.uniswap.org/swap?chain=${activeEVMChain || 'ethereum'}`,
      note: `Uniswap will open in a new window. Connect your wallet there to swap tokens on ${chainName}.`,
    };
  };

  const dexInfo = getDexInfo();
  const chainName = getChainName();

  const openDexPopup = () => {
    // Open DEX in a popup window (sized for swap interface)
    const width = 420;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    window.open(
      dexInfo.url,
      'dex-swap',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    );
  };

  const openDexTab = () => {
    window.open(dexInfo.url, '_blank');
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="swap-view">
      <div className="form-header">
        <h3>Swap Tokens</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="swap-content">
        <div className="swap-icon-container">
          <SwapIcon size={48} />
        </div>
        <p className="swap-description">
          {dexInfo.description}
        </p>

        <div className="swap-info">
          <div className="swap-info-item">
            <span className="swap-info-label">Your Wallet</span>
            <span className="swap-info-value">{truncateAddress(address, 6)}</span>
          </div>
          <div className="swap-info-item">
            <span className="swap-info-label">Network</span>
            <span className="swap-info-value">{chainName}</span>
          </div>
        </div>

        {/* Copy address for easy pasting in DEX */}
        <button 
          className="btn btn-secondary btn-block" 
          onClick={copyAddress}
          style={{ marginBottom: '12px' }}
        >
          {copied ? (
            <>
              <CheckIcon size={16} />
              Address Copied!
            </>
          ) : (
            <>
              <CopyIcon size={16} />
              Copy Wallet Address
            </>
          )}
        </button>

        <div className="swap-options">
          <button 
            className="btn btn-primary btn-block" 
            onClick={openDexPopup}
            style={{ marginBottom: '8px' }}
          >
            <SwapIcon size={16} />
            Open {dexInfo.name} Swap
          </button>
          <button 
            className="btn btn-secondary btn-block" 
            onClick={openDexTab}
          >
            <ExternalLinkIcon size={16} />
            Open in New Tab
          </button>
        </div>

        <p className="swap-note">
          {dexInfo.note}
          {' '}Copy your address above if you need to send tokens back to this wallet.
        </p>
      </div>
    </div>
  );
};

// --- Manage Wallets View ---

interface ManageWalletsViewProps {
  activeWalletId: string | null;
  onClose: () => void;
  onAddWallet: () => void;
  onWalletSwitch: () => void;
}

const ManageWalletsView: React.FC<ManageWalletsViewProps> = ({
  activeWalletId,
  onClose,
  onAddWallet,
  onWalletSwitch,
}) => {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Export states
  const [exportingWalletId, setExportingWalletId] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'mnemonic' | 'privateKey' | null>(null);
  const [exportedData, setExportedData] = useState<string | null>(null);
  const [exportChain, setExportChain] = useState<'solana' | 'evm'>('solana');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    setLoading(true);
    const res = await sendToBackground({ type: 'WALLET_LIST', payload: undefined });
    if (res.success && res.data) {
      setWallets(res.data as WalletEntry[]);
    }
    setLoading(false);
  };

  const handleRename = async () => {
    if (!editingWalletId || !editLabel.trim()) return;
    setProcessing(true);
    setError('');

    try {
      const res = await sendToBackground({
        type: 'WALLET_RENAME',
        payload: { walletId: editingWalletId, label: editLabel.trim() },
      });

      if (res.success) {
        setEditingWalletId(null);
        setEditLabel('');
        await fetchWallets();
      } else {
        setError(res.error || 'Failed to rename wallet');
      }
    } catch {
      setError('Failed to rename wallet');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingWalletId || !password) return;
    setProcessing(true);
    setError('');

    try {
      const res = await sendToBackground({
        type: 'WALLET_DELETE_ONE',
        payload: { walletId: deletingWalletId, password },
      });

      if (res.success) {
        setDeletingWalletId(null);
        setPassword('');
        await fetchWallets();
        onWalletSwitch(); // Refresh wallet state
      } else {
        setError(res.error || 'Failed to delete wallet');
      }
    } catch {
      setError('Failed to delete wallet');
    } finally {
      setProcessing(false);
    }
  };

  const handleSwitch = async () => {
    if (!switchingWalletId || !password) return;
    setProcessing(true);
    setError('');

    try {
      const res = await sendToBackground({
        type: 'WALLET_SWITCH',
        payload: { walletId: switchingWalletId, password },
      });

      if (res.success) {
        setSwitchingWalletId(null);
        setPassword('');
        onWalletSwitch();
        onClose();
      } else {
        setError(res.error || 'Failed to switch wallet');
      }
    } catch {
      setError('Failed to switch wallet');
    } finally {
      setProcessing(false);
    }
  };

  const startEdit = (wallet: WalletEntry) => {
    setEditingWalletId(wallet.id);
    setEditLabel(wallet.label);
    setDeletingWalletId(null);
    setSwitchingWalletId(null);
    setError('');
  };

  const startDelete = (walletId: string) => {
    setDeletingWalletId(walletId);
    setEditingWalletId(null);
    setSwitchingWalletId(null);
    setPassword('');
    setError('');
  };

  const startSwitch = (walletId: string) => {
    setSwitchingWalletId(walletId);
    setEditingWalletId(null);
    setDeletingWalletId(null);
    setPassword('');
    setError('');
  };

  const cancelAction = () => {
    setEditingWalletId(null);
    setDeletingWalletId(null);
    setSwitchingWalletId(null);
    setExportingWalletId(null);
    setExportType(null);
    setExportedData(null);
    setPassword('');
    setError('');
    setCopied(false);
  };

  const startExportMnemonic = (walletId: string) => {
    setExportingWalletId(walletId);
    setExportType('mnemonic');
    setExportedData(null);
    setEditingWalletId(null);
    setDeletingWalletId(null);
    setSwitchingWalletId(null);
    setPassword('');
    setError('');
    setCopied(false);
  };

  const startExportPrivateKey = (walletId: string) => {
    setExportingWalletId(walletId);
    setExportType('privateKey');
    setExportedData(null);
    setExportChain('solana');
    setEditingWalletId(null);
    setDeletingWalletId(null);
    setSwitchingWalletId(null);
    setPassword('');
    setError('');
    setCopied(false);
  };

  const handleExport = async () => {
    if (!exportingWalletId || !password || !exportType) return;
    setProcessing(true);
    setError('');

    try {
      if (exportType === 'mnemonic') {
        const res = await sendToBackground({
          type: 'WALLET_EXPORT_ONE',
          payload: { walletId: exportingWalletId, password },
        });
        if (res.success && res.data) {
          const data = res.data as { mnemonic: string };
          setExportedData(data.mnemonic);
        } else {
          setError(res.error || 'Failed to export recovery phrase');
        }
      } else {
        const res = await sendToBackground({
          type: 'WALLET_EXPORT_PRIVATE_KEY',
          payload: { walletId: exportingWalletId, password, chain: exportChain },
        });
        if (res.success && res.data) {
          const data = res.data as { privateKey: string };
          setExportedData(data.privateKey);
        } else {
          setError(res.error || 'Failed to export private key');
        }
      }
    } catch {
      setError('Failed to export');
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyExported = async () => {
    if (!exportedData) return;
    try {
      await navigator.clipboard.writeText(exportedData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <div className="manage-wallets-view">
      <div className="form-header">
        <h3>Manage Wallets</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="wallet-count-info">
        <span>{wallets.length} / 100 wallets</span>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      ) : (
        <div className="wallets-list">
          {wallets.map((wallet) => (
            <div 
              key={wallet.id} 
              className={`wallet-list-item ${wallet.id === activeWalletId ? 'active' : ''}`}
            >
              {editingWalletId === wallet.id ? (
                <div className="wallet-edit-row">
                  <input
                    type="text"
                    className="form-input"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    maxLength={32}
                    autoFocus
                  />
                  <div className="wallet-edit-actions">
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={handleRename}
                      disabled={processing || !editLabel.trim()}
                    >
                      Save
                    </button>
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={cancelAction}
                      disabled={processing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : deletingWalletId === wallet.id ? (
                <div className="wallet-confirm-row">
                  <p className="confirm-text">Delete "{wallet.label}"?</p>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Enter password to confirm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                  {error && <div className="form-error">{error}</div>}
                  <div className="wallet-edit-actions">
                    <button 
                      className="btn btn-sm btn-danger"
                      onClick={handleDelete}
                      disabled={processing || !password}
                    >
                      {processing ? 'Deleting...' : 'Delete'}
                    </button>
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={cancelAction}
                      disabled={processing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : switchingWalletId === wallet.id ? (
                <div className="wallet-confirm-row">
                  <p className="confirm-text">Switch to "{wallet.label}"?</p>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Enter password to switch"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                  {error && <div className="form-error">{error}</div>}
                  <div className="wallet-edit-actions">
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={handleSwitch}
                      disabled={processing || !password}
                    >
                      {processing ? 'Switching...' : 'Switch'}
                    </button>
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={cancelAction}
                      disabled={processing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : exportingWalletId === wallet.id ? (
                <div className="wallet-confirm-row">
                  {exportedData ? (
                    <>
                      <p className="confirm-text" style={{ color: 'var(--warning)' }}>
                        ⚠️ {exportType === 'mnemonic' ? 'Recovery Phrase' : 'Private Key'} - Keep this secret!
                      </p>
                      <div 
                        className="full-address" 
                        style={{ 
                          marginBottom: 'var(--space-sm)', 
                          lineHeight: 1.6,
                          wordBreak: 'break-all',
                          fontSize: '0.75rem',
                          background: 'var(--bg-tertiary)',
                          padding: 'var(--space-sm)',
                          borderRadius: 'var(--radius-sm)',
                          maxHeight: '120px',
                          overflowY: 'auto',
                        }}
                      >
                        {exportedData}
                      </div>
                      <div className="wallet-edit-actions">
                        <button 
                          className="btn btn-sm btn-primary"
                          onClick={handleCopyExported}
                        >
                          {copied ? <><CheckIcon size={12} /> Copied!</> : <><CopyIcon size={12} /> Copy</>}
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={cancelAction}
                        >
                          Done
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="confirm-text">
                        {exportType === 'mnemonic' 
                          ? `Export recovery phrase for "${wallet.label}"?` 
                          : `Export private key for "${wallet.label}"?`}
                      </p>
                      {exportType === 'privateKey' && (
                        <div style={{ marginBottom: 'var(--space-sm)' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                            Select chain:
                          </label>
                          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                            <button
                              className={`btn btn-sm ${exportChain === 'solana' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setExportChain('solana')}
                              style={{ flex: 1 }}
                            >
                              Solana
                            </button>
                            <button
                              className={`btn btn-sm ${exportChain === 'evm' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setExportChain('evm')}
                              style={{ flex: 1 }}
                            >
                              EVM
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="password-input-wrapper">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="form-input"
                          placeholder="Enter password to export"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        </button>
                      </div>
                      {error && <div className="form-error">{error}</div>}
                      <div className="wallet-edit-actions">
                        <button 
                          className="btn btn-sm btn-warning"
                          onClick={handleExport}
                          disabled={processing || !password}
                        >
                          {processing ? 'Exporting...' : 'Export'}
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={cancelAction}
                          disabled={processing}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div 
                    className="wallet-item-main"
                    onClick={() => wallet.id !== activeWalletId && startSwitch(wallet.id)}
                  >
                    <div className="wallet-item-info">
                      <span className="wallet-item-label">{wallet.label}</span>
                      <span className="wallet-item-address">{truncateAddress(wallet.publicKey, 6)}</span>
                    </div>
                    {wallet.id === activeWalletId && (
                      <span className="active-badge">Active</span>
                    )}
                  </div>
                  <div className="wallet-item-actions">
                    <button
                      className="icon-btn"
                      onClick={() => startEdit(wallet)}
                      title="Rename"
                    >
                      <EditIcon size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => startExportMnemonic(wallet.id)}
                      title="Show Recovery Phrase"
                    >
                      <KeyIcon size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => startExportPrivateKey(wallet.id)}
                      title="Export Private Key"
                    >
                      <LockIcon size={14} />
                    </button>
                    {wallets.length > 1 && (
                      <button
                        className="icon-btn danger"
                        onClick={() => startDelete(wallet.id)}
                        title="Delete"
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="btn btn-secondary btn-block"
        onClick={onAddWallet}
        disabled={wallets.length >= 100}
        style={{ marginTop: 'var(--space-md)' }}
      >
        <PlusIcon size={16} />
        <span>Add Wallet</span>
      </button>
    </div>
  );
};

// --- Add Wallet View ---

interface AddWalletViewProps {
  onClose: () => void;
  onComplete: () => void;
}

const AddWalletView: React.FC<AddWalletViewProps> = ({ onClose, onComplete }) => {
  const [mode, setMode] = useState<'select' | 'create' | 'import' | 'importPrivateKey'>('select');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [label, setLabel] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const handleCreate = async () => {
    const feedback = getPasswordStrengthFeedback(password);
    if (!feedback.valid) {
      setError(feedback.message);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_ADD',
        payload: { password, label: label || undefined },
      });

      if (response.success && response.data) {
        const data = response.data as { mnemonic: string; publicAddress: string; walletId: string };
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
    const feedback = getPasswordStrengthFeedback(password);
    if (!feedback.valid) {
      setError(feedback.message);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!mnemonic.trim()) {
      setError('Recovery phrase is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_IMPORT_ADD',
        payload: { 
          mnemonic: mnemonic.trim(), 
          password,
          label: label || undefined,
        },
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

  const handleImportPrivateKey = async () => {
    const feedback = getPasswordStrengthFeedback(password);
    if (!feedback.valid) {
      setError(feedback.message);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_IMPORT_PRIVATE_KEY',
        payload: { 
          privateKey: privateKey.trim(), 
          password,
          label: label || undefined,
        },
      });

      if (response.success) {
        onComplete();
      } else {
        setError(response.error || 'Failed to import wallet from private key');
      }
    } catch {
      setError('Failed to import wallet from private key');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'select') {
    return (
      <div className="add-wallet-view">
        <div className="form-header">
          <h3>Add Wallet</h3>
          <button className="close-btn" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="wallet-setup-actions">
          <button className="btn btn-primary btn-block" onClick={() => setMode('create')}>
            Create New Wallet
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setMode('import')}>
            Import with Recovery Phrase
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setMode('importPrivateKey')}>
            Import with Private Key
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    if (step === 1) {
      return (
        <div className="add-wallet-view">
          <div className="form-header">
            <h3>Create New Wallet</h3>
            <button className="close-btn" onClick={onClose}>
              <CloseIcon size={14} />
            </button>
          </div>
          <div className="unlock-form">
            <input
              type="text"
              className="form-input"
              placeholder="Wallet label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={32}
            />
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
            <p className="password-criteria">
              Minimum 10 chars with upper, lower, number, and special character
            </p>
            {error && <div className="form-error">{error}</div>}
            <button
              className="btn btn-primary btn-block"
              onClick={handleCreate}
              disabled={loading || !password}
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
      <div className="add-wallet-view">
        <div className="form-header">
          <h3>Save Recovery Phrase</h3>
          <button className="close-btn" onClick={onComplete}>
            <CloseIcon size={14} />
          </button>
        </div>
        <p style={{ color: 'var(--warning)', marginBottom: 'var(--space-md)', fontSize: '0.75rem' }}>
          Write these words down and store them safely. Anyone with this phrase can access this wallet.
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

  if (mode === 'importPrivateKey') {
    return (
      <div className="add-wallet-view">
        <div className="form-header">
          <h3>Import Private Key</h3>
          <button className="close-btn" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="unlock-form">
          <input
            type="text"
            className="form-input"
            placeholder="Wallet label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={32}
          />
          <div className="password-input-wrapper">
            <input
              type={showPrivateKey ? 'text' : 'password'}
              className="form-input"
              placeholder="Enter private key (Base58 or Hex)"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              tabIndex={-1}
            >
              {showPrivateKey ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: 'var(--space-sm)' }}>
            Accepts Solana (Base58/Hex) or EVM (0x hex) private keys
          </p>
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <div className="password-input-wrapper">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p className="password-criteria">
            Minimum 10 chars with upper, lower, number, and special character
          </p>
          {error && <div className="form-error">{error}</div>}
          <button
            className="btn btn-primary btn-block"
            onClick={handleImportPrivateKey}
            disabled={loading || !privateKey || !password}
          >
            {loading ? 'Importing...' : 'Import Wallet'}
          </button>
          <button
            className="btn btn-secondary btn-block"
            onClick={() => { setMode('select'); setError(''); setPrivateKey(''); }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="add-wallet-view">
      <div className="form-header">
        <h3>Import Wallet</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="unlock-form">
        <input
          type="text"
          className="form-input"
          placeholder="Wallet label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={32}
        />
        <textarea
          className="form-input form-textarea modern-scroll"
          placeholder="Enter 12 or 24 word recovery phrase..."
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          rows={3}
        />
        <div className="password-input-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            className="form-input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
        <div className="password-input-wrapper">
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            className="form-input"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            tabIndex={-1}
          >
            {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
        <p className="password-criteria">
          Minimum 10 chars with upper, lower, number, and special character
        </p>
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

// --- Main App ---

const App: React.FC = () => {
  console.log('=== AINTIVIRUS POPUP LOADED ===');
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTabSession] = useSessionSetting<MainTab>(SESSION_KEYS.ACTIVE_TAB, 'security');
  
  // Wrapper to handle the async nature of setActiveTabSession
  const setActiveTab = useCallback((tab: MainTab) => {
    setActiveTabSession(tab);
  }, [setActiveTabSession]);
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Ad blocker state (separate from privacy feature flag)
  const [adBlockerEnabled, setAdBlockerEnabled] = useState(true);

  // Hide balances privacy mode (stored in session, clears on browser restart)
  const [hideBalances, toggleHideBalances] = useHideBalances();

  // Track network connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      console.log('[fetchWalletState] Response:', response);
      if (response.success && response.data) {
        const state = response.data as WalletState;
        console.log('[fetchWalletState] activeChain:', state.activeChain, 'activeEVMChain:', state.activeEVMChain);
        setWalletState(state);
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
    // Function to update current site from a tab
    const updateCurrentSite = (tab: chrome.tabs.Tab) => {
      if (tab.id) {
        setCurrentTabId(tab.id);
      }
      if (tab.url) {
        const domain = extractDomain(tab.url);
        if (domain) {
          fetchSiteMode(domain);
        } else {
          // Clear current site for non-http pages (chrome://, etc.)
          setCurrentSite(null);
        }
      } else {
        setCurrentSite(null);
      }
    };

    // Get initial active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        updateCurrentSite(tabs[0]);
      }
    });

    // Listen for tab activation (switching tabs)
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.warn('Tab not found:', chrome.runtime.lastError);
          return;
        }
        updateCurrentSite(tab);
      });
    };

    // Listen for tab URL changes (navigation within same tab)
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      // Only update if URL changed and it's the active tab
      if (changeInfo.url && tab.active) {
        updateCurrentSite(tab);
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    getFeatureFlags().then((loadedFlags) => {
      setFlags(loadedFlags);
      setLoading(false);
    });

    fetchWalletState();

    const unsubscribe = onFeatureFlagsChange((newFlags) => {
      setFlags(newFlags);
    });

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      unsubscribe();
    };
  }, [fetchSiteMode, fetchWalletState]);

  // Fetch ad blocker status
  const fetchAdBlockerStatus = useCallback(async () => {
    try {
      const response = await sendToBackground({ type: 'GET_AD_BLOCKER_STATUS', payload: undefined });
      if (response.success && response.data !== undefined) {
        setAdBlockerEnabled(response.data as boolean);
      }
    } catch (error) {
      console.error('Failed to fetch ad blocker status:', error);
    }
  }, []);

  // Toggle ad blocker (separate from privacy feature flag)
  const handleAdBlockerToggle = async (enabled: boolean) => {
    setAdBlockerEnabled(enabled);
    try {
      await sendToBackground({ type: 'SET_AD_BLOCKER_STATUS', payload: { enabled } });
    } catch (error) {
      console.error('Failed to toggle ad blocker:', error);
      // Revert on error
      setAdBlockerEnabled(!enabled);
    }
  };

  // Fetch ad blocker status on load
  useEffect(() => {
    fetchAdBlockerStatus();
  }, [fetchAdBlockerStatus]);

  useEffect(() => {
    if (adBlockerEnabled) {
      fetchStats();
      const interval = setInterval(fetchStats, 2000);
      return () => clearInterval(interval);
    }
  }, [adBlockerEnabled, fetchStats]);

  const handleToggle = async (id: keyof FeatureFlags) => {
    const newValue = !flags[id];
    setFlags((prev) => ({ ...prev, [id]: newValue }));
    await setFeatureFlag(id, newValue);
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

  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
  };

  return (
    <div className="popup-container">
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
        <button
          className="tab-btn token-link"
          onClick={() => chrome.tabs.create({ url: 'https://raydium.io/swap/?inputMint=sol&outputMint=BAezfVmia8UYLt4rst6PCU4dvL2i2qHzqn4wGhytpNJW' })}
          title="Buy $AINTI on Raydium"
        >
          <ExternalLinkIcon size={14} />
          <span>$AINTI</span>
        </button>
        <button
          className="tab-btn token-link"
          onClick={() => chrome.tabs.create({ url: 'https://raydium.io/swap/?inputMint=sol&outputMint=6gJ8ZmypNAJmE3uQPgM4Xi94H5aYtDLZRoMGFSbw39jQ' })}
          title="Buy $MATRIX on Raydium"
        >
          <ExternalLinkIcon size={14} />
          <span>$MATRIX</span>
        </button>
        <button
          className="icon-btn settings-btn"
          onClick={handleOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <SettingsIcon size={18} />
        </button>
      </nav>

      {activeTab === 'security' && (
        <SecurityTab
          flags={flags}
          stats={stats}
          currentSite={currentSite}
          onToggle={handleToggle}
          onSiteModeChange={handleSiteModeChange}
          adBlockerEnabled={adBlockerEnabled}
          onAdBlockerToggle={handleAdBlockerToggle}
        />
      )}

      {activeTab === 'wallet' && (
        <WalletTab
          walletState={walletState}
          onStateChange={fetchWalletState}
          hideBalances={hideBalances}
          onToggleHideBalances={toggleHideBalances}
          privacyEnabled={flags.wallet}
        />
      )}

      <footer className="popup-footer">
        <div className="footer-badges">
          {activeTab === 'security' && (
            <div className={`status-badge ${flags.privacy ? '' : 'inactive'}`}>
              <span className={`status-dot ${flags.privacy ? '' : 'inactive'}`} />
              <span>{flags.privacy ? 'Privacy Features Active' : 'Privacy Features Off'}</span>
            </div>
          )}
          {activeTab === 'wallet' && (
            <div className={`status-badge ${flags.wallet ? '' : 'inactive'}`}>
              <span className={`status-dot ${flags.wallet ? '' : 'inactive'}`} />
              <span>{flags.wallet ? 'Wallet Security Active' : 'Wallet Security Off'}</span>
            </div>
          )}
          {walletState && walletState.lockState === 'unlocked' && walletState.network && (
            <div className={`network-badge-footer ${!isOnline ? 'offline' : walletState.network === 'devnet' ? 'devnet' : ''}`}>
              <span className={`network-dot ${!isOnline ? 'offline' : walletState.network === 'devnet' ? 'devnet' : ''}`} />
              <span>{!isOnline ? 'Offline' : walletState.network === 'devnet' ? 'Online (dev)' : 'Online'}</span>
            </div>
          )}
        </div>
        <span className="version-text">v0.1.0</span>
      </footer>
    </div>
  );
};

export default App;
