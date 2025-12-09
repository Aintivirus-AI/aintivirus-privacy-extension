

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


interface InMemoryWalletState {
  
  activeWalletId: string | null;
  
  activeAccountId: string | null;
  
  keypair: Keypair | null;
  
  evmKeypair: EVMKeypair | null;
  
  publicAddress: string | null;
  
  evmAddress: string | null;
  
  walletLabel: string | null;
  
  accountName: string | null;
  
  accountIndex: number;
  
  isWatchOnly: boolean;
  
  lockTimer: ReturnType<typeof setTimeout> | null;
  
  passwordHash: string | null;
  
  cachedMnemonic: string | null;
}


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


interface RateLimitState {
  failedAttempts: number;
  lastFailedAttempt: number;
  lockedUntil: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; 
const BASE_BACKOFF_MS = 1000; 
const RATE_LIMIT_STORAGE_KEY = 'walletRateLimitState';


async function loadRateLimitState(): Promise<RateLimitState> {
  try {
    const result = await chrome.storage.local.get(RATE_LIMIT_STORAGE_KEY);
    const state = result[RATE_LIMIT_STORAGE_KEY] as RateLimitState | undefined;
    
    if (state && typeof state.failedAttempts === 'number') {
      return state;
    }
  } catch (error) {
    
  }
  
  return {
    failedAttempts: 0,
    lastFailedAttempt: 0,
    lockedUntil: 0,
  };
}


async function saveRateLimitState(state: RateLimitState): Promise<void> {
  try {
    await chrome.storage.local.set({ [RATE_LIMIT_STORAGE_KEY]: state });
  } catch (error) {
    
  }
}


async function checkRateLimit(): Promise<{ isLimited: boolean; waitMs: number; attemptsRemaining: number }> {
  const now = Date.now();
  const state = await loadRateLimitState();
  
  
  if (state.lockedUntil > now) {
    return {
      isLimited: true,
      waitMs: state.lockedUntil - now,
      attemptsRemaining: 0,
    };
  }
  
  
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


async function recordFailedAttempt(): Promise<void> {
  const now = Date.now();
  const state = await loadRateLimitState();
  
  state.failedAttempts++;
  state.lastFailedAttempt = now;
  
  
  if (state.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  
  await saveRateLimitState(state);
}


async function resetRateLimit(): Promise<void> {
  await saveRateLimitState({
    failedAttempts: 0,
    lastFailedAttempt: 0,
    lockedUntil: 0,
  });
}


async function getMultiWalletVault(): Promise<MultiWalletVault | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MULTI_WALLET_VAULT);
  return result[STORAGE_KEYS.MULTI_WALLET_VAULT] || null;
}


async function saveMultiWalletVault(vault: MultiWalletVault): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.MULTI_WALLET_VAULT]: vault });
}


async function getEncryptedWalletData(): Promise<EncryptedWalletData> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_WALLET_DATA);
  return result[STORAGE_KEYS.ENCRYPTED_WALLET_DATA] || {};
}


async function saveEncryptedWalletData(data: EncryptedWalletData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENCRYPTED_WALLET_DATA]: data });
}


async function getLegacyVault(): Promise<EncryptedVault | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LEGACY_VAULT);
  return result[STORAGE_KEYS.LEGACY_VAULT] || null;
}


async function getMultiWalletVaultV3(): Promise<MultiWalletVaultV3 | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MULTI_WALLET_VAULT);
  const vault = result[STORAGE_KEYS.MULTI_WALLET_VAULT];
  if (vault && vault.version === 3) {
    return vault as MultiWalletVaultV3;
  }
  return null;
}


async function saveMultiWalletVaultV3(vault: MultiWalletVaultV3): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.MULTI_WALLET_VAULT]: vault });
}


let settingsCache: WalletSettings | null = null;
let settingsCacheTime: number = 0;
const SETTINGS_CACHE_TTL = 5000; 


export async function getWalletSettings(): Promise<WalletSettings> {
  const now = Date.now();
  
  
  if (settingsCache && now - settingsCacheTime < SETTINGS_CACHE_TTL) {
    return settingsCache;
  }
  
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings: WalletSettings = result[STORAGE_KEYS.SETTINGS] || DEFAULT_WALLET_SETTINGS;
  settingsCache = settings;
  settingsCacheTime = now;
  
  return settings;
}


export async function saveWalletSettings(settings: Partial<WalletSettings>): Promise<void> {
  const current = await getWalletSettings();
  const updated = { ...current, ...settings };
  
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: updated,
  });
  
  
  settingsCache = updated;
  settingsCacheTime = Date.now();
}


export function invalidateSettingsCache(): void {
  settingsCache = null;
  settingsCacheTime = 0;
}


