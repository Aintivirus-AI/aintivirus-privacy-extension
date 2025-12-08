/**
 * AINTIVIRUS Wallet Module - Migration
 * 
 * SECURITY CRITICAL: This module handles wallet vault migrations.
 * 
 * Migration path:
 * - Version 1: Single wallet (EncryptedVault)
 * - Version 2: Multi-wallet (MultiWalletVault + EncryptedWalletData)
 * 
 * NEVER:
 * - Delete old data before new data is safely written
 * - Log sensitive data during migration
 * - Leave vault in inconsistent state
 */

import {
  EncryptedVault,
  MultiWalletVault,
  MultiWalletVaultV3,
  EncryptedWalletData,
  WalletEntry,
  WalletEntryV3,
  DerivedAccount,
  WalletError,
  WalletErrorCode,
  VAULT_VERSION,
  MULTI_WALLET_VAULT_VERSION,
  HD_WALLET_VAULT_VERSION,
  MULTI_CHAIN_VAULT_VERSION,
} from './types';
import { constantTimeEqual } from './crypto';
import {
  getEVMAddressFromMnemonic,
  deriveAddressesForIndex,
} from './keychain';
import {
  generateSalt,
  deriveKeyFromPassword,
  encrypt,
  decrypt,
  arrayBufferToBase64,
} from './crypto';

// ============================================
// STORAGE KEYS
// ============================================

export const STORAGE_KEYS = {
  // Legacy v1 key
  LEGACY_VAULT: 'walletVault',
  // New v2 keys
  MULTI_WALLET_VAULT: 'multiWalletVault',
  ENCRYPTED_WALLET_DATA: 'walletEncryptedData',
  // Shared
  SETTINGS: 'walletSettings',
} as const;

// ============================================
// UUID GENERATION
// ============================================

/**
 * Generate a UUID v4 for wallet IDs
 * Uses crypto.getRandomValues for cryptographic randomness
 */
export function generateWalletId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  
  // Set version 4 (random) UUID bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ============================================
// VERSION DETECTION
// ============================================

/**
 * Vault version information
 */
export interface VaultVersionInfo {
  /** Detected version (0 = uninitialized, 1 = single wallet, 2 = multi-wallet, 3 = HD accounts) */
  version: 0 | 1 | 2 | 3;
  /** Whether migration is needed */
  needsMigration: boolean;
  /** Legacy vault if v1 detected */
  legacyVault?: EncryptedVault;
  /** Multi-wallet vault if v2 detected */
  multiWalletVault?: MultiWalletVault;
  /** HD accounts vault if v3 detected */
  multiWalletVaultV3?: MultiWalletVaultV3;
}

/**
 * Detect the current vault version in storage
 * 
 * @returns Version info with migration status
 */
export async function detectVaultVersion(): Promise<VaultVersionInfo> {
  // Check for v2/v3 multi-wallet vault first
  const v2Result = await chrome.storage.local.get(STORAGE_KEYS.MULTI_WALLET_VAULT);
  const vault = v2Result[STORAGE_KEYS.MULTI_WALLET_VAULT] as (MultiWalletVault | MultiWalletVaultV3) | undefined;
  
  if (vault) {
    // Check for v3 HD accounts vault
    if (vault.version === 3) {
      return {
        version: 3,
        needsMigration: false,
        multiWalletVaultV3: vault as MultiWalletVaultV3,
      };
    }
    
    // v2 multi-wallet vault
    if (vault.version === 2) {
      return {
        version: 2,
        needsMigration: true, // v2 needs migration to v3
        multiWalletVault: vault as MultiWalletVault,
      };
    }
  }
  
  // Check for v1 legacy vault
  const v1Result = await chrome.storage.local.get(STORAGE_KEYS.LEGACY_VAULT);
  const legacyVault = v1Result[STORAGE_KEYS.LEGACY_VAULT] as EncryptedVault | undefined;
  
  if (legacyVault && legacyVault.version === VAULT_VERSION) {
    return {
      version: 1,
      needsMigration: true,
      legacyVault,
    };
  }
  
  // No vault found - uninitialized
  return {
    version: 0,
    needsMigration: false,
  };
}

// ============================================
// MASTER VERIFIER
// ============================================

/**
 * Generate a master verifier hash for password validation
 * 
 * SECURITY: This allows validating the password without decrypting any wallet.
 * We encrypt a known constant and store the result.
 * 
 * @param password - User's password
 * @param salt - Salt for key derivation
 * @returns Base64-encoded verifier
 */
