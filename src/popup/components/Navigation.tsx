/**
 * Bottom navigation tab bar
 */

import React from 'react';
import {
  ShieldIcon,
  WalletIcon,
  StoreIcon,
  PartnersIcon,
  SettingsIcon,
} from '../Icons';
import type { MainTab } from '../types';

interface NavigationProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onPartnersClick: () => void;
  onSettingsClick: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  onPartnersClick,
  onSettingsClick,
}) => {
  return (
    <nav className="tab-bar" role="tablist">
      <button
        className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
        onClick={() => onTabChange('security')}
        role="tab"
        aria-selected={activeTab === 'security'}
      >
        <ShieldIcon size={16} />
        <span>Privacy</span>
      </button>
      <button
        className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}
        onClick={() => onTabChange('wallet')}
        role="tab"
        aria-selected={activeTab === 'wallet'}
      >
        <WalletIcon size={16} />
        <span>Wallet</span>
      </button>
      <button
        className={`tab-btn ${activeTab === 'store' ? 'active' : ''}`}
        onClick={() => onTabChange('store')}
        role="tab"
        aria-selected={activeTab === 'store'}
      >
        <StoreIcon size={16} />
        <span>Store</span>
      </button>

      <button
        className="icon-btn partners-btn"
        onClick={onPartnersClick}
        title="Partners"
        aria-label="View partners"
      >
        <PartnersIcon size={18} />
      </button>

      <button
        className="icon-btn settings-btn"
        onClick={onSettingsClick}
        title="Settings"
        aria-label="Open settings"
      >
        <SettingsIcon size={18} />
      </button>
    </nav>
  );
};

export default Navigation;
