/**
 * Monero Validation Tests
 */

import {
  isValidMoneroAddress,
  isValidViewKey,
  validateWatchOnlyConfig,
  getAddressType,
  maskAddress,
  maskViewKey,
} from '../validation';

describe('Monero Validation Utilities', () => {
  // Example addresses (for testing format only, not real funds)
  const VALID_MAINNET_ADDRESS =
    '4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx3skxNgYeYTRj5UzqtReoS44qo9mtmXCqY45DJ852K5Jv2684Rge';
  const VALID_TESTNET_ADDRESS =
    '9sB5Kn2Q9L3b7k9o4mC5f6d8j7G3h2M1n4K6p8L9o2R3t5Y7u8I9w1E2r4T6y8U0i';
  const INVALID_ADDRESS = 'notanaddress';

  // Example view key (64 hex chars)
  const VALID_VIEW_KEY = 'f2b9e0a1c3d5f7e8b0d2a4c6e8f0a2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6';
  const INVALID_VIEW_KEY = 'tooshort';

  describe('isValidMoneroAddress', () => {
    it('should validate mainnet addresses starting with 4', () => {
      expect(isValidMoneroAddress(VALID_MAINNET_ADDRESS, false)).toBe(true);
    });

    it('should reject addresses that dont start with 4 on mainnet', () => {
      expect(isValidMoneroAddress('3' + VALID_MAINNET_ADDRESS.slice(1), false)).toBe(false);
    });

    it('should reject empty addresses', () => {
      expect(isValidMoneroAddress('', false)).toBe(false);
    });

    it('should reject invalid addresses', () => {
      expect(isValidMoneroAddress(INVALID_ADDRESS, false)).toBe(false);
    });

    it('should reject addresses with invalid characters', () => {
      expect(isValidMoneroAddress(VALID_MAINNET_ADDRESS.replace('A', '0'), false)).toBe(false);
      expect(isValidMoneroAddress(VALID_MAINNET_ADDRESS.replace('B', 'O'), false)).toBe(false);
    });
  });

  describe('isValidViewKey', () => {
    it('should validate 64-character hex strings', () => {
      expect(isValidViewKey(VALID_VIEW_KEY)).toBe(true);
    });

    it('should reject view keys that are too short', () => {
      expect(isValidViewKey(INVALID_VIEW_KEY)).toBe(false);
    });

    it('should reject view keys that are too long', () => {
      expect(isValidViewKey(VALID_VIEW_KEY + 'aa')).toBe(false);
    });

    it('should reject empty view keys', () => {
      expect(isValidViewKey('')).toBe(false);
    });

    it('should reject non-hex characters', () => {
      expect(isValidViewKey(VALID_VIEW_KEY.replace('a', 'g'))).toBe(false);
    });

    it('should reject all-zero view keys', () => {
      expect(isValidViewKey('0'.repeat(64))).toBe(false);
    });
  });

  describe('validateWatchOnlyConfig', () => {
    it('should validate correct config', () => {
      const result = validateWatchOnlyConfig(VALID_MAINNET_ADDRESS, VALID_VIEW_KEY, false);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject missing address', () => {
      const result = validateWatchOnlyConfig('', VALID_VIEW_KEY, false);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Address is required');
    });

    it('should reject missing view key', () => {
      const result = validateWatchOnlyConfig(VALID_MAINNET_ADDRESS, '', false);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('View key is required');
    });

    it('should reject invalid address', () => {
      const result = validateWatchOnlyConfig(INVALID_ADDRESS, VALID_VIEW_KEY, false);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('address');
    });

    it('should reject invalid view key', () => {
      const result = validateWatchOnlyConfig(VALID_MAINNET_ADDRESS, INVALID_VIEW_KEY, false);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('view key');
    });
  });

  describe('getAddressType', () => {
    it('should identify standard addresses', () => {
      expect(getAddressType(VALID_MAINNET_ADDRESS)).toBe('Standard');
    });

    it('should identify integrated addresses', () => {
      // Integrated addresses start with 8
      const integratedAddress = '8' + VALID_MAINNET_ADDRESS.slice(1);
      expect(getAddressType(integratedAddress)).toBe('Integrated');
    });

    it('should identify testnet addresses', () => {
      expect(getAddressType('9' + 'a'.repeat(94))).toBe('Testnet/Stagenet');
      expect(getAddressType('A' + 'a'.repeat(94))).toBe('Testnet/Stagenet');
    });

    it('should return Unknown for invalid addresses', () => {
      expect(getAddressType('')).toBe('Unknown');
      expect(getAddressType('1' + 'a'.repeat(94))).toBe('Unknown');
    });
  });

  describe('maskAddress', () => {
    it('should mask long addresses', () => {
      const masked = maskAddress(VALID_MAINNET_ADDRESS);

      expect(masked).toContain('...');
      expect(masked.length).toBeLessThan(VALID_MAINNET_ADDRESS.length);
    });

    it('should show first and last parts', () => {
      const masked = maskAddress(VALID_MAINNET_ADDRESS);

      expect(masked.startsWith(VALID_MAINNET_ADDRESS.slice(0, 10))).toBe(true);
      expect(masked.endsWith(VALID_MAINNET_ADDRESS.slice(-10))).toBe(true);
    });

    it('should not mask short addresses', () => {
      const shortAddress = 'short';
      expect(maskAddress(shortAddress)).toBe(shortAddress);
    });
  });

  describe('maskViewKey', () => {
    it('should mask view keys', () => {
      const masked = maskViewKey(VALID_VIEW_KEY);

      expect(masked).toContain('...');
      expect(masked.length).toBeLessThan(VALID_VIEW_KEY.length);
    });

    it('should show first and last parts', () => {
      const masked = maskViewKey(VALID_VIEW_KEY);

      expect(masked.startsWith(VALID_VIEW_KEY.slice(0, 8))).toBe(true);
      expect(masked.endsWith(VALID_VIEW_KEY.slice(-8))).toBe(true);
    });

    it('should handle short keys', () => {
      expect(maskViewKey('short')).toBe('****');
    });
  });
});
