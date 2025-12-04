/**
 * AINTIVIRUS Cookie Manager
 * 
 * Handles automatic cookie cleanup when tabs are closed.
 * 
 * MV3 Design Notes:
 * - Uses chrome.cookies API to list and remove cookies
 * - Tracks tab-to-domain mappings via webNavigation events
 * - Supports per-site cleanup modes (third-party only, all, none)
 * - Third-party detection is based on domain matching
 */

import { storage } from '@shared/storage';
import { SitePrivacyMode, TabDomainMapping } from './types';
import { getSiteMode } from './siteSettings';
import { logCookieCleanup } from './metrics';
import { extractDomain, isSameDomain } from './utils';

/**
 * Active tab tracking
 * Maps tab IDs to their primary domain and tracked third-party domains
 */
const tabDomains: TabDomainMapping = {};

/**
 * Initialize cookie manager
 * Sets up listeners for tab events and navigation
 */
export function initializeCookieManager(): void {
  console.log('[Privacy] Initializing cookie manager...');
  
  // Track navigation to capture domain info
  chrome.webNavigation.onCompleted.addListener(handleNavigationCompleted);
  
  // Track tab closures for cookie cleanup
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  
  // Track main frame changes (navigation within tab)
  chrome.webNavigation.onBeforeNavigate.addListener(handleBeforeNavigate);
  
  console.log('[Privacy] Cookie manager initialized');
}

/**
 * Shutdown cookie manager
 */
export function shutdownCookieManager(): void {
  chrome.webNavigation.onCompleted.removeListener(handleNavigationCompleted);
  chrome.tabs.onRemoved.removeListener(handleTabRemoved);
  chrome.webNavigation.onBeforeNavigate.removeListener(handleBeforeNavigate);
  
  // Clear tracking data
  Object.keys(tabDomains).forEach(key => delete tabDomains[Number(key)]);
  
  console.log('[Privacy] Cookie manager shutdown');
}

// Re-export utilities for backward compatibility
export { extractDomain, isSameDomain } from './utils';

/**
 * Handle navigation completed event
 * Tracks the domain for each tab
 */
function handleNavigationCompleted(
  details: chrome.webNavigation.WebNavigationFramedCallbackDetails
): void {
  // Only track main frame navigations
  if (details.frameId !== 0) {
    // Track as third-party domain for the tab
    const tabInfo = tabDomains[details.tabId];
    if (tabInfo) {
      const domain = extractDomain(details.url);
      if (domain && !isSameDomain(domain, tabInfo.domain)) {
        tabInfo.thirdPartyDomains.add(domain);
      }
    }
    return;
  }
  
  const domain = extractDomain(details.url);
  if (!domain) return;
  
  // Initialize or update tab tracking
  tabDomains[details.tabId] = {
    domain,
    url: details.url,
    thirdPartyDomains: new Set(),
  };
}

/**
 * Handle before navigate event
 * Clears third-party tracking when navigating to a new page
 */
function handleBeforeNavigate(
  details: chrome.webNavigation.WebNavigationParentedCallbackDetails
): void {
  // Only for main frame
  if (details.frameId !== 0) return;
  
  const tabInfo = tabDomains[details.tabId];
  if (tabInfo) {
    tabInfo.thirdPartyDomains.clear();
  }
}

/**
 * Handle tab removed event
 * Triggers cookie cleanup based on site settings
 */
async function handleTabRemoved(
  tabId: number,
  removeInfo: chrome.tabs.TabRemoveInfo
): Promise<void> {
  const tabInfo = tabDomains[tabId];
  if (!tabInfo) return;
  
  // Clean up our tracking
  delete tabDomains[tabId];
  
  // Check if cookie cleanup is enabled
  const settings = await storage.get('privacySettings');
  if (!settings?.cookieCleanup) return;
  
  // Get the site mode for this domain
  const siteMode = await getSiteMode(tabInfo.domain);
  
  // If site is disabled, skip cleanup
  if (siteMode === 'disabled') return;
  
  // Perform cleanup based on mode
  console.log(`[Privacy] Tab closed for ${tabInfo.domain}, cleaning cookies (mode: ${siteMode})`);
  
  if (siteMode === 'strict') {
    // Strict mode: delete ALL cookies for this domain
    await cleanupCookiesForDomain(tabInfo.domain, 'all');
  } else {
    // Normal mode: delete only third-party cookies
    await cleanupThirdPartyCookies(tabInfo.domain, tabInfo.thirdPartyDomains);
  }
}

