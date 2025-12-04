/**
 * AINTIVIRUS Wallet Module - Secure Storage
 * 
 * SECURITY CRITICAL: This module manages the encrypted wallet vault.
 * 
 * Architecture:
 * - Encrypted vault stored in chrome.storage.local
 * - In-memory keypair only when wallet is unlocked
 * - Auto-lock after timeout (configurable)
 * 
 * Storage keys:
 * - walletVault: Encrypted vault (EncryptedVault)
 * - walletSettings: User preferences (WalletSettings)
 * 
 * NEVER:
 * - Store unencrypted private keys or mnemonics
 * - Keep unlocked keypair longer than necessary
 * - Log any sensitive data
 */

import { Keypair } from '@solana/web3.js';
import {
  EncryptedVault,
  WalletSettings,
  WalletState,
  WalletLockState,
  VAULT_VERSION,
  DEFAULT_WALLET_SETTINGS,
  WalletError,
  WalletErrorCode,
} from './types';
import {
  generateSalt,
  generateIV,
  deriveKeyFromPassword,
  encrypt,
  decrypt,
  validatePasswordStrength,
} from './crypto';
import {
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
  deriveKeypair,
  getPublicKeyBase58,
} from './keychain';

// ============================================
// IN-MEMORY STATE
// ============================================

/**
 * SECURITY: In-memory wallet state
 * 
 * This holds the unlocked keypair during an active session.
 * The keypair is cleared when the wallet is locked.
 * 
 * WARNING: This is the only place where unencrypted keys exist.
 */
interface InMemoryWalletState {
  /** Unlocked keypair (SENSITIVE - null when locked) */
  keypair: Keypair | null;
  /** Public address (safe to keep) */
  publicAddress: string | null;
  /** Auto-lock timer */
  lockTimer: ReturnType<typeof setTimeout> | null;
}

// SECURITY: Module-level state (not exported)
const memoryState: InMemoryWalletState = {
  keypair: null,
  publicAddress: null,
  lockTimer: null,
};

// ============================================
// RATE LIMITING FOR UNLOCK ATTEMPTS
// ============================================

/**
 * SECURITY: Rate limiting state to prevent brute force attacks
 * 
 * - Tracks failed unlock attempts
 * - Implements exponential backoff
 * - Locks out after MAX_FAILED_ATTEMPTS for LOCKOUT_DURATION_MS
 */
interface RateLimitState {
  failedAttempts: number;
  lastFailedAttempt: number;
  lockedUntil: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const BASE_BACKOFF_MS = 1000; // 1 second base

const rateLimitState: RateLimitState = {
  failedAttempts: 0,
  lastFailedAttempt: 0,
  lockedUntil: 0,
};

/**
 * Check if unlock attempts are currently rate limited
 * 
 * @returns Object with isLimited flag and remaining wait time in ms
 */
function checkRateLimit(): { isLimited: boolean; waitMs: number; attemptsRemaining: number } {
  const now = Date.now();
  
  // Check if locked out completely
  if (rateLimitState.lockedUntil > now) {
    return {
      isLimited: true,
      waitMs: rateLimitState.lockedUntil - now,
      attemptsRemaining: 0,
    };
  }
  
  // Reset if lockout has expired
  if (rateLimitState.lockedUntil > 0 && rateLimitState.lockedUntil <= now) {
    rateLimitState.failedAttempts = 0;
    rateLimitState.lockedUntil = 0;
    rateLimitState.lastFailedAttempt = 0;
  }
  
  // Calculate exponential backoff if we have failed attempts
  if (rateLimitState.failedAttempts > 0) {
    const backoffMs = BASE_BACKOFF_MS * Math.pow(2, rateLimitState.failedAttempts - 1);
    const nextAllowedTime = rateLimitState.lastFailedAttempt + backoffMs;
    
    if (now < nextAllowedTime) {
      return {
        isLimited: true,
        waitMs: nextAllowedTime - now,
        attemptsRemaining: MAX_FAILED_ATTEMPTS - rateLimitState.failedAttempts,
      };
    }
  }
  
  return {
    isLimited: false,
    waitMs: 0,
    attemptsRemaining: MAX_FAILED_ATTEMPTS - rateLimitState.failedAttempts,
  };
}

/**
 * Record a failed unlock attempt
 */
function recordFailedAttempt(): void {
  const now = Date.now();
  rateLimitState.failedAttempts++;
  rateLimitState.lastFailedAttempt = now;
  
  // Lock out after MAX_FAILED_ATTEMPTS
  if (rateLimitState.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    rateLimitState.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
}

/**
 * Reset rate limiting after successful unlock
 */
function resetRateLimit(): void {
  rateLimitState.failedAttempts = 0;
  rateLimitState.lastFailedAttempt = 0;
  rateLimitState.lockedUntil = 0;
}

// ============================================
// STORAGE HELPERS
// ============================================

const STORAGE_KEYS = {
  VAULT: 'walletVault',
  SETTINGS: 'walletSettings',
} as const;

/**
 * Get vault from storage
 */
async function getVault(): Promise<EncryptedVault | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
  return result[STORAGE_KEYS.VAULT] || null;
}

/**
 * Save vault to storage
 */
async function saveVault(vault: EncryptedVault): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: vault });
}

