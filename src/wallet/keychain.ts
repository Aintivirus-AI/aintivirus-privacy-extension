/**
 * AINTIVIRUS Wallet Module - Keychain (Key Generation & Derivation)
 * 
 * SECURITY CRITICAL: This module handles mnemonic and private key operations.
 * 
 * Implementation notes:
 * - Uses BIP-39 for mnemonic generation (24 words = 256 bits entropy)
 * - Uses ed25519-hd-key for Solana key derivation (ed25519 curve)
 * - Uses ethers.js for EVM key derivation (secp256k1 curve)
 * - Solana path: m/44'/501'/0'/0'
 * - EVM path: m/44'/60'/0'/0/index
 * 
 * NEVER:
 * - Log mnemonics or private keys
 * - Store unencrypted key material
 * - Expose private keys outside this module except for signing
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { HDNodeWallet, Mnemonic, Wallet, getBytes, hexlify } from 'ethers';
import {
  SOLANA_DERIVATION_PATH,
  MNEMONIC_WORD_COUNT,
  WalletError,
  WalletErrorCode,
  EVMDerivationPathType,
  SolanaDerivationPathType,
} from './types';
import { DERIVATION_PATHS } from './chains/config';

// ============================================
// EVM KEY TYPES
// ============================================

/**
 * EVM keypair representation
 * 
 * SECURITY: Contains private key - handle with extreme care
 */
export interface EVMKeypair {
  /** Ethereum address (0x-prefixed, checksummed) */
  address: string;
  /** Private key (0x-prefixed hex string) - SENSITIVE */
  privateKey: string;
  /** Private key as bytes - SENSITIVE */
  privateKeyBytes: Uint8Array;
}

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

/**
 * Derive a Solana Keypair from a mnemonic phrase with path type and account index
 * 
 * SECURITY: This is the core function for HD wallet derivation that supports
 * multiple accounts from the same seed. Uses the specified path type.
 * 
 * Path types:
 * - standard: m/44'/501'/{index}'/0' (Phantom, Solflare)
 * - legacy: m/44'/501'/0'/0' (index=0 only, original format)
 * 
 * WARNING: The returned Keypair contains the private key and is
 * EXTREMELY SENSITIVE.
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param accountIndex - Account index for derivation
 * @param pathType - Path type ('standard' or 'legacy')
 * @returns Solana Keypair (CONTAINS PRIVATE KEY - SENSITIVE)
 */
export function deriveSolanaKeypair(
  mnemonic: string,
  accountIndex: number,
  pathType: SolanaDerivationPathType = 'standard'
): Keypair {
  // SECURITY: Normalize mnemonic to ensure consistent derivation
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  
  // Validate mnemonic before derivation
  if (!validateMnemonic(normalizedMnemonic)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase'
    );
  }
  
  // Legacy path only supports index 0
  if (pathType === 'legacy' && accountIndex !== 0) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Legacy derivation path only supports account index 0'
    );
  }
  
  try {
    // Convert mnemonic to seed
    const seed = bip39.mnemonicToSeedSync(normalizedMnemonic, '');
    
    // Get derivation path based on type and index
    const derivationPath = DERIVATION_PATHS.getSolanaPath(accountIndex, pathType);
    
    // Derive the ed25519 key using the path
    const derivedSeed = derivePath(derivationPath, seed.toString('hex'));
    
    // Create Solana Keypair from the derived seed
    const keypair = Keypair.fromSeed(derivedSeed.key);
    
    return keypair;
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to derive Solana keypair from mnemonic'
    );
  }
}

/**
 * Get Solana address from a mnemonic with path type and account index
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param accountIndex - Account index for derivation
 * @param pathType - Path type ('standard' or 'legacy')
 * @returns Base58-encoded public key (safe to display/store)
 */
