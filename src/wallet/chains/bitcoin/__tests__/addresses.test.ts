/**
 * Bitcoin Address Tests
 */

import {
  deriveBitcoinKeypair,
  getBitcoinAddressFromMnemonic,
  isValidBitcoinAddress,
  getAllBitcoinAddresses,
  legacyToCashAddr,
  cashAddrToLegacy,
  decodeCashAddr,
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

    it('should validate Zcash transparent addresses', () => {
      // Zcash transparent P2PKH addresses start with t1
      // Zcash transparent P2SH addresses start with t3
      expect(isValidBitcoinAddress('t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs', 'zcash')).toBe(true);
      expect(isValidBitcoinAddress('t3Vz22vK5z2LcKEdg16Yv4FFneEL1zg9ojd', 'zcash')).toBe(true);
    });

    it('should reject invalid Zcash addresses', () => {
      // Bitcoin addresses should not validate as Zcash
      expect(isValidBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'zcash')).toBe(false);
      // Address starting with '2' (Bitcoin testnet) should not validate as Zcash mainnet
      expect(isValidBitcoinAddress('2H3LH7ve7FmWZqShKVzS9FU9c1pDAifVLg', 'zcash')).toBe(false);
      // Invalid Zcash formats
      expect(isValidBitcoinAddress('z1abc', 'zcash')).toBe(false);
    });
  });

  describe('Zcash-specific address tests', () => {
    it('should derive Zcash addresses starting with t1', () => {
      const keypair = deriveBitcoinKeypair(TEST_MNEMONIC, 'zcash', 0, 'legacy');
      
      expect(keypair.address).toMatch(/^t1/); // Zcash P2PKH addresses start with t1
      expect(keypair.addressType).toBe('legacy');
    });

    it('should generate valid Zcash address from mnemonic', () => {
      const address = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'zcash', 0);
      
      expect(address).toBeDefined();
      expect(address).toMatch(/^t1/); // Should start with t1 (P2PKH)
      expect(isValidBitcoinAddress(address, 'zcash')).toBe(true);
    });

    it('should generate different Zcash addresses for different indices', () => {
      const address0 = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'zcash', 0);
      const address1 = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'zcash', 1);
      
      expect(address0).not.toBe(address1);
      expect(address0).toMatch(/^t1/);
      expect(address1).toMatch(/^t1/);
    });

    it('should validate generated Zcash addresses', () => {
      const address = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'zcash', 0);
      expect(isValidBitcoinAddress(address, 'zcash')).toBe(true);
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

  describe('Bitcoin Cash CashAddr conversion', () => {
    it('should convert a legacy P2PKH address to CashAddr format', () => {
      // Known test vector: legacy -> CashAddr
      const legacyAddress = '1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu';
      const cashAddr = legacyToCashAddr(legacyAddress);
      
      expect(cashAddr).toBeDefined();
      expect(cashAddr).toMatch(/^bitcoincash:q/); // P2PKH CashAddr starts with q
    });

    it('should convert a legacy P2SH address to CashAddr format', () => {
      // P2SH address (starts with 3)
      const legacyAddress = '3CWFddi6m4ndiGyKqzYvsFYagqDLPVMTzC';
      const cashAddr = legacyToCashAddr(legacyAddress);
      
      expect(cashAddr).toBeDefined();
      expect(cashAddr).toMatch(/^bitcoincash:p/); // P2SH CashAddr starts with p
    });

    it('should round-trip convert legacy to CashAddr and back', () => {
      const originalLegacy = '1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu';
      const cashAddr = legacyToCashAddr(originalLegacy);
      const convertedBack = cashAddrToLegacy(cashAddr);
      
      expect(convertedBack).toBe(originalLegacy);
    });

    it('should decode CashAddr to get hash and type', () => {
      const legacyAddress = '1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu';
      const cashAddr = legacyToCashAddr(legacyAddress);
      const decoded = decodeCashAddr(cashAddr);
      
      expect(decoded.type).toBe('P2PKH');
      expect(decoded.prefix).toBe('bitcoincash');
      expect(decoded.hash.length).toBe(20);
    });

    it('should handle CashAddr with or without prefix', () => {
      const legacyAddress = '1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu';
      const cashAddrFull = legacyToCashAddr(legacyAddress);
      const cashAddrNoPrefix = cashAddrFull.replace('bitcoincash:', '');
      
      // Both should decode to the same hash
      const decodedFull = decodeCashAddr(cashAddrFull);
      const decodedNoPrefix = decodeCashAddr(cashAddrNoPrefix);
      
      expect(decodedFull.hash).toEqual(decodedNoPrefix.hash);
      expect(decodedFull.type).toBe(decodedNoPrefix.type);
    });

    it('should convert BCH addresses from test mnemonic', () => {
      // Get a BCH address from our test mnemonic
      const bchAddress = getBitcoinAddressFromMnemonic(TEST_MNEMONIC, 'bitcoincash', 0);
      
      // It should be in legacy format (starts with 1)
      expect(bchAddress).toMatch(/^[13]/);
      
      // Convert to CashAddr
      const cashAddr = legacyToCashAddr(bchAddress);
      expect(cashAddr).toMatch(/^bitcoincash:[qp]/);
      
      // Convert back
      const legacyBack = cashAddrToLegacy(cashAddr);
      expect(legacyBack).toBe(bchAddress);
    });

    it('should throw on invalid legacy address', () => {
      expect(() => legacyToCashAddr('invalid')).toThrow();
      expect(() => legacyToCashAddr('')).toThrow();
    });

    it('should throw on invalid CashAddr', () => {
      expect(() => decodeCashAddr('bitcoincash:invalid123')).toThrow();
    });
  });
});
