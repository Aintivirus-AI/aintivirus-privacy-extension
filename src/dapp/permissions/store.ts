

import {
  SitePermission,
  PermissionStore,
  PermissionSettings,
  DAppChainType,
  DEFAULT_PERMISSION_SETTINGS,
  createPermissionKey,
  parsePermissionKey,
} from '../types';
import { STORAGE_KEYS } from '../bridge/constants';


const PERMISSION_STORE_VERSION = 1;


async function getStore(): Promise<PermissionStore> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);
    const store = result[STORAGE_KEYS.PERMISSIONS] as PermissionStore | undefined;
    
    if (!store || store.version !== PERMISSION_STORE_VERSION) {
      return createDefaultStore();
    }
    
    return store;
  } catch (error) {

    return createDefaultStore();
  }
}


async function saveStore(store: PermissionStore): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.PERMISSIONS]: store });
  } catch (error) {

    throw error;
  }
}


function createDefaultStore(): PermissionStore {
  return {
    version: PERMISSION_STORE_VERSION,
    permissions: {},
    settings: { ...DEFAULT_PERMISSION_SETTINGS },
  };
}


export async function getPermission(
  origin: string,
  chainType: DAppChainType
): Promise<SitePermission | null> {
  const store = await getStore();
  const key = createPermissionKey(origin, chainType);
  return store.permissions[key] || null;
}


export async function setPermission(permission: SitePermission): Promise<void> {
  const store = await getStore();
  const key = createPermissionKey(permission.origin, permission.chainType);
  
  
  store.permissions[key] = {
    ...permission,
    lastAccessed: Date.now(),
  };
  
  await saveStore(store);

}


export async function createPermission(
  origin: string,
  chainType: DAppChainType,
  accounts: string[],
  chains: string[],
  remember: boolean = false
): Promise<SitePermission> {
  const permission: SitePermission = {
    origin,
    chainType,
    accounts,
    chains,
    connectedAt: Date.now(),
    lastAccessed: Date.now(),
    remember,
  };
  
  await setPermission(permission);
  return permission;
}


export async function updatePermissionAccounts(
  origin: string,
  chainType: DAppChainType,
  accounts: string[]
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  
  if (!permission) {
    return false;
  }
  
  permission.accounts = accounts;
  permission.lastAccessed = Date.now();
  
  await setPermission(permission);
  return true;
}


export async function updatePermissionChains(
  origin: string,
  chainType: DAppChainType,
  chains: string[]
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  
  if (!permission) {
    return false;
  }
  
  permission.chains = chains;
  permission.lastAccessed = Date.now();
  
  await setPermission(permission);
  return true;
}


export async function updateLastAccessed(
  origin: string,
  chainType: DAppChainType
): Promise<void> {
  const permission = await getPermission(origin, chainType);
  
  if (permission) {
    permission.lastAccessed = Date.now();
    await setPermission(permission);
  }
}


export async function revokePermission(
  origin: string,
  chainType?: DAppChainType
): Promise<void> {
  const store = await getStore();
  
  if (chainType) {
    
    const key = createPermissionKey(origin, chainType);
    delete store.permissions[key];

  } else {
    
    const keysToDelete: string[] = [];
    for (const key of Object.keys(store.permissions)) {
      const parsed = parsePermissionKey(key);
      if (parsed && parsed.origin === origin) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      delete store.permissions[key];
    }

  }
  
  await saveStore(store);
}


export async function revokeAllPermissions(): Promise<void> {
  const store = await getStore();
  store.permissions = {};
  await saveStore(store);

}


export async function getAllPermissions(): Promise<SitePermission[]> {
  const store = await getStore();
  return Object.values(store.permissions);
}


export async function getPermissionsByChainType(
  chainType: DAppChainType
): Promise<SitePermission[]> {
  const store = await getStore();
  return Object.values(store.permissions).filter(p => p.chainType === chainType);
}


export async function getPermissionsByOrigin(origin: string): Promise<SitePermission[]> {
  const store = await getStore();
  return Object.values(store.permissions).filter(p => p.origin === origin);
}


export async function hasPermission(
  origin: string,
  chainType: DAppChainType
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  return permission !== null && permission.accounts.length > 0;
}


export async function hasAccountPermission(
  origin: string,
  chainType: DAppChainType,
  account: string
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  if (!permission) return false;
  
  
  const normalizedAccount = account.toLowerCase();
  return permission.accounts.some(a => a.toLowerCase() === normalizedAccount);
}


export async function hasChainPermission(
  origin: string,
  chainType: DAppChainType,
  chainId: string
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  if (!permission) return false;
  
  
  const normalizedChainId = chainId.toLowerCase();
  return permission.chains.some(c => c.toLowerCase() === normalizedChainId);
}


export async function shouldAutoApprove(
  origin: string,
  chainType: DAppChainType
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  return permission !== null && permission.remember;
}


export async function getPermissionSettings(): Promise<PermissionSettings> {
  const store = await getStore();
  return store.settings;
}


export async function updatePermissionSettings(
  settings: Partial<PermissionSettings>
): Promise<void> {
  const store = await getStore();
  store.settings = { ...store.settings, ...settings };
  await saveStore(store);
}


export async function cleanupExpiredPermissions(): Promise<number> {
  const store = await getStore();
  const { autoRevokeAfterDays } = store.settings;
  
  
  if (autoRevokeAfterDays === 0) {
    return 0;
  }
  
  const expirationTime = Date.now() - (autoRevokeAfterDays * 24 * 60 * 60 * 1000);
  const keysToDelete: string[] = [];
  
  for (const [key, permission] of Object.entries(store.permissions)) {
    if (permission.lastAccessed < expirationTime) {
      keysToDelete.push(key);
    }
  }
  
  for (const key of keysToDelete) {
    delete store.permissions[key];
  }
  
  if (keysToDelete.length > 0) {
    await saveStore(store);

  }
  
  return keysToDelete.length;
}


export async function getPermissionCount(): Promise<number> {
  const store = await getStore();
  return Object.keys(store.permissions).length;
}


export async function isMaxSitesReached(): Promise<boolean> {
  const store = await getStore();
  const { maxConnectedSites } = store.settings;
  
  if (maxConnectedSites === 0) {
    return false; 
  }
  
  
  const origins = new Set(
    Object.values(store.permissions).map(p => p.origin)
  );
  
  return origins.size >= maxConnectedSites;
}


export type { SitePermission, PermissionSettings };
