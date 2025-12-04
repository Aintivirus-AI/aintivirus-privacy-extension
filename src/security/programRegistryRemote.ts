/**
 * AINTIVIRUS Security Module - Remote Program Registry
 * 
 * Provides remotely-updatable program registry with:
 * - Periodic refresh from remote JSON endpoint
 * - Local caching in chrome.storage
 * - Offline fallback to bootstrap data
 * - Merge with user custom settings
 * 
 * SECURITY: Only fetches from HTTPS endpoints
 */

import { ProgramInfo, ProgramRiskLevel, CustomProgramSetting } from './types';
import { getCustomProgramSetting, getAllCustomProgramSettings } from './storage';

// ============================================
// TYPES
// ============================================

/**
 * Remote program registry data structure
 */
export interface RemoteProgramRegistry {
  /** List of known programs */
  programs: RemoteProgramInfo[];
  /** Version identifier */
  version: string;
  /** When this data was last updated (Unix ms) */
  updatedAt: number;
}

/**
 * Remote program info (may have different structure than local)
 */
export interface RemoteProgramInfo {
  programId: string;
  name: string;
  description: string;
  riskLevel: 'verified' | 'unknown' | 'flagged' | 'malicious';
  category: string;
  website?: string;
}

/**
 * Cached remote registry
 */
export interface CachedProgramRegistry {
  data: RemoteProgramRegistry;
  fetchedAt: number;
  expiresAt: number;
  source: string;
  isBootstrap: boolean;
}

/**
 * Program registry health status
 */