export async function walletExists(): Promise<boolean> {
  const versionInfo = await detectVaultVersion();
  return versionInfo.version > 0;
}


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
    
    lockState = 'uninitialized';
  } else if (versionInfo.version === 1) {
    
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
    
    const vault = versionInfo.multiWalletVault!;
    walletCount = vault.wallets.length;
    accountCount = 1; 
    
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
      
      if (!publicAddress && vault.wallets.length > 0) {
        publicAddress = vault.wallets[0].publicKey;
        activeWalletId = vault.wallets[0].id;
        activeWalletLabel = vault.wallets[0].label;
        evmAddress = vault.wallets[0].evmAddress || null;
        activeAccountName = 'Account 1';
      }
    }
  } else {
    
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
      
      
      if (activeWalletId) {
        const activeWallet = vault.wallets.find(w => w.id === activeWalletId);
        if (activeWallet) {
          accountCount = activeWallet.accounts.length;
        }
      }
    } else {
      lockState = 'locked';
      
      if (vault.activeWalletId) {
        const activeWallet = vault.wallets.find(w => w.id === vault.activeWalletId);
        if (activeWallet) {
          activeWalletId = activeWallet.id;
          activeWalletLabel = activeWallet.label;
          accountCount = activeWallet.accounts.length;
          
          
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


export async function createWallet(password: string): Promise<{
  mnemonic: string;
  publicAddress: string;
  walletId: string;
}> {
  const versionInfo = await detectVaultVersion();
  
  
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Please unlock your existing wallet first to enable multi-wallet support.'
    );
  }
  
  
  if (!validatePasswordStrength(password)) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password does not meet minimum requirements'
    );
  }
  
  let vault: MultiWalletVault;
  let encryptedData: EncryptedWalletData;
  
  if (versionInfo.version === 0) {
    
    const initialized = await initializeMultiWalletVault(password);
    vault = initialized.vault;
    encryptedData = initialized.encryptedData;
  } else {
    
    vault = versionInfo.multiWalletVault!;
    encryptedData = await getEncryptedWalletData();
    
    
    const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
    if (!isValid) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Incorrect password'
      );
    }
    
    
    if (vault.wallets.length >= MAX_WALLETS) {
      throw new WalletError(
        WalletErrorCode.MAX_WALLETS_REACHED,
        `Maximum of ${MAX_WALLETS} wallets reached`
      );
    }
  }
  
  
  let mnemonic = generateMnemonic();
  
  
  const keypair = deriveKeypair(mnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const label = `Wallet ${walletNumber}`;
  
  
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(mnemonic, key, iv);
  
  
  const walletEntry: WalletEntry = {
    id: walletId,
    label,
    publicKey: publicAddress,
    createdAt: Date.now(),
    derivationIndex: 0,
  };
  
  
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  if (vault.createdAt === 0) {
    vault.createdAt = Date.now();
  }
  
  
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  
  const evmKeypair = deriveEVMKeypair(mnemonic);
  const evmAddress = evmKeypair.address;
  
  
  walletEntry.evmAddress = evmAddress;
  vault.wallets[vault.wallets.length - 1] = walletEntry;
  
  
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = label;
  memoryState.passwordHash = password; 
  memoryState.cachedMnemonic = mnemonic; 
  
  
  await startAutoLockTimer();
  
  
  const mnemonicForBackup = mnemonic.slice();
  mnemonic = '';
  
  return {
    mnemonic: mnemonicForBackup,
    publicAddress,
    walletId,
  };
}


export async function importWallet(
  mnemonic: string,
  password?: string,
  label?: string
): Promise<{ publicAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  
  const effectivePassword = password || memoryState.passwordHash;
  
  
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Please unlock your existing wallet first to enable multi-wallet support.'
    );
  }
  
  
  let normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalizedMnemonic)) {
    normalizedMnemonic = '';
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase. Please check and try again.'
    );
  }
  
  
  if (versionInfo.version === 0) {
    if (!effectivePassword) {
      normalizedMnemonic = '';
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Password is required to create the first wallet'
      );
    }
    if (!validatePasswordStrength(effectivePassword)) {
      normalizedMnemonic = '';
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Password does not meet minimum requirements'
      );
    }
  }
  
  let vault: MultiWalletVault;
  let encryptedData: EncryptedWalletData;
  
  if (versionInfo.version === 0) {
    
    const initialized = await initializeMultiWalletVault(effectivePassword!);
    vault = initialized.vault;
    encryptedData = initialized.encryptedData;
  } else {
    
    if (!effectivePassword) {
      normalizedMnemonic = '';
      throw new WalletError(
        WalletErrorCode.WALLET_LOCKED,
        'Wallet is locked. Please unlock first.'
      );
    }
    
    vault = versionInfo.multiWalletVault!;
    encryptedData = await getEncryptedWalletData();
    
    
    if (password && password !== memoryState.passwordHash) {
      const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
      if (!isValid) {
        normalizedMnemonic = '';
        throw new WalletError(
          WalletErrorCode.INVALID_PASSWORD,
          'Incorrect password'
        );
      }
    }
    
    
    if (vault.wallets.length >= MAX_WALLETS) {
      normalizedMnemonic = '';
      throw new WalletError(
        WalletErrorCode.MAX_WALLETS_REACHED,
        `Maximum of ${MAX_WALLETS} wallets reached`
      );
    }
  }
  
  
  const keypair = deriveKeypair(normalizedMnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  
  const existingWallet = vault.wallets.find(w => w.publicKey === publicAddress);
  if (existingWallet) {
    normalizedMnemonic = '';
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'This wallet has already been imported'
    );
  }
  
  
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const walletLabel = label?.slice(0, MAX_WALLET_LABEL_LENGTH) || `Wallet ${walletNumber}`;
  
  
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(effectivePassword!, salt);
  const ciphertext = await encrypt(normalizedMnemonic, key, iv);
  
  
  normalizedMnemonic = '';
  
  
  const walletEntry: WalletEntry = {
    id: walletId,
    label: walletLabel,
    publicKey: publicAddress,
    createdAt: Date.now(),
    derivationIndex: 0,
  };
  
  
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  if (vault.createdAt === 0) {
    vault.createdAt = Date.now();
  }
  
  
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  
  const evmAddress = getEVMAddressFromMnemonic(await decryptMnemonicForEVM(walletId, effectivePassword!, encryptedData[walletId]));
  
  
  walletEntry.evmAddress = evmAddress;
  vault.wallets[vault.wallets.length - 1] = walletEntry;
  
  
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  
  const evmKeypair = deriveEVMKeypair(await decryptMnemonicForEVM(walletId, effectivePassword!, encryptedData[walletId]));
  
  
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletLabel;
  memoryState.passwordHash = effectivePassword!;
  
  
  await startAutoLockTimer();
  
  return { publicAddress, walletId };
}


