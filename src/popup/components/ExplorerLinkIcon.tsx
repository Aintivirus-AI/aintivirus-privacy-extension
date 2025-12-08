/**
 * AINTIVIRUS Wallet - Explorer Link Icon Component
 * 
 * A reusable component for displaying clickable explorer links
 * with consistent styling and secure window.open behavior.
 */

import React from 'react';
import { ExternalLinkIcon } from '../Icons';
import { getExplorerUrl, type ExplorerType } from '@shared/explorer';
import type { ChainType, EVMChainId } from '@shared/types';

// ============================================
// TYPES
// ============================================

export interface ExplorerLinkIconProps {
  /** Type of explorer page */
  type: ExplorerType;
  /** Transaction hash, address, or token address */
  id: string;
  /** Chain type */
  chain: ChainType;
  /** For EVM chains, the specific chain */
  evmChainId?: EVMChainId;
  /** Whether this is a testnet */
  testnet?: boolean;
  /** Icon size in pixels */
  size?: number;
  /** Additional CSS class */
  className?: string;
  /** Show as inline link vs icon button */
  variant?: 'icon' | 'button' | 'link';
  /** Label for link/button variant */
  label?: string;
  /** Tooltip text */
  title?: string;
}

// ============================================
// COMPONENT
// ============================================

export const ExplorerLinkIcon: React.FC<ExplorerLinkIconProps> = ({
  type,
  id,
  chain,
  evmChainId,
  testnet = false,
  size = 14,
  className = '',
  variant = 'icon',
  label,
  title,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = getExplorerUrl(type, id, chain, evmChainId, { testnet });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getDefaultTitle = () => {
    switch (type) {
      case 'tx':
        return 'View transaction on explorer';
      case 'address':
        return 'View address on explorer';
      case 'token':
        return 'View token on explorer';
      default:
        return 'View on explorer';
    }
  };

  const tooltipText = title ?? getDefaultTitle();

  if (variant === 'link') {
    return (
      <a
        href="#"
        onClick={handleClick}
        className={`explorer-link ${className}`}
        title={tooltipText}
      >
        {label || 'View on Explorer'}
        <ExternalLinkIcon size={size} />
        <style>{explorerLinkStyles}</style>
      </a>
    );
  }

  if (variant === 'button') {
    return (
      <button
        onClick={handleClick}
        className={`explorer-btn ${className}`}
        title={tooltipText}
        type="button"
      >
        {label || 'Explorer'}
        <ExternalLinkIcon size={size} />
        <style>{explorerButtonStyles}</style>
      </button>
    );
  }

  // Default: icon only
  return (
    <button
      onClick={handleClick}
      className={`explorer-icon-btn ${className}`}
      title={tooltipText}
      type="button"
      aria-label={tooltipText}
    >
      <ExternalLinkIcon size={size} />
      <style>{explorerIconStyles}</style>
    </button>
  );
};

// ============================================
// STYLES
// ============================================

const explorerIconStyles = `
  .explorer-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: none;
    border: none;
    color: #007bff;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
    opacity: 0.7;
  }
  .explorer-icon-btn:hover {
    opacity: 1;
    background: rgba(0, 123, 255, 0.1);
  }
  .explorer-icon-btn:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.3);
  }
`;

const explorerLinkStyles = `
  .explorer-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #007bff;
    text-decoration: none;
    font-size: 12px;
    transition: all 0.2s ease;
  }
  .explorer-link:hover {
    color: #0056b3;
    text-decoration: underline;
  }
`;

const explorerButtonStyles = `
  .explorer-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #f0f0f0;
    border: none;
    border-radius: 6px;
    color: #333;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .explorer-btn:hover {
    background: #e0e0e0;
  }
`;

export default ExplorerLinkIcon;
