/**
 * RecentRecipientsDropdown Component
 * 
 * Dropdown showing recent transaction recipients with:
 * - Identicon + label (if available) + truncated address
 * - Fuzzy filter after 2+ chars typed
 * - Keyboard navigation (up/down/enter, ESC closes, click-away dismiss)
 * - Shows last 5 recipients max in dropdown
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RecentRecipient, ChainType, EVMChainId, SolanaNetwork } from '@shared/types';
import { useRecentRecipients } from '../hooks/useRecentRecipients';

// ============================================
// TYPES
// ============================================

interface RecentRecipientsDropdownProps {
  /** Current input value (recipient address) */
  value: string;
  /** Called when a recipient is selected */
  onSelect: (address: string) => void;
  /** Called when input value changes */
  onChange: (value: string) => void;
  /** Current chain type */
  chainType: ChainType;
  /** Solana network (for Solana chain) */
  solanaNetwork?: SolanaNetwork;
  /** EVM chain ID (for EVM chains) */
  evmChainId?: EVMChainId | null;
  /** Placeholder text */
  placeholder?: string;
  /** Additional className for input */
  className?: string;
  /** Whether the input has an error state */
  hasError?: boolean;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
}

// ============================================
// IDENTICON GENERATION (deterministic from address)
// ============================================

/**
 * Generate a simple deterministic color from an address
 */
function generateIdenticonColors(address: string): { bg: string; fg: string } {
  // Simple hash from address
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash) + address.charCodeAt(i);
    hash = hash & hash;
  }
  
  // Generate hue from hash (0-360)
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
  const lightness = 55 + (Math.abs(hash >> 16) % 15); // 55-70%
  
  return {
    bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    fg: lightness > 60 ? '#1a1a2e' : '#ffffff',
  };
}

/**
 * Get initials from label or address
 */
function getInitials(recipient: RecentRecipient): string {
  if (recipient.label) {
    const words = recipient.label.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return recipient.label.slice(0, 2).toUpperCase();
  }
  // Use first 2 chars of address (after 0x if present)
  const addr = recipient.address.startsWith('0x') 
    ? recipient.address.slice(2) 
    : recipient.address;
  return addr.slice(0, 2).toUpperCase();
}

// ============================================
// IDENTICON COMPONENT
// ============================================

interface IdenticonProps {
  recipient: RecentRecipient;
  size?: number;
}

const Identicon: React.FC<IdenticonProps> = ({ recipient, size = 32 }) => {
  const colors = useMemo(
    () => generateIdenticonColors(recipient.address),
    [recipient.address]
  );
  const initials = useMemo(() => getInitials(recipient), [recipient]);
  
  return (
    <div
      className="recipient-identicon"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: colors.bg,
        color: colors.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
};

// ============================================
// TRUNCATE ADDRESS
// ============================================

function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// ============================================
// DROPDOWN ITEM
// ============================================

interface DropdownItemProps {
  recipient: RecentRecipient;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

const DropdownItem: React.FC<DropdownItemProps> = ({
  recipient,
  isSelected,
  onClick,
  onMouseEnter,
}) => {
  return (
    <div
      className={`recent-recipient-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      aria-selected={isSelected}
    >
      <Identicon recipient={recipient} size={28} />
      <div className="recipient-info">
        {recipient.label && (
          <span className="recipient-label">{recipient.label}</span>
        )}
        <span className="recipient-address">
          {truncateAddress(recipient.address, 8)}
        </span>
      </div>
      {recipient.useCount > 1 && (
        <span className="recipient-count" title={`Used ${recipient.useCount} times`}>
          {recipient.useCount}×
        </span>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const MAX_VISIBLE_RECIPIENTS = 5;

export const RecentRecipientsDropdown: React.FC<RecentRecipientsDropdownProps> = ({
  value,
  onSelect,
  onChange,
  chainType,
  solanaNetwork,
  evmChainId,
  placeholder,
  className = '',
  hasError = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Get recent recipients with filtering
  const { recipients, loading } = useRecentRecipients(
    chainType,
    solanaNetwork,
    evmChainId,
    value // Pass value as filter query
  );
  
  // Limit visible recipients
  const visibleRecipients = useMemo(
    () => recipients.slice(0, MAX_VISIBLE_RECIPIENTS),
    [recipients]
  );
  
  // Determine if dropdown should show
  const shouldShowDropdown = useMemo(() => {
    if (disabled || loading) return false;
    if (!isOpen) return false;
    if (visibleRecipients.length === 0) return false;
    // If there's a value, only show if fuzzy filtering (2+ chars)
    if (value.length >= 2) return true;
    // Show when focused with no/short input
    return value.length < 2;
  }, [disabled, loading, isOpen, visibleRecipients.length, value.length]);
  
  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Reset selection when recipients change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [visibleRecipients]);
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!shouldShowDropdown) {
      // Open dropdown on arrow down when closed
      if (event.key === 'ArrowDown' && visibleRecipients.length > 0) {
        setIsOpen(true);
        setSelectedIndex(0);
        event.preventDefault();
      }
      return;
    }
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => 
          prev < visibleRecipients.length - 1 ? prev + 1 : prev
        );
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
        
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < visibleRecipients.length) {
          const selected = visibleRecipients[selectedIndex];
          onSelect(selected.address);
          setIsOpen(false);
          setSelectedIndex(-1);
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
        
      case 'Tab':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }, [shouldShowDropdown, visibleRecipients, selectedIndex, onSelect]);
  
  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
  }, [onChange]);
  
  // Handle input focus
  const handleFocus = useCallback(() => {
    if (visibleRecipients.length > 0) {
      setIsOpen(true);
    }
  }, [visibleRecipients.length]);
  
  // Handle item selection
  const handleItemClick = useCallback((recipient: RecentRecipient) => {
    onSelect(recipient.address);
    setIsOpen(false);
    setSelectedIndex(-1);
    // Don't refocus input as it would reopen the dropdown
  }, [onSelect]);
  
  // Handle item hover
  const handleItemHover = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);
  
  return (
    <div 
      className="recent-recipients-dropdown" 
      ref={containerRef}
    >
      <input
        ref={inputRef}
        type="text"
        className={`form-input ${hasError ? 'error' : ''} ${className}`}
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shouldShowDropdown}
        aria-haspopup="listbox"
        role="combobox"
      />
      
      {shouldShowDropdown && (
        <div 
          className="recent-recipients-list"
          role="listbox"
          aria-label="Recent recipients"
        >
          <div className="recent-recipients-header">
            Recent Recipients
          </div>
          {visibleRecipients.map((recipient, index) => (
            <DropdownItem
              key={recipient.address}
              recipient={recipient}
              isSelected={index === selectedIndex}
              onClick={() => handleItemClick(recipient)}
              onMouseEnter={() => handleItemHover(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// STYLES (to be added to global.css)
// ============================================

export const recentRecipientsStyles = `
/* Recent Recipients Dropdown */
.recent-recipients-dropdown {
  position: relative;
  width: 100%;
}

.recent-recipients-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 280px;
  overflow-y: auto;
}

.recent-recipients-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.recent-recipient-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.recent-recipient-item:hover,
.recent-recipient-item.selected {
  background: var(--bg-hover);
}

.recent-recipient-item.selected {
  background: var(--accent-bg);
}

.recipient-identicon {
  user-select: none;
}

.recipient-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recipient-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recipient-address {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.recipient-count {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
`;

export default RecentRecipientsDropdown;