async function decryptMnemonicForEVM(
  walletId: string,
  password: string,
  walletData: { salt: string; iv: string; ciphertext: string }
): Promise<string> {
  const key = await deriveKeyFromPassword(password, walletData.salt);
  return await decrypt(walletData.ciphertext, key, walletData.iv);
}


export async function unlockWallet(password: string): Promise<{ publicAddress: string }> {
  
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
  
  
  if (memoryState.keypair) {
    await resetRateLimit();
    return { publicAddress: memoryState.publicAddress! };
  }
  
  
  if (versionInfo.version === 1) {
    try {
      const { vault } = await migrateV1ToV2(password);
      
      return await unlockWalletV2(password, vault);
    } catch (error) {
      if (error instanceof WalletError && error.code === WalletErrorCode.INVALID_PASSWORD) {
        await recordFailedAttempt();
      }
      throw error;
    }
  }
  
  
  return await unlockWalletV2(password, versionInfo.multiWalletVault!);
}


async function unlockWalletV2(
  password: string,
  vault: MultiWalletVault
): Promise<{ publicAddress: string }> {
  
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
  
  
  const walletEntry = vault.wallets.find(w => w.id === activeWalletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Active wallet not found'
    );
  }
  
  
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[activeWalletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet encrypted data not found'
    );
  }
  
  try {
    
    const key = await deriveKeyFromPassword(password, walletData.salt);
    let decryptedData = await decrypt(walletData.ciphertext, key, walletData.iv);
    
    let keypair: Keypair | null = null;
    let evmKeypair: EVMKeypair | null = null;
    let publicAddress: string;
    let evmAddress: string = '';
    
    
    if (decryptedData.startsWith('PRIVATE_KEY_IMPORT:')) {
      
      const parts = decryptedData.split(':');
      const storedChainType = parts[1];
      const storedPrivateKey = parts.slice(2).join(':'); 
      decryptedData = ''; 
      
      if (storedChainType === 'solana') {
        keypair = keypairFromPrivateKey(storedPrivateKey);
        publicAddress = getPublicKeyBase58(keypair);
        
        evmKeypair = null;
        evmAddress = '';
      } else if (storedChainType === 'evm') {
        evmKeypair = evmKeypairFromPrivateKey(storedPrivateKey);
        evmAddress = evmKeypair.address;
        
        keypair = null;
        publicAddress = walletEntry.publicKey; 
      } else {
        throw new WalletError(
          WalletErrorCode.DECRYPTION_FAILED,
          'Unknown private key type'
        );
      }
    } else {
      
      const mnemonic = decryptedData;
      decryptedData = ''; 
      
      
      keypair = deriveKeypair(mnemonic);
      publicAddress = getPublicKeyBase58(keypair);
      
      
      if (publicAddress !== walletEntry.publicKey) {
        await recordFailedAttempt();
        throw new WalletError(
          WalletErrorCode.DECRYPTION_FAILED,
          'Wallet data corrupted. Please restore from backup.'
        );
      }
      
      
      evmKeypair = deriveEVMKeypair(mnemonic);
      evmAddress = evmKeypair.address;
    }
    
    
    if (!walletEntry.evmAddress && evmAddress) {
      walletEntry.evmAddress = evmAddress;
      const walletIndex = vault.wallets.findIndex(w => w.id === activeWalletId);
      if (walletIndex >= 0) {
        vault.wallets[walletIndex] = walletEntry;
        await saveMultiWalletVault(vault);
      }
    }
    
    
    await resetRateLimit();
    
    
    memoryState.activeWalletId = activeWalletId;
    memoryState.keypair = keypair;
    memoryState.evmKeypair = evmKeypair;
    memoryState.publicAddress = publicAddress;
    memoryState.evmAddress = evmAddress;
    memoryState.walletLabel = walletEntry.label;
    memoryState.passwordHash = password;
    
    
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


export function lockWallet(): void {
  
  if (memoryState.lockTimer) {
    clearTimeout(memoryState.lockTimer);
    memoryState.lockTimer = null;
  }
  
  
  memoryState.keypair = null;
  memoryState.evmKeypair = null;
  memoryState.passwordHash = null;
  memoryState.cachedMnemonic = null;
  memoryState.isWatchOnly = false;
  
}


export async function deleteWallet(password: string): Promise<void> {
  
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


export async function listWallets(): Promise<WalletEntry[]> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version === 0) {
    return [];
  }
  
  if (versionInfo.version === 1) {
    
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


export async function addWallet(
  password?: string,
  label?: string
): Promise<{ mnemonic: string; publicAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  
  const effectivePassword = password || memoryState.passwordHash;
  
  if (versionInfo.version === 0) {
    
    if (!effectivePassword) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Password is required to create the first wallet'
      );
    }
    return createWallet(effectivePassword);
  }
  
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please unlock your wallet first to enable multi-wallet support.'
    );
  }
  
  
  if (!effectivePassword) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock first.'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  
  if (password && password !== memoryState.passwordHash) {
    const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
    if (!isValid) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Incorrect password'
      );
    }
  }
  
  
  if (vault.wallets.length >= MAX_WALLETS) {
    throw new WalletError(
      WalletErrorCode.MAX_WALLETS_REACHED,
      `Maximum of ${MAX_WALLETS} wallets reached`
    );
  }
  
  
  let mnemonic = generateMnemonic();
  const keypair = deriveKeypair(mnemonic);
  const publicAddress = getPublicKeyBase58(keypair);
  
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const walletLabel = label?.slice(0, MAX_WALLET_LABEL_LENGTH) || `Wallet ${walletNumber}`;
  
  
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(effectivePassword, salt);
  const ciphertext = await encrypt(mnemonic, key, iv);
  
  
  const walletEntry: WalletEntry = {
    id: walletId,
    label: walletLabel,
    publicKey: publicAddress,
    createdAt: Date.now(),
    derivationIndex: 0,
  };
  
  
  const evmKeypair = deriveEVMKeypair(mnemonic);
  const evmAddress = evmKeypair.address;
  walletEntry.evmAddress = evmAddress;
  
  
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  
  
  const encryptedData = await getEncryptedWalletData();
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletLabel;
  memoryState.passwordHash = effectivePassword;
  
  
  const mnemonicForBackup = mnemonic.slice();
  mnemonic = '';
  
  return {
    mnemonic: mnemonicForBackup,
    publicAddress,
    walletId,
  };
}


