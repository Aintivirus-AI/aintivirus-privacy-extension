/**
 * AINTIVIRUS Security Module - Storage Layer
 * 
 * Handles persistence of security-related data including:
 * - Connection history
 * - Domain settings and trust levels
 * - Security settings
 * - Custom program configurations
 * 
 * SECURITY NOTE:
 * All data is stored in chrome.storage.local which is accessible
 * only to this extension. Data is not encrypted at rest.
 */

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

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  SECURITY_SETTINGS: 'securitySettings',
  CONNECTION_HISTORY: 'connectionHistory',
  ACTIVE_CONNECTIONS: 'activeConnections',
  DOMAIN_SETTINGS: 'domainSettings',
  CUSTOM_PROGRAMS: 'customPrograms',
  DISMISSED_WARNINGS: 'dismissedWarnings',
  PENDING_VERIFICATIONS: 'pendingVerifications',
} as const;

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize security storage with defaults if not present
 */
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
    console.log('[AINTIVIRUS Security] Storage initialized with defaults');
  }
}

// ============================================
// SECURITY SETTINGS
// ============================================

/**
 * Get current security settings
 */
export async function getSecuritySettings(): Promise<SecuritySettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SECURITY_SETTINGS);
  return result[STORAGE_KEYS.SECURITY_SETTINGS] || DEFAULT_SECURITY_SETTINGS;
}

/**
 * Update security settings
 */
export async function saveSecuritySettings(
  settings: Partial<SecuritySettings>
): Promise<SecuritySettings> {
  const current = await getSecuritySettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SECURITY_SETTINGS]: updated });
  return updated;
}

// ============================================
// CONNECTION HISTORY
// ============================================

/**
 * Get connection history with optional filtering
 */
export async function getConnectionHistory(
  filter?: ConnectionFilter,
  limit?: number,
  offset?: number
): Promise<ConnectionRecord[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONNECTION_HISTORY);
  let history: ConnectionRecord[] = result[STORAGE_KEYS.CONNECTION_HISTORY] || [];
  
  // Apply filters
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
  
  // Sort by timestamp descending (most recent first)
  history.sort((a, b) => b.timestamp - a.timestamp);
  
  // Apply pagination
  if (offset !== undefined) {
    history = history.slice(offset);
  }
  if (limit !== undefined) {
    history = history.slice(0, limit);
  }
  
  return history;
}

/**
 * Add a connection record to history
 */
export async function addConnectionRecord(
  record: ConnectionRecord
): Promise<void> {
  const settings = await getSecuritySettings();
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONNECTION_HISTORY);
  let history: ConnectionRecord[] = result[STORAGE_KEYS.CONNECTION_HISTORY] || [];
  
  // Add new record at the beginning
  history.unshift(record);
  
  // Enforce maximum history size
  if (history.length > settings.maxConnectionHistory) {
    history = history.slice(0, settings.maxConnectionHistory);
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTION_HISTORY]: history });
}

/**
 * Update a connection record (e.g., to mark as revoked)
 */
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

/**
 * Get the most recent connection for a domain
 */
export async function getLastConnectionForDomain(
  domain: string
): Promise<ConnectionRecord | null> {
  const history = await getConnectionHistory({ domain }, 1);
  return history[0] || null;
}

/**
 * Clear all connection history
 */
export async function clearConnectionHistory(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTION_HISTORY]: [] });
}

// ============================================
// ACTIVE CONNECTIONS
// ============================================

/**
 * Get all active connections
 */
export async function getActiveConnections(): Promise<Record<string, ActiveConnection>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_CONNECTIONS);
  return result[STORAGE_KEYS.ACTIVE_CONNECTIONS] || {};
}

/**
 * Get active connection for a domain
 */
export async function getActiveConnection(
  domain: string
): Promise<ActiveConnection | null> {
  const connections = await getActiveConnections();
  return connections[domain] || null;
}

/**
 * Set active connection for a domain
 */
export async function setActiveConnection(
  domain: string,
  connection: ActiveConnection
): Promise<void> {
  const connections = await getActiveConnections();
  connections[domain] = connection;
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_CONNECTIONS]: connections });
}

/**
 * Remove active connection for a domain
 */
export async function removeActiveConnection(domain: string): Promise<void> {
  const connections = await getActiveConnections();
  delete connections[domain];
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_CONNECTIONS]: connections });
}

/**
 * Get list of all active connections as array
 */
export async function getActiveConnectionsList(): Promise<ActiveConnection[]> {
  const connections = await getActiveConnections();
  return Object.values(connections);
}

// ============================================
// DOMAIN SETTINGS
// ============================================

/**
 * Get settings for a specific domain
 */
export async function getDomainSettings(
  domain: string
): Promise<DomainSettings | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_SETTINGS);
  const settings: Record<string, DomainSettings> = result[STORAGE_KEYS.DOMAIN_SETTINGS] || {};
  return settings[domain] || null;
}

