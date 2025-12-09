

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


const MAX_TRACKED_DOMAINS = 100;


const MAX_URL_LENGTH = 150;


let metrics: PrivacyMetrics = { ...DEFAULT_PRIVACY_METRICS };


const PERSIST_INTERVAL = 30 * 1000;


let persistTimer: ReturnType<typeof setInterval> | null = null;


export async function initializeMetrics(): Promise<void> {

  
  const persisted = await storage.get('privacyMetrics');
  if (persisted) {
    metrics = {
      ...DEFAULT_PRIVACY_METRICS, 
      ...persisted,
      
      sessionStart: Date.now(),
      recentBlocked: [],
      recentCookieCleanups: [],
    };
  } else {
    metrics = { ...DEFAULT_PRIVACY_METRICS, sessionStart: Date.now() };
  }
  
  
  if (persistTimer) {
    clearInterval(persistTimer);
  }
  persistTimer = setInterval(persistMetrics, PERSIST_INTERVAL);

}


export async function shutdownMetrics(): Promise<void> {
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
  
  
  await persistMetrics();

}


function createPersistableMetrics(): PrivacyMetrics {
  
  const sortedDomains = Object.entries(metrics.blockedByDomain)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TRACKED_DOMAINS);
  
  
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


async function persistMetrics(): Promise<void> {
  try {
    const persistable = createPersistableMetrics();
    await storage.set('privacyMetrics', persistable);
  } catch (error) {
    
    if (error instanceof Error && error.message.includes('quota')) {

      try {
        
        const minimal: PrivacyMetrics = {
          ...DEFAULT_PRIVACY_METRICS,
          totalBlockedRequests: metrics.totalBlockedRequests,
          totalCookiesDeleted: metrics.totalCookiesDeleted,
          activeRuleCount: metrics.activeRuleCount,
          filterListCount: metrics.filterListCount,
          scriptsIntercepted: metrics.scriptsIntercepted,
          requestsModified: metrics.requestsModified,
          sessionStart: metrics.sessionStart,
          blockedByDomain: {}, 
          recentBlocked: [],
          recentCookieCleanups: [],
        };
        await storage.set('privacyMetrics', minimal);
      } catch (retryError) {

      }
    } else {

    }
  }
}


function trimBlockedByDomain(): void {
  const entries = Object.entries(metrics.blockedByDomain);
  
  if (entries.length <= MAX_TRACKED_DOMAINS) {
    return;
  }
  
  
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const kept = sorted.slice(0, MAX_TRACKED_DOMAINS);
  
  metrics.blockedByDomain = Object.fromEntries(kept);
}


export function logBlockedRequest(
  tabId: number,
  url: string,
  ruleId: number
): void {
  const domain = extractDomain(url) || 'unknown';
  
  
  metrics.totalBlockedRequests++;
  metrics.blockedByDomain[domain] = (metrics.blockedByDomain[domain] || 0) + 1;
  
  
  const entry: BlockedRequest = {
    tabId,
    url,
    domain,
    initiator: null, 
    resourceType: 'unknown',
    ruleId,
    timestamp: Date.now(),
  };
  
  metrics.recentBlocked.unshift(entry);
  
  
  if (metrics.recentBlocked.length > MAX_RECENT_BLOCKED) {
    metrics.recentBlocked = metrics.recentBlocked.slice(0, MAX_RECENT_BLOCKED);
  }
  
  
  if (metrics.totalBlockedRequests % 100 === 0) {
    trimBlockedByDomain();
  }
}


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


export function updateActiveRuleCount(count: number): void {
  metrics.activeRuleCount = count;
}


export function updateFilterListCount(count: number): void {
  metrics.filterListCount = count;
}


export function logScriptIntercepted(): void {
  metrics.scriptsIntercepted++;
}


export function logRequestModified(): void {
  metrics.requestsModified++;
}


export function getMetrics(): PrivacyMetrics {
  return { ...metrics };
}


export function getMetricsSummary(): {
  blockedToday: number;
  cookiesDeleted: number;
  activeRules: number;
  topBlockedDomains: { domain: string; count: number }[];
} {
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTimestamp = todayStart.getTime();
  
  const blockedToday = metrics.recentBlocked.filter(
    r => r.timestamp >= todayTimestamp
  ).length;
  
  
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


export function getBlockedForTab(tabId: number): BlockedRequest[] {
  return metrics.recentBlocked.filter(r => r.tabId === tabId);
}


export function getBlockedCountForTab(tabId: number): number {
  return metrics.recentBlocked.filter(r => r.tabId === tabId).length;
}


export function getBlockedForDomain(domain: string): BlockedRequest[] {
  const normalized = domain.toLowerCase();
  return metrics.recentBlocked.filter(
    r => r.domain.toLowerCase() === normalized
  );
}


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


export async function resetMetrics(): Promise<void> {
  metrics = { ...DEFAULT_PRIVACY_METRICS, sessionStart: Date.now() };
  await persistMetrics();

}


export function getSessionDuration(): number {
  return Math.floor((Date.now() - metrics.sessionStart) / 1000);
}


export function exportMetrics(): string {
  return JSON.stringify(metrics, null, 2);
}


export function getMetricsHealth(): {
  isHealthy: boolean;
  sessionDuration: number;
  memoryUsageEstimate: number;
} {
  
  const jsonSize = JSON.stringify(metrics).length;
  
  return {
    isHealthy: metrics.sessionStart > 0,
    sessionDuration: getSessionDuration(),
    memoryUsageEstimate: jsonSize,
  };
}

