import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { FeatureFlags, DEFAULT_FEATURE_FLAGS } from '@shared/types';
import {
  getFeatureFlags,
  setFeatureFlag,
  FEATURE_FLAG_META,
  onFeatureFlagsChange,
} from '@shared/featureFlags';
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

/** EVM transaction history item from Etherscan-like API */
interface EVMHistoryItem {
  hash: string;
  timestamp: number;
  direction: 'sent' | 'received' | 'self' | 'unknown';
  type: string;
  amount: number;
  symbol: string;
  counterparty?: string;
  fee?: number;
  status: 'confirmed' | 'pending' | 'failed';
  explorerUrl: string;
  logoUri?: string;
  tokenAddress?: string;
  /** Swap info when transaction is a token swap */
  swapInfo?: {
    fromToken: {
      symbol: string;
      amount: number;
      address?: string;
      logoUri?: string;
    };
    toToken: {
      symbol: string;
      amount: number;
      address?: string;
      logoUri?: string;
    };
  };
}
import { SUPPORTED_CHAINS } from '@shared/types';
import { openExplorerUrl, getExplorerUrl } from '@shared/explorer';
import { ExplorerLinkIcon } from './components/ExplorerLinkIcon';
import { RecentRecipientsDropdown } from './components/RecentRecipientsDropdown';
import { TokenIcon } from './components/TokenIcon';
import { TokenSearchDropdown } from './components/TokenSearchDropdown';
import { SwapTokenSelector } from './components/SwapTokenSelector';
import { MoneroSetupModal } from './components/MoneroSetupModal';
import { ReceiveView, SwapView, ManageWalletsView, AddWalletView } from './views/wallet';
import { type SwapToken } from '../wallet/swapTokens';
import { useHideBalances, useSessionSetting, SESSION_KEYS } from './hooks/useSessionSetting';
import { useRecentRecipients } from './hooks/useRecentRecipients';
import { useDebounce } from './hooks/useDebounce';
import {
  formatHiddenBalance,
  formatHiddenUsd,
  formatHiddenTxAmount,
  HIDDEN_BALANCE,
} from './utils/balancePrivacy';
import { isSwapAvailableForChain } from './utils/chainDisplay';
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
  CopyIcon,
  CheckIcon,
  CloseIcon,
  BellIcon,
  LockClosedIcon,
  BlockIcon,
  CodeIcon,
  ActivityIcon,
  KeyIcon,
  SwapIcon,
  ExternalLinkIcon,
  PartnersIcon,
  RefreshIcon,
  ChevronIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  SearchIcon,
  StoreIcon,
  SpamIcon,
} from './Icons';
import StoreTab from './components/StoreTab';
import { getPasswordStrengthFeedback } from '../wallet/crypto';
import { isValidSolanaAddress, isValidEVMAddress } from '../wallet/keychain';
import LockedParticles from './components/LockedParticles';
import AmbientBackground from './components/AmbientBackground';

interface PrivacyStats {
  totalBlockedRequests: number;
  totalCookiesDeleted: number;
  activeRuleCount: number;
  currentTabBlocked: number;
  scriptsIntercepted: number;
  requestsModified: number;
  blockedByDomain?: { [domain: string]: number };
  sessionStart?: number;
}

type MainTab = 'security' | 'wallet' | 'store';
type WalletView = 'dashboard' | 'send' | 'receive' | 'manage' | 'add-wallet' | 'swap';

function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatSol(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) {
    const str = amount.toFixed(8);
    return str.replace(/\.?0+$/, '') || '0';
  }
  if (amount < 1) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  }
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

/**
 * Format a token price with appropriate precision
 * Shows more decimals for low-priced tokens to enable price tracking
 */
function formatTokenPrice(price: number): string {
  if (price === 0) return '$0.00';
  
  // For prices >= $1, show 2 decimals
  if (price >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }
  
  // For prices >= $0.01, show 4 decimals
  if (price >= 0.01) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(price);
  }
  
  // For prices >= $0.0001, show 6 decimals
  if (price >= 0.0001) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(price);
  }
  
  // For very small prices, show up to 8 decimals
  if (price >= 0.00000001) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    }).format(price);
  }
  
  // For extremely small prices, use scientific notation
  return `$${price.toExponential(2)}`;
}

function getFeatureIcon(iconName: string): React.ReactNode {
  switch (iconName) {
    case 'shield':
      return <ShieldIcon size={16} />;
    case 'wallet':
      return <WalletIcon size={16} />;
    case 'bell':
      return <BellIcon size={16} />;
    default:
      return <ShieldIcon size={16} />;
  }
}

const HighlightedText: React.FC<{ text: string; segments: HighlightSegment[] }> = ({
  segments,
}) => (
  <>
    {segments.map((seg, i) =>
      seg.highlighted ? (
        <mark key={i} className="token-search-highlight">
          {seg.text}
        </mark>
      ) : (
        <span key={i}>{seg.text}</span>
      ),
    )}
  </>
);

interface SecurityTabProps {
  flags: FeatureFlags;
  stats: PrivacyStats;
  onToggle: (id: keyof FeatureFlags) => void;
  adBlockerEnabled: boolean;
  onAdBlockerToggle: (enabled: boolean) => void;
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  flags,
  stats,
  onToggle,
  adBlockerEnabled,
  onAdBlockerToggle,
}) => {
  const handleTrackersClick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html#trackers') });
  };

  const handleScriptsClick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html#scripts') });
  };

  const sessionDuration = stats.sessionStart
    ? Math.floor((Date.now() - stats.sessionStart) / 1000 / 60)
    : 0;

  const topTrackedSites = stats.blockedByDomain
    ? Object.entries(stats.blockedByDomain)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];

  return (
    <div className="popup-content">
      {/* Ad Blocker Stats - Only show when ad blocker is enabled */}
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
              <span className="stat-value">{formatNumber(stats.totalBlockedRequests)}</span>
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

      {/* Privacy Feature Metrics - Show when privacy is enabled (independent of ad blocker) */}
      {flags.privacy && (
        <section className="section">
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card">
              <span className="stat-value">{formatNumber(stats.totalCookiesDeleted)}</span>
              <span className="stat-label">Cookies</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatNumber(stats.requestsModified)}</span>
              <span className="stat-label">Modified</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{sessionDuration}m</span>
              <span className="stat-label">Session</span>
            </div>
          </div>
        </section>
      )}

      {/* Top Tracked Sites - Only show when ad blocker is enabled (tracker data comes from blocking) */}
      {adBlockerEnabled && topTrackedSites.length > 0 && (
        <section className="section">
          <div className="section-header">
            <span className="section-title">Top Trackers</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {topTrackedSites.map(([domain, count]) => (
              <div
                key={domain}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    marginRight: '8px',
                  }}
                >
                  {domain}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--danger)',
                    background: 'var(--danger-muted)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatNumber(count)}
                </span>
              </div>
            ))}
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
          <div className={`feature-item ${adBlockerEnabled ? 'enabled' : ''}`} role="listitem">
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
                <div className="feature-icon">{getFeatureIcon(feature.icon)}</div>
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

interface WalletTabProps {
  walletState: WalletState | null;
  onStateChange: () => void;
  hideBalances: boolean;
  onToggleHideBalances: () => void;
  privacyEnabled: boolean;
  onShowMoneroSetup?: () => void;
  triggerSwap?: boolean; // When true, auto-navigate to swap view
  onSwapTriggered?: () => void; // Called after swap view is shown
}