export function getSolanaAddressFromMnemonic(
  mnemonic: string,
  accountIndex: number,
  pathType: SolanaDerivationPathType = 'standard'
): string {
  const keypair = deriveSolanaKeypair(mnemonic, accountIndex, pathType);
  return keypair.publicKey.toBase58();
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

// ============================================
// EVM KEY DERIVATION
// ============================================

/**
 * Derive an EVM keypair from a mnemonic phrase
 * 
 * SECURITY: This derives an Ethereum-compatible keypair using the
 * standard BIP-44 path for Ethereum (m/44'/60'/0'/0/index).
 * 
 * The same address works across all EVM-compatible chains
 * (Ethereum, Polygon, Arbitrum, Optimism, Base, etc.)
 * 
 * WARNING: The returned keypair contains the private key and is
 * EXTREMELY SENSITIVE. It should:
 * - Only exist in memory during active wallet session
 * - Be used only for signing operations
 * - Be cleared when wallet is locked
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param index - Account index for derivation (default 0)
 * @returns EVM Keypair (CONTAINS PRIVATE KEY - SENSITIVE)
 */
export function deriveEVMKeypair(mnemonic: string, index: number = 0): EVMKeypair {
  return deriveEVMKeypairWithPath(mnemonic, index, 'standard');
}

/**
 * Derive an EVM keypair from a mnemonic phrase with path type support
 * 
 * SECURITY: This derives an Ethereum-compatible keypair using the
 * specified BIP-44 path type.
 * 
 * Path types:
 * - standard: m/44'/60'/0'/0/{index} (MetaMask, most wallets)
 * - ledger-live: m/44'/60'/{index}'/0/0 (Ledger Live)
 * 
 * WARNING: The returned keypair contains the private key and is
 * EXTREMELY SENSITIVE.
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param accountIndex - Account index for derivation
 * @param pathType - Path type ('standard' or 'ledger-live')
 * @returns EVM Keypair (CONTAINS PRIVATE KEY - SENSITIVE)
 */
export function deriveEVMKeypairWithPath(
  mnemonic: string,
  accountIndex: number,
  pathType: EVMDerivationPathType = 'standard'
): EVMKeypair {
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
    // Create Mnemonic object from phrase
    const mnemonicObj = Mnemonic.fromPhrase(normalizedMnemonic);
    
    // Get derivation path based on type and index
    const path = DERIVATION_PATHS.getEVMPath(accountIndex, pathType);
    const hdNode = HDNodeWallet.fromMnemonic(mnemonicObj, path);
    
    // Extract address and private key
    const address = hdNode.address; // Checksummed address
    const privateKey = hdNode.privateKey; // 0x-prefixed hex
    const privateKeyBytes = getBytes(privateKey);
    
    return {
      address,
      privateKey,
      privateKeyBytes,
    };
  } catch (error) {
    // SECURITY: Don't expose internal error details
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to derive EVM keypair from mnemonic'
    );
  }
}

/**
 * Get EVM address from a mnemonic without keeping the full keypair
 * 
 * SECURITY: This derives the keypair temporarily just to get the address,
 * then clears the private key reference.
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param index - Account index for derivation (default 0)
 * @param pathType - Path type ('standard' or 'ledger-live')
 * @returns Checksummed Ethereum address (safe to display/store)
 */
export function getEVMAddressFromMnemonic(
  mnemonic: string,
  index: number = 0,
  pathType: EVMDerivationPathType = 'standard'
): string {
  const keypair = deriveEVMKeypairWithPath(mnemonic, index, pathType);
  const address = keypair.address;
  
  // SECURITY: Clear private key reference (JS limitation - can't zero memory)
  // The keypair object will be garbage collected
  
  return address;
}

/**
 * Create an ethers Wallet from an EVM keypair
 * 
 * SECURITY: This creates a signing-capable wallet from the keypair.
 * Use only when signing is required.
 * 
 * @param keypair - EVM keypair (SENSITIVE)
 * @returns ethers Wallet instance (SENSITIVE)
 */
export function evmKeypairToWallet(keypair: EVMKeypair): Wallet {
  return new Wallet(keypair.privateKey);
}

/**
 * Check if a string is a valid EVM address
 * 
 * SECURITY: This is a format check only, not a validation that
 * the address exists or is controlled by anyone.
 * 
 * @param address - Potential EVM address
 * @returns True if valid format
 */
export function isValidEVMAddress(address: string): boolean {
  // Must start with 0x
  if (!address.startsWith('0x')) {
    return false;
  }
  
  // Must be exactly 42 characters (0x + 40 hex chars)
  if (address.length !== 42) {
    return false;
  }
  
  // Must be valid hex
  const hexPart = address.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
    return false;
  }
  
  return true;
}

