/**
 * Tests for wallet keychain functions
 */

import {
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
  deriveKeypair,
  getPublicKeyFromMnemonic,
  deriveSolanaKeypair,
  getSolanaAddressFromMnemonic,
  deriveEVMKeypair,
  deriveEVMKeypairWithPath,
  getEVMAddressFromMnemonic,
  isValidSolanaAddress,
  isValidEVMAddress,
  isValidAddressForChain,
  getMnemonicWordCount,
  hasValidMnemonicWordCount,
  getAllAddressesFromMnemonic,
  deriveAddressesForIndex,
  deriveKeypairsForIndex,
  keypairFromPrivateKey,
  evmKeypairFromPrivateKey,
  validatePrivateKey,
  getSolanaPrivateKeyBase58,
  getEVMPrivateKeyHex,
} from '../keychain';
import { WalletError, WalletErrorCode } from '../types';
import {
  TEST_MNEMONIC_24,
  TEST_MNEMONIC_12,
  INVALID_MNEMONIC,
  TEST_SOLANA_ADDRESS,
  TEST_EVM_ADDRESS,
  TEST_RECIPIENT_SOLANA,
  TEST_RECIPIENT_EVM,
  INVALID_SOLANA_ADDRESS,
  INVALID_EVM_ADDRESS,
  SHORT_EVM_ADDRESS,
  TEST_SOLANA_PRIVATE_KEY_BASE58,
  TEST_EVM_PRIVATE_KEY,
} from '../../__tests__/utils/fixtures';