export async function importAdditionalWallet(
  mnemonic: string,
  password?: string,
  label?: string
): Promise<{ publicAddress: string; walletId: string }> {
  return importWallet(mnemonic, password, label);
}


export async function switchWallet(
  walletId: string,
  password?: string
): Promise<{ publicAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  
  const effectivePassword = password || memoryState.passwordHash;
  
  if (!effectivePassword) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock first.'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  
  const walletEntry = vault.wallets.find(w => w.id === walletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  
  if (password && password !== memoryState.passwordHash) {
    const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
    if (!isValid) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Incorrect password'
      );
    }
  }
  
  
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  
  const key = await deriveKeyFromPassword(effectivePassword, walletData.salt);
  let decryptedData = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  let keypair: Keypair | null = null;
  let evmKeypair: EVMKeypair | null = null;
  let publicAddress: string;
  let evmAddress: string = '';
  
  
  if (decryptedData.startsWith('PRIVATE_KEY_IMPORT:')) {
    
    const parts = decryptedData.split(':');
    const storedChainType = parts[1];
    const storedPrivateKey = parts.slice(2).join(':'); 
    decryptedData = ''; 
    
    if (storedChainType === 'solana') {
      keypair = keypairFromPrivateKey(storedPrivateKey);
      publicAddress = getPublicKeyBase58(keypair);
      
      evmKeypair = null;
      evmAddress = '';
    } else if (storedChainType === 'evm') {
      evmKeypair = evmKeypairFromPrivateKey(storedPrivateKey);
      evmAddress = evmKeypair.address;
      
      keypair = null;
      publicAddress = walletEntry.publicKey; 
    } else {
      throw new WalletError(
        WalletErrorCode.DECRYPTION_FAILED,
        'Unknown private key type'
      );
    }
  } else {
    
    const mnemonic = decryptedData;
    decryptedData = ''; 
    
    keypair = deriveKeypair(mnemonic);
    publicAddress = getPublicKeyBase58(keypair);
    
    
    if (publicAddress !== walletEntry.publicKey) {
      throw new WalletError(
        WalletErrorCode.DECRYPTION_FAILED,
        'Wallet data corrupted'
      );
    }
    
    
    evmKeypair = deriveEVMKeypair(mnemonic);
    evmAddress = evmKeypair.address;
  }
  
  
  if (!walletEntry.evmAddress) {
    walletEntry.evmAddress = evmAddress;
    const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
    if (walletIndex >= 0) {
      vault.wallets[walletIndex] = walletEntry;
    }
  }
  
  
  vault.activeWalletId = walletId;
  await saveMultiWalletVault(vault);
  
  
  memoryState.activeWalletId = walletId;
  memoryState.keypair = keypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletEntry.label;
  memoryState.passwordHash = effectivePassword;
  
  
  await startAutoLockTimer();
  
  return { publicAddress, walletId };
}