/**
 * Delete vault from storage
 */
async function deleteVault(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.VAULT);
}

/**
 * Get wallet settings from storage
 */
export async function getWalletSettings(): Promise<WalletSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || DEFAULT_WALLET_SETTINGS;
}

/**
 * Save wallet settings to storage
 */
export async function saveWalletSettings(settings: Partial<WalletSettings>): Promise<void> {
  const current = await getWalletSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}

// ============================================
// WALLET LIFECYCLE
// ============================================

/**
 * Check if a wallet vault exists
 * 
 * SECURITY: This only checks existence, not validity.
 * 
 * @returns True if wallet has been created
 */
export async function walletExists(): Promise<boolean> {
  const vault = await getVault();
  return vault !== null;
}

/**
 * Get current wallet state (safe for UI)
 * 
 * SECURITY: This returns only public information.
 * Never includes private keys or mnemonic.
 * 
 * @returns Current wallet state
 */
export async function getWalletState(): Promise<WalletState> {
  const vault = await getVault();
  const settings = await getWalletSettings();
  
  let lockState: WalletLockState;
  let publicAddress: string | null = null;
  
  if (!vault) {
    lockState = 'uninitialized';
  } else if (memoryState.keypair) {
    lockState = 'unlocked';
    publicAddress = memoryState.publicAddress;
  } else {
    lockState = 'locked';
    // We can get the public address from vault without unlocking
    publicAddress = vault.publicKey;
  }
  
  return {
    lockState,
    publicAddress,
    network: settings.network,
  };
}

/**
 * Create a new wallet
 * 
 * SECURITY: This is the most sensitive operation:
 * 1. Generates new mnemonic (256 bits entropy)
 * 2. Derives keypair from mnemonic
 * 3. Encrypts mnemonic with user password
 * 4. Stores encrypted vault
 * 5. Returns mnemonic for user backup (ONE TIME ONLY)
 * 
 * WARNING: The returned mnemonic must be shown to the user for backup
 * and then NEVER stored or logged again.
 * 
 * @param password - User's chosen password (SENSITIVE)
 * @returns Object with mnemonic (SENSITIVE) and public address
 */
export async function createWallet(password: string): Promise<{
  mnemonic: string;
  publicAddress: string;
}> {
  // Check if wallet already exists
  if (await walletExists()) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Wallet already exists. Delete it first to create a new one.'
    );
  }
  
  // Validate password strength
  if (!validatePasswordStrength(password)) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password does not meet minimum requirements'
    );
  }
  
  // SECURITY: Generate new mnemonic (256 bits of entropy)
  // Use let so we can reassign to help GC clear from memory faster
  let mnemonic = generateMnemonic();
  
  // SECURITY: Derive keypair from mnemonic
  const keypair = deriveKeypair(mnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  // SECURITY: Encrypt mnemonic with password
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(mnemonic, key, iv);
  
  // Create vault structure
  const vault: EncryptedVault = {
    salt,
    iv,
    ciphertext,
    publicKey: publicAddress,
    version: VAULT_VERSION,
    createdAt: Date.now(),
  };
  
  // Save vault to storage
  await saveVault(vault);
  
  // SECURITY: Store keypair in memory (wallet is now unlocked)
  memoryState.keypair = keypair;
  memoryState.publicAddress = publicAddress;
  
  // Start auto-lock timer
  await startAutoLockTimer();
  
  // SECURITY: Create a copy of mnemonic for return, then clear original reference
  // While JS strings are immutable and we can't truly zero memory,
  // clearing the reference helps GC reclaim memory faster
  const mnemonicForBackup = mnemonic.slice();
  mnemonic = ''; // Clear reference to help GC
  
  // SECURITY: Return mnemonic for user backup
  // This is the ONLY time the mnemonic should be shown to the user
  return {
    mnemonic: mnemonicForBackup,
    publicAddress,
  };
}

/**
 * Import an existing wallet from mnemonic
 * 
 * SECURITY: Validates mnemonic before import.
 * The mnemonic is encrypted and stored, never logged.
 * 
 * @param mnemonic - User's existing mnemonic (SENSITIVE)
 * @param password - User's chosen password (SENSITIVE)
 * @returns Public address
 */