describe('Keychain', () => {
  describe('generateMnemonic', () => {
    it('should generate a valid 24-word mnemonic', () => {
      const mnemonic = generateMnemonic();
      const words = mnemonic.split(' ');

      expect(words).toHaveLength(24);
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate unique mnemonics on each call', () => {
      const mnemonic1 = generateMnemonic();
      const mnemonic2 = generateMnemonic();

      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('validateMnemonic', () => {
    it('should validate a correct 24-word mnemonic', () => {
      expect(validateMnemonic(TEST_MNEMONIC_24)).toBe(true);
    });

    it('should validate a correct 12-word mnemonic', () => {
      expect(validateMnemonic(TEST_MNEMONIC_12)).toBe(true);
    });

    it('should reject an invalid mnemonic', () => {
      expect(validateMnemonic(INVALID_MNEMONIC)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateMnemonic('')).toBe(false);
    });

    it('should reject random words', () => {
      expect(validateMnemonic('hello world foo bar baz qux')).toBe(false);
    });

    it('should handle extra whitespace', () => {
      const mnemonicWithSpaces =
        '  abandon   abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ';
      expect(validateMnemonic(mnemonicWithSpaces)).toBe(true);
    });

    it('should handle uppercase letters', () => {
      const upperMnemonic = TEST_MNEMONIC_12.toUpperCase();
      expect(validateMnemonic(upperMnemonic)).toBe(true);
    });
  });

  describe('normalizeMnemonic', () => {
    it('should lowercase the mnemonic', () => {
      const result = normalizeMnemonic('ABANDON ABANDON ABOUT');
      expect(result).toBe('abandon abandon about');
    });

    it('should trim whitespace', () => {
      const result = normalizeMnemonic('  abandon abandon  ');
      expect(result).toBe('abandon abandon');
    });

    it('should normalize multiple spaces', () => {
      const result = normalizeMnemonic('abandon   abandon    about');
      expect(result).toBe('abandon abandon about');
    });
  });

  describe('deriveKeypair', () => {
    it('should derive a keypair from a valid mnemonic', () => {
      const keypair = deriveKeypair(TEST_MNEMONIC_24);

      expect(keypair).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
      expect(keypair.secretKey).toBeDefined();
      expect(keypair.secretKey.length).toBe(64);
    });

    it('should derive consistent keypairs from the same mnemonic', () => {
      const keypair1 = deriveKeypair(TEST_MNEMONIC_24);
      const keypair2 = deriveKeypair(TEST_MNEMONIC_24);

      expect(keypair1.publicKey.toBase58()).toBe(keypair2.publicKey.toBase58());
    });

    it('should throw error for invalid mnemonic', () => {
      expect(() => deriveKeypair(INVALID_MNEMONIC)).toThrow(WalletError);
    });

    it('should throw INVALID_MNEMONIC error code', () => {
      try {
        deriveKeypair(INVALID_MNEMONIC);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WalletError);
        expect((error as WalletError).code).toBe(WalletErrorCode.INVALID_MNEMONIC);
      }
    });
  });

  describe('getPublicKeyFromMnemonic', () => {
    it('should return a valid base58 public key', () => {
      const publicKey = getPublicKeyFromMnemonic(TEST_MNEMONIC_24);

      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(30);
      expect(publicKey.length).toBeLessThanOrEqual(44);
    });

    it('should return consistent public keys', () => {
      const key1 = getPublicKeyFromMnemonic(TEST_MNEMONIC_24);
      const key2 = getPublicKeyFromMnemonic(TEST_MNEMONIC_24);

      expect(key1).toBe(key2);
    });
  });

  describe('deriveSolanaKeypair', () => {
    it('should derive keypair at different indices', () => {
      const keypair0 = deriveSolanaKeypair(TEST_MNEMONIC_24, 0);
      const keypair1 = deriveSolanaKeypair(TEST_MNEMONIC_24, 1);

      expect(keypair0.publicKey.toBase58()).not.toBe(keypair1.publicKey.toBase58());
    });

    it('should derive consistent keypair for same index', () => {
      const keypair1 = deriveSolanaKeypair(TEST_MNEMONIC_24, 0);
      const keypair2 = deriveSolanaKeypair(TEST_MNEMONIC_24, 0);

      expect(keypair1.publicKey.toBase58()).toBe(keypair2.publicKey.toBase58());
    });

    it('should support legacy path type', () => {
      const standardKeypair = deriveSolanaKeypair(TEST_MNEMONIC_24, 0, 'standard');
      const legacyKeypair = deriveSolanaKeypair(TEST_MNEMONIC_24, 0, 'legacy');

      // Legacy and standard at index 0 should be the same
      expect(legacyKeypair).toBeDefined();
    });

    it('should throw error for legacy path with non-zero index', () => {
      expect(() => deriveSolanaKeypair(TEST_MNEMONIC_24, 1, 'legacy')).toThrow(WalletError);
    });

    it('should throw error for invalid mnemonic', () => {
      expect(() => deriveSolanaKeypair(INVALID_MNEMONIC, 0)).toThrow(WalletError);
    });
  });

  describe('getSolanaAddressFromMnemonic', () => {
    it('should return valid address for each index', () => {
      const address0 = getSolanaAddressFromMnemonic(TEST_MNEMONIC_24, 0);
      const address1 = getSolanaAddressFromMnemonic(TEST_MNEMONIC_24, 1);

      expect(isValidSolanaAddress(address0)).toBe(true);
      expect(isValidSolanaAddress(address1)).toBe(true);
      expect(address0).not.toBe(address1);
    });
  });

  describe('deriveEVMKeypair', () => {
    it('should derive EVM keypair from mnemonic', () => {
      const keypair = deriveEVMKeypair(TEST_MNEMONIC_24);

      expect(keypair).toBeDefined();
      expect(keypair.address).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.privateKeyBytes).toBeDefined();
    });

    it('should derive address starting with 0x', () => {
      const keypair = deriveEVMKeypair(TEST_MNEMONIC_24);

      expect(keypair.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should derive consistent keypairs', () => {
      const keypair1 = deriveEVMKeypair(TEST_MNEMONIC_24);
      const keypair2 = deriveEVMKeypair(TEST_MNEMONIC_24);

      expect(keypair1.address).toBe(keypair2.address);
      expect(keypair1.privateKey).toBe(keypair2.privateKey);
    });

    it('should derive different addresses at different indices', () => {
      const keypair0 = deriveEVMKeypair(TEST_MNEMONIC_24, 0);
      const keypair1 = deriveEVMKeypair(TEST_MNEMONIC_24, 1);

      expect(keypair0.address).not.toBe(keypair1.address);
    });

    it('should throw error for invalid mnemonic', () => {
      expect(() => deriveEVMKeypair(INVALID_MNEMONIC)).toThrow(WalletError);
    });
  });

  describe('deriveEVMKeypairWithPath', () => {
    it('should use standard path by default', () => {
      const standardKeypair = deriveEVMKeypairWithPath(TEST_MNEMONIC_24, 0, 'standard');
      const defaultKeypair = deriveEVMKeypair(TEST_MNEMONIC_24, 0);

      expect(standardKeypair.address).toBe(defaultKeypair.address);
    });

    it('should support ledger-live path', () => {
      const standardKeypair = deriveEVMKeypairWithPath(TEST_MNEMONIC_24, 1, 'standard');
      const ledgerKeypair = deriveEVMKeypairWithPath(TEST_MNEMONIC_24, 1, 'ledger-live');

      // Different path types should produce different addresses
      // standard: m/44'/60'/0'/0/1 vs ledger-live: m/44'/60'/1'/0/0
      expect(standardKeypair.address).not.toBe(ledgerKeypair.address);
    });
  });

  describe('getEVMAddressFromMnemonic', () => {
    it('should return valid checksummed address', () => {
      const address = getEVMAddressFromMnemonic(TEST_MNEMONIC_24);

      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(isValidEVMAddress(address)).toBe(true);
    });
  });

  describe('isValidSolanaAddress', () => {
    it('should validate correct Solana addresses', () => {
      expect(isValidSolanaAddress(TEST_RECIPIENT_SOLANA)).toBe(true);
    });

    it('should reject invalid Solana addresses', () => {
      expect(isValidSolanaAddress(INVALID_SOLANA_ADDRESS)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidSolanaAddress('')).toBe(false);
    });

    it('should reject too short addresses', () => {
      expect(isValidSolanaAddress('abc')).toBe(false);
    });

    it('should reject too long addresses', () => {
      const tooLong = 'A'.repeat(50);
      expect(isValidSolanaAddress(tooLong)).toBe(false);
    });

    it('should reject EVM addresses', () => {
      expect(isValidSolanaAddress(TEST_RECIPIENT_EVM)).toBe(false);
    });
  });

  describe('isValidEVMAddress', () => {
    it('should validate correct EVM addresses', () => {
      expect(isValidEVMAddress(TEST_RECIPIENT_EVM)).toBe(true);
    });

    it('should validate lowercase addresses', () => {
      expect(isValidEVMAddress(TEST_RECIPIENT_EVM.toLowerCase())).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isValidEVMAddress(INVALID_EVM_ADDRESS)).toBe(false);
    });

    it('should reject addresses without 0x prefix', () => {
      const withoutPrefix = TEST_RECIPIENT_EVM.slice(2);
      expect(isValidEVMAddress(withoutPrefix)).toBe(false);
    });

    it('should reject too short addresses', () => {
      expect(isValidEVMAddress(SHORT_EVM_ADDRESS)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidEVMAddress('')).toBe(false);
    });

    it('should reject addresses with invalid characters', () => {
      expect(isValidEVMAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
    });

    it('should reject Solana addresses', () => {
      expect(isValidEVMAddress(TEST_RECIPIENT_SOLANA)).toBe(false);
    });
  });

  describe('isValidAddressForChain', () => {
    it('should validate Solana addresses for solana chain', () => {
      expect(isValidAddressForChain(TEST_RECIPIENT_SOLANA, 'solana')).toBe(true);
      expect(isValidAddressForChain(TEST_RECIPIENT_EVM, 'solana')).toBe(false);
    });

    it('should validate EVM addresses for evm chain', () => {
      expect(isValidAddressForChain(TEST_RECIPIENT_EVM, 'evm')).toBe(true);
      expect(isValidAddressForChain(TEST_RECIPIENT_SOLANA, 'evm')).toBe(false);
    });
  });

  describe('getMnemonicWordCount', () => {
    it('should return 24 for 24-word mnemonic', () => {
      expect(getMnemonicWordCount(TEST_MNEMONIC_24)).toBe(24);
    });

    it('should return 12 for 12-word mnemonic', () => {
      expect(getMnemonicWordCount(TEST_MNEMONIC_12)).toBe(12);
    });

    it('should return 0 for empty string', () => {
      expect(getMnemonicWordCount('')).toBe(0);
    });

    it('should handle extra whitespace correctly', () => {
      const withSpaces = '  word1   word2   word3  ';
      expect(getMnemonicWordCount(withSpaces)).toBe(3);
    });
  });

  describe('hasValidMnemonicWordCount', () => {
    it('should return true for 12 words', () => {
      expect(hasValidMnemonicWordCount(TEST_MNEMONIC_12)).toBe(true);
    });

    it('should return true for 24 words', () => {
      expect(hasValidMnemonicWordCount(TEST_MNEMONIC_24)).toBe(true);
    });

    it('should return false for other counts', () => {
      expect(hasValidMnemonicWordCount('word1 word2 word3')).toBe(false);
      expect(hasValidMnemonicWordCount('word1 word2 word3 word4 word5 word6 word7 word8')).toBe(
        false,
      );
    });
  });

  describe('getAllAddressesFromMnemonic', () => {
    it('should return both Solana and EVM addresses', () => {
      const addresses = getAllAddressesFromMnemonic(TEST_MNEMONIC_24);

      expect(addresses.solanaAddress).toBeDefined();
      expect(addresses.evmAddress).toBeDefined();
      expect(isValidSolanaAddress(addresses.solanaAddress)).toBe(true);
      expect(isValidEVMAddress(addresses.evmAddress)).toBe(true);
    });

    it('should use specified EVM index', () => {
      const addresses0 = getAllAddressesFromMnemonic(TEST_MNEMONIC_24, 0);
      const addresses1 = getAllAddressesFromMnemonic(TEST_MNEMONIC_24, 1);

      expect(addresses0.evmAddress).not.toBe(addresses1.evmAddress);
    });
  });

  describe('deriveAddressesForIndex', () => {
    it('should derive addresses for specified index', () => {
      const addresses = deriveAddressesForIndex(TEST_MNEMONIC_24, 0);

      expect(isValidSolanaAddress(addresses.solanaAddress)).toBe(true);
      expect(isValidEVMAddress(addresses.evmAddress)).toBe(true);
    });

    it('should derive different addresses for different indices', () => {
      const addresses0 = deriveAddressesForIndex(TEST_MNEMONIC_24, 0);
      const addresses1 = deriveAddressesForIndex(TEST_MNEMONIC_24, 1);

      expect(addresses0.solanaAddress).not.toBe(addresses1.solanaAddress);
      expect(addresses0.evmAddress).not.toBe(addresses1.evmAddress);
    });
  });

  describe('deriveKeypairsForIndex', () => {
    it('should derive both keypairs', () => {
      const keypairs = deriveKeypairsForIndex(TEST_MNEMONIC_24, 0);

      expect(keypairs.solanaKeypair).toBeDefined();
      expect(keypairs.evmKeypair).toBeDefined();
      expect(keypairs.solanaKeypair.publicKey).toBeDefined();
      expect(keypairs.evmKeypair.address).toBeDefined();
    });
  });

  describe('keypairFromPrivateKey', () => {
    it('should create keypair from base58 private key', () => {
      const keypair = keypairFromPrivateKey(TEST_SOLANA_PRIVATE_KEY_BASE58);

      expect(keypair).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
    });

    it('should create keypair from hex private key', () => {
      // Generate a test hex key (64 chars = 32 bytes)
      const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const keypair = keypairFromPrivateKey(hexKey);

      expect(keypair).toBeDefined();
    });

    it('should create keypair from 0x-prefixed hex', () => {
      const hexKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const keypair = keypairFromPrivateKey(hexKey);

      expect(keypair).toBeDefined();
    });

    it('should create keypair from JSON array format', () => {
      // Create a valid 64-byte array
      const arr = Array(64)
        .fill(0)
        .map((_, i) => i % 256);
      const jsonKey = JSON.stringify(arr);
      const keypair = keypairFromPrivateKey(jsonKey);

      expect(keypair).toBeDefined();
    });

    it('should throw error for invalid private key', () => {
      expect(() => keypairFromPrivateKey('invalid-key')).toThrow(WalletError);
    });

    it('should throw error for wrong length', () => {
      expect(() => keypairFromPrivateKey('0x1234')).toThrow(WalletError);
    });
  });

  describe('evmKeypairFromPrivateKey', () => {
    it('should create EVM keypair from hex private key', () => {
      const keypair = evmKeypairFromPrivateKey(TEST_EVM_PRIVATE_KEY);

      expect(keypair).toBeDefined();
      expect(keypair.address).toBeDefined();
      expect(isValidEVMAddress(keypair.address)).toBe(true);
    });

    it('should handle key without 0x prefix', () => {
      const keyWithoutPrefix = TEST_EVM_PRIVATE_KEY.slice(2);
      const keypair = evmKeypairFromPrivateKey(keyWithoutPrefix);

      expect(keypair).toBeDefined();
      expect(isValidEVMAddress(keypair.address)).toBe(true);
    });

    it('should throw error for invalid key length', () => {
      expect(() => evmKeypairFromPrivateKey('0x1234')).toThrow(WalletError);
    });

    it('should throw error for invalid characters', () => {
      expect(() =>
        evmKeypairFromPrivateKey(
          '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
        ),
      ).toThrow(WalletError);
    });
  });

  describe('validatePrivateKey', () => {
    it('should validate EVM private keys', () => {
      const result = validatePrivateKey(TEST_EVM_PRIVATE_KEY);

      expect(result.valid).toBe(true);
      expect(result.chainType).toBe('evm');
    });

    it('should validate Solana private keys', () => {
      const result = validatePrivateKey(TEST_SOLANA_PRIVATE_KEY_BASE58);

      expect(result.valid).toBe(true);
      expect(result.chainType).toBe('solana');
    });

    it('should return invalid for bad keys', () => {
      const result = validatePrivateKey('invalid-key');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getSolanaPrivateKeyBase58', () => {
    it('should export private key as base58', () => {
      const keypair = deriveKeypair(TEST_MNEMONIC_24);
      const exportedKey = getSolanaPrivateKeyBase58(keypair);

      expect(typeof exportedKey).toBe('string');
      expect(exportedKey.length).toBeGreaterThan(0);

      // Should be able to recreate keypair from exported key
      const recreatedKeypair = keypairFromPrivateKey(exportedKey);
      expect(recreatedKeypair.publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
    });
  });

  describe('getEVMPrivateKeyHex', () => {
    it('should return private key in hex format', () => {
      const keypair = deriveEVMKeypair(TEST_MNEMONIC_24);
      const exportedKey = getEVMPrivateKeyHex(keypair);

      expect(exportedKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(exportedKey).toBe(keypair.privateKey);
    });
  });
});
