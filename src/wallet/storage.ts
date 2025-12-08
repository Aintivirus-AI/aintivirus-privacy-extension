/**
 * AINTIVIRUS Wallet Module - Secure Storage
 * 
 * SECURITY CRITICAL: This module manages the encrypted wallet vault.
 * 
 * Architecture:
 * - Multi-wallet vault stored in chrome.storage.local
 * - Encrypted mnemonics stored separately per wallet
 * - In-memory keypair only when wallet is unlocked
 * - Auto-lock after timeout (configurable)
 * 
 * Storage keys:
 * - multiWalletVault: Wallet metadata (MultiWalletVault)
 * - walletEncryptedData: Encrypted mnemonics (EncryptedWalletData)
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
  MultiWalletVault,
  MultiWalletVaultV3,
  EncryptedWalletData,
  WalletEntry,
  WalletEntryV3,
  DerivedAccount,
  WatchOnlyAccount,
  WalletSettings,
  WalletState,
  WalletLockState,
  VAULT_VERSION,
  MULTI_WALLET_VAULT_VERSION,
  HD_WALLET_VAULT_VERSION,
  MAX_WALLETS,
  MAX_WALLET_LABEL_LENGTH,
  MAX_ACCOUNT_NAME_LENGTH,
  MAX_ACCOUNTS_PER_WALLET,
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
  arrayBufferToBase64,
} from './crypto';
import {
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
  deriveKeypair,
  getPublicKeyBase58,
  deriveEVMKeypair,
  getEVMAddressFromMnemonic,
  deriveSolanaKeypair,
  deriveEVMKeypairWithPath,
  deriveAddressesForIndex,
  deriveKeypairsForIndex,
  keypairFromPrivateKey,
  evmKeypairFromPrivateKey,
  type EVMKeypair,
} from './keychain';
import {
  STORAGE_KEYS,
  generateWalletId,
  detectVaultVersion,
  migrateV1ToV2,
  migrateV2ToV3,
  validateMasterPassword,
  generateMasterVerifier,
  initializeMultiWalletVault,
  initializeMultiWalletVaultV3,
  validateVaultIntegrity,
  validateVaultIntegrityV3,
  needsV2ToV3Migration,
} from './migration';

// ============================================
// IN-MEMORY STATE
// ============================================

/**
 * SECURITY: In-memory wallet state
 * 
 * This holds the unlocked keypairs during an active session.
 * The keypairs are cleared when the wallet is locked.
 * 
 * WARNING: This is the only place where unencrypted keys exist.
 */
interface InMemoryWalletState {
  /** Active wallet ID */
  activeWalletId: string | null;
  /** Active account ID within the wallet */
  activeAccountId: string | null;
  /** Unlocked Solana keypair (SENSITIVE - null when locked) */
  keypair: Keypair | null;
  /** Unlocked EVM keypair (SENSITIVE - null when locked) */
  evmKeypair: EVMKeypair | null;
  /** Public Solana address (safe to keep) */
  publicAddress: string | null;
  /** Public EVM address (safe to keep) */
  evmAddress: string | null;
  /** Active wallet label */
  walletLabel: string | null;
  /** Active account name */
  accountName: string | null;
  /** Active account index (for derivation) */
  accountIndex: number;
  /** Whether current account is watch-only */
  isWatchOnly: boolean;
  /** Auto-lock timer */
  lockTimer: ReturnType<typeof setTimeout> | null;
  /** Cached password hash for wallet switching (cleared on lock) */
  passwordHash: string | null;
  /** Cached mnemonic for deriving keys (cleared on lock) */
  cachedMnemonic: string | null;
}

// SECURITY: Module-level state (not exported)
const memoryState: InMemoryWalletState = {
  activeWalletId: null,
  activeAccountId: null,
  keypair: null,
  evmKeypair: null,
  publicAddress: null,
  evmAddress: null,
  walletLabel: null,
  accountName: null,
  accountIndex: 0,
  isWatchOnly: false,
  lockTimer: null,
  passwordHash: null,
  cachedMnemonic: null,
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
 * 
 * MV3 COMPLIANCE: State is persisted to chrome.storage.local so
 * restarting the extension doesn't reset lockouts.
 */
interface RateLimitState {
  failedAttempts: number;
  lastFailedAttempt: number;
  lockedUntil: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const BASE_BACKOFF_MS = 1000; // 1 second base
const RATE_LIMIT_STORAGE_KEY = 'walletRateLimitState';

/**
 * Load rate limit state from storage
 */
async function loadRateLimitState(): Promise<RateLimitState> {
  try {
    const result = await chrome.storage.local.get(RATE_LIMIT_STORAGE_KEY);
    const state = result[RATE_LIMIT_STORAGE_KEY] as RateLimitState | undefined;
    
    if (state && typeof state.failedAttempts === 'number') {
      return state;
    }
  } catch (error) {
    console.error('[Wallet] Failed to load rate limit state:', error);
  }
  
  return {
    failedAttempts: 0,
    lastFailedAttempt: 0,
    lockedUntil: 0,
  };
}

/**
 * Save rate limit state to storage (atomic write)
 */
async function saveRateLimitState(state: RateLimitState): Promise<void> {
  try {
    await chrome.storage.local.set({ [RATE_LIMIT_STORAGE_KEY]: state });
  } catch (error) {
    console.error('[Wallet] Failed to save rate limit state:', error);
  }
}

/**
 * Check if unlock attempts are currently rate limited
 * 
 * MV3 COMPLIANCE: Reads from persisted storage.
 * 
 * @returns Object with isLimited flag and remaining wait time in ms
 */
async function checkRateLimit(): Promise<{ isLimited: boolean; waitMs: number; attemptsRemaining: number }> {
  const now = Date.now();
  const state = await loadRateLimitState();
  
  // Check if locked out completely
  if (state.lockedUntil > now) {
    return {
      isLimited: true,
      waitMs: state.lockedUntil - now,
      attemptsRemaining: 0,
    };
  }
  
  // Reset if lockout has expired
  if (state.lockedUntil > 0 && state.lockedUntil <= now) {
    await saveRateLimitState({
      failedAttempts: 0,
      lockedUntil: 0,
      lastFailedAttempt: 0,
    });
    return {
      isLimited: false,
      waitMs: 0,
      attemptsRemaining: MAX_FAILED_ATTEMPTS,
    };
  }
  
  // Calculate exponential backoff if we have failed attempts
  if (state.failedAttempts > 0) {
    const backoffMs = BASE_BACKOFF_MS * Math.pow(2, state.failedAttempts - 1);
    const nextAllowedTime = state.lastFailedAttempt + backoffMs;
    
    if (now < nextAllowedTime) {
      return {
        isLimited: true,
        waitMs: nextAllowedTime - now,
        attemptsRemaining: MAX_FAILED_ATTEMPTS - state.failedAttempts,
      };
    }
  }
  
  return {
    isLimited: false,
    waitMs: 0,
    attemptsRemaining: MAX_FAILED_ATTEMPTS - state.failedAttempts,
  };
}

/**
 * Record a failed unlock attempt
 * 
 * MV3 COMPLIANCE: Persists state atomically.
 */
async function recordFailedAttempt(): Promise<void> {
  const now = Date.now();
  const state = await loadRateLimitState();
  
  state.failedAttempts++;
  state.lastFailedAttempt = now;
  
  // Lock out after MAX_FAILED_ATTEMPTS
  if (state.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  
  await saveRateLimitState(state);
}

/**
 * Reset rate limiting after successful unlock
 * 
 * MV3 COMPLIANCE: Persists state.
 */
async function resetRateLimit(): Promise<void> {
  await saveRateLimitState({
    failedAttempts: 0,
    lastFailedAttempt: 0,
    lockedUntil: 0,
  });
}

// ============================================
// STORAGE HELPERS
// ============================================

/**
 * Get multi-wallet vault from storage
 */
async function getMultiWalletVault(): Promise<MultiWalletVault | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MULTI_WALLET_VAULT);
  return result[STORAGE_KEYS.MULTI_WALLET_VAULT] || null;
}

/**
 * Save multi-wallet vault to storage
 */
async function saveMultiWalletVault(vault: MultiWalletVault): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.MULTI_WALLET_VAULT]: vault });
}

/**
 * Get encrypted wallet data from storage
 */
async function getEncryptedWalletData(): Promise<EncryptedWalletData> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_WALLET_DATA);
  return result[STORAGE_KEYS.ENCRYPTED_WALLET_DATA] || {};
}

/**
 * Save encrypted wallet data to storage
 */
async function saveEncryptedWalletData(data: EncryptedWalletData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENCRYPTED_WALLET_DATA]: data });
}

/**
 * Get legacy vault from storage (for migration)
 */
async function getLegacyVault(): Promise<EncryptedVault | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LEGACY_VAULT);
  return result[STORAGE_KEYS.LEGACY_VAULT] || null;
}

/**
 * Get v3 multi-wallet vault from storage
 */
