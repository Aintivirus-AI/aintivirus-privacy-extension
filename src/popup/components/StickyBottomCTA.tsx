

import React from 'react';


export interface StickyBottomCTAProps {
  
  children: React.ReactNode;
  
  primaryLabel: string;
  
  onPrimary: () => void;
  
  primaryDisabled?: boolean;
  
  loading?: boolean;
  
  loadingText?: string;
  
  secondaryLabel?: string;
  
  onSecondary?: () => void;
  
  secondaryDisabled?: boolean;
  
  danger?: boolean;
  
  className?: string;
  
  footerClassName?: string;
  
  maxContentHeight?: string;
  
  showShadow?: boolean;
}


export const StickyBottomCTA: React.FC<StickyBottomCTAProps> = ({
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  loading = false,
  loadingText = 'Processing...',
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  danger = false,
  className = '',
  footerClassName = '',
  maxContentHeight = 'calc(100vh - 180px)',
  showShadow = true,
}) => {
  const isDisabled = primaryDisabled || loading;
  
  return (
    <>
      <div className={`sticky-cta-container ${className}`}>
        <div className="sticky-cta-content">
          {children}
        </div>
        
        <div className={`sticky-cta-footer ${showShadow ? 'with-shadow' : ''} ${footerClassName}`}>
          {secondaryLabel && onSecondary && (
            <button
              className="sticky-cta-btn secondary"
              onClick={onSecondary}
              disabled={secondaryDisabled || loading}
              type="button"
            >
              {secondaryLabel}
            </button>
          )}
          
          <button
            className={`sticky-cta-btn primary ${danger ? 'danger' : ''} ${loading ? 'loading' : ''}`}
            onClick={onPrimary}
            disabled={isDisabled}
            type="button"
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="sticky-cta-spinner" aria-hidden="true" />
                <span>{loadingText}</span>
              </>
            ) : (
              <span>{primaryLabel}</span>
            )}
          </button>
        </div>
      </div>
      
      <style>{`
        .sticky-cta-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          position: relative;
        }
        
        .sticky-cta-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          max-height: ${maxContentHeight};
          padding-bottom: var(--space-4, 16px);
          
          scrollbar-width: thin;
          scrollbar-color: var(--border-default) transparent;
        }
        
        .sticky-cta-content::-webkit-scrollbar {
          width: 6px;
        }
        
        .sticky-cta-content::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .sticky-cta-content::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 3px;
        }
        
        .sticky-cta-footer {
          position: sticky;
          bottom: 0;
          display: flex;
          gap: var(--space-3, 12px);
          padding: var(--space-4, 16px);
          background: var(--bg-secondary, #12121a);
          border-top: 1px solid var(--border-subtle, #1f1f2e);
          z-index: 10;
        }
        
        .sticky-cta-footer.with-shadow {
          box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
        }
        
        .sticky-cta-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2, 8px);
          padding: var(--space-4, 16px) var(--space-5, 20px);
          border-radius: var(--radius-md, 10px);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: 
            background-color var(--transition-fast, 120ms ease),
            border-color var(--transition-fast, 120ms ease),
            opacity var(--transition-fast, 120ms ease),
            transform var(--transition-fast, 120ms ease);
          border: none;
        }
        
        .sticky-cta-btn:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }
        
        .sticky-cta-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .sticky-cta-btn:not(:disabled):active {
          transform: scale(0.98);
        }
        
        .sticky-cta-btn.primary {
          background: var(--accent-primary, #5b5fc7);
          color: white;
        }
        
        .sticky-cta-btn.primary:not(:disabled):hover {
          background: var(--accent-hover, #6e72d4);
        }
        
        .sticky-cta-btn.primary.danger {
          background: var(--error, #c44c4c);
        }
        
        .sticky-cta-btn.primary.danger:not(:disabled):hover {
          background: #d45c5c;
        }
        
        .sticky-cta-btn.primary.loading {
          cursor: wait;
        }
        
        .sticky-cta-btn.secondary {
          background: var(--bg-tertiary, #1a1a25);
          border: 1px solid var(--border-default, #2a2a3d);
          color: var(--text-primary, #e8e8ef);
        }
        
        .sticky-cta-btn.secondary:not(:disabled):hover {
          background: var(--bg-hover, #2a2a3a);
          border-color: var(--border-hover, #3a3a4d);
        }
        
        .sticky-cta-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: sticky-cta-spin 0.8s linear infinite;
        }
        
        @keyframes sticky-cta-spin {
          to {
            transform: rotate(360deg);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .sticky-cta-spinner {
            animation: none;
            opacity: 0.6;
          }
          
          .sticky-cta-btn:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </>
  );
};

export default StickyBottomCTA;