/**
 * Validate address based on chain type
 * 
 * @param address - Address to validate
 * @param chainType - 'solana' or 'evm'
 * @returns True if valid for the chain type
 */
export function isValidAddressForChain(
  address: string,
  chainType: 'solana' | 'evm'
): boolean {
  if (chainType === 'solana') {
    return isValidSolanaAddress(address);
  }
  return isValidEVMAddress(address);
}

/**
 * Get both Solana and EVM addresses from a mnemonic
 * 
 * SECURITY: Derives both addresses in one operation for efficiency.
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param evmIndex - EVM derivation index (default 0)
 * @returns Object with both addresses (safe to display/store)
 */
export function getAllAddressesFromMnemonic(
  mnemonic: string,
  evmIndex: number = 0
): { solanaAddress: string; evmAddress: string } {
  return {
    solanaAddress: getPublicKeyFromMnemonic(mnemonic),
    evmAddress: getEVMAddressFromMnemonic(mnemonic, evmIndex),
  };
}

/**
 * Derive both Solana and EVM addresses for a given account index
 * 
 * SECURITY: Derives both addresses with the specified path types.
 * This is the preferred function for HD wallet account derivation.
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param accountIndex - Account index for derivation
 * @param evmPathType - EVM path type ('standard' or 'ledger-live')
 * @param solanaPathType - Solana path type ('standard' or 'legacy')
 * @returns Object with both addresses (safe to display/store)
 */
export function deriveAddressesForIndex(
  mnemonic: string,
  accountIndex: number,
  evmPathType: EVMDerivationPathType = 'standard',
  solanaPathType: SolanaDerivationPathType = 'standard'
): { solanaAddress: string; evmAddress: string } {
  return {
    solanaAddress: getSolanaAddressFromMnemonic(mnemonic, accountIndex, solanaPathType),
    evmAddress: getEVMAddressFromMnemonic(mnemonic, accountIndex, evmPathType),
  };
}

/**
 * Derive both keypairs for a given account index
 * 
 * SECURITY: Returns both keypairs with the specified path types.
 * WARNING: The returned keypairs contain private keys and are EXTREMELY SENSITIVE.
 * 
 * @param mnemonic - BIP-39 mnemonic phrase (SENSITIVE)
 * @param accountIndex - Account index for derivation
 * @param evmPathType - EVM path type ('standard' or 'ledger-live')
 * @param solanaPathType - Solana path type ('standard' or 'legacy')
 * @returns Object with both keypairs (CONTAINS PRIVATE KEYS - SENSITIVE)
 */
export function deriveKeypairsForIndex(
  mnemonic: string,
  accountIndex: number,
  evmPathType: EVMDerivationPathType = 'standard',
  solanaPathType: SolanaDerivationPathType = 'standard'
): { solanaKeypair: Keypair; evmKeypair: EVMKeypair } {
  return {
    solanaKeypair: deriveSolanaKeypair(mnemonic, accountIndex, solanaPathType),
    evmKeypair: deriveEVMKeypairWithPath(mnemonic, accountIndex, evmPathType),
  };
}

// ============================================
// PRIVATE KEY IMPORT/EXPORT
// ============================================

import bs58 from 'bs58';

/**
 * Create a Solana Keypair from a raw private key
 * 
 * SECURITY: This accepts private keys in multiple formats:
 * - Base58 encoded (64 bytes = full keypair, or 32 bytes = seed only)
 * - Hex encoded (with or without 0x prefix)
 * - Raw bytes as comma-separated numbers
 * 
 * WARNING: Private keys are EXTREMELY SENSITIVE. Handle with care.
 * 
 * @param privateKey - Private key string (SENSITIVE)
 * @returns Solana Keypair (CONTAINS PRIVATE KEY - SENSITIVE)
 */