async function getMultiWalletVaultV3(): Promise<MultiWalletVaultV3 | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MULTI_WALLET_VAULT);
  const vault = result[STORAGE_KEYS.MULTI_WALLET_VAULT];
  if (vault && vault.version === 3) {
    return vault as MultiWalletVaultV3;
  }
  return null;
}

/**
 * Save v3 multi-wallet vault to storage
 */
async function saveMultiWalletVaultV3(vault: MultiWalletVaultV3): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.MULTI_WALLET_VAULT]: vault });
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
 * Checks both v2 multi-wallet vault and v1 legacy vault.
 * 
 * @returns True if wallet has been created
 */
export async function walletExists(): Promise<boolean> {
  const versionInfo = await detectVaultVersion();
  return versionInfo.version > 0;
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
  const versionInfo = await detectVaultVersion();
  const settings = await getWalletSettings();
  
  let lockState: WalletLockState;
  let publicAddress: string | null = null;
  let activeWalletId: string | null = null;
  let activeWalletLabel: string | null = null;
  let activeAccountId: string | null = null;
  let activeAccountName: string | null = null;
  let walletCount = 0;
  let accountCount = 0;
  let evmAddress: string | null = null;
  let isWatchOnly = false;
  
  if (versionInfo.version === 0) {
    // No wallet exists
    lockState = 'uninitialized';
  } else if (versionInfo.version === 1) {
    // Legacy v1 vault - needs migration
    const legacyVault = versionInfo.legacyVault!;
    if (memoryState.keypair) {
      lockState = 'unlocked';
      publicAddress = memoryState.publicAddress;
    } else {
      lockState = 'locked';
      publicAddress = legacyVault.publicKey;
    }
    walletCount = 1;
    accountCount = 1;
    activeWalletLabel = 'Main Wallet';
    activeAccountName = 'Account 1';
  } else if (versionInfo.version === 2) {
    // v2 multi-wallet vault (needs migration to v3)
    const vault = versionInfo.multiWalletVault!;
    walletCount = vault.wallets.length;
    accountCount = 1; // v2 always has 1 account per wallet
    
    if (walletCount === 0) {
      lockState = 'uninitialized';
    } else if (memoryState.keypair) {
      lockState = 'unlocked';
      publicAddress = memoryState.publicAddress;
      activeWalletId = memoryState.activeWalletId;
      activeWalletLabel = memoryState.walletLabel;
      activeAccountId = memoryState.activeAccountId;
      activeAccountName = memoryState.accountName || 'Account 1';
      evmAddress = memoryState.evmAddress;
      isWatchOnly = memoryState.isWatchOnly;
    } else {
      lockState = 'locked';
      // Get active wallet info from vault
      if (vault.activeWalletId) {
        const activeWallet = vault.wallets.find(w => w.id === vault.activeWalletId);
        if (activeWallet) {
          publicAddress = activeWallet.publicKey;
          activeWalletId = activeWallet.id;
          activeWalletLabel = activeWallet.label;
          evmAddress = activeWallet.evmAddress || null;
          activeAccountName = 'Account 1';
        }
      }
      // Fall back to first wallet if no active wallet
      if (!publicAddress && vault.wallets.length > 0) {
        publicAddress = vault.wallets[0].publicKey;
        activeWalletId = vault.wallets[0].id;
        activeWalletLabel = vault.wallets[0].label;
        evmAddress = vault.wallets[0].evmAddress || null;
        activeAccountName = 'Account 1';
      }
    }
  } else {
    // v3 HD accounts vault
    const vault = versionInfo.multiWalletVaultV3!;
    walletCount = vault.wallets.length;
    
    if (walletCount === 0 && vault.watchOnlyAccounts.length === 0) {
      lockState = 'uninitialized';
    } else if (memoryState.keypair || memoryState.isWatchOnly) {
      lockState = 'unlocked';
      publicAddress = memoryState.publicAddress;
      activeWalletId = memoryState.activeWalletId;
      activeWalletLabel = memoryState.walletLabel;
      activeAccountId = memoryState.activeAccountId;
      activeAccountName = memoryState.accountName;
      evmAddress = memoryState.evmAddress;
      isWatchOnly = memoryState.isWatchOnly;
      
      // Get account count for active wallet
      if (activeWalletId) {
        const activeWallet = vault.wallets.find(w => w.id === activeWalletId);
        if (activeWallet) {
          accountCount = activeWallet.accounts.length;
        }
      }
    } else {
      lockState = 'locked';
      // Get active wallet/account info from vault
      if (vault.activeWalletId) {
        const activeWallet = vault.wallets.find(w => w.id === vault.activeWalletId);
        if (activeWallet) {
          activeWalletId = activeWallet.id;
          activeWalletLabel = activeWallet.label;
          accountCount = activeWallet.accounts.length;
          
          // Find active account
          const activeAccount = vault.activeAccountId
            ? activeWallet.accounts.find(a => a.id === vault.activeAccountId)
            : activeWallet.accounts[0];
          
          if (activeAccount) {
            publicAddress = activeAccount.solanaAddress;
            evmAddress = activeAccount.evmAddress;
            activeAccountId = activeAccount.id;
            activeAccountName = activeAccount.name;
          }
        }
      }
      // Fall back to first wallet/account if no active
      if (!publicAddress && vault.wallets.length > 0) {
        const firstWallet = vault.wallets[0];
        activeWalletId = firstWallet.id;
        activeWalletLabel = firstWallet.label;
        accountCount = firstWallet.accounts.length;
        
        if (firstWallet.accounts.length > 0) {
          const firstAccount = firstWallet.accounts[0];
          publicAddress = firstAccount.solanaAddress;
          evmAddress = firstAccount.evmAddress;
          activeAccountId = firstAccount.id;
          activeAccountName = firstAccount.name;
        }
      }
      // Check for watch-only accounts if no seed wallets
      if (!publicAddress && vault.watchOnlyAccounts.length > 0) {
        const firstWatchOnly = vault.watchOnlyAccounts[0];
        publicAddress = firstWatchOnly.address;
        activeAccountId = firstWatchOnly.id;
        activeAccountName = firstWatchOnly.name;
        isWatchOnly = true;
        if (firstWatchOnly.chainType === 'evm') {
          evmAddress = firstWatchOnly.address;
        }
      }
    }
  }
  
  return {
    lockState,
    publicAddress,
    network: settings.network,
    activeWalletId,
    activeWalletLabel,
    activeAccountId,
    activeAccountName,
    walletCount,
    accountCount,
    activeChain: settings.activeChain || 'solana',
    activeEVMChain: settings.activeEVMChain || null,
    evmAddress,
    networkEnvironment: settings.networkEnvironment || 'mainnet',
    isWatchOnly,
  };
}

/**
 * Create a new wallet (first wallet or with existing vault)
 * 
 * SECURITY: This is the most sensitive operation:
 * 1. Generates new mnemonic (256 bits entropy)
 * 2. Derives keypair from mnemonic
 * 3. Encrypts mnemonic with user password
 * 4. Stores encrypted vault
 * 5. Returns mnemonic for user backup (ONE TIME ONLY)
 * 
 * @param password - User's chosen password (SENSITIVE)
 * @returns Object with mnemonic (SENSITIVE), public address, and wallet ID
 */
