/**
 * Common test utilities and helpers
 */

import { act } from '@testing-library/react';

/**
 * Wait for a specified duration
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Create a deferred promise for testing async operations
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
} {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

/**
 * Mock a function to throw an error
 */
export function mockToThrow(fn: jest.Mock, error: Error): void {
  fn.mockImplementation(() => {
    throw error;
  });
}

/**
 * Mock a function to reject with an error
 */
export function mockToReject(fn: jest.Mock, error: Error): void {
  fn.mockRejectedValue(error);
}

/**
 * Create a mock event
 */
export function createMockEvent<T extends object>(overrides?: Partial<T>): T {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    ...overrides,
  } as T;
}

/**
 * Create a mock keyboard event
 */
export function createMockKeyboardEvent(
  key: string,
  options?: Partial<KeyboardEvent>,
): Partial<KeyboardEvent> {
  return {
    key,
    code: key,
    keyCode: key.charCodeAt(0),
    which: key.charCodeAt(0),
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    ...options,
  };
}

/**
 * Create a mock mouse event
 */
export function createMockMouseEvent(options?: Partial<MouseEvent>): Partial<MouseEvent> {
  return {
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    ...options,
  };
}

/**
 * Assert that a promise rejects with a specific error
 */
export async function expectToReject(
  promise: Promise<unknown>,
  expectedError?: string | RegExp | Error,
): Promise<void> {
  try {
    await promise;
    fail('Expected promise to reject');
  } catch (error) {
    if (expectedError) {
      if (expectedError instanceof Error) {
        expect(error).toBeInstanceOf(expectedError.constructor);
        expect((error as Error).message).toBe(expectedError.message);
      } else if (typeof expectedError === 'string') {
        expect((error as Error).message).toContain(expectedError);
      } else {
        expect((error as Error).message).toMatch(expectedError);
      }
    }
  }
}

/**
 * Create a mock fetch response
 */
export function createMockFetchResponse<T>(
  data: T,
  options?: { status?: number; ok?: boolean; headers?: Record<string, string> },
): Response {
  const { status = 200, ok = true, headers = {} } = options || {};

  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers(headers),
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    blob: jest.fn().mockResolvedValue(new Blob([JSON.stringify(data)])),
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    clone: jest.fn().mockReturnThis(),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic',
    url: 'https://example.com',
    formData: jest.fn(),
    bytes: jest.fn(),
  } as unknown as Response;
}

/**
 * Setup fetch mock
 */
export function setupFetchMock(responses: Map<string | RegExp, Response>): void {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    for (const [pattern, response] of responses) {
      if (typeof pattern === 'string' && url.includes(pattern)) {
        return Promise.resolve(response);
      } else if (pattern instanceof RegExp && pattern.test(url)) {
        return Promise.resolve(response);
      }
    }
    return Promise.reject(new Error(`No mock for URL: ${url}`));
  });
}

/**
 * Reset all mocks
 */
export function resetAllMocks(): void {
  jest.clearAllMocks();
  jest.resetAllMocks();
}

/**
 * Spy on console methods
 */
export function spyOnConsole(): {
  log: jest.SpyInstance;
  warn: jest.SpyInstance;
  error: jest.SpyInstance;
  info: jest.SpyInstance;
} {
  return {
    log: jest.spyOn(console, 'log').mockImplementation(),
    warn: jest.spyOn(console, 'warn').mockImplementation(),
    error: jest.spyOn(console, 'error').mockImplementation(),
    info: jest.spyOn(console, 'info').mockImplementation(),
  };
}

/**
 * Create a type-safe mock function
 */
export function createTypedMock<T extends (...args: any[]) => any>(): jest.Mock<
  ReturnType<T>,
  Parameters<T>
> {
  return jest.fn<ReturnType<T>, Parameters<T>>();
}

/**
 * Wait for element to appear in DOM
 */
export async function waitForElement(
  selector: string,
  container: Element = document.body,
  timeout: number = 5000,
): Promise<Element | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = container.querySelector(selector);
    if (element) {
      return element;
    }
    await waitFor(50);
  }

  return null;
}

/**
 * Generate a random hex string
 */
export function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a random address-like string
 */
export function randomAddress(type: 'evm' | 'solana'): string {
  if (type === 'evm') {
    return '0x' + randomHex(40);
  }
  // Base58 characters (excluding 0, O, I, l)
  const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += base58Chars[Math.floor(Math.random() * base58Chars.length)];
  }
  return result;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Create a partial mock that preserves types
 */
export function createPartialMock<T>(overrides: Partial<T>): T {
  return overrides as T;
}

/**
 * Assert object contains subset of properties
 */
export function expectToContainSubset<T extends object>(actual: T, expected: Partial<T>): void {
  Object.keys(expected).forEach((key) => {
    expect(actual[key as keyof T]).toEqual(expected[key as keyof T]);
  });
}

/**
 * Create mock for TextEncoder/TextDecoder (useful for Node.js env)
 */
export function setupTextEncoderMock(): void {
  if (typeof TextEncoder === 'undefined') {
    (global as any).TextEncoder = class {
      encode(str: string): Uint8Array {
        const arr = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
          arr[i] = str.charCodeAt(i);
        }
        return arr;
      }
    };
  }

  if (typeof TextDecoder === 'undefined') {
    (global as any).TextDecoder = class {
      decode(arr: Uint8Array): string {
        return String.fromCharCode(...arr);
      }
    };
  }
}

/**
 * Mock the crypto API for Node.js testing environment
 */
export function setupCryptoMock(): void {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    const nodeCrypto = require('crypto');

    (global as any).crypto = {
      getRandomValues: (arr: Uint8Array) => {
        return nodeCrypto.randomFillSync(arr);
      },
      subtle: nodeCrypto.webcrypto?.subtle,
      randomUUID: () => nodeCrypto.randomUUID(),
    };
  }
}

/**
 * Wrapper to test async function with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage = 'Operation timed out',
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

