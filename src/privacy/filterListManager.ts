import { storage } from '@shared/storage';
import {
  CachedFilterList,
  FilterListCache,
  FILTER_LIST_TTL,
  BOOTSTRAP_TRACKER_DOMAINS,
  BOOTSTRAP_URL_PATTERNS,
  DEFAULT_PRIVACY_SETTINGS,
  CosmeticRule,
  CachedCosmeticRules,
  DEFAULT_COSMETIC_RULES,
  BOOTSTRAP_COSMETIC_SELECTORS,
  PROTECTED_SITES,
} from './types';
import {
  recordFetchSuccess,
  recordFetchError,
  recordFetchStart,
  getLastKnownGood,
  saveLastKnownGood,
  getFilterListHealthSummary,
  trackUnsupportedPattern,
} from './filterListHealth';
import type { FilterListHealthSummary } from './types';
import { isProtectedSite } from './adguardEngine';

export async function getCachedFilterLists(): Promise<FilterListCache> {
  const cache = await storage.get('filterListCache');
  return cache || {};
}

export async function getCachedFilterList(url: string): Promise<CachedFilterList | null> {
  const cache = await getCachedFilterLists();
  return cache[url] || null;
}

export function isFilterListExpired(list: CachedFilterList): boolean {
  return Date.now() > list.expiresAt;
}

export interface FilterListFetchResult {
  rules: string[];
  parseErrors: number;
  unsupportedPatterns: string[];
}

export async function fetchFilterList(url: string): Promise<string[]> {
  const result = await fetchFilterListWithHealth(url);
  return result.rules;
}

export async function fetchFilterListWithHealth(url: string): Promise<FilterListFetchResult> {
  const validation = isValidFilterListUrl(url);
  if (!validation.valid) {
    const error = `Security: ${validation.error}`;
    await recordFetchError(url, error);
    throw new Error(error);
  }

  await recordFetchStart(url);

  try {
    const response = await fetch(url, {
      cache: 'no-cache',
      headers: {
        Accept: 'text/plain',
      },
    });

    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      await recordFetchError(url, error);

      const lastKnownGood = await getLastKnownGood(url);
      if (lastKnownGood) {
        return {
          rules: lastKnownGood.rules,
          parseErrors: 0,
          unsupportedPatterns: [],
        };
      }

      throw new Error(error);
    }

    const text = await response.text();
    const { rules, parseErrors, unsupportedPatterns } = parseFilterListTextWithTracking(text, url);

    await recordFetchSuccess(url, rules.length, parseErrors, unsupportedPatterns);

    await saveLastKnownGood(url, rules);

    return { rules, parseErrors, unsupportedPatterns };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await recordFetchError(url, errorMessage);

    const lastKnownGood = await getLastKnownGood(url);
    if (lastKnownGood) {
      return {
        rules: lastKnownGood.rules,
        parseErrors: 0,
        unsupportedPatterns: [],
      };
    }

    throw error;
  }
}

export interface ParsedFilterListResult {
  networkRules: string[];

  cosmeticRules: CosmeticRule[];
}

export function parseFilterListText(text: string): string[] {
  const result = parseFilterListTextFull(text);
  return result.networkRules;
}

export function parseFilterListTextFull(text: string): ParsedFilterListResult {
  const lines = text.split('\n');
  const networkRules: string[] = [];
  const cosmeticRules: CosmeticRule[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith('!')) continue;

    if (trimmed.startsWith('#') && !trimmed.includes('##') && !trimmed.includes('#@#')) continue;

    if (trimmed.startsWith('[Adblock')) continue;

    if (trimmed.includes('#$#') || trimmed.includes('#@$#')) continue;

    if (trimmed.includes('##+js') || trimmed.includes('#@#+js')) continue;

    const cosmeticRule = parseCosmeticRule(trimmed);
    if (cosmeticRule) {
      cosmeticRules.push(cosmeticRule);
      continue;
    }

    networkRules.push(trimmed);
  }

  return { networkRules, cosmeticRules };
}

interface ParseWithTrackingResult {
  rules: string[];
  parseErrors: number;
  unsupportedPatterns: string[];
}

