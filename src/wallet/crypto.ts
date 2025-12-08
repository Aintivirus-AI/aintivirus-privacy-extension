/**
 * AINTIVIRUS Wallet Module - Cryptographic Utilities
 * 
 * SECURITY CRITICAL: This module handles all encryption/decryption operations.
 * 
 * Implementation notes:
 * - Uses Web Crypto API (SubtleCrypto) for all cryptographic operations
 * - AES-256-GCM for authenticated encryption
 * - PBKDF2 with 100,000 iterations for key derivation
 * - All sensitive data should be cleared from memory after use
 * 
 * NEVER:
 * - Log any keys, passwords, or plaintext data
 * - Store unencrypted sensitive data
 * - Expose crypto internals to external code
 */

import {
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
  WalletError,
  WalletErrorCode,
} from './types';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert ArrayBuffer to base64 string
 * Used for storing binary data in chrome.storage
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 * Used for retrieving binary data from chrome.storage
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert string to ArrayBuffer (UTF-8)
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Convert ArrayBuffer to string (UTF-8)
 */
function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

// ============================================
// RANDOM GENERATION
// ============================================

/**
 * Generate cryptographically secure random bytes
 * 
 * SECURITY: Uses crypto.getRandomValues() which is cryptographically secure.
 * This is suitable for generating salts, IVs, and other security-critical values.
 * 
 * @param length - Number of random bytes to generate
 * @returns Uint8Array of random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generate a new salt for PBKDF2 key derivation
 * 
 * SECURITY: Each wallet should have a unique salt.
 * Salt is stored alongside ciphertext and is NOT secret,
 * but prevents rainbow table attacks.
 * 
 * @returns Base64-encoded salt string
 */
export function generateSalt(): string {
  const salt = generateRandomBytes(SALT_LENGTH);
  return arrayBufferToBase64(salt.buffer as ArrayBuffer);
}

/**
 * Generate a new IV for AES-GCM encryption
 * 
 * SECURITY: Each encryption operation MUST use a unique IV.
 * IV is stored alongside ciphertext and is NOT secret,
 * but reusing an IV with the same key completely breaks security.
 * 
 * @returns Base64-encoded IV string
 */
export function generateIV(): string {
  const iv = generateRandomBytes(IV_LENGTH);
  return arrayBufferToBase64(iv.buffer as ArrayBuffer);
}

// ============================================
// KEY DERIVATION
// ============================================

/**
 * Derive an AES-256 key from a password using PBKDF2
 * 
 * SECURITY: This is the critical function that converts a user password
 * into a cryptographic key. The high iteration count (100,000) makes
 * brute-force attacks expensive.
 * 
 * WARNING: The derived key is sensitive and should be:
 * - Used immediately for encryption/decryption
 * - Never stored or logged
 * - Cleared from memory when no longer needed
 * 
 * @param password - User's password (SENSITIVE)
 * @param saltBase64 - Base64-encoded salt
 * @returns CryptoKey for AES-GCM operations
 */
export async function deriveKeyFromPassword(
  password: string,
  saltBase64: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  // SECURITY: Convert password to key material
  // The password string is converted to bytes for PBKDF2
  const passwordBuffer = stringToArrayBuffer(password);
  const salt = base64ToArrayBuffer(saltBase64);

  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false, // not extractable
    ['deriveKey']
  );

  // Derive AES-256-GCM key using PBKDF2
  // SECURITY: Higher iterations = stronger protection against brute-force
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256, // 256-bit key for AES-256
    },
    false, // not extractable - key cannot be exported
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

// ============================================
// ENCRYPTION / DECRYPTION
// ============================================

/**
 * Encrypt plaintext using AES-256-GCM
 * 
 * SECURITY: AES-GCM provides both confidentiality and authenticity.
 * The authentication tag is automatically included in the ciphertext.
 * Any tampering with the ciphertext will cause decryption to fail.
 * 
 * @param plaintext - Data to encrypt (SENSITIVE - e.g., mnemonic)
 * @param key - AES key derived from password (SENSITIVE)
 * @param ivBase64 - Base64-encoded IV (must be unique per encryption)
 * @returns Base64-encoded ciphertext
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
  ivBase64: string
): Promise<string> {
  try {
    const iv = base64ToArrayBuffer(ivBase64);
    const plaintextBuffer = stringToArrayBuffer(plaintext);

    // SECURITY: AES-GCM encryption with 128-bit authentication tag
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128, // 128-bit auth tag (recommended)
      },
      key,
      plaintextBuffer
    );

    return arrayBufferToBase64(ciphertext);
  } catch (error) {
    // SECURITY: Don't expose internal error details
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to encrypt data'
    );
  }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * 
 * SECURITY: Decryption will fail if:
 * - Wrong password (wrong key)
 * - Ciphertext was tampered with
 * - Wrong IV
 * 
 * This provides protection against both wrong passwords and data corruption.
 * 
 * WARNING: The returned plaintext is SENSITIVE (e.g., mnemonic)
 * and should be cleared from memory after use.
 * 
 * @param ciphertextBase64 - Base64-encoded ciphertext
 * @param key - AES key derived from password (SENSITIVE)
 * @param ivBase64 - Base64-encoded IV used during encryption
 * @returns Decrypted plaintext (SENSITIVE)
 */
export async function decrypt(
  ciphertextBase64: string,
  key: CryptoKey,
  ivBase64: string
): Promise<string> {
  try {
    const iv = base64ToArrayBuffer(ivBase64);
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);

    // SECURITY: AES-GCM decryption with authentication verification
    // If the auth tag doesn't match, this will throw an error
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      key,
      ciphertext
    );

    return arrayBufferToString(plaintextBuffer);
  } catch (error) {
    // SECURITY: Decryption failure could mean wrong password or tampered data
    // Don't distinguish between these to prevent oracle attacks
    throw new WalletError(
      WalletErrorCode.DECRYPTION_FAILED,
      'Failed to decrypt data. Wrong password or corrupted data.'
    );
  }
}