export async function renameWallet(walletId: string, label: string): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  
  const trimmedLabel = label.trim().slice(0, MAX_WALLET_LABEL_LENGTH);
  if (!trimmedLabel) {
    throw new WalletError(
      WalletErrorCode.INVALID_WALLET_LABEL,
      'Wallet label cannot be empty'
    );
  }
  
  
  vault.wallets[walletIndex].label = trimmedLabel;
  await saveMultiWalletVault(vault);
  
  
  if (memoryState.activeWalletId === walletId) {
    memoryState.walletLabel = trimmedLabel;
  }
}


export async function deleteOneWallet(walletId: string, password: string): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 2) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Multi-wallet support not available'
    );
  }
  
  const vault = versionInfo.multiWalletVault!;
  
  
  if (vault.wallets.length <= 1) {
    throw new WalletError(
      WalletErrorCode.CANNOT_DELETE_LAST_WALLET,
      'Cannot delete the last wallet. Use "Delete All" to remove your wallet.'
    );
  }
  
  
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  
  vault.wallets.splice(walletIndex, 1);
  
  
  if (vault.activeWalletId === walletId) {
    vault.activeWalletId = vault.wallets[0].id;
    
    
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
  
  
  const encryptedData = await getEncryptedWalletData();
  delete encryptedData[walletId];
  
  
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
}


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
  
  
  const walletEntry = vault.wallets.find(w => w.id === walletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  
  const key = await deriveKeyFromPassword(password, walletData.salt);
  const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  return { mnemonic };
}


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


export async function createDerivedAccount(
  walletId: string,
  password: string,
  name?: string
): Promise<DerivedAccount> {
  const versionInfo = await detectVaultVersion();
  
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  const wallet = vault.wallets[walletIndex];
  
  
  if (wallet.accounts.length >= MAX_ACCOUNTS_PER_WALLET) {
    throw new WalletError(
      WalletErrorCode.MAX_ACCOUNTS_REACHED,
      `Maximum of ${MAX_ACCOUNTS_PER_WALLET} accounts per wallet reached`
    );
  }
  
  
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  
  const key = await deriveKeyFromPassword(password, walletData.salt);
  let mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  const accountIndex = wallet.nextAccountIndex;
  const addresses = deriveAddressesForIndex(
    mnemonic,
    accountIndex,
    wallet.evmPathType,
    wallet.solanaPathType
  );
  
  
  mnemonic = '';
  
  
  const accountId = generateWalletId();
  const accountNumber = wallet.accounts.length + 1;
  const accountName = name?.slice(0, MAX_ACCOUNT_NAME_LENGTH) || `Account ${accountNumber}`;
  
  
  const account: DerivedAccount = {
    id: accountId,
    name: accountName,
    index: accountIndex,
    solanaAddress: addresses.solanaAddress,
    evmAddress: addresses.evmAddress,
    createdAt: Date.now(),
  };
  
  
  wallet.accounts.push(account);
  wallet.nextAccountIndex = accountIndex + 1;
  vault.wallets[walletIndex] = wallet;
  
  
  await saveMultiWalletVaultV3(vault);

  return account;
}


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
  
  
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  const wallet = vault.wallets[walletIndex];
  
  
  const accountIndex = wallet.accounts.findIndex(a => a.id === accountId);
  if (accountIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Account not found'
    );
  }
  
  
  const trimmedName = name.trim().slice(0, MAX_ACCOUNT_NAME_LENGTH);
  if (!trimmedName) {
    throw new WalletError(
      WalletErrorCode.INVALID_ACCOUNT_NAME,
      'Account name cannot be empty'
    );
  }
  
  
  wallet.accounts[accountIndex].name = trimmedName;
  vault.wallets[walletIndex] = wallet;
  
  
  await saveMultiWalletVaultV3(vault);
  
  
  if (memoryState.activeAccountId === accountId) {
    memoryState.accountName = trimmedName;
  }
}


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
  
  
  const wallet = vault.wallets.find(w => w.id === walletId);
  if (!wallet) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  
  const account = wallet.accounts.find(a => a.id === accountId);
  if (!account) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Account not found'
    );
  }
  
  
  if (!memoryState.cachedMnemonic && !memoryState.passwordHash) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to switch accounts.'
    );
  }
  
  
  if (walletId !== memoryState.activeWalletId) {
    if (!memoryState.passwordHash) {
      throw new WalletError(
        WalletErrorCode.WALLET_LOCKED,
        'Password required to switch wallets'
      );
    }
    
    
    const encryptedData = await getEncryptedWalletData();
    const walletData = encryptedData[walletId];
    if (!walletData) {
      throw new WalletError(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Wallet data not found'
      );
    }
    
    
    const key = await deriveKeyFromPassword(memoryState.passwordHash, walletData.salt);
    const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
    
    
    const { solanaKeypair, evmKeypair } = deriveKeypairsForIndex(
      mnemonic,
      account.index,
      wallet.evmPathType,
      wallet.solanaPathType
    );
    
    
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
    
    if (!memoryState.cachedMnemonic) {
      throw new WalletError(
        WalletErrorCode.WALLET_LOCKED,
        'Session expired. Please unlock wallet again.'
      );
    }
    
    
    const { solanaKeypair, evmKeypair } = deriveKeypairsForIndex(
      memoryState.cachedMnemonic,
      account.index,
      wallet.evmPathType,
      wallet.solanaPathType
    );
    
    
    memoryState.activeAccountId = accountId;
    memoryState.keypair = solanaKeypair;
    memoryState.evmKeypair = evmKeypair;
    memoryState.publicAddress = account.solanaAddress;
    memoryState.evmAddress = account.evmAddress;
    memoryState.accountName = account.name;
    memoryState.accountIndex = account.index;
    memoryState.isWatchOnly = false;
  }
  
  
  vault.activeWalletId = walletId;
  vault.activeAccountId = accountId;
  await saveMultiWalletVaultV3(vault);

  return {
    solanaAddress: account.solanaAddress,
    evmAddress: account.evmAddress,
  };
}


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
  
  
  const walletIndex = vault.wallets.findIndex(w => w.id === walletId);
  if (walletIndex === -1) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  const wallet = vault.wallets[walletIndex];
  
  
  if (wallet.accounts.length <= 1) {
    throw new WalletError(
      WalletErrorCode.CANNOT_DELETE_LAST_ACCOUNT,
      'Cannot delete the last account. Delete the wallet instead.'
    );
  }
  
  
  const accountIndex = wallet.accounts.findIndex(a => a.id === accountId);
  if (accountIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Account not found'
    );
  }
  
  
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  
  wallet.accounts.splice(accountIndex, 1);
  vault.wallets[walletIndex] = wallet;
  
  
  if (vault.activeAccountId === accountId) {
    vault.activeAccountId = wallet.accounts[0].id;
    
    
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
  
  
  await saveMultiWalletVaultV3(vault);
}


