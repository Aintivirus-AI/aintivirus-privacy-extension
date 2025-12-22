// Tracks dApp connection approvals/denials and keeps per-domain active session state.
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
import { revokePermission as revokeDappPermission } from '../dapp/permissions/store';

// Records and evaluates a new connection attempt; returns phishing analysis for UI.
export async function handleConnectionRequest(
  domain: string,
  url: string,
  tabId?: number,
): Promise<PhishingAnalysis> {
  const normalizedDomain = extractDomain(url);

  const analysis = await analyzeDomain(normalizedDomain);

  return analysis;
}

// Approves a domain connection and stores it as active with optional wallet key.
export async function approveConnection(
  domain: string,
  url: string,
  publicKey?: string,
  riskLevel: RiskLevel = 'low',
  warnings: string[] = [],
  tabId?: number,
): Promise<ConnectionRecord> {
  const normalizedDomain = extractDomain(url);
  console.log('[Security] approveConnection called:', { domain, normalizedDomain, publicKey, tabId });

  let connectedKey = publicKey;
  if (!connectedKey) {
    connectedKey = (await getPublicAddress()) || 'unknown';
  }

  // Mark any existing non-revoked records for this domain as revoked to prevent duplicates
  const existingRecords = await getConnectionHistory({ domain: normalizedDomain, approved: true, revoked: false });
  const now = Date.now();
  for (const existingRecord of existingRecords) {
    if (existingRecord.domain === normalizedDomain) {
      await updateConnectionRecord(existingRecord.id, {
        revoked: true,
        revokedAt: now,
      });
    }
  }

  const record: ConnectionRecord = {
    id: generateId(),
    domain: normalizedDomain,
    url,
    timestamp: now,
    publicKey: connectedKey,
    approved: true,
    revoked: false,
    riskLevel,
    warnings,
  };

  console.log('[Security] Adding connection record:', record);
  await addConnectionRecord(record);

  await setActiveConnection(normalizedDomain, {
    domain: normalizedDomain,
    publicKey: connectedKey,
    connectedAt: now,
    tabId,
  });

  await incrementDomainConnectionCount(normalizedDomain);

  return record;
}

// Records a denied connection attempt for audit/history.
export async function denyConnection(domain: string, url: string, reason?: string): Promise<void> {
  const normalizedDomain = extractDomain(url);

  const analysis = await analyzeDomain(normalizedDomain);

  const record: ConnectionRecord = {
    id: generateId(),
    domain: normalizedDomain,
    url,
    timestamp: Date.now(),
    publicKey: '',
    approved: false,
    revoked: false,
    riskLevel: analysis.riskLevel,
    warnings: reason ? [reason] : analysis.signals.map((s) => s.description),
  };

  await addConnectionRecord(record);
}

export async function revokeConnection(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);

  await removeActiveConnection(normalizedDomain);

  // Mark ALL records for this domain as revoked (not just the first one)
  const history = await getConnectionHistory({ domain: normalizedDomain, approved: true, revoked: false });
  const now = Date.now();
  for (const record of history) {
    // Only update records that exactly match the domain (not substring matches)
    if (record.domain === normalizedDomain) {
      await updateConnectionRecord(record.id, {
        revoked: true,
        revokedAt: now,
      });
    }
  }

  // Also revoke the dApp permission so the site can no longer connect
  try {
    // Build the origin URL from the domain
    const origin = `https://${normalizedDomain}`;
    // Revoke for all chain types (both EVM and Solana)
    await revokeDappPermission(origin);
  } catch (err) {
    console.error('[Security] Failed to revoke dApp permission:', err);
  }
}

export async function revokeAllConnections(): Promise<void> {
  const activeConnections = await getActiveConnectionsList();

  for (const connection of activeConnections) {
    await revokeConnection(connection.domain);
  }
}

export async function getAllActiveConnections(): Promise<ActiveConnection[]> {
  return getActiveConnectionsList();
}

export async function isConnectedToDomain(domain: string): Promise<boolean> {
  const connection = await getActiveConnection(extractDomain(domain));
  return connection !== null;
}

export async function getConnectionStatus(domain: string): Promise<{
  isConnected: boolean;
  connection: ActiveConnection | null;
  lastConnection: ConnectionRecord | null;
  domainSettings: DomainSettings | null;
}> {
  const normalizedDomain = extractDomain(domain);

  const [connection, lastConnection, domainSettings] = await Promise.all([
    getActiveConnection(normalizedDomain),
    getConnectionHistory({ domain: normalizedDomain }, 1).then((h) => h[0] || null),
    getDomainSettings(normalizedDomain),
  ]);

  return {
    isConnected: connection !== null,
    connection,
    lastConnection,
    domainSettings,
  };
}

export async function getConnections(
  limit?: number,
  offset?: number,
  filter?: {
    domain?: string;
    approved?: boolean;
    revoked?: boolean;
  },
): Promise<ConnectionRecord[]> {
  return getConnectionHistory(filter, limit, offset);
}

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

  const uniqueDomains = new Set(allHistory.map((c) => c.domain));

  return {
    totalConnections: allHistory.length,
    activeConnections: activeList.length,
    approvedConnections: allHistory.filter((c) => c.approved).length,
    deniedConnections: allHistory.filter((c) => !c.approved).length,
    revokedConnections: allHistory.filter((c) => c.revoked).length,
    uniqueDomains: uniqueDomains.size,
  };
}

export async function trustDomain(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);
  await saveDomainSettings(normalizedDomain, { trustStatus: 'trusted' });
}

export async function blockDomain(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);

  await revokeConnection(normalizedDomain);

  await saveDomainSettings(normalizedDomain, { trustStatus: 'blocked' });
}

export async function resetDomainTrust(domain: string): Promise<void> {
  const normalizedDomain = extractDomain(domain);
  await saveDomainSettings(normalizedDomain, { trustStatus: 'neutral' });
}

export async function shouldAutoApprove(domain: string): Promise<boolean> {
  const normalizedDomain = extractDomain(domain);
  const settings = await getSecuritySettings();

  const domainSettings = await getDomainSettings(normalizedDomain);
  if (domainSettings?.trustStatus === 'trusted') {
    return true;
  }
  if (domainSettings?.trustStatus === 'blocked') {
    return false;
  }

  return false;
}

export async function shouldAutoBlock(domain: string): Promise<boolean> {
  const normalizedDomain = extractDomain(domain);
  const settings = await getSecuritySettings();

  const domainSettings = await getDomainSettings(normalizedDomain);
  if (domainSettings?.trustStatus === 'blocked') {
    return true;
  }

  if (settings.autoBlockMalicious) {
    const analysis = await analyzeDomain(normalizedDomain);
    if (analysis.signals.some((s) => s.type === 'known_scam')) {
      return true;
    }
  }

  return false;
}

export async function handleTabClosed(tabId: number): Promise<void> {
  const activeConnections = await getActiveConnections();

  for (const [domain, connection] of Object.entries(activeConnections)) {
    if (connection.tabId === tabId) {
    }
  }
}

export async function cleanupStaleConnections(
  maxAgeMs: number = 24 * 60 * 60 * 1000,
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
  }

  return cleaned;
}

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
