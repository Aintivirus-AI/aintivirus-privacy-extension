

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


export const STORAGE_KEYS = {
  
  LEGACY_VAULT: 'walletVault',
  
  MULTI_WALLET_VAULT: 'multiWalletVault',
  ENCRYPTED_WALLET_DATA: 'walletEncryptedData',
  
  SETTINGS: 'walletSettings',
} as const;


export function generateWalletId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  
  
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


export interface VaultVersionInfo {
  
  version: 0 | 1 | 2 | 3;
  
  needsMigration: boolean;
  
  legacyVault?: EncryptedVault;
  
  multiWalletVault?: MultiWalletVault;
  
  multiWalletVaultV3?: MultiWalletVaultV3;
}


export async function detectVaultVersion(): Promise<VaultVersionInfo> {
  
  const v2Result = await chrome.storage.local.get(STORAGE_KEYS.MULTI_WALLET_VAULT);
  const vault = v2Result[STORAGE_KEYS.MULTI_WALLET_VAULT] as (MultiWalletVault | MultiWalletVaultV3) | undefined;
  
  if (vault) {
    
    if (vault.version === 3) {
      return {
        version: 3,
        needsMigration: false,
        multiWalletVaultV3: vault as MultiWalletVaultV3,
      };
    }
    
    
    if (vault.version === 2) {
      return {
        version: 2,
        needsMigration: true, 
        multiWalletVault: vault as MultiWalletVault,
      };
    }
  }
  
  
  const v1Result = await chrome.storage.local.get(STORAGE_KEYS.LEGACY_VAULT);
  const legacyVault = v1Result[STORAGE_KEYS.LEGACY_VAULT] as EncryptedVault | undefined;
  
  if (legacyVault && legacyVault.version === VAULT_VERSION) {
    return {
      version: 1,
      needsMigration: true,
      legacyVault,
    };
  }
  
  
  return {
    version: 0,
    needsMigration: false,
  };
}


export async function generateMasterVerifier(
  password: string,
  salt: string
): Promise<string> {
  const key = await deriveKeyFromPassword(password, salt);
  
  
  const verifierConstant = 'AINTIVIRUS_WALLET_VERIFIER_V2';
  
  
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const iv = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  
  const encrypted = await encrypt(verifierConstant, key, iv);
  
  
  return JSON.stringify({ iv, ciphertext: encrypted });
}


export async function validateMasterPassword(
  password: string,
  salt: string,
  verifier: string
): Promise<boolean> {
  try {
    const key = await deriveKeyFromPassword(password, salt);
    const { iv, ciphertext } = JSON.parse(verifier);
    
    const decrypted = await decrypt(ciphertext, key, iv);
    
    
    const expected = 'AINTIVIRUS_WALLET_VERIFIER_V2';
    const decryptedBytes = new TextEncoder().encode(decrypted);
    const expectedBytes = new TextEncoder().encode(expected);
    
    return constantTimeEqual(decryptedBytes, expectedBytes);
  } catch {
    return false;
  }
}