export async function listAccounts(walletId: string): Promise<DerivedAccount[]> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  
  const wallet = vault.wallets.find(w => w.id === walletId);
  if (!wallet) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  return wallet.accounts;
}


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


export async function isWatchOnlyAccount(accountId: string): Promise<boolean> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    return false;
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  return vault.watchOnlyAccounts.some(w => w.id === accountId);
}


export async function addWatchOnlyAccount(
  address: string,
  chainType: 'solana' | 'evm',
  name?: string
): Promise<WatchOnlyAccount> {
  
  const { isValidSolanaAddress, isValidEVMAddress } = await import('./keychain');
  
  
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
  
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  
  const existingWatchOnly = vault.watchOnlyAccounts.find(
    w => w.address.toLowerCase() === address.toLowerCase()
  );
  if (existingWatchOnly) {
    throw new WalletError(
      WalletErrorCode.ADDRESS_ALREADY_EXISTS,
      'This address is already being watched'
    );
  }
  
  
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
  
  
  const accountId = generateWalletId();
  const accountName = name?.slice(0, MAX_ACCOUNT_NAME_LENGTH) || `Watch ${vault.watchOnlyAccounts.length + 1}`;
  
  
  const watchOnlyAccount: WatchOnlyAccount = {
    id: accountId,
    name: accountName,
    chainType,
    address,
    createdAt: Date.now(),
  };
  
  
  vault.watchOnlyAccounts.push(watchOnlyAccount);
  
  
  await saveMultiWalletVaultV3(vault);

  return watchOnlyAccount;
}


export async function removeWatchOnlyAccount(accountId: string): Promise<void> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  
  const accountIndex = vault.watchOnlyAccounts.findIndex(w => w.id === accountId);
  if (accountIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Watch-only account not found'
    );
  }
  
  
  vault.watchOnlyAccounts.splice(accountIndex, 1);
  
  
  if (vault.activeAccountId === accountId) {
    
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
  
  
  if (memoryState.activeAccountId === accountId) {
    memoryState.activeAccountId = vault.activeAccountId;
    memoryState.isWatchOnly = false;
    memoryState.publicAddress = null;
    memoryState.evmAddress = null;
    memoryState.accountName = null;
  }
  
  
  await saveMultiWalletVaultV3(vault);
}


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
  
  
  const watchOnlyIndex = vault.watchOnlyAccounts.findIndex(w => w.id === watchOnlyId);
  if (watchOnlyIndex === -1) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Watch-only account not found'
    );
  }
  
  const watchOnly = vault.watchOnlyAccounts[watchOnlyIndex];
  
  
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalizedMnemonic)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase'
    );
  }
  
  
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  
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
  
  
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(password, salt);
  const ciphertext = await encrypt(normalizedMnemonic, key, iv);
  
  
  vault.wallets.push(walletEntry);
  vault.watchOnlyAccounts.splice(watchOnlyIndex, 1);
  vault.activeWalletId = walletId;
  vault.activeAccountId = accountId;
  
  
  const encryptedData = await getEncryptedWalletData();
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  
  await saveMultiWalletVaultV3(vault);
  await saveEncryptedWalletData(encryptedData);
  
  
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

  return { walletId, accountId };
}


