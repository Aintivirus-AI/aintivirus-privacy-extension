import { WalletError, WalletErrorCode } from './types';

// Provides user-friendly text, categorization, and retry helpers for wallet
// errors so the UI can present consistent messages and failure behavior.
const ERROR_MESSAGES: Record<WalletErrorCode, string> = {
  [WalletErrorCode.WALLET_NOT_INITIALIZED]:
    'No wallet found. Please create or import a wallet first.',
  [WalletErrorCode.WALLET_ALREADY_EXISTS]:
    'A wallet already exists. Please delete it first to create a new one.',
  [WalletErrorCode.WALLET_LOCKED]: 'Wallet is locked. Please unlock with your password.',
  [WalletErrorCode.INVALID_PASSWORD]: 'Incorrect password. Please try again.',
  [WalletErrorCode.INVALID_MNEMONIC]: 'Invalid recovery phrase. Please check and try again.',
  [WalletErrorCode.ENCRYPTION_FAILED]: 'Failed to encrypt wallet data. Please try again.',
  [WalletErrorCode.DECRYPTION_FAILED]:
    'Failed to decrypt wallet. Wrong password or corrupted data.',
  [WalletErrorCode.RPC_ERROR]: 'Network error. Please check your connection and try again.',
  [WalletErrorCode.SIGNING_FAILED]: 'Failed to sign transaction. Please try again.',
  [WalletErrorCode.NETWORK_ERROR]: 'Unable to connect to Solana network. Please try again later.',
  [WalletErrorCode.INSUFFICIENT_FUNDS]: 'Insufficient funds for this transaction.',
  [WalletErrorCode.INVALID_RECIPIENT]: 'Invalid recipient address. Please check and try again.',
  [WalletErrorCode.TRANSACTION_FAILED]: 'Transaction failed. Please try again.',
  [WalletErrorCode.TRANSACTION_TIMEOUT]: 'Transaction confirmation timeout. It may still succeed.',
  [WalletErrorCode.SIMULATION_FAILED]: 'Transaction simulation failed. The transaction may fail.',
  [WalletErrorCode.INVALID_AMOUNT]: 'Invalid amount. Please enter a valid number.',
  [WalletErrorCode.TOKEN_NOT_FOUND]: 'Token not found. Please check the mint address.',

  [WalletErrorCode.MAX_WALLETS_REACHED]:
    'Maximum number of wallets reached (100). Please delete a wallet first.',
  [WalletErrorCode.WALLET_NOT_FOUND]: 'Wallet not found. It may have been deleted.',
  [WalletErrorCode.INVALID_WALLET_LABEL]: 'Invalid wallet label. Please enter a valid name.',
  [WalletErrorCode.CANNOT_DELETE_LAST_WALLET]:
    'Cannot delete the last wallet. Use "Delete All" instead.',
  [WalletErrorCode.MIGRATION_FAILED]: 'Failed to migrate wallet data. Please try again.',
  [WalletErrorCode.STORAGE_ERROR]: 'Failed to save wallet data. Please try again.',

  [WalletErrorCode.ACCOUNT_NOT_FOUND]: 'Account not found. It may have been deleted.',
  [WalletErrorCode.INVALID_ADDRESS]: 'Invalid address format. Please check and try again.',
  [WalletErrorCode.ADDRESS_ALREADY_EXISTS]: 'This address already exists in your wallet.',
  [WalletErrorCode.CANNOT_DELETE_LAST_ACCOUNT]:
    'Cannot delete the last account. Delete the wallet instead.',
  [WalletErrorCode.MAX_ACCOUNTS_REACHED]: 'Maximum number of accounts reached for this wallet.',
  [WalletErrorCode.INVALID_ACCOUNT_NAME]: 'Invalid account name. Please enter a valid name.',
};

export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof WalletError) {
    return ERROR_MESSAGES[error.code] || error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('insufficient')) {
      return ERROR_MESSAGES[WalletErrorCode.INSUFFICIENT_FUNDS];
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return ERROR_MESSAGES[WalletErrorCode.NETWORK_ERROR];
    }

    if (message.includes('invalid') && message.includes('address')) {
      return ERROR_MESSAGES[WalletErrorCode.INVALID_RECIPIENT];
    }

    if (message.includes('simulation')) {
      return ERROR_MESSAGES[WalletErrorCode.SIMULATION_FAILED];
    }

    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

