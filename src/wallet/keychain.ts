/**
 * AINTIVIRUS Wallet Module - Keychain (Key Generation & Derivation)
 * 
 * SECURITY CRITICAL: This module handles mnemonic and private key operations.
 * 
 * Implementation notes:
 * - Uses BIP-39 for mnemonic generation (24 words = 256 bits entropy)
 * - Uses ed25519-hd-key for Solana key derivation
 * - Follows Solana's standard derivation path: m/44'/501'/0'/0'
 * 
 * NEVER:
 * - Log mnemonics or private keys
 * - Store unencrypted key material
 * - Expose private keys outside this module except for signing
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import {
  SOLANA_DERIVATION_PATH,
  MNEMONIC_WORD_COUNT,
  WalletError,
  WalletErrorCode,
} from './types';

// ============================================
// MNEMONIC GENERATION
// ============================================

/**
 * Generate a new BIP-39 mnemonic phrase
 * 
 * SECURITY: This generates 256 bits of entropy (24 words).
 * The mnemonic is the master secret from which all keys are derived.
 * 
 * WARNING: The returned mnemonic is EXTREMELY SENSITIVE:
 * - Display only once for user backup
 * - Never store unencrypted
 * - Clear from memory after encryption
 * - Anyone with the mnemonic can steal all funds
 * 
 * @returns 24-word mnemonic phrase (SENSITIVE)
 */
export function generateMnemonic(): string {
  // SECURITY: 256 bits of entropy = 24 words
  // This provides 2^256 possible mnemonics, making brute-force infeasible
  const mnemonic = bip39.generateMnemonic(256);
  
  // Verify we got the expected word count
  const wordCount = mnemonic.split(' ').length;
  if (wordCount !== MNEMONIC_WORD_COUNT) {
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      `Unexpected mnemonic word count: ${wordCount}`
    );
  }
  
  return mnemonic;
}

/**
 * Validate a BIP-39 mnemonic phrase
 * 
 * SECURITY: Validates both the word list and checksum.
 * Invalid mnemonics could indicate:
 * - Typos in user input
 * - Attempted attack with invalid data
 * - Corrupted backup
 * 
 * @param mnemonic - Mnemonic phrase to validate (SENSITIVE)
 * @returns True if valid BIP-39 mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
  // Normalize whitespace (user might paste with extra spaces)
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  
  // Validate using bip39 library (checks wordlist and checksum)
  return bip39.validateMnemonic(normalized);
}

/**
 * Normalize a mnemonic phrase
 * 
 * Handles common input issues:
 * - Extra whitespace
 * - Mixed case
 * - Multiple spaces between words
 * 
 * @param mnemonic - Raw mnemonic input (SENSITIVE)
 * @returns Normalized mnemonic (SENSITIVE)
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ============================================
// KEY DERIVATION
// ============================================

/**
 * Derive a Solana Keypair from a mnemonic phrase
 * 
 * SECURITY: This is the core function that converts a mnemonic into
 * a usable Solana keypair. The derivation path follows Solana standards.
 * 
 * Derivation path: m/44'/501'/0'/0'
 * - 44' = BIP-44 purpose (hardened)
 * - 501' = Solana coin type (hardened)
 * - 0' = Account index (hardened)
 * - 0' = Change/external (hardened)
 * 
 * WARNING: The returned Keypair contains the private key and is
 * EXTREMELY SENSITIVE. It should:
 * - Only exist in memory during active wallet session
 * - Be used only for signing operations
 * - Be cleared when wallet is locked
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @returns Solana Keypair (CONTAINS PRIVATE KEY - SENSITIVE)
 */