export async function createWallet(password: string): Promise<{
  mnemonic: string;
  publicAddress: string;
  walletId: string;
}> {
  const versionInfo = await detectVaultVersion();
  
  // If v1 vault exists, need to migrate first
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Please unlock your existing wallet first to enable multi-wallet support.'
    );
  }
  
  // Validate password strength
  if (!validatePasswordStrength(password)) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password does not meet minimum requirements'
    );
  }
  
  let vault: MultiWalletVault;
  let encryptedData: EncryptedWalletData;
  
  if (versionInfo.version === 0) {
    // First wallet - initialize vault
    const initialized = await initializeMultiWalletVault(password);
    vault = initialized.vault;
    encryptedData = initialized.encryptedData;
  } else {
    // Add to existing vault
    vault = versionInfo.multiWalletVault!;
    encryptedData = await getEncryptedWalletData();
    
    // Verify password
    const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
    if (!isValid) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Incorrect password'
      );
    }
    
    // Check wallet limit
    if (vault.wallets.length >= MAX_WALLETS) {
      throw new WalletError(
        WalletErrorCode.MAX_WALLETS_REACHED,
        `Maximum of ${MAX_WALLETS} wallets reached`
      );
    }
  }
  
  // SECURITY: Generate new mnemonic (256 bits of entropy)
  let mnemonic = generateMnemonic();
  
  // SECURITY: Derive keypair from mnemonic
  const keypair = deriveKeypair(mnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  // Generate wallet ID and label
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const label = `Wallet ${walletNumber}`;
  
  // SECURITY: Encrypt mnemonic with password
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(mnemonic, key, iv);
  
  // Create wallet entry
  const walletEntry: WalletEntry = {
    id: walletId,
    label,
    publicKey: publicAddress,
    createdAt: Date.now(),
    derivationIndex: 0,
  };
  
  // Update vault
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  if (vault.createdAt === 0) {
    vault.createdAt = Date.now();
  }
  
  // Update encrypted data
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  // Derive EVM keypair and address
  const evmKeypair = deriveEVMKeypair(mnemonic);
  const evmAddress = evmKeypair.address;
  
  // Update wallet entry with EVM address
  walletEntry.evmAddress = evmAddress;
  vault.wallets[vault.wallets.length - 1] = walletEntry;
  
  // Save to storage
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  // SECURITY: Store keypairs in memory (wallet is now unlocked)
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = label;
  memoryState.passwordHash = password; // For wallet switching
  memoryState.cachedMnemonic = mnemonic; // Cache for EVM derivation
  
  // Start auto-lock timer
  await startAutoLockTimer();
  
  // SECURITY: Create a copy of mnemonic for return, then clear original reference
  const mnemonicForBackup = mnemonic.slice();
  mnemonic = '';
  
  return {
    mnemonic: mnemonicForBackup,
    publicAddress,
    walletId,
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
 * @param label - Optional wallet label
 * @returns Public address and wallet ID
 */
export async function importWallet(
  mnemonic: string,
  password: string,
  label?: string
): Promise<{ publicAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  // If v1 vault exists, need to migrate first
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Please unlock your existing wallet first to enable multi-wallet support.'
    );
  }
  
  // Normalize and validate mnemonic
  let normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalizedMnemonic)) {
    normalizedMnemonic = '';
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase. Please check and try again.'
    );
  }
  
  // Validate password strength
  if (!validatePasswordStrength(password)) {
    normalizedMnemonic = '';
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password does not meet minimum requirements'
    );
  }
  
  let vault: MultiWalletVault;
  let encryptedData: EncryptedWalletData;
  
  if (versionInfo.version === 0) {
    // First wallet - initialize vault
    const initialized = await initializeMultiWalletVault(password);
    vault = initialized.vault;
    encryptedData = initialized.encryptedData;
  } else {
    // Add to existing vault
    vault = versionInfo.multiWalletVault!;
    encryptedData = await getEncryptedWalletData();
    
    // Verify password
    const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
    if (!isValid) {
      normalizedMnemonic = '';
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Incorrect password'
      );
    }
    
    // Check wallet limit
    if (vault.wallets.length >= MAX_WALLETS) {
      normalizedMnemonic = '';
      throw new WalletError(
        WalletErrorCode.MAX_WALLETS_REACHED,
        `Maximum of ${MAX_WALLETS} wallets reached`
      );
    }
  }
  
  // SECURITY: Derive keypair from mnemonic
  const keypair = deriveKeypair(normalizedMnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  // Check if wallet already exists
  const existingWallet = vault.wallets.find(w => w.publicKey === publicAddress);
  if (existingWallet) {
    normalizedMnemonic = '';
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'This wallet has already been imported'
    );
  }
  
  // Generate wallet ID and label
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const walletLabel = label?.slice(0, MAX_WALLET_LABEL_LENGTH) || `Wallet ${walletNumber}`;
  
  // SECURITY: Encrypt mnemonic with password
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(normalizedMnemonic, key, iv);
  
  // SECURITY: Clear mnemonic reference after encryption
  normalizedMnemonic = '';
  
  // Create wallet entry
  const walletEntry: WalletEntry = {
    id: walletId,
    label: walletLabel,
    publicKey: publicAddress,
    createdAt: Date.now(),
    derivationIndex: 0,
  };
  
  // Update vault
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  if (vault.createdAt === 0) {
    vault.createdAt = Date.now();
  }
  
  // Update encrypted data
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  // Derive EVM keypair and address from mnemonic
  // Note: normalizedMnemonic has already been cleared at this point
  // We need to re-derive from the decrypted mnemonic
  const evmAddress = getEVMAddressFromMnemonic(await decryptMnemonicForEVM(walletId, password, encryptedData[walletId]));
  
  // Update wallet entry with EVM address
  walletEntry.evmAddress = evmAddress;
  vault.wallets[vault.wallets.length - 1] = walletEntry;
  
  // Save to storage
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  // Derive EVM keypair for memory
  const evmKeypair = deriveEVMKeypair(await decryptMnemonicForEVM(walletId, password, encryptedData[walletId]));
  
  // SECURITY: Store keypairs in memory (wallet is now unlocked)
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletLabel;
  memoryState.passwordHash = password;
  
  // Start auto-lock timer
  await startAutoLockTimer();
  
  return { publicAddress, walletId };
}

/**
 * Helper to decrypt mnemonic for EVM derivation
 */
async function decryptMnemonicForEVM(
  walletId: string,
  password: string,
  walletData: { salt: string; iv: string; ciphertext: string }
): Promise<string> {
  const key = await deriveKeyFromPassword(password, walletData.salt);
  return await decrypt(walletData.ciphertext, key, walletData.iv);
}

/**
 * Unlock the wallet with password
 * 
 * SECURITY: Decrypts the vault and loads keypair into memory.
 * Handles migration from v1 to v2 format if needed.
 * 
 * @param password - User's password (SENSITIVE)
 * @returns Public address
 */
export async function unlockWallet(password: string): Promise<{ publicAddress: string }> {
  // SECURITY: Check rate limiting before attempting unlock (persisted)
  const rateLimit = await checkRateLimit();
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
  
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version === 0) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found. Please create or import a wallet first.'
    );
  }
  
  // Already unlocked?
  if (memoryState.keypair) {
    await resetRateLimit();
    return { publicAddress: memoryState.publicAddress! };
  }
  
  // Handle v1 migration
  if (versionInfo.version === 1) {
    try {
      const { vault } = await migrateV1ToV2(password);
      // Now unlock with migrated vault
      return await unlockWalletV2(password, vault);
    } catch (error) {
      if (error instanceof WalletError && error.code === WalletErrorCode.INVALID_PASSWORD) {
        await recordFailedAttempt();
      }
      throw error;
    }
  }
  
  // v2 multi-wallet unlock
  return await unlockWalletV2(password, versionInfo.multiWalletVault!);
}

/**
 * Unlock v2 multi-wallet vault
 */