export function keypairFromPrivateKey(privateKey: string): Keypair {
  const trimmed = privateKey.trim();
  
  try {
    let secretKey: Uint8Array;
    
    // Try to detect format
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // JSON array format: [1,2,3,...]
      const bytes = JSON.parse(trimmed) as number[];
      secretKey = new Uint8Array(bytes);
    } else if (trimmed.startsWith('0x')) {
      // Hex format with 0x prefix
      const hex = trimmed.slice(2);
      secretKey = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else if (/^[0-9a-fA-F]+$/.test(trimmed) && (trimmed.length === 64 || trimmed.length === 128)) {
      // Hex format without prefix (32 or 64 bytes)
      secretKey = new Uint8Array(trimmed.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else {
      // Try base58 decode
      secretKey = bs58.decode(trimmed);
    }
    
    // Validate length
    if (secretKey.length === 32) {
      // This is a 32-byte seed, create keypair from seed
      return Keypair.fromSeed(secretKey);
    } else if (secretKey.length === 64) {
      // This is a full 64-byte secret key (seed + public key)
      return Keypair.fromSecretKey(secretKey);
    } else {
      throw new WalletError(
        WalletErrorCode.INVALID_MNEMONIC, // Re-using error code
        `Invalid private key length: ${secretKey.length} bytes. Expected 32 or 64 bytes.`
      );
    }
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid private key format. Accepted formats: Base58, Hex (with/without 0x), or JSON array.'
    );
  }
}

/**
 * Create an EVM keypair from a raw private key
 * 
 * SECURITY: This accepts private keys in hex format (with or without 0x prefix).
 * 
 * WARNING: Private keys are EXTREMELY SENSITIVE. Handle with care.
 * 
 * @param privateKey - Private key hex string (SENSITIVE)
 * @returns EVM Keypair (CONTAINS PRIVATE KEY - SENSITIVE)
 */
export function evmKeypairFromPrivateKey(privateKey: string): EVMKeypair {
  let normalizedKey = privateKey.trim();
  
  // Add 0x prefix if not present
  if (!normalizedKey.startsWith('0x')) {
    normalizedKey = '0x' + normalizedKey;
  }
  
  // Validate hex format (should be 66 chars = 0x + 64 hex chars)
  if (normalizedKey.length !== 66) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      `Invalid EVM private key length. Expected 64 hex characters (32 bytes).`
    );
  }
  
  if (!/^0x[0-9a-fA-F]+$/.test(normalizedKey)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid EVM private key format. Must be a hex string.'
    );
  }
  
  try {
    const wallet = new Wallet(normalizedKey);
    const privateKeyBytes = getBytes(normalizedKey);
    
    return {
      address: wallet.address,
      privateKey: normalizedKey,
      privateKeyBytes,
    };
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Failed to create wallet from private key. Please check the key is valid.'
    );
  }
}

/**
 * Export Solana private key as base58 string
 * 
 * SECURITY: Returns the full 64-byte secret key as base58.
 * WARNING: This is EXTREMELY SENSITIVE data.
 * 
 * @param keypair - Solana Keypair (SENSITIVE)
 * @returns Base58-encoded private key (SENSITIVE)
 */
export function getSolanaPrivateKeyBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

/**
 * Export EVM private key as hex string
 * 
 * SECURITY: Returns the private key with 0x prefix.
 * WARNING: This is EXTREMELY SENSITIVE data.
 * 
 * @param keypair - EVM Keypair (SENSITIVE)
 * @returns Hex-encoded private key with 0x prefix (SENSITIVE)
 */
export function getEVMPrivateKeyHex(keypair: EVMKeypair): string {
  return keypair.privateKey;
}

/**
 * Validate a private key string (can be Solana or EVM format)
 * 
 * @param privateKey - Private key string to validate
 * @returns Object with validation result and detected chain type
 */
export function validatePrivateKey(privateKey: string): {
  valid: boolean;
  chainType: 'solana' | 'evm' | 'unknown';
  error?: string;
} {
  const trimmed = privateKey.trim();
  
  // Try EVM first (more strict format)
  if (trimmed.startsWith('0x') || (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 64)) {
    try {
      evmKeypairFromPrivateKey(trimmed);
      return { valid: true, chainType: 'evm' };
    } catch (e) {
      // Not valid EVM, try Solana
    }
  }
  
  // Try Solana (base58 or various formats)
  try {
    keypairFromPrivateKey(trimmed);
    return { valid: true, chainType: 'solana' };
  } catch (e) {
    // Check if it might be an invalid EVM key
    if (trimmed.startsWith('0x')) {
      return {
        valid: false,
        chainType: 'evm',
        error: 'Invalid EVM private key format',
      };
    }
    return {
      valid: false,
      chainType: 'unknown',
      error: 'Invalid private key format',
    };
  }
}