/**
 * Delete all cookies for a specific domain
 */
export async function cleanupCookiesForDomain(
  domain: string,
  mode: 'all' | 'third-party'
): Promise<number> {
  let deletedCount = 0;
  
  try {
    // Get all cookies for this domain
    const cookies = await chrome.cookies.getAll({ domain });
    
    // Also get cookies that might be set with leading dot
    const dotCookies = await chrome.cookies.getAll({ domain: `.${domain}` });
    
    const allCookies = [...cookies, ...dotCookies];
    
    for (const cookie of allCookies) {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
      
      try {
        await chrome.cookies.remove({
          url,
          name: cookie.name,
        });
        deletedCount++;
      } catch (error) {
        console.warn('[Privacy] Failed to delete cookie:', cookie.name, error);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[Privacy] Deleted ${deletedCount} cookies for domain: ${domain}`);
      
      // Log for metrics
      logCookieCleanup(domain, deletedCount, mode === 'all' ? 'strict' : 'normal');
    }
    
  } catch (error) {
    console.error('[Privacy] Error cleaning cookies for domain:', domain, error);
  }
  
  return deletedCount;
}

/**
 * Delete third-party cookies encountered during the session
 */
async function cleanupThirdPartyCookies(
  primaryDomain: string,
  thirdPartyDomains: Set<string>
): Promise<number> {
  let totalDeleted = 0;
  
  for (const tpDomain of thirdPartyDomains) {
    const deleted = await cleanupCookiesForDomain(tpDomain, 'third-party');
    totalDeleted += deleted;
  }
  
  return totalDeleted;
}

/**
 * Manually trigger cookie cleanup for a domain
 * Can be called from settings UI
 */
export async function manualCleanupCookies(domain: string): Promise<number> {
  return cleanupCookiesForDomain(domain, 'all');
}

/**
 * Get all cookies for a domain (for UI display)
 */
export async function getCookiesForDomain(domain: string): Promise<chrome.cookies.Cookie[]> {
  const cookies = await chrome.cookies.getAll({ domain });
  const dotCookies = await chrome.cookies.getAll({ domain: `.${domain}` });
  
  // Deduplicate by name + domain + path
  const seen = new Set<string>();
  const unique: chrome.cookies.Cookie[] = [];
  
  for (const cookie of [...cookies, ...dotCookies]) {
    const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cookie);
    }
  }
  
  return unique;
}

/**
 * Get current tab domain mapping (for debugging)
 */
export function getTabDomains(): { [tabId: number]: { domain: string; thirdPartyCount: number } } {
  const result: { [tabId: number]: { domain: string; thirdPartyCount: number } } = {};
  
  for (const [tabId, info] of Object.entries(tabDomains)) {
    result[Number(tabId)] = {
      domain: info.domain,
      thirdPartyCount: info.thirdPartyDomains.size,
    };
  }
  
  return result;
}

/**
 * Clear all cookies (nuclear option)
 * Returns count of deleted cookies
 */
export async function clearAllCookies(): Promise<number> {
  let deletedCount = 0;
  
  const cookies = await chrome.cookies.getAll({});
  
  for (const cookie of cookies) {
    const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
    
    try {
      await chrome.cookies.remove({
        url,
        name: cookie.name,
      });
      deletedCount++;
    } catch {
      // Some cookies may not be removable
    }
  }
  
  console.log(`[Privacy] Cleared ${deletedCount} cookies`);
  return deletedCount;
}

/**
 * Get cookie statistics
 */
export async function getCookieStats(): Promise<{
  totalCookies: number;
  byDomain: { [domain: string]: number };
  secureCookies: number;
  httpOnlyCookies: number;
}> {
  const cookies = await chrome.cookies.getAll({});
  
  const stats = {
    totalCookies: cookies.length,
    byDomain: {} as { [domain: string]: number },
    secureCookies: 0,
    httpOnlyCookies: 0,
  };
  
  for (const cookie of cookies) {
    // Clean domain (remove leading dot)
    const domain = cookie.domain.startsWith('.') 
      ? cookie.domain.slice(1) 
      : cookie.domain;
    
    stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
    
    if (cookie.secure) stats.secureCookies++;
    if (cookie.httpOnly) stats.httpOnlyCookies++;
  }
  
  return stats;
}