async function unlockWalletV2(
  password: string,
  vault: MultiWalletVault
): Promise<{ publicAddress: string }> {
  // Verify password against master verifier
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    await recordFailedAttempt();
    const rateLimitCheck = await checkRateLimit();
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      rateLimitCheck.attemptsRemaining > 0
        ? `Incorrect password. ${rateLimitCheck.attemptsRemaining} attempts remaining.`
        : 'Incorrect password. Account temporarily locked.'
    );
  }
  
  // Get active wallet ID (or first wallet)
  let activeWalletId = vault.activeWalletId;
  if (!activeWalletId && vault.wallets.length > 0) {
    activeWalletId = vault.wallets[0].id;
  }
  
  if (!activeWalletId) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallets found in vault'
    );
  }
  
  // Find wallet entry
  const walletEntry = vault.wallets.find(w => w.id === activeWalletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Active wallet not found'
    );
  }
  
  // Get encrypted data
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[activeWalletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet encrypted data not found'
    );
  }
  
  try {
    // Decrypt stored data (could be mnemonic or private key import)
    const key = await deriveKeyFromPassword(password, walletData.salt);
    let decryptedData = await decrypt(walletData.ciphertext, key, walletData.iv);
    
    let keypair: Keypair | null = null;
    let evmKeypair: EVMKeypair | null = null;
    let publicAddress: string;
    let evmAddress: string = '';
    
    // Check if this is a private key import or mnemonic
    if (decryptedData.startsWith('PRIVATE_KEY_IMPORT:')) {
      // Parse the stored private key
      const parts = decryptedData.split(':');
      const storedChainType = parts[1];
      const storedPrivateKey = parts.slice(2).join(':'); // In case private key contains ':'
      decryptedData = ''; // Clear decrypted data
      
      if (storedChainType === 'solana') {
        keypair = keypairFromPrivateKey(storedPrivateKey);
        publicAddress = getPublicKeyBase58(keypair);
        // Solana-only import doesn't have EVM keypair
        evmKeypair = null;
        evmAddress = '';
      } else if (storedChainType === 'evm') {
        evmKeypair = evmKeypairFromPrivateKey(storedPrivateKey);
        evmAddress = evmKeypair.address;
        // EVM-only import doesn't have Solana keypair
        keypair = null;
        publicAddress = walletEntry.publicKey; // Use stored public key (may be prefixed with 'evm:')
      } else {
        throw new WalletError(
          WalletErrorCode.DECRYPTION_FAILED,
          'Unknown private key type'
        );
      }
    } else {
      // Regular mnemonic-based wallet
      const mnemonic = decryptedData;
      decryptedData = ''; // Clear reference
      
      // Derive Solana keypair
      keypair = deriveKeypair(mnemonic);
      publicAddress = getPublicKeyBase58(keypair);
      
      // Verify public key matches
      if (publicAddress !== walletEntry.publicKey) {
        await recordFailedAttempt();
        throw new WalletError(
          WalletErrorCode.DECRYPTION_FAILED,
          'Wallet data corrupted. Please restore from backup.'
        );
      }
      
      // Derive EVM keypair
      evmKeypair = deriveEVMKeypair(mnemonic);
      evmAddress = evmKeypair.address;
    }
    
    // Update wallet entry with EVM address if not present
    if (!walletEntry.evmAddress && evmAddress) {
      walletEntry.evmAddress = evmAddress;
      const walletIndex = vault.wallets.findIndex(w => w.id === activeWalletId);
      if (walletIndex >= 0) {
        vault.wallets[walletIndex] = walletEntry;
        await saveMultiWalletVault(vault);
      }
    }
    
    // Reset rate limiting on success
    await resetRateLimit();
    
    // Store in memory
    memoryState.activeWalletId = activeWalletId;
    memoryState.keypair = keypair;
    memoryState.evmKeypair = evmKeypair;
    memoryState.publicAddress = publicAddress;
    memoryState.evmAddress = evmAddress;
    memoryState.walletLabel = walletEntry.label;
    memoryState.passwordHash = password;
    
    // Start auto-lock timer
    await startAutoLockTimer();
    
    return { publicAddress };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    await recordFailedAttempt();
    throw new WalletError(
      WalletErrorCode.DECRYPTION_FAILED,
      'Failed to decrypt wallet'
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
  
  // SECURITY: Clear all sensitive data from memory
  memoryState.keypair = null;
  memoryState.evmKeypair = null;
  memoryState.passwordHash = null;
  memoryState.cachedMnemonic = null;
  memoryState.isWatchOnly = false;
  // Keep publicAddress, evmAddress, labels, etc. for display purposes
}

/**
 * Delete all wallets
 * 
 * SECURITY: Requires password verification before deletion.
 * This permanently removes all encrypted vaults.
 * 
 * WARNING: This is irreversible. User must have their mnemonic backups.
 * 
 * @param password - Password for verification (SENSITIVE)
 */
export async function deleteWallet(password: string): Promise<void> {
  // SECURITY: Check rate limiting (persisted)
  const rateLimit = await checkRateLimit();
  if (rateLimit.isLimited) {
    const waitSeconds = Math.ceil(rateLimit.waitMs / 1000);
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      `Too many failed attempts. Please wait ${waitSeconds} seconds.`
    );
  }
  
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version === 0) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet to delete'
    );
  }
  
  // Handle v1 vault
  if (versionInfo.version === 1) {
    const legacyVault = versionInfo.legacyVault!;
    try {
      const key = await deriveKeyFromPassword(password, legacyVault.salt);
      await decrypt(legacyVault.ciphertext, key, legacyVault.iv);
    } catch {
      await recordFailedAttempt();
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Incorrect password. Wallet not deleted.'
      );
    }
    
    await resetRateLimit();
    lockWallet();
    await chrome.storage.local.remove([STORAGE_KEYS.LEGACY_VAULT, STORAGE_KEYS.SETTINGS]);
    memoryState.publicAddress = null;
    memoryState.activeWalletId = null;
    memoryState.walletLabel = null;
    return;
  }
  
  // Handle v2 vault
  const vault = versionInfo.multiWalletVault!;
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    await recordFailedAttempt();
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password. Wallet not deleted.'
    );
  }
  
  await resetRateLimit();
  lockWallet();
  
  await chrome.storage.local.remove([
    STORAGE_KEYS.MULTI_WALLET_VAULT,
    STORAGE_KEYS.ENCRYPTED_WALLET_DATA,
    STORAGE_KEYS.SETTINGS,
  ]);
  
  memoryState.publicAddress = null;
  memoryState.activeWalletId = null;
  memoryState.walletLabel = null;
}

// ============================================
// MULTI-WALLET MANAGEMENT
// ============================================

/**
 * List all wallets (public info only)
 * 
 * @returns Array of wallet entries
 */
export async function listWallets(): Promise<WalletEntry[]> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version === 0) {
    return [];
  }
  
  if (versionInfo.version === 1) {
    // Legacy vault - return single wallet entry
    const legacyVault = versionInfo.legacyVault!;
    return [{
      id: 'legacy',
      label: 'Main Wallet',
      publicKey: legacyVault.publicKey,
      createdAt: legacyVault.createdAt,
      derivationIndex: 0,
    }];
  }
  
  return versionInfo.multiWalletVault!.wallets;
}

/**
 * Add a new wallet (create)
 * 
 * @param password - Password for verification
 * @param label - Optional wallet label
 * @returns New wallet info with mnemonic for backup
 */
export async function addWallet(
  password: string,
  label?: string
): Promise<{ mnemonic: string; publicAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version === 0) {
    // No vault exists - create first wallet
    return createWallet(password);
  }
  
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please unlock your wallet first to enable multi-wallet support.'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Check wallet limit
  if (vault.wallets.length >= MAX_WALLETS) {
    throw new WalletError(
      WalletErrorCode.MAX_WALLETS_REACHED,
      `Maximum of ${MAX_WALLETS} wallets reached`
    );
  }
  
  // Generate new wallet
  let mnemonic = generateMnemonic();
  const keypair = deriveKeypair(mnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const walletLabel = label?.slice(0, MAX_WALLET_LABEL_LENGTH) || `Wallet ${walletNumber}`;
  
  // Encrypt mnemonic
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(mnemonic, key, iv);
  
  // Create wallet entry
  const walletEntry: WalletEntry = {
    id: walletId,
    label: walletLabel,
    publicKey: publicAddress,
    createdAt: Date.now(),
    derivationIndex: 0,
  };
  
  // Derive EVM keypair and address
  const evmKeypair = deriveEVMKeypair(mnemonic);
  const evmAddress = evmKeypair.address;
  walletEntry.evmAddress = evmAddress;
  
  // Update vault
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  
  // Update encrypted data
  const encryptedData = await getEncryptedWalletData();
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  // Save to storage
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  // Update memory state
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletLabel;
  memoryState.passwordHash = password;
  
  // Return mnemonic for backup
  const mnemonicForBackup = mnemonic.slice();
  mnemonic = '';
  
  return {
    mnemonic: mnemonicForBackup,
    publicAddress,
    walletId,
  };
}

/**
 * Import an additional wallet from mnemonic
 * 
 * @param mnemonic - Mnemonic phrase
 * @param password - Password for verification
 * @param label - Optional wallet label
 * @returns New wallet info
 */
export async function importAdditionalWallet(
  mnemonic: string,
  password: string,
  label?: string
): Promise<{ publicAddress: string; walletId: string }> {
  return importWallet(mnemonic, password, label);
}

/**
 * Switch active wallet
 * 
 * SECURITY: Requires password to switch wallets
 * 
 * @param walletId - ID of wallet to switch to
 * @param password - Password for verification
 * @returns New active wallet info
 */
export async function switchWallet(
  walletId: string,
  password: string
): Promise<{ publicAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  // Find wallet
  const walletEntry = vault.wallets.find(w => w.id === walletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Get encrypted data
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  // Decrypt stored data (could be mnemonic or private key import)
  const key = await deriveKeyFromPassword(password, walletData.salt);
  let decryptedData = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  let keypair: Keypair | null = null;
  let evmKeypair: EVMKeypair | null = null;
  let publicAddress: string;
  let evmAddress: string = '';
  
  // Check if this is a private key import or mnemonic
  if (decryptedData.startsWith('PRIVATE_KEY_IMPORT:')) {
    // Parse the stored private key
    const parts = decryptedData.split(':');
    const storedChainType = parts[1];
    const storedPrivateKey = parts.slice(2).join(':'); // In case private key contains ':'
    decryptedData = ''; // Clear decrypted data
    
    if (storedChainType === 'solana') {
      keypair = keypairFromPrivateKey(storedPrivateKey);
      publicAddress = getPublicKeyBase58(keypair);
      // Solana-only import doesn't have EVM keypair
      evmKeypair = null;
      evmAddress = '';
    } else if (storedChainType === 'evm') {
      evmKeypair = evmKeypairFromPrivateKey(storedPrivateKey);
      evmAddress = evmKeypair.address;
      // EVM-only import doesn't have Solana keypair
      keypair = null;
      publicAddress = walletEntry.publicKey; // Use stored public key (may be prefixed with 'evm:')
    } else {
      throw new WalletError(
        WalletErrorCode.DECRYPTION_FAILED,
        'Unknown private key type'
      );
    }
  } else {
    // Regular mnemonic-based wallet
    const mnemonic = decryptedData;
    decryptedData = ''; // Clear reference
    
    keypair = deriveKeypair(mnemonic);
    publicAddress = getPublicKeyBase58(keypair);
    
    // Verify public key
    if (publicAddress !== walletEntry.publicKey) {
      throw new WalletError(
        WalletErrorCode.DECRYPTION_FAILED,
        'Wallet data corrupted'
      );
    }
    
    // Derive EVM keypair
    evmKeypair = deriveEVMKeypair(mnemonic);
    evmAddress = evmKeypair.address;
  }
  
  // Update wallet entry with EVM address if not present
  if (!walletEntry.evmAddress) {
    walletEntry.evmAddress = evmAddress;
    const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
    if (walletIndex >= 0) {
      vault.wallets[walletIndex] = walletEntry;
    }
  }
  
  // Update vault active wallet
  vault.activeWalletId = walletId;
  await saveMultiWalletVault(vault);
  
  // Update memory state
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletEntry.label;
  memoryState.passwordHash = password;
  
  // Reset auto-lock timer
  await startAutoLockTimer();
  
  return { publicAddress, walletId };
}

/**
 * Rename a wallet
 * 
 * @param walletId - ID of wallet to rename
 * @param label - New label
 */
export async function renameWallet(walletId: string, label: string): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  // Find wallet
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  // Validate label
  const trimmedLabel = label.trim().slice(0, MAX_WALLET_LABEL_LENGTH);
  if (!trimmedLabel) {
    throw new WalletError(
      WalletErrorCode.INVALID_WALLET_LABEL,
      'Wallet label cannot be empty'
    );
  }
  
  // Update label
  vault.wallets[walletIndex].label = trimmedLabel;
  await saveMultiWalletVault(vault);
  
  // Update memory state if this is the active wallet
  if (memoryState.activeWalletId === walletId) {
    memoryState.walletLabel = trimmedLabel;
  }
}