export function parseFilterListTextWithTracking(
  text: string,
  url: string,
): ParseWithTrackingResult {
  const lines = text.split('\n');
  const rules: string[] = [];
  let parseErrors = 0;
  const unsupportedPatterns: string[] = [];

  const UNSUPPORTED_PATTERNS = [
    { pattern: '#$#', name: 'HTML filter' },
    { pattern: '#@$#', name: 'HTML filter exception' },
    { pattern: '##+js', name: 'Snippet filter' },
    { pattern: '#@#+js', name: 'Snippet exception' },
    { pattern: ':has(', name: 'Procedural :has' },
    { pattern: ':has-text(', name: 'Procedural :has-text' },
    { pattern: ':matches-css(', name: 'Procedural :matches-css' },
    { pattern: ':xpath(', name: 'Procedural :xpath' },
    { pattern: ':nth-ancestor(', name: 'Procedural :nth-ancestor' },
    { pattern: ':upward(', name: 'Procedural :upward' },
    { pattern: ':remove(', name: 'Procedural :remove' },
    { pattern: ':style(', name: 'Procedural :style' },
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith('!')) continue;
    if (trimmed.startsWith('#') && !trimmed.includes('##') && !trimmed.includes('#@#')) continue;
    if (trimmed.startsWith('[Adblock')) continue;

    let isUnsupported = false;
    for (const { pattern, name } of UNSUPPORTED_PATTERNS) {
      if (trimmed.includes(pattern)) {
        isUnsupported = true;
        if (unsupportedPatterns.length < 50) {
          unsupportedPatterns.push(`${name}: ${trimmed.substring(0, 100)}`);
        }
        break;
      }
    }

    if (isUnsupported) {
      parseErrors++;
      continue;
    }

    if (trimmed.includes('##') || trimmed.includes('#@#')) {
      const cosmeticRule = parseCosmeticRule(trimmed);
      if (!cosmeticRule) {
        parseErrors++;
        continue;
      }

      continue;
    }

    rules.push(trimmed);
  }

  return { rules, parseErrors, unsupportedPatterns };
}

export function parseCosmeticRule(rule: string): CosmeticRule | null {
  const exceptionMatch = rule.match(/^([^#]*?)#@#(.+)$/);
  if (exceptionMatch) {
    const [, domainsStr, selector] = exceptionMatch;
    const { domains, excludedDomains } = parseCosmeticDomains(domainsStr);

    return {
      raw: rule,
      type: 'exception',
      selector: selector.trim(),
      domains: domains.length > 0 ? domains : undefined,
      excludedDomains: excludedDomains.length > 0 ? excludedDomains : undefined,
    };
  }

  const cosmeticMatch = rule.match(/^([^#]*?)##(.+)$/);
  if (cosmeticMatch) {
    const [, domainsStr, selector] = cosmeticMatch;
    const { domains, excludedDomains } = parseCosmeticDomains(domainsStr);

    const selectorTrimmed = selector.trim();
    if (isUnsupportedSelector(selectorTrimmed)) {
      return null;
    }

    return {
      raw: rule,
      type: domains.length > 0 ? 'domain-specific' : 'generic',
      selector: selectorTrimmed,
      domains: domains.length > 0 ? domains : undefined,
      excludedDomains: excludedDomains.length > 0 ? excludedDomains : undefined,
    };
  }

  return null;
}

function parseCosmeticDomains(domainsStr: string): {
  domains: string[];
  excludedDomains: string[];
} {
  const domains: string[] = [];
  const excludedDomains: string[] = [];

  if (!domainsStr || !domainsStr.trim()) {
    return { domains, excludedDomains };
  }

  const parts = domainsStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('~')) {
      excludedDomains.push(trimmed.slice(1));
    } else {
      domains.push(trimmed);
    }
  }

  return { domains, excludedDomains };
}

function isUnsupportedSelector(selector: string): boolean {
  const proceduralPatterns = [
    ':has(',
    ':has-text(',
    ':matches-css(',
    ':matches-path(',
    ':xpath(',
    ':nth-ancestor(',
    ':upward(',
    ':remove(',
    ':style(',
    ':min-text-length(',
    ':watch-attr(',
  ];

  for (const pattern of proceduralPatterns) {
    if (selector.includes(pattern)) {
      return true;
    }
  }

  if (selector === '*' || selector === 'body' || selector === 'html') {
    return true;
  }

  if (selector.length < 3) {
    return true;
  }

  return false;
}

const MAX_CACHED_RULES_PER_LIST = 10000;

export async function cacheFilterList(url: string, rules: string[]): Promise<void> {
  const cache = await getCachedFilterLists();

  const domainRules = rules.filter((r) => r.startsWith('||'));
  const otherRules = rules.filter((r) => !r.startsWith('||'));
  const truncatedRules = [
    ...domainRules.slice(0, Math.floor(MAX_CACHED_RULES_PER_LIST * 0.7)),
    ...otherRules.slice(0, Math.floor(MAX_CACHED_RULES_PER_LIST * 0.3)),
  ];

  const entry: CachedFilterList = {
    url,
    rules: truncatedRules,
    fetchedAt: Date.now(),
    expiresAt: Date.now() + FILTER_LIST_TTL,
  };

  cache[url] = entry;

  try {
    await storage.set('filterListCache', cache);
  } catch (error) {
    if (error instanceof Error && error.message.includes('quota')) {
      try {
        await storage.set('filterListCache', { [url]: entry });
      } catch (retryError) {}
    } else {
    }
  }
}

export async function removeCachedFilterList(url: string): Promise<void> {
  const cache = await getCachedFilterLists();
  delete cache[url];
  await storage.set('filterListCache', cache);
}

export async function clearFilterListCache(): Promise<void> {
  await storage.set('filterListCache', {});
}

export async function getOrFetchFilterList(url: string, forceRefresh = false): Promise<string[]> {
  if (!forceRefresh) {
    const cached = await getCachedFilterList(url);
    if (cached && !isFilterListExpired(cached)) {
      return cached.rules;
    }
  }

  try {
    const rules = await fetchFilterList(url);
    await cacheFilterList(url, rules);
    return rules;
  } catch (error) {
    const cached = await getCachedFilterList(url);
    if (cached) {
      return cached.rules;
    }
    throw error;
  }
}

export async function getFilterListUrls(): Promise<string[]> {
  const settings = await storage.get('privacySettings');
  return settings?.filterListUrls || DEFAULT_PRIVACY_SETTINGS.filterListUrls;
}

function isValidFilterListUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: 'Filter list URLs must use HTTPS for security',
      };
    }

    if (!parsed.hostname || parsed.hostname.length < 3) {
      return {
        valid: false,
        error: 'Invalid hostname in URL',
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
    };
  }
}

export async function addFilterListUrl(url: string): Promise<void> {
  const validation = isValidFilterListUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid filter list URL');
  }

  const settings = await storage.get('privacySettings');
  const current = settings || DEFAULT_PRIVACY_SETTINGS;

  if (!current.filterListUrls.includes(url)) {
    current.filterListUrls.push(url);
    await storage.set('privacySettings', current);
  }
}

