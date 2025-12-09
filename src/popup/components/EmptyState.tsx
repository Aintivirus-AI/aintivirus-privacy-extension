

import React from 'react';


export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  
  icon?: React.ReactNode;
  
  title: string;
  
  description?: string;
  
  primaryAction?: EmptyStateAction;
  
  secondaryAction?: EmptyStateAction;
  
  size?: 'sm' | 'md' | 'lg';
  
  className?: string;
}


export type EmptyStatePreset = 'tokens' | 'activity' | 'sites' | 'allowances' | 'nfts';

export interface EmptyStatePresetProps {
  preset: EmptyStatePreset;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  className?: string;
}


function TokensIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="24" cy="24" r="16" />
      <path d="M24 16v16M18 20l6-4 6 4M18 28l6 4 6-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 24h8l4-8 4 16 4-8h12" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="18" strokeDasharray="4 4" opacity="0.3" />
    </svg>
  );
}

function SitesIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="24" cy="24" r="16" />
      <ellipse cx="24" cy="24" rx="16" ry="8" />
      <path d="M24 8v32M8 24h32" opacity="0.5" />
    </svg>
  );
}

function AllowancesIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="10" y="14" width="28" height="20" rx="3" />
      <path d="M10 22h28" />
      <path d="M16 30h8" strokeLinecap="round" />
    </svg>
  );
}

function NftsIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="12" y="10" width="24" height="28" rx="3" />
      <path d="M18 20l4 3 6-5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19" cy="17" r="2" />
    </svg>
  );
}


const PRESETS: Record<EmptyStatePreset, {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
}> = {
  tokens: {
    icon: <TokensIcon />,
    title: 'No tokens yet',
    description: 'Receive tokens to see them here',
    primaryLabel: 'Receive',
  },
  activity: {
    icon: <ActivityIcon />,
    title: 'No activity',
    description: 'Your transaction history will appear here',
    primaryLabel: 'Send',
    secondaryLabel: 'Receive',
  },
  sites: {
    icon: <SitesIcon />,
    title: 'No connected sites',
    description: 'Connect to a dApp to see it here',
    primaryLabel: 'Learn More',
  },
  allowances: {
    icon: <AllowancesIcon />,
    title: 'No token allowances',
    description: 'Approved spending permissions will appear here',
    primaryLabel: 'Learn More',
  },
  nfts: {
    icon: <NftsIcon />,
    title: 'No NFTs yet',
    description: 'Your collectibles will appear here',
    primaryLabel: 'Browse',
  },
};


export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  size = 'md',
  className = '',
}) => {
  const sizeStyles = {
    sm: {
      padding: '24px 16px',
      iconSize: '36px',
      titleSize: '14px',
      descSize: '12px',
      buttonPadding: '8px 16px',
      gap: '12px',
    },
    md: {
      padding: '32px 24px',
      iconSize: '48px',
      titleSize: '16px',
      descSize: '13px',
      buttonPadding: '10px 20px',
      gap: '16px',
    },
    lg: {
      padding: '48px 32px',
      iconSize: '64px',
      titleSize: '18px',
      descSize: '14px',
      buttonPadding: '12px 24px',
      gap: '20px',
    },
  };
  
  const s = sizeStyles[size];
  
  return (
    <>
      <div className={`empty-state empty-state-${size} ${className}`}>
        {icon && (
          <div className="empty-state-icon" aria-hidden="true">
            {icon}
          </div>
        )}
        
        <div className="empty-state-content">
          <h3 className="empty-state-title">{title}</h3>
          {description && (
            <p className="empty-state-description">{description}</p>
          )}
        </div>
        
        {(primaryAction || secondaryAction) && (
          <div className="empty-state-actions">
            {primaryAction && (
              <button
                className="empty-state-btn primary"
                onClick={primaryAction.onClick}
                type="button"
              >
                {primaryAction.icon}
                <span>{primaryAction.label}</span>
              </button>
            )}
            {secondaryAction && (
              <button
                className="empty-state-btn secondary"
                onClick={secondaryAction.onClick}
                type="button"
              >
                {secondaryAction.icon}
                <span>{secondaryAction.label}</span>
              </button>
            )}
          </div>
        )}
      </div>
      
      <style>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: ${s.padding};
          gap: ${s.gap};
        }
        
        .empty-state-icon {
          width: ${s.iconSize};
          height: ${s.iconSize};
          color: var(--text-muted);
          opacity: 0.6;
        }
        
        .empty-state-icon svg {
          width: 100%;
          height: 100%;
        }
        
        .empty-state-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .empty-state-title {
          margin: 0;
          font-size: ${s.titleSize};
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .empty-state-description {
          margin: 0;
          font-size: ${s.descSize};
          color: var(--text-muted);
          max-width: 240px;
          line-height: 1.4;
        }
        
        .empty-state-actions {
          display: flex;
          gap: 10px;
          margin-top: 4px;
        }
        
        .empty-state-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: ${s.buttonPadding};
          border-radius: var(--radius-md, 10px);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition-fast, 120ms ease);
          border: none;
        }
        
        .empty-state-btn.primary {
          background: var(--accent-primary, #5b5fc7);
          color: white;
        }
        
        .empty-state-btn.primary:hover {
          background: var(--accent-hover, #6e72d4);
        }
        
        .empty-state-btn.secondary {
          background: var(--bg-tertiary, #1a1a25);
          border: 1px solid var(--border-default, #2a2a3d);
          color: var(--text-primary, #e8e8ef);
        }
        
        .empty-state-btn.secondary:hover {
          background: var(--bg-hover, #2a2a3a);
          border-color: var(--border-hover, #3a3a4d);
        }
        
        .empty-state-btn:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }
        
        .empty-state-btn svg {
          width: 16px;
          height: 16px;
        }
      `}</style>
    </>
  );
};


export const EmptyStatePreset: React.FC<EmptyStatePresetProps> = ({
  preset,
  onPrimaryAction,
  onSecondaryAction,
  className,
}) => {
  const config = PRESETS[preset];
  
  if (!config) return null;
  
  return (
    <EmptyState
      icon={config.icon}
      title={config.title}
      description={config.description}
      primaryAction={onPrimaryAction ? {
        label: config.primaryLabel,
        onClick: onPrimaryAction,
      } : undefined}
      secondaryAction={onSecondaryAction && config.secondaryLabel ? {
        label: config.secondaryLabel,
        onClick: onSecondaryAction,
      } : undefined}
      className={className}
    />
  );
};

export default EmptyState;