export async function listWatchOnlyAccounts(): Promise<WatchOnlyAccount[]> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    return [];
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  return vault.watchOnlyAccounts;
}


export async function switchToWatchOnly(accountId: string): Promise<{ address: string; chainType: 'solana' | 'evm' }> {
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 3) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'Please upgrade to the latest wallet version first'
    );
  }
  
  const vault = versionInfo.multiWalletVaultV3!;
  
  
  const watchOnly = vault.watchOnlyAccounts.find(w => w.id === accountId);
  if (!watchOnly) {
    throw new WalletError(
      WalletErrorCode.ACCOUNT_NOT_FOUND,
      'Watch-only account not found'
    );
  }
  
  
  vault.activeWalletId = null;
  vault.activeAccountId = accountId;
  await saveMultiWalletVaultV3(vault);
  
  
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

  return {
    address: watchOnly.address,
    chainType: watchOnly.chainType,
  };
}


export function getUnlockedKeypair(): Keypair | null {
  return memoryState.keypair;
}


export function getUnlockedEVMKeypair(): EVMKeypair | null {
  return memoryState.evmKeypair;
}


export function getEVMAddress(): string | null {
  return memoryState.evmAddress;
}


export function isWalletUnlocked(): boolean {
  return memoryState.keypair !== null;
}


export async function getPublicAddress(): Promise<string | null> {
  if (memoryState.publicAddress) {
    return memoryState.publicAddress;
  }
  
  const activeWallet = await getActiveWallet();
  return activeWallet.publicAddress;
}


const TOKEN_METADATA_CACHE_KEY = 'tokenMetadataCache';

interface TokenMetadataCacheEntry {
  mint: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoUri?: string;
  cachedAt: number;
}

type TokenMetadataCache = Record<string, TokenMetadataCacheEntry>;


export async function getTokenMetadataCache(): Promise<TokenMetadataCache> {
  try {
    const result = await chrome.storage.local.get(TOKEN_METADATA_CACHE_KEY);
    return result[TOKEN_METADATA_CACHE_KEY] || {};
  } catch (error) {
    return {};
  }
}


export async function saveTokenMetadataToCache(
  mint: string,
  metadata: {
    symbol?: string;
    name?: string;
    decimals?: number;
    logoUri?: string;
  }
): Promise<void> {
  try {
    const cache = await getTokenMetadataCache();
    cache[mint] = {
      mint,
      symbol: metadata.symbol,
      name: metadata.name,
      decimals: metadata.decimals,
      logoUri: metadata.logoUri,
      cachedAt: Date.now(),
    };
    await chrome.storage.local.set({ [TOKEN_METADATA_CACHE_KEY]: cache });
  } catch (error) {
    // Silently fail - cache is not critical
  }
}


export async function getCachedTokenMetadata(mint: string): Promise<TokenMetadataCacheEntry | null> {
  try {
    const cache = await getTokenMetadataCache();
    return cache[mint] || null;
  } catch (error) {
    return null;
  }
}