export async function importWallet(
  mnemonic: string,
  password: string
): Promise<{ publicAddress: string }> {
  // Check if wallet already exists
  if (await walletExists()) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Wallet already exists. Delete it first to import a new one.'
    );
  }
  
  // Normalize and validate mnemonic
  // Use let so we can reassign to help GC clear from memory faster
  let normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalizedMnemonic)) {
    normalizedMnemonic = ''; // Clear reference
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase. Please check and try again.'
    );
  }
  
  // Validate password strength
  if (!validatePasswordStrength(password)) {
    normalizedMnemonic = ''; // Clear reference
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password does not meet minimum requirements'
    );
  }
  
  // SECURITY: Derive keypair from mnemonic
  const keypair = deriveKeypair(normalizedMnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  // SECURITY: Encrypt mnemonic with password
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(normalizedMnemonic, key, iv);
  
  // SECURITY: Clear mnemonic reference after encryption
  normalizedMnemonic = '';
  
  // Create vault structure
  const vault: EncryptedVault = {
    salt,
    iv,
    ciphertext,
    publicKey: publicAddress,
    version: VAULT_VERSION,
    createdAt: Date.now(),
  };
  
  // Save vault to storage
  await saveVault(vault);
  
  // SECURITY: Store keypair in memory (wallet is now unlocked)
  memoryState.keypair = keypair;
  memoryState.publicAddress = publicAddress;
  
  // Start auto-lock timer
  await startAutoLockTimer();
  
  return { publicAddress };
}

/**
 * Unlock the wallet with password
 * 
 * SECURITY: Decrypts the vault and loads keypair into memory.
 * Failed attempts don't reveal any information about the password.
 * Rate limiting prevents brute force attacks.
 * 
 * @param password - User's password (SENSITIVE)
 * @returns Public address
 */
export async function unlockWallet(password: string): Promise<{ publicAddress: string }> {
  // SECURITY: Check rate limiting before attempting unlock
  const rateLimit = checkRateLimit();
  if (rateLimit.isLimited) {
    const waitSeconds = Math.ceil(rateLimit.waitMs / 1000);
    const message = rateLimit.attemptsRemaining === 0
      ? `Too many failed attempts. Please wait ${waitSeconds} seconds before trying again.`
      : `Please wait ${waitSeconds} seconds before trying again. ${rateLimit.attemptsRemaining} attempts remaining.`;
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      message
    );
  }
  
  const vault = await getVault();
  
  if (!vault) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found. Please create or import a wallet first.'
    );
  }
  
  // Already unlocked?
  if (memoryState.keypair) {
    resetRateLimit(); // Reset on successful state
    return { publicAddress: memoryState.publicAddress! };
  }
  
  try {
    // SECURITY: Derive key from password
    const key = await deriveKeyFromPassword(password, vault.salt);
    
    // SECURITY: Decrypt mnemonic
    // If password is wrong, this will throw DECRYPTION_FAILED
    // Use let so we can clear reference after use
    let mnemonic = await decrypt(vault.ciphertext, key, vault.iv);
    
    // SECURITY: Derive keypair from mnemonic
    const keypair = deriveKeypair(mnemonic);
    const publicAddress = getPublicKeyBase58(keypair);
    
    // SECURITY: Clear mnemonic reference immediately after deriving keypair
    mnemonic = '';
    
    // Verify derived public key matches stored one
    if (publicAddress !== vault.publicKey) {
      // This should never happen unless vault is corrupted
      recordFailedAttempt();
      throw new WalletError(
        WalletErrorCode.DECRYPTION_FAILED,
        'Wallet data corrupted. Please restore from backup.'
      );
    }
    
    // SECURITY: Reset rate limiting on successful unlock
    resetRateLimit();
    
    // SECURITY: Store keypair in memory
    memoryState.keypair = keypair;
    memoryState.publicAddress = publicAddress;
    
    // Start auto-lock timer
    await startAutoLockTimer();
    
    return { publicAddress };
  } catch (error) {
    if (error instanceof WalletError) {
      // Record failed attempt for password/decryption errors
      if (error.code === WalletErrorCode.INVALID_PASSWORD || 
          error.code === WalletErrorCode.DECRYPTION_FAILED) {
        recordFailedAttempt();
      }
      throw error;
    }
    // SECURITY: Record failed attempt and return generic error
    recordFailedAttempt();
    const remaining = MAX_FAILED_ATTEMPTS - rateLimitState.failedAttempts;
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      remaining > 0 
        ? `Incorrect password. ${remaining} attempts remaining.`
        : 'Incorrect password. Account temporarily locked.'
    );
  }
}

/**
 * Lock the wallet
 * 
 * SECURITY: Clears the keypair from memory.
 * The wallet remains in storage (encrypted).
 */
