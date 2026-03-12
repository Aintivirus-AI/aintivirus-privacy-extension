/**
 * Security/Privacy tab view
 */

import React from 'react';
import { FEATURE_FLAG_META } from '@shared/featureFlags';
import {
  ShieldIcon,
  WalletIcon,
  BellIcon,
  BlockIcon,
} from '../Icons';
import { formatNumber } from '../utils/format';
import type { SecurityTabProps } from '../types';

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

export const SecurityView: React.FC<SecurityTabProps> = ({
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

export default SecurityView;