export async function importWalletFromPrivateKey(
  privateKey: string,
  password?: string,
  label?: string
): Promise<{ publicAddress: string; evmAddress: string; walletId: string }> {
  const versionInfo = await detectVaultVersion();
  
  
  const effectivePassword = password || memoryState.passwordHash;
  
  
  if (versionInfo.version === 1) {
    throw new WalletError(
      WalletErrorCode.WALLET_ALREADY_EXISTS,
      'Please unlock your existing wallet first to enable multi-wallet support.'
    );
  }
  
  
  if (versionInfo.version === 0) {
    if (!effectivePassword) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Password is required to create the first wallet'
      );
    }
    if (!validatePasswordStrength(effectivePassword)) {
      throw new WalletError(
        WalletErrorCode.INVALID_PASSWORD,
        'Password does not meet minimum requirements'
      );
    }
  }
  
  
  const { 
    keypairFromPrivateKey, 
    evmKeypairFromPrivateKey, 
    getPublicKeyBase58,
    validatePrivateKey 
  } = await import('./keychain');
  
  
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
  
  
  if (validation.chainType === 'solana') {
    solanaKeypair = keypairFromPrivateKey(privateKey);
    publicAddress = getPublicKeyBase58(solanaKeypair);
  } else if (validation.chainType === 'evm') {
    evmKeypair = evmKeypairFromPrivateKey(privateKey);
    evmAddress = evmKeypair.address;
    
    publicAddress = ''; 
  } else {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Could not determine private key type'
    );
  }
  
  let vault: MultiWalletVault;
  let encryptedData: Record<string, { salt: string; iv: string; ciphertext: string }>;
  
  if (versionInfo.version === 0) {
    
    const initialized = await initializeMultiWalletVault(effectivePassword!);
    vault = initialized.vault;
    encryptedData = initialized.encryptedData;
  } else {
    
    if (!effectivePassword) {
      throw new WalletError(
        WalletErrorCode.WALLET_LOCKED,
        'Wallet is locked. Please unlock first.'
      );
    }
    
    vault = versionInfo.multiWalletVault!;
    encryptedData = await getEncryptedWalletData();
    
    
    if (password && password !== memoryState.passwordHash) {
      const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
      if (!isValid) {
        throw new WalletError(
          WalletErrorCode.INVALID_PASSWORD,
          'Incorrect password'
        );
      }
    }
    
    
    if (vault.wallets.length >= MAX_WALLETS) {
      throw new WalletError(
        WalletErrorCode.MAX_WALLETS_REACHED,
        `Maximum of ${MAX_WALLETS} wallets reached`
      );
    }
  }
  
  
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
  
  
  const walletId = generateWalletId();
  const walletNumber = vault.wallets.length + 1;
  const walletLabel = label?.slice(0, MAX_WALLET_LABEL_LENGTH) || `Imported Wallet ${walletNumber}`;
  
  
  const storageData = `PRIVATE_KEY_IMPORT:${validation.chainType}:${privateKey}`;
  
  
  const salt = generateSalt();
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  const key = await deriveKeyFromPassword(effectivePassword!, salt);
  const ciphertext = await encrypt(storageData, key, iv);
  
  
  const walletEntry: WalletEntry = {
    id: walletId,
    label: walletLabel,
    publicKey: publicAddress || `evm:${evmAddress}`, 
    createdAt: Date.now(),
    derivationIndex: 0,
    evmAddress: evmAddress || undefined,
  };
  
  
  vault.wallets.push(walletEntry);
  vault.activeWalletId = walletId;
  if (vault.createdAt === 0) {
    vault.createdAt = Date.now();
  }
  
  
  encryptedData[walletId] = { salt, iv, ciphertext };
  
  
  await saveMultiWalletVault(vault);
  await saveEncryptedWalletData(encryptedData);
  
  
  memoryState.activeWalletId = walletId;
  memoryState.keypair = solanaKeypair;
  memoryState.evmKeypair = evmKeypair;
  memoryState.publicAddress = publicAddress;
  memoryState.evmAddress = evmAddress;
  memoryState.walletLabel = walletLabel;
  memoryState.passwordHash = effectivePassword!;
  
  
  await startAutoLockTimer();
  
  return { publicAddress, evmAddress, walletId };
}


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
  
  
  const walletEntry = vault.wallets.find(w => w.id === walletId);
  if (!walletEntry) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet not found'
    );
  }
  
  
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password'
    );
  }
  
  
  const encryptedData = await getEncryptedWalletData();
  const walletData = encryptedData[walletId];
  if (!walletData) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet data not found'
    );
  }
  
  
  const key = await deriveKeyFromPassword(password, walletData.salt);
  const decryptedData = await decrypt(walletData.ciphertext, key, walletData.iv);
  
  
  const { 
    deriveKeypair, 
    deriveEVMKeypair,
    keypairFromPrivateKey,
    evmKeypairFromPrivateKey,
    getSolanaPrivateKeyBase58,
    getEVMPrivateKeyHex,
  } = await import('./keychain');
  
  
  if (decryptedData.startsWith('PRIVATE_KEY_IMPORT:')) {
    
    const parts = decryptedData.split(':');
    const storedChainType = parts[1];
    const storedPrivateKey = parts.slice(2).join(':'); 
    
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


const AUTOLOCK_ALARM_NAME = 'walletAutoLock';


async function startAutoLockTimer(): Promise<void> {
  
  await chrome.alarms.clear(AUTOLOCK_ALARM_NAME);
  
  
  if (memoryState.lockTimer) {
    clearTimeout(memoryState.lockTimer);
    memoryState.lockTimer = null;
  }
  
  const settings = await getWalletSettings();
  
  
  if (settings.autoLockMinutes === 0) {
    return;
  }
  
  
  const delayMinutes = Math.max(1, settings.autoLockMinutes);
  
  await chrome.alarms.create(AUTOLOCK_ALARM_NAME, {
    delayInMinutes: delayMinutes,
  });
}


export function handleAutoLockAlarm(): void {
  if (memoryState.keypair) {
    lockWallet();
  }
}


export function getAutoLockAlarmName(): string {
  return AUTOLOCK_ALARM_NAME;
}


export async function resetAutoLockTimer(): Promise<void> {
  if (memoryState.keypair) {
    await startAutoLockTimer();
  }
}