/**
 * Delete a specific wallet
 * 
 * SECURITY: Requires password verification
 * 
 * @param walletId - ID of wallet to delete
 * @param password - Password for verification
 */
export async function deleteOneWallet(walletId: string, password: string): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  // Check if this is the last wallet
  if (vault.wallets.length <= 1) {
    throw new WalletError(
      WalletErrorCode.CANNOT_DELETE_LAST_WALLET,
      'Cannot delete the last wallet. Use "Delete All" to remove your wallet.'
    );
  }
  
  // Find wallet
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Remove wallet from vault
  vault.wallets.splice(walletIndex, 1);
  
  // If deleting active wallet, switch to first remaining wallet
  if (vault.activeWalletId === walletId) {
    vault.activeWalletId = vault.wallets[0].id;
    
    // If unlocked, switch to new active wallet
    if ((memoryState.keypair || memoryState.evmKeypair) && memoryState.passwordHash) {
      const encryptedData = await getEncryptedWalletData();
      const newActiveData = encryptedData[vault.activeWalletId];
      if (newActiveData) {
        const key = await deriveKeyFromPassword(password, newActiveData.salt);
        let decryptedData = await decrypt(newActiveData.ciphertext, key, newActiveData.iv);
        
        const newActiveWallet = vault.wallets[0];
        let keypair: Keypair | null = null;
        let evmKeypair: EVMKeypair | null = null;
        let publicAddress: string;
        let evmAddress: string = '';
        
        // Check if this is a private key import or mnemonic
        if (decryptedData.startsWith('PRIVATE_KEY_IMPORT:')) {
          const parts = decryptedData.split(':');
          const storedChainType = parts[1];
          const storedPrivateKey = parts.slice(2).join(':');
          decryptedData = '';
          
          if (storedChainType === 'solana') {
            keypair = keypairFromPrivateKey(storedPrivateKey);
            publicAddress = getPublicKeyBase58(keypair);
          } else if (storedChainType === 'evm') {
            evmKeypair = evmKeypairFromPrivateKey(storedPrivateKey);
            evmAddress = evmKeypair.address;
            publicAddress = newActiveWallet.publicKey;
          } else {
            publicAddress = newActiveWallet.publicKey;
          }
        } else {
          // Regular mnemonic-based wallet
          const mnemonic = decryptedData;
          decryptedData = '';
          keypair = deriveKeypair(mnemonic);
          evmKeypair = deriveEVMKeypair(mnemonic);
          publicAddress = getPublicKeyBase58(keypair);
          evmAddress = evmKeypair.address;
        }
        
        memoryState.activeWalletId = newActiveWallet.id;
        memoryState.keypair = keypair;
        memoryState.evmKeypair = evmKeypair;
        memoryState.publicAddress = publicAddress;
        memoryState.evmAddress = evmAddress;
        memoryState.walletLabel = newActiveWallet.label;
      }
    }
  }
  
  // Remove encrypted data
  const encryptedData = await getEncryptedWalletData();
  delete encryptedData[walletId];
  
  // Save changes
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
}

/**
 * Export wallet mnemonic
 * 
 * SECURITY: Requires password verification
 * WARNING: The returned mnemonic is extremely sensitive
 * 
 * @param walletId - ID of wallet to export
 * @param password - Password for verification
 * @returns Mnemonic phrase (SENSITIVE)
 */
export async function exportWalletMnemonic(
  walletId: string,
  password: string
): Promise<{ mnemonic: string }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  // Find wallet
  const walletEntry = vault.wallets.find(w => w.id === walletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Get encrypted data
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  // Decrypt mnemonic
  const key = await deriveKeyFromPassword(password, walletData.salt);
  const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  return { mnemonic };
}

/**
 * Get active wallet info
 * 
 * @returns Active wallet ID, address, and label
 */
export async function getActiveWallet(): Promise<{
  walletId: string | null;
  publicAddress: string | null;
  label: string | null;
}> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version === 0) {
    return { walletId: null, publicAddress: null, label: null };
  }
  
  if (versionInfo.version === 1) {
    const legacyVault = versionInfo.legacyVault!;
    return {
      walletId: 'legacy',
      publicAddress: legacyVault.publicKey,
      label: 'Main Wallet',
    };
  }
  
  const vault = versionInfo.multiWalletVault!;
  if (!vault.activeWalletId) {
    if (vault.wallets.length > 0) {
      return {
        walletId: vault.wallets[0].id,
        publicAddress: vault.wallets[0].publicKey,
        label: vault.wallets[0].label,
      };
    }
    return { walletId: null, publicAddress: null, label: null };
  }
  
  const activeWallet = vault.wallets.find(w => w.id === vault.activeWalletId);
  if (!activeWallet) {
    return { walletId: null, publicAddress: null, label: null };
  }
  
  return {
    walletId: activeWallet.id,
    publicAddress: activeWallet.publicKey,
    label: activeWallet.label,
  };
}

// ============================================
// HD ACCOUNT MANAGEMENT (v3)
// ============================================

/**
 * Create a new derived account within a seed wallet
 * 
 * SECURITY: Requires password to decrypt mnemonic and derive new addresses.
 * 
 * @param walletId - ID of the seed wallet
 * @param password - Password for verification
 * @param name - Optional account name
 * @returns The new derived account
 */
export async function createDerivedAccount(
  walletId: string,
  password: string,
  name?: string
): Promise<DerivedAccount> {
  const versionInfo = await detectVaultVersion();
  
  // Must be v3 vault
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find wallet
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  const wallet = vault.wallets[walletIndex];
  
  // Check account limit
  if (wallet.accounts.length >= MAX_ACCOUNTS_PER_WALLET) {
    throw new WalletError(
      WalletErrorCode.MAX_ACCOUNTS_REACHED,
      `Maximum of ${MAX_ACCOUNTS_PER_WALLET} accounts per wallet reached`
    );
  }
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Get encrypted data
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  // Decrypt mnemonic and derive new addresses
  const key = await deriveKeyFromPassword(password, walletData.salt);
  let mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  const accountIndex = wallet.nextAccountIndex;
  const addresses = deriveAddressesForIndex(
    mnemonic,
    accountIndex,
    wallet.evmPathType,
    wallet.solanaPathType
  );
  
  // Clear mnemonic
  mnemonic = '';
  
  // Generate account ID and name
  const accountId = generateWalletId();
  const accountNumber = wallet.accounts.length + 1;
  const accountName = name?.slice(0, MAX_ACCOUNT_NAME_LENGTH) || `Account ${accountNumber}`;
  
  // Create account
  const account: DerivedAccount = {
    id: accountId,
    name: accountName,
    index: accountIndex,
    solanaAddress: addresses.solanaAddress,
    evmAddress: addresses.evmAddress,
    createdAt: Date.now(),
  };
  
  // Update wallet
  wallet.accounts.push(account);
  wallet.nextAccountIndex = accountIndex + 1;
  vault.wallets[walletIndex] = wallet;
  
  // Save vault
  await saveMultiWalletVaultV3(vault);
  
  console.log(`[AINTIVIRUS Wallet] Created new account ${accountId} at index ${accountIndex}`);
  
  return account;
}

/**
 * Rename a derived account
 * 
 * @param walletId - ID of the seed wallet
 * @param accountId - ID of the account to rename
 * @param name - New account name
 */
