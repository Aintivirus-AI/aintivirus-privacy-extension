/**
 * AINTIVIRUS Wallet - Transaction Status Badge Component
 * 
 * Displays transaction status with appropriate styling:
 * - Pending: Pulsing amber badge
 * - Confirming: Animated blue badge
 * - Confirmed: Green checkmark badge
 * - Failed: Red X badge
 * - Unknown/Stuck: Gray question mark badge
 * - Dropped: Gray trash badge
 * - Replaced: Blue replace badge
 */

import React from 'react';
import {
  TxDisplayStatus,
  getStatusBadgeConfig,
  TxConfirmationProgress,
} from '@wallet/txStatus';

// ============================================
// TYPES
// ============================================

export interface TxStatusBadgeProps {
  /** Transaction status */
  status: TxDisplayStatus;
  /** Optional size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show full label or just icon */
  showLabel?: boolean;
  /** Optional progress info for tooltip */
  progress?: TxConfirmationProgress;
  /** Additional CSS class */
  className?: string;
}

// ============================================
// ICONS
// ============================================

const PendingIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="8" cy="8" r="6" strokeDasharray="20 10" />
  </svg>
);

const ConfirmingIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="8" cy="8" r="6" strokeDasharray="10 5" />
    <path d="M8 4v4l2 2" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
  </svg>
);

const QuestionIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="8" cy="8" r="6" />
    <path d="M6 6a2 2 0 012-2 2 2 0 012 2c0 1-1 1.5-2 2v1" strokeLinecap="round" />
    <circle cx="8" cy="12" r="0.5" fill="currentColor" />
  </svg>
);

const DroppedIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 3h4l1 2H5l1-2z" />
    <path d="M5 5v8a1 1 0 001 1h4a1 1 0 001-1V5" />
    <path d="M7 7v5M9 7v5" strokeLinecap="round" />
  </svg>
);

const ReplaceIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 6l-3-3M12 6H5a2 2 0 00-2 2v1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 10l3 3M4 10h7a2 2 0 002-2V7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StatusIcons: Record<string, React.FC> = {
  pending: PendingIcon,
  confirming: ConfirmingIcon,
  check: CheckIcon,
  x: XIcon,
  question: QuestionIcon,
  dropped: DroppedIcon,
  replace: ReplaceIcon,
};

// ============================================
// COMPONENT
// ============================================

export function TxStatusBadge({
  status,
  size = 'md',
  showLabel = true,
  progress,
  className = '',
}: TxStatusBadgeProps) {
  const config = getStatusBadgeConfig(status);
  const IconComponent = StatusIcons[config.icon] || QuestionIcon;

  const sizeClasses = {
    sm: 'tx-status-badge-sm',
    md: 'tx-status-badge-md',
    lg: 'tx-status-badge-lg',
  };

  const tooltipText = progress 
    ? `${config.label}: ${progress.label}` 
    : config.label;

  return (
    <>
      <span
        className={`tx-status-badge ${sizeClasses[size]} ${config.animate ? 'animate' : ''} ${className}`}
        style={{
          '--badge-color': config.color,
          '--badge-bg': config.bgColor,
        } as React.CSSProperties}
        title={tooltipText}
        role="status"
        aria-label={tooltipText}
      >
        <span className="tx-status-badge-icon">
          <IconComponent />
        </span>
        {showLabel && (
          <span className="tx-status-badge-label">{config.label}</span>
        )}
      </span>

      <style>{`
        .tx-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background: var(--badge-bg);
          color: var(--badge-color);
          border-radius: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .tx-status-badge-sm {
          font-size: 10px;
          padding: 1px 6px;
          gap: 3px;
        }

        .tx-status-badge-sm .tx-status-badge-icon svg {
          width: 10px;
          height: 10px;
        }

        .tx-status-badge-md {
          font-size: 11px;
        }

        .tx-status-badge-md .tx-status-badge-icon svg {
          width: 12px;
          height: 12px;
        }

        .tx-status-badge-lg {
          font-size: 13px;
          padding: 4px 12px;
          gap: 6px;
        }

        .tx-status-badge-lg .tx-status-badge-icon svg {
          width: 16px;
          height: 16px;
        }

        .tx-status-badge-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tx-status-badge-label {
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        /* Pulsing animation for pending/unknown states */
        .tx-status-badge.animate {
          animation: badge-pulse 2s ease-in-out infinite;
        }

        @keyframes badge-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }

        /* Spinning animation for confirming icon */
        .tx-status-badge.animate .tx-status-badge-icon svg {
          animation: badge-spin 2s linear infinite;
        }

        @keyframes badge-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* Override spin for non-spinning badges */
        .tx-status-badge:not([data-status="confirming"]) .tx-status-badge-icon svg {
          animation: none;
        }

        /* Reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .tx-status-badge.animate,
          .tx-status-badge.animate .tx-status-badge-icon svg {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}

// ============================================
// COMPACT VARIANT
// ============================================

export interface TxStatusDotProps {
  /** Transaction status */
  status: TxDisplayStatus;
  /** Dot size in pixels */
  size?: number;
  /** Additional CSS class */
  className?: string;
}

/**
 * Compact status indicator dot
 */
export function TxStatusDot({
  status,
  size = 8,
  className = '',
}: TxStatusDotProps) {
  const config = getStatusBadgeConfig(status);

  return (
    <>
      <span
        className={`tx-status-dot ${config.animate ? 'animate' : ''} ${className}`}
        style={{
          '--dot-color': config.color,
          '--dot-size': `${size}px`,
        } as React.CSSProperties}
        title={config.label}
        role="status"
        aria-label={config.label}
      />

      <style>{`
        .tx-status-dot {
          display: inline-block;
          width: var(--dot-size);
          height: var(--dot-size);
          background: var(--dot-color);
          border-radius: 50%;
          flex-shrink: 0;
        }

        .tx-status-dot.animate {
          animation: dot-pulse 2s ease-in-out infinite;
        }

        @keyframes dot-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(0.9);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tx-status-dot.animate {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}

export default TxStatusBadge;
