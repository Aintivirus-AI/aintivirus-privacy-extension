/**
 * AINTIVIRUS Security Module - Connection Monitor
 * 
 * Tracks and manages wallet connections to dApps.
 * Provides connection approval flow, history, and revocation.
 * 
 * SECURITY NOTE:
 * - Connection tracking is informational
 * - Revoking a connection here does NOT disconnect from the dApp
 * - The actual wallet connection state is managed by the dApp
 * - This module provides awareness and logging only
 */

import {
  ConnectionRecord,
  ActiveConnection,
  DomainSettings,
  RiskLevel,
  PhishingAnalysis,
} from './types';
import {
  getConnectionHistory,
  addConnectionRecord,
  updateConnectionRecord,
  getActiveConnections,
  getActiveConnection,
  setActiveConnection,
  removeActiveConnection,
  getActiveConnectionsList,
  getDomainSettings,
  saveDomainSettings,
  incrementDomainConnectionCount,
  getSecuritySettings,
  generateId,
  extractDomain,
} from './storage';
import { analyzeDomain } from './phishingDetector';
import { getPublicAddress } from '../wallet/storage';

// ============================================
// CONNECTION REQUEST HANDLING
// ============================================

/**
 * Process a wallet connection request from a dApp
 * 
 * This is called when a dApp requests wallet connection.
 * Returns analysis of the domain and whether it's safe to proceed.
 * 
 * @param domain - Domain requesting connection
 * @param url - Full URL of the request
 * @param tabId - Browser tab ID
 * @returns Phishing analysis for the domain
 */
export async function handleConnectionRequest(
  domain: string,
  url: string,
  tabId?: number
): Promise<PhishingAnalysis> {
  const normalizedDomain = extractDomain(url);
  
  // Analyze the domain for phishing indicators
  const analysis = await analyzeDomain(normalizedDomain);
  
  console.log(`[AINTIVIRUS Security] Connection request from ${normalizedDomain}:`, {
    isPhishing: analysis.isPhishing,
    riskLevel: analysis.riskLevel,
    signals: analysis.signals.length,
  });
  
  return analysis;
}

/**
 * Approve a wallet connection
 * 
 * Call this after user approves the connection.
 * Records the connection and updates domain statistics.
 * 
 * @param domain - Domain being connected
 * @param url - Full URL
 * @param publicKey - Public key being connected
 * @param riskLevel - Risk level at time of approval
 * @param warnings - Warnings shown to user
 * @param tabId - Browser tab ID
 * @returns The created connection record
 */
export async function approveConnection(
  domain: string,
  url: string,
  publicKey?: string,
  riskLevel: RiskLevel = 'low',
  warnings: string[] = [],
  tabId?: number
): Promise<ConnectionRecord> {
  const normalizedDomain = extractDomain(url);
  
  // Get public key if not provided
  let connectedKey = publicKey;
  if (!connectedKey) {
    connectedKey = await getPublicAddress() || 'unknown';
  }
  
  // Create connection record
  const record: ConnectionRecord = {
    id: generateId(),
    domain: normalizedDomain,
    url,
    timestamp: Date.now(),
    publicKey: connectedKey,
    approved: true,
    revoked: false,
    riskLevel,
    warnings,
  };
  
  // Save to history
  await addConnectionRecord(record);
  
  // Update active connections
  await setActiveConnection(normalizedDomain, {
    domain: normalizedDomain,
    publicKey: connectedKey,
    connectedAt: Date.now(),
    tabId,
  });
  
  // Update domain statistics
  await incrementDomainConnectionCount(normalizedDomain);
  
  console.log(`[AINTIVIRUS Security] Connection approved: ${normalizedDomain}`);
  
  return record;
}

/**
 * Deny a wallet connection
 * 
 * Call this when user denies the connection request.
 * Records the denial for tracking purposes.
 * 
 * @param domain - Domain that was denied
 * @param url - Full URL
 * @param reason - Reason for denial (optional)
 */
