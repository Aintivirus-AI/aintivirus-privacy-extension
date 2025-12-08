/**
 * Balance Privacy Utilities
 * 
 * Provides helper functions for hiding sensitive balance information
 * in privacy mode. When enabled, all balances and USD values are masked.
 */

/** The character used to mask hidden values */
const MASK_CHAR = '*';

/** Standard mask display for hidden values */
export const HIDDEN_BALANCE = '****';

/** Standard mask display for hidden USD values */
export const HIDDEN_USD = '$****';

/**
 * Formats a balance value, optionally hiding it based on privacy mode
 * 
 * @param value - The formatted balance string (e.g., "1.234")
 * @param isHidden - Whether privacy mode is enabled
 * @returns The original value or masked value
 * 
 * @example
 * formatHiddenBalance("1.234 SOL", true) // Returns "****"
 * formatHiddenBalance("1.234 SOL", false) // Returns "1.234 SOL"
 */
export function formatHiddenBalance(value: string, isHidden: boolean): string {
  if (!isHidden) return value;
  return HIDDEN_BALANCE;
}

/**
 * Formats a numeric balance, optionally hiding it based on privacy mode
 * 
 * @param value - The numeric balance value
 * @param formatter - Function to format the number (e.g., formatSol)
 * @param isHidden - Whether privacy mode is enabled
 * @returns The formatted value or masked value
 * 
 * @example
 * formatHiddenNumericBalance(1.234, formatSol, true) // Returns "****"
 * formatHiddenNumericBalance(1.234, formatSol, false) // Returns "1.234"
 */
export function formatHiddenNumericBalance(
  value: number,
  formatter: (n: number) => string,
  isHidden: boolean
): string {
  if (!isHidden) return formatter(value);
  return HIDDEN_BALANCE;
}

/**
 * Formats a USD value, optionally hiding it based on privacy mode
 * 
 * @param value - The formatted USD string (e.g., "$1,234.56")
 * @param isHidden - Whether privacy mode is enabled
 * @returns The original value or masked USD value
 * 
 * @example
 * formatHiddenUsd("$1,234.56", true) // Returns "$****"
 * formatHiddenUsd("$1,234.56", false) // Returns "$1,234.56"
 */
export function formatHiddenUsd(value: string, isHidden: boolean): string {
  if (!isHidden) return value;
  return HIDDEN_USD;
}

/**
 * Formats a transaction amount with direction prefix, optionally hiding it
 * 
 * @param amount - The transaction amount (positive number)
 * @param direction - The transaction direction ('sent' | 'received' | 'swap' | 'unknown')
 * @param symbol - The token symbol (e.g., "SOL")
 * @param formatter - Function to format the number
 * @param isHidden - Whether privacy mode is enabled
 * @returns Formatted string like "+1.234 SOL" or "****"
 * 
 * @example
 * formatHiddenTxAmount(1.234, 'received', 'SOL', formatSol, true) // Returns "****"
 * formatHiddenTxAmount(1.234, 'sent', 'SOL', formatSol, false) // Returns "-1.234 SOL"
 */
export function formatHiddenTxAmount(
  amount: number,
  direction: 'sent' | 'received' | 'swap' | 'unknown',
  symbol: string,
  formatter: (n: number) => string,
  isHidden: boolean
): string {
  if (isHidden) return HIDDEN_BALANCE;
  
  const prefix = direction === 'sent' ? '-' : direction === 'received' ? '+' : '';
  return `${prefix}${formatter(amount)} ${symbol}`;
}

/**
 * Creates a privacy-aware balance display object
 * Useful for components that need both the value and USD
 * 
 * @param balance - The numeric balance
 * @param usdValue - The USD value (can be null if price unavailable)
 * @param symbol - The token symbol
 * @param formatBalance - Function to format balance
 * @param formatUsd - Function to format USD
 * @param isHidden - Whether privacy mode is enabled
 */
export function createPrivacyAwareBalance(
  balance: number,
  usdValue: number | null,
  symbol: string,
  formatBalance: (n: number) => string,
  formatUsd: (n: number) => string,
  isHidden: boolean
): { displayBalance: string; displayUsd: string | null } {
  return {
    displayBalance: isHidden ? HIDDEN_BALANCE : formatBalance(balance),
    displayUsd: usdValue !== null 
      ? (isHidden ? HIDDEN_USD : formatUsd(usdValue))
      : null,
  };
}
