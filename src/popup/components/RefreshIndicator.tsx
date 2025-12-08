/**
 * AINTIVIRUS - RefreshIndicator Component
 * 
 * Shows cached data timestamp with subtle refresh indicator:
 * - "Updated X min ago" text
 * - Subtle "Refreshing..." indicator (no spinner spam)
 * - Click to refresh manually
 * 
 * Designed to show cached balances instantly while indicating
 * when fresh data is being fetched.
 * 
 * @example
 * <RefreshIndicator
 *   lastUpdated={Date.now() - 120000}
 *   isRefreshing={isLoading}
 *   onRefresh={handleRefresh}
 * />
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

export interface RefreshIndicatorProps {
  /** Timestamp of last successful update */
  lastUpdated?: number;
  /** Is currently refreshing */
  isRefreshing?: boolean;
  /** Manual refresh handler */
  onRefresh?: () => void;
  /** Whether to show the refresh button */
  showButton?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Position */
  align?: 'left' | 'center' | 'right';
  /** Additional CSS class */
  className?: string;
}

// ============================================
// HELPERS
// ============================================

function formatLastUpdated(timestamp: number | undefined): string {
  if (!timestamp) return 'Never updated';
  
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  
  return new Date(timestamp).toLocaleString();
}

// ============================================
// ICONS
// ============================================

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={spinning ? 'refresh-icon-spinning' : ''}
    >
      <path
        d="M2 8a6 6 0 0111.2-3M14 8a6 6 0 01-11.2 3"
        strokeLinecap="round"
      />
      <path d="M14 3v2.5h-2.5M2 13v-2.5h2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============================================
// COMPONENT
// ============================================

export const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({
  lastUpdated,
  isRefreshing = false,
  onRefresh,
  showButton = true,
  size = 'sm',
  align = 'center',
  className = '',
}) => {
  const [displayTime, setDisplayTime] = useState(() => formatLastUpdated(lastUpdated));
  const [showSuccess, setShowSuccess] = useState(false);
  const prevRefreshing = React.useRef(isRefreshing);
  
  // Update display time periodically
  useEffect(() => {
    const updateTime = () => {
      setDisplayTime(formatLastUpdated(lastUpdated));
    };
    
    updateTime();
    const interval = setInterval(updateTime, 10000); // Update every 10 seconds
    
    return () => clearInterval(interval);
  }, [lastUpdated]);
  
  // Show success checkmark when refresh completes
  useEffect(() => {
    if (prevRefreshing.current && !isRefreshing) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 1500);
      return () => clearTimeout(timer);
    }
    prevRefreshing.current = isRefreshing;
  }, [isRefreshing]);
  
  const handleClick = useCallback(() => {
    if (!isRefreshing && onRefresh) {
      onRefresh();
    }
  }, [isRefreshing, onRefresh]);
  
  const sizeStyles = {
    sm: {
      fontSize: '10px',
      iconSize: '12px',
      gap: '4px',
      padding: '4px 8px',
    },
    md: {
      fontSize: '11px',
      iconSize: '14px',
      gap: '6px',
      padding: '6px 10px',
    },
  };
  
  const s = sizeStyles[size];
  
  return (
    <>
      <div className={`refresh-indicator refresh-indicator-${size} align-${align} ${className}`}>
        {showButton && onRefresh ? (
          <button
            className={`refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
            onClick={handleClick}
            disabled={isRefreshing}
            aria-label={isRefreshing ? 'Refreshing data' : 'Refresh data'}
            type="button"
          >
            <span className="refresh-icon">
              {showSuccess ? <CheckIcon /> : <RefreshIcon spinning={isRefreshing} />}
            </span>
            <span className="refresh-text">
              {isRefreshing ? 'Refreshing...' : `Updated ${displayTime}`}
            </span>
          </button>
        ) : (
          <span className="refresh-status">
            {isRefreshing ? (
              <>
                <span className="refresh-icon">
                  <RefreshIcon spinning />
                </span>
                <span className="refresh-text">Refreshing...</span>
              </>
            ) : (
              <>
                {showSuccess && (
                  <span className="refresh-icon success">
                    <CheckIcon />
                  </span>
                )}
                <span className="refresh-text">Updated {displayTime}</span>
              </>
            )}
          </span>
        )}
      </div>
      
      <style>{`
        .refresh-indicator {
          display: flex;
        }
        
        .refresh-indicator.align-left {
          justify-content: flex-start;
        }
        
        .refresh-indicator.align-center {
          justify-content: center;
        }
        
        .refresh-indicator.align-right {
          justify-content: flex-end;
        }
        
        .refresh-btn,
        .refresh-status {
          display: inline-flex;
          align-items: center;
          gap: ${s.gap};
          font-size: ${s.fontSize};
          color: var(--text-muted);
        }
        
        .refresh-btn {
          padding: ${s.padding};
          background: transparent;
          border: none;
          border-radius: var(--radius-full, 9999px);
          cursor: pointer;
          transition: 
            background-color var(--transition-fast),
            color var(--transition-fast);
        }
        
        .refresh-btn:hover:not(:disabled) {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }
        
        .refresh-btn:disabled {
          cursor: default;
        }
        
        .refresh-btn:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }
        
        .refresh-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: ${s.iconSize};
          height: ${s.iconSize};
        }
        
        .refresh-icon svg {
          width: 100%;
          height: 100%;
        }
        
        .refresh-icon.success {
          color: var(--success);
        }
        
        .refresh-icon-spinning {
          animation: refresh-spin 1s linear infinite;
        }
        
        @keyframes refresh-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        .refresh-text {
          white-space: nowrap;
        }
        
        .refresh-btn.refreshing .refresh-text {
          color: var(--accent-primary);
        }
        
        @media (prefers-reduced-motion: reduce) {
          .refresh-icon-spinning {
            animation: none;
            opacity: 0.6;
          }
        }
      `}</style>
    </>
  );
};

export default RefreshIndicator;