export async function denyConnection(
  domain: string,
  url: string,
  reason?: string
): Promise<void> {
  const normalizedDomain = extractDomain(url);
  
  // Get analysis to record risk level
  const analysis = await analyzeDomain(normalizedDomain);
  
  // Create denial record
  const record: ConnectionRecord = {
    id: generateId(),
    domain: normalizedDomain,
    url,
    timestamp: Date.now(),
    publicKey: '',
    approved: false,
    revoked: false,
    riskLevel: analysis.riskLevel,
    warnings: reason ? [reason] : analysis.signals.map(s => s.description),
  };
  
  // Save to history
  await addConnectionRecord(record);
  
  console.log(`[AINTIVIRUS Security] Connection denied: ${normalizedDomain}${reason ? ` (${reason})` : ''}`);
}

/**
 * Revoke an existing connection
 * 
 * IMPORTANT: This only updates our internal state.
 * The dApp may still consider itself connected.
 * User should also disconnect within the dApp.
 * 
 * @param domain - Domain to revoke
 */
export async function revokeConnection(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);
  
  // Remove from active connections
  await removeActiveConnection(normalizedDomain);
  
  // Find and update the most recent approved connection record
  const history = await getConnectionHistory({ domain: normalizedDomain, approved: true }, 1);
  if (history.length > 0) {
    await updateConnectionRecord(history[0].id, {
      revoked: true,
      revokedAt: Date.now(),
    });
  }
  
  console.log(`[AINTIVIRUS Security] Connection revoked: ${normalizedDomain}`);
}

/**
 * Revoke all active connections
 * 
 * IMPORTANT: This only updates our internal state.
 * dApps may still consider themselves connected.
 */
export async function revokeAllConnections(): Promise<void> {
  const activeConnections = await getActiveConnectionsList();
  
  for (const connection of activeConnections) {
    await revokeConnection(connection.domain);
  }
  
  console.log(`[AINTIVIRUS Security] All connections revoked (${activeConnections.length} total)`);
}

// ============================================
// CONNECTION QUERIES
// ============================================

/**
 * Get all active connections
 */
export async function getAllActiveConnections(): Promise<ActiveConnection[]> {
  return getActiveConnectionsList();
}

/**
 * Check if connected to a domain
 */
export async function isConnectedToDomain(domain: string): Promise<boolean> {
  const connection = await getActiveConnection(extractDomain(domain));
  return connection !== null;
}

/**
 * Get connection status for a domain
 */
export async function getConnectionStatus(domain: string): Promise<{
  isConnected: boolean;
  connection: ActiveConnection | null;
  lastConnection: ConnectionRecord | null;
  domainSettings: DomainSettings | null;
}> {
  const normalizedDomain = extractDomain(domain);
  
  const [connection, lastConnection, domainSettings] = await Promise.all([
    getActiveConnection(normalizedDomain),
    getConnectionHistory({ domain: normalizedDomain }, 1).then(h => h[0] || null),
    getDomainSettings(normalizedDomain),
  ]);
  
  return {
    isConnected: connection !== null,
    connection,
    lastConnection,
    domainSettings,
  };
}

/**
 * Get connection history with pagination
 */
export async function getConnections(
  limit?: number,
  offset?: number,
  filter?: {
    domain?: string;
    approved?: boolean;
    revoked?: boolean;
  }
): Promise<ConnectionRecord[]> {
  return getConnectionHistory(filter, limit, offset);
}

/**
 * Get connection statistics
 */
export async function getConnectionStats(): Promise<{
  totalConnections: number;
  activeConnections: number;
  approvedConnections: number;
  deniedConnections: number;
  revokedConnections: number;
  uniqueDomains: number;
}> {
  const allHistory = await getConnectionHistory();
  const activeList = await getActiveConnectionsList();
  
  const uniqueDomains = new Set(allHistory.map(c => c.domain));
  
  return {
    totalConnections: allHistory.length,
    activeConnections: activeList.length,
    approvedConnections: allHistory.filter(c => c.approved).length,
    deniedConnections: allHistory.filter(c => !c.approved).length,
    revokedConnections: allHistory.filter(c => c.revoked).length,
    uniqueDomains: uniqueDomains.size,
  };
}

// ============================================
// DOMAIN TRUST MANAGEMENT
// ============================================

/**
 * Trust a domain for future connections
 * 
 * Trusted domains will not show phishing warnings.
 * 
 * @param domain - Domain to trust
 */
