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

const SENSITIVE_PATTERNS = [
  /^[0-9a-fA-F]{64}$/,
  /^[1-9A-HJ-NP-Za-km-z]{43,44}$/,
  /^0x[0-9a-fA-F]{40}$/,
  /^[0-9a-fA-F]{128}$/,
];

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  for (const sensitiveKey of SENSITIVE_KEYS) {
    if (lowerKey.includes(sensitiveKey.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }

  return false;
}

function redactValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === 'string') {
    if (value.length === 0) return '(empty)';
    if (value.length <= 8) return '[REDACTED]';
    return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
  }

  return '[REDACTED]';
}

function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  if (typeof obj !== 'object') {
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

function formatArgs(...args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'object' && arg !== null) {
      return redactObject(arg);
    }
    if (isSensitiveValue(arg)) {
      return redactValue(arg);
    }
    return arg;
  });
}

class Logger {
  private readonly prefix: string;
  private readonly isDevelopment: boolean;

  constructor(prefix: string = '[AINTIVIRUS]') {
    this.prefix = prefix;
    this.isDevelopment = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  }

  debug(...args: unknown[]): void {
    if (this.isDevelopment) {
      const redacted = formatArgs(...args);
    }
  }

  info(...args: unknown[]): void {
    const redacted = formatArgs(...args);
  }

  warn(...args: unknown[]): void {
    const redacted = formatArgs(...args);
    console.warn(this.prefix, '[WARN]', ...redacted);
  }

  error(...args: unknown[]): void {
    const redacted = formatArgs(...args);
    console.error(this.prefix, '[ERROR]', ...redacted);
  }

  unsafe(...args: unknown[]): void {}
}

export const logger = new Logger('[AINTIVIRUS]');

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

export { redactObject, redactValue, isSensitiveKey };