export type ErrorCategory =
  | 'wallet'
  | 'network'
  | 'transaction'
  | 'validation'
  | 'security'
  | 'unknown';

export function getErrorCategory(error: unknown): ErrorCategory {
  if (error instanceof WalletError) {
    switch (error.code) {
      case WalletErrorCode.WALLET_NOT_INITIALIZED:
      case WalletErrorCode.WALLET_ALREADY_EXISTS:
      case WalletErrorCode.WALLET_LOCKED:
      case WalletErrorCode.WALLET_NOT_FOUND:
      case WalletErrorCode.MAX_WALLETS_REACHED:
      case WalletErrorCode.CANNOT_DELETE_LAST_WALLET:
      case WalletErrorCode.MIGRATION_FAILED:
      case WalletErrorCode.STORAGE_ERROR:
        return 'wallet';

      case WalletErrorCode.INVALID_PASSWORD:
      case WalletErrorCode.ENCRYPTION_FAILED:
      case WalletErrorCode.DECRYPTION_FAILED:
        return 'security';

      case WalletErrorCode.RPC_ERROR:
      case WalletErrorCode.NETWORK_ERROR:
        return 'network';

      case WalletErrorCode.TRANSACTION_FAILED:
      case WalletErrorCode.TRANSACTION_TIMEOUT:
      case WalletErrorCode.SIMULATION_FAILED:
      case WalletErrorCode.SIGNING_FAILED:
        return 'transaction';

      case WalletErrorCode.INVALID_MNEMONIC:
      case WalletErrorCode.INVALID_RECIPIENT:
      case WalletErrorCode.INVALID_AMOUNT:
      case WalletErrorCode.INSUFFICIENT_FUNDS:
      case WalletErrorCode.TOKEN_NOT_FOUND:
      case WalletErrorCode.INVALID_WALLET_LABEL:
      case WalletErrorCode.INVALID_ADDRESS:
      case WalletErrorCode.ADDRESS_ALREADY_EXISTS:
        return 'validation';

      case WalletErrorCode.ACCOUNT_NOT_FOUND:
      case WalletErrorCode.CANNOT_DELETE_LAST_ACCOUNT:
        return 'wallet';

      default:
        return 'unknown';
    }
  }

  return 'unknown';
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof WalletError) {
    switch (error.code) {
      case WalletErrorCode.RPC_ERROR:
      case WalletErrorCode.NETWORK_ERROR:
      case WalletErrorCode.TRANSACTION_TIMEOUT:
        return true;
      default:
        return false;
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch') ||
      message.includes('connection')
    );
  }

  return false;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBackoff: boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  exponentialBackoff: true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt < opts.maxRetries) {
        let delay = opts.baseDelayMs;
        if (opts.exponentialBackoff) {
          delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
        }

        delay += Math.random() * delay * 0.25;

        if (opts.onRetry) {
          opts.onRetry(attempt + 1, error);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function logError(error: unknown, context?: string, level: LogLevel = 'error'): void {
  const prefix = '[AINTIVIRUS Wallet]';
  const contextStr = context ? ` [${context}]` : '';

  let message: string;
  let code: string | undefined;

  if (error instanceof WalletError) {
    message = error.message;
    code = error.code;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  const logMessage = `${prefix}${contextStr} ${message}${code ? ` (${code})` : ''}`;

  switch (level) {
    case 'debug':
      break;
    case 'info':
      break;
    case 'warn':
      break;
    case 'error':
    default:
      break;
  }
}

export function wrapError(error: unknown, code: WalletErrorCode, message?: string): WalletError {
  if (error instanceof WalletError) {
    return error;
  }

  const originalMessage = error instanceof Error ? error.message : String(error);
  return new WalletError(code, message || originalMessage);
}

export function validationError(field: string, message: string): WalletError {
  return new WalletError(WalletErrorCode.INVALID_AMOUNT, `${field}: ${message}`);
}

export function assert(
  condition: boolean,
  code: WalletErrorCode,
  message: string,
): asserts condition {
  if (!condition) {
    throw new WalletError(code, message);
  }
}

export function assertDefined<T>(
  value: T | null | undefined,
  code: WalletErrorCode,
  message: string,
): T {
  if (value === null || value === undefined) {
    throw new WalletError(code, message);
  }
  return value;
}

export type Result<T, E = WalletError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export async function tryAsync<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    const value = await promise;
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