export async function migrateV1ToV2(password: string): Promise<{
  vault: MultiWalletVault;
  encryptedData: EncryptedWalletData;
}> {
  
  const versionInfo = await detectVaultVersion();
  
  if (versionInfo.version !== 1 || !versionInfo.legacyVault) {
    throw new WalletError(
      WalletErrorCode.MIGRATION_FAILED,
      'No v1 vault found to migrate'
    );
  }
  
  const legacyVault = versionInfo.legacyVault;
  
  
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
  
  
  const walletId = generateWalletId();
  const masterSalt = generateSalt();
  
  
  const masterVerifier = await generateMasterVerifier(password, masterSalt);
  
  
  const walletSalt = generateSalt();
  const walletIv = generateSalt().slice(0, 16); 
  
  
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);
  const walletIvBase64 = arrayBufferToBase64(ivBytes.buffer as ArrayBuffer);
  
  const walletKey = await deriveKeyFromPassword(password, walletSalt);
  const walletCiphertext = await encrypt(mnemonic, walletKey, walletIvBase64);
  
  
  const walletEntry: WalletEntry = {
    id: walletId,
    label: 'Main Wallet',
    publicKey: legacyVault.publicKey,
    createdAt: legacyVault.createdAt,
    derivationIndex: 0,
  };
  
  
  const multiWalletVault: MultiWalletVault = {
    version: 2,
    activeWalletId: walletId,
    wallets: [walletEntry],
    masterSalt,
    masterVerifier,
    createdAt: Date.now(),
  };
  
  
  const encryptedData: EncryptedWalletData = {
    [walletId]: {
      salt: walletSalt,
      iv: walletIvBase64,
      ciphertext: walletCiphertext,
    },
  };
  
  
  mnemonic = '';
  
  
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.MULTI_WALLET_VAULT]: multiWalletVault,
      [STORAGE_KEYS.ENCRYPTED_WALLET_DATA]: encryptedData,
    });
    
    
    await chrome.storage.local.remove(STORAGE_KEYS.LEGACY_VAULT);
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.STORAGE_ERROR,
      'Failed to save migrated vault. Please try again.'
    );
  }

  return {
    vault: multiWalletVault,
    encryptedData,
  };
}