export async function renameAccount(
  walletId: string,
  accountId: string,
  name: string
): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find wallet
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  const wallet = vault.wallets[walletIndex];
  
  // Find account
  const accountIndex = wallet.accounts.findIndex(a => a.id === accountId);
  if (accountIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Account not found'
    );
  }
  
  // Validate name
  const trimmedName = name.trim().slice(0, MAX_ACCOUNT_NAME_LENGTH);
  if (!trimmedName) {
    throw new WalletError(
      WalletErrorCode.INVALID_ACCOUNT_NAME,
      'Account name cannot be empty'
    );
  }
  
  // Update account name
  wallet.accounts[accountIndex].name = trimmedName;
  vault.wallets[walletIndex] = wallet;
  
  // Save vault
  await saveMultiWalletVaultV3(vault);
  
  // Update memory state if this is the active account
  if (memoryState.activeAccountId === accountId) {
    memoryState.accountName = trimmedName;
  }
  
  console.log(`[AINTIVIRUS Wallet] Renamed account ${accountId} to "${trimmedName}"`);
}

/**
 * Switch to a different account within a wallet
 * 
 * Note: Does NOT require password since wallet is already unlocked.
 * The mnemonic is cached in memory during the session.
 * 
 * @param walletId - ID of the seed wallet
 * @param accountId - ID of the account to switch to
 */
export async function switchAccount(
  walletId: string,
  accountId: string
): Promise<{ solanaAddress: string; evmAddress: string }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find wallet
  const wallet = vault.wallets.find(w => w.id === walletId);
  if (!wallet) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  // Find account
  const account = wallet.accounts.find(a => a.id === accountId);
  if (!account) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Account not found'
    );
  }
  
  // Check if we have cached mnemonic for deriving keys
  if (!memoryState.cachedMnemonic && !memoryState.passwordHash) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to switch accounts.'
    );
  }
  
  // If switching to a different wallet, we need to re-derive from that wallet's mnemonic
  if (walletId !== memoryState.activeWalletId) {
    if (!memoryState.passwordHash) {
      throw new WalletError(
        WalletErrorCode.WALLET_LOCKED,
        'Password required to switch wallets'
      );
    }
    
    // Get encrypted data for the new wallet
    const encryptedData = await getEncryptedWalletData();
    const walletData = encryptedData[walletId];
    if (!walletData) {
      throw new WalletError(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Wallet data not found'
      );
    }
    
    // Decrypt mnemonic
    const key = await deriveKeyFromPassword(memoryState.passwordHash, walletData.salt);
    const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
    
    // Derive keypairs for the account
    const { solanaKeypair, evmKeypair } = deriveKeypairsForIndex(
      mnemonic,
      account.index,
      wallet.evmPathType,
      wallet.solanaPathType
    );
    
    // Update memory state
    memoryState.activeWalletId = walletId;
    memoryState.activeAccountId = accountId;
    memoryState.keypair = solanaKeypair;
    memoryState.evmKeypair = evmKeypair;
    memoryState.publicAddress = account.solanaAddress;
    memoryState.evmAddress = account.evmAddress;
    memoryState.walletLabel = wallet.label;
    memoryState.accountName = account.name;
    memoryState.accountIndex = account.index;
    memoryState.cachedMnemonic = mnemonic;
    memoryState.isWatchOnly = false;
  } else {
    // Same wallet, just switch account
    if (!memoryState.cachedMnemonic) {
      throw new WalletError(
        WalletErrorCode.WALLET_LOCKED,
        'Session expired. Please unlock wallet again.'
      );
    }
    
    // Derive keypairs for the account
    const { solanaKeypair, evmKeypair } = deriveKeypairsForIndex(
      memoryState.cachedMnemonic,
      account.index,
      wallet.evmPathType,
      wallet.solanaPathType
    );
    
    // Update memory state
    memoryState.activeAccountId = accountId;
    memoryState.keypair = solanaKeypair;
    memoryState.evmKeypair = evmKeypair;
    memoryState.publicAddress = account.solanaAddress;
    memoryState.evmAddress = account.evmAddress;
    memoryState.accountName = account.name;
    memoryState.accountIndex = account.index;
    memoryState.isWatchOnly = false;
  }
  
  // Update vault active account
  vault.activeWalletId = walletId;
  vault.activeAccountId = accountId;
  await saveMultiWalletVaultV3(vault);
  
  console.log(`[AINTIVIRUS Wallet] Switched to account ${accountId}`);
  
  return {
    solanaAddress: account.solanaAddress,
    evmAddress: account.evmAddress,
  };
}

/**
 * Delete a derived account
 * 
 * SECURITY: Requires password verification.
 * Cannot delete the last account in a wallet.
 * 
 * @param walletId - ID of the seed wallet
 * @param accountId - ID of the account to delete
 * @param password - Password for verification
 */
export async function deleteAccount(
  walletId: string,
  accountId: string,
  password: string
): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find wallet
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  const wallet = vault.wallets[walletIndex];
  
  // Check if this is the last account
  if (wallet.accounts.length <= 1) {
    throw new WalletError(
      WalletErrorCode.CANNOT_DELETE_LAST_ACCOUNT,
      'Cannot delete the last account. Delete the wallet instead.'
    );
  }
  
  // Find account
  const accountIndex = wallet.accounts.findIndex(a => a.id === accountId);
  if (accountIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Account not found'
    );
  }
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Remove account
  wallet.accounts.splice(accountIndex, 1);
  vault.wallets[walletIndex] = wallet;
  
  // If deleting active account, switch to first account
  if (vault.activeAccountId === accountId) {
    vault.activeAccountId = wallet.accounts[0].id;
    
    // Update memory state if unlocked
    if (memoryState.activeAccountId === accountId && memoryState.cachedMnemonic) {
      const newActiveAccount = wallet.accounts[0];
      const { solanaKeypair, evmKeypair } = deriveKeypairsForIndex(
        memoryState.cachedMnemonic,
        newActiveAccount.index,
        wallet.evmPathType,
        wallet.solanaPathType
      );
      
      memoryState.activeAccountId = newActiveAccount.id;
      memoryState.keypair = solanaKeypair;
      memoryState.evmKeypair = evmKeypair;
      memoryState.publicAddress = newActiveAccount.solanaAddress;
      memoryState.evmAddress = newActiveAccount.evmAddress;
      memoryState.accountName = newActiveAccount.name;
      memoryState.accountIndex = newActiveAccount.index;
    }
  }
  
  // Save vault
  await saveMultiWalletVaultV3(vault);
  
  console.log(`[AINTIVIRUS Wallet] Deleted account ${accountId}`);
}

/**
 * List all accounts in a wallet
 * 
 * @param walletId - ID of the seed wallet
 * @returns Array of derived accounts
 */
export async function listAccounts(walletId: string): Promise<DerivedAccount[]> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find wallet
  const wallet = vault.wallets.find(w => w.id === walletId);
  if (!wallet) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  return wallet.accounts;
}

/**
 * Get active account info
 * 
 * @returns Active account details
 */
export async function getActiveAccount(): Promise<{
  accountId: string | null;
  solanaAddress: string | null;
  evmAddress: string | null;
  name: string | null;
  isWatchOnly: boolean;
}> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version === 0) {
    return { accountId: null, solanaAddress: null, evmAddress: null, name: null, isWatchOnly: false };
  }
  
  if (versionInfo.version === 1 || versionInfo.version === 2) {
    // For v1/v2, return the wallet's single address as an "account"
    const state = await getWalletState();
    return {
      accountId: null,
      solanaAddress: state.publicAddress,
      evmAddress: state.evmAddress,
      name: 'Account 1',
      isWatchOnly: false,
    };
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Check for watch-only account first
  if (memoryState.isWatchOnly && memoryState.activeAccountId) {
    const watchOnly = vault.watchOnlyAccounts.find(w => w.id === memoryState.activeAccountId);
    if (watchOnly) {
      return {
        accountId: watchOnly.id,
        solanaAddress: watchOnly.chainType === 'solana' ? watchOnly.address : null,
        evmAddress: watchOnly.chainType === 'evm' ? watchOnly.address : null,
        name: watchOnly.name,
        isWatchOnly: true,
      };
    }
  }
  
  // Find active wallet and account
  if (!vault.activeWalletId) {
    return { accountId: null, solanaAddress: null, evmAddress: null, name: null, isWatchOnly: false };
  }
  
  const wallet = vault.wallets.find(w => w.id === vault.activeWalletId);
  if (!wallet) {
    return { accountId: null, solanaAddress: null, evmAddress: null, name: null, isWatchOnly: false };
  }
  
  const account = vault.activeAccountId
    ? wallet.accounts.find(a => a.id === vault.activeAccountId)
    : wallet.accounts[0];
  
  if (!account) {
    return { accountId: null, solanaAddress: null, evmAddress: null, name: null, isWatchOnly: false };
  }
  
  return {
    accountId: account.id,
    solanaAddress: account.solanaAddress,
    evmAddress: account.evmAddress,
    name: account.name,
    isWatchOnly: false,
  };
}

