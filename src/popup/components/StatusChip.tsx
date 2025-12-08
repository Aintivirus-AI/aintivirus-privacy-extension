/**
 * AINTIVIRUS - StatusChip Component
 * 
 * Displays status with:
 * - Color-coded background
 * - Status icon (for accessibility - not color-only)
 * - Optional pulse animation for pending
 * - Respects prefers-reduced-motion
 * 
 * @example
 * <StatusChip status="pending" />
 * <StatusChip status="confirmed" size="sm" />
 */

import React from 'react';

// ============================================
// TYPES
// ============================================

export type StatusType = 
  | 'pending'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'unknown'
  | 'cancelled'
  | 'replaced';

export interface StatusChipProps {
  /** Status to display */
  status: StatusType;
  /** Size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Custom label override */
  label?: string;
  /** Show icon only (no label) */
  iconOnly?: boolean;
  /** Additional CSS class */
  className?: string;
}

// ============================================
// STATUS CONFIG
// ============================================

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  animate: boolean;
}

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  pending: {
    label: 'Pending',
    color: 'var(--status-pending-color, #d4a534)',
    bgColor: 'var(--status-pending-bg, rgba(212, 165, 52, 0.12))',
    icon: <PendingIcon />,
    animate: true,
  },
  confirming: {
    label: 'Confirming',
    color: 'var(--status-confirming-color, #5b9fd4)',
    bgColor: 'var(--status-confirming-bg, rgba(91, 159, 212, 0.12))',
    icon: <ConfirmingIcon />,
    animate: true,
  },
  confirmed: {
    label: 'Confirmed',
    color: 'var(--status-confirmed-color, #3d9970)',
    bgColor: 'var(--status-confirmed-bg, rgba(61, 153, 112, 0.12))',
    icon: <CheckIcon />,
    animate: false,
  },
  failed: {
    label: 'Failed',
    color: 'var(--status-failed-color, #c44c4c)',
    bgColor: 'var(--status-failed-bg, rgba(196, 76, 76, 0.12))',
    icon: <FailedIcon />,
    animate: false,
  },
  unknown: {
    label: 'Unknown',
    color: 'var(--status-unknown-color, #9898a8)',
    bgColor: 'var(--status-unknown-bg, rgba(152, 152, 168, 0.12))',
    icon: <UnknownIcon />,
    animate: false,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'var(--status-unknown-color, #9898a8)',
    bgColor: 'var(--status-unknown-bg, rgba(152, 152, 168, 0.12))',
    icon: <CancelledIcon />,
    animate: false,
  },
  replaced: {
    label: 'Replaced',
    color: 'var(--accent-primary, #5b5fc7)',
    bgColor: 'var(--accent-muted, rgba(91, 95, 199, 0.12))',
    icon: <ReplacedIcon />,
    animate: false,
  },
};

// ============================================
// ICONS
// ============================================

function PendingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="5" strokeDasharray="16 8" />
    </svg>
  );
}

function ConfirmingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="5" />
      <path d="M8 5v3l2 1" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 8l2.5 2.5L12 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FailedIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 5l6 6M11 5l-6 6" strokeLinecap="round" />
    </svg>
  );
}

function UnknownIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5" />
      <path d="M6.5 6.5a1.5 1.5 0 012.5 1c0 1-1.5 1.5-1.5 2.5" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

function CancelledIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5" />
      <path d="M5 8h6" strokeLinecap="round" />
    </svg>
  );
}

function ReplacedIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 4l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8h10" strokeLinecap="round" />
      <path d="M5 12l-2-2 2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============================================
// COMPONENT
// ============================================

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  size = 'sm',
  label,
  iconOnly = false,
  className = '',
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const displayLabel = label || config.label;
  
  const sizeStyles = {
    xs: {
      height: '16px',
      padding: iconOnly ? '2px' : '2px 5px',
      fontSize: '9px',
      iconSize: '10px',
      gap: '3px',
    },
    sm: {
      height: '20px',
      padding: iconOnly ? '3px' : '3px 7px',
      fontSize: '10px',
      iconSize: '12px',
      gap: '4px',
    },
    md: {
      height: '24px',
      padding: iconOnly ? '4px' : '4px 10px',
      fontSize: '11px',
      iconSize: '14px',
      gap: '5px',
    },
  };
  
  const s = sizeStyles[size];
  
  return (
    <>
      <span
        className={`status-chip status-chip-${size} ${config.animate ? 'animate' : ''} ${className}`}
        style={{
          '--status-color': config.color,
          '--status-bg': config.bgColor,
        } as React.CSSProperties}
        role="status"
        aria-label={displayLabel}
      >
        <span className="status-chip-icon" aria-hidden="true">
          {config.icon}
        </span>
        {!iconOnly && (
          <span className="status-chip-label">{displayLabel}</span>
        )}
      </span>
      
      <style>{`
        .status-chip {
          display: inline-flex;
          align-items: center;
          gap: ${s.gap};
          height: ${s.height};
          padding: ${s.padding};
          background: var(--status-bg);
          color: var(--status-color);
          border-radius: 9999px;
          font-size: ${s.fontSize};
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
          flex-shrink: 0;
        }
        
        .status-chip-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: ${s.iconSize};
          height: ${s.iconSize};
        }
        
        .status-chip-icon svg {
          width: 100%;
          height: 100%;
        }
        
        .status-chip-label {
          line-height: 1;
        }
        
        /* Subtle pulse animation for pending states */
        .status-chip.animate {
          animation: status-pulse 2s ease-in-out infinite;
        }
        
        @keyframes status-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.65;
          }
        }
        
        /* Spin animation for confirming icon */
        .status-chip.animate .status-chip-icon svg {
          animation: status-spin 3s linear infinite;
        }
        
        @keyframes status-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .status-chip.animate,
          .status-chip.animate .status-chip-icon svg {
            animation: none;
          }
        }
      `}</style>
    </>
  );
};

export default StatusChip;
