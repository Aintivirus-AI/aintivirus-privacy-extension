import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronIcon, CopyIcon, CheckIcon } from '../Icons';
import { useToast } from './ToastProvider';

export interface DetailsAccordionProps {
  title?: string;

  defaultExpanded?: boolean;

  expanded?: boolean;

  onToggle?: (expanded: boolean) => void;

  children: React.ReactNode;

  itemCount?: number;

  className?: string;
}

export interface DetailsRowProps {
  label: string;

  value: string | React.ReactNode;

  mono?: boolean;

  copyable?: boolean;

  copyValue?: string;

  highlight?: 'warning' | 'danger' | 'info';

  className?: string;
}

export interface DetailsCodeBlockProps {
  data: string;

  label?: string;

  maxHeight?: number;

  className?: string;
}

export const DetailsRow: React.FC<DetailsRowProps> = ({
  label,
  value,
  mono = false,
  copyable = false,
  copyValue,
  highlight,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();

  const handleCopy = useCallback(async () => {
    const textToCopy = copyValue || (typeof value === 'string' ? value : '');
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      addToast('Copied', 'success');
      setTimeout(() => setCopied(false), 800);
    } catch {
      addToast('Failed to copy', 'error');
    }
  }, [value, copyValue, addToast]);

  return (
    <>
      <div className={`details-row ${highlight ? `highlight-${highlight}` : ''} ${className}`}>
        <span className="details-row-label">{label}</span>
        <div className="details-row-value-container">
          <span className={`details-row-value ${mono ? 'mono' : ''}`}>{value}</span>
          {copyable && typeof value === 'string' && (
            <button
              className={`details-row-copy ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              aria-label={`Copy ${label}`}
              type="button"
            >
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .details-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-subtle);
          gap: 12px;
        }
        
        .details-row:last-child {
          border-bottom: none;
        }
        
        .details-row-label {
          font-size: 12px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        
        .details-row-value-container {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          min-width: 0;
          flex: 1;
          justify-content: flex-end;
        }
        
        .details-row-value {
          font-size: 12px;
          color: var(--text-primary);
          text-align: right;
          word-break: break-all;
        }
        
        .details-row-value.mono {
          font-family: var(--font-mono);
          font-size: 11px;
        }
        
        .details-row-copy {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        
        .details-row-copy:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        
        .details-row-copy.copied {
          color: var(--success);
        }
        
        .details-row.highlight-warning .details-row-value {
          color: var(--warning);
        }
        
        .details-row.highlight-danger .details-row-value {
          color: var(--error);
          font-weight: 600;
        }
        
        .details-row.highlight-info .details-row-value {
          color: var(--accent-primary);
        }
      `}</style>
    </>
  );
};

export const DetailsCodeBlock: React.FC<DetailsCodeBlockProps> = ({
  data,
  label,
  maxHeight = 120,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      addToast('Copied', 'success');
      setTimeout(() => setCopied(false), 800);
    } catch {
      addToast('Failed to copy', 'error');
    }
  }, [data, addToast]);

  const dataSize = data.startsWith('0x') ? Math.floor((data.length - 2) / 2) : data.length;

  return (
    <>
      <div className={`details-code-block ${className}`}>
        {label && (
          <div className="details-code-header">
            <span className="details-code-label">{label}</span>
            <span className="details-code-size">{dataSize} bytes</span>
            <button
              className={`details-code-copy ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              aria-label="Copy data"
              type="button"
            >
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}
        <pre className="details-code-content" style={{ maxHeight }}>
          {data}
        </pre>
      </div>

      <style>{`
        .details-code-block {
          margin-top: 8px;
        }
        
        .details-code-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        
        .details-code-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        
        .details-code-size {
          font-size: 10px;
          color: var(--text-muted);
          opacity: 0.7;
        }
        
        .details-code-copy {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: var(--text-muted);
          font-size: 10px;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        
        .details-code-copy:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        
        .details-code-copy.copied {
          color: var(--success);
        }
        
        .details-code-content {
          margin: 0;
          padding: 10px;
          background: var(--bg-primary);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-all;
          overflow-y: auto;
          line-height: 1.5;
        }
      `}</style>
    </>
  );
};

export const DetailsAccordion: React.FC<DetailsAccordionProps> = ({
  title = 'Details',
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  children,
  itemCount,
  className = '',
}) => {
  const isControlled = controlledExpanded !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, expanded]);

  const handleToggle = () => {
    const newExpanded = !expanded;
    if (isControlled) {
      onToggle?.(newExpanded);
    } else {
      setInternalExpanded(newExpanded);
    }
  };

  return (
    <>
      <div className={`details-accordion ${expanded ? 'expanded' : ''} ${className}`}>
        <button
          className="details-accordion-trigger"
          onClick={handleToggle}
          aria-expanded={expanded}
          type="button"
        >
          <span className="details-accordion-icon" aria-hidden="true">
            <ChevronIcon size={14} />
          </span>
          <span className="details-accordion-title">{title}</span>
          {itemCount !== undefined && <span className="details-accordion-count">{itemCount}</span>}
        </button>

        <div
          className="details-accordion-panel"
          style={{
            height: expanded ? contentHeight : 0,
          }}
          aria-hidden={!expanded}
        >
          <div className="details-accordion-content" ref={contentRef}>
            {children}
          </div>
        </div>
      </div>

      <style>{`
        .details-accordion {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 10px);
          overflow: hidden;
        }
        
        .details-accordion-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 12px 14px;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background-color var(--transition-fast);
        }
        
        .details-accordion-trigger:hover {
          background: var(--bg-hover);
        }
        
        .details-accordion-trigger:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: -2px;
        }
        
        .details-accordion-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: transform var(--transition-normal);
        }
        
        .details-accordion.expanded .details-accordion-icon {
          transform: rotate(180deg);
        }
        
        .details-accordion-title {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          flex: 1;
        }
        
        .details-accordion-count {
          font-size: 10px;
          font-weight: 600;
          color: var(--accent-primary);
          background: var(--accent-muted);
          padding: 2px 6px;
          border-radius: 9999px;
        }
        
        .details-accordion-panel {
          overflow: hidden;
          transition: height var(--transition-normal);
        }
        
        .details-accordion-content {
          padding: 0 14px 14px;
        }
        
        @media (prefers-reduced-motion: reduce) {
          .details-accordion-icon,
          .details-accordion-panel {
            transition: none;
          }
        }
      `}</style>
    </>
  );
};

export default DetailsAccordion;
