

import { ProgramInfo, ProgramRiskLevel, CustomProgramSetting } from './types';
import { getCustomProgramSetting, getAllCustomProgramSettings } from './storage';


export interface RemoteProgramRegistry {
  
  programs: RemoteProgramInfo[];
  
  version: string;
  
  updatedAt: number;
}


export interface RemoteProgramInfo {
  programId: string;
  name: string;
  description: string;
  riskLevel: 'verified' | 'unknown' | 'flagged' | 'malicious';
  category: string;
  website?: string;
}


export interface CachedProgramRegistry {
  data: RemoteProgramRegistry;
  fetchedAt: number;
  expiresAt: number;
  source: string;
  isBootstrap: boolean;
}


export interface ProgramRegistryHealth {
  version: string;
  lastRefresh: number;
  programCount: number;
  usingBootstrap: boolean;
  lastError?: string;
}


const REGISTRY_TTL = 24 * 60 * 60 * 1000;


const MIN_REFRESH_INTERVAL = 5 * 60 * 1000;


const STORAGE_KEY_REGISTRY = 'programRegistryCache';


const DEFAULT_REGISTRY_URL = '';


let registryCache: CachedProgramRegistry | null = null;


let lastRefreshAttempt = 0;


let isRefreshing = false;


const BOOTSTRAP_PROGRAMS: RemoteProgramInfo[] = [
  
  { programId: '11111111111111111111111111111111', name: 'System Program', description: 'Core Solana system program', riskLevel: 'verified', category: 'system' },
  { programId: 'ComputeBudget111111111111111111111111111111', name: 'Compute Budget', description: 'Compute unit management', riskLevel: 'verified', category: 'system' },
  { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', name: 'SPL Token', description: 'Token program', riskLevel: 'verified', category: 'token' },
  { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', name: 'SPL Token 2022', description: 'Token program v2', riskLevel: 'verified', category: 'token' },
  { programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', name: 'Associated Token Account', description: 'ATA program', riskLevel: 'verified', category: 'token' },
  { programId: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', name: 'Metaplex Metadata', description: 'NFT metadata', riskLevel: 'verified', category: 'nft' },
  
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

  }
  
  return null;
}


async function saveRegistryCache(cache: CachedProgramRegistry): Promise<void> {
  registryCache = cache;
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_REGISTRY]: cache });
  } catch (error) {

  }
}


function isCacheExpired(cache: CachedProgramRegistry): boolean {
  return Date.now() > cache.expiresAt;
}


async function fetchRemoteRegistry(url: string): Promise<RemoteProgramRegistry | null> {
  
  if (!url.startsWith('https://')) {

    return null;
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {

      return null;
    }
    
    const data = await response.json();
    
    
    if (!data || !Array.isArray(data.programs)) {

      return null;
    }
    
    return data as RemoteProgramRegistry;
  } catch (error) {

    return null;
  }
}


export async function getProgramRegistry(): Promise<RemoteProgramRegistry> {
  const cached = await getCachedRegistry();
  
  
  if (!cached || isCacheExpired(cached)) {
    refreshProgramRegistry().catch(error => {

    });
  }
  
  
  if (cached?.data) {
    return cached.data;
  }
  
  
  return BOOTSTRAP_REGISTRY;
}


export async function refreshProgramRegistry(force = false): Promise<boolean> {
  
  if (!DEFAULT_REGISTRY_URL) {

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
      
      const merged = mergeRegistries(data, BOOTSTRAP_REGISTRY);
      
      const cache: CachedProgramRegistry = {
        data: merged,
        fetchedAt: now,
        expiresAt: now + REGISTRY_TTL,
        source: DEFAULT_REGISTRY_URL,
        isBootstrap: false,
      };
      
      await saveRegistryCache(cache);

      return true;
    }

    return false;
  } finally {
    isRefreshing = false;
  }
}


function mergeRegistries(
  remote: RemoteProgramRegistry,
  bootstrap: RemoteProgramRegistry
): RemoteProgramRegistry {
  const programMap = new Map<string, RemoteProgramInfo>();
  
  
  for (const program of bootstrap.programs) {
    programMap.set(program.programId, program);
  }
  
  
  for (const program of remote.programs) {
    programMap.set(program.programId, program);
  }
  
  return {
    programs: Array.from(programMap.values()),
    version: remote.version,
    updatedAt: remote.updatedAt,
  };
}


export async function getRemoteProgramInfo(programId: string): Promise<ProgramInfo | null> {
  
  const customSetting = await getCustomProgramSetting(programId);
  if (customSetting) {
    return customSettingToProgramInfo(programId, customSetting);
  }
  
  
  const registry = await getProgramRegistry();
  const program = registry.programs.find(p => p.programId === programId);
  
  if (program) {
    return remoteToProgramInfo(program);
  }
  
  return null;
}


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


function stringToRiskLevel(level: string): ProgramRiskLevel {
  switch (level) {
    case 'verified': return ProgramRiskLevel.VERIFIED;
    case 'flagged': return ProgramRiskLevel.FLAGGED;
    case 'malicious': return ProgramRiskLevel.MALICIOUS;
    default: return ProgramRiskLevel.UNKNOWN;
  }
}


function trustLevelToRiskLevel(trustLevel: 'trusted' | 'neutral' | 'blocked'): ProgramRiskLevel {
  switch (trustLevel) {
    case 'trusted': return ProgramRiskLevel.VERIFIED;
    case 'blocked': return ProgramRiskLevel.MALICIOUS;
    default: return ProgramRiskLevel.UNKNOWN;
  }
}


export async function getProgramRegistryHealth(): Promise<ProgramRegistryHealth> {
  const cached = await getCachedRegistry();
  
  return {
    version: cached?.data?.version || 'none',
    lastRefresh: cached?.fetchedAt || 0,
    programCount: cached?.data?.programs?.length || 0,
    usingBootstrap: cached?.isBootstrap ?? true,
  };
}


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


export async function getProgramsByRiskLevel(riskLevel: ProgramRiskLevel): Promise<ProgramInfo[]> {
  const registry = await getProgramRegistry();
  const levelString = riskLevelToString(riskLevel);
  
  return registry.programs
    .filter(p => p.riskLevel === levelString)
    .map(remoteToProgramInfo);
}


function riskLevelToString(level: ProgramRiskLevel): string {
  switch (level) {
    case ProgramRiskLevel.VERIFIED: return 'verified';
    case ProgramRiskLevel.FLAGGED: return 'flagged';
    case ProgramRiskLevel.MALICIOUS: return 'malicious';
    default: return 'unknown';
  }
}


export async function initializeProgramRegistry(): Promise<void> {

  const cached = await getCachedRegistry();
  
  if (!cached || isCacheExpired(cached)) {
    
    const bootstrapCache: CachedProgramRegistry = {
      data: BOOTSTRAP_REGISTRY,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + REGISTRY_TTL,
      source: 'bootstrap',
      isBootstrap: true,
    };
    await saveRegistryCache(bootstrapCache);
    
    
    refreshProgramRegistry().catch(error => {

    });
  }

}


export function setupProgramRegistryAlarm(): void {
  const ALARM_NAME = 'programRegistryRefresh';
  
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: 6 * 60, 
  });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      refreshProgramRegistry().catch(error => {

      });
    }
  });

}