export async function generateMasterVerifier(
  password: string,
  salt: string
): Promise<string> {
  const key = await deriveKeyFromPassword(password, salt);
  
  // Encrypt a constant value as the verifier
  const verifierConstant = 'AINTIVIRUS_WALLET_VERIFIER_V2';
  
  // Generate IV for the verifier encryption
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  
  const encrypted = await encrypt(verifierConstant, key, iv);
  
  // Store both IV and ciphertext
  return JSON.stringify({ iv, ciphertext: encrypted });
}

/**
 * Validate password against master verifier
 * 
 * @param password - Password to validate
 * @param salt - Master salt
 * @param verifier - Master verifier string
 * @returns True if password is correct
 */
export async function validateMasterPassword(
  password: string,
  salt: string,
  verifier: string
): Promise<boolean> {
  try {
    const key = await deriveKeyFromPassword(password, salt);
    const { iv, ciphertext } = JSON.parse(verifier);
    
    const decrypted = await decrypt(ciphertext, key, iv);
    
    // SECURITY: Use constant-time comparison to prevent timing attacks
    const expected = 'AINTIVIRUS_WALLET_VERIFIER_V2';
    const decryptedBytes = new TextEncoder().encode(decrypted);
    const expectedBytes = new TextEncoder().encode(expected);
    
    return constantTimeEqual(decryptedBytes, expectedBytes);
  } catch {
    return false;
  }
}

// ============================================
// MIGRATION: V1 TO V2
// ============================================

/**
 * Migrate from v1 single-wallet to v2 multi-wallet format
 * 
 * SECURITY: This is a critical operation that transforms the vault structure.
 * The migration is atomic - if any step fails, no changes are made.
 * 
 * @param password - User's password (required to decrypt v1 and re-encrypt for v2)
 * @returns The new multi-wallet vault
 */
export async function migrateV1ToV2(password: string): Promise<{
  vault: MultiWalletVault;
  encryptedData: EncryptedWalletData;
}> {
  // Step 1: Get legacy vault
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 1 || !versionInfo.legacyVault) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'No v1 vault found to migrate'
    );
  }
  
  const legacyVault = versionInfo.legacyVault;
  
  // Step 2: Verify password by decrypting the legacy vault
  let mnemonic: string;
  try {
    const key = await deriveKeyFromPassword(password, legacyVault.salt);
    mnemonic = await decrypt(legacyVault.ciphertext, key, legacyVault.iv);
  } catch {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password. Cannot migrate wallet.'
    );
  }
  
  // Step 3: Generate new wallet ID and master salt
  const walletId = generateWalletId();
  const masterSalt = generateSalt();
  
  // Step 4: Generate master verifier
  const masterVerifier = await generateMasterVerifier(password, masterSalt);
  
  // Step 5: Create new encrypted wallet data with fresh salt/IV
  const walletSalt = generateSalt();
  const walletIv = generateSalt().slice(0, 16); // Use first 16 chars for base64 IV
  
  // Actually generate a proper IV
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const walletIvBase64 = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  
  const walletKey = await deriveKeyFromPassword(password, walletSalt);
  const walletCiphertext = await encrypt(mnemonic, walletKey, walletIvBase64);
  
  // Step 6: Create wallet entry
  const walletEntry: WalletEntry = {
    id: walletId,
    label: 'Main Wallet',
    publicKey: legacyVault.publicKey,
    createdAt: legacyVault.createdAt,
    derivationIndex: 0,
  };
  
  // Step 7: Create multi-wallet vault
  const multiWalletVault: MultiWalletVault = {
    version: 2,
    activeWalletId: walletId,
    wallets: [walletEntry],
    masterSalt,
    masterVerifier,
    createdAt: Date.now(),
  };
  
  // Step 8: Create encrypted wallet data
  const encryptedData: EncryptedWalletData = {
    [walletId]: {
      salt: walletSalt,
      iv: walletIvBase64,
      ciphertext: walletCiphertext,
    },
  };
  
  // Step 9: Clear mnemonic from memory
  mnemonic = '';
  
  // Step 10: Save new structures atomically
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.MULTI_WALLET_VAULT]: multiWalletVault,
      [STORAGE_KEYS.ENCRYPTED_WALLET_DATA]: encryptedData,
    });
    
    // Step 11: Remove legacy vault only after successful save
    await chrome.storage.local.remove(STORAGE_KEYS.LEGACY_VAULT);
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.STORAGE_ERROR,
      'Failed to save migrated vault. Please try again.'
    );
  }
  
  console.log('[AINTIVIRUS Wallet] Migration from v1 to v2 completed successfully');
  
  return {
    vault: multiWalletVault,
    encryptedData,
  };
}