// ============================================
// SECURE MEMORY OPERATIONS
// ============================================

/**
 * Attempt to clear sensitive data from a string
 * 
 * SECURITY NOTE: JavaScript strings are immutable, so we cannot truly
 * "clear" them from memory. This function is a best-effort approach.
 * The V8 garbage collector will eventually reclaim the memory.
 * 
 * For truly sensitive operations, consider using Uint8Array which
 * can be explicitly zeroed.
 * 
 * @param sensitiveData - Reference to sensitive string (will be reassigned)
 * @returns Empty string
 */
export function clearSensitiveString(sensitiveData: string): string {
  // SECURITY: We can't truly clear strings in JS, but we can:
  // 1. Return empty string for reassignment
  // 2. Rely on GC to reclaim memory
  // 3. Minimize time sensitive data exists in memory
  return '';
}

/**
 * Zero out a Uint8Array
 * 
 * SECURITY: Unlike strings, Uint8Arrays can be explicitly zeroed.
 * Use this for any sensitive binary data.
 * 
 * @param array - Array to zero out (modified in place)
 */
export function zeroOutArray(array: Uint8Array): void {
  // SECURITY: Fill with zeros to remove sensitive data from memory
  array.fill(0);
}

// ============================================
// CONSTANT-TIME COMPARISON
// ============================================

/**
 * Compare two Uint8Array buffers in constant time
 * 
 * SECURITY: This function prevents timing side-channel attacks when
 * comparing sensitive values like password hashes or verifiers.
 * 
 * Regular comparison (===) or byte-by-byte comparison with early exit
 * can leak information about which bytes match through timing differences.
 * 
 * This function always compares all bytes regardless of mismatches,
 * making timing attacks infeasible.
 * 
 * @param a - First buffer to compare
 * @param b - Second buffer to compare
 * @returns True if buffers are equal, false otherwise
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Different lengths cannot be equal
  // Note: Length comparison itself may leak length info, but this is
  // acceptable as password hashes should have fixed length
  if (a.length !== b.length) {
    return false;
  }
  
  // XOR all bytes together - if any differ, result will be non-zero
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  // Only return true if all bytes matched (result is 0)
  return result === 0;
}

/**
 * Compare two base64-encoded strings in constant time
 * 
 * SECURITY: Wrapper for constantTimeEqual that works with base64 strings.
 * 
 * @param a - First base64 string
 * @param b - Second base64 string
 * @returns True if strings represent equal data
 */
export function constantTimeEqualBase64(a: string, b: string): boolean {
  try {
    const aBytes = new Uint8Array(base64ToArrayBuffer(a));
    const bBytes = new Uint8Array(base64ToArrayBuffer(b));
    return constantTimeEqual(aBytes, bBytes);
  } catch {
    // If decoding fails, they're not equal
    return false;
  }
}

// ============================================
// VALIDATION
// ============================================

/**
 * Minimum password length
 * SECURITY: 10 characters provides better protection against brute force
 */
const MIN_PASSWORD_LENGTH = 10;

/**
 * Special characters pattern for password validation
 */
const SPECIAL_CHARS_PATTERN = /[!@#$%^&*(),.?":{}|<>\-_+=[\]\\;'`~]/;

/**
 * Validate password meets minimum requirements
 * 
 * SECURITY: Strong password requirements to protect wallet:
 * - Minimum 10 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * 
 * Combined with PBKDF2 iterations, this makes brute-force infeasible.
 * 
 * @param password - Password to validate
 * @returns True if password meets requirements
 */
export function validatePasswordStrength(password: string): boolean {
  // Minimum 10 characters
  if (password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }
  
  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return false;
  }
  
  // At least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return false;
  }
  
  // At least one number
  if (!/\d/.test(password)) {
    return false;
  }
  
  // At least one special character
  if (!SPECIAL_CHARS_PATTERN.test(password)) {
    return false;
  }
  
  return true;
}

/**
 * Get password strength feedback
 * 
 * @param password - Password to analyze
 * @returns Object with validation result and message
 */
export function getPasswordStrengthFeedback(password: string): {
  valid: boolean;
  message: string;
  strength: 'weak' | 'fair' | 'good' | 'strong';
} {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { 
      valid: false, 
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      strength: 'weak'
    };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one uppercase letter',
      strength: 'weak'
    };
  }
  
  if (!/[a-z]/.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one lowercase letter',
      strength: 'weak'
    };
  }
  
  if (!/\d/.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one number',
      strength: 'weak'
    };
  }
  
  if (!SPECIAL_CHARS_PATTERN.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one special character (!@#$%^&* etc.)',
      strength: 'weak'
    };
  }
  
  // Additional strength indicators for feedback
  const isVeryLong = password.length >= 16;
  const hasMultipleSpecial = (password.match(SPECIAL_CHARS_PATTERN) || []).length >= 2;
  const hasMultipleNumbers = (password.match(/\d/g) || []).length >= 2;
  
  const strengthFactors = [isVeryLong, hasMultipleSpecial, hasMultipleNumbers].filter(Boolean).length;
  
  if (strengthFactors >= 2) {
    return { valid: true, message: 'Very strong password', strength: 'strong' };
  } else if (strengthFactors >= 1) {
    return { valid: true, message: 'Strong password', strength: 'good' };
  }
  
  return { valid: true, message: 'Password meets requirements', strength: 'fair' };
}

