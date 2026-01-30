import React from 'react';

export type StoreSubTab = 'merch' | 'giftcards' | 'esim';

interface StoreSubTabsProps {
  activeTab: StoreSubTab;
  onTabChange: (tab: StoreSubTab) => void;
}

const TABS: { id: StoreSubTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'merch',
    label: 'Merch',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6l2-2h12l2 2" />
        <path d="M4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6" />
        <path d="M8 4v4a4 4 0 0 0 8 0V4" />
        <line x1="12" y1="12" x2="12" y2="16" />
      </svg>
    ),
  },
  {
    id: 'giftcards',
    label: 'Gift Cards',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20v-2a7 7 0 0 1 14 0v2" />
        <path d="M9 8h.01" />
        <path d="M15 8h.01" />
      </svg>
    ),
  },
  {
    id: 'esim',
    label: 'eSIM',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
];

const StoreSubTabs: React.FC<StoreSubTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="store-subtabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`store-subtab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          type="button"
        >
          <span className="store-subtab-icon">{tab.icon}</span>
          <span className="store-subtab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default StoreSubTabs;
