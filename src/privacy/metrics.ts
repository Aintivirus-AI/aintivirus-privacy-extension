/**
 * AINTIVIRUS Privacy Metrics
 * 
 * Collects and aggregates privacy-related metrics for the dashboard.
 * Provides logging hooks that other modules call when events occur.
 * 
 * Design Notes:
 * - Metrics are held in memory for performance
 * - Periodic persistence to storage for session recovery
 * - Capped lists to prevent memory bloat
 * - Exposed via message handlers for UI consumption
 */

import { storage } from '@shared/storage';
import { 
  PrivacyMetrics, 
  BlockedRequest, 
  CookieCleanupEntry,
  DEFAULT_PRIVACY_METRICS,
  MAX_RECENT_BLOCKED,
  MAX_RECENT_CLEANUPS,
  SitePrivacyMode,
} from './types';
import { extractDomain } from './utils';

/**
 * Maximum number of domains to track in blockedByDomain
 * SECURITY: Prevents unbounded storage growth
 */
const MAX_TRACKED_DOMAINS = 100;

/**
 * Maximum URL length to store (truncate longer URLs)
 */
const MAX_URL_LENGTH = 150;

/**
 * In-memory metrics state
 * Initialized from storage on startup, persisted periodically
 */
let metrics: PrivacyMetrics = { ...DEFAULT_PRIVACY_METRICS };

/** Persistence interval (every 30 seconds) */
const PERSIST_INTERVAL = 30 * 1000;

/** Persistence timer handle */
let persistTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize metrics system
 * Loads persisted metrics and starts persistence timer
 */
export async function initializeMetrics(): Promise<void> {
  console.log('[Privacy] Initializing metrics...');
  
  // Load persisted metrics
  const persisted = await storage.get('privacyMetrics');
  if (persisted) {
    metrics = {
      ...DEFAULT_PRIVACY_METRICS, // Ensure new fields have defaults
      ...persisted,
      // Reset session-specific data
      sessionStart: Date.now(),
      recentBlocked: [],
      recentCookieCleanups: [],
    };
  } else {
    metrics = { ...DEFAULT_PRIVACY_METRICS, sessionStart: Date.now() };
  }
  
  // Start persistence timer
  if (persistTimer) {
    clearInterval(persistTimer);
  }
  persistTimer = setInterval(persistMetrics, PERSIST_INTERVAL);
  
  console.log('[Privacy] Metrics initialized');
}

/**
 * Shutdown metrics system
 */
export async function shutdownMetrics(): Promise<void> {
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
  
  // Final persist
  await persistMetrics();
  
  console.log('[Privacy] Metrics shutdown');
}

/**
 * Create a storage-safe copy of metrics with trimmed data
 */
function createPersistableMetrics(): PrivacyMetrics {
  // Trim blockedByDomain before persisting
  const sortedDomains = Object.entries(metrics.blockedByDomain)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TRACKED_DOMAINS);
  
  // Trim URLs in recentBlocked to save space
  const trimmedRecentBlocked = metrics.recentBlocked.slice(0, 50).map(entry => ({
    ...entry,
    url: entry.url.length > MAX_URL_LENGTH 
      ? entry.url.substring(0, MAX_URL_LENGTH) + '...' 
      : entry.url,
  }));
  
  return {
    ...metrics,
    blockedByDomain: Object.fromEntries(sortedDomains),
    recentBlocked: trimmedRecentBlocked,
    recentCookieCleanups: metrics.recentCookieCleanups.slice(0, 20),
  };
}

/**
 * Persist metrics to storage
 */
