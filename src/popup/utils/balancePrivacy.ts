export const HIDDEN_BALANCE = '****';

export const HIDDEN_USD = '$****';

export function formatHiddenBalance(value: string, isHidden: boolean): string {
  if (!isHidden) return value;
  return HIDDEN_BALANCE;
}

export function formatHiddenNumericBalance(
  value: number,
  formatter: (n: number) => string,
  isHidden: boolean,
): string {
  if (!isHidden) return formatter(value);
  return HIDDEN_BALANCE;
}

export function formatHiddenUsd(value: string, isHidden: boolean): string {
  if (!isHidden) return value;
  return HIDDEN_USD;
}

export function formatHiddenTxAmount(
  amount: number,
  direction: 'sent' | 'received' | 'self' | 'swap' | 'unknown',
  symbol: string,
  formatter: (n: number) => string,
  isHidden: boolean,
): string {
  if (isHidden) return HIDDEN_BALANCE;

  const prefix = direction === 'sent' ? '-' : direction === 'received' ? '+' : '';
  return `${prefix}${formatter(amount)} ${symbol}`;
}

export function createPrivacyAwareBalance(
  balance: number,
  usdValue: number | null,
  symbol: string,
  formatBalance: (n: number) => string,
  formatUsd: (n: number) => string,
  isHidden: boolean,
): { displayBalance: string; displayUsd: string | null } {
  // Keep `symbol` in the signature for callers, even though the return values are already formatted.
  void symbol;
  return {
    displayBalance: isHidden ? HIDDEN_BALANCE : formatBalance(balance),
    displayUsd: usdValue !== null ? (isHidden ? HIDDEN_USD : formatUsd(usdValue)) : null,
  };
}