export function validateVaultIntegrity(
  vault: MultiWalletVault,
  encryptedData: EncryptedWalletData
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  
  if (vault.version !== 2) {
    errors.push(`Invalid vault version: ${vault.version}`);
  }
  
  
  if (!vault.masterSalt || vault.masterSalt.length < 32) {
    errors.push('Missing or invalid master salt');
  }
  if (!vault.masterVerifier) {
    errors.push('Missing master verifier');
  }
  
  
  if (!Array.isArray(vault.wallets)) {
    errors.push('Wallets is not an array');
  } else {
    
    const walletIds = new Set<string>();
    
    for (const wallet of vault.wallets) {
      
      if (!wallet.id) {
        errors.push('Wallet missing ID');
      } else {
        if (walletIds.has(wallet.id)) {
          errors.push(`Duplicate wallet ID: ${wallet.id}`);
        }
        walletIds.add(wallet.id);
        
        
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
    
    
    if (vault.activeWalletId && !walletIds.has(vault.activeWalletId)) {
      errors.push(`Active wallet ID not found: ${vault.activeWalletId}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}


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


export async function checkMigrationStatus(): Promise<VaultVersionInfo> {
  return await detectVaultVersion();
}


export function needsEVMAddressMigration(vault: MultiWalletVault): boolean {
  if (!vault || !vault.wallets) return false;
  
  return vault.wallets.some(wallet => !wallet.evmAddress);
}


export function migrateWalletToMultiChain(
  mnemonic: string,
  walletEntry: WalletEntry
): WalletEntry {
  
  if (walletEntry.evmAddress) {
    return walletEntry;
  }
  
  
  const evmAddress = getEVMAddressFromMnemonic(mnemonic, walletEntry.derivationIndex);

  return {
    ...walletEntry,
    evmAddress,
  };
}


export async function migrateVaultToMultiChain(
  vault: MultiWalletVault,
  encryptedData: EncryptedWalletData,
  password: string
): Promise<MultiWalletVault> {
  if (!needsEVMAddressMigration(vault)) {
    return vault;
  }

  const updatedWallets: WalletEntry[] = [];
  
  for (const wallet of vault.wallets) {
    if (wallet.evmAddress) {
      
      updatedWallets.push(wallet);
      continue;
    }
    
    
    const walletData = encryptedData[wallet.id];
    if (!walletData) {

      updatedWallets.push(wallet);
      continue;
    }
    
    try {
      
      const key = await deriveKeyFromPassword(password, walletData.salt);
      const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
      
      
      const evmAddress = getEVMAddressFromMnemonic(mnemonic, wallet.derivationIndex);
      
      updatedWallets.push({
        ...wallet,
        evmAddress,
      });

    } catch (error) {

      
      updatedWallets.push(wallet);
    }
  }
  
  const updatedVault: MultiWalletVault = {
    ...vault,
    wallets: updatedWallets,
  };
  
  
  await chrome.storage.local.set({
    [STORAGE_KEYS.MULTI_WALLET_VAULT]: updatedVault,
  });

  return updatedVault;
}


export interface MigrationStatus {
  
  currentVersion: number;
  
  needsV1ToV2: boolean;
  
  needsEVMAddresses: boolean;
  
  walletsNeedingEVM: number;
}


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


export async function migrateV2ToV3(
  vault: MultiWalletVault,
  encryptedData: EncryptedWalletData,
  password: string
): Promise<{
  vault: MultiWalletVaultV3;
  encryptedData: EncryptedWalletData;
}> {
  
  const isValid = await validateMasterPassword(password, vault.masterSalt, vault.masterVerifier);
  if (!isValid) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Incorrect password. Cannot migrate vault.'
    );
  }

  
  const v3Wallets: WalletEntryV3[] = [];
  let activeAccountId: string | null = null;
  
  for (const v2Wallet of vault.wallets) {
    
    const accountId = generateWalletId();
    
    
    let evmAddress = v2Wallet.evmAddress;
    if (!evmAddress) {
      
      const walletData = encryptedData[v2Wallet.id];
      if (walletData) {
        try {
          const key = await deriveKeyFromPassword(password, walletData.salt);
          const mnemonic = await decrypt(walletData.ciphertext, key, walletData.iv);
          evmAddress = getEVMAddressFromMnemonic(mnemonic, 0);
        } catch (error) {

        }
      }
    }
    
    
    const account: DerivedAccount = {
      id: accountId,
      name: 'Account 1',
      index: 0,
      solanaAddress: v2Wallet.publicKey,
      evmAddress: evmAddress || '',
      createdAt: v2Wallet.createdAt,
    };
    
    
    const v3Wallet: WalletEntryV3 = {
      id: v2Wallet.id,
      label: v2Wallet.label,
      accounts: [account],
      
      
      evmPathType: 'standard',
      solanaPathType: 'legacy',
      nextAccountIndex: 1,
      createdAt: v2Wallet.createdAt,
    };
    
    v3Wallets.push(v3Wallet);
    
    
    if (vault.activeWalletId === v2Wallet.id) {
      activeAccountId = accountId;
    }
  }
  
  
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


  return {
    vault: v3Vault,
    encryptedData,
  };
}


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


export function needsV2ToV3Migration(versionInfo: VaultVersionInfo): boolean {
  return versionInfo.version === 2;
}


export function validateVaultIntegrityV3(
  vault: MultiWalletVaultV3,
  encryptedData: EncryptedWalletData
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  
  if (vault.version !== 3) {
    errors.push(`Invalid vault version: ${vault.version}`);
  }
  
  
  if (!vault.masterSalt || vault.masterSalt.length < 32) {
    errors.push('Missing or invalid master salt');
  }
  if (!vault.masterVerifier) {
    errors.push('Missing master verifier');
  }
  
  
  if (!Array.isArray(vault.wallets)) {
    errors.push('Wallets is not an array');
  } else {
    const walletIds = new Set<string>();
    const accountIds = new Set<string>();
    
    for (const wallet of vault.wallets) {
      
      if (!wallet.id) {
        errors.push('Wallet missing ID');
      } else {
        if (walletIds.has(wallet.id)) {
          errors.push(`Duplicate wallet ID: ${wallet.id}`);
        }
        walletIds.add(wallet.id);
        
        
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
    
    
    if (vault.activeWalletId && !walletIds.has(vault.activeWalletId)) {
      errors.push(`Active wallet ID not found: ${vault.activeWalletId}`);
    }
    
    
    if (vault.activeAccountId && !accountIds.has(vault.activeAccountId)) {
      errors.push(`Active account ID not found: ${vault.activeAccountId}`);
    }
  }
  
  
  if (!Array.isArray(vault.watchOnlyAccounts)) {
    errors.push('watchOnlyAccounts is not an array');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