export function lockWallet(): void {
  // Clear auto-lock timer
  if (memoryState.lockTimer) {
    clearTimeout(memoryState.lockTimer);
    memoryState.lockTimer = null;
  }
  
  // SECURITY: Clear keypair from memory
  // Note: JavaScript doesn't allow true memory zeroing,
  // but we remove the reference so GC can clean up
  memoryState.keypair = null;
  // Keep publicAddress for display purposes
}

/**
 * Delete the wallet completely
 * 
 * SECURITY: Requires password verification before deletion.
 * This permanently removes the encrypted vault.
 * Rate limiting prevents brute force attacks.
 * 
 * WARNING: This is irreversible. User must have their mnemonic backup.
 * 
 * @param password - Password for verification (SENSITIVE)
 */
export async function deleteWallet(password: string): Promise<void> {
  // SECURITY: Check rate limiting before attempting delete
  const rateLimit = checkRateLimit();
  if (rateLimit.isLimited) {
    const waitSeconds = Math.ceil(rateLimit.waitMs / 1000);
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      `Too many failed attempts. Please wait ${waitSeconds} seconds.`
    );
  }
  
  const vault = await getVault();
  
  if (!vault) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet to delete'
    );
  }
  
  // SECURITY: Verify password before deletion
  try {
    const key = await deriveKeyFromPassword(password, vault.salt);
    await decrypt(vault.ciphertext, key, vault.iv);
  } catch {
    recordFailedAttempt();
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password. Wallet not deleted.'
    );
  }
  
  // SECURITY: Reset rate limiting on successful verification
  resetRateLimit();
  
  // Lock wallet first
  lockWallet();
  
  // Delete vault and settings
  await deleteVault();
  await chrome.storage.local.remove(STORAGE_KEYS.SETTINGS);
  
  // Clear memory state completely
  memoryState.publicAddress = null;
}

// ============================================
// KEYPAIR ACCESS (for signing)
// ============================================

/**
 * Get the unlocked keypair for signing operations
 * 
 * SECURITY: This is the only way to access the private key.
 * The keypair should only be used for signing and never stored
 * or transmitted.
 * 
 * @returns Keypair if unlocked, null if locked
 */
export function getUnlockedKeypair(): Keypair | null {
  return memoryState.keypair;
}

/**
 * Check if wallet is currently unlocked
 * 
 * @returns True if wallet is unlocked
 */
export function isWalletUnlocked(): boolean {
  return memoryState.keypair !== null;
}

/**
 * Get public address (works even when locked)
 * 
 * @returns Public address or null if no wallet
 */
export async function getPublicAddress(): Promise<string | null> {
  if (memoryState.publicAddress) {
    return memoryState.publicAddress;
  }
  
  const vault = await getVault();
  return vault?.publicKey || null;
}

// ============================================
// AUTO-LOCK (Using Chrome Alarms for reliability)
// ============================================

/**
 * Alarm name for wallet auto-lock
 * SECURITY: Unique name to prevent conflicts
 */
const AUTOLOCK_ALARM_NAME = 'walletAutoLock';

/**
 * Start the auto-lock timer using chrome.alarms
 * 
 * SECURITY: Automatically locks the wallet after a period of inactivity.
 * Uses chrome.alarms instead of setTimeout for reliability in MV3 service workers.
 * Chrome alarms persist across service worker terminations and restarts.
 */
async function startAutoLockTimer(): Promise<void> {
  // Clear existing alarm
  await chrome.alarms.clear(AUTOLOCK_ALARM_NAME);
  
  // Also clear any legacy setTimeout timer
  if (memoryState.lockTimer) {
    clearTimeout(memoryState.lockTimer);
    memoryState.lockTimer = null;
  }
  
  const settings = await getWalletSettings();
  
  // 0 = never auto-lock
  if (settings.autoLockMinutes === 0) {
    return;
  }
  
  // Create alarm that will fire after the specified minutes
  // Note: Chrome alarms have a minimum of 1 minute for scheduled alarms
  const delayMinutes = Math.max(1, settings.autoLockMinutes);
  
  await chrome.alarms.create(AUTOLOCK_ALARM_NAME, {
    delayInMinutes: delayMinutes,
  });
}

/**
 * Handle auto-lock alarm
 * Called from background script's alarm listener
 */
export function handleAutoLockAlarm(): void {
  if (memoryState.keypair) {
    lockWallet();
  }
}

/**
 * Get the auto-lock alarm name for use in background script
 */
export function getAutoLockAlarmName(): string {
  return AUTOLOCK_ALARM_NAME;
}

/**
 * Reset the auto-lock timer (call on user activity)
 * 
 * SECURITY: Extends the auto-lock timeout when user is active.
 */
export async function resetAutoLockTimer(): Promise<void> {
  if (memoryState.keypair) {
    await startAutoLockTimer();
  }
}