export async function removeFilterListUrl(url: string): Promise<void> {
  const settings = await storage.get('privacySettings');
  const current = settings || DEFAULT_PRIVACY_SETTINGS;

  current.filterListUrls = current.filterListUrls.filter((u) => u !== url);
  await storage.set('privacySettings', current);
  await removeCachedFilterList(url);
}

const MAX_TOTAL_FILTER_RULES = 50000;

export async function fetchAllFilterLists(forceRefresh = false): Promise<string[]> {
  const urls = await getFilterListUrls();
  const allRules: string[] = [];

  for (const domain of BOOTSTRAP_TRACKER_DOMAINS) {
    allRules.push(`||${domain}^`);
  }

  for (const pattern of BOOTSTRAP_URL_PATTERNS) {
    allRules.push(pattern);
  }

  for (const url of urls) {
    if (allRules.length >= MAX_TOTAL_FILTER_RULES) {
      break;
    }

    try {
      const rules = await getOrFetchFilterList(url, forceRefresh);

      const remainingCapacity = MAX_TOTAL_FILTER_RULES - allRules.length;
      const rulesToAdd = rules.slice(0, remainingCapacity);
      allRules.push(...rulesToAdd);

      if (rules.length > rulesToAdd.length) {
      }
    } catch (error) {}
  }

  try {
    const settings = await storage.get('privacySettings');
    if (settings) {
      settings.lastFilterUpdate = Date.now();
      await storage.set('privacySettings', settings);
    }
  } catch (error) {}

  const seenRules = new Set<string>();
  const uniqueRules: string[] = [];
  for (const rule of allRules) {
    if (!seenRules.has(rule)) {
      seenRules.add(rule);
      uniqueRules.push(rule);
    }
  }

  return uniqueRules;
}

const MAX_GENERIC_COSMETIC_RULES = 2000;
const MAX_DOMAIN_SPECIFIC_RULES_PER_DOMAIN = 100;
const MAX_DOMAINS_WITH_SPECIFIC_RULES = 500;