/**
 * Check if a given account ID is watch-only
 * 
 * @param accountId - Account ID to check
 * @returns True if watch-only
 */
export async function isWatchOnlyAccount(accountId: string): Promise<boolean> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    return false;
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  return vault.watchOnlyAccounts.some(w => w.id === accountId);
}

// ============================================
// WATCH-ONLY ACCOUNT MANAGEMENT
// ============================================

/**
 * Add a watch-only account
 * 
 * Watch-only accounts can view balances but cannot sign transactions.
 * 
 * @param address - The address to watch
 * @param chainType - 'solana' or 'evm'
 * @param name - Optional account name
 * @returns The new watch-only account
 */
export async function addWatchOnlyAccount(
  address: string,
  chainType: 'solana' | 'evm',
  name?: string
): Promise<WatchOnlyAccount> {
  // Import validation functions
  const { isValidSolanaAddress, isValidEVMAddress } = await import('./keychain');
  
  // Validate address format
  if (chainType === 'solana' && !isValidSolanaAddress(address)) {
    throw new WalletError(
      WalletErrorCode.INVALID_ADDRESS,
      'Invalid Solana address format'
    );
  }
  
  if (chainType === 'evm' && !isValidEVMAddress(address)) {
    throw new WalletError(
      WalletErrorCode.INVALID_ADDRESS,
      'Invalid EVM address format'
    );
  }
  
  const versionInfo = await detectVaultVersion();
  
  // Need v3 vault for watch-only accounts
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Check if address already exists
  const existingWatchOnly = vault.watchOnlyAccounts.find(
    w => w.address.toLowerCase() === address.toLowerCase()
  );
  if (existingWatchOnly) {
    throw new WalletError(
      WalletErrorCode.ADDRESS_ALREADY_EXISTS,
      'This address is already being watched'
    );
  }
  
  // Check if address exists in any derived account
  for (const wallet of vault.wallets) {
    for (const account of wallet.accounts) {
      if (
        account.solanaAddress.toLowerCase() === address.toLowerCase() ||
        account.evmAddress.toLowerCase() === address.toLowerCase()
      ) {
        throw new WalletError(
          WalletErrorCode.ADDRESS_ALREADY_EXISTS,
          'This address belongs to an existing account'
        );
      }
    }
  }
  
  // Generate account ID and name
  const accountId = generateWalletId();
  const accountName = name?.slice(0, MAX_ACCOUNT_NAME_LENGTH) || `Watch ${vault.watchOnlyAccounts.length + 1}`;
  
  // Create watch-only account
  const watchOnlyAccount: WatchOnlyAccount = {
    id: accountId,
    name: accountName,
    chainType,
    address,
    createdAt: Date.now(),
  };
  
  // Add to vault
  vault.watchOnlyAccounts.push(watchOnlyAccount);
  
  // Save vault
  await saveMultiWalletVaultV3(vault);
  
  console.log(`[AINTIVIRUS Wallet] Added watch-only account ${accountId} for ${address}`);
  
  return watchOnlyAccount;
}

/**
 * Remove a watch-only account
 * 
 * @param accountId - ID of the watch-only account to remove
 */
export async function removeWatchOnlyAccount(accountId: string): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find watch-only account
  const accountIndex = vault.watchOnlyAccounts.findIndex(w => w.id === accountId);
  if (accountIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Watch-only account not found'
    );
  }
  
  // Remove account
  vault.watchOnlyAccounts.splice(accountIndex, 1);
  
  // If this was the active account, clear active state
  if (vault.activeAccountId === accountId) {
    // Switch to first available account
    if (vault.wallets.length > 0 && vault.wallets[0].accounts.length > 0) {
      vault.activeWalletId = vault.wallets[0].id;
      vault.activeAccountId = vault.wallets[0].accounts[0].id;
    } else if (vault.watchOnlyAccounts.length > 0) {
      vault.activeWalletId = null;
      vault.activeAccountId = vault.watchOnlyAccounts[0].id;
    } else {
      vault.activeWalletId = null;
      vault.activeAccountId = null;
    }
  }
  
  // Update memory state if this was the active watch-only
  if (memoryState.activeAccountId === accountId) {
    memoryState.activeAccountId = vault.activeAccountId;
    memoryState.isWatchOnly = false;
    memoryState.publicAddress = null;
    memoryState.evmAddress = null;
    memoryState.accountName = null;
  }
  
  // Save vault
  await saveMultiWalletVaultV3(vault);
  
  console.log(`[AINTIVIRUS Wallet] Removed watch-only account ${accountId}`);
}

/**
 * Convert a watch-only account to a full account
 * 
 * This is used when a user imports the seed phrase for an address they were watching.
 * The watch-only account is removed and the address is verified against the imported mnemonic.
 * 
 * @param watchOnlyId - ID of the watch-only account
 * @param mnemonic - The seed phrase to import
 * @param password - Password for encryption
 * @returns The new wallet and account IDs
 */
export async function convertWatchOnlyToFull(
  watchOnlyId: string,
  mnemonic: string,
  password: string
): Promise<{ walletId: string; accountId: string }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find watch-only account
  const watchOnlyIndex = vault.watchOnlyAccounts.findIndex(w => w.id === watchOnlyId);
  if (watchOnlyIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Watch-only account not found'
    );
  }
  
  const watchOnly = vault.watchOnlyAccounts[watchOnlyIndex];
  
  // Validate mnemonic
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalizedMnemonic)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase'
    );
  }
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Derive addresses from mnemonic and find matching index
  // We'll check indices 0-9 for a match
  let matchingIndex: number | null = null;
  const maxIndexToCheck = 10;
  
  for (let i = 0; i < maxIndexToCheck; i++) {
    const addresses = deriveAddressesForIndex(normalizedMnemonic, i, 'standard', 'standard');
    
    if (
      addresses.solanaAddress.toLowerCase() === watchOnly.address.toLowerCase() ||
      addresses.evmAddress.toLowerCase() === watchOnly.address.toLowerCase()
    ) {
      matchingIndex = i;
      break;
    }
  }
  
  if (matchingIndex === null) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'This mnemonic does not generate the watched address'
    );
  }
  
  // Create new wallet entry
  const walletId = generateWalletId();
  const accountId = generateWalletId();
  const addresses = deriveAddressesForIndex(normalizedMnemonic, matchingIndex, 'standard', 'standard');
  
  const account: DerivedAccount = {
    id: accountId,
    name: watchOnly.name,
    index: matchingIndex,
    solanaAddress: addresses.solanaAddress,
    evmAddress: addresses.evmAddress,
    createdAt: Date.now(),
  };
  
  const walletEntry: WalletEntryV3 = {
    id: walletId,
    label: `Wallet ${vault.wallets.length + 1}`,
    accounts: [account],
    evmPathType: 'standard',
    solanaPathType: 'standard',
    nextAccountIndex: matchingIndex + 1,
    createdAt: Date.now(),
  };
  
  // Encrypt mnemonic
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(normalizedMnemonic, key, iv);
  
  // Update vault
  vault.wallets.push(walletEntry);
  vault.watchOnlyAccounts.splice(watchOnlyIndex, 1);
  vault.activeWalletId = walletId;
  vault.activeAccountId = accountId;
  
  // Update encrypted data
  const encryptedData = await getEncryptedWalletData();
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  // Save to storage
  await saveMultiWalletVaultV3(vault);
  await saveEncryptedWalletData(encryptedData);
  
  // Derive keypairs and update memory state
  const { solanaKeypair, evmKeypair } = deriveKeypairsForIndex(
    normalizedMnemonic,
    matchingIndex,
    'standard',
    'standard'
  );
  
  memoryState.activeWalletId = walletId;
  memoryState.activeAccountId = accountId;
  memoryState.keypair = solanaKeypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = addresses.solanaAddress;
  memoryState.evmAddress = addresses.evmAddress;
  memoryState.walletLabel = walletEntry.label;
  memoryState.accountName = account.name;
  memoryState.accountIndex = matchingIndex;
  memoryState.cachedMnemonic = normalizedMnemonic;
  memoryState.passwordHash = password;
  memoryState.isWatchOnly = false;
  
  console.log(`[AINTIVIRUS Wallet] Converted watch-only ${watchOnlyId} to full wallet ${walletId}`);
  
  return { walletId, accountId };
}

/**
 * List all watch-only accounts
 * 
 * @returns Array of watch-only accounts
 */
export async function listWatchOnlyAccounts(): Promise<WatchOnlyAccount[]> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    return [];
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  return vault.watchOnlyAccounts;
}

/**
 * Switch to a watch-only account
 * 
 * @param accountId - ID of the watch-only account
 */
