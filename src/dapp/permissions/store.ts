/**
 * AINTIVIRUS dApp Connectivity - Permission Store
 * 
 * Manages per-origin permissions for dApp connections.
 * Permissions are stored in chrome.storage.local and scoped by origin + chain type.
 * 
 * SECURITY ARCHITECTURE:
 * - Permissions are per-origin AND per-chain
 * - Each permission stores allowed accounts and chains
 * - Auto-revocation after configurable timeout
 * - All operations validate input
 */

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

// ============================================
// STORAGE HELPERS
// ============================================

const PERMISSION_STORE_VERSION = 1;

/**
 * Get the permission store from storage
 */
async function getStore(): Promise<PermissionStore> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PERMISSIONS);
    const store = result[STORAGE_KEYS.PERMISSIONS] as PermissionStore | undefined;
    
    if (!store || store.version !== PERMISSION_STORE_VERSION) {
      return createDefaultStore();
    }
    
    return store;
  } catch (error) {
    console.error('[Permission Store] Failed to get store:', error);
    return createDefaultStore();
  }
}

/**
 * Save the permission store to storage
 */
async function saveStore(store: PermissionStore): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.PERMISSIONS]: store });
  } catch (error) {
    console.error('[Permission Store] Failed to save store:', error);
    throw error;
  }
}

/**
 * Create a default empty store
 */
function createDefaultStore(): PermissionStore {
  return {
    version: PERMISSION_STORE_VERSION,
    permissions: {},
    settings: { ...DEFAULT_PERMISSION_SETTINGS },
  };
}

// ============================================
// PERMISSION CRUD OPERATIONS
// ============================================

/**
 * Get a specific permission by origin and chain type
 */
export async function getPermission(
  origin: string,
  chainType: DAppChainType
): Promise<SitePermission | null> {
  const store = await getStore();
  const key = createPermissionKey(origin, chainType);
  return store.permissions[key] || null;
}

/**
 * Set or update a permission
 */
export async function setPermission(permission: SitePermission): Promise<void> {
  const store = await getStore();
  const key = createPermissionKey(permission.origin, permission.chainType);
  
  // Update or create permission
  store.permissions[key] = {
    ...permission,
    lastAccessed: Date.now(),
  };
  
  await saveStore(store);
  
  console.log('[Permission Store] Permission set for:', permission.origin, permission.chainType);
}

/**
 * Create a new permission for a site
 */
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

/**
 * Update the accounts for an existing permission
 */
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

/**
 * Update the chains for an existing permission
 */
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

/**
 * Update last accessed timestamp
 */
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

/**
 * Revoke a specific permission
 */
export async function revokePermission(
  origin: string,
  chainType?: DAppChainType
): Promise<void> {
  const store = await getStore();
  
  if (chainType) {
    // Revoke specific chain type permission
    const key = createPermissionKey(origin, chainType);
    delete store.permissions[key];
    console.log('[Permission Store] Permission revoked for:', origin, chainType);
  } else {
    // Revoke all permissions for this origin
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
    console.log('[Permission Store] All permissions revoked for:', origin);
  }
  
  await saveStore(store);
}

/**
 * Revoke all permissions
 */
export async function revokeAllPermissions(): Promise<void> {
  const store = await getStore();
  store.permissions = {};
  await saveStore(store);
  console.log('[Permission Store] All permissions revoked');
}

/**
 * Get all permissions
 */
export async function getAllPermissions(): Promise<SitePermission[]> {
  const store = await getStore();
  return Object.values(store.permissions);
}

/**
 * Get permissions by chain type
 */
export async function getPermissionsByChainType(
  chainType: DAppChainType
): Promise<SitePermission[]> {
  const store = await getStore();
  return Object.values(store.permissions).filter(p => p.chainType === chainType);
}

/**
 * Get permissions for a specific origin (all chain types)
 */
export async function getPermissionsByOrigin(origin: string): Promise<SitePermission[]> {
  const store = await getStore();
  return Object.values(store.permissions).filter(p => p.origin === origin);
}

// ============================================
// PERMISSION CHECKS
// ============================================

/**
 * Check if an origin has permission for a specific chain type
 */
export async function hasPermission(
  origin: string,
  chainType: DAppChainType
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  return permission !== null && permission.accounts.length > 0;
}

/**
 * Check if an origin has permission for a specific account
 */
export async function hasAccountPermission(
  origin: string,
  chainType: DAppChainType,
  account: string
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  if (!permission) return false;
  
  // Normalize account address for comparison
  const normalizedAccount = account.toLowerCase();
  return permission.accounts.some(a => a.toLowerCase() === normalizedAccount);
}

/**
 * Check if an origin has permission for a specific chain
 */
export async function hasChainPermission(
  origin: string,
  chainType: DAppChainType,
  chainId: string
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  if (!permission) return false;
  
  // Normalize chain ID for comparison
  const normalizedChainId = chainId.toLowerCase();
  return permission.chains.some(c => c.toLowerCase() === normalizedChainId);
}

/**
 * Check if permission should auto-approve (remember setting)
 */
export async function shouldAutoApprove(
  origin: string,
  chainType: DAppChainType
): Promise<boolean> {
  const permission = await getPermission(origin, chainType);
  return permission !== null && permission.remember;
}

// ============================================
// SETTINGS
// ============================================

/**
 * Get permission settings
 */
export async function getPermissionSettings(): Promise<PermissionSettings> {
  const store = await getStore();
  return store.settings;
}

/**
 * Update permission settings
 */
export async function updatePermissionSettings(
  settings: Partial<PermissionSettings>
): Promise<void> {
  const store = await getStore();
  store.settings = { ...store.settings, ...settings };
  await saveStore(store);
}

// ============================================
// MAINTENANCE
// ============================================

/**
 * Clean up expired permissions based on auto-revoke setting
 */
export async function cleanupExpiredPermissions(): Promise<number> {
  const store = await getStore();
  const { autoRevokeAfterDays } = store.settings;
  
  // Skip if auto-revoke is disabled
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
    console.log('[Permission Store] Cleaned up', keysToDelete.length, 'expired permissions');
  }
  
  return keysToDelete.length;
}

/**
 * Get permission count
 */
export async function getPermissionCount(): Promise<number> {
  const store = await getStore();
  return Object.keys(store.permissions).length;
}

/**
 * Check if max connected sites limit is reached
 */
export async function isMaxSitesReached(): Promise<boolean> {
  const store = await getStore();
  const { maxConnectedSites } = store.settings;
  
  if (maxConnectedSites === 0) {
    return false; // Unlimited
  }
  
  // Count unique origins
  const origins = new Set(
    Object.values(store.permissions).map(p => p.origin)
  );
  
  return origins.size >= maxConnectedSites;
}

// ============================================
// EXPORT CONVENIENCE TYPE
// ============================================

export type { SitePermission, PermissionSettings };
