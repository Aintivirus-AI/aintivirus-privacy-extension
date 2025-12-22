/**
 * Tests for wallet crypto functions
 */

import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomBytes,
  generateSalt,
  generateIV,
  deriveKeyFromPassword,
  encrypt,
  decrypt,
  clearSensitiveString,
  zeroOutArray,
  constantTimeEqual,
  constantTimeEqualBase64,
  validatePasswordStrength,
  getPasswordStrengthFeedback,
} from '../crypto';
import { WalletError, WalletErrorCode } from '../types';
import {
  TEST_STRONG_PASSWORD,
  TEST_WEAK_PASSWORD,
  TEST_NO_SPECIAL_PASSWORD,
  TEST_NO_UPPERCASE_PASSWORD,
  TEST_SHORT_PASSWORD,
} from '../../__tests__/utils/fixtures';

describe('Crypto', () => {
  describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
    it('should convert array buffer to base64 and back', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(restored).toEqual(original);
    });

    it('should handle empty buffer', () => {
      const original = new Uint8Array([]);
      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(restored).toEqual(original);
    });

    it('should handle large buffers', () => {
      const original = new Uint8Array(1000);
      for (let i = 0; i < 1000; i++) {
        original[i] = i % 256;
      }

      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(restored).toEqual(original);
    });
  });

  describe('generateRandomBytes', () => {
    it('should generate bytes of specified length', () => {
      const bytes = generateRandomBytes(32);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it('should generate different bytes on each call', () => {
      const bytes1 = generateRandomBytes(32);
      const bytes2 = generateRandomBytes(32);

      // Extremely unlikely to be equal
      expect(bytes1).not.toEqual(bytes2);
    });

    it('should handle various lengths', () => {
      expect(generateRandomBytes(1).length).toBe(1);
      expect(generateRandomBytes(16).length).toBe(16);
      expect(generateRandomBytes(64).length).toBe(64);
      expect(generateRandomBytes(128).length).toBe(128);
    });
  });

  describe('generateSalt', () => {
    it('should generate a base64 encoded salt', () => {
      const salt = generateSalt();

      expect(typeof salt).toBe('string');
      expect(salt.length).toBeGreaterThan(0);

      // Should be valid base64
      expect(() => base64ToArrayBuffer(salt)).not.toThrow();
    });

    it('should generate 32-byte salt (SALT_LENGTH)', () => {
      const salt = generateSalt();
      const decoded = base64ToArrayBuffer(salt);

      expect(decoded.byteLength).toBe(32);
    });

    it('should generate unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();

      expect(salt1).not.toBe(salt2);
    });
  });

  describe('generateIV', () => {
    it('should generate a base64 encoded IV', () => {
      const iv = generateIV();

      expect(typeof iv).toBe('string');
      expect(iv.length).toBeGreaterThan(0);

      // Should be valid base64
      expect(() => base64ToArrayBuffer(iv)).not.toThrow();
    });

    it('should generate 12-byte IV (IV_LENGTH)', () => {
      const iv = generateIV();
      const decoded = base64ToArrayBuffer(iv);

      expect(decoded.byteLength).toBe(12);
    });

    it('should generate unique IVs', () => {
      const iv1 = generateIV();
      const iv2 = generateIV();

      expect(iv1).not.toBe(iv2);
    });
  });

  describe('deriveKeyFromPassword', () => {
    it('should derive a CryptoKey from password and salt', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('should derive consistent keys from same password and salt', async () => {
      const salt = generateSalt();
      const key1 = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);
      const key2 = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      // Keys should be functionally equivalent (same encryption results)
      const iv = generateIV();
      const plaintext = 'test data';

      const encrypted1 = await encrypt(plaintext, key1, iv);
      const encrypted2 = await encrypt(plaintext, key2, iv);

      expect(encrypted1).toBe(encrypted2);
    });

    it('should derive different keys from different passwords', async () => {
      const salt = generateSalt();
      const key1 = await deriveKeyFromPassword('password1', salt);
      const key2 = await deriveKeyFromPassword('password2', salt);

      const iv = generateIV();
      const plaintext = 'test data';

      const encrypted1 = await encrypt(plaintext, key1, iv);
      const encrypted2 = await encrypt(plaintext, key2, iv);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should derive different keys from different salts', async () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const key1 = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt1);
      const key2 = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt2);

      const iv = generateIV();
      const plaintext = 'test data';

      const encrypted1 = await encrypt(plaintext, key1, iv);
      const encrypted2 = await encrypt(plaintext, key2, iv);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should support custom iteration counts', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt, 1000);

      expect(key).toBeDefined();
    });
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const plaintext = 'Hello, World!';
      const encrypted = await encrypt(plaintext, key, iv);
      const decrypted = await decrypt(encrypted, key, iv);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt to different ciphertext with different IVs', async () => {
      const salt = generateSalt();
      const iv1 = generateIV();
      const iv2 = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const plaintext = 'Hello, World!';
      const encrypted1 = await encrypt(plaintext, key, iv1);
      const encrypted2 = await encrypt(plaintext, key, iv2);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty strings', async () => {
      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const plaintext = '';
      const encrypted = await encrypt(plaintext, key, iv);
      const decrypted = await decrypt(encrypted, key, iv);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', async () => {
      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = await encrypt(plaintext, key, iv);
      const decrypted = await decrypt(encrypted, key, iv);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle large data', async () => {
      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const plaintext = 'a'.repeat(100000);
      const encrypted = await encrypt(plaintext, key, iv);
      const decrypted = await decrypt(encrypted, key, iv);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt with wrong key', async () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const iv = generateIV();
      const key1 = await deriveKeyFromPassword('password1', salt1);
      const key2 = await deriveKeyFromPassword('password2', salt2);

      const plaintext = 'Secret data';
      const encrypted = await encrypt(plaintext, key1, iv);

      await expect(decrypt(encrypted, key2, iv)).rejects.toThrow(WalletError);
    });

    it('should fail to decrypt with wrong IV', async () => {
      const salt = generateSalt();
      const iv1 = generateIV();
      const iv2 = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const plaintext = 'Secret data';
      const encrypted = await encrypt(plaintext, key, iv1);

      await expect(decrypt(encrypted, key, iv2)).rejects.toThrow(WalletError);
    });

    it('should throw DECRYPTION_FAILED error code', async () => {
      const salt = generateSalt();
      const iv = generateIV();
      const key1 = await deriveKeyFromPassword('password1', salt);
      const key2 = await deriveKeyFromPassword('password2', salt);

      const encrypted = await encrypt('data', key1, iv);

      try {
        await decrypt(encrypted, key2, iv);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WalletError);
        expect((error as WalletError).code).toBe(WalletErrorCode.DECRYPTION_FAILED);
      }
    });

    it('should handle JSON data (mnemonics)', async () => {
      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const encrypted = await encrypt(mnemonic, key, iv);
      const decrypted = await decrypt(encrypted, key, iv);

      expect(decrypted).toBe(mnemonic);
    });
  });

  describe('clearSensitiveString', () => {
    it('should return empty string', () => {
      const result = clearSensitiveString('sensitive data');
      expect(result).toBe('');
    });
  });

  describe('zeroOutArray', () => {
    it('should fill array with zeros', () => {
      const arr = new Uint8Array([1, 2, 3, 4, 5]);
      zeroOutArray(arr);

      expect(arr.every((b) => b === 0)).toBe(true);
    });

    it('should handle empty array', () => {
      const arr = new Uint8Array([]);
      expect(() => zeroOutArray(arr)).not.toThrow();
    });
  });

  describe('constantTimeEqual', () => {
    it('should return true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);

      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);

      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);

      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should handle empty arrays', () => {
      const a = new Uint8Array([]);
      const b = new Uint8Array([]);

      expect(constantTimeEqual(a, b)).toBe(true);
    });
  });

  describe('constantTimeEqualBase64', () => {
    it('should return true for equal base64 strings', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const base64 = arrayBufferToBase64(data.buffer);

      expect(constantTimeEqualBase64(base64, base64)).toBe(true);
    });

    it('should return false for different base64 strings', () => {
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([1, 2, 3, 4, 6]);
      const base64_1 = arrayBufferToBase64(data1.buffer);
      const base64_2 = arrayBufferToBase64(data2.buffer);

      expect(constantTimeEqualBase64(base64_1, base64_2)).toBe(false);
    });

    it('should return false for invalid base64', () => {
      expect(constantTimeEqualBase64('valid', 'not valid base64!!!')).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept strong password', () => {
      expect(validatePasswordStrength(TEST_STRONG_PASSWORD)).toBe(true);
    });

    it('should reject password too short', () => {
      expect(validatePasswordStrength(TEST_SHORT_PASSWORD)).toBe(false);
    });

    it('should reject password without special characters', () => {
      expect(validatePasswordStrength(TEST_NO_SPECIAL_PASSWORD)).toBe(false);
    });

    it('should reject password without uppercase', () => {
      expect(validatePasswordStrength(TEST_NO_UPPERCASE_PASSWORD)).toBe(false);
    });

    it('should reject password without lowercase', () => {
      expect(validatePasswordStrength('TESTPASSWORD123!')).toBe(false);
    });

    it('should reject password without numbers', () => {
      expect(validatePasswordStrength('TestPassword!')).toBe(false);
    });

    it('should accept various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '+', '='];

      specialChars.forEach((char) => {
        const password = `TestPass123${char}`;
        expect(validatePasswordStrength(password)).toBe(true);
      });
    });
  });

  describe('getPasswordStrengthFeedback', () => {
    it('should return valid=true for strong password', () => {
      const result = getPasswordStrengthFeedback(TEST_STRONG_PASSWORD);

      expect(result.valid).toBe(true);
    });

    it('should return weak for short password', () => {
      const result = getPasswordStrengthFeedback(TEST_WEAK_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.strength).toBe('weak');
      expect(result.message).toContain('at least');
    });

    it('should provide feedback for missing uppercase', () => {
      const result = getPasswordStrengthFeedback('testpassword123!');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('uppercase');
    });

    it('should provide feedback for missing lowercase', () => {
      const result = getPasswordStrengthFeedback('TESTPASSWORD123!');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('lowercase');
    });

    it('should provide feedback for missing number', () => {
      const result = getPasswordStrengthFeedback('TestPassword!!');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('number');
    });

    it('should provide feedback for missing special character', () => {
      const result = getPasswordStrengthFeedback(TEST_NO_SPECIAL_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('special');
    });

    it('should return strong for very long password with multiple special chars', () => {
      const result = getPasswordStrengthFeedback('MyVeryLongPassword123!!');

      expect(result.valid).toBe(true);
      expect(result.strength).toBe('strong');
    });

    it('should return good for strong password with one extra factor', () => {
      const result = getPasswordStrengthFeedback('TestPassword123!!');

      expect(result.valid).toBe(true);
      expect(['good', 'strong']).toContain(result.strength);
    });

    it('should return fair for minimum requirements', () => {
      const result = getPasswordStrengthFeedback('TestPass1!');

      expect(result.valid).toBe(true);
      expect(result.strength).toBe('fair');
    });
  });
});