export function deriveKeypair(mnemonic: string): Keypair {
  // SECURITY: Normalize mnemonic to ensure consistent derivation
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  
  // Validate mnemonic before derivation
  if (!validateMnemonic(normalizedMnemonic)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase'
    );
  }
  
  try {
    // Step 1: Convert mnemonic to seed (512 bits)
    // SECURITY: The seed is derived using PBKDF2 internally by bip39
    // with 2048 iterations and an optional passphrase (we use empty string)
    const seed = bip39.mnemonicToSeedSync(normalizedMnemonic, '');
    
    // Step 2: Derive the ed25519 key using the Solana derivation path
    // SECURITY: Each path component is hardened (') for additional security
    const derivedSeed = derivePath(SOLANA_DERIVATION_PATH, seed.toString('hex'));
    
    // Step 3: Create Solana Keypair from the derived seed
    // SECURITY: The Keypair contains both public and private keys
    // Only the first 32 bytes of the derived key are used
    const keypair = Keypair.fromSeed(derivedSeed.key);
    
    return keypair;
  } catch (error) {
    // SECURITY: Don't expose internal error details
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to derive keypair from mnemonic'
    );
  }
}

/**
 * Get the public key (address) from a mnemonic without keeping the keypair
 * 
 * SECURITY: This derives the keypair temporarily just to get the public key,
 * then the keypair goes out of scope. Useful for displaying address without
 * full unlock.
 * 
 * Note: This still requires the mnemonic, so it's mainly useful during
 * wallet creation to store the public key alongside the encrypted vault.
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @returns Base58-encoded public key (safe to display/store)
 */
export function getPublicKeyFromMnemonic(mnemonic: string): string {
  const keypair = deriveKeypair(mnemonic);
  const publicKey = keypair.publicKey.toBase58();
  
  // SECURITY: Keypair goes out of scope here
  // JavaScript will garbage collect it, but we have no way to zero the memory
  // This is a limitation of JavaScript's memory model
  
  return publicKey;
}

// ============================================
// KEYPAIR OPERATIONS
// ============================================

/**
 * Convert Keypair to a format suitable for temporary storage
 * 
 * SECURITY: This extracts the secret key bytes for temporary storage.
 * Should only be used when absolutely necessary (e.g., for signing).
 * 
 * WARNING: The returned array contains the full secret key (64 bytes).
 * 
 * @param keypair - Solana Keypair (SENSITIVE)
 * @returns Secret key as Uint8Array (SENSITIVE)
 */
export function keypairToSecretKey(keypair: Keypair): Uint8Array {
  // SECURITY: This is the full 64-byte secret key (seed + public key)
  return keypair.secretKey;
}

/**
 * Reconstruct Keypair from secret key bytes
 * 
 * SECURITY: Reconstructs the keypair from stored secret key bytes.
 * 
 * @param secretKey - Secret key as Uint8Array (SENSITIVE)
 * @returns Solana Keypair (SENSITIVE)
 */
export function secretKeyToKeypair(secretKey: Uint8Array): Keypair {
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Get public key from a Keypair as base58 string
 * 
 * SECURITY: This only returns the public key, which is safe to display.
 * 
 * @param keypair - Solana Keypair
 * @returns Base58-encoded public key (safe to display)
 */
export function getPublicKeyBase58(keypair: Keypair): string {
  return keypair.publicKey.toBase58();
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Check if a string looks like a valid Solana address
 * 
 * SECURITY: This is a format check only, not a validation that
 * the address exists or is controlled by anyone.
 * 
 * @param address - Potential Solana address
 * @returns True if format is valid
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    // Solana addresses are base58-encoded and 32-44 characters
    if (address.length < 32 || address.length > 44) {
      return false;
    }
    
    // Try to decode as base58
    // If it's not valid base58, this will throw
    new PublicKey(address);
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Get word count from a mnemonic phrase
 * 
 * @param mnemonic - Mnemonic phrase
 * @returns Number of words
 */
export function getMnemonicWordCount(mnemonic: string): number {
  const normalized = normalizeMnemonic(mnemonic);
  if (!normalized) return 0;
  return normalized.split(' ').length;
}

/**
 * Check if mnemonic has correct word count (12 or 24)
 * 
 * @param mnemonic - Mnemonic phrase
 * @returns True if word count is valid
 */
export function hasValidMnemonicWordCount(mnemonic: string): boolean {
  const wordCount = getMnemonicWordCount(mnemonic);
  // Accept both 12-word (128 bits) and 24-word (256 bits) mnemonics
  return wordCount === 12 || wordCount === 24;
}

