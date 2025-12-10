/**
 * Secure logging utility with automatic redaction of sensitive data
 * Prevents accidental logging of secrets, keys, passwords, etc.
 */

/**
 * Sensitive field names that should be redacted
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passphrase',
  'mnemonic',
  'seed',
  'privateKey',
  'secretKey',
  'secret',
  'authorization',
  'auth',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'signature',
  'signedTransaction',
  'ciphertext',
  'key',
  'salt',
  'iv',
]);

/**
 * Patterns that indicate sensitive data (regex)
 */
const SENSITIVE_PATTERNS = [
  /^[0-9a-fA-F]{64}$/, // Likely a private key (hex)
  /^[1-9A-HJ-NP-Za-km-z]{43,44}$/, // Likely a Solana address or key
  /^0x[0-9a-fA-F]{40}$/, // Ethereum address (could be sensitive)
  /^[0-9a-fA-F]{128}$/, // Long hex string (likely encrypted data)
];

/**
 * Check if a key name is sensitive
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  for (const sensitiveKey of SENSITIVE_KEYS) {
    if (lowerKey.includes(sensitiveKey.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a value looks like sensitive data
 */
function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  
  // Check against patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Redact a single value
 */
function redactValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  
  if (typeof value === 'string') {
    if (value.length === 0) return '(empty)';
    if (value.length <= 8) return '[REDACTED]';
    // Show first and last 4 characters for debugging
    return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
  }
  
  return '[REDACTED]';
}

/**
 * Recursively redact sensitive data in an object
 */
function redactObject(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH]';
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1));
  }
  
  if (typeof obj !== 'object') {
    // Check if primitive value looks sensitive
    if (isSensitiveValue(obj)) {
      return redactValue(obj);
    }
    return obj;
  }
  
  const redacted: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      redacted[key] = redactValue(value);
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactObject(value, depth + 1);
    } else if (isSensitiveValue(value)) {
      redacted[key] = redactValue(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Format log arguments with redaction
 */
function formatArgs(...args: unknown[]): unknown[] {
  return args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      return redactObject(arg);
    }
    if (isSensitiveValue(arg)) {
      return redactValue(arg);
    }
    return arg;
  });
}

/**
 * Logger class with different log levels
 */
class Logger {
  private readonly prefix: string;
  private readonly isDevelopment: boolean;

  constructor(prefix: string = '[AINTIVIRUS]') {
    this.prefix = prefix;
    this.isDevelopment = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  }

  /**
   * Log debug information (only in development)
   */
  debug(...args: unknown[]): void {
    if (this.isDevelopment) {
      const redacted = formatArgs(...args);
      console.log(this.prefix, '[DEBUG]', ...redacted);
    }
  }

  /**
   * Log informational messages
   */
  info(...args: unknown[]): void {
    const redacted = formatArgs(...args);
    console.log(this.prefix, ...redacted);
  }

  /**
   * Log warnings
   */
  warn(...args: unknown[]): void {
    const redacted = formatArgs(...args);
    console.warn(this.prefix, '[WARN]', ...redacted);
  }

  /**
   * Log errors (always logged, even in production)
   */
  error(...args: unknown[]): void {
    const redacted = formatArgs(...args);
    console.error(this.prefix, '[ERROR]', ...redacted);
  }

  /**
   * Log without redaction (use sparingly, only for non-sensitive data)
   */
  unsafe(...args: unknown[]): void {
    console.log(this.prefix, '[UNSAFE]', ...args);
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger('[AINTIVIRUS]');

/**
 * Create a logger with a custom prefix
 */
export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

/**
 * Export redaction utilities for manual use
 */
export { redactObject, redactValue, isSensitiveKey };
