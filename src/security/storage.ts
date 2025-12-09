

import {
  SecurityStorageSchema,
  DEFAULT_SECURITY_STORAGE,
  SecuritySettings,
  DEFAULT_SECURITY_SETTINGS,
  ConnectionRecord,
  ActiveConnection,
  DomainSettings,
  DomainTrustStatus,
  CustomProgramSetting,
  TransactionVerificationRequest,
  ConnectionFilter,
} from './types';


const STORAGE_KEYS = {
  SECURITY_SETTINGS: 'securitySettings',
  CONNECTION_HISTORY: 'connectionHistory',
  ACTIVE_CONNECTIONS: 'activeConnections',
  DOMAIN_SETTINGS: 'domainSettings',
  CUSTOM_PROGRAMS: 'customPrograms',
  DISMISSED_WARNINGS: 'dismissedWarnings',
  PENDING_VERIFICATIONS: 'pendingVerifications',
} as const;


export async function initializeSecurityStorage(): Promise<void> {
  const storage = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  
  const updates: Partial<SecurityStorageSchema> = {};
  
  if (!storage[STORAGE_KEYS.SECURITY_SETTINGS]) {
    updates.securitySettings = DEFAULT_SECURITY_SETTINGS;
  }
  if (!storage[STORAGE_KEYS.CONNECTION_HISTORY]) {
    updates.connectionHistory = [];
  }
  if (!storage[STORAGE_KEYS.ACTIVE_CONNECTIONS]) {
    updates.activeConnections = {};
  }
  if (!storage[STORAGE_KEYS.DOMAIN_SETTINGS]) {
    updates.domainSettings = {};
  }
  if (!storage[STORAGE_KEYS.CUSTOM_PROGRAMS]) {
    updates.customPrograms = {};
  }
  if (!storage[STORAGE_KEYS.DISMISSED_WARNINGS]) {
    updates.dismissedWarnings = {};
  }
  if (!storage[STORAGE_KEYS.PENDING_VERIFICATIONS]) {
    updates.pendingVerifications = [];
  }
  
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}


export async function getSecuritySettings(): Promise<SecuritySettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SECURITY_SETTINGS);
  return result[STORAGE_KEYS.SECURITY_SETTINGS] || DEFAULT_SECURITY_SETTINGS;
}


export async function saveSecuritySettings(
  settings: Partial<SecuritySettings>
): Promise<SecuritySettings> {
  const current = await getSecuritySettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SECURITY_SETTINGS]: updated });
  return updated;
}


export async function getConnectionHistory(
  filter?: ConnectionFilter,
  limit?: number,
  offset?: number
): Promise<ConnectionRecord[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONNECTION_HISTORY);
  let history: ConnectionRecord[] = result[STORAGE_KEYS.CONNECTION_HISTORY] || [];
  
  
  if (filter) {
    if (filter.domain) {
      history = history.filter(c => c.domain.includes(filter.domain!));
    }
    if (filter.approved !== undefined) {
      history = history.filter(c => c.approved === filter.approved);
    }
    if (filter.revoked !== undefined) {
      history = history.filter(c => c.revoked === filter.revoked);
    }
    if (filter.dateFrom) {
      history = history.filter(c => c.timestamp >= filter.dateFrom!);
    }
    if (filter.dateTo) {
      history = history.filter(c => c.timestamp <= filter.dateTo!);
    }
  }
  
  
  history.sort((a, b) => b.timestamp - a.timestamp);
  
  
  if (offset !== undefined) {
    history = history.slice(offset);
  }
  if (limit !== undefined) {
    history = history.slice(0, limit);
  }
  
  return history;
}


export async function addConnectionRecord(
  record: ConnectionRecord
): Promise<void> {
  const settings = await getSecuritySettings();
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONNECTION_HISTORY);
  let history: ConnectionRecord[] = result[STORAGE_KEYS.CONNECTION_HISTORY] || [];
  
  
  history.unshift(record);
  
  
  if (history.length > settings.maxConnectionHistory) {
    history = history.slice(0, settings.maxConnectionHistory);
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTION_HISTORY]: history });
}


export async function updateConnectionRecord(
  id: string,
  updates: Partial<ConnectionRecord>
): Promise<ConnectionRecord | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONNECTION_HISTORY);
  const history: ConnectionRecord[] = result[STORAGE_KEYS.CONNECTION_HISTORY] || [];
  
  const index = history.findIndex(c => c.id === id);
  if (index === -1) {
    return null;
  }
  
  history[index] = { ...history[index], ...updates };
  await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTION_HISTORY]: history });
  
  return history[index];
}


export async function getLastConnectionForDomain(
  domain: string
): Promise<ConnectionRecord | null> {
  const history = await getConnectionHistory({ domain }, 1);
  return history[0] || null;
}


export async function clearConnectionHistory(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTION_HISTORY]: [] });
}


export async function getActiveConnections(): Promise<Record<string, ActiveConnection>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_CONNECTIONS);
  return result[STORAGE_KEYS.ACTIVE_CONNECTIONS] || {};
}


export async function getActiveConnection(
  domain: string
): Promise<ActiveConnection | null> {
  const connections = await getActiveConnections();
  return connections[domain] || null;
}


export async function setActiveConnection(
  domain: string,
  connection: ActiveConnection
): Promise<void> {
  const connections = await getActiveConnections();
  connections[domain] = connection;
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_CONNECTIONS]: connections });
}


export async function removeActiveConnection(domain: string): Promise<void> {
  const connections = await getActiveConnections();
  delete connections[domain];
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_CONNECTIONS]: connections });
}