const WalletTab: React.FC<WalletTabProps> = ({
  walletState,
  onStateChange,
  hideBalances,
  onToggleHideBalances,
  privacyEnabled,
  onShowMoneroSetup,
  triggerSwap,
  onSwapTriggered,
}) => {
  const [view, setView] = useState<WalletView>('dashboard');
  
  // Handle external trigger to navigate to swap (e.g., from Store "Buy AINTI" button)
  useEffect(() => {
    if (triggerSwap && walletState && walletState.lockState === 'unlocked') {
      // Fetch token data before showing swap view
      const fetchSwapData = async () => {
        try {
          const activeChain = walletState.activeChain || 'solana';
          const activeEVMChain = walletState.activeEVMChain;
          
          if (activeChain === 'solana') {
            // Fetch Solana balance and tokens
            const [balanceRes, tokensRes] = await Promise.all([
              sendToBackground({ type: 'WALLET_GET_BALANCE', payload: {} }),
              sendToBackground({ type: 'WALLET_GET_TOKENS', payload: {} }),
            ]);
            
            if (balanceRes.success && balanceRes.data) {
              setSwapBalance(balanceRes.data as WalletBalance);
            }
            if (tokensRes.success && tokensRes.data) {
              setSwapTokens(tokensRes.data as SPLTokenBalance[]);
            }
          } else if (activeChain === 'evm' && activeEVMChain) {
            // Fetch EVM balance and tokens
            const [balanceRes, tokensRes] = await Promise.all([
              sendToBackground({
                type: 'WALLET_GET_EVM_BALANCE',
                payload: { evmChainId: activeEVMChain },
              }),
              sendToBackground({
                type: 'WALLET_GET_EVM_TOKENS',
                payload: { evmChainId: activeEVMChain },
              }),
            ]);
            
            if (balanceRes.success && balanceRes.data) {
              setSwapEvmBalance(balanceRes.data as EVMBalance);
            }
            if (tokensRes.success && tokensRes.data) {
              setSwapEvmTokens(tokensRes.data as EVMTokenBalance[]);
            }
          }
        } catch (err) {
          console.error('Failed to fetch swap data:', err);
        }
        
        // Navigate to swap view after data is fetched
        setView('swap');
        onSwapTriggered?.();
      };
      
      fetchSwapData();
    }
  }, [triggerSwap, walletState, onSwapTriggered]);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [switchingToWalletId, setSwitchingToWalletId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedTokenForSend, setSelectedTokenForSend] = useState<SelectedTokenForSend | null>(
    null,
  );
  const [dashboardKey, setDashboardKey] = useState(0);

  // State for passing to swap view
  const [swapTokens, setSwapTokens] = useState<SPLTokenBalance[]>([]);
  const [swapEvmTokens, setSwapEvmTokens] = useState<EVMTokenBalance[]>([]);
  const [swapBalance, setSwapBalance] = useState<WalletBalance | null>(null);
  const [swapEvmBalance, setSwapEvmBalance] = useState<EVMBalance | null>(null);

  // Prices shared across views
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);

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
      <div className="popup-content locked-screen-content">
        <WalletSetup onComplete={onStateChange} />
      </div>
    );
  }

  if (walletState.lockState === 'locked') {
    return (
      <div className="popup-content locked-screen-content">
        <div className="locked-screen-bg">
          <LockedParticles />
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
          <form
            className="unlock-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleUnlock();
            }}
          >
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Secured with encryption
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Safeguard: if wallet is unlocked but address is not yet populated, show loading
  // This handles race conditions during initial load or service worker restart
  if (!walletState.publicAddress) {
    return (
      <div className="popup-content">
        <div className="loading">
          <div className="spinner" />
          <p style={{ marginTop: 'var(--space-sm)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            Loading wallet...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-content">
      <div className="wallet-container">
        <AmbientBackground chain={walletState.activeChain || 'solana'} intensity={0.4} />
        {view === 'dashboard' && (
          <WalletDashboard
            key={dashboardKey}
            address={walletState.publicAddress}
            network={walletState.network}
            activeWalletId={walletState.activeWalletId}
            activeWalletLabel={walletState.activeWalletLabel}
            walletCount={walletState.walletCount}
            onPriceUpdate={(sol, eth) => {
              setSolPrice(sol);
              setEthPrice(eth);
            }}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            activeChainId={walletState.activeChainId || null}
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
            onSwap={(tokens, evmToks, balance, evmBal) => {
              setSwapTokens(tokens || []);
              setSwapEvmTokens(evmToks || []);
              setSwapBalance(balance || null);
              setSwapEvmBalance(evmBal || null);
              setView('swap');
            }}
            onLock={onStateChange}
            onManageWallets={() => setView('manage')}
            onWalletSwitch={() => setView('manage')}
            onChainChange={async (chain, evmChainId, chainId) => {
              const result = await sendToBackground({
                type: 'WALLET_SET_CHAIN',
                payload: { chain, evmChainId, chainId },
              });
              await onStateChange();
            }}
            hideBalances={hideBalances}
            onToggleHideBalances={onToggleHideBalances}
            privacyEnabled={privacyEnabled}
            onShowMoneroSetup={onShowMoneroSetup}
            supportedChainFamilies={walletState.supportedChainFamilies}
          />
        )}
        {view === 'send' && (
          <SendForm
            address={walletState.publicAddress!}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            activeChainId={walletState.activeChainId || null}
            evmAddress={walletState.evmAddress || null}
            onClose={() => {
              setSelectedTokenForSend(null);
              setView('dashboard');
            }}
            onSuccess={async () => {
              setSelectedTokenForSend(null);
              setView('dashboard');
              setDashboardKey((k) => k + 1);
              setTimeout(() => {
                setDashboardKey((k) => k + 1);
              }, 2000);
              setTimeout(() => {
                setDashboardKey((k) => k + 1);
              }, 6000);
            }}
            onWalletLocked={onStateChange}
            hideBalances={hideBalances}
            selectedToken={selectedTokenForSend}
          />
        )}
        {view === 'receive' && (
          <ReceiveView
            address={
              walletState.activeChain === 'solana'
                ? walletState.publicAddress!
                : walletState.evmAddress || walletState.publicAddress!
            }
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            activeChainId={walletState.activeChainId || null}
            onClose={() => setView('dashboard')}
          />
        )}
        {view === 'swap' && (
          <SwapView
            address={
              walletState.activeChain === 'solana'
                ? walletState.publicAddress!
                : walletState.evmAddress || walletState.publicAddress!
            }
            network={walletState.network}
            activeChain={walletState.activeChain || 'solana'}
            activeEVMChain={walletState.activeEVMChain || null}
            tokens={swapTokens}
            evmTokens={swapEvmTokens}
            balance={swapBalance}
            evmBalance={swapEvmBalance}
            onClose={() => {
              setView('dashboard');
              // Force dashboard refresh after closing swap to pick up new balances
              setDashboardKey((k) => k + 1);
            }}
            onSwapComplete={() => {
              onStateChange();
              // Force dashboard refresh after swap completes (similar to send)
              // Multiple refreshes to catch blockchain confirmation
              setDashboardKey((k) => k + 1);
              setTimeout(() => {
                setDashboardKey((k) => k + 1);
              }, 3000);
              setTimeout(() => {
                setDashboardKey((k) => k + 1);
              }, 8000);
              setTimeout(() => {
                setDashboardKey((k) => k + 1);
              }, 15000);
            }}
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
            onComplete={() => {
              setView('dashboard');
              onStateChange();
            }}
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
      <div className="wallet-setup-screen">
        <div className="locked-screen-bg">
          <LockedParticles />
          <div className="locked-bg-gradient" />
          <div className="locked-bg-pattern" />
        </div>
        <div className="wallet-setup wallet-setup-elevated">
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
            <button
              className="btn btn-secondary btn-block"
              onClick={() => setMode('importPrivateKey')}
            >
              Import with Private Key
            </button>
          </div>
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
              onClick={() => {
                setMode('select');
                setError('');
              }}
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
          Write these words down and store them safely. Anyone with this phrase can access your
          wallet.
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
        <p>Enter your Solana, EVM, or Bitcoin private key</p>
        <div className="unlock-form">
          <div className="password-input-wrapper">
            <input
              type={showPrivateKey ? 'text' : 'password'}
              className="form-input"
              placeholder="Enter private key (Base58, Hex, or WIF)"
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
          <p
            style={{
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
              marginTop: '-8px',
              marginBottom: 'var(--space-sm)',
            }}
          >
            Accepts Solana (Base58), EVM (0x hex), or Bitcoin (WIF) private keys
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
            onClick={() => {
              setMode('select');
              setError('');
              setPrivateKey('');
            }}
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
          onClick={() => {
            setMode('select');
            setError('');
          }}
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
  activeChainId: string | null;
  evmAddress: string | null;
  onSend: () => void;
  onSendToken: (token: SelectedTokenForSend) => void;
  onReceive: () => void;
  onSwap: (tokens?: SPLTokenBalance[], evmTokens?: EVMTokenBalance[], balance?: WalletBalance | null, evmBalance?: EVMBalance | null) => void;
  onLock: () => void;
  onManageWallets: () => void;
  onWalletSwitch: () => void;
  onChainChange: (chain: ChainType, evmChainId?: EVMChainId, chainId?: string) => void;
  hideBalances: boolean;
  onToggleHideBalances: () => void;
  privacyEnabled: boolean;
  onPriceUpdate?: (solPrice: number | null, ethPrice: number | null) => void;
  onShowMoneroSetup?: () => void;
  supportedChainFamilies?: ('solana' | 'evm' | 'bitcoin' | 'tron' | 'monero')[] | null;
}

// Chain icons with actual logos
// Chain icon component - accepts chainId (string) for all chain types
const ChainIcon: React.FC<{ chain: ChainType; evmChainId?: EVMChainId | string; size?: number }> = ({
  chain,
  evmChainId,
  size = 16,
}) => {
  // Map chain ID to jsDelivr CDN logo URLs
  const chainLogoMap: Record<string, string> = {
    solana: 'https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png',
    ethereum: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/info/logo.png',
    polygon: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/polygon/info/logo.png',
    arbitrum: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/arbitrum/info/logo.png',
    optimism: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/optimism/info/logo.png',
    base: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/base/info/logo.png',
    bnb: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/smartchain/info/logo.png',
    bitcoin: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/bitcoin/info/logo.png',
    bitcoincash: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/bitcoincash/info/logo.png',
    litecoin: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/litecoin/info/logo.png',
    zcash: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/zcash/info/logo.png',
    tron: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/tron/info/logo.png',
    monero: 'https://assets.coingecko.com/coins/images/69/small/monero_logo.png',
  };

  const chainColorMap: Record<string, string> = {
    solana: '#9945FF',
    ethereum: '#627EEA',
    polygon: '#8247E5',
    arbitrum: '#28A0F0',
    optimism: '#FF0420',
    base: '#0052FF',
    bnb: '#F0B90B',
    bitcoin: '#F7931A',
    bitcoincash: '#8DC351',
    litecoin: '#345D9D',
    zcash: '#F4B728',
    tron: '#FF0013',
    monero: '#FF6600',
  };

  const chainLetterMap: Record<string, string> = {
    solana: 'S',
    ethereum: 'E',
    polygon: 'P',
    arbitrum: 'A',
    optimism: 'O',
    base: 'B',
    bnb: 'B',
    bitcoin: '₿',
    bitcoincash: 'B',
    litecoin: 'Ł',
    zcash: 'Z',
    tron: 'T',
    monero: 'M',
  };

  const getLogoUrl = (): string => {
    if (chain === 'solana') return chainLogoMap.solana;
    const chainId = evmChainId as string;
    return chainLogoMap[chainId] || chainLogoMap.ethereum;
  };

  const getFallbackColor = () => {
    if (chain === 'solana') return chainColorMap.solana;
    const chainId = evmChainId as string;
    return chainColorMap[chainId] || chainColorMap.ethereum;
  };

  const getFallbackLetter = () => {
    if (chain === 'solana') return chainLetterMap.solana;
    const chainId = evmChainId as string;
    return chainLetterMap[chainId] || chainLetterMap.ethereum;
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
  activeChainId: string | null;
  onChainChange: (chain: ChainType, evmChainId?: EVMChainId, chainId?: string) => void;
  onOpen?: () => void;
  forceClose?: boolean;
  supportedChainFamilies?: ('solana' | 'evm' | 'bitcoin' | 'tron' | 'monero')[] | null;
}> = ({ activeChain, activeEVMChain, activeChainId, onChainChange, onOpen, forceClose, supportedChainFamilies }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when forceClose changes to true
  useEffect(() => {
    if (forceClose) {
      setIsOpen(false);
    }
  }, [forceClose]);

  const getCurrentChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    // First try to find by activeChainId (for Bitcoin, TRON, Monero, etc.)
    if (activeChainId) {
      const chain = SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
      if (chain) return chain.name;
    }
    // Fall back to evmChainId for EVM chains
    const chain = SUPPORTED_CHAINS.find((c) => c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };

  // Filter chains based on supported families for private key imports
  const availableChains = useMemo(() => {
    if (!supportedChainFamilies) {
      // null means all chains are supported (mnemonic wallet)
      return SUPPORTED_CHAINS;
    }
    // Filter to only show chains that match supported families
    return SUPPORTED_CHAINS.filter((chain) => supportedChainFamilies.includes(chain.family));
  }, [supportedChainFamilies]);

  // If only one chain is supported, don't show the selector
  if (availableChains.length <= 1) {
    return (
      <div className="chain-selector-container">
        <div className="chain-selector-btn chain-selector-single" title={`${getCurrentChainName()} only`}>
          <ChainIcon chain={activeChain} evmChainId={activeChainId || activeEVMChain || undefined} size={20} />
          <span className="chain-selector-label">{getCurrentChainName()}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="chain-selector-container">
      <button
        className="chain-selector-btn"
        onClick={() => {
          if (!isOpen && onOpen) {
            onOpen();
          }
          setIsOpen(!isOpen);
        }}
        title="Switch chain"
      >
        <ChainIcon chain={activeChain} evmChainId={activeChainId || activeEVMChain || undefined} size={20} />
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
            {availableChains.map((chain) => {
              // Check active state - IMPORTANT: Only one chain should be active at a time
              let isActive = false;
              if (activeChain === 'solana') {
                // When on Solana, only Solana should be active
                isActive = chain.type === 'solana';
              } else if (activeChain === 'evm') {
                // When on EVM-type chains (includes Bitcoin/TRON/Monero for legacy reasons)
                // First check by chainId (works for all chains including non-EVM)
                if (activeChainId && chain.chainId === activeChainId) {
                  isActive = true;
                } else if (!activeChainId && chain.family === 'evm' && chain.evmChainId === activeEVMChain) {
                  // Fallback to evmChainId for actual EVM chains when no chainId is set
                  isActive = true;
                }
              }

              return (
                <button
                  key={chain.chainId}
                  className={`chain-selector-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    // Pass evmChainId only for EVM chains, always pass chainId
                    onChainChange(chain.type, chain.evmChainId, chain.chainId);
                    setIsOpen(false);
                  }}
                >
                  <ChainIcon chain={chain.type} evmChainId={chain.evmChainId || chain.chainId} size={24} />
                  <div className="chain-item-info">
                    <span className="chain-item-name">{chain.name}</span>
                    <span className="chain-item-symbol">{chain.symbol}</span>
                  </div>
                  {chain.family === 'monero' && (
                    <span className="chain-watch-only-badge">Watch Only</span>
                  )}
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
  activeChainId,
  evmAddress,
  onSend,
  onSendToken,
  onReceive,
  onSwap,
  onLock,
  onManageWallets,
  onWalletSwitch,
  onChainChange,
  hideBalances,
  onToggleHideBalances,
  privacyEnabled,
  onPriceUpdate,
  onShowMoneroSetup,
  supportedChainFamilies,
}) => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [evmBalance, setEvmBalance] = useState<EVMBalance | null>(null);
  const [tokens, setTokens] = useState<SPLTokenBalance[]>([]);
  const [evmTokens, setEvmTokens] = useState<EVMTokenBalance[]>([]);
  const [history, setHistory] = useState<TransactionHistoryItem[]>([]);
  const [evmHistory, setEvmHistory] = useState<EVMHistoryItem[]>([]);
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
  const [evmTokenPrices, setEvmTokenPrices] = useState<Record<string, number>>({});
  const [tokenMetadataCache, setTokenMetadataCache] = useState<
    Record<string, { symbol?: string; name?: string; logoUri?: string }>
  >({});
  const [showAddToken, setShowAddToken] = useState(false);
  const [addTokenMint, setAddTokenMint] = useState('');
  const [addTokenSymbol, setAddTokenSymbol] = useState('');
  const [addTokenName, setAddTokenName] = useState('');
  const [addTokenLogoUri, setAddTokenLogoUri] = useState('');
  const [addTokenError, setAddTokenError] = useState('');
  const [addingToken, setAddingToken] = useState(false);

  // Token search state
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(tokenSearchQuery, 250);

  // Hide dust tokens (< $1 value)
  const [hideDustTokens, setHideDustTokens] = useState(false);

  // Hide spam tokens (auto-detected potential scam/spam tokens)
  const [hideSpamTokens, setHideSpamTokens] = useState(true);

  // Chain-specific address (for Bitcoin, TRON, Monero, etc.)
  const [chainAddress, setChainAddress] = useState<string | null>(null);
  const [chainAddressLoading, setChainAddressLoading] = useState(false);

  // Determine the actual chain family (evm, solana, bitcoin, tron, monero)
  // This is important because non-EVM chains have activeChain='evm' for legacy compatibility
  const currentChainInfo = useMemo(() => {
    if (activeChain === 'solana') {
      return SUPPORTED_CHAINS.find((c) => c.chainId === 'solana');
    }
    if (activeChainId) {
      return SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
    }
    if (activeEVMChain) {
      return SUPPORTED_CHAINS.find((c) => c.evmChainId === activeEVMChain);
    }
    return SUPPORTED_CHAINS.find((c) => c.chainId === 'ethereum');
  }, [activeChain, activeChainId, activeEVMChain]);

  // Helper flags for checking actual chain family
  const isActuallyEVM = currentChainInfo?.family === 'evm';
  const isActuallySolana = activeChain === 'solana' || currentChainInfo?.family === 'solana';
  const chainFamily = currentChainInfo?.family || 'evm';
  const supportsTokens = isActuallySolana || isActuallyEVM;

  // Switch away from tokens tab when chain doesn't support tokens
  useEffect(() => {
    if (!supportsTokens && activeTab === 'tokens') {
      setActiveTab('activity');
    }
  }, [supportsTokens, activeTab]);

  // Clear stale data when switching chains to prevent showing old chain's data
  // This applies to ALL chain switches, not just EVM chains
  useEffect(() => {
    // Clear EVM data when chain changes to prevent stale data
    setEvmTokens([]);
    setEvmTokenPrices({});
    setEvmBalance(null);
    setEvmHistory([]);
    // Also clear Solana data when switching away
    setHistory([]);
  }, [activeEVMChain, activeChainId]); // Trigger on any chain change

  // Fetch chain-specific address when chain changes
  useEffect(() => {
    const fetchChainAddress = async () => {
      // For Solana, use the publicAddress
      if (activeChain === 'solana') {
        setChainAddress(null);
        return;
      }
      
      // For EVM chains, use evmAddress
      if (activeChain === 'evm' && activeEVMChain && !activeChainId) {
        setChainAddress(null);
        return;
      }
      
      // Find chain info by chainId
      const chainInfo = SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
      
      if (!chainInfo || !activeChainId) {
        // Fall back to EVM chain if no chainId
        setChainAddress(null);
        return;
      }
      
      // For EVM chains, use evmAddress
      if (chainInfo.family === 'evm') {
        setChainAddress(null);
        return;
      }
      
      // For Bitcoin, TRON, Monero, etc., fetch the chain-specific address
      setChainAddressLoading(true);
      try {
        const res = await sendToBackground({
          type: 'WALLET_GET_CHAIN_ADDRESS',
          payload: { chainId: activeChainId },
        });
        if (res.success && res.data) {
          const data = res.data as { address: string; chainId: string; chainFamily: string; symbol: string };
          setChainAddress(data.address || null);
        } else {
          setChainAddress(null);
        }
      } catch (error) {
        console.error('Failed to fetch chain address:', error);
        setChainAddress(null);
      } finally {
        setChainAddressLoading(false);
      }
    };
    
    fetchChainAddress();
  }, [activeChain, activeEVMChain, activeChainId]);

  // Current display address based on active chain
  // Priority: chainAddress (for non-EVM chains) > evmAddress (for EVM chains) > address (Solana)
  // Important: For non-EVM/non-Solana chains (Monero, Bitcoin, TRON), don't fall back to wrong address types
  const displayAddress = useMemo(() => {
    if (activeChain === 'solana') return address;
    
    // For non-EVM/non-Solana chains (identified by activeChainId), use chain-specific address
    // Don't fall back to EVM/Solana address as that would show the wrong address type
    if (activeChainId) {
      const chainInfo = SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
      if (chainInfo && chainInfo.family !== 'evm' && chainInfo.family !== 'solana') {
        // For Monero, Bitcoin, TRON, etc. - return chainAddress even if empty
        // This prevents showing a Solana/EVM address when Monero is selected
        return chainAddress || '';
      }
    }
    
    if (chainAddress) return chainAddress;
    return evmAddress || address;
  }, [activeChain, chainAddress, evmAddress, address, activeChainId]);

  // Get native symbol for current chain
  const getNativeSymbol = () => {
    if (activeChain === 'solana') return 'SOL';
    // First try to find by activeChainId (for Bitcoin, TRON, Monero, etc.)
    if (activeChainId) {
      const chain = SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
      if (chain) return chain.symbol;
    }
    // Fall back to evmChainId for EVM chains
    const chain = SUPPORTED_CHAINS.find((c) => c.evmChainId === activeEVMChain);
    return chain?.symbol || 'ETH';
  };

  // Get chain display name
  const getChainDisplayName = () => {
    if (activeChain === 'solana') return 'Solana';
    // First try to find by activeChainId (for Bitcoin, TRON, Monero, etc.)
    if (activeChainId) {
      const chain = SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
      if (chain) return chain.name;
    }
    // Fall back to evmChainId for EVM chains
    const chain = SUPPORTED_CHAINS.find((c) => c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };
  
  // Count spam tokens
  const spamSPLCount = useMemo(() => {
    return tokens.filter((t) => t.spamInfo?.isSpam).length;
  }, [tokens]);

  const spamEVMCount = useMemo(() => {
    return evmTokens.filter((t) => t.spamInfo?.isSpam).length;
  }, [evmTokens]);

  const totalSpamCount = isActuallySolana ? spamSPLCount : spamEVMCount;

  // Filtered tokens based on search query
  const filteredSPLTokens = useMemo((): SPLTokenWithMatch[] => {
    let filtered = filterSPLTokens(tokens, { query: debouncedSearchQuery });
    // Apply spam filter if enabled
    if (hideSpamTokens) {
      filtered = filtered.filter((token) => !token.spamInfo?.isSpam);
    }
    // Apply dust filter if enabled
    if (hideDustTokens) {
      filtered = filtered.filter((token) => {
        const price = tokenPrices[token.mint];
        const value = price ? token.uiBalance * price : 0;
        return value >= 1;
      });
    }
    return filtered;
  }, [tokens, debouncedSearchQuery, hideDustTokens, hideSpamTokens, tokenPrices]);

  const filteredEVMTokens = useMemo((): EVMTokenWithMatch[] => {
    let filtered = filterEVMTokens(evmTokens, { query: debouncedSearchQuery });
    // Apply spam filter if enabled
    if (hideSpamTokens) {
      filtered = filtered.filter((token) => !token.spamInfo?.isSpam);
    }
    // Apply dust filter if enabled
    if (hideDustTokens) {
      filtered = filtered.filter((token) => {
        // Same logic as SOL: calculate value, hide if < $1
        const price = evmTokenPrices[token.address.toLowerCase()];
        const value = price ? token.uiBalance * price : 0;
        return value >= 1;
      });
    }
    return filtered;
  }, [evmTokens, debouncedSearchQuery, hideDustTokens, hideSpamTokens, evmTokenPrices]);

  // Check if native tokens match search
  // NOTE: Native tokens (SOL/ETH) are NEVER hidden by dust filter - they're needed for gas fees
  const solTokenMatch = useMemo((): NativeTokenWithMatch | null => {
    return filterNativeToken(
      { type: 'native', chain: 'solana', symbol: 'SOL', name: 'Solana' },
      debouncedSearchQuery,
    );
  }, [debouncedSearchQuery]);

  // Native token match for EVM chains - uses chain-specific symbol and name (ETH, BNB, MATIC, etc.)
  const evmNativeTokenMatch = useMemo((): NativeTokenWithMatch | null => {
    if (!evmAddress || !currentChainInfo || currentChainInfo.family !== 'evm') return null;
    return filterNativeToken(
      { type: 'native', chain: 'evm', symbol: currentChainInfo.symbol, name: currentChainInfo.name },
      debouncedSearchQuery,
    );
  }, [evmAddress, debouncedSearchQuery, currentChainInfo]);

  // Check if we have any search results (for active chain only)
  const hasTokenSearchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim() && !hideDustTokens && !hideSpamTokens) return true; // No filters = show all
    if (activeChain === 'solana') {
      return solTokenMatch !== null || filteredSPLTokens.length > 0;
    } else {
      return evmNativeTokenMatch !== null || filteredEVMTokens.length > 0;
    }
  }, [
    debouncedSearchQuery,
    hideDustTokens,
    hideSpamTokens,
    activeChain,
    solTokenMatch,
    evmNativeTokenMatch,
    filteredSPLTokens,
    filteredEVMTokens,
  ]);

  // Count visible tokens for tab badge (for active chain only)
  const visibleTokenCount = useMemo(() => {
    if (isActuallySolana) {
      let count = solTokenMatch !== null ? 1 : 0;
      count += filteredSPLTokens.length;
      return count;
    } else if (isActuallyEVM) {
      let count = evmNativeTokenMatch !== null ? 1 : 0;
      count += filteredEVMTokens.length;
      return count;
    } else {
      // For non-EVM/non-Solana chains (Bitcoin, Tron, Monero), just the native token
      return 1;
    }
  }, [isActuallySolana, isActuallyEVM, solTokenMatch, evmNativeTokenMatch, filteredSPLTokens, filteredEVMTokens]);

  // Calculate total portfolio value in USD (active chain only: native + tokens)
  const totalPortfolioValue = useMemo(() => {
    let total = 0;

    if (isActuallySolana) {
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
    } else if (isActuallyEVM) {
      // Add ETH/native token value
      if (evmBalance && ethPrice !== null) {
        total += evmBalance.formatted * ethPrice;
      }
      // Add ERC-20 token values (use lowercase for price lookup)
      evmTokens.forEach((token) => {
        const price = evmTokenPrices[token.address.toLowerCase()];
        if (price) {
          total += token.uiBalance * price;
        }
      });
    } else {
      // Bitcoin, Tron, etc. - use evmBalance with ethPrice (used for native token price fetching)
      if (evmBalance && ethPrice !== null) {
        total += evmBalance.formatted * ethPrice;
      }
    }

    return total;
  }, [isActuallySolana, isActuallyEVM, balance, solPrice, evmBalance, ethPrice, tokens, tokenPrices, evmTokens, evmTokenPrices]);

  const fetchData = useCallback(
    async (forceRefresh: boolean = false) => {
      setLoadingBalance(true);

      // Store fetched tokens locally to use for price fetching
      // (avoids dependency on `tokens` state which causes infinite loops)
      let fetchedTokens: SPLTokenBalance[] = [];
      let fetchedEvmTokens: EVMTokenBalance[] = [];

      try {
      // OPTIMIZATION: Only fetch data for the ACTIVE chain to avoid rate limiting
      // Fetch balance and tokens in parallel for the active chain

      if (activeChain === 'solana') {
        // Solana: fetch balance, tokens, and history in parallel
        const [balanceRes, tokensRes, historyRes] = await Promise.all([
          sendToBackground({ type: 'WALLET_GET_BALANCE', payload: {} }),
          sendToBackground({ type: 'WALLET_GET_TOKENS', payload: {} }),
          sendToBackground({ type: 'WALLET_GET_HISTORY', payload: { limit: 50, forceRefresh } }),
        ]);

        if (balanceRes.success && balanceRes.data) {
          setBalance(balanceRes.data as WalletBalance);
        }
        if (tokensRes.success && tokensRes.data) {
          fetchedTokens = tokensRes.data as SPLTokenBalance[];
          setTokens(fetchedTokens);
        }
        if (historyRes.success && historyRes.data) {
          const result = historyRes.data as { transactions: TransactionHistoryItem[] };
          setHistory(result.transactions);
          // Update ref to track the latest transaction
          prevHistorySignatureRef.current = result.transactions[0]?.signature || null;
        }
        // Clear EVM data when on Solana
        setEvmHistory([]);
      } else if (chainFamily === 'monero') {
        // Monero: watch-only mode requires address + view key import
        // Don't fetch history - UI shows setup prompt instead
        setHistory([]);
        setEvmHistory([]);
        setEvmTokens([]);
        prevHistorySignatureRef.current = null;
        
        // Still fetch Monero price for display
        const priceRes = await sendToBackground({
          type: 'GET_EVM_NATIVE_PRICE',
          payload: { evmChainId: 'monero' },
        });
        if (priceRes.success && priceRes.data) {
          const data = priceRes.data as { price: number; change24h: number | null };
          setEthPrice(data.price);
          setEthChange24h(data.change24h);
        }
      } else if (chainFamily === 'bitcoin' || chainFamily === 'tron') {
        // Bitcoin/Tron family chains: fetch balance, history and price using chain-specific adapter
        const chainId = activeChainId || activeEVMChain || 'bitcoin';
        
        // Fetch balance, history, and price for Bitcoin/Tron chains in parallel
        const [balanceRes, historyRes, priceRes] = await Promise.all([
          sendToBackground({
            type: 'WALLET_GET_EVM_BALANCE',
            payload: { evmChainId: chainId },
          }),
          sendToBackground({
            type: 'WALLET_GET_EVM_HISTORY',
            payload: { evmChainId: chainId, limit: 50 },
          }),
          sendToBackground({
            type: 'GET_EVM_NATIVE_PRICE',
            payload: { evmChainId: chainId },
          }),
        ]);
        
        if (balanceRes.success && balanceRes.data) {
          setEvmBalance(balanceRes.data as EVMBalance);
        }
        
        if (historyRes.success && historyRes.data) {
          const result = historyRes.data as { transactions: EVMHistoryItem[] };
          setEvmHistory(result.transactions || []);
        } else {
          setEvmHistory([]);
        }
        
        // Set price and 24h change (reusing ethPrice/ethChange24h for display compatibility)
        if (priceRes.success && priceRes.data) {
          const data = priceRes.data as { price: number; change24h: number | null };
          setEthPrice(data.price);
          setEthChange24h(data.change24h);
        }
        
        // Clear Solana history and tokens (Bitcoin/Tron don't support tokens in same way)
        setHistory([]);
        setEvmTokens([]);
        prevHistorySignatureRef.current = null;
      } else if (evmAddress) {
        // EVM: fetch balance, tokens, and history in parallel
        // Use activeChainId for new chain system, fallback to activeEVMChain for legacy
        const chainIdForRequest = activeChainId || activeEVMChain || 'ethereum';
        
        const [evmBalanceRes, evmTokensRes, evmHistoryRes] = await Promise.all([
          sendToBackground({
            type: 'WALLET_GET_EVM_BALANCE',
            payload: { evmChainId: chainIdForRequest },
          }),
          sendToBackground({
            type: 'WALLET_GET_EVM_TOKENS',
            payload: { evmChainId: chainIdForRequest },
          }),
          sendToBackground({
            type: 'WALLET_GET_EVM_HISTORY',
            payload: { evmChainId: chainIdForRequest, limit: 50 },
          }),
        ]);

        if (evmBalanceRes.success && evmBalanceRes.data) {
          setEvmBalance(evmBalanceRes.data as EVMBalance);
        }
        if (evmTokensRes.success && evmTokensRes.data) {
          fetchedEvmTokens = evmTokensRes.data as EVMTokenBalance[];
          setEvmTokens(fetchedEvmTokens);
        }
        if (evmHistoryRes.success && evmHistoryRes.data) {
          const result = evmHistoryRes.data as { transactions: EVMHistoryItem[] };
          setEvmHistory(result.transactions || []);
        }

        // Clear Solana history when on EVM
        setHistory([]);
        prevHistorySignatureRef.current = null; // Reset ref when switching to EVM
      } else {
        // No EVM address available (e.g., Solana-only private key import)
        setHistory([]);
        setEvmHistory([]);
        prevHistorySignatureRef.current = null; // Reset ref
      }

      // Fetch security connections (light operation)
      const connectionsRes = await sendToBackground({
        type: 'SECURITY_GET_CONNECTIONS',
        payload: { limit: 10 },
      });
      if (connectionsRes.success && connectionsRes.data) {
        setConnections(connectionsRes.data as ConnectionRecordUI[]);
      }

      // OPTIMIZATION: Only fetch prices for active chain to reduce API calls
      if (activeChain === 'solana') {
        // Fetch SOL price with 24h change
        const priceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
        if (priceRes.success && priceRes.data) {
          const data = priceRes.data as { price: number; change24h: number | null };
          setSolPrice(data.price);
          setSolChange24h(data.change24h);
        }

        // Fetch token prices using the freshly fetched tokens (not state)
        // This is deferred to avoid blocking initial load
        if (fetchedTokens.length > 0) {
          setTimeout(async () => {
            try {
              const mints = fetchedTokens.map((t: SPLTokenBalance) => t.mint);
              const tokenPricesRes = await sendToBackground({
                type: 'GET_TOKEN_PRICES',
                payload: { mints },
              });
              // Always set prices (even if empty) to signal loading complete
              const prices = (tokenPricesRes.success && tokenPricesRes.data) 
                ? tokenPricesRes.data as Record<string, number>
                : {};
              // Use a marker value if empty so loading overlay knows we tried
              if (Object.keys(prices).length === 0) {
                (prices as Record<string, number>)['__loaded__'] = 1;
              }
              setTokenPrices(prices);
            } catch {
              // On error, still mark as loaded to prevent infinite loading
              setTokenPrices({ '__loaded__': 1 });
            }
          }, 300);
        } else {
          // No tokens to fetch prices for, mark as loaded
          setTokenPrices({ '__loaded__': 1 });
        }
      } else if (chainFamily === 'evm') {
        // Only fetch EVM prices for actual EVM chains (not Bitcoin/Tron/Monero)
        // Bitcoin/Tron/Monero already fetch their prices in their respective branches above
        const evmChainId = activeEVMChain || 'ethereum';
        const ethPriceRes = await sendToBackground({ 
          type: 'GET_EVM_NATIVE_PRICE', 
          payload: { evmChainId } 
        });
        if (ethPriceRes.success && ethPriceRes.data) {
          const data = ethPriceRes.data as { price: number; change24h: number | null };
          setEthPrice(data.price);
          setEthChange24h(data.change24h);
        }

        // Fetch EVM token prices using the freshly fetched tokens (not state)
        // This is deferred to avoid blocking initial load
        if (fetchedEvmTokens.length > 0) {
          setTimeout(async () => {
            try {
              // Normalize addresses to lowercase for consistent price lookup
              const addresses = fetchedEvmTokens.map((t: EVMTokenBalance) => t.address.toLowerCase());
              const evmTokenPricesRes = await sendToBackground({
                type: 'GET_TOKEN_PRICES',
                payload: { mints: addresses, chainId: activeChainId || activeEVMChain || 'ethereum' },
              });
              // Store prices with lowercase keys for consistent lookup
              const normalizedPrices: Record<string, number> = {};
              if (evmTokenPricesRes.success && evmTokenPricesRes.data) {
                const prices = evmTokenPricesRes.data as Record<string, number>;
                for (const [key, value] of Object.entries(prices)) {
                  normalizedPrices[key.toLowerCase()] = value;
                }
              }
              // Always set prices (even if empty) to signal loading complete
              // Use a marker value if empty so loading overlay knows we tried
              if (Object.keys(normalizedPrices).length === 0) {
                normalizedPrices['__loaded__'] = 1;
              }
              setEvmTokenPrices(normalizedPrices);
            } catch {
              // On error, still mark as loaded to prevent infinite loading
              setEvmTokenPrices({ '__loaded__': 1 });
            }
          }, 300);
        } else {
          // No tokens to fetch prices for, mark as loaded
          setEvmTokenPrices({ '__loaded__': 1 });
        }
      }
      // Note: Bitcoin, Tron, and Monero prices are already fetched in their respective branches above
      } catch (error) {
        // Log error for debugging but don't crash the UI
        console.error('[WalletDashboard] Error fetching data:', error);
      } finally {
        // CRITICAL: Always stop loading to prevent infinite loading state
        // This ensures the UI remains responsive even if network requests fail
        setLoadingBalance(false);
      }
    },
    [activeChain, activeEVMChain, activeChainId, chainFamily, evmAddress],
  );

  useEffect(() => {
    fetchData(true); // Force refresh when component mounts or chain changes to get full history
  }, [fetchData]);

  // Real-time price updates every 5 seconds with flash animation
  useEffect(() => {
    const updatePrices = async () => {
      // Fetch SOL price with 24h change (always fetch for background caching)
      const solPriceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
      if (solPriceRes.success && solPriceRes.data) {
        const data = solPriceRes.data as { price: number; change24h: number | null };
        const newPrice = data.price;

        // Compare with previous price and trigger flash (only for active chain)
        if (
          activeChain === 'solana' &&
          prevSolPriceRef.current !== null &&
          newPrice !== prevSolPriceRef.current
        ) {
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

      // Fetch native price for non-Solana chains
      // Use activeChainId for Bitcoin/Tron/Monero, or activeEVMChain for actual EVM chains
      const priceChainId = activeChainId || activeEVMChain || 'ethereum';
      const ethPriceRes = await sendToBackground({ 
        type: 'GET_EVM_NATIVE_PRICE', 
        payload: { evmChainId: priceChainId } 
      });
      if (ethPriceRes.success && ethPriceRes.data) {
        const data = ethPriceRes.data as { price: number; change24h: number | null };
        const newPrice = data.price;

        // Compare with previous price and trigger flash (only for active non-Solana chain)
        if (
          !isActuallySolana &&
          prevEthPriceRef.current !== null &&
          newPrice !== prevEthPriceRef.current
        ) {
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

      // Notify parent component of price updates
      if (onPriceUpdate) {
        interface PriceData { price: number }
        onPriceUpdate(
          solPriceRes.success && solPriceRes.data ? (solPriceRes.data as PriceData).price : null,
          ethPriceRes.success && ethPriceRes.data ? (ethPriceRes.data as PriceData).price : null
        );
      }
    };

    // Update prices every 5 seconds
    const interval = setInterval(updatePrices, 5000);

    return () => clearInterval(interval);
  }, [activeChain, activeEVMChain, activeChainId, isActuallySolana]);

  // Track previous history signature to detect new transactions
  const prevHistorySignatureRef = useRef<string | null>(null);

  // Enrich transaction token metadata for transactions missing symbol/name
  useEffect(() => {
    const enrichMissingTokenMetadata = async () => {
      if (activeChain !== 'solana' || history.length === 0) return;

      // Find transactions with tokenInfo but missing symbol
      const missingMetadata = history
        .filter((tx) => tx.tokenInfo && !tx.tokenInfo.symbol)
        .map((tx) => tx.tokenInfo!.mint);

      // Remove duplicates and already cached
      const uniqueMints = Array.from(new Set(missingMetadata)).filter(
        (mint) => !tokenMetadataCache[mint],
      );

      if (uniqueMints.length === 0) return;

      // Fetch metadata for missing tokens (max 5 at a time to avoid overwhelming)
      const mintsToFetch = uniqueMints.slice(0, 5);

      for (const mint of mintsToFetch) {
        try {
          const res = await sendToBackground({
            type: 'WALLET_GET_TOKEN_METADATA',
            payload: { mint },
          });

          if (res.success && res.data) {
            const metadata = res.data as { symbol: string; name: string; logoUri?: string };
            setTokenMetadataCache((prev) => ({
              ...prev,
              [mint]: metadata,
            }));
          }
        } catch (error) {}
      }
    };

    enrichMissingTokenMetadata();
  }, [history, activeChain, tokenMetadataCache]);

  // Auto-refresh balance and activity every 15 seconds to catch incoming transactions
  // This runs silently in the background without showing loading state
  useEffect(() => {
    const autoRefresh = async () => {
      // Skip if already refreshing manually
      if (refreshing) return;

      try {
      // Silently fetch fresh balance data with forceRefresh to bypass all caches
      if (activeChain === 'solana') {
        // First check for new transactions (quick check)
        const historyRes = await sendToBackground({
          type: 'WALLET_GET_HISTORY',
          payload: { limit: 5, forceRefresh: true },
        });

        let hasNewTransactions = false;
        if (historyRes.success && historyRes.data) {
          const result = historyRes.data as { transactions: TransactionHistoryItem[] };
          const newSignature = result.transactions[0]?.signature || null;

          // Check if there's a new transaction
          if (newSignature && newSignature !== prevHistorySignatureRef.current) {
            hasNewTransactions = prevHistorySignatureRef.current !== null;
            prevHistorySignatureRef.current = newSignature;
            
            // Only update history if there are new transactions - fetch full history
            if (hasNewTransactions) {
              const fullHistoryRes = await sendToBackground({
                type: 'WALLET_GET_HISTORY',
                payload: { limit: 50, forceRefresh: true },
              });
              if (fullHistoryRes.success && fullHistoryRes.data) {
                const fullResult = fullHistoryRes.data as { transactions: TransactionHistoryItem[] };
                setHistory(fullResult.transactions);
              }
            }
          }
          // Don't update history during auto-refresh if no new transactions
        }

        // If new transactions detected, force refresh balance and tokens immediately
        const shouldForceRefresh = hasNewTransactions;

        const [balanceRes, tokensRes] = await Promise.all([
          sendToBackground({
            type: 'WALLET_GET_BALANCE',
            payload: { forceRefresh: shouldForceRefresh || true },
          }),
          sendToBackground({
            type: 'WALLET_GET_TOKENS',
            payload: { forceRefresh: shouldForceRefresh || true },
          }),
        ]);

        if (balanceRes.success && balanceRes.data) {
          setBalance(balanceRes.data as WalletBalance);
        }
        if (tokensRes.success && tokensRes.data) {
          setTokens(tokensRes.data as SPLTokenBalance[]);
        }
      } else if (chainFamily === 'bitcoin' || chainFamily === 'tron') {
        // Auto-refresh for Bitcoin/Tron chains - fetch both balance AND history
        const chainId = activeChainId || 'bitcoin';
        const [evmBalanceRes, historyRes] = await Promise.all([
          sendToBackground({
            type: 'WALLET_GET_EVM_BALANCE',
            payload: { evmChainId: chainId },
          }),
          sendToBackground({
            type: 'WALLET_GET_EVM_HISTORY',
            payload: { evmChainId: chainId, limit: 50 },
          }),
        ]);

        if (evmBalanceRes.success && evmBalanceRes.data) {
          setEvmBalance(evmBalanceRes.data as EVMBalance);
        }
        if (historyRes.success && historyRes.data) {
          const result = historyRes.data as { transactions: EVMHistoryItem[] };
          setEvmHistory(result.transactions || []);
        }
      } else if (chainFamily === 'evm' && evmAddress) {
        // Auto-refresh for actual EVM chains
        const evmBalanceRes = await sendToBackground({
          type: 'WALLET_GET_EVM_BALANCE',
          payload: { evmChainId: activeEVMChain || 'ethereum' },
        });

        if (evmBalanceRes.success && evmBalanceRes.data) {
          setEvmBalance(evmBalanceRes.data as EVMBalance);
        }
      }
      // Note: Monero is watch-only and doesn't auto-refresh
      } catch (error) {
        // Silently ignore errors during auto-refresh to prevent UI disruption
        console.warn('[WalletDashboard] Auto-refresh error:', error);
      }
    };

    // Auto-refresh every 15 seconds for faster incoming tx detection
    const interval = setInterval(autoRefresh, 15000);

    return () => clearInterval(interval);
  }, [activeChain, activeEVMChain, activeChainId, chainFamily, evmAddress, refreshing]);

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
          logoUri: addTokenLogoUri || undefined,
        },
      });

      if (res.success) {
        setShowAddToken(false);
        setAddTokenMint('');
        setAddTokenSymbol('');
        setAddTokenName('');
        setAddTokenLogoUri('');
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

  // Reset add token form state when closing
  const handleCloseAddToken = () => {
    setShowAddToken(false);
    setAddTokenMint('');
    setAddTokenSymbol('');
    setAddTokenName('');
    setAddTokenLogoUri('');
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

  // Helper to calculate USD value for Solana transactions
  const getSolanaTransactionUsdValue = (tx: TransactionHistoryItem): number | null => {
    if (tx.tokenInfo) {
      // Token transfer - we don't have individual token prices readily available
      // Return null to indicate we can't calculate the value
      return null;
    } else {
      // Native SOL transfer
      if (solPrice) {
        return tx.amountSol * solPrice;
      }
    }
    return null;
  };

  // Helper to calculate USD value for EVM transactions
  const getEvmTransactionUsdValue = (tx: EVMHistoryItem): number | null => {
    if (tx.tokenAddress) {
      // Token transfer - we don't have individual token prices readily available
      // Return null to indicate we can't calculate the value
      return null;
    } else {
      // Native transfer
      const chainPrice = isActuallyEVM && activeEVMChain ? 
        (activeEVMChain === 'ethereum' ? ethPrice : 
         activeEVMChain === 'polygon' ? ethPrice : // Using ETH price as proxy for now
         ethPrice) : 
        ethPrice;
      
      if (chainPrice) {
        return tx.amount * chainPrice;
      }
    }
    return null;
  };

  // Filter out spam token transactions from activity
  // Uses same spam detection patterns as token list filtering
  const isSpamTokenName = (name: string, symbol: string): boolean => {
    const combined = `${name} ${symbol}`.toLowerCase();
    
    // URL patterns in token names (high confidence spam)
    const urlPattern = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{2,6}\b/i;
    const domainPattern = /\b[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|org|net|io|xyz|app|finance|claim|airdrop)\b/i;
    
    if (urlPattern.test(name) || urlPattern.test(symbol)) return true;
    if (domainPattern.test(name) || domainPattern.test(symbol)) return true;
    
    // Phishing keywords (need at least 2 matches to flag as spam)
    const phishingKeywords = [
      'claim', 'free', 'airdrop', 'reward', 'bonus', 'gift', 'giveaway', 
      'promo', 'prize', 'winner', 'visit', 'redeem', 'unlock', 'activate',
      'verify', 'validate', 'limited time', 'urgent', 'expires', 'hurry',
      'act now', 'last chance', 'exclusive', 'selected', 'chosen', 'eligible'
    ];
    const matchedKeywords = phishingKeywords.filter(kw => combined.includes(kw));
    if (matchedKeywords.length >= 2) return true;
    
    // Promotional patterns
    const promotionalPatterns = [
      /\bfree\s+\w+/i,
      /\bclaim\s+(?:your|now|here|at)/i,
      /\bairdrop\s+(?:live|now|claim)/i,
      /\$\d+(?:,\d{3})*(?:\.\d+)?\s*(?:reward|bonus|free)/i,
      /\bvisit\s+\S+\.\S+/i,
    ];
    if (promotionalPatterns.some(pattern => pattern.test(combined))) return true;
    
    // Excessive symbol length (most real tokens have short symbols)
    if (symbol.length > 12) return true;
    
    return false;
  };

  const filterLowValueTransactions = <T extends TransactionHistoryItem | EVMHistoryItem>(
    transactions: T[],
    _getUsdValue: (tx: T) => number | null
  ): T[] => {
    if (!hideSpamTokens) return transactions;
    
    return transactions.filter((tx) => {
      // Check Solana transactions
      if ('signature' in tx) {
        const solanaTx = tx as TransactionHistoryItem;
        const isSent = solanaTx.direction === 'sent';
        
        // For native SOL transfers (no tokenInfo)
        if (!solanaTx.tokenInfo) {
          // Allow all outgoing transactions (user initiated)
          if (isSent) return true;
          
          // Allow swap transactions (these are legitimate even with 0 SOL change)
          if (solanaTx.swapInfo) return true;
          
          // Filter out non-sent (received/unknown) transactions with 0 or dust SOL
          // These are spam dust attacks or failed spam transactions
          // 'unknown' direction with 0 value shows as "Received SOL" in the UI
          // Threshold: 0.0001 SOL (100 lamports)
          if (solanaTx.amountLamports < 100) {
            return false;
          }
          
          return true;
        }
        
        // Check if the token in loaded tokens is marked as spam
        const tokenFromList = tokens.find(t => t.mint === solanaTx.tokenInfo?.mint);
        if (tokenFromList?.spamInfo?.isSpam) return false;
        
        // Check token name/symbol for spam patterns
        const tokenName = solanaTx.tokenInfo.name || solanaTx.tokenInfo.symbol || '';
        const tokenSymbol = solanaTx.tokenInfo.symbol || '';
        if (isSpamTokenName(tokenName, tokenSymbol)) return false;
        
        return true;
      }
      
      // Check EVM transactions
      if ('hash' in tx) {
        const evmTx = tx as EVMHistoryItem;
        const isSent = evmTx.direction === 'sent';
        
        // For native transfers (no tokenAddress)
        if (!evmTx.tokenAddress) {
          // Allow all outgoing transactions (user initiated)
          if (isSent) return true;
          
          // Filter out non-sent (received/unknown) 0 or dust native transfers
          if (evmTx.amount < 0.0000001) {
            return false;
          }
          
          return true;
        }
        
        // Check if the token in loaded tokens is marked as spam
        const tokenFromList = evmTokens.find(
          t => t.address.toLowerCase() === evmTx.tokenAddress?.toLowerCase()
        );
        if (tokenFromList?.spamInfo?.isSpam) return false;
        
        // Check token name/symbol for spam patterns
        const tokenSymbol = evmTx.symbol || '';
        if (isSpamTokenName(tokenSymbol, tokenSymbol)) return false;
        
        return true;
      }
      
      return true;
    });
  };

  // Get current balance value based on chain
  const getCurrentBalance = () => {
    if (isActuallySolana) {
      return balance ? formatSol(balance.sol) : '0';
    }
    // EVM, Bitcoin, Tron all use evmBalance
    return evmBalance ? formatSol(evmBalance.formatted) : '0';
  };

  // Check if all dashboard data is still loading
  // loadingBalance tracks the full data fetch (balance, tokens, prices, history, connections)
  // We also verify the active chain's required display data is available
  // For Solana: also wait for token prices if there are tokens (needed for portfolio calculation)
  // For EVM: also wait for token prices if there are tokens (needed for portfolio calculation)
  // For other chains: just wait for loadingBalance to finish (no additional data needed yet)
  const isAllDataLoading =
    loadingBalance ||
    (isActuallySolana
      ? balance === null ||
        solPrice === null ||
        (tokens.length > 0 && Object.keys(tokenPrices).length === 0)
      : isActuallyEVM
        ? evmBalance === null ||
          ethPrice === null ||
          (evmTokens.length > 0 && Object.keys(evmTokenPrices).length === 0)
        : false);

  return (
    <>
      {isAllDataLoading && (
        <div className="wallet-loading-overlay">
          <div className="wallet-loading-spinner"></div>
        </div>
      )}
      <div className="wallet-header">
        <div className="wallet-header-left">
          <button className="wallet-selector-btn" onClick={onManageWallets} title="Manage wallets">
            <WalletIcon size={14} />
            <span className="wallet-selector-label">{activeWalletLabel || 'Wallet'}</span>
            {walletCount > 1 && <span className="wallet-count-badge">{walletCount}</span>}
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
          activeChainId={activeChainId}
          onChainChange={onChainChange}
          supportedChainFamilies={supportedChainFamilies}
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
            <span
              className={`balance-value ${priceFlash === 'up' ? 'price-flash-up' : priceFlash === 'down' ? 'price-flash-down' : ''}`}
            >
              {(isActuallySolana ? solPrice !== null : isActuallyEVM ? ethPrice !== null : true)
                ? formatHiddenUsd(formatUsd(totalPortfolioValue), hideBalances)
                : '$--'}
            </span>
            {/* 24h change indicator - based on native token price change */}
            {!hideBalances && (
              <span
                className={`balance-change ${
                  isActuallySolana
                    ? solChange24h !== null
                      ? solChange24h >= 0
                        ? 'positive'
                        : 'negative'
                      : ''
                    : ethChange24h !== null
                      ? ethChange24h >= 0
                        ? 'positive'
                        : 'negative'
                      : ''
                }`}
              >
                {isActuallySolana &&
                  solChange24h !== null &&
                  balance &&
                  solPrice !== null &&
                  (() => {
                    const currentValue = balance.sol * solPrice;
                    const dollarChange = currentValue * (solChange24h / (100 + solChange24h));
                    const sign = solChange24h >= 0 ? '+' : '';
                    return (
                      <>
                        {sign}
                        {formatUsd(dollarChange)} ({sign}
                        {solChange24h.toFixed(2)}%) <span className="change-period">24h</span>
                      </>
                    );
                  })()}
                {/* Show 24h change for EVM, Bitcoin, Tron, and Monero chains (all use ethPrice/ethChange24h) */}
                {!isActuallySolana &&
                  ethChange24h !== null &&
                  evmBalance &&
                  ethPrice !== null &&
                  (() => {
                    const currentValue = evmBalance.formatted * ethPrice;
                    const dollarChange = currentValue * (ethChange24h / (100 + ethChange24h));
                    const sign = ethChange24h >= 0 ? '+' : '';
                    return (
                      <>
                        {sign}
                        {formatUsd(dollarChange)} ({sign}
                        {ethChange24h.toFixed(2)}%) <span className="change-period">24h</span>
                      </>
                    );
                  })()}
              </span>
            )}
          </div>
        )}
        {displayAddress && displayAddress.length > 0 && (
          <div className="address-display" onClick={copyAddress} title="Click to copy">
            <span className="address-text">{truncateAddress(displayAddress, 6)}</span>
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </div>
        )}
      </div>

      <div className="wallet-actions">
        {activeChainId !== 'monero' && (
          <button className="wallet-action-btn" onClick={onSend}>
            <SendIcon size={20} />
            <span className="action-label">Send</span>
          </button>
        )}
        <button className="wallet-action-btn" onClick={onReceive}>
          <ReceiveIcon size={20} />
          <span className="action-label">Receive</span>
        </button>
        {currentChainInfo && isSwapAvailableForChain(currentChainInfo.chainId) && (
          <button className="wallet-action-btn" onClick={() => onSwap(tokens, evmTokens, balance, evmBalance)}>
            <SwapIcon size={20} />
            <span className="action-label">Swap</span>
          </button>
        )}
      </div>

      <div className="wallet-tabs">
        <button
          className={`wallet-tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
        {supportsTokens && (
          <button
            className={`wallet-tab ${activeTab === 'tokens' ? 'active' : ''}`}
            onClick={() => setActiveTab('tokens')}
          >
            Tokens ({
              debouncedSearchQuery.trim()
                ? visibleTokenCount
                : isActuallySolana
                  ? 1 + tokens.length
                  : 1 + evmTokens.length
            })
          </button>
        )}
        <button
          className={`wallet-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Security
        </button>
      </div>

      {activeTab === 'activity' && (
        <div className={`tx-list ${refreshing ? 'refreshing' : ''}`}>
          {/* Monero requires watch-only setup - show prompt if not configured */}
          {chainFamily === 'monero' ? (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              <div style={{ 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #ff6600 0%, #ff8533 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 4px 12px rgba(255, 102, 0, 0.25)'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Monero Watch-Only
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                Track your balance and incoming transactions using your view key
              </div>
              {displayAddress ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: 'var(--text-muted)', 
                    marginBottom: '12px',
                    padding: '10px 14px',
                    background: 'var(--bg-secondary, #f5f5f5)',
                    borderRadius: '8px'
                  }}>
                    Wallet configured. Transactions will appear here.
                  </div>
                  <button
                    style={{
                      background: 'transparent',
                      border: '1.5px solid var(--border-color, #e0e0e0)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-secondary, #666)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onClick={() => onShowMoneroSetup?.()}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#ff6600';
                      e.currentTarget.style.color = '#ff6600';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color, #e0e0e0)';
                      e.currentTarget.style.color = 'var(--text-secondary, #666)';
                    }}
                  >
                    Edit Configuration
                  </button>
                </div>
              ) : (
                <button
                  style={{ 
                    padding: '12px 24px', 
                    fontSize: '13px',
                    background: 'linear-gradient(135deg, #ff6600 0%, #ff7a1a 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(255, 102, 0, 0.3)',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => onShowMoneroSetup?.()}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 102, 0, 0.4)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 102, 0, 0.3)';
                  }}
                >
                  Import Wallet
                </button>
              )}
            </div>
          ) : isActuallySolana ? (
            history.length === 0 ? (
              <div className="empty-state">No transactions yet</div>
            ) : (
              filterLowValueTransactions(history, getSolanaTransactionUsdValue).map((tx) => {
                // Get token info from multiple sources: 1) loaded tokens, 2) transaction's stored info, 3) cached enriched metadata
                const tokenMeta = tx.tokenInfo
                  ? tokens.find((t) => t.mint === tx.tokenInfo?.mint)
                  : null;
                const enrichedMeta = tx.tokenInfo?.mint
                  ? tokenMetadataCache[tx.tokenInfo.mint]
                  : null;
                const tokenSymbol = (
                  tokenMeta?.symbol ||
                  tx.tokenInfo?.symbol ||
                  enrichedMeta?.symbol ||
                  (tx.tokenInfo?.mint ? tx.tokenInfo.mint.slice(0, 4) + '...' : null) ||
                  'Token'
                ).toUpperCase();
                const tokenLogoUri =
                  tokenMeta?.logoUri || tx.tokenInfo?.logoUri || enrichedMeta?.logoUri;
                // Determine logo: use token logo for token transfers, SOL logo for native
                const logoUri = tx.tokenInfo
                  ? tokenLogoUri
                  : 'https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png';

                return (
                  <div
                    key={tx.signature}
                    className="tx-item tx-item-with-logo"
                    onClick={() =>
                      openExplorerUrl('tx', tx.signature, 'solana', undefined, {
                        testnet: network === 'devnet',
                      })
                    }
                  >
                    <div className="tx-icon-wrapper">
                      {tx.swapInfo ? (
                        // Swap transaction - show dual token logos with TokenIcon for fallbacks
                        <div className="tx-swap-logos">
                          <TokenIcon
                            symbol={tx.swapInfo.fromToken.symbol || 'SOL'}
                            logoUri={tx.swapInfo.fromToken.logoUri}
                            address={tx.swapInfo.fromToken.mint}
                            chain="solana"
                            size={22}
                          />
                          <div className="tx-swap-arrow">
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14M13 6l6 6-6 6"/>
                            </svg>
                          </div>
                          <TokenIcon
                            symbol={tx.swapInfo.toToken.symbol || 'SOL'}
                            logoUri={tx.swapInfo.toToken.logoUri}
                            address={tx.swapInfo.toToken.mint}
                            chain="solana"
                            size={22}
                          />
                        </div>
                      ) : tx.tokenInfo ? (
                        <div className="tx-token-logo">
                          <TokenIcon
                            symbol={tokenSymbol}
                            logoUri={tokenLogoUri}
                            address={tx.tokenInfo.mint}
                            chain="solana"
                            size={28}
                          />
                          <div className={`tx-icon-fallback ${tx.direction}`}>
                            {tx.direction === 'sent' ? (
                              <SendIcon size={14} />
                            ) : tx.direction === 'received' ? (
                              <ReceiveIcon size={14} />
                            ) : (
                              <SwapIcon size={14} />
                            )}
                          </div>
                        </div>
                      ) : logoUri ? (
                        <div className="tx-token-logo">
                          <TokenIcon
                            symbol="SOL"
                            logoUri={logoUri}
                            address="So11111111111111111111111111111111111111112"
                            chain="solana"
                            size={28}
                          />
                          <div className={`tx-icon-fallback ${tx.direction}`}>
                            {tx.direction === 'sent' ? (
                              <SendIcon size={14} />
                            ) : tx.direction === 'received' ? (
                              <ReceiveIcon size={14} />
                            ) : (
                              <SwapIcon size={14} />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={`tx-icon ${tx.direction}`}>
                          {tx.direction === 'sent' ? (
                            <SendIcon size={16} />
                          ) : tx.direction === 'received' ? (
                            <ReceiveIcon size={16} />
                          ) : (
                            <SwapIcon size={16} />
                          )}
                        </div>
                      )}
                      {/* Hide badge for swaps since we show arrow between logos */}
                      {!tx.swapInfo && (
                        <div className={`tx-direction-badge ${tx.direction}`}>
                          {tx.direction === 'sent' ? '↗' : tx.direction === 'received' ? '↙' : '⇄'}
                        </div>
                      )}
                    </div>
                    <div className="tx-details">
                      <div className="tx-type">
                        {tx.swapInfo
                          ? `Swapped ${tx.swapInfo.fromToken.symbol} → ${tx.swapInfo.toToken.symbol}`
                          : tx.tokenInfo
                            ? `${tx.direction === 'sent' ? 'Sent' : 'Received'} ${tokenSymbol}`
                            : tx.type}
                      </div>
                      <div className="tx-time">
                        {formatTime(tx.timestamp)}
                        {tx.swapInfo && (
                          <span className="tx-swap-amounts">
                            {hideBalances
                              ? '••••'
                              : `${tx.swapInfo.fromToken.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} → ${tx.swapInfo.toToken.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                          </span>
                        )}
                      </div>
                    </div>
                    {!tx.swapInfo && (
                      <div className="tx-amount">
                        <div className={`tx-value ${tx.direction}`}>
                          {tx.tokenInfo
                            ? formatHiddenTxAmount(
                                tx.tokenInfo.amount,
                                tx.direction,
                                tokenSymbol,
                                (val) => val.toLocaleString(undefined, { maximumFractionDigits: 4 }),
                                hideBalances,
                              )
                            : formatHiddenTxAmount(
                                tx.amountSol,
                                tx.direction,
                                'SOL',
                                formatSol,
                                hideBalances,
                              )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : evmHistory.length === 0 ? (
            <div className="empty-state">No transactions yet</div>
          ) : (
            filterLowValueTransactions(evmHistory, getEvmTransactionUsdValue).map((tx) => {
              const nativeSymbol = getNativeSymbol();
              
              // Get token logo: check if tx has logoUri, otherwise check from evmTokens
              const tokenMeta = tx.tokenAddress
                ? evmTokens.find((t) => t.address.toLowerCase() === tx.tokenAddress?.toLowerCase())
                : null;
              
              // Get the token symbol - use tx.symbol, tokenMeta, or fallback to native
              const displaySymbol = tx.symbol || tokenMeta?.symbol || nativeSymbol;
              
              // Native token logos by chain (including Bitcoin family and Tron)
              const getNativeLogoUri = () => {
                const chainLogos: Record<string, string> = {
                  ethereum: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
                  polygon: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
                  arbitrum: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
                  optimism: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
                  base: 'https://avatars.githubusercontent.com/u/108554348?s=280&v=4',
                  bnb: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
                  // Bitcoin family
                  bitcoin: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
                  bitcoincash: 'https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png',
                  litecoin: 'https://assets.coingecko.com/coins/images/2/small/litecoin.png',
                  zcash: 'https://assets.coingecko.com/coins/images/486/small/circle-zcash-color.png',
                  // Tron
                  tron: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
                };
                const chainId = activeChainId || activeEVMChain || 'ethereum';
                return chainLogos[chainId] || chainLogos.ethereum;
              };
              
              // TrustWallet asset URL fallback for token logos (works for many popular tokens)
              const getTrustWalletLogoUri = (tokenAddr: string) => {
                const chainNames: Record<string, string> = {
                  ethereum: 'ethereum',
                  polygon: 'polygon', 
                  arbitrum: 'arbitrum',
                  optimism: 'optimism',
                  base: 'base',
                };
                const chain = chainNames[activeEVMChain || 'ethereum'] || 'ethereum';
                // Use jsDelivr CDN for reliability (more reliable than raw GitHub)
                return `https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/${chain}/assets/${tokenAddr}/logo.png`;
              };
              
              // For native transfers, use the chain logo; for token transfers, use multiple fallbacks
              const isNativeTransfer = !tx.tokenAddress;
              const logoUri = tx.logoUri || 
                tokenMeta?.logoUri || 
                (isNativeTransfer ? getNativeLogoUri() : undefined) ||
                (tx.tokenAddress ? getTrustWalletLogoUri(tx.tokenAddress) : undefined);
              
              const isFailed = tx.status === 'failed';
              const isPending = tx.status === 'pending';
              
              return (
                <div
                  key={tx.hash}
                  className={`tx-item tx-item-with-logo${isFailed ? ' tx-failed' : ''}${isPending ? ' tx-pending' : ''}`}
                  onClick={() => {
                    // Use pre-built explorerUrl if available (Bitcoin/Tron chains), otherwise build it
                    if (tx.explorerUrl) {
                      window.open(tx.explorerUrl, '_blank');
                    } else {
                      openExplorerUrl('tx', tx.hash, 'evm', activeEVMChain || 'ethereum', {
                        testnet: false,
                      });
                    }
                  }}
                >
                  <div className="tx-icon-wrapper">
                    {isFailed ? (
                      <div className="tx-icon tx-status-failed">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                      </div>
                    ) : tx.swapInfo ? (
                      // Swap transaction - show dual token logos
                      <div className="tx-swap-logos">
                        <TokenIcon
                          symbol={tx.swapInfo.fromToken.symbol}
                          logoUri={tx.swapInfo.fromToken.logoUri || (tx.swapInfo.fromToken.symbol === nativeSymbol ? getNativeLogoUri() : undefined)}
                          address={tx.swapInfo.fromToken.address}
                          chain={activeEVMChain || 'ethereum'}
                          size={22}
                        />
                        <div className="tx-swap-arrow">
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M13 6l6 6-6 6"/>
                          </svg>
                        </div>
                        <TokenIcon
                          symbol={tx.swapInfo.toToken.symbol}
                          logoUri={tx.swapInfo.toToken.logoUri || (tx.swapInfo.toToken.symbol === nativeSymbol ? getNativeLogoUri() : undefined)}
                          address={tx.swapInfo.toToken.address}
                          chain={activeEVMChain || 'ethereum'}
                          size={22}
                        />
                      </div>
                    ) : isNativeTransfer || logoUri ? (
                      <div className="tx-token-logo">
                        {isNativeTransfer ? (
                          <img
                            src={getNativeLogoUri()}
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.add(
                                'visible',
                              );
                            }}
                          />
                        ) : (
                          <TokenIcon
                            symbol={displaySymbol}
                            logoUri={logoUri}
                            address={tx.tokenAddress}
                            chain={activeEVMChain || 'ethereum'}
                            size={28}
                          />
                        )}
                        <div className={`tx-icon-fallback ${tx.direction}`}>
                          {tx.direction === 'sent' ? (
                            <SendIcon size={14} />
                          ) : tx.direction === 'received' ? (
                            <ReceiveIcon size={14} />
                          ) : (
                            <SwapIcon size={14} />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`tx-icon ${tx.direction}`}>
                        {tx.direction === 'sent' ? (
                          <SendIcon size={16} />
                        ) : tx.direction === 'received' ? (
                          <ReceiveIcon size={16} />
                        ) : (
                          <SwapIcon size={16} />
                        )}
                      </div>
                    )}
                    {/* Hide badge for swaps since we show arrow between logos */}
                    {!tx.swapInfo && (
                      <div className={`tx-direction-badge ${tx.direction}${isFailed ? ' failed' : ''}`}>
                        {isFailed ? '✕' : tx.direction === 'sent' ? '↗' : tx.direction === 'received' ? '↙' : '⇄'}
                      </div>
                    )}
                  </div>
                  <div className="tx-details">
                    <div className="tx-type">
                      {isFailed 
                        ? 'Failed' 
                        : tx.swapInfo
                          ? `Swapped ${tx.swapInfo.fromToken.symbol} → ${tx.swapInfo.toToken.symbol}`
                          : tx.tokenAddress
                            ? `${tx.direction === 'sent' ? 'Sent' : 'Received'} ${displaySymbol.toUpperCase()}`
                            : tx.type}
                      {isPending && <span className="tx-pending-badge">Pending</span>}
                    </div>
                    <div className="tx-time">
                      {formatTime(tx.timestamp)}
                      {tx.swapInfo && !isFailed && (
                        <span className="tx-swap-amounts">
                          {hideBalances
                            ? '••••'
                            : `${tx.swapInfo.fromToken.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} → ${tx.swapInfo.toToken.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {!tx.swapInfo && (
                    <div className="tx-amount">
                      <div className={`tx-value ${isFailed ? 'failed' : tx.direction}`}>
                        {formatHiddenTxAmount(
                          tx.amount,
                          tx.direction === 'self' ? 'swap' : tx.direction,
                          displaySymbol,
                          (val) => val.toLocaleString(undefined, { maximumFractionDigits: 6 }),
                          hideBalances,
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
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
                </label>
                <TokenSearchDropdown
                  value={addTokenMint}
                  onChange={setAddTokenMint}
                  onTokenSelect={(token) => {
                    setAddTokenMint(token.address);
                    setAddTokenSymbol(token.symbol);
                    setAddTokenName(token.name);
                    setAddTokenLogoUri(token.logoUri || '');
                  }}
                  chainType={activeChain}
                  placeholder={
                    activeChain === 'evm'
                      ? 'Enter token contract address...'
                      : 'Enter token mint address...'
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Symbol</label>
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
                <label className="form-label">Name</label>
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

              {/* Token Filter Row */}
              <div className="token-filter-row">
                <button
                  className={`token-filter-btn ${hideDustTokens ? 'active' : ''}`}
                  onClick={() => setHideDustTokens(!hideDustTokens)}
                  title={hideDustTokens ? 'Show all tokens' : 'Hide tokens worth less than $1'}
                >
                  <EyeOffIcon size={14} />
                  <span>Hide &lt;$1</span>
                </button>
                <button
                  className={`spam-filter-toggle ${hideSpamTokens ? 'active' : ''}`}
                  onClick={() => setHideSpamTokens(!hideSpamTokens)}
                  title={
                    hideSpamTokens
                      ? `Show ${totalSpamCount} hidden spam tokens`
                      : 'Hide detected spam tokens'
                  }
                >
                  <SpamIcon size={12} />
                  <span>{hideSpamTokens ? 'Spam Hidden' : 'Show Spam'}</span>
                  {totalSpamCount > 0 && (
                    <span className="spam-count-badge">{totalSpamCount}</span>
                  )}
                </button>
              </div>

              {/* Token List */}
              {hasTokenSearchResults ? (
                <div className="token-list">
                  {/* SOL - Shown when Solana chain is active and matches search */}
                  {isActuallySolana &&
                    solTokenMatch &&
                    (() => {
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
                            logoUri="https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png"
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
                                  segments={highlightMatch(
                                    'SOL',
                                    solTokenMatch.searchMatch.matchStart,
                                    solTokenMatch.searchMatch.matchLength,
                                  )}
                                />
                              ) : (
                                'SOL'
                              )}
                            </div>
                            <div className="token-name">
                              <span className="token-name-text" title="Solana">
                                {solTokenMatch.searchMatch?.matchField === 'name' ? (
                                  <HighlightedText
                                    text="Solana"
                                    segments={highlightMatch(
                                      'Solana',
                                      solTokenMatch.searchMatch.matchStart,
                                      solTokenMatch.searchMatch.matchLength,
                                    )}
                                  />
                                ) : (
                                  'Solana'
                                )}
                              </span>
                              {solPrice !== null && (
                                <span className="token-price-per-unit">
                                  {formatTokenPrice(solPrice)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="token-balance">
                            <div
                              className={`token-balance-value ${priceFlash === 'up' ? 'price-flash-up' : priceFlash === 'down' ? 'price-flash-down' : ''}`}
                            >
                              {solPrice !== null && balance
                                ? formatHiddenUsd(formatUsd(balance.sol * solPrice), hideBalances)
                                : '$--'}
                            </div>
                            <div className="token-balance-secondary">
                              {hideBalances
                                ? HIDDEN_BALANCE
                                : balance
                                  ? formatSol(balance.sol)
                                  : '0'}{' '}
                              SOL
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  {/* Native EVM token - Shown when EVM chain is active and matches search */}
                  {isActuallyEVM &&
                    evmNativeTokenMatch &&
                    currentChainInfo &&
                    (() => {
                      const canSend = evmBalance && evmBalance.formatted > 0;
                      const nativeSymbol = currentChainInfo.symbol;
                      const nativeName = currentChainInfo.name;
                      // Map chain IDs to TrustWallet blockchain folder names for NATIVE TOKEN logos
                      // L2s like Arbitrum, Optimism, Base use ETH as native token, so show ETH logo
                      const chainToNativeTokenLogo: Record<string, string> = {
                        ethereum: 'ethereum',
                        bnb: 'binance',
                        polygon: 'polygon',
                        arbitrum: 'ethereum',  // Native token is ETH, not ARB
                        optimism: 'ethereum',  // Native token is ETH, not OP
                        base: 'ethereum',      // Native token is ETH
                      };
                      const nativeTokenChain = chainToNativeTokenLogo[activeEVMChain || 'ethereum'] || 'ethereum';
                      const logoUri = `https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/${nativeTokenChain}/info/logo.png`;
                      return (
                        <div
                          className={`token-item ${canSend ? 'token-item-clickable' : ''}`}
                          onClick={() => canSend && onSend()}
                          title={canSend ? `Send ${nativeSymbol}` : undefined}
                          style={{ cursor: canSend ? 'pointer' : 'default' }}
                        >
                          <TokenIcon
                            symbol={nativeSymbol}
                            logoUri={logoUri}
                            address=""
                            chain={activeEVMChain || 'ethereum'}
                            size={32}
                            className="token-logo"
                          />
                          <div className="token-info">
                            <div className="token-symbol">
                              {evmNativeTokenMatch.searchMatch?.matchField === 'symbol' ? (
                                <HighlightedText
                                  text={nativeSymbol}
                                  segments={highlightMatch(
                                    nativeSymbol,
                                    evmNativeTokenMatch.searchMatch.matchStart,
                                    evmNativeTokenMatch.searchMatch.matchLength,
                                  )}
                                />
                              ) : (
                                nativeSymbol
                              )}
                            </div>
                            <div className="token-name">
                              <span className="token-name-text" title={nativeName}>
                                {evmNativeTokenMatch.searchMatch?.matchField === 'name' ? (
                                  <HighlightedText
                                    text={nativeName}
                                    segments={highlightMatch(
                                      nativeName,
                                      evmNativeTokenMatch.searchMatch.matchStart,
                                      evmNativeTokenMatch.searchMatch.matchLength,
                                    )}
                                  />
                                ) : (
                                  nativeName
                                )}
                              </span>
                              {ethPrice !== null && (
                                <span className="token-price-per-unit">
                                  {formatTokenPrice(ethPrice)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="token-balance">
                            <div
                              className={`token-balance-value ${priceFlash === 'up' ? 'price-flash-up' : priceFlash === 'down' ? 'price-flash-down' : ''}`}
                            >
                              {ethPrice !== null && evmBalance
                                ? formatHiddenUsd(
                                    formatUsd(evmBalance.formatted * ethPrice),
                                    hideBalances,
                                  )
                                : '$--'}
                            </div>
                            <div className="token-balance-secondary">
                              {hideBalances
                                ? HIDDEN_BALANCE
                                : evmBalance
                                  ? formatSol(evmBalance.formatted)
                                  : '0'}{' '}
                              {nativeSymbol}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  {/* SPL Tokens - Only shown when Solana chain is active */}
                  {isActuallySolana &&
                    filteredSPLTokens.map((token) => {
                      const tokenPrice = tokenPrices[token.mint];
                      const tokenValue = tokenPrice ? token.uiBalance * tokenPrice : null;
                      const canDelete = token.uiBalance === 0;
                      const match = token.searchMatch;
                      const canSend = token.uiBalance > 0;
                      const spamInfo = token.spamInfo;
                      const hasSpamWarning = spamInfo && spamInfo.warningLevel !== 'none';
                      return (
                        <div
                          key={token.mint}
                          className={`token-item ${canSend ? 'token-item-clickable' : ''} ${spamInfo?.isSpam ? 'token-spam' : ''}`}
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
                          title={
                            spamInfo?.isSpam
                              ? `⚠️ Potential spam: ${spamInfo.reasons[0] || 'Suspicious token'}`
                              : canSend
                                ? `Send ${token.symbol.toUpperCase()}`
                                : undefined
                          }
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
                                  segments={highlightMatch(
                                    token.symbol,
                                    match.matchStart,
                                    match.matchLength,
                                  )}
                                />
                              ) : (
                                token.symbol
                              )}
                              {hasSpamWarning && (
                                <span
                                  className={`token-spam-badge warning-${spamInfo.warningLevel}`}
                                  title={spamInfo.reasons.join('; ')}
                                >
                                  <SpamIcon size={10} />
                                  {spamInfo.warningLevel === 'high'
                                    ? 'Spam'
                                    : spamInfo.warningLevel === 'medium'
                                      ? 'Suspicious'
                                      : 'Check'}
                                </span>
                              )}
                            </div>
                            <div className="token-name">
                              <span className="token-name-text" title={token.name}>
                                {match?.matchField === 'name' ? (
                                  <HighlightedText
                                    text={token.name}
                                    segments={highlightMatch(
                                      token.name,
                                      match.matchStart,
                                      match.matchLength,
                                    )}
                                  />
                                ) : (
                                  token.name
                                )}
                              </span>
                              {tokenPrice && (
                                <span className="token-price-per-unit">
                                  {formatTokenPrice(tokenPrice)}
                                </span>
                              )}
                            </div>
                            {match?.matchField === 'address' && (
                              <div className="token-address-match">
                                <HighlightedText
                                  text={token.mint}
                                  segments={highlightMatch(
                                    token.mint,
                                    match.matchStart,
                                    match.matchLength,
                                  )}
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
                              {hideBalances
                                ? HIDDEN_BALANCE
                                : token.uiBalance.toLocaleString(undefined, {
                                    maximumFractionDigits: 4,
                                  })}{' '}
                              {token.symbol.toUpperCase()}
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
                  {isActuallyEVM &&
                    filteredEVMTokens.map((token) => {
                      const tokenPrice = evmTokenPrices[token.address.toLowerCase()];
                      const tokenValue = tokenPrice ? token.uiBalance * tokenPrice : null;
                      const canDelete = token.uiBalance === 0;
                      const match = token.searchMatch;
                      const canSend = token.uiBalance > 0;
                      const spamInfo = token.spamInfo;
                      const hasSpamWarning = spamInfo && spamInfo.warningLevel !== 'none';
                      return (
                        <div
                          key={token.address}
                          className={`token-item ${canSend ? 'token-item-clickable' : ''} ${spamInfo?.isSpam ? 'token-spam' : ''}`}
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
                          title={
                            spamInfo?.isSpam
                              ? `⚠️ Potential spam: ${spamInfo.reasons[0] || 'Suspicious token'}`
                              : canSend
                                ? `Send ${token.symbol.toUpperCase()}`
                                : undefined
                          }
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
                                  segments={highlightMatch(
                                    token.symbol,
                                    match.matchStart,
                                    match.matchLength,
                                  )}
                                />
                              ) : (
                                token.symbol
                              )}
                              {hasSpamWarning && (
                                <span
                                  className={`token-spam-badge warning-${spamInfo.warningLevel}`}
                                  title={spamInfo.reasons.join('; ')}
                                >
                                  <SpamIcon size={10} />
                                  {spamInfo.warningLevel === 'high'
                                    ? 'Spam'
                                    : spamInfo.warningLevel === 'medium'
                                      ? 'Suspicious'
                                      : 'Check'}
                                </span>
                              )}
                            </div>
                            <div className="token-name">
                              <span className="token-name-text" title={token.name}>
                                {match?.matchField === 'name' ? (
                                  <HighlightedText
                                    text={token.name}
                                    segments={highlightMatch(
                                      token.name,
                                      match.matchStart,
                                      match.matchLength,
                                    )}
                                  />
                                ) : (
                                  token.name
                                )}
                              </span>
                              {tokenPrice && (
                                <span className="token-price-per-unit">
                                  {formatTokenPrice(tokenPrice)}
                                </span>
                              )}
                            </div>
                            {match?.matchField === 'address' && (
                              <div className="token-address-match">
                                <HighlightedText
                                  text={token.address}
                                  segments={highlightMatch(
                                    token.address,
                                    match.matchStart,
                                    match.matchLength,
                                  )}
                                />
                              </div>
                            )}
                          </div>
                          <div className="token-balance">
                            <div className="token-balance-value">
                              {tokenValue !== null
                                ? formatHiddenUsd(formatUsd(tokenValue), hideBalances)
                                : hideBalances
                                  ? HIDDEN_BALANCE
                                  : token.uiBalance.toLocaleString(undefined, {
                                      maximumFractionDigits: 4,
                                    })}
                            </div>
                            <div className="token-balance-secondary">
                              {tokenValue !== null
                                ? `${hideBalances ? HIDDEN_BALANCE : token.uiBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${token.symbol.toUpperCase()}`
                                : '$--'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span onClick={(e) => e.stopPropagation()}>
                              <ExplorerLinkIcon
                                type="token"
                                id={token.address}
                                chain="evm"
                                evmChainId={activeEVMChain || 'ethereum'}
                                size={12}
                                title={`View ${token.symbol.toUpperCase()} on explorer`}
                              />
                            </span>
                            {canDelete && (
                              <button
                                className="token-delete-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveToken(token.address);
                                }}
                                title="Remove token"
                              >
                                <TrashIcon size={12} />
                              </button>
                            )}
                          </div>
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
                {connections.filter((c) => c.approved && !c.revoked).length}
              </span>
            </div>
            <p className="security-disclaimer">
              These sites have been granted access to view your wallet address. Revoking here
              removes our record; the site may still request access again.
            </p>
            <div className="connection-list">
              {connections.filter((c) => c.approved && !c.revoked).length === 0 ? (
                <div className="empty-state">No active connections</div>
              ) : (
                connections
                  .filter((c) => c.approved && !c.revoked)
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
  activeChainId?: string | null;
  evmAddress: string | null;
  onClose: () => void;
  onSuccess: () => void;
  onWalletLocked: () => void;
  hideBalances: boolean;
  /** Pre-selected token for sending (when clicking on a token in the list) */
  selectedToken?: SelectedTokenForSend | null;
}

const SendForm: React.FC<SendFormProps> = ({
  address,
  activeChain,
  activeEVMChain,
  activeChainId,
  evmAddress,
  onClose,
  onSuccess,
  onWalletLocked,
  hideBalances,
  selectedToken,
}) => {
  // Check if the current chain supports sending
  const currentChainInfo = useMemo(() => {
    if (activeChain === 'solana') {
      return SUPPORTED_CHAINS.find((c) => c.type === 'solana');
    }
    // First try to find by activeChainId (for Bitcoin, TRON, Monero, etc.)
    if (activeChainId) {
      const chain = SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
      if (chain) return chain;
    }
    // Fall back to evmChainId for EVM chains
    return SUPPORTED_CHAINS.find((c) => c.evmChainId === activeEVMChain);
  }, [activeChain, activeEVMChain, activeChainId]);
  
  // Solana, EVM, Bitcoin-family, and TRON chains support sending
  const isSendingSupported = activeChain === 'solana' || currentChainInfo?.family === 'evm' || currentChainInfo?.family === 'bitcoin' || currentChainInfo?.family === 'tron';
  const isWatchOnlyChain = currentChainInfo?.family === 'monero';
  const isBitcoinFamily = currentChainInfo?.family === 'bitcoin';
  const isTronFamily = currentChainInfo?.family === 'tron';

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [evmFeeEstimate, setEvmFeeEstimate] = useState<EVMFeeEstimate | null>(null);
  const [btcFeeEstimate, setBtcFeeEstimate] = useState<{ feeRate: number; totalFeeSatoshis: number; totalFeeBTC: number; estimatedBlocks: number } | null>(null);
  const [trxFeeEstimate, setTrxFeeEstimate] = useState<{ bandwidth: number; energy: number; feeSun: number; feeTRX: number } | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [evmBalance, setEvmBalance] = useState<EVMBalance | null>(null);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string>(''); // Status message during send
  const [success, setSuccess] = useState<SendTransactionResult | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showLargeTransferWarning, setShowLargeTransferWarning] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<{
    warnOnLargeTransfers: boolean;
    largeTransferThreshold: number;
  }>({ warnOnLargeTransfers: true, largeTransferThreshold: 100 });
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [nativeTokenPrice, setNativeTokenPrice] = useState<number | null>(null); // For fee USD conversion
  const [amountMode, setAmountMode] = useState<'token' | 'usd'>('token');
  const [calculatingMax, setCalculatingMax] = useState(false);
  const maxCalculatedRef = React.useRef(false); // Track when MAX was just clicked
  const maxFeeUsedRef = React.useRef<number | null>(null); // Store fee used in MAX calculation
  const maxAmountRef = React.useRef<string | null>(null); // Store the MAX amount calculated

  // Load security settings and token price on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load security settings
        const res = await sendToBackground({ type: 'SECURITY_GET_SETTINGS', payload: undefined });
        if (res.success && res.data) {
          const settings = res.data as {
            warnOnLargeTransfers?: boolean;
            largeTransferThreshold?: number;
          };
          setSecuritySettings({
            warnOnLargeTransfers: settings.warnOnLargeTransfers ?? true,
            largeTransferThreshold: settings.largeTransferThreshold ?? 100,
          });
        }

        // Always fetch native token price for fee USD conversion
        if (activeChain === 'solana') {
          const nativePriceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
          if (nativePriceRes.success && nativePriceRes.data) {
            const data = nativePriceRes.data as { price: number; change24h: number | null };
            setNativeTokenPrice(data.price);
          }
        } else {
          // Use activeChainId for Bitcoin-family chains, otherwise use activeEVMChain
          const chainId = activeChainId || activeEVMChain || 'ethereum';
          const nativePriceRes = await sendToBackground({ 
            type: 'GET_EVM_NATIVE_PRICE', 
            payload: { evmChainId: chainId } 
          });
          if (nativePriceRes.success && nativePriceRes.data) {
            const data = nativePriceRes.data as { price: number; change24h: number | null };
            setNativeTokenPrice(data.price);
          }
        }

        // Load token price (for the token being sent)
        if (selectedToken?.chain === 'solana' && selectedToken.mint && activeChain === 'solana') {
          // For SPL tokens, fetch the specific token price
          const priceRes = await sendToBackground({
            type: 'GET_TOKEN_PRICES',
            payload: { mints: [selectedToken.mint] },
          });
          if (priceRes.success && priceRes.data) {
            const prices = priceRes.data as Record<string, number>;
            if (prices[selectedToken.mint]) {
              setTokenPrice(prices[selectedToken.mint]);
            }
          }
        } else if (selectedToken?.chain === 'evm' && selectedToken.address && activeChain === 'evm') {
          // For ERC20 tokens, fetch price using the chain-aware token price API
          const chainId = activeChainId || activeEVMChain || 'ethereum';
          const priceRes = await sendToBackground({
            type: 'GET_TOKEN_PRICES',
            payload: { mints: [selectedToken.address.toLowerCase()], chainId },
          });
          if (priceRes.success && priceRes.data) {
            const prices = priceRes.data as Record<string, number>;
            const price = prices[selectedToken.address.toLowerCase()];
            if (price) {
              setTokenPrice(price);
            }
          }
        } else if (activeChain === 'solana') {
          const priceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
          if (priceRes.success && priceRes.data) {
            const data = priceRes.data as { price: number; change24h: number | null };
            setTokenPrice(data.price);
          }
        } else {
          // Use activeChainId for Bitcoin-family chains (litecoin, bitcoin, etc.)
          // Fall back to activeEVMChain for actual EVM chains
          const chainId = activeChainId || activeEVMChain || 'ethereum';
          const priceRes = await sendToBackground({ 
            type: 'GET_EVM_NATIVE_PRICE', 
            payload: { evmChainId: chainId } 
          });
          if (priceRes.success && priceRes.data) {
            const data = priceRes.data as { price: number; change24h: number | null };
            setTokenPrice(data.price);
          }
        }
      } catch (e) {}
    };
    loadData();
  }, [activeChain, activeEVMChain, activeChainId, selectedToken]);

  // Calculate USD value of the transfer
  const getTransferUsdValue = (tokenAmount: number): number => {
    if (!tokenPrice || typeof tokenPrice !== 'number' || isNaN(tokenPrice) || isNaN(tokenAmount))
      return 0;
    return tokenAmount * tokenPrice;
  };

  // Convert USD to token amount
  const usdToToken = (usdAmount: number): number => {
    if (!tokenPrice || tokenPrice === 0 || typeof tokenPrice !== 'number' || isNaN(tokenPrice))
      return 0;
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
  const { recipients, addRecipient } = useRecentRecipients(
    activeChain,
    'mainnet-beta', // TODO: Get actual network from wallet state
    activeEVMChain,
    '', // Empty filter to get all recipients for checking
  );

  // Check if recipient is a first-time address (security warning)
  const isFirstTimeRecipient = useMemo(() => {
    if (!recipient) return false;
    const normalizedRecipient = recipient.toLowerCase();
    return !recipients.some((r) => r.address.toLowerCase() === normalizedRecipient);
  }, [recipient, recipients]);

  // Get native symbol for current chain
  const getNativeSymbol = () => {
    if (activeChain === 'solana') return 'SOL';
    // For Bitcoin and other chains, use currentChainInfo which is already computed
    if (currentChainInfo) return currentChainInfo.symbol;
    const chain = SUPPORTED_CHAINS.find((c) => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.symbol || 'ETH';
  };

  // Determine if we're sending a token or native currency (defined early for use in JSX)
  // Supports both Solana SPL tokens and EVM ERC20 tokens
  const isSendingToken =
    selectedToken &&
    ((selectedToken.chain === 'solana' && activeChain === 'solana') ||
      (selectedToken.chain === 'evm' && activeChain === 'evm'));
  const isSendingSolanaToken = selectedToken?.chain === 'solana' && activeChain === 'solana';
  const isSendingEvmToken = selectedToken?.chain === 'evm' && activeChain === 'evm';
  const symbol = (isSendingToken ? selectedToken.symbol : getNativeSymbol()).toUpperCase();

  // Get chain name for display
  const getChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    // For Bitcoin and other chains, use currentChainInfo which is already computed
    if (currentChainInfo) return currentChainInfo.name;
    const chain = SUPPORTED_CHAINS.find((c) => c.type === 'evm' && c.evmChainId === activeEVMChain);
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
  }, [activeChain, activeEVMChain, activeChainId]);

  useEffect(() => {
    // Skip estimation if MAX was just clicked (it already did accurate estimation)
    if (maxCalculatedRef.current) {
      maxCalculatedRef.current = false; // Reset flag
      return;
    }
    
    if (recipient && amount && parseFloat(amount) > 0) {
      estimateFee();
    }
  }, [recipient, amount, activeChain, activeEVMChain]);

  const fetchBalance = async () => {
    if (activeChain === 'solana') {
      const res = await sendToBackground({ type: 'WALLET_GET_BALANCE', payload: {} });
      if (res.success && res.data) {
        setBalance(res.data as WalletBalance);
      }
    } else {
      // Use activeChainId for Bitcoin-family and TRON chains, otherwise use activeEVMChain
      const chainId = (isBitcoinFamily || isTronFamily) && activeChainId ? activeChainId : activeEVMChain;
      const res = await sendToBackground({
        type: 'WALLET_GET_EVM_BALANCE',
        payload: { evmChainId: chainId },
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
      } else if (isBitcoinFamily && activeChainId) {
        // Bitcoin fee estimation
        const amountSatoshis = Math.floor(tokenAmount * 100000000); // Convert BTC to satoshis
        const res = await sendToBackground({
          type: 'WALLET_ESTIMATE_BTC_FEE',
          payload: {
            chainId: activeChainId,
            recipient,
            amountSatoshis,
          },
        });
        if (res.success && res.data) {
          setBtcFeeEstimate(res.data as { feeRate: number; totalFeeSatoshis: number; totalFeeBTC: number; estimatedBlocks: number });
        }
      } else if (isTronFamily) {
        // TRON fee estimation
        const amountSun = Math.floor(tokenAmount * 1000000); // Convert TRX to SUN
        const res = await sendToBackground({
          type: 'WALLET_ESTIMATE_TRX_FEE',
          payload: {
            recipient,
            amountSun,
          },
        });
        if (res.success && res.data) {
          setTrxFeeEstimate(res.data as { bandwidth: number; energy: number; feeSun: number; feeTRX: number });
        }
      } else {
        const res = await sendToBackground({
          type: 'WALLET_ESTIMATE_EVM_FEE',
          payload: {
            evmChainId: activeEVMChain,
            recipient,
            amount: tokenAmount.toString(),
          },
        });
        if (res.success && res.data) {
          setEvmFeeEstimate(res.data as EVMFeeEstimate);
        }
      }
    } catch {}
  };

  const handleMax = async () => {
    setCalculatingMax(true);

    try {
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
          maxTokenAmount = Math.max(
            0,
            balance.sol - estimatedFee - SOLANA_RENT_EXEMPT_MIN - 0.000005,
          );
        }
      } else if (isBitcoinFamily && evmBalance) {
        // Bitcoin-family chains - estimate fee and deduct from balance
        let estimatedFee = btcFeeEstimate?.totalFeeBTC || 0.00002; // Default ~2000 satoshis

        if (recipient && activeChainId) {
          try {
            // Estimate fee for Bitcoin transfer
            const amountSatoshis = Math.floor(evmBalance.formatted * 100000000 * 0.9); // 90% of balance for estimation
            const res = await sendToBackground({
              type: 'WALLET_ESTIMATE_BTC_FEE',
              payload: {
                chainId: activeChainId,
                recipient,
                amountSatoshis,
              },
            });
            
            if (res.success && res.data) {
              const feeData = res.data as { feeRate: number; totalFeeSatoshis: number; totalFeeBTC: number; estimatedBlocks: number };
              estimatedFee = feeData.totalFeeBTC;
              setBtcFeeEstimate(feeData);
            }
          } catch {
            // Keep existing estimate or default
          }
        }

        // Add safety buffer for fee rate fluctuations (20% buffer)
        const safetyBuffer = Math.max(estimatedFee * 0.2, 0.00001);
        maxTokenAmount = Math.max(0, evmBalance.formatted - estimatedFee - safetyBuffer);
        
        // Store the fee used for validation consistency
        maxFeeUsedRef.current = estimatedFee;
      } else if (isTronFamily && evmBalance) {
        // TRON chain - estimate fee and deduct from balance
        let estimatedFee = trxFeeEstimate?.feeTRX || 0; // TRON often has free transfers

        if (recipient) {
          try {
            // Estimate fee for TRX transfer
            const amountSun = Math.floor(evmBalance.formatted * 1000000 * 0.9); // 90% of balance for estimation
            const res = await sendToBackground({
              type: 'WALLET_ESTIMATE_TRX_FEE',
              payload: {
                recipient,
                amountSun,
              },
            });
            
            if (res.success && res.data) {
              const feeData = res.data as { bandwidth: number; energy: number; feeSun: number; feeTRX: number };
              estimatedFee = feeData.feeTRX;
              setTrxFeeEstimate(feeData);
            }
          } catch {
            // Keep existing estimate or default
          }
        }

        // TRON requires keeping a reserve for account operations
        // New address activation requires ~1.1 TRX, plus bandwidth may be consumed
        // Keep 1.1 TRX reserve to handle most cases safely
        const minReserve = 2.0; // TRON requires ~2 TRX reserve when sending to new addresses
        const feeBuffer = estimatedFee > 0 ? estimatedFee * 0.2 : 0;
        const safetyBuffer = Math.max(minReserve, estimatedFee + feeBuffer);
        maxTokenAmount = Math.max(0, evmBalance.formatted - safetyBuffer);
        
        // Store the fee used for validation consistency
        maxFeeUsedRef.current = estimatedFee;
      } else {
        // EVM chains - For ERC20 tokens, use the token balance directly
        if (isSendingEvmToken && selectedToken) {
          maxTokenAmount = selectedToken.uiBalance;
        } else if (evmBalance) {
          // For ETH native currency, get a single fee estimate and add buffer
          let estimatedFee = evmFeeEstimate?.totalFeeEth || 0.002;

          if (recipient) {
            try {
              // Estimate fee for a simple transfer (gas is fixed at 21000 for ETH transfers)
              const res = await sendToBackground({
                type: 'WALLET_ESTIMATE_EVM_FEE',
                payload: {
                  evmChainId: activeEVMChain,
                  recipient,
                  amount: '0.001', // Use small fixed amount - gas is same regardless
                },
              });
              
              if (res.success && res.data) {
                const feeData = res.data as EVMFeeEstimate;
                estimatedFee = feeData.totalFeeEth;
                setEvmFeeEstimate(feeData);
              }
            } catch {
              // Keep existing estimate or default
            }
          }

          // Add safety buffer to account for gas price fluctuations
          // Use 30% of fee OR minimum 0.00002 ETH, whichever is larger
          // This ensures the amount will always be sendable even if gas goes up slightly
          const safetyBuffer = Math.max(estimatedFee * 0.3, 0.00002);
          maxTokenAmount = Math.max(0, evmBalance.formatted - estimatedFee - safetyBuffer);
          
          // Store the fee used for validation consistency
          maxFeeUsedRef.current = estimatedFee;
        }
      }

      // Set flag to prevent useEffect from re-estimating (we already did accurate estimation)
      maxCalculatedRef.current = true;
      
      // Convert to appropriate mode and store for validation
      let formattedAmount: string;
      if (amountMode === 'usd' && tokenPrice) {
        const maxUsd = maxTokenAmount * tokenPrice;
        formattedAmount = maxUsd.toFixed(2);
      } else {
        const decimals =
          isSendingToken && selectedToken
            ? selectedToken.decimals
            : activeChain === 'solana'
              ? 9
              : isBitcoinFamily
                ? 8
                : isTronFamily
                  ? 6
                  : 18;
        formattedAmount = maxTokenAmount.toFixed(Math.min(decimals, 8)).replace(/\.?0+$/, '');
      }
      
      // Store the max amount for validation consistency
      maxAmountRef.current = formattedAmount;
      setAmount(formattedAmount);

      // Clear any previous error when using max
      setError('');
    } finally {
      setCalculatingMax(false);
    }
  };

  const handleSend = async () => {
    setError('');

    if (!recipient) {
      setError('Please enter a recipient address');
      return;
    }

    // Validate address format before proceeding
    let isValidAddress = false;
    if (activeChain === 'solana') {
      isValidAddress = isValidSolanaAddress(recipient);
    } else if (isBitcoinFamily) {
      // For Bitcoin addresses, we'll validate on the backend
      // Basic check: must not be empty and have reasonable length
      isValidAddress = recipient.length >= 26 && recipient.length <= 90;
    } else if (isTronFamily) {
      // TRON addresses start with 'T' and are 34 characters
      isValidAddress = recipient.startsWith('T') && recipient.length === 34;
    } else {
      isValidAddress = isValidEVMAddress(recipient);
    }

    if (!isValidAddress) {
      setError(`Invalid ${getChainName()} address. Please check and try again.`);
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
      setError(
        amountMode === 'usd' && !tokenPrice
          ? 'Unable to convert USD - price data unavailable. Please try again or enter amount in SOL.'
          : 'Please enter a valid amount',
      );
      return;
    }

    // Check if amount exceeds available balance
    const availableBalance =
      isSendingToken && selectedToken
        ? selectedToken.uiBalance
        : activeChain === 'solana'
          ? balance?.sol || 0
          : evmBalance?.formatted || 0;

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
    } else if (isBitcoinFamily) {
      // Bitcoin: Use stored MAX fee if amount matches MAX, otherwise use current estimate
      let fee: number;
      
      // If user is sending the exact MAX amount we calculated, use the same fee
      if (maxAmountRef.current === amount && maxFeeUsedRef.current !== null) {
        fee = maxFeeUsedRef.current;
      } else {
        fee = btcFeeEstimate?.totalFeeBTC || 0.00002; // ~2000 satoshis default
      }
      
      // Use same buffer formula as MAX calculation (20% buffer)
      const safetyBuffer = Math.max(fee * 0.2, 0.00001);
      effectiveMax = Math.max(0, availableBalance - fee - safetyBuffer);
    } else if (isTronFamily) {
      // TRON: Use stored MAX fee if amount matches MAX, otherwise use current estimate
      let fee: number;
      
      // If user is sending the exact MAX amount we calculated, use the same fee
      if (maxAmountRef.current === amount && maxFeeUsedRef.current !== null) {
        fee = maxFeeUsedRef.current;
      } else {
        fee = trxFeeEstimate?.feeTRX || 0; // TRON often has free transfers
      }
      
      // TRON requires keeping a reserve for account operations
      // Use same buffer formula as MAX calculation (1.1 TRX for new address activation)
      const minReserve = 2.0; // TRON requires ~2 TRX reserve when sending to new addresses
      const feeBuffer = fee > 0 ? fee * 0.2 : 0;
      const safetyBuffer = Math.max(minReserve, fee + feeBuffer);
      effectiveMax = Math.max(0, availableBalance - safetyBuffer);
    } else {
      // EVM: Use stored MAX fee if amount matches MAX, otherwise use current estimate
      // This ensures consistency between MAX click and Send validation
      let fee: number;
      
      // If user is sending the exact MAX amount we calculated, use the same fee
      if (maxAmountRef.current === amount && maxFeeUsedRef.current !== null) {
        fee = maxFeeUsedRef.current;
      } else {
        fee = evmFeeEstimate?.totalFeeEth || 0.002;
      }
      
      // Use same buffer formula as MAX calculation (30% or minimum 0.00002)
      const safetyBuffer = Math.max(fee * 0.3, 0.00002);
      effectiveMax = Math.max(0, availableBalance - fee - safetyBuffer);
    }

    if (tokenAmountToSend > availableBalance) {
      const formattedBalance = availableBalance.toLocaleString(undefined, {
        maximumFractionDigits: 6,
      });
      setError(`Insufficient balance. You have ${formattedBalance} ${symbol} available.`);
      return;
    }

    // Warn if sending native currency and amount + fee (+ rent for Solana) exceeds balance
    // Use small epsilon for floating point comparison to avoid precision issues
    const epsilon = 0.000001;
    if (!isSendingToken && tokenAmountToSend > effectiveMax + epsilon) {
      if (activeChain === 'solana') {
        setError(
          `Amount plus network fee and rent reserve exceeds your balance. Click MAX to use the maximum sendable amount.`,
        );
      } else {
        setError(
          `Amount plus network fee exceeds your balance. Click MAX to use the maximum sendable amount.`,
        );
      }
      return;
    }

    // For SPL tokens, check if user has enough SOL/ETH for the network fee
    if (isSendingToken) {
      const nativeBalance =
        activeChain === 'solana' ? balance?.sol || 0 : evmBalance?.formatted || 0;
      const requiredFee =
        activeChain === 'solana'
          ? feeEstimate?.feeSol || 0.00001 // Default minimum SOL fee
          : evmFeeEstimate?.totalFeeEth || 0.001;

      if (nativeBalance < requiredFee) {
        const nativeSymbol = activeChain === 'solana' ? 'SOL' : getNativeSymbol();
        const chainName = getChainName();
        const isL2Chain = activeEVMChain && ['arbitrum', 'optimism', 'base'].includes(activeEVMChain);
        
        if (isL2Chain && activeChain === 'evm') {
          // Show helpful message for L2 chains where users might have tokens but no ETH
          setError(
            `Insufficient ${nativeSymbol} for gas on ${chainName}. You need ~${requiredFee.toFixed(6)} ${nativeSymbol} but have ${nativeBalance.toFixed(6)} ${nativeSymbol}. ` +
            `To get ${nativeSymbol} on ${chainName}, you can: 1) Bridge from Ethereum mainnet, or 2) Withdraw directly to ${chainName} from an exchange.`,
          );
        } else {
          setError(
            `Insufficient ${nativeSymbol} for network fee. You need ~${requiredFee.toFixed(6)} ${nativeSymbol} but have ${nativeBalance.toFixed(6)} ${nativeSymbol}.`,
          );
        }
        return;
      }
    }

    // Check for large transfer warning based on USD value
    const usdValue = getTransferUsdValue(tokenAmountToSend);
    if (
      securitySettings.warnOnLargeTransfers &&
      usdValue >= securitySettings.largeTransferThreshold
    ) {
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
    setSendStatus('Preparing transaction...');

    // Status update intervals for user feedback (EVM and Bitcoin take longer)
    const statusUpdates = isBitcoinFamily
      ? [
          { delay: 1500, status: 'Signing transaction...' },
          { delay: 3000, status: 'Broadcasting to network...' },
          { delay: 5000, status: 'Waiting for confirmation...' },
          { delay: 15000, status: 'Transaction broadcast. Confirmations may take 10+ minutes.' },
        ]
      : isTronFamily
      ? [
          { delay: 1000, status: 'Signing transaction...' },
          { delay: 2000, status: 'Broadcasting to TRON...' },
          { delay: 3000, status: 'Waiting for confirmation...' },
        ]
      : activeChain === 'evm'
      ? [
          { delay: 1500, status: 'Signing transaction...' },
          { delay: 3000, status: 'Broadcasting to network...' },
          { delay: 5000, status: 'Waiting for confirmation...' },
          { delay: 15000, status: 'Still confirming... (this may take a minute)' },
          { delay: 30000, status: 'Almost there... (network is busy)' },
        ]
      : [
          { delay: 1000, status: 'Signing transaction...' },
          { delay: 2000, status: 'Broadcasting to Solana...' },
          { delay: 3000, status: 'Waiting for confirmation...' },
        ];

    const timeouts: NodeJS.Timeout[] = [];
    statusUpdates.forEach(({ delay, status }) => {
      const timeout = setTimeout(() => setSendStatus(status), delay);
      timeouts.push(timeout);
    });

    try {
      // Check if wallet is still unlocked before sending
      const stateCheck = await sendToBackground({ type: 'WALLET_GET_STATE', payload: undefined });
      if (!stateCheck.success || !stateCheck.data) {
        timeouts.forEach(clearTimeout);
        setError('Unable to verify wallet state. Please try again.');
        setSending(false);
        setSendStatus('');
        return;
      }

      const currentState = stateCheck.data as WalletState;
      if (currentState.lockState !== 'unlocked') {
        // Wallet is locked - close the send form and trigger state refresh
        // This will show the locked screen instead of returning to the send form
        timeouts.forEach(clearTimeout);
        setSending(false);
        setSendStatus('');
        onClose();
        onWalletLocked();
        return;
      }

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
      } else if (isBitcoinFamily && activeChainId) {
        // Bitcoin-family chain - send native coin
        const amountSatoshis = Math.floor(tokenAmountToSend * 100000000); // Convert BTC to satoshis
        res = await sendToBackground({
          type: 'WALLET_SEND_BTC',
          payload: {
            chainId: activeChainId,
            recipient,
            amountSatoshis,
          },
        });
        // Map BTC result to SendTransactionResult format
        if (res.success && res.data) {
          const btcResult = res.data as { txid: string; explorerUrl: string; confirmed: boolean; error?: string };
          res.data = {
            signature: btcResult.txid,
            explorerUrl: btcResult.explorerUrl,
          };
        }
      } else if (isTronFamily) {
        // TRON chain - send native TRX
        const amountSun = Math.floor(tokenAmountToSend * 1000000); // Convert TRX to SUN (1 TRX = 1,000,000 SUN)
        res = await sendToBackground({
          type: 'WALLET_SEND_TRX',
          payload: {
            recipient,
            amountSun,
          },
        });
        // Map TRX result to SendTransactionResult format
        if (res.success && res.data) {
          const trxResult = res.data as { txid: string; explorerUrl: string; confirmed: boolean; error?: string };
          res.data = {
            signature: trxResult.txid,
            explorerUrl: trxResult.explorerUrl,
          };
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
              evmChainId: activeEVMChain,
            },
          });
        }
      }

      // Clear status timeouts
      timeouts.forEach(clearTimeout);

      if (res.success && res.data) {
        setSuccess(res.data as SendTransactionResult);
        setShowReview(false);

        // Save recipient to recent recipients after successful send
        try {
          await addRecipient(recipient);
        } catch (e) {}
      } else {
        setError(res.error || 'Transaction failed');
      }
    } catch {
      // Clear status timeouts on error
      timeouts.forEach(clearTimeout);
      setError('Transaction failed');
    } finally {
      setSending(false);
      setSendStatus('');
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

        <div
          style={{
            background: 'var(--warning-muted)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-lg)',
            marginBottom: 'var(--space-lg)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>⚠️</div>
          <h4 style={{ color: 'var(--warning)', marginBottom: 'var(--space-sm)' }}>
            Large Transfer Detected
          </h4>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-md)',
              fontSize: '0.875rem',
            }}
          >
            You are about to send{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {getTokenAmountToSend().toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 6,
              })}{' '}
              {symbol}
            </strong>
            {tokenPrice && (
              <span> (~${getTransferUsdValue(getTokenAmountToSend()).toFixed(2)} USD)</span>
            )}{' '}
            which exceeds your warning threshold of{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              ${securitySettings.largeTransferThreshold} USD
            </strong>
            .
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

        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.6875rem',
            textAlign: 'center',
            marginTop: 'var(--space-md)',
          }}
        >
          You can adjust this threshold in Settings → Wallet → Transaction Warnings
        </p>
      </div>
    );
  }

  // Transaction Review Screen
  if (showReview && !success) {
    const chain = SUPPORTED_CHAINS.find((c) => {
      if (activeChain === 'solana') {
        return c.type === 'solana';
      }
      // Check for Bitcoin-family chains first (using activeChainId)
      if (activeChainId && c.chainId === activeChainId) {
        return true;
      }
      // Fall back to EVM chain matching
      return c.type === 'evm' && c.evmChainId === activeEVMChain;
    });

    const fee = activeChain === 'solana' 
      ? feeEstimate?.feeSol || 0 
      : isBitcoinFamily 
        ? btcFeeEstimate?.totalFeeBTC || 0 
        : isTronFamily
          ? trxFeeEstimate?.feeTRX || 0
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
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>
                on {chain?.name || 'Solana'}
              </span>
            </>
          ) : (
            // Show chain icon and name for native currency
            <>
              <ChainIcon chain={activeChain} evmChainId={activeChainId || activeEVMChain || undefined} size={20} />
              <span>{chain?.name || 'Unknown Chain'}</span>
            </>
          )}
        </div>

        <div className="tx-review-section">
          <span className="tx-review-label">Amount</span>
          <div style={{ textAlign: 'right' }}>
            <span className="tx-review-value">
              {reviewTokenAmount.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 6,
              })}{' '}
              {symbol}
            </span>
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

        {/* First-time recipient warning (security feature) */}
        {isFirstTimeRecipient && (
          <div
            className="tx-review-warning"
            style={{
              background: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              borderRadius: '8px',
              padding: '12px',
              margin: '12px 0',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--warning)"
              strokeWidth="2"
              style={{ flexShrink: 0, marginTop: '1px' }}
            >
              <path d="M12 9v4M12 17h.01M21.73 18l-8-14a2 2 0 00-3.46 0l-8 14A2 2 0 004 21h16a2 2 0 001.73-3z" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: '4px' }}>
                First time sending to this address
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Double-check the recipient address to prevent loss of funds. This is a common
                clipboard hijacking attack vector.
              </div>
            </div>
          </div>
        )}

        <div className="tx-review-section">
          <span className="tx-review-label">Network Fee</span>
          <span className="tx-review-value">
            ~{fee.toFixed(6)} {getNativeSymbol()}
            {nativeTokenPrice && (
              <span className="tx-review-usd">
                {' '}(${(fee * nativeTokenPrice) < 0.01 ? '<0.01' : (fee * nativeTokenPrice).toFixed(2)})
              </span>
            )}
          </span>
        </div>

        <div className="tx-review-section tx-review-total">
          <span className="tx-review-label">Total</span>
          {isSendingToken ? (
            // For SPL tokens, show token amount and fee on separate lines
            <div className="tx-review-total-breakdown">
              <div className="tx-review-total-primary">
                {reviewTokenAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 6,
                })}{' '}
                {symbol}
                {tokenPrice && (
                  <span className="tx-review-usd"> (${(reviewTokenAmount * tokenPrice).toFixed(2)})</span>
                )}
              </div>
              <div className="tx-review-total-fee">
                + {fee.toFixed(6)} {getNativeSymbol()} network fee
                {nativeTokenPrice && (
                  <span className="tx-review-usd">
                    {' '}(${(fee * nativeTokenPrice) < 0.01 ? '<0.01' : (fee * nativeTokenPrice).toFixed(2)})
                  </span>
                )}
              </div>
            </div>
          ) : (
            // For native currency, add them together
            <span className="tx-review-value">
              ~
              {(reviewTokenAmount + fee).toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 6,
              })}{' '}
              {getNativeSymbol()}
              {nativeTokenPrice && (
                <span className="tx-review-usd">
                  {' '}(${((reviewTokenAmount + fee) * nativeTokenPrice).toFixed(2)})
                </span>
              )}
            </span>
          )}
        </div>

        {error && <div className="tx-review-error">{error}</div>}

        {/* Processing Status */}
        {sending && sendStatus && (
          <div className="swap-processing-status" style={{ padding: 'var(--space-md)' }}>
            <div className="swap-processing-animation">
              <div className="swap-processing-spinner"></div>
            </div>
            <div className="swap-processing-text">{sendStatus}</div>
            <div className="swap-processing-hint">
              {isBitcoinFamily
                ? `${currentChainInfo?.name || 'Bitcoin'} transactions may take 10+ minutes to confirm`
                : activeChain === 'evm'
                ? 'EVM transactions may take 15-60 seconds to confirm'
                : 'Solana transactions typically confirm in a few seconds'}
            </div>
          </div>
        )}

        {!sending && (
          <div className="tx-review-actions">
            <button className="btn-secondary" onClick={() => setShowReview(false)} disabled={sending}>
              Cancel
            </button>
            <button className="btn-primary" onClick={confirmSend} disabled={sending}>
              Confirm Send
            </button>
          </div>
        )}
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
        <div className="tx-success-amount">
          {getTokenAmountToSend().toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6,
          })}{' '}
          {symbol}
        </div>
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
      const feeUsd = nativeTokenPrice ? feeEstimate.feeSol * nativeTokenPrice : null;
      const usdPart = feeUsd !== null ? ` ($${feeUsd < 0.01 ? '<0.01' : feeUsd.toFixed(2)})` : '';
      return `~${feeEstimate.feeSol.toFixed(6)} SOL${usdPart}`;
    }
    if (activeChain === 'evm' && evmFeeEstimate) {
      const feeUsd = nativeTokenPrice ? evmFeeEstimate.totalFeeEth * nativeTokenPrice : null;
      const usdPart = feeUsd !== null ? ` ($${feeUsd < 0.01 ? '<0.01' : feeUsd.toFixed(2)})` : '';
      return `~${evmFeeEstimate.totalFeeEth.toFixed(6)} ${getNativeSymbol()}${usdPart}`;
    }
    if (isBitcoinFamily && btcFeeEstimate) {
      const feeUsd = nativeTokenPrice ? btcFeeEstimate.totalFeeBTC * nativeTokenPrice : null;
      const usdPart = feeUsd !== null ? ` ($${feeUsd < 0.01 ? '<0.01' : feeUsd.toFixed(2)})` : '';
      return `~${btcFeeEstimate.totalFeeBTC.toFixed(8)} ${getNativeSymbol()} (${btcFeeEstimate.feeRate} sat/vB)${usdPart}`;
    }
    if (isTronFamily && trxFeeEstimate) {
      const feeUsd = nativeTokenPrice ? trxFeeEstimate.feeTRX * nativeTokenPrice : null;
      const usdPart = feeUsd !== null ? ` ($${feeUsd < 0.01 ? '<0.01' : feeUsd.toFixed(2)})` : '';
      // TRON often has free transfers with bandwidth, show 0 or estimated fee
      if (trxFeeEstimate.feeTRX === 0) {
        return 'Free (uses bandwidth)';
      }
      return `~${trxFeeEstimate.feeTRX.toFixed(6)} TRX${usdPart}`;
    }
    return null;
  };

  // Get total display (amount + fee) for native currency transfers
  const getTotalDisplay = () => {
    const tokenAmount = getTokenAmountToSend();
    if (isNaN(tokenAmount) || tokenAmount <= 0) return null;
    
    // For token transfers, don't show combined total (different currencies)
    if (isSendingToken) return null;
    
    let fee = 0;
    if (activeChain === 'solana' && feeEstimate) {
      fee = feeEstimate.feeSol;
    } else if (activeChain === 'evm' && evmFeeEstimate) {
      fee = evmFeeEstimate.totalFeeEth;
    } else if (isBitcoinFamily && btcFeeEstimate) {
      fee = btcFeeEstimate.totalFeeBTC;
    } else if (isTronFamily && trxFeeEstimate) {
      fee = trxFeeEstimate.feeTRX;
    }
    
    if (fee === 0) return null;
    
    const total = tokenAmount + fee;
    const totalUsd = nativeTokenPrice ? total * nativeTokenPrice : null;
    const usdPart = totalUsd !== null ? ` ($${totalUsd.toFixed(2)})` : '';
    
    const decimals = isBitcoinFamily ? 8 : 6;
    return `~${total.toFixed(decimals)} ${getNativeSymbol()}${usdPart}`;
  };

  const feeDisplay = getFeeDisplay();
  const totalDisplay = getTotalDisplay();

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
            Amount in {amountMode === 'usd' ? 'USD' : symbol} (Balance:{' '}
            {hideBalances ? HIDDEN_BALANCE : formatSol(currentBalance)} {symbol})
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
            onChange={(e) => {
              // Clear MAX refs when user manually changes amount
              maxAmountRef.current = null;
              maxFeeUsedRef.current = null;
              setAmount(e.target.value.replace(/[^0-9.]/g, ''));
            }}
          />
          {amountMode === 'token' && <span className="amount-suffix">{symbol}</span>}
          <button className="max-btn" onClick={handleMax} disabled={calculatingMax}>
            {calculatingMax ? (
              <>
                <span
                  className="spinner-small"
                  style={{
                    marginRight: '4px',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    borderTopColor: 'white',
                    display: 'inline-block',
                    verticalAlign: 'middle',
                  }}
                />
                MAX
              </>
            ) : (
              'MAX'
            )}
          </button>
        </div>
        {amount && parseFloat(amount) > 0 && tokenPrice && (
          <div className="amount-conversion">{getConversionDisplay()}</div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {feeDisplay && (
        <div className="fee-display">
          <span className="fee-label">Network Fee</span>
          <span className="fee-value">{feeDisplay}</span>
        </div>
      )}

      {totalDisplay && (
        <div className="fee-display total-display">
          <span className="fee-label">Total</span>
          <span className="fee-value">{totalDisplay}</span>
        </div>
      )}

      {!isSendingSupported && (
        <div
          style={{
            background: 'rgba(251, 191, 36, 0.15)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-sm)',
            marginBottom: 'var(--space-md)',
            fontSize: '0.75rem',
            color: 'var(--text-warning)',
          }}
        >
          {isWatchOnlyChain 
            ? '⚠️ Watch-only mode: Sending is not available for this chain.'
            : `⚠️ Sending is not yet supported for ${currentChainInfo?.name || 'this chain'}. Coming soon!`}
        </div>
      )}

      <button
        className="btn btn-primary btn-block"
        onClick={handleSend}
        disabled={sending || !recipient || !amount || !isSendingSupported}
      >
        {sending ? (sendStatus || 'Sending...') : 'Send'}
      </button>
    </div>
  );
};

// --- Swap View (extracted to views/wallet/SwapView.tsx) ---

// --- Partners Modal ---

interface Partner {
  id: string;
  name: string;
  description: string;
  affiliateUrl: string;
  fallbackGradient: string;
  logoDomain?: string; // Override domain for favicon (when affiliate URL differs from main site)
  useFallbackOnly?: boolean; // Skip favicon, always use gradient + initials
}

// Extract domain from URL for favicon fetching
const getDomainFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
};

// Dynamic favicon URL using Google's service (reliable, supports high-res)
const getFaviconUrl = (domain: string, size: number = 64): string => {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
};

const PARTNERS: Partner[] = [
  {
    id: 'proton',
    name: 'Proton',
    description: 'Private email, VPN, cloud storage & password manager with end-to-end encryption.',
    affiliateUrl: 'https://proton.me/l/special-unlimited-offer?url_id=1198',
    fallbackGradient: 'linear-gradient(135deg, #6d4aff 0%, #8b5cf6 100%)',
  },
  {
    id: 'purism',
    name: 'Purism',
    description: 'High-quality laptops and phones that protect your freedom and privacy.',
    affiliateUrl: 'https://shop.puri.sm/?wpam_id=1074',
    fallbackGradient: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
    logoDomain: 'puri.sm',
  },
  {
    id: 'incogni',
    name: 'Incogni',
    description: 'Remove your personal data from data brokers and reduce identity theft risk.',
    affiliateUrl: 'https://deal.incogni.io/SH5X',
    fallbackGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    logoDomain: 'incogni.io',
  },
  {
    id: 'scarce-city',
    name: 'Scarce City',
    description: 'Bitcoin marketplace for unique art, collectibles, and physical goods.',
    affiliateUrl: 'https://scarce.city/',
    fallbackGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
  {
    id: 'bill-keonne',
    name: 'Bill & Keonne',
    description: 'Supporting Bill and Keonne, the Samourai Wallet developers and their loved ones.',
    affiliateUrl: 'https://billandkeonne.org/',
    fallbackGradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    useFallbackOnly: true,
  },
];

// Dynamic Partner Logo component with fallback
interface PartnerLogoProps {
  partner: Partner;
}

const PartnerLogo: React.FC<PartnerLogoProps> = ({ partner }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const domain = partner.logoDomain || getDomainFromUrl(partner.affiliateUrl);
  const faviconUrl = getFaviconUrl(domain, 64);
  const initials = partner.name.split(' ').map(w => w[0]).join('');
  
  const showFallback = partner.useFallbackOnly || !imageLoaded || imageError;

  return (
    <div
      className="partner-logo"
      style={{ background: showFallback ? partner.fallbackGradient : 'var(--bg-tertiary)' }}
    >
      {!partner.useFallbackOnly && !imageError && (
        <img
          src={faviconUrl}
          alt={`${partner.name} logo`}
          className={`partner-logo-img ${imageLoaded ? 'loaded' : ''}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      )}
      {showFallback && (
        <span className="partner-logo-text">{initials}</span>
      )}
    </div>
  );
};

interface PartnersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PartnersModal: React.FC<PartnersModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handlePartnerClick = (url: string) => {
    chrome.tabs.create({ url });
  };

  return (
    <div className="partners-modal-overlay" onClick={onClose}>
      <div className="partners-modal" onClick={(e) => e.stopPropagation()}>
        <div className="partners-modal-header">
          <h2>Our Partners</h2>
          <button className="partners-modal-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={20} />
          </button>
        </div>
        <p className="partners-modal-subtitle">
          Trusted services we recommend. Clicking will open in a new tab.
        </p>
        <div className="partners-grid">
          {PARTNERS.map((partner) => (
            <div key={partner.id} className="partner-card">
              <PartnerLogo partner={partner} />
              <div className="partner-info">
                <h3 className="partner-name">{partner.name}</h3>
                <p className="partner-description">{partner.description}</p>
              </div>
              <button
                className="partner-visit-btn"
                onClick={() => handlePartnerClick(partner.affiliateUrl)}
              >
                <span>Visit</span>
                <ExternalLinkIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTabSession] = useSessionSetting<MainTab>(
    SESSION_KEYS.ACTIVE_TAB,
    'security',
  );

  // Wrapper to handle the async nature of setActiveTabSession
  const setActiveTab = useCallback(
    (tab: MainTab) => {
      setActiveTabSession(tab);
    },
    [setActiveTabSession],
  );
  const [stats, setStats] = useState<PrivacyStats>({
    totalBlockedRequests: 0,
    totalCookiesDeleted: 0,
    activeRuleCount: 0,
    currentTabBlocked: 0,
    scriptsIntercepted: 0,
    requestsModified: 0,
  });
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const currentTabIdRef = useRef<number | null>(null);
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Ad blocker state (separate from privacy feature flag)
  const [adBlockerEnabled, setAdBlockerEnabled] = useState(true);

  // Hide balances privacy mode (stored in session, clears on browser restart)
  const [hideBalances, toggleHideBalances] = useHideBalances();

  // Partners modal state
  const [showPartnersModal, setShowPartnersModal] = useState(false);

  // Monero setup modal state
  const [showMoneroSetup, setShowMoneroSetup] = useState(false);

  // Trigger swap from store (for buying AINTI)
  const [triggerSwapFromStore, setTriggerSwapFromStore] = useState(false);

  // State for passing to swap view
  const [swapTokens, setSwapTokens] = useState<SPLTokenBalance[]>([]);
  const [swapEvmTokens, setSwapEvmTokens] = useState<EVMTokenBalance[]>([]);
  const [swapBalance, setSwapBalance] = useState<WalletBalance | null>(null);
  const [swapEvmBalance, setSwapEvmBalance] = useState<EVMBalance | null>(null);

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
          blockedByDomain?: { [domain: string]: number };
          sessionStart?: number;
        };

        let currentTabBlocked = 0;
        if (currentTabIdRef.current && metrics.recentBlocked) {
          currentTabBlocked = metrics.recentBlocked.filter(
            (r) => r.tabId === currentTabIdRef.current,
          ).length;
        }

        setStats({
          totalBlockedRequests: metrics.totalBlockedRequests || 0,
          totalCookiesDeleted: metrics.totalCookiesDeleted || 0,
          activeRuleCount: metrics.activeRuleCount || 0,
          scriptsIntercepted: metrics.scriptsIntercepted || 0,
          requestsModified: metrics.requestsModified || 0,
          currentTabBlocked,
          blockedByDomain: metrics.blockedByDomain,
          sessionStart: metrics.sessionStart,
        });
      }
    } catch (error) {}
  }, []);

  const fetchWalletState = useCallback(async () => {
    try {
      const response = await sendToBackground({ type: 'WALLET_GET_STATE', payload: undefined });
      if (response.success && response.data) {
        const state = response.data as WalletState;
        setWalletState(state);
      }
    } catch (error) {}
  }, []);

  // Periodically check wallet state to detect auto-lock from inactivity
  // This ensures the UI shows the locked screen when the wallet was locked while popup was closed
  useEffect(() => {
    if (!walletState || walletState.lockState === 'uninitialized') return;
    
    // Check wallet state every 5 seconds to detect auto-lock
    const checkInterval = setInterval(async () => {
      try {
        const response = await sendToBackground({ type: 'WALLET_GET_STATE', payload: undefined });
        if (response.success && response.data) {
          const state = response.data as WalletState;
          // If the wallet got locked (e.g., from inactivity timer), update UI
          if (state.lockState === 'locked' && walletState?.lockState === 'unlocked') {
            setWalletState(state);
          }
        }
      } catch (error) {}
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [walletState]);

  // Keep currentTabIdRef in sync with currentTabId state
  useEffect(() => {
    currentTabIdRef.current = currentTabId;
  }, [currentTabId]);

  useEffect(() => {
    // Get initial active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        setCurrentTabId(tabs[0].id);
      }
    });

    // Listen for tab activation (switching tabs)
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      setCurrentTabId(activeInfo.tabId);
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);

    getFeatureFlags().then((loadedFlags) => {
      setFlags(loadedFlags);
      setLoading(false);
    });

    fetchWalletState();
    
    // Defensive re-fetch after a short delay to handle service worker cold start timing issues
    // This ensures wallet state is properly populated even if the first fetch returned incomplete data
    const refreshTimeout = setTimeout(() => {
      fetchWalletState();
    }, 500);

    const unsubscribe = onFeatureFlagsChange((newFlags) => {
      setFlags(newFlags);
    });

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      unsubscribe();
      clearTimeout(refreshTimeout);
    };
  }, [fetchWalletState]);

  // Fetch ad blocker status
  const fetchAdBlockerStatus = useCallback(async () => {
    try {
      const response = await sendToBackground({
        type: 'GET_AD_BLOCKER_STATUS',
        payload: undefined,
      });
      if (response.success && response.data !== undefined) {
        setAdBlockerEnabled(response.data as boolean);
      }
    } catch (error) {}
  }, []);

  // Toggle ad blocker (separate from privacy feature flag)
  const handleAdBlockerToggle = async (enabled: boolean) => {
    setAdBlockerEnabled(enabled);
    try {
      await sendToBackground({ type: 'SET_AD_BLOCKER_STATUS', payload: { enabled } });

      // Clear cache and refresh current tab
      await chrome.browsingData.removeCache({});
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await chrome.tabs.reload(activeTab.id);
      }
    } catch (error) {
      setAdBlockerEnabled(!enabled);
    }
  };

  // Fetch ad blocker status on load
  useEffect(() => {
    fetchAdBlockerStatus();
  }, [fetchAdBlockerStatus]);

  // Listen for ad blocker changes from settings page
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.privacySettings) {
        const newSettings = changes.privacySettings.newValue;
        if (newSettings && newSettings.adBlockerEnabled !== undefined) {
          setAdBlockerEnabled(newSettings.adBlockerEnabled);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

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
          className={`tab-btn ${activeTab === 'store' ? 'active' : ''}`}
          onClick={() => setActiveTab('store')}
          role="tab"
          aria-selected={activeTab === 'store'}
        >
          <StoreIcon size={16} />
          <span>Store</span>
        </button>

        <button
          className="icon-btn partners-btn"
          onClick={() => setShowPartnersModal(true)}
          title="Partners"
          aria-label="View partners"
        >
          <PartnersIcon size={18} />
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
          onToggle={handleToggle}
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
          onShowMoneroSetup={() => setShowMoneroSetup(true)}
          triggerSwap={triggerSwapFromStore}
          onSwapTriggered={() => setTriggerSwapFromStore(false)}
        />
      )}

      {activeTab === 'store' && (
        <StoreTab 
          walletState={walletState} 
          onWalletStateChange={fetchWalletState}
          onBuyAinti={() => {
            // Navigate to wallet tab and trigger swap view
            setTriggerSwapFromStore(true);
            setActiveTab('wallet');
          }}
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
          {activeTab === 'store' && (
            <div className="status-badge">
              <span className="status-dot" />
              <span>Aintivirus Store</span>
            </div>
          )}
          {walletState && walletState.lockState === 'unlocked' && walletState.network && (
            <div
              className={`network-badge-footer ${!isOnline ? 'offline' : walletState.network === 'devnet' ? 'devnet' : ''}`}
            >
              <span
                className={`network-dot ${!isOnline ? 'offline' : walletState.network === 'devnet' ? 'devnet' : ''}`}
              />
              <span>
                {!isOnline
                  ? 'Offline'
                  : walletState.network === 'devnet'
                    ? 'Online (dev)'
                    : 'Online'}
              </span>
            </div>
          )}
        </div>
        <span className="version-text">v2.0.0</span>
      </footer>

      <PartnersModal isOpen={showPartnersModal} onClose={() => setShowPartnersModal(false)} />

      {showMoneroSetup && (
        <MoneroSetupModal
          onClose={() => setShowMoneroSetup(false)}
          onSuccess={() => {
            setShowMoneroSetup(false);
            // Refresh the wallet state to pick up the new Monero config
            fetchWalletState();
          }}
          testnet={walletState?.networkEnvironment === 'testnet'}
        />
      )}
    </div>
  );
};

export default App;