// ============================================
// VAULT INTEGRITY VALIDATION
// ============================================

/**
 * Validate multi-wallet vault integrity
 * 
 * Checks:
 * - Version is correct
 * - All wallet entries have required fields
 * - Active wallet ID exists in wallet list
 * - Encrypted data exists for all wallets
 * 
 * @param vault - Multi-wallet vault to validate
 * @param encryptedData - Encrypted wallet data
 * @returns Validation result with any errors
 */
export function validateVaultIntegrity(
  vault: MultiWalletVault,
  encryptedData: EncryptedWalletData
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check version
  if (vault.version !== 2) {
    errors.push(`Invalid vault version: ${vault.version}`);
  }
  
  // Check master salt and verifier
  if (!vault.masterSalt || vault.masterSalt.length < 32) {
    errors.push('Missing or invalid master salt');
  }
  if (!vault.masterVerifier) {
    errors.push('Missing master verifier');
  }
  
  // Check wallets array
  if (!Array.isArray(vault.wallets)) {
    errors.push('Wallets is not an array');
  } else {
    // Check each wallet entry
    const walletIds = new Set<string>();
    
    for (const wallet of vault.wallets) {
      // Check required fields
      if (!wallet.id) {
        errors.push('Wallet missing ID');
      } else {
        if (walletIds.has(wallet.id)) {
          errors.push(`Duplicate wallet ID: ${wallet.id}`);
        }
        walletIds.add(wallet.id);
        
        // Check encrypted data exists
        if (!encryptedData[wallet.id]) {
          errors.push(`Missing encrypted data for wallet: ${wallet.id}`);
        } else {
          const data = encryptedData[wallet.id];
          if (!data.salt || !data.iv || !data.ciphertext) {
            errors.push(`Incomplete encrypted data for wallet: ${wallet.id}`);
          }
        }
      }
      
      if (!wallet.label) {
        errors.push(`Wallet ${wallet.id} missing label`);
      }
      if (!wallet.publicKey) {
        errors.push(`Wallet ${wallet.id} missing public key`);
      }
      if (typeof wallet.createdAt !== 'number') {
        errors.push(`Wallet ${wallet.id} missing createdAt`);
      }
    }
    
    // Check active wallet exists
    if (vault.activeWalletId && !walletIds.has(vault.activeWalletId)) {
      errors.push(`Active wallet ID not found: ${vault.activeWalletId}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// INITIALIZATION HELPERS
// ============================================

/**
 * Initialize a new multi-wallet vault (for first-time setup)
 * 
 * @param password - User's password
 * @returns Empty multi-wallet vault ready for first wallet
 */
export async function initializeMultiWalletVault(password: string): Promise<{
  vault: MultiWalletVault;
  encryptedData: EncryptedWalletData;
}> {
  const masterSalt = generateSalt();
  const masterVerifier = await generateMasterVerifier(password, masterSalt);
  
  const vault: MultiWalletVault = {
    version: 2,
    activeWalletId: null,
    wallets: [],
    masterSalt,
    masterVerifier,
    createdAt: Date.now(),
  };
  
  const encryptedData: EncryptedWalletData = {};
  
  return { vault, encryptedData };
}

/**
 * Check if migration is needed and perform it if necessary
 * Called during wallet module initialization
 * 
 * Note: This does NOT perform migration automatically - it only detects
 * the need for migration. The actual migration requires user password
 * and must be triggered explicitly during unlock.
 * 
 * @returns Version info indicating current state
 */
export async function checkMigrationStatus(): Promise<VaultVersionInfo> {
  return await detectVaultVersion();
}

// ============================================
// MIGRATION: V2 TO V3 (MULTI-CHAIN)
// ============================================

/**
 * Check if wallet needs EVM address migration
 * 
 * Wallets created before multi-chain support won't have EVM addresses.
 * This function checks if any wallet is missing the evmAddress field.
 * 
 * @param vault - Multi-wallet vault to check
 * @returns True if migration is needed
 */
export function needsEVMAddressMigration(vault: MultiWalletVault): boolean {
  if (!vault || !vault.wallets) return false;
  
  return vault.wallets.some(wallet => !wallet.evmAddress);
}

/**
 * Migrate a single wallet to add EVM address
 * 
 * This is called during unlock when we have access to the mnemonic.
 * The EVM address is derived from the same mnemonic used for Solana.
 * 
 * @param mnemonic - Wallet mnemonic (SENSITIVE)
 * @param walletEntry - Wallet entry to update
 * @returns Updated wallet entry with EVM address
 */
export function migrateWalletToMultiChain(
  mnemonic: string,
  walletEntry: WalletEntry
): WalletEntry {
  // Skip if already has EVM address
  if (walletEntry.evmAddress) {
    return walletEntry;
  }
  
  // Derive EVM address from mnemonic
  const evmAddress = getEVMAddressFromMnemonic(mnemonic, walletEntry.derivationIndex);
  
  console.log(`[AINTIVIRUS Wallet] Migrated wallet ${walletEntry.id} to multi-chain (EVM: ${evmAddress.slice(0, 10)}...)`);
  
  return {
    ...walletEntry,
    evmAddress,
  };
}

/**
 * Migrate all wallets in vault to add EVM addresses
 * 
 * SECURITY: This requires decrypting each wallet's mnemonic.
 * Should be called during unlock when password is available.
 * 
 * @param vault - Multi-wallet vault
 * @param encryptedData - Encrypted wallet data
 * @param password - User's password
 * @returns Updated vault with EVM addresses
 */
export async function migrateVaultToMultiChain(
  vault: MultiWalletVault,
  encryptedData: EncryptedWalletData,
  password: string
): Promise<MultiWalletVault> {
  if (!needsEVMAddressMigration(vault)) {
    return vault;
  }
  
  console.log('[AINTIVIRUS Wallet] Starting multi-chain migration...');
  
  const updatedWallets: WalletEntry[] = [];
  
  for (const wallet of vault.wallets) {
    if (wallet.evmAddress) {
      // Already has EVM address
      updatedWallets.push(wallet);
      continue;
    }
    
    // Need to derive EVM address
    const walletData = encryptedData[wallet.id];
    if (!walletData) {
      console.error(`[AINTIVIRUS Wallet] Missing encrypted data for wallet: ${wallet.id}`);
      updatedWallets.push(wallet);
      continue;
    }
    
    try {
      // Decrypt mnemonic
      const key = await deriveKeyFromPassword(password, walletData.salt);
      const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
      
      // Derive EVM address
      const evmAddress = getEVMAddressFromMnemonic(mnemonic, wallet.derivationIndex);
      
      updatedWallets.push({
        ...wallet,
        evmAddress,
      });
      
      console.log(`[AINTIVIRUS Wallet] Added EVM address for wallet: ${wallet.id}`);
    } catch (error) {
      console.error(`[AINTIVIRUS Wallet] Failed to migrate wallet ${wallet.id}:`, error);
      // Keep wallet without EVM address - will be migrated on next unlock
      updatedWallets.push(wallet);
    }
  }
  
  const updatedVault: MultiWalletVault = {
    ...vault,
    wallets: updatedWallets,
  };
  
  // Save updated vault
  await chrome.storage.local.set({
    [STORAGE_KEYS.MULTI_WALLET_VAULT]: updatedVault,
  });
  
  console.log('[AINTIVIRUS Wallet] Multi-chain migration completed');
  
  return updatedVault;
}

/**
 * Check if vault needs any migrations and return migration status
 */
export interface MigrationStatus {
  /** Current vault version */
  currentVersion: number;
  /** Whether v1 to v2 migration is needed */
  needsV1ToV2: boolean;
  /** Whether EVM address migration is needed */
  needsEVMAddresses: boolean;
  /** Total wallets without EVM addresses */
  walletsNeedingEVM: number;
}

/**
 * Get comprehensive migration status
 * 
 * @returns Migration status for all known migrations
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  const versionInfo = await detectVaultVersion();
  
  let walletsNeedingEVM = 0;
  
  if (versionInfo.version === 2 && versionInfo.multiWalletVault) {
    walletsNeedingEVM = versionInfo.multiWalletVault.wallets.filter(
      w => !w.evmAddress
    ).length;
  }
  
  return {
    currentVersion: versionInfo.version,
    needsV1ToV2: versionInfo.version === 1,
    needsEVMAddresses: walletsNeedingEVM > 0,
    walletsNeedingEVM,
  };
}

// ============================================
// MIGRATION: V2 TO V3 (HD ACCOUNTS)
// ============================================

/**
 * Migrate from v2 multi-wallet to v3 HD accounts format
 * 
 * SECURITY: This transforms the vault structure to support multiple
 * derived accounts per seed wallet.
 * 
 * Migration steps:
 * 1. For each v2 wallet, create a DerivedAccount at index 0 with existing addresses
 * 2. Move publicKey/evmAddress into accounts[0]
 * 3. Set evmPathType: 'standard', solanaPathType: 'legacy' (preserves existing addresses)
 * 4. Set nextAccountIndex: 1
 * 5. Initialize watchOnlyAccounts: []
 * 6. Add activeAccountId pointing to the first account
 * 
 * @param vault - v2 MultiWalletVault to migrate
 * @param encryptedData - Encrypted wallet data
 * @param password - User's password (for verification)
 * @returns The new v3 vault
 */
export async function migrateV2ToV3(
  vault: MultiWalletVault,
  encryptedData: EncryptedWalletData,
  password: string
): Promise<{
  vault: MultiWalletVaultV3;
  encryptedData: EncryptedWalletData;
}> {
  // Verify password against master verifier
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password. Cannot migrate vault.'
    );
  }
  
  console.log('[AINTIVIRUS Wallet] Starting v2 to v3 migration...');
  
  // Convert each v2 wallet to v3 format
  const v3Wallets: WalletEntryV3[] = [];
  let activeAccountId: string | null = null;
  
  for (const v2Wallet of vault.wallets) {
    // Generate account ID
    const accountId = generateWalletId();
    
    // Get EVM address if not present
    let evmAddress = v2Wallet.evmAddress;
    if (!evmAddress) {
      // Need to derive EVM address from mnemonic
      const walletData = encryptedData[v2Wallet.id];
      if (walletData) {
        try {
          const key = await deriveKeyFromPassword(password, walletData.salt);
          const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
          evmAddress = getEVMAddressFromMnemonic(mnemonic, 0);
        } catch (error) {
          console.error(`[AINTIVIRUS Wallet] Failed to derive EVM address for wallet ${v2Wallet.id}`);
        }
      }
    }
    
    // Create derived account from v2 wallet
    const account: DerivedAccount = {
      id: accountId,
      name: 'Account 1',
      index: 0,
      solanaAddress: v2Wallet.publicKey,
      evmAddress: evmAddress || '',
      createdAt: v2Wallet.createdAt,
    };
    
    // Create v3 wallet entry
    const v3Wallet: WalletEntryV3 = {
      id: v2Wallet.id,
      label: v2Wallet.label,
      accounts: [account],
      // Use legacy path for Solana to preserve existing addresses
      // The legacy path m/44'/501'/0'/0' was used for index 0 in v2
      evmPathType: 'standard',
      solanaPathType: 'legacy',
      nextAccountIndex: 1,
      createdAt: v2Wallet.createdAt,
    };
    
    v3Wallets.push(v3Wallet);
    
    // Set active account if this is the active wallet
    if (vault.activeWalletId === v2Wallet.id) {
      activeAccountId = accountId;
    }
  }
  
  // Create v3 vault
  const v3Vault: MultiWalletVaultV3 = {
    version: 3,
    activeWalletId: vault.activeWalletId,
    activeAccountId,
    wallets: v3Wallets,
    watchOnlyAccounts: [],
    masterSalt: vault.masterSalt,
    masterVerifier: vault.masterVerifier,
    createdAt: vault.createdAt,
  };
  
  // Save migrated vault
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.MULTI_WALLET_VAULT]: v3Vault,
    });
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.STORAGE_ERROR,
      'Failed to save migrated vault. Please try again.'
    );
  }
  
  console.log('[AINTIVIRUS Wallet] Migration from v2 to v3 completed successfully');
  console.log(`[AINTIVIRUS Wallet] Migrated ${v3Wallets.length} wallets to HD account format`);
  
  return {
    vault: v3Vault,
    encryptedData,
  };
}

/**
 * Initialize a new v3 multi-wallet vault (for first-time setup)
 * 
 * @param password - User's password
 * @returns Empty v3 multi-wallet vault ready for first wallet
 */
export async function initializeMultiWalletVaultV3(password: string): Promise<{
  vault: MultiWalletVaultV3;
  encryptedData: EncryptedWalletData;
}> {
  const masterSalt = generateSalt();
  const masterVerifier = await generateMasterVerifier(password, masterSalt);
  
  const vault: MultiWalletVaultV3 = {
    version: 3,
    activeWalletId: null,
    activeAccountId: null,
    wallets: [],
    watchOnlyAccounts: [],
    masterSalt,
    masterVerifier,
    createdAt: Date.now(),
  };
  
  const encryptedData: EncryptedWalletData = {};
  
  return { vault, encryptedData };
}

/**
 * Check if v2 to v3 migration is needed
 */
export function needsV2ToV3Migration(versionInfo: VaultVersionInfo): boolean {
  return versionInfo.version === 2;
}

/**
 * Validate v3 vault integrity
 * 
 * Checks:
 * - Version is 3
 * - All wallet entries have accounts array
 * - Active account ID exists in wallet's accounts
 * - Encrypted data exists for all wallets
 * 
 * @param vault - v3 Multi-wallet vault to validate
 * @param encryptedData - Encrypted wallet data
 * @returns Validation result with any errors
 */
export function validateVaultIntegrityV3(
  vault: MultiWalletVaultV3,
  encryptedData: EncryptedWalletData
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check version
  if (vault.version !== 3) {
    errors.push(`Invalid vault version: ${vault.version}`);
  }
  
  // Check master salt and verifier
  if (!vault.masterSalt || vault.masterSalt.length < 32) {
    errors.push('Missing or invalid master salt');
  }
  if (!vault.masterVerifier) {
    errors.push('Missing master verifier');
  }
  
  // Check wallets array
  if (!Array.isArray(vault.wallets)) {
    errors.push('Wallets is not an array');
  } else {
    const walletIds = new Set<string>();
    const accountIds = new Set<string>();
    
    for (const wallet of vault.wallets) {
      // Check required fields
      if (!wallet.id) {
        errors.push('Wallet missing ID');
      } else {
        if (walletIds.has(wallet.id)) {
          errors.push(`Duplicate wallet ID: ${wallet.id}`);
        }
        walletIds.add(wallet.id);
        
        // Check encrypted data exists
        if (!encryptedData[wallet.id]) {
          errors.push(`Missing encrypted data for wallet: ${wallet.id}`);
        } else {
          const data = encryptedData[wallet.id];
          if (!data.salt || !data.iv || !data.ciphertext) {
            errors.push(`Incomplete encrypted data for wallet: ${wallet.id}`);
          }
        }
      }
      
      if (!wallet.label) {
        errors.push(`Wallet ${wallet.id} missing label`);
      }
      
      // Check accounts array
      if (!Array.isArray(wallet.accounts)) {
        errors.push(`Wallet ${wallet.id} missing accounts array`);
      } else if (wallet.accounts.length === 0) {
        errors.push(`Wallet ${wallet.id} has no accounts`);
      } else {
        for (const account of wallet.accounts) {
          if (!account.id) {
            errors.push(`Account in wallet ${wallet.id} missing ID`);
          } else {
            if (accountIds.has(account.id)) {
              errors.push(`Duplicate account ID: ${account.id}`);
            }
            accountIds.add(account.id);
          }
          if (!account.solanaAddress) {
            errors.push(`Account ${account.id} missing Solana address`);
          }
          if (!account.evmAddress) {
            errors.push(`Account ${account.id} missing EVM address`);
          }
        }
      }
      
      if (typeof wallet.createdAt !== 'number') {
        errors.push(`Wallet ${wallet.id} missing createdAt`);
      }
    }
    
    // Check active wallet exists
    if (vault.activeWalletId && !walletIds.has(vault.activeWalletId)) {
      errors.push(`Active wallet ID not found: ${vault.activeWalletId}`);
    }
    
    // Check active account exists
    if (vault.activeAccountId && !accountIds.has(vault.activeAccountId)) {
      errors.push(`Active account ID not found: ${vault.activeAccountId}`);
    }
  }
  
  // Check watch-only accounts
  if (!Array.isArray(vault.watchOnlyAccounts)) {
    errors.push('watchOnlyAccounts is not an array');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

