import { storage } from '@shared/storage';
import { SitePrivacyMode, TabDomainMapping } from './types';
import { getSiteMode } from './siteSettings';
import { logCookieCleanup } from './metrics';
import { extractDomain, isSameDomain } from './utils';
import { isProtectedSite } from './adguardEngine';
import { isDomainAllowlisted } from '../aintivirusAdblocker';

const tabDomains: TabDomainMapping = {};

export function initializeCookieManager(): void {
  chrome.webNavigation.onCompleted.addListener(handleNavigationCompleted);

  chrome.tabs.onRemoved.addListener(handleTabRemoved);

  chrome.webNavigation.onBeforeNavigate.addListener(handleBeforeNavigate);
}

export function shutdownCookieManager(): void {
  chrome.webNavigation.onCompleted.removeListener(handleNavigationCompleted);
  chrome.tabs.onRemoved.removeListener(handleTabRemoved);
  chrome.webNavigation.onBeforeNavigate.removeListener(handleBeforeNavigate);

  Object.keys(tabDomains).forEach((key) => delete tabDomains[Number(key)]);
}

export { extractDomain, isSameDomain } from './utils';

function handleNavigationCompleted(
  details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
): void {
  if (details.frameId !== 0) {
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

  tabDomains[details.tabId] = {
    domain,
    url: details.url,
    thirdPartyDomains: new Set(),
  };
}

function handleBeforeNavigate(
  details: chrome.webNavigation.WebNavigationParentedCallbackDetails,
): void {
  if (details.frameId !== 0) return;

  const tabInfo = tabDomains[details.tabId];
  if (tabInfo) {
    tabInfo.thirdPartyDomains.clear();
  }
}

async function handleTabRemoved(
  tabId: number,
  removeInfo: chrome.tabs.TabRemoveInfo,
): Promise<void> {
  const tabInfo = tabDomains[tabId];
  if (!tabInfo) return;

  delete tabDomains[tabId];

  const settings = await storage.get('privacySettings');
  if (!settings?.cookieCleanup) return;

  // Check if domain is protected (Google, GitHub, etc.) or user-allowlisted
  if (isProtectedSite(tabInfo.domain)) {
    return;
  }

  const isAllowlisted = await isDomainAllowlisted(tabInfo.domain);
  if (isAllowlisted) {
    return;
  }

  const siteMode = await getSiteMode(tabInfo.domain);

  if (siteMode === 'disabled') {
    return;
  }

  // Also check if any third-party domains are authentication-related before cleanup
  // This prevents breaking OAuth flows where the tab closes during redirect
  const hasAuthDomains = Array.from(tabInfo.thirdPartyDomains).some(domain => 
    isProtectedSite(domain)
  );
  
  // If this was an authentication flow, skip cleanup entirely to preserve session
  if (hasAuthDomains) {
    return;
  }

  if (siteMode === 'strict') {
    await cleanupCookiesForDomain(tabInfo.domain, 'all');
  } else {
    await cleanupThirdPartyCookies(tabInfo.domain, tabInfo.thirdPartyDomains);
  }
}

export async function cleanupCookiesForDomain(
  domain: string,
  mode: 'all' | 'third-party',
): Promise<number> {
  let deletedCount = 0;

  try {
    const cookies = await chrome.cookies.getAll({ domain });

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
      } catch (error) {}
    }

    if (deletedCount > 0) {
      logCookieCleanup(domain, deletedCount, mode === 'all' ? 'strict' : 'normal');
    }
  } catch (error) {}

  return deletedCount;
}

async function cleanupThirdPartyCookies(
  primaryDomain: string,
  thirdPartyDomains: Set<string>,
): Promise<number> {
  let totalDeleted = 0;

  for (const tpDomain of thirdPartyDomains) {
    // Skip protected or allowlisted domains
    if (isProtectedSite(tpDomain)) {
      continue;
    }
    
    const isAllowlisted = await isDomainAllowlisted(tpDomain);
    if (isAllowlisted) {
      continue;
    }

    const deleted = await cleanupCookiesForDomain(tpDomain, 'third-party');
    totalDeleted += deleted;
  }

  return totalDeleted;
}

export async function manualCleanupCookies(domain: string): Promise<number> {
  return cleanupCookiesForDomain(domain, 'all');
}

export async function getCookiesForDomain(domain: string): Promise<chrome.cookies.Cookie[]> {
  const cookies = await chrome.cookies.getAll({ domain });
  const dotCookies = await chrome.cookies.getAll({ domain: `.${domain}` });

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
    } catch {}
  }

  return deletedCount;
}

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
    const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;

    stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;

    if (cookie.secure) stats.secureCookies++;
    if (cookie.httpOnly) stats.httpOnlyCookies++;
  }

  return stats;
}
