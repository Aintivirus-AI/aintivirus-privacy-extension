/**
 * Bitcoin Address Tests
 */

import {
  deriveBitcoinKeypair,
  getBitcoinAddressFromMnemonic,
  isValidBitcoinAddress,
  getAllBitcoinAddresses,
} from '../addresses';
import type { BitcoinChainId, BitcoinAddressType } from '../types';

// Test mnemonic (DO NOT USE IN PRODUCTION)
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Bitcoin Address Utilities', () => {
  describe('deriveBitcoinKeypair', () => {
    it('should derive a valid Bitcoin keypair', () => {
      const keypair = deriveBitcoinKeypair(TEST_MNEMONIC, 'bitcoin', 0);

      expect(keypair).toBeDefined();
      expect(keypair.address).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keypair.wif).toBeDefined();
      expect(keypair.addressType).toBe('native-segwit');
    });

    it('should derive different addresses for different indices', () => {
      const keypair0 = deriveBitcoinKeypair(TEST_MNEMONIC, 'bitcoin', 0);
      const keypair1 = deriveBitcoinKeypair(TEST_MNEMONIC, 'bitcoin', 1);

      expect(keypair0.address).not.toBe(keypair1.address);
    });

    it('should derive different addresses for different chains', () => {
      const btcKeypair = deriveBitcoinKeypair(TEST_MNEMONIC, 'bitcoin', 0);
      const ltcKeypair = deriveBitcoinKeypair(TEST_MNEMONIC, 'litecoin', 0);
      const bchKeypair = deriveBitcoinKeypair(TEST_MNEMONIC, 'bitcoincash', 0);

      expect(btcKeypair.address).not.toBe(ltcKeypair.address);
      expect(btcKeypair.address).not.toBe(bchKeypair.address);
      expect(ltcKeypair.address).not.toBe(bchKeypair.address);
    });

    it('should derive legacy addresses when specified', () => {
      const keypair = deriveBitcoinKeypair(TEST_MNEMONIC, 'bitcoin', 0, 'legacy');

      expect(keypair.address).toMatch(/^[13]/); // Legacy addresses start with 1 or 3
      expect(keypair.addressType).toBe('legacy');
    });

    it('should derive native segwit addresses for Bitcoin', () => {
      const keypair = deriveBitcoinKeypair(TEST_MNEMONIC, 'bitcoin', 0, 'native-segwit');

      expect(keypair.address).toMatch(/^bc1/); // Native SegWit addresses start with bc1
      expect(keypair.addressType).toBe('native-segwit');
    });
  });

  describe('getBitcoinAddressFromMnemonic', () => {
    it('should return a valid Bitcoin address', () => {
      const address = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'bitcoin', 0);

      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(20);
    });

    it('should return the same address for same parameters', () => {
      const address1 = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'bitcoin', 0);
      const address2 = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'bitcoin', 0);

      expect(address1).toBe(address2);
    });
  });

  describe('isValidBitcoinAddress', () => {
    it('should validate mainnet legacy addresses', () => {
      // Standard P2PKH addresses start with 1
      expect(isValidBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'bitcoin')).toBe(true);
    });

    it('should validate mainnet native segwit addresses', () => {
      // Native SegWit addresses start with bc1
      expect(isValidBitcoinAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'bitcoin')).toBe(
        true
      );
    });

    it('should reject invalid addresses', () => {
      expect(isValidBitcoinAddress('invalid', 'bitcoin')).toBe(false);
      expect(isValidBitcoinAddress('', 'bitcoin')).toBe(false);
      expect(isValidBitcoinAddress('0x123', 'bitcoin')).toBe(false);
    });

    it('should validate Litecoin addresses', () => {
      // Litecoin addresses start with L, M, or ltc1
      const address = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'litecoin', 0);
      expect(isValidBitcoinAddress(address, 'litecoin')).toBe(true);
    });
  });

  describe('getAllBitcoinAddresses', () => {
    it('should return all supported address types for Bitcoin', () => {
      const addresses = getAllBitcoinAddresses(TEST_MNEMONIC, 'bitcoin', 0);

      expect(addresses).toBeDefined();
      expect(Object.keys(addresses).length).toBeGreaterThan(0);
    });

    it('should return different addresses for each type', () => {
      const addresses = getAllBitcoinAddresses(TEST_MNEMONIC, 'bitcoin', 0);

      const addressList = Object.values(addresses);
      const uniqueAddresses = new Set(addressList);
      expect(uniqueAddresses.size).toBe(addressList.length);
    });
  });
});