async function persistMetrics(): Promise<void> {
  try {
    const persistable = createPersistableMetrics();
    await storage.set('privacyMetrics', persistable);
  } catch (error) {
    // If quota exceeded, try with even less data
    if (error instanceof Error && error.message.includes('quota')) {
      console.warn('[Privacy] Metrics storage quota exceeded, persisting minimal data');
      try {
        // Persist only aggregate counts, not detailed logs
        const minimal: PrivacyMetrics = {
          ...DEFAULT_PRIVACY_METRICS,
          totalBlockedRequests: metrics.totalBlockedRequests,
          totalCookiesDeleted: metrics.totalCookiesDeleted,
          activeRuleCount: metrics.activeRuleCount,
          filterListCount: metrics.filterListCount,
          scriptsIntercepted: metrics.scriptsIntercepted,
          requestsModified: metrics.requestsModified,
          sessionStart: metrics.sessionStart,
          blockedByDomain: {}, // Clear to save space
          recentBlocked: [],
          recentCookieCleanups: [],
        };
        await storage.set('privacyMetrics', minimal);
      } catch (retryError) {
        console.error('[Privacy] Failed to persist even minimal metrics:', retryError);
      }
    } else {
      console.error('[Privacy] Failed to persist metrics:', error);
    }
  }
}

/**
 * Trim blockedByDomain to prevent unbounded growth
 * Keeps top domains by count
 */
function trimBlockedByDomain(): void {
  const entries = Object.entries(metrics.blockedByDomain);
  
  if (entries.length <= MAX_TRACKED_DOMAINS) {
    return;
  }
  
  // Sort by count (descending) and keep top N
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const kept = sorted.slice(0, MAX_TRACKED_DOMAINS);
  
  metrics.blockedByDomain = Object.fromEntries(kept);
}

/**
 * Log a blocked request
 * Called by requestBlocker when a request is blocked
 * 
 * PERFORMANCE: Implements caps to prevent unbounded storage growth
 */
export function logBlockedRequest(
  tabId: number,
  url: string,
  ruleId: number
): void {
  const domain = extractDomain(url) || 'unknown';
  
  // Update totals
  metrics.totalBlockedRequests++;
  metrics.blockedByDomain[domain] = (metrics.blockedByDomain[domain] || 0) + 1;
  
  // Add to recent list
  const entry: BlockedRequest = {
    tabId,
    url,
    domain,
    initiator: null, // Will be filled if available
    resourceType: 'unknown',
    ruleId,
    timestamp: Date.now(),
  };
  
  metrics.recentBlocked.unshift(entry);
  
  // Cap the list
  if (metrics.recentBlocked.length > MAX_RECENT_BLOCKED) {
    metrics.recentBlocked = metrics.recentBlocked.slice(0, MAX_RECENT_BLOCKED);
  }
  
  // Periodically trim domain tracking (every 100 blocked requests)
  if (metrics.totalBlockedRequests % 100 === 0) {
    trimBlockedByDomain();
  }
}

/**
 * Log a blocked request with full details
 */
export function logBlockedRequestDetailed(
  tabId: number,
  url: string,
  initiator: string | null,
  resourceType: string,
  ruleId: number
): void {
  const domain = extractDomain(url) || 'unknown';
  
  metrics.totalBlockedRequests++;
  metrics.blockedByDomain[domain] = (metrics.blockedByDomain[domain] || 0) + 1;
  
  const entry: BlockedRequest = {
    tabId,
    url,
    domain,
    initiator,
    resourceType,
    ruleId,
    timestamp: Date.now(),
  };
  
  metrics.recentBlocked.unshift(entry);
  
  if (metrics.recentBlocked.length > MAX_RECENT_BLOCKED) {
    metrics.recentBlocked = metrics.recentBlocked.slice(0, MAX_RECENT_BLOCKED);
  }
}

/**
 * Log a cookie cleanup event
 * Called by cookieManager when cookies are deleted
 */
export function logCookieCleanup(
  domain: string,
  count: number,
  mode: SitePrivacyMode
): void {
  metrics.totalCookiesDeleted += count;
  
  const entry: CookieCleanupEntry = {
    domain,
    count,
    mode,
    timestamp: Date.now(),
  };
  
  metrics.recentCookieCleanups.unshift(entry);
  
  if (metrics.recentCookieCleanups.length > MAX_RECENT_CLEANUPS) {
    metrics.recentCookieCleanups = metrics.recentCookieCleanups.slice(0, MAX_RECENT_CLEANUPS);
  }
}

/**
 * Update the active rule count
 * Called by requestBlocker after rule changes
 */