/**
 * Get all domain settings
 */
export async function getAllDomainSettings(): Promise<Record<string, DomainSettings>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_SETTINGS);
  return result[STORAGE_KEYS.DOMAIN_SETTINGS] || {};
}

/**
 * Create or update domain settings
 */
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

/**
 * Update domain trust status
 */
export async function setDomainTrustStatus(
  domain: string,
  trustStatus: DomainTrustStatus
): Promise<void> {
  await saveDomainSettings(domain, { trustStatus });
}

/**
 * Increment connection count for a domain
 */
export async function incrementDomainConnectionCount(domain: string): Promise<void> {
  const settings = await getDomainSettings(domain);
  const currentCount = settings?.connectionCount || 0;
  await saveDomainSettings(domain, { connectionCount: currentCount + 1 });
}

/**
 * Get domains by trust status
 */
export async function getDomainsByTrustStatus(
  status: DomainTrustStatus
): Promise<DomainSettings[]> {
  const allSettings = await getAllDomainSettings();
  return Object.values(allSettings).filter(s => s.trustStatus === status);
}

// ============================================
// CUSTOM PROGRAMS
// ============================================

/**
 * Get custom program setting
 */
export async function getCustomProgramSetting(
  programId: string
): Promise<CustomProgramSetting | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_PROGRAMS);
  const programs: Record<string, CustomProgramSetting> = result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {};
  return programs[programId] || null;
}

/**
 * Get all custom program settings
 */
export async function getAllCustomProgramSettings(): Promise<Record<string, CustomProgramSetting>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_PROGRAMS);
  return result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {};
}

/**
 * Set custom program trust level
 */
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

/**
 * Remove custom program setting
 */
export async function removeCustomProgramSetting(programId: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_PROGRAMS);
  const programs: Record<string, CustomProgramSetting> = result[STORAGE_KEYS.CUSTOM_PROGRAMS] || {};
  
  delete programs[programId];
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_PROGRAMS]: programs });
}

// ============================================
// DISMISSED WARNINGS
// ============================================

/**
 * Check if warnings have been dismissed for a domain
 */
export async function isWarningDismissed(domain: string): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  return domain in dismissed;
}

/**
 * Get dismissed warning timestamp for a domain
 */
export async function getDismissedWarningTimestamp(
  domain: string
): Promise<number | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  return dismissed[domain] || null;
}

/**
 * Mark warning as dismissed for a domain
 */
export async function dismissWarning(domain: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  
  dismissed[domain] = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_WARNINGS]: dismissed });
}

/**
 * Clear dismissed warning for a domain
 */
export async function clearDismissedWarning(domain: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_WARNINGS);
  const dismissed: Record<string, number> = result[STORAGE_KEYS.DISMISSED_WARNINGS] || {};
  
  delete dismissed[domain];
  await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_WARNINGS]: dismissed });
}

// ============================================
// PENDING VERIFICATIONS
// ============================================

/**
 * Get all pending transaction verifications
 */
export async function getPendingVerifications(): Promise<TransactionVerificationRequest[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_VERIFICATIONS);
  return result[STORAGE_KEYS.PENDING_VERIFICATIONS] || [];
}

/**
 * Add a pending transaction verification
 */
export async function addPendingVerification(
  request: TransactionVerificationRequest
): Promise<void> {
  const pending = await getPendingVerifications();
  pending.push(request);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_VERIFICATIONS]: pending });
}

/**
 * Get a specific pending verification by ID
 */
export async function getPendingVerification(
  requestId: string
): Promise<TransactionVerificationRequest | null> {
  const pending = await getPendingVerifications();
  return pending.find(p => p.requestId === requestId) || null;
}

/**
 * Remove a pending verification (after decision)
 */
export async function removePendingVerification(requestId: string): Promise<void> {
  const pending = await getPendingVerifications();
  const filtered = pending.filter(p => p.requestId !== requestId);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_VERIFICATIONS]: filtered });
}

/**
 * Clear expired pending verifications (older than 5 minutes)
 */
export async function clearExpiredVerifications(): Promise<void> {
  const pending = await getPendingVerifications();
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const valid = pending.filter(p => p.timestamp > fiveMinutesAgo);
  
  if (valid.length !== pending.length) {
    await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_VERIFICATIONS]: valid });
    console.log(`[AINTIVIRUS Security] Cleared ${pending.length - valid.length} expired verifications`);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a unique ID for records
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * Get complete security storage state (for debugging)
 */
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

/**
 * Clear all security storage (for reset/testing)
 */
export async function clearAllSecurityStorage(): Promise<void> {
  await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
  await initializeSecurityStorage();
  console.log('[AINTIVIRUS Security] All security storage cleared');
}


