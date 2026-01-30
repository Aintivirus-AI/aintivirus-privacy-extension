/**
 * Formatting utilities for the popup UI
 */

/**
 * Truncate an address for display (e.g., "abc...xyz")
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format a SOL amount for display
 */
export function formatSol(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) {
    const str = amount.toFixed(8);
    return str.replace(/\.?0+$/, '') || '0';
  }
  if (amount < 1) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  }
  return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/**
 * Format a large number with K/M suffix
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/**
 * Format a USD amount for display
 */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount > 0 && amount < 0.01) return '<$0.01';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a token price with appropriate precision
 * Shows more decimals for low-priced tokens to enable price tracking
 */
export function formatTokenPrice(price: number): string {
  if (price === 0) return '$0.00';
  
  // For prices >= $1, show 2 decimals
  if (price >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }
  
  // For prices >= $0.01, show 4 decimals
  if (price >= 0.01) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(price);
  }
  
  // For prices >= $0.0001, show 6 decimals
  if (price >= 0.0001) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(price);
  }
  
  // For very small prices, show up to 8 decimals
  if (price >= 0.00000001) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    }).format(price);
  }
  
  // For extremely small prices, use scientific notation
  return `$${price.toExponential(2)}`;
}

/**
 * Format a token amount with appropriate decimals
 */
export function formatTokenAmount(amount: number, decimals: number = 6): string {
  if (amount === 0) return '0';
  if (amount < Math.pow(10, -decimals)) {
    return `<${Math.pow(10, -decimals)}`;
  }
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(decimals, 6),
  });
}

/**
 * Format a percentage change
 */
export function formatPercentChange(change: number | null): string {
  if (change === null || change === undefined) return '';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Format a timestamp as relative time (e.g., "2h ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Format a date for display
 */
export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