export function updateActiveRuleCount(count: number): void {
  metrics.activeRuleCount = count;
}

/**
 * Update the filter list count
 * Called by filterListManager after list changes
 */
export function updateFilterListCount(count: number): void {
  metrics.filterListCount = count;
}

/**
 * Log a script interception event
 * Called by fingerprint protection when a script is intercepted
 */
export function logScriptIntercepted(): void {
  metrics.scriptsIntercepted++;
}

/**
 * Log a request modification event
 * Called by headerRules when headers or URL params are modified
 */
export function logRequestModified(): void {
  metrics.requestsModified++;
}

/**
 * Get current metrics snapshot
 * Used by UI to display stats
 */
export function getMetrics(): PrivacyMetrics {
  return { ...metrics };
}

/**
 * Get summary metrics for popup display
 */
export function getMetricsSummary(): {
  blockedToday: number;
  cookiesDeleted: number;
  activeRules: number;
  topBlockedDomains: { domain: string; count: number }[];
} {
  // Calculate today's blocked requests
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTimestamp = todayStart.getTime();
  
  const blockedToday = metrics.recentBlocked.filter(
    r => r.timestamp >= todayTimestamp
  ).length;
  
  // Get top blocked domains
  const topDomains = Object.entries(metrics.blockedByDomain)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return {
    blockedToday,
    cookiesDeleted: metrics.totalCookiesDeleted,
    activeRules: metrics.activeRuleCount,
    topBlockedDomains: topDomains,
  };
}

/**
 * Get blocked requests for a specific tab
 */
export function getBlockedForTab(tabId: number): BlockedRequest[] {
  return metrics.recentBlocked.filter(r => r.tabId === tabId);
}

/**
 * Get blocked request count for a specific tab
 */
export function getBlockedCountForTab(tabId: number): number {
  return metrics.recentBlocked.filter(r => r.tabId === tabId).length;
}

/**
 * Get blocked requests for a specific domain
 */
export function getBlockedForDomain(domain: string): BlockedRequest[] {
  const normalized = domain.toLowerCase();
  return metrics.recentBlocked.filter(
    r => r.domain.toLowerCase() === normalized
  );
}

/**
 * Get metrics for a time range
 */
export function getMetricsForRange(
  startTime: number,
  endTime: number = Date.now()
): {
  blocked: number;
  cookiesDeleted: number;
  blockedByDomain: { [domain: string]: number };
} {
  const blocked = metrics.recentBlocked.filter(
    r => r.timestamp >= startTime && r.timestamp <= endTime
  );
  
  const cleanups = metrics.recentCookieCleanups.filter(
    c => c.timestamp >= startTime && c.timestamp <= endTime
  );
  
  const blockedByDomain: { [domain: string]: number } = {};
  for (const r of blocked) {
    blockedByDomain[r.domain] = (blockedByDomain[r.domain] || 0) + 1;
  }
  
  return {
    blocked: blocked.length,
    cookiesDeleted: cleanups.reduce((sum, c) => sum + c.count, 0),
    blockedByDomain,
  };
}

/**
 * Reset metrics (for testing or user action)
 */
export async function resetMetrics(): Promise<void> {
  metrics = { ...DEFAULT_PRIVACY_METRICS, sessionStart: Date.now() };
  await persistMetrics();
  console.log('[Privacy] Metrics reset');
}

/**
 * Get session duration in seconds
 */
export function getSessionDuration(): number {
  return Math.floor((Date.now() - metrics.sessionStart) / 1000);
}

/**
 * Export metrics as JSON (for debugging/backup)
 */
export function exportMetrics(): string {
  return JSON.stringify(metrics, null, 2);
}

/**
 * Get metrics health check
 */
export function getMetricsHealth(): {
  isHealthy: boolean;
  sessionDuration: number;
  memoryUsageEstimate: number;
} {
  // Rough estimate of memory usage
  const jsonSize = JSON.stringify(metrics).length;
  
  return {
    isHealthy: metrics.sessionStart > 0,
    sessionDuration: getSessionDuration(),
    memoryUsageEstimate: jsonSize,
  };
}

