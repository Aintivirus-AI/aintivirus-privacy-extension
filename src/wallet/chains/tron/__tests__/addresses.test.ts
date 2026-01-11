/**
 * TRON Address Tests
 */

import {
  deriveTronKeypair,
  getTronAddressFromMnemonic,
  isValidTronAddress,
  addressToHex,
  hexToAddress,
} from '../addresses';

// Test mnemonic (DO NOT USE IN PRODUCTION)
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('TRON Address Utilities', () => {
  describe('deriveTronKeypair', () => {
    it('should derive a valid TRON keypair', () => {
      const keypair = deriveTronKeypair(TEST_MNEMONIC, 0);

      expect(keypair).toBeDefined();
      expect(keypair.address).toBeDefined();
      expect(keypair.hexAddress).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
    });

    it('should derive TRON addresses starting with T', () => {
      const keypair = deriveTronKeypair(TEST_MNEMONIC, 0);

      expect(keypair.address).toMatch(/^T/);
    });

    it('should derive different addresses for different indices', () => {
      const keypair0 = deriveTronKeypair(TEST_MNEMONIC, 0);
      const keypair1 = deriveTronKeypair(TEST_MNEMONIC, 1);

      expect(keypair0.address).not.toBe(keypair1.address);
    });

    it('should return consistent addresses for the same mnemonic and index', () => {
      const keypair1 = deriveTronKeypair(TEST_MNEMONIC, 0);
      const keypair2 = deriveTronKeypair(TEST_MNEMONIC, 0);

      expect(keypair1.address).toBe(keypair2.address);
      expect(keypair1.hexAddress).toBe(keypair2.hexAddress);
    });
  });

  describe('getTronAddressFromMnemonic', () => {
    it('should return a valid TRON address', () => {
      const address = getTronAddressFromMnemonic(TEST_MNEMONIC, 0);

      expect(address).toBeDefined();
      expect(address).toMatch(/^T/);
      expect(address.length).toBe(34);
    });
  });

  describe('isValidTronAddress', () => {
    it('should validate real TRON addresses', () => {
      // Well-known TRON addresses
      expect(isValidTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(true);
      expect(isValidTronAddress('TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S')).toBe(true);
    });

    it('should validate derived addresses', () => {
      const address = getTronAddressFromMnemonic(TEST_MNEMONIC, 0);
      expect(isValidTronAddress(address)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isValidTronAddress('')).toBe(false);
      expect(isValidTronAddress('invalid')).toBe(false);
      expect(isValidTronAddress('0x123456789')).toBe(false);
      expect(isValidTronAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false);
    });

    it('should reject addresses with wrong prefix', () => {
      expect(isValidTronAddress('AR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(false);
    });

    it('should reject addresses with wrong length', () => {
      expect(isValidTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6')).toBe(false);
      expect(isValidTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t1')).toBe(false);
    });
  });

  describe('addressToHex and hexToAddress', () => {
    it('should convert address to hex and back', () => {
      const address = getTronAddressFromMnemonic(TEST_MNEMONIC, 0);
      const hex = addressToHex(address);
      const recoveredAddress = hexToAddress(hex);

      expect(recoveredAddress).toBe(address);
    });

    it('should produce hex starting with 41', () => {
      const address = getTronAddressFromMnemonic(TEST_MNEMONIC, 0);
      const hex = addressToHex(address);

      expect(hex).toMatch(/^41/);
    });
  });
});