export interface ProgramRegistryHealth {
  version: string;
  lastRefresh: number;
  programCount: number;
  usingBootstrap: boolean;
  lastError?: string;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * TTL for program registry cache (24 hours)
 */
const REGISTRY_TTL = 24 * 60 * 60 * 1000;

/**
 * Minimum refresh interval (5 minutes)
 */
const MIN_REFRESH_INTERVAL = 5 * 60 * 1000;

/**
 * Storage key for cached registry
 */
const STORAGE_KEY_REGISTRY = 'programRegistryCache';

/**
 * Default remote registry URL
 * 
 * NOTE: Set to empty string to disable remote fetching until a real endpoint is configured.
 * When a threat intel service is available, update this URL.
 */
const DEFAULT_REGISTRY_URL = '';

// ============================================
// MODULE STATE
// ============================================

/** In-memory cache */
let registryCache: CachedProgramRegistry | null = null;

/** Last refresh attempt */
let lastRefreshAttempt = 0;

/** Whether refresh is in progress */
let isRefreshing = false;

// ============================================
// BOOTSTRAP DATA
// ============================================

/**
 * Bootstrap program data (from static programRegistry.ts)
 * This is the minimum set of programs we know about
 */
const BOOTSTRAP_PROGRAMS: RemoteProgramInfo[] = [
  // Native programs
  { programId: '11111111111111111111111111111111', name: 'System Program', description: 'Core Solana system program', riskLevel: 'verified', category: 'system' },
  { programId: 'ComputeBudget111111111111111111111111111111', name: 'Compute Budget', description: 'Compute unit management', riskLevel: 'verified', category: 'system' },
  { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', name: 'SPL Token', description: 'Token program', riskLevel: 'verified', category: 'token' },
  { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', name: 'SPL Token 2022', description: 'Token program v2', riskLevel: 'verified', category: 'token' },
  { programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', name: 'Associated Token Account', description: 'ATA program', riskLevel: 'verified', category: 'token' },
  { programId: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', name: 'Metaplex Metadata', description: 'NFT metadata', riskLevel: 'verified', category: 'nft' },
  // Major DeFi
  { programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', name: 'Jupiter v6', description: 'DEX aggregator', riskLevel: 'verified', category: 'defi', website: 'https://jup.ag' },
  { programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', name: 'Raydium AMM', description: 'AMM', riskLevel: 'verified', category: 'defi', website: 'https://raydium.io' },
  { programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', name: 'Orca Whirlpools', description: 'CLMM pools', riskLevel: 'verified', category: 'defi', website: 'https://orca.so' },
  { programId: 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD', name: 'Marinade', description: 'Liquid staking', riskLevel: 'verified', category: 'defi', website: 'https://marinade.finance' },
  { programId: 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K', name: 'Magic Eden v2', description: 'NFT marketplace', riskLevel: 'verified', category: 'nft', website: 'https://magiceden.io' },
];

const BOOTSTRAP_REGISTRY: RemoteProgramRegistry = {
  programs: BOOTSTRAP_PROGRAMS,
  version: 'bootstrap-1.0.0',
  updatedAt: Date.now(),
};

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Get cached registry from storage
 */
async function getCachedRegistry(): Promise<CachedProgramRegistry | null> {
  if (registryCache) {
    return registryCache;
  }
  
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_REGISTRY);
    if (result[STORAGE_KEY_REGISTRY]) {
      registryCache = result[STORAGE_KEY_REGISTRY];
      return registryCache;
    }
  } catch (error) {
    console.warn('[ProgramRegistry] Failed to read cache:', error);
  }
  
  return null;
}

/**
 * Save registry to cache
 */
async function saveRegistryCache(cache: CachedProgramRegistry): Promise<void> {
  registryCache = cache;
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_REGISTRY]: cache });
  } catch (error) {
    console.error('[ProgramRegistry] Failed to save cache:', error);
  }
}

/**
 * Check if cache is expired
 */
function isCacheExpired(cache: CachedProgramRegistry): boolean {
  return Date.now() > cache.expiresAt;
}

// ============================================
// FETCHING
// ============================================

/**
 * Fetch registry from remote URL
 */
async function fetchRemoteRegistry(url: string): Promise<RemoteProgramRegistry | null> {
  // SECURITY: Require HTTPS
  if (!url.startsWith('https://')) {
    console.error('[ProgramRegistry] Security: Only HTTPS URLs allowed');
    return null;
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`[ProgramRegistry] Fetch failed: HTTP ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Validate structure
    if (!data || !Array.isArray(data.programs)) {
      console.error('[ProgramRegistry] Invalid data format');
      return null;
    }
    
    return data as RemoteProgramRegistry;
  } catch (error) {
    console.error('[ProgramRegistry] Fetch error:', error);
    return null;
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get current program registry data
 * Returns cached data, triggering background refresh if stale
 */
export async function getProgramRegistry(): Promise<RemoteProgramRegistry> {
  const cached = await getCachedRegistry();
  
  // Trigger background refresh if needed
  if (!cached || isCacheExpired(cached)) {
    refreshProgramRegistry().catch(error => {
      console.error('[ProgramRegistry] Background refresh failed:', error);
    });
  }
  
  // Return cached data if available
  if (cached?.data) {
    return cached.data;
  }
  
  // Fall back to bootstrap
  return BOOTSTRAP_REGISTRY;
}

/**
 * Force refresh program registry
 */
export async function refreshProgramRegistry(force = false): Promise<boolean> {
  // Skip if no remote URL configured
  if (!DEFAULT_REGISTRY_URL) {
    console.log('[ProgramRegistry] No remote URL configured, using bootstrap data');
    return false;
  }
  
  if (isRefreshing) {
    return false;
  }
  
  const now = Date.now();
  if (!force && now - lastRefreshAttempt < MIN_REFRESH_INTERVAL) {
    return false;
  }
  
  isRefreshing = true;
  lastRefreshAttempt = now;
  
  try {
    const data = await fetchRemoteRegistry(DEFAULT_REGISTRY_URL);
    
    if (data) {
      // Merge with bootstrap to ensure complete coverage
      const merged = mergeRegistries(data, BOOTSTRAP_REGISTRY);
      
      const cache: CachedProgramRegistry = {
        data: merged,
        fetchedAt: now,
        expiresAt: now + REGISTRY_TTL,
        source: DEFAULT_REGISTRY_URL,
        isBootstrap: false,
      };
      
      await saveRegistryCache(cache);
      console.log(`[ProgramRegistry] Refreshed: ${merged.programs.length} programs`);
      return true;
    }
    
    console.warn('[ProgramRegistry] Refresh failed, using cached/bootstrap');
    return false;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Merge remote registry with bootstrap
 */
function mergeRegistries(
  remote: RemoteProgramRegistry,
  bootstrap: RemoteProgramRegistry
): RemoteProgramRegistry {
  const programMap = new Map<string, RemoteProgramInfo>();
  
  // Add bootstrap first
  for (const program of bootstrap.programs) {
    programMap.set(program.programId, program);
  }
  
  // Override with remote (remote takes precedence)
  for (const program of remote.programs) {
    programMap.set(program.programId, program);
  }
  
  return {
    programs: Array.from(programMap.values()),
    version: remote.version,
    updatedAt: remote.updatedAt,
  };
}

/**
 * Get program info by ID
 * Checks custom settings first, then registry
 */
export async function getRemoteProgramInfo(programId: string): Promise<ProgramInfo | null> {
  // Check custom settings first
  const customSetting = await getCustomProgramSetting(programId);
  if (customSetting) {
    return customSettingToProgramInfo(programId, customSetting);
  }
  
  // Check registry
  const registry = await getProgramRegistry();
  const program = registry.programs.find(p => p.programId === programId);
  
  if (program) {
    return remoteToProgramInfo(program);
  }
  
  return null;
}

/**
 * Convert remote program info to local format
 */
function remoteToProgramInfo(remote: RemoteProgramInfo): ProgramInfo {
  return {
    programId: remote.programId,
    name: remote.name,
    description: remote.description,
    riskLevel: stringToRiskLevel(remote.riskLevel),
    category: remote.category,
    isNative: remote.category === 'system',
    website: remote.website,
    lastUpdated: Date.now(),
  };
}

/**
 * Convert custom setting to program info
 */
function customSettingToProgramInfo(
  programId: string,
  setting: CustomProgramSetting
): ProgramInfo {
  return {
    programId,
    name: setting.label || 'Custom Program',
    description: 'User-configured program',
    riskLevel: trustLevelToRiskLevel(setting.trustLevel),
    category: 'custom',
    isNative: false,
    lastUpdated: setting.addedAt,
  };
}

/**
 * Convert string risk level to enum
 */
function stringToRiskLevel(level: string): ProgramRiskLevel {
  switch (level) {
    case 'verified': return ProgramRiskLevel.VERIFIED;
    case 'flagged': return ProgramRiskLevel.FLAGGED;
    case 'malicious': return ProgramRiskLevel.MALICIOUS;
    default: return ProgramRiskLevel.UNKNOWN;
  }
}

/**
 * Convert trust level to risk level
 */
function trustLevelToRiskLevel(trustLevel: 'trusted' | 'neutral' | 'blocked'): ProgramRiskLevel {
  switch (trustLevel) {
    case 'trusted': return ProgramRiskLevel.VERIFIED;
    case 'blocked': return ProgramRiskLevel.MALICIOUS;
    default: return ProgramRiskLevel.UNKNOWN;
  }
}

/**
 * Get registry health status
 */
export async function getProgramRegistryHealth(): Promise<ProgramRegistryHealth> {
  const cached = await getCachedRegistry();
  
  return {
    version: cached?.data?.version || 'none',
    lastRefresh: cached?.fetchedAt || 0,
    programCount: cached?.data?.programs?.length || 0,
    usingBootstrap: cached?.isBootstrap ?? true,
  };
}

/**
 * Search programs by name or ID
 */
export async function searchPrograms(query: string): Promise<ProgramInfo[]> {
  const registry = await getProgramRegistry();
  const lowerQuery = query.toLowerCase();
  
  return registry.programs
    .filter(p => 
      p.name.toLowerCase().includes(lowerQuery) || 
      p.programId.includes(query)
    )
    .map(remoteToProgramInfo);
}

/**
 * Get programs by risk level
 */
export async function getProgramsByRiskLevel(riskLevel: ProgramRiskLevel): Promise<ProgramInfo[]> {
  const registry = await getProgramRegistry();
  const levelString = riskLevelToString(riskLevel);
  
  return registry.programs
    .filter(p => p.riskLevel === levelString)
    .map(remoteToProgramInfo);
}

/**
 * Convert risk level enum to string
 */
function riskLevelToString(level: ProgramRiskLevel): string {
  switch (level) {
    case ProgramRiskLevel.VERIFIED: return 'verified';
    case ProgramRiskLevel.FLAGGED: return 'flagged';
    case ProgramRiskLevel.MALICIOUS: return 'malicious';
    default: return 'unknown';
  }
}

/**
 * Initialize program registry
 */
export async function initializeProgramRegistry(): Promise<void> {
  console.log('[ProgramRegistry] Initializing...');
  
  const cached = await getCachedRegistry();
  
  if (!cached || isCacheExpired(cached)) {
    // Use bootstrap immediately
    const bootstrapCache: CachedProgramRegistry = {
      data: BOOTSTRAP_REGISTRY,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + REGISTRY_TTL,
      source: 'bootstrap',
      isBootstrap: true,
    };
    await saveRegistryCache(bootstrapCache);
    
    // Try remote refresh in background
    refreshProgramRegistry().catch(error => {
      console.warn('[ProgramRegistry] Initial refresh failed:', error);
    });
  }
  
  console.log('[ProgramRegistry] Initialized');
}

/**
 * Set up periodic refresh alarm
 */
export function setupProgramRegistryAlarm(): void {
  const ALARM_NAME = 'programRegistryRefresh';
  
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: 6 * 60, // 6 hours
  });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      refreshProgramRegistry().catch(error => {
        console.error('[ProgramRegistry] Scheduled refresh failed:', error);
      });
    }
  });
  
  console.log('[ProgramRegistry] Refresh alarm configured');
}