export async function getActiveConnectionsList(): Promise<ActiveConnection[]> {
  const connections = await getActiveConnections();
  return Object.values(connections);
}


export async function getDomainSettings(
  domain: string
): Promise<DomainSettings | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_SETTINGS);
  const settings: Record<string, DomainSettings> = result[STORAGE_KEYS.DOMAIN_SETTINGS] || {};
  return settings[domain] || null;
}


export async function getAllDomainSettings(): Promise<Record<string, DomainSettings>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_SETTINGS);
  return result[STORAGE_KEYS.DOMAIN_SETTINGS] || {};
}


export async function saveDomainSettings(
  domain: string,
  updates: Partial<DomainSettings>
): Promise<DomainSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_SETTINGS);
  const allSettings: Record<string, DomainSettings> = result[STORAGE_KEYS.DOMAIN_SETTINGS] || {};
  
  const existing = allSettings[domain];
  const now = Date.now();
  
  if (existing) {
    allSettings[domain] = {
      ...existing,
      ...updates,
      lastSeen: now,
    };
  } else {
    allSettings[domain] = {
      domain,
      trustStatus: 'neutral',
      firstSeen: now,
      lastSeen: now,
      connectionCount: 0,
      ...updates,
    };
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.DOMAIN_SETTINGS]: allSettings });
  return allSettings[domain];
}


export async function setDomainTrustStatus(
  domain: string,
  trustStatus: DomainTrustStatus
): Promise<void> {
  await saveDomainSettings(domain, { trustStatus });
}


export async function incrementDomainConnectionCount(domain: string): Promise<void> {
  const settings = await getDomainSettings(domain);
  const currentCount = settings?.connectionCount || 0;
  await saveDomainSettings(domain, { connectionCount: currentCount + 1 });
}


export async function getDomainsByTrustStatus(
  status: DomainTrustStatus
): Promise<DomainSettings[]> {
  const allSettings = await getAllDomainSettings();
  return Object.values(allSettings).filter(s => s.trustStatus === status);
}


export async function getCustomProgramSetting(
  programId: string
): Promise<CustomProgramSetting | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_PROGRAMS);
  const programs: Record<string, CustomProgramSetting> = result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {};
  return programs[programId] || null;
}


export async function getAllCustomProgramSettings(): Promise<Record<string, CustomProgramSetting>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_PROGRAMS);
  return result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {};
}


export async function setCustomProgramSetting(
  programId: string,
  trustLevel: 'trusted' | 'neutral' | 'blocked',
  label?: string
): Promise<CustomProgramSetting> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_PROGRAMS);
  const programs: Record<string, CustomProgramSetting> = result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {};
  
  programs[programId] = {
    programId,
    trustLevel,
    label,
    addedAt: Date.now(),
  };
  
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_PROGRAMS]: programs });
  return programs[programId];
}


export async function removeCustomProgramSetting(programId: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_PROGRAMS);
  const programs: Record<string, CustomProgramSetting> = result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {};
  
  delete programs[programId];
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_PROGRAMS]: programs });
}


export async function isWarningDismissed(domain: string): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  return domain in dismissed;
}


export async function getDismissedWarningTimestamp(
  domain: string
): Promise<number | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  return dismissed[domain] || null;
}


export async function dismissWarning(domain: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  
  dismissed[domain] = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_WARNINGS]: dismissed });
}


export async function clearDismissedWarning(domain: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  
  delete dismissed[domain];
  await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_WARNINGS]: dismissed });
}


export async function getPendingVerifications(): Promise<TransactionVerificationRequest[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_VERIFICATIONS);
  return result[STORAGE_KEYS.PENDING_VERIFICATIONS] || [];
}


export async function addPendingVerification(
  request: TransactionVerificationRequest
): Promise<void> {
  const pending = await getPendingVerifications();
  pending.push(request);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_VERIFICATIONS]: pending });
}


export async function getPendingVerification(
  requestId: string
): Promise<TransactionVerificationRequest | null> {
  const pending = await getPendingVerifications();
  return pending.find(p => p.requestId === requestId) || null;
}


export async function removePendingVerification(requestId: string): Promise<void> {
  const pending = await getPendingVerifications();
  const filtered = pending.filter(p => p.requestId !== requestId);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_VERIFICATIONS]: filtered });
}


export async function clearExpiredVerifications(): Promise<void> {
  const pending = await getPendingVerifications();
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const valid = pending.filter(p => p.timestamp > fiveMinutesAgo);
  
  if (valid.length !== pending.length) {
    await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_VERIFICATIONS]: valid });
  }
}


export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}


export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}


export async function getFullSecurityStorage(): Promise<SecurityStorageSchema> {
  const result = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    securitySettings: result[STORAGE_KEYS.SECURITY_SETTINGS] || DEFAULT_SECURITY_SETTINGS,
    connectionHistory: result[STORAGE_KEYS.CONNECTION_HISTORY] || [],
    activeConnections: result[STORAGE_KEYS.ACTIVE_CONNECTIONS] || {},
    domainSettings: result[STORAGE_KEYS.DOMAIN_SETTINGS] || {},
    customPrograms: result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {},
    dismissedWarnings: result[STORAGE_KEYS.DISMISSED_WARNINGS] || {},
    pendingVerifications: result[STORAGE_KEYS.PENDING_VERIFICATIONS] || [],
  };
}


export async function clearAllSecurityStorage(): Promise<void> {
  await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
  await initializeSecurityStorage();
}