export async function fetchAllCosmeticRules(forceRefresh = false): Promise<CachedCosmeticRules> {
  const urls = await getFilterListUrls();
  const cosmeticRules: CachedCosmeticRules = {
    generic: [...BOOTSTRAP_COSMETIC_SELECTORS],
    domainSpecific: {},
    exceptions: {},
    updatedAt: Date.now(),
  };

  for (const url of urls) {
    try {
      const text = await fetchFilterListRaw(url, forceRefresh);
      const { cosmeticRules: rules } = parseFilterListTextFull(text);

      for (const rule of rules) {
        if (rule.type === 'generic') {
          if (cosmeticRules.generic.length < MAX_GENERIC_COSMETIC_RULES) {
            cosmeticRules.generic.push(rule.selector);
          }
        } else if (rule.type === 'domain-specific' && rule.domains) {
          for (const domain of rule.domains) {
            if (
              Object.keys(cosmeticRules.domainSpecific).length >= MAX_DOMAINS_WITH_SPECIFIC_RULES &&
              !cosmeticRules.domainSpecific[domain]
            ) {
              continue;
            }
            if (!cosmeticRules.domainSpecific[domain]) {
              cosmeticRules.domainSpecific[domain] = [];
            }

            if (
              cosmeticRules.domainSpecific[domain].length < MAX_DOMAIN_SPECIFIC_RULES_PER_DOMAIN
            ) {
              cosmeticRules.domainSpecific[domain].push(rule.selector);
            }
          }
        } else if (rule.type === 'exception' && rule.domains) {
          for (const domain of rule.domains) {
            if (!cosmeticRules.exceptions[domain]) {
              cosmeticRules.exceptions[domain] = [];
            }
            cosmeticRules.exceptions[domain].push(rule.selector);
          }
        }
      }
    } catch (error) {}
  }

  cosmeticRules.generic = [...new Set(cosmeticRules.generic)];

  for (const domain of Object.keys(cosmeticRules.domainSpecific)) {
    cosmeticRules.domainSpecific[domain] = [...new Set(cosmeticRules.domainSpecific[domain])];
  }

  try {
    await storage.set('cosmeticRulesCache', cosmeticRules);
  } catch (error) {}

  return cosmeticRules;
}

async function fetchFilterListRaw(url: string, forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const cached = await getCachedFilterList(url);
    if (cached && !isFilterListExpired(cached)) {
    }
  }

  const validation = isValidFilterListUrl(url);
  if (!validation.valid) {
    throw new Error(`Security: ${validation.error}`);
  }

  const response = await fetch(url, {
    cache: 'no-cache',
    headers: {
      Accept: 'text/plain',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

export async function getCachedCosmeticRules(): Promise<CachedCosmeticRules> {
  const cached = await storage.get('cosmeticRulesCache');
  return cached || DEFAULT_COSMETIC_RULES;
}

export async function getCosmeticRulesForDomain(domain: string): Promise<string[]> {
  const cached = await getCachedCosmeticRules();
  const selectors: Set<string> = new Set();

  const siteIsProtected = isProtectedSite(domain);

  if (!siteIsProtected) {
    for (const selector of cached.generic) {
      selectors.add(selector);
    }
  }

  const domainParts = domain.split('.');
  for (let i = 0; i < domainParts.length - 1; i++) {
    const checkDomain = domainParts.slice(i).join('.');
    const domainRules = cached.domainSpecific[checkDomain];
    if (domainRules) {
      for (const selector of domainRules) {
        selectors.add(selector);
      }
    }
  }

  for (let i = 0; i < domainParts.length - 1; i++) {
    const checkDomain = domainParts.slice(i).join('.');
    const exceptions = cached.exceptions[checkDomain];
    if (exceptions) {
      for (const selector of exceptions) {
        selectors.delete(selector);
      }
    }
  }

  if (process.env.NODE_ENV !== 'production' && siteIsProtected) {
  }

  return Array.from(selectors);
}

export async function needsFilterListRefresh(): Promise<boolean> {
  const settings = await storage.get('privacySettings');

  if (!settings?.lastFilterUpdate) {
    return true;
  }

  return Date.now() - settings.lastFilterUpdate > FILTER_LIST_TTL;
}

export async function getFilterListStats(): Promise<{
  listCount: number;
  totalRules: number;
  lastUpdate: number | null;
  lists: { url: string; ruleCount: number; fetchedAt: number }[];
}> {
  const cache = await getCachedFilterLists();
  const settings = await storage.get('privacySettings');

  const lists = Object.values(cache).map((entry) => ({
    url: entry.url,
    ruleCount: entry.rules.length,
    fetchedAt: entry.fetchedAt,
  }));

  const totalRules =
    lists.reduce((sum, l) => sum + l.ruleCount, 0) + BOOTSTRAP_TRACKER_DOMAINS.length;

  return {
    listCount: lists.length,
    totalRules,
    lastUpdate: settings?.lastFilterUpdate || null,
    lists,
  };
}

export async function getFilterListHealth(): Promise<FilterListHealthSummary> {
  return getFilterListHealthSummary();
}

export async function resetFilterList(url: string): Promise<void> {
  await removeCachedFilterList(url);

  try {
    await fetchFilterListWithHealth(url);
  } catch (error) {
    throw error;
  }
}
