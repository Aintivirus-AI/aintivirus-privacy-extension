/**
 * Integration tests for wallet flow
 * Tests: Create wallet → derive addresses → sign transaction
 */

import {
  generateMnemonic,
  validateMnemonic,
  deriveKeypair,
  getAllAddressesFromMnemonic,
  isValidSolanaAddress,
  isValidEVMAddress,
  deriveKeypairsForIndex,
} from '../../wallet/keychain';
import {
  generateSalt,
  generateIV,
  deriveKeyFromPassword,
  encrypt,
  decrypt,
  validatePasswordStrength,
} from '../../wallet/crypto';
import { TEST_STRONG_PASSWORD } from '../utils/fixtures';

describe('Wallet Flow Integration', () => {
  describe('Create Wallet Flow', () => {
    it('should complete full wallet creation flow', async () => {
      // Step 1: Generate mnemonic
      const mnemonic = generateMnemonic();
      expect(validateMnemonic(mnemonic)).toBe(true);
      expect(mnemonic.split(' ')).toHaveLength(24);

      // Step 2: Derive addresses
      const addresses = getAllAddressesFromMnemonic(mnemonic);
      expect(isValidSolanaAddress(addresses.solanaAddress)).toBe(true);
      expect(isValidEVMAddress(addresses.evmAddress)).toBe(true);

      // Step 3: Encrypt mnemonic with password
      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);
      const encryptedMnemonic = await encrypt(mnemonic, key, iv);
      expect(encryptedMnemonic).not.toBe(mnemonic);

      // Step 4: Decrypt and verify
      const decryptedMnemonic = await decrypt(encryptedMnemonic, key, iv);
      expect(decryptedMnemonic).toBe(mnemonic);
    });

    it('should derive consistent addresses from same mnemonic', () => {
      const mnemonic = generateMnemonic();

      const addresses1 = getAllAddressesFromMnemonic(mnemonic);
      const addresses2 = getAllAddressesFromMnemonic(mnemonic);

      expect(addresses1.solanaAddress).toBe(addresses2.solanaAddress);
      expect(addresses1.evmAddress).toBe(addresses2.evmAddress);
    });

    it('should derive different addresses for different accounts', () => {
      const mnemonic = generateMnemonic();

      const addresses0 = getAllAddressesFromMnemonic(mnemonic, 0);
      const addresses1 = getAllAddressesFromMnemonic(mnemonic, 1);
      const addresses2 = getAllAddressesFromMnemonic(mnemonic, 2);

      // All addresses should be different
      expect(addresses0.solanaAddress).not.toBe(addresses1.solanaAddress);
      expect(addresses1.solanaAddress).not.toBe(addresses2.solanaAddress);
      expect(addresses0.evmAddress).not.toBe(addresses1.evmAddress);
      expect(addresses1.evmAddress).not.toBe(addresses2.evmAddress);
    });
  });

  describe('Password Security Flow', () => {
    it('should validate password strength before wallet creation', () => {
      const weakPasswords = ['password', '12345678', 'abc'];
      const strongPasswords = ['MyS3cur3P@ssw0rd!', TEST_STRONG_PASSWORD];

      weakPasswords.forEach((password) => {
        expect(validatePasswordStrength(password)).toBe(false);
      });

      strongPasswords.forEach((password) => {
        expect(validatePasswordStrength(password)).toBe(true);
      });
    });

    it('should fail decryption with wrong password', async () => {
      const mnemonic = generateMnemonic();
      const salt = generateSalt();
      const iv = generateIV();

      // Encrypt with correct password
      const correctKey = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);
      const encrypted = await encrypt(mnemonic, correctKey, iv);

      // Try to decrypt with wrong password
      const wrongKey = await deriveKeyFromPassword('WrongPassword123!', salt);

      await expect(decrypt(encrypted, wrongKey, iv)).rejects.toThrow();
    });
  });

  describe('Multi-Chain Derivation Flow', () => {
    it('should derive both Solana and EVM keypairs for same index', () => {
      const mnemonic = generateMnemonic();

      const keypairs = deriveKeypairsForIndex(mnemonic, 0);

      expect(keypairs.solanaKeypair).toBeDefined();
      expect(keypairs.evmKeypair).toBeDefined();

      // Verify addresses match derived addresses
      const addresses = getAllAddressesFromMnemonic(mnemonic, 0);
      expect(keypairs.solanaKeypair.publicKey.toBase58()).toBe(addresses.solanaAddress);
      expect(keypairs.evmKeypair.address).toBe(addresses.evmAddress);
    });

    it('should support multiple account derivation', () => {
      const mnemonic = generateMnemonic();
      const accountCount = 5;
      const accounts: { solana: string; evm: string }[] = [];

      for (let i = 0; i < accountCount; i++) {
        const keypairs = deriveKeypairsForIndex(mnemonic, i);
        accounts.push({
          solana: keypairs.solanaKeypair.publicKey.toBase58(),
          evm: keypairs.evmKeypair.address,
        });
      }

      // All addresses should be unique
      const allSolana = accounts.map((a) => a.solana);
      const allEvm = accounts.map((a) => a.evm);

      expect(new Set(allSolana).size).toBe(accountCount);
      expect(new Set(allEvm).size).toBe(accountCount);
    });
  });

  describe('Vault Encryption Flow', () => {
    interface VaultData {
      mnemonic: string;
      createdAt: number;
    }

    it('should encrypt and store vault data', async () => {
      const mnemonic = generateMnemonic();
      const vaultData: VaultData = {
        mnemonic,
        createdAt: Date.now(),
      };

      // Encrypt vault
      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);
      const encryptedVault = await encrypt(JSON.stringify(vaultData), key, iv);

      // Store encrypted data (simulated)
      const storedData = {
        salt,
        iv,
        ciphertext: encryptedVault,
      };

      // Retrieve and decrypt
      const retrievedKey = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, storedData.salt);
      const decryptedJson = await decrypt(storedData.ciphertext, retrievedKey, storedData.iv);
      const decryptedVault: VaultData = JSON.parse(decryptedJson);

      expect(decryptedVault.mnemonic).toBe(mnemonic);
      expect(decryptedVault.createdAt).toBe(vaultData.createdAt);
    });

    it('should maintain data integrity through encryption cycle', async () => {
      const originalData = {
        mnemonic: generateMnemonic(),
        accounts: [
          { name: 'Account 1', index: 0 },
          { name: 'Account 2', index: 1 },
        ],
        settings: {
          autoLock: true,
          timeout: 15,
        },
      };

      const salt = generateSalt();
      const iv = generateIV();
      const key = await deriveKeyFromPassword(TEST_STRONG_PASSWORD, salt);

      const encrypted = await encrypt(JSON.stringify(originalData), key, iv);
      const decrypted = JSON.parse(await decrypt(encrypted, key, iv));

      expect(decrypted).toEqual(originalData);
    });
  });
});