export async function trustDomain(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);
  await saveDomainSettings(normalizedDomain, { trustStatus: 'trusted' });
  console.log(`[AINTIVIRUS Security] Domain trusted: ${normalizedDomain}`);
}

/**
 * Block a domain
 * 
 * Blocked domains will always show high-risk warnings.
 * 
 * @param domain - Domain to block
 */
export async function blockDomain(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);
  
  // Revoke any active connection
  await revokeConnection(normalizedDomain);
  
  // Update trust status
  await saveDomainSettings(normalizedDomain, { trustStatus: 'blocked' });
  console.log(`[AINTIVIRUS Security] Domain blocked: ${normalizedDomain}`);
}

/**
 * Reset domain trust to neutral
 * 
 * @param domain - Domain to reset
 */
export async function resetDomainTrust(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);
  await saveDomainSettings(normalizedDomain, { trustStatus: 'neutral' });
  console.log(`[AINTIVIRUS Security] Domain trust reset: ${normalizedDomain}`);
}

/**
 * Check if a domain should be auto-approved
 * 
 * Auto-approval is granted for:
 * - Domains marked as trusted by user
 * - Known legitimate domains (configurable)
 */
export async function shouldAutoApprove(domain: string): Promise<boolean> {
  const normalizedDomain = extractDomain(domain);
  const settings = await getSecuritySettings();
  
  // Check user trust settings
  const domainSettings = await getDomainSettings(normalizedDomain);
  if (domainSettings?.trustStatus === 'trusted') {
    return true;
  }
  if (domainSettings?.trustStatus === 'blocked') {
    return false;
  }
  
  // Never auto-approve - always require user confirmation
  // This is a security-first approach
  return false;
}

/**
 * Check if a domain should be auto-blocked
 */
export async function shouldAutoBlock(domain: string): Promise<boolean> {
  const normalizedDomain = extractDomain(domain);
  const settings = await getSecuritySettings();
  
  // Check user block settings
  const domainSettings = await getDomainSettings(normalizedDomain);
  if (domainSettings?.trustStatus === 'blocked') {
    return true;
  }
  
  // Check if auto-block malicious is enabled
  if (settings.autoBlockMalicious) {
    const analysis = await analyzeDomain(normalizedDomain);
    if (analysis.signals.some(s => s.type === 'known_scam')) {
      return true;
    }
  }
  
  return false;
}

// ============================================
// CONNECTION LIFECYCLE
// ============================================

/**
 * Handle tab close event
 * 
 * When a tab is closed, we mark any connections from that tab
 * as potentially inactive (though the dApp may reconnect).
 * 
 * @param tabId - ID of the closed tab
 */
export async function handleTabClosed(tabId: number): Promise<void> {
  const activeConnections = await getActiveConnections();
  
  for (const [domain, connection] of Object.entries(activeConnections)) {
    if (connection.tabId === tabId) {
      // Don't remove immediately - dApp might reconnect
      // Just log for awareness
      console.log(`[AINTIVIRUS Security] Tab closed for connection: ${domain}`);
    }
  }
}

/**
 * Clean up stale connections
 * 
 * Removes connections older than the specified age.
 * Called periodically to prevent storage buildup.
 * 
 * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 */
export async function cleanupStaleConnections(
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
  const activeConnections = await getActiveConnections();
  const now = Date.now();
  let cleaned = 0;
  
  for (const [domain, connection] of Object.entries(activeConnections)) {
    if (now - connection.connectedAt > maxAgeMs) {
      await removeActiveConnection(domain);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[AINTIVIRUS Security] Cleaned ${cleaned} stale connections`);
  }
  
  return cleaned;
}

// ============================================
// EXPORT SUMMARY
// ============================================

/**
 * Get a summary of connections for export/backup
 */
export async function exportConnectionData(): Promise<{
  activeConnections: ActiveConnection[];
  history: ConnectionRecord[];
  stats: Awaited<ReturnType<typeof getConnectionStats>>;
}> {
  const [activeConnections, history, stats] = await Promise.all([
    getActiveConnectionsList(),
    getConnectionHistory(),
    getConnectionStats(),
  ]);
  
  return {
    activeConnections,
    history,
    stats,
  };
}