export async function switchToWatchOnly(accountId: string): Promise<{ address: string; chainType: 'solana' | 'evm' }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  // Find watch-only account
  const watchOnly = vault.watchOnlyAccounts.find(w => w.id === accountId);
  if (!watchOnly) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Watch-only account not found'
    );
  }
  
  // Update vault
  vault.activeWalletId = null;
  vault.activeAccountId = accountId;
  await saveMultiWalletVaultV3(vault);
  
  // Update memory state
  memoryState.activeWalletId = null;
  memoryState.activeAccountId = accountId;
  memoryState.keypair = null;
  memoryState.evmKeypair = null;
  memoryState.publicAddress = watchOnly.chainType === 'solana' ? watchOnly.address : null;
  memoryState.evmAddress = watchOnly.chainType === 'evm' ? watchOnly.address : null;
  memoryState.walletLabel = null;
  memoryState.accountName = watchOnly.name;
  memoryState.accountIndex = 0;
  memoryState.cachedMnemonic = null;
  memoryState.isWatchOnly = true;
  
  console.log(`[AINTIVIRUS Wallet] Switched to watch-only account ${accountId}`);
  
  return {
    address: watchOnly.address,
    chainType: watchOnly.chainType,
  };
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
 * Get the unlocked EVM keypair for signing operations
 * 
 * SECURITY: This is the only way to access the EVM private key.
 * The keypair should only be used for signing and never stored
 * or transmitted.
 * 
 * @returns EVM Keypair if unlocked, null if locked
 */
export function getUnlockedEVMKeypair(): EVMKeypair | null {
  return memoryState.evmKeypair;
}

/**
 * Get the EVM address (works even when locked if stored)
 * 
 * @returns EVM address or null
 */
export function getEVMAddress(): string | null {
  return memoryState.evmAddress;
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
  
  const activeWallet = await getActiveWallet();
  return activeWallet.publicAddress;
}

// ============================================
// PRIVATE KEY IMPORT/EXPORT
// ============================================

/**
 * Import a wallet from a raw private key (no mnemonic)
 * 
 * SECURITY: This imports a "watch-only-like" wallet derived from a private key.
 * Since there's no mnemonic, we store a placeholder and the derived keypair.
 * 
 * Note: For private key imports, we only support the Solana keypair.
 * The EVM address will be derived if the user provides an EVM private key,
 * or it won't exist for Solana-only imports.
 * 
 * @param privateKey - Raw private key (SENSITIVE)
 * @param password - User's password (SENSITIVE)
 * @param label - Optional wallet label
 * @returns Public addresses and wallet ID
 */
export async function importWalletFromPrivateKey(
  privateKey: string,
  password: string,
  label?: string
): Promise<{ publicAddress: string; evmAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  // If v1 vault exists, need to migrate first
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Please unlock your existing wallet first to enable multi-wallet support.'
    );
  }
  
  // Validate password strength
  if (!validatePasswordStrength(password)) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password does not meet minimum requirements'
    );
  }
  
  // Import keychain functions
  const { 
    keypairFromPrivateKey, 
    evmKeypairFromPrivateKey, 
    getPublicKeyBase58,
    validatePrivateKey 
  } = await import('./keychain');
  
  // Validate and detect private key type
  const validation = validatePrivateKey(privateKey);
  if (!validation.valid) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      validation.error || 'Invalid private key format'
    );
  }
  
  let solanaKeypair: Keypair | null = null;
  let evmKeypair: EVMKeypair | null = null;
  let publicAddress: string;
  let evmAddress: string = '';
  
  // Create keypairs based on detected type
  if (validation.chainType === 'solana') {
    solanaKeypair = keypairFromPrivateKey(privateKey);
    publicAddress = getPublicKeyBase58(solanaKeypair);
  } else if (validation.chainType === 'evm') {
    evmKeypair = evmKeypairFromPrivateKey(privateKey);
    evmAddress = evmKeypair.address;
    // For EVM-only imports, we don't have a Solana address
    publicAddress = ''; // Will be set below
  } else {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Could not determine private key type'
    );
  }
  
  let vault: MultiWalletVault;
  let encryptedData: Record<string, { salt: string; iv: string; ciphertext: string }>;
  
  if (versionInfo.version === 0) {
    // First wallet - initialize vault
    const initialized = await initializeMultiWalletVault(password);
    vault = initialized.vault;
    encryptedData = initialized.encryptedData;
  } else {
    // Add to existing vault
    vault = versionInfo.multiWalletVault!;
    encryptedData = await getEncryptedWalletData();
    
    // Verify password
    const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
    if (!isValid) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Incorrect password'
      );
    }
    
    // Check wallet limit
    if (vault.wallets.length >= MAX_WALLETS) {
      throw new WalletError(
        WalletErrorCode.MAX_WALLETS_REACHED,
        `Maximum of ${MAX_WALLETS} wallets reached`
      );
    }
  }
  
  // Check if wallet already exists (by address)
  const searchAddress = publicAddress || evmAddress;
  const existingWallet = vault.wallets.find(w => 
    w.publicKey === searchAddress || w.evmAddress === evmAddress
  );
  if (existingWallet) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'A wallet with this address already exists'
    );
  }
  
  // Generate wallet ID and label
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const walletLabel = label?.slice(0, MAX_WALLET_LABEL_LENGTH) || `Imported Wallet ${walletNumber}`;
  
  // For private key imports, we store a special marker instead of mnemonic
  // Format: "PRIVATE_KEY_IMPORT:{type}:{privateKey}"
  const storageData = `PRIVATE_KEY_IMPORT:${validation.chainType}:${privateKey}`;
  
  // SECURITY: Encrypt the storage data with password
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(storageData, key, iv);
  
  // Create wallet entry
  const walletEntry: WalletEntry = {
    id: walletId,
    label: walletLabel,
    publicKey: publicAddress || `evm:${evmAddress}`, // Store EVM address with prefix if no Solana
    createdAt: Date.now(),
    derivationIndex: 0,
    evmAddress: evmAddress || undefined,
  };
  
  // Update vault
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  if (vault.createdAt === 0) {
    vault.createdAt = Date.now();
  }
  
  // Update encrypted data
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  // Save to storage
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  // SECURITY: Store keypairs in memory (wallet is now unlocked)
  memoryState.activeWalletId = walletId;
  memoryState.keypair = solanaKeypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletLabel;
  memoryState.passwordHash = password;
  
  // Start auto-lock timer
  await startAutoLockTimer();
  
  return { publicAddress, evmAddress, walletId };
}

/**
 * Export private key for a wallet
 * 
 * SECURITY: Returns the raw private key for the specified chain.
 * WARNING: This is extremely sensitive data.
 * 
 * @param walletId - ID of wallet to export
 * @param password - Password for verification
 * @param chain - Which chain's private key to export ('solana' or 'evm')
 * @returns Private key string (SENSITIVE)
 */
export async function exportPrivateKey(
  walletId: string,
  password: string,
  chain: 'solana' | 'evm'
): Promise<{ privateKey: string }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2 && versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  const vault = versionInfo.multiWalletVault || versionInfo.multiWalletVaultV3;
  if (!vault) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet vault not found'
    );
  }
  
  // Find wallet
  const walletEntry = vault.wallets.find(w => w.id === walletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  // Verify password
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  // Get encrypted data
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  // Decrypt stored data
  const key = await deriveKeyFromPassword(password, walletData.salt);
  const decryptedData = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  // Import keychain functions
  const { 
    deriveKeypair, 
    deriveEVMKeypair,
    keypairFromPrivateKey,
    evmKeypairFromPrivateKey,
    getSolanaPrivateKeyBase58,
    getEVMPrivateKeyHex,
  } = await import('./keychain');
  
  // Check if this is a private key import or mnemonic
  if (decryptedData.startsWith('PRIVATE_KEY_IMPORT:')) {
    // Parse the stored private key
    const parts = decryptedData.split(':');
    const storedChainType = parts[1];
    const storedPrivateKey = parts.slice(2).join(':'); // In case private key contains ':'
    
    if (chain === 'solana') {
      if (storedChainType !== 'solana') {
        throw new WalletError(
          WalletErrorCode.WALLET_NOT_FOUND,
          'This wallet does not have a Solana private key'
        );
      }
      return { privateKey: storedPrivateKey };
    } else {
      if (storedChainType !== 'evm') {
        throw new WalletError(
          WalletErrorCode.WALLET_NOT_FOUND,
          'This wallet does not have an EVM private key'
        );
      }
      return { privateKey: storedPrivateKey };
    }
  } else {
    // This is a mnemonic-based wallet, derive the private key
    const mnemonic = decryptedData;
    
    if (chain === 'solana') {
      const keypair = deriveKeypair(mnemonic);
      const privateKey = getSolanaPrivateKeyBase58(keypair);
      return { privateKey };
    } else {
      const evmKeypair = deriveEVMKeypair(mnemonic);
      const privateKey = getEVMPrivateKeyHex(evmKeypair);
      return { privateKey };
    }
  }
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
