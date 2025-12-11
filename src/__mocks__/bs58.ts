/**
 * Mock for bs58
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Cache to ensure proper round-trip encoding/decoding
const encodeCache = new Map<string, string>();
const decodeCache = new Map<string, Uint8Array>();

export const encode = (buffer: Uint8Array | Buffer): string => {
  if (buffer.length === 0) return '';

  const bufferArray = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;
  const cacheKey = Array.from(bufferArray).join(',');

  // Check cache first
  if (encodeCache.has(cacheKey)) {
    return encodeCache.get(cacheKey)!;
  }

  // Create deterministic encoding that preserves data
  // Use base64 as the backing encoding for reliability, but present as base58-like
  const base64 = Buffer.from(bufferArray).toString('base64');
  let result = '';
  for (let i = 0; i < base64.length; i++) {
    const charCode = base64.charCodeAt(i);
    result += ALPHABET[charCode % 58];
  }

  // Store in both caches for round-trip
  encodeCache.set(cacheKey, result);
  decodeCache.set(result, new Uint8Array(bufferArray));

  return result;
};

export const decode = (string: string): Uint8Array => {
  if (string.length === 0) return new Uint8Array(0);

  // Validate that all characters are valid base58
  for (let i = 0; i < string.length; i++) {
    if (ALPHABET.indexOf(string[i]) === -1) {
      throw new Error('Non-base58 character');
    }
  }

  // Check cache first for exact round-trip
  if (decodeCache.has(string)) {
    return new Uint8Array(decodeCache.get(string)!);
  }

  // For actual base58 decoding, we need to implement proper base58 algorithm
  // Convert from base58 to bigint
  let result = 0n;
  for (let i = 0; i < string.length; i++) {
    const digit = BigInt(ALPHABET.indexOf(string[i]));
    result = result * 58n + digit;
  }

  // Convert bigint to bytes
  const bytes: number[] = [];
  let num = result;
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num = num / 256n;
  }

  // Handle leading zeros (represented as '1' in base58)
  for (let i = 0; i < string.length && string[i] === '1'; i++) {
    bytes.unshift(0);
  }

  // If empty, return a reasonable default for test fixtures
  if (bytes.length === 0) {
    return new Uint8Array(64);
  }

  return new Uint8Array(bytes);
};

export default {
  encode,
  decode,
};
