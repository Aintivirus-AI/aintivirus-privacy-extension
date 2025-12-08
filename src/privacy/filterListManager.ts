/**
 * AINTIVIRUS Filter List Manager
 * 
 * Handles fetching, parsing, and caching of filter lists (EasyPrivacy, uBlock format).
 * Filter lists are stored in chrome.storage.local with TTL for automatic refresh.
 * 
 * ARCHITECTURE:
 * - Integrates with filterListHealth.ts for health monitoring
 * - Uses last-known-good fallback when fetches fail
 * - Tracks unsupported syntax patterns for future support
 */

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

/**
 * Get all cached filter lists
 */
export async function getCachedFilterLists(): Promise<FilterListCache> {
  const cache = await storage.get('filterListCache');
  return cache || {};
}

/**
 * Get a single cached filter list
 */
export async function getCachedFilterList(url: string): Promise<CachedFilterList | null> {
  const cache = await getCachedFilterLists();
  return cache[url] || null;
}

/**
 * Check if a filter list needs refresh
 */
export function isFilterListExpired(list: CachedFilterList): boolean {
  return Date.now() > list.expiresAt;
}

/**
 * Result of fetching and parsing a filter list
 */
export interface FilterListFetchResult {
  rules: string[];
  parseErrors: number;
  unsupportedPatterns: string[];
}

/**
 * Fetch a filter list from a URL
 * Handles EasyList/EasyPrivacy and uBlock Origin format
 * 
 * SECURITY: Only fetches from HTTPS URLs
 * RESILIENCE: Falls back to last-known-good on failure
 */
export async function fetchFilterList(url: string): Promise<string[]> {
  const result = await fetchFilterListWithHealth(url);
  return result.rules;
}

/**
 * Fetch a filter list with full health tracking
 * Returns detailed results for health monitoring
 */
export async function fetchFilterListWithHealth(url: string): Promise<FilterListFetchResult> {
  // SECURITY: Validate HTTPS before fetching
  const validation = isValidFilterListUrl(url);
  if (!validation.valid) {
    const error = `Security: ${validation.error}`;
    await recordFetchError(url, error);
    throw new Error(error);
  }
  
  // Record fetch start
  await recordFetchStart(url);
  
  try {
    const response = await fetch(url, {
      cache: 'no-cache',
      headers: {
        'Accept': 'text/plain',
      },
    });
    
    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      await recordFetchError(url, error);
      
      // Try last-known-good fallback
      const lastKnownGood = await getLastKnownGood(url);
      if (lastKnownGood) {
        console.log(`[Privacy] Using last-known-good for ${url} (${lastKnownGood.ruleCount} rules)`);
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
    
    // Record success
    await recordFetchSuccess(url, rules.length, parseErrors, unsupportedPatterns);
    
    // Save as last-known-good
    await saveLastKnownGood(url, rules);
    
    return { rules, parseErrors, unsupportedPatterns };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await recordFetchError(url, errorMessage);
    
    // Try last-known-good fallback
    const lastKnownGood = await getLastKnownGood(url);
    if (lastKnownGood) {
      console.log(`[Privacy] Using last-known-good for ${url} after error`);
      return {
        rules: lastKnownGood.rules,
        parseErrors: 0,
        unsupportedPatterns: [],
      };
    }
    
    throw error;
  }
}

/**
 * Result of parsing filter list text
 */
export interface ParsedFilterListResult {
  /** Network blocking rules */
  networkRules: string[];
  /** Cosmetic (element hiding) rules */
  cosmeticRules: CosmeticRule[];
}

/**
 * Parse raw filter list text into individual rules
 * Separates network rules from cosmetic rules
 */
export function parseFilterListText(text: string): string[] {
  const result = parseFilterListTextFull(text);
  return result.networkRules;
}

/**
 * Parse raw filter list text into both network and cosmetic rules
 */
export function parseFilterListTextFull(text: string): ParsedFilterListResult {
  const lines = text.split('\n');
  const networkRules: string[] = [];
  const cosmeticRules: CosmeticRule[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Skip comments (lines starting with !)
    if (trimmed.startsWith('!')) continue;
    
    // Skip pure comment lines starting with #
    // But NOT cosmetic filters which contain ## or #@#
    if (trimmed.startsWith('#') && !trimmed.includes('##') && !trimmed.includes('#@#')) continue;
    
    // Skip ABP header
    if (trimmed.startsWith('[Adblock')) continue;
    
    // Skip HTML filters (procedural)
    if (trimmed.includes('#$#') || trimmed.includes('#@$#')) continue;
    
    // Skip snippet filters
    if (trimmed.includes('##+js') || trimmed.includes('#@#+js')) continue;
    
    // Parse cosmetic filters (element hiding rules)
    const cosmeticRule = parseCosmeticRule(trimmed);
    if (cosmeticRule) {
      cosmeticRules.push(cosmeticRule);
      continue;
    }
    
    // Accept network blocking rules
    // These include: ||domain.com^, @@||domain.com^, |https://..., etc.
    networkRules.push(trimmed);
  }
  
  return { networkRules, cosmeticRules };
}

/**
 * Result of parsing with tracking
 */
interface ParseWithTrackingResult {
  rules: string[];
  parseErrors: number;
  unsupportedPatterns: string[];
}

/**
 * Parse filter list text with error and unsupported pattern tracking
 */
export function parseFilterListTextWithTracking(
  text: string,
  url: string
): ParseWithTrackingResult {
  const lines = text.split('\n');
  const rules: string[] = [];
  let parseErrors = 0;
  const unsupportedPatterns: string[] = [];
  
  // Track pattern categories for telemetry
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
    
    // Skip empty lines and comments
    if (!trimmed) continue;
    if (trimmed.startsWith('!')) continue;
    if (trimmed.startsWith('#') && !trimmed.includes('##') && !trimmed.includes('#@#')) continue;
    if (trimmed.startsWith('[Adblock')) continue;
    
    // Check for unsupported patterns
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
    
    // Parse cosmetic filters
    if (trimmed.includes('##') || trimmed.includes('#@#')) {
      const cosmeticRule = parseCosmeticRule(trimmed);
      if (!cosmeticRule) {
        parseErrors++;
        continue;
      }
      // Cosmetic rules are handled separately
      continue;
    }
    
    // Accept network blocking rules
    rules.push(trimmed);
  }
  
  return { rules, parseErrors, unsupportedPatterns };
}

/**
 * Parse a single cosmetic filter rule
 * 
 * Formats supported:
 * - ##selector (generic, applies to all sites)
 * - domain.com##selector (domain-specific)
 * - domain1.com,domain2.com##selector (multiple domains)
 * - ~domain.com##selector (exception - don't hide on this domain)
 * - #@#selector (exception rule)
 * - domain.com#@#selector (domain-specific exception)
 */
export function parseCosmeticRule(rule: string): CosmeticRule | null {
  // Check for exception rules first (#@#)
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
  
  // Check for standard cosmetic filters (##)
  const cosmeticMatch = rule.match(/^([^#]*?)##(.+)$/);
  if (cosmeticMatch) {
    const [, domainsStr, selector] = cosmeticMatch;
    const { domains, excludedDomains } = parseCosmeticDomains(domainsStr);
    
    // Skip complex selectors that might cause performance issues
    // Skip procedural cosmetic filters (contain :has, :xpath, etc.)
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

/**
 * Parse domain list from cosmetic rule
 */
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

/**
 * Check if a selector is unsupported or potentially problematic
 */
function isUnsupportedSelector(selector: string): boolean {
  // Skip procedural cosmetic filters (uBlock extended syntax)
  const proceduralPatterns = [
    ':has(', ':has-text(', ':matches-css(', ':matches-path(',
    ':xpath(', ':nth-ancestor(', ':upward(', ':remove(',
    ':style(', ':min-text-length(', ':watch-attr(',
  ];
  
  for (const pattern of proceduralPatterns) {
    if (selector.includes(pattern)) {
      return true;
    }
  }
  
  // Skip overly broad selectors that could break pages
  if (selector === '*' || selector === 'body' || selector === 'html') {
    return true;
  }
  
  // Skip selectors that are too short (likely to cause false positives)
  if (selector.length < 3) {
    return true;
  }
  
  return false;
}

/**
 * Maximum rules to cache per filter list
 * Full lists are kept in memory but we only cache a subset to stay within storage limits
 */
const MAX_CACHED_RULES_PER_LIST = 10000;

/**
 * Cache a fetched filter list
 */
export async function cacheFilterList(
  url: string, 
  rules: string[]
): Promise<void> {
  const cache = await getCachedFilterLists();
  
  // Truncate rules to avoid storage quota issues
  // Prioritize domain-anchored rules (||) as they're most effective
  const domainRules = rules.filter(r => r.startsWith('||'));
  const otherRules = rules.filter(r => !r.startsWith('||'));
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
    console.log(`[Privacy] Cached filter list: ${url} (${truncatedRules.length}/${rules.length} rules)`);
  } catch (error) {
    // If storage fails, try clearing old cache entries
    if (error instanceof Error && error.message.includes('quota')) {
      console.warn('[Privacy] Storage quota exceeded, clearing old cache entries');
      try {
        // Only keep this entry
        await storage.set('filterListCache', { [url]: entry });
      } catch (retryError) {
        console.error('[Privacy] Failed to cache filter list:', retryError);
      }
    } else {
      console.error('[Privacy] Failed to cache filter list:', error);
    }
  }
}

/**
 * Remove a filter list from cache
 */
export async function removeCachedFilterList(url: string): Promise<void> {
  const cache = await getCachedFilterLists();
  delete cache[url];
  await storage.set('filterListCache', cache);
  console.log('[Privacy] Removed cached filter list:', url);
}

/**
 * Clear all cached filter lists
 */
export async function clearFilterListCache(): Promise<void> {
  await storage.set('filterListCache', {});
  console.log('[Privacy] Cleared filter list cache');
}

/**
 * Fetch and cache a filter list, returning cached version if still valid
 */
export async function getOrFetchFilterList(
  url: string, 
  forceRefresh = false
): Promise<string[]> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await getCachedFilterList(url);
    if (cached && !isFilterListExpired(cached)) {
      console.log('[Privacy] Using cached filter list:', url);
      return cached.rules;
    }
  }
  
  // Fetch fresh list
  try {
    const rules = await fetchFilterList(url);
    await cacheFilterList(url, rules);
    return rules;
  } catch (error) {
    // If fetch fails but we have a cached version (even expired), use it
    const cached = await getCachedFilterList(url);
    if (cached) {
      console.warn('[Privacy] Using expired cache for:', url);
      return cached.rules;
    }
    throw error;
  }
}

/**
 * Get all configured filter list URLs
 */
export async function getFilterListUrls(): Promise<string[]> {
  const settings = await storage.get('privacySettings');
  return settings?.filterListUrls || DEFAULT_PRIVACY_SETTINGS.filterListUrls;
}

/**
 * Validate that a URL uses HTTPS
 * 
 * SECURITY: Filter lists must be fetched over HTTPS to prevent MITM attacks
 * 
 * @param url - URL to validate
 * @returns True if URL is valid HTTPS
 */
function isValidFilterListUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    // SECURITY: Require HTTPS for all filter list URLs
    if (parsed.protocol !== 'https:') {
      return { 
        valid: false, 
        error: 'Filter list URLs must use HTTPS for security' 
      };
    }
    
    // Validate it's a reasonable URL format
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { 
        valid: false, 
        error: 'Invalid hostname in URL' 
      };
    }
    
    return { valid: true };
  } catch {
    return { 
      valid: false, 
      error: 'Invalid URL format' 
    };
  }
}

/**
 * Add a new filter list URL
 * 
 * SECURITY: Only HTTPS URLs are accepted to prevent MITM attacks
 * 
 * @throws Error if URL is not HTTPS or invalid
 */
export async function addFilterListUrl(url: string): Promise<void> {
  // SECURITY: Validate URL before adding
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

/**
 * Remove a filter list URL
 */
export async function removeFilterListUrl(url: string): Promise<void> {
  const settings = await storage.get('privacySettings');
  const current = settings || DEFAULT_PRIVACY_SETTINGS;
  
  current.filterListUrls = current.filterListUrls.filter(u => u !== url);
  await storage.set('privacySettings', current);
  await removeCachedFilterList(url);
  
  console.log('[Privacy] Removed filter list URL:', url);
}

/**
 * Maximum total filter rules to process
 * This prevents memory issues and storage quota problems
 */
const MAX_TOTAL_FILTER_RULES = 50000;

/**
 * Fetch all configured filter lists
 * Returns combined rules from all lists plus bootstrap list
 */
export async function fetchAllFilterLists(
  forceRefresh = false
): Promise<string[]> {
  const urls = await getFilterListUrls();
  const allRules: string[] = [];
  
  // Add bootstrap domain rules first (converted to filter syntax)
  for (const domain of BOOTSTRAP_TRACKER_DOMAINS) {
    allRules.push(`||${domain}^`);
  }
  
  // Add bootstrap URL pattern rules (blocks ad paths on any domain)
  for (const pattern of BOOTSTRAP_URL_PATTERNS) {
    allRules.push(pattern);
  }
  
  // Fetch each configured list sequentially to avoid memory spikes
  // and allow early termination if we hit the rule limit
  for (const url of urls) {
    if (allRules.length >= MAX_TOTAL_FILTER_RULES) {
      console.log(`[Privacy] Reached max rule limit (${MAX_TOTAL_FILTER_RULES}), skipping remaining lists`);
      break;
    }
    
    try {
      const rules = await getOrFetchFilterList(url, forceRefresh);
      // Only add rules up to the limit
      const remainingCapacity = MAX_TOTAL_FILTER_RULES - allRules.length;
      const rulesToAdd = rules.slice(0, remainingCapacity);
      allRules.push(...rulesToAdd);
      
      if (rules.length > rulesToAdd.length) {
        console.log(`[Privacy] Truncated ${url}: added ${rulesToAdd.length}/${rules.length} rules`);
      }
    } catch (error) {
      console.error(`[Privacy] Failed to load filter list ${url}:`, error);
    }
  }
  
  // Update last filter update timestamp
  try {
    const settings = await storage.get('privacySettings');
    if (settings) {
      settings.lastFilterUpdate = Date.now();
      await storage.set('privacySettings', settings);
    }
  } catch (error) {
    console.warn('[Privacy] Failed to update lastFilterUpdate:', error);
  }
  
  // Deduplicate rules using a more memory-efficient approach
  const seenRules = new Set<string>();
  const uniqueRules: string[] = [];
  for (const rule of allRules) {
    if (!seenRules.has(rule)) {
      seenRules.add(rule);
      uniqueRules.push(rule);
    }
  }
  
  console.log(`[Privacy] Loaded ${uniqueRules.length} unique filter rules`);
  
  return uniqueRules;
}

/**
 * Maximum cosmetic rules to cache to avoid storage quota issues
 */
const MAX_GENERIC_COSMETIC_RULES = 2000;
const MAX_DOMAIN_SPECIFIC_RULES_PER_DOMAIN = 100;
const MAX_DOMAINS_WITH_SPECIFIC_RULES = 500;

/**
 * Fetch all cosmetic rules from filter lists
 * Returns organized cosmetic rules for injection into pages
 * 
 * Note: Bootstrap selectors are applied separately and more conservatively
 * to avoid false positives on major sites
 */
export async function fetchAllCosmeticRules(
  forceRefresh = false
): Promise<CachedCosmeticRules> {
  const urls = await getFilterListUrls();
  const cosmeticRules: CachedCosmeticRules = {
    // Start with safe bootstrap selectors (curated, low false positive rate)
    generic: [...BOOTSTRAP_COSMETIC_SELECTORS],
    domainSpecific: {},
    exceptions: {},
    updatedAt: Date.now(),
  };
  
  // Fetch each list and extract cosmetic rules
  for (const url of urls) {
    try {
      const text = await fetchFilterListRaw(url, forceRefresh);
      const { cosmeticRules: rules } = parseFilterListTextFull(text);
      
      for (const rule of rules) {
        if (rule.type === 'generic') {
          // Limit generic rules to avoid excessive memory/storage use
          if (cosmeticRules.generic.length < MAX_GENERIC_COSMETIC_RULES) {
            cosmeticRules.generic.push(rule.selector);
          }
        } else if (rule.type === 'domain-specific' && rule.domains) {
          for (const domain of rule.domains) {
            // Limit number of domains we track
            if (Object.keys(cosmeticRules.domainSpecific).length >= MAX_DOMAINS_WITH_SPECIFIC_RULES &&
                !cosmeticRules.domainSpecific[domain]) {
              continue;
            }
            if (!cosmeticRules.domainSpecific[domain]) {
              cosmeticRules.domainSpecific[domain] = [];
            }
            // Limit rules per domain
            if (cosmeticRules.domainSpecific[domain].length < MAX_DOMAIN_SPECIFIC_RULES_PER_DOMAIN) {
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
    } catch (error) {
      console.warn(`[Privacy] Failed to fetch cosmetic rules from ${url}:`, error);
    }
  }
  
  // Deduplicate generic rules
  cosmeticRules.generic = [...new Set(cosmeticRules.generic)];
  
  // Deduplicate domain-specific rules
  for (const domain of Object.keys(cosmeticRules.domainSpecific)) {
    cosmeticRules.domainSpecific[domain] = [...new Set(cosmeticRules.domainSpecific[domain])];
  }
  
  // Cache the cosmetic rules with error handling
  try {
    await storage.set('cosmeticRulesCache', cosmeticRules);
  } catch (error) {
    console.warn('[Privacy] Failed to cache cosmetic rules, continuing without cache:', error);
  }
  
  console.log(`[Privacy] Loaded ${cosmeticRules.generic.length} generic cosmetic rules`);
  console.log(`[Privacy] Loaded domain-specific rules for ${Object.keys(cosmeticRules.domainSpecific).length} domains`);
  
  return cosmeticRules;
}

/**
 * Fetch raw filter list text (with caching)
 */
async function fetchFilterListRaw(url: string, forceRefresh = false): Promise<string> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await getCachedFilterList(url);
    if (cached && !isFilterListExpired(cached)) {
      // Return cached text by joining rules
      // Note: We lose cosmetic rules here if they were filtered out before
      // For cosmetic rules, we need to re-fetch
    }
  }
  
  // SECURITY: Validate HTTPS before fetching
  const validation = isValidFilterListUrl(url);
  if (!validation.valid) {
    throw new Error(`Security: ${validation.error}`);
  }
  
  const response = await fetch(url, {
    cache: 'no-cache',
    headers: {
      'Accept': 'text/plain',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.text();
}

/**
 * Get cached cosmetic rules
 */
export async function getCachedCosmeticRules(): Promise<CachedCosmeticRules> {
  const cached = await storage.get('cosmeticRulesCache');
  return cached || DEFAULT_COSMETIC_RULES;
}

/**
 * Get cosmetic rules for a specific domain
 * Combines generic rules with domain-specific rules, excluding exceptions
 * 
 * For protected sites (Twitter, YouTube, etc.), only domain-specific rules are returned
 * to prevent false positives from overly broad generic selectors
 */
export async function getCosmeticRulesForDomain(domain: string): Promise<string[]> {
  const cached = await getCachedCosmeticRules();
  const selectors: Set<string> = new Set();
  
  // Check if this is a protected site - if so, skip generic rules
  const siteIsProtected = isProtectedSite(domain);
  
  if (!siteIsProtected) {
    // Add generic rules only for non-protected sites
    for (const selector of cached.generic) {
      selectors.add(selector);
    }
  }
  
  // Add domain-specific rules (these are safe for all sites)
  // Match exact domain and parent domains (e.g., sub.example.com matches example.com rules)
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
  
  // Remove exception rules for this domain
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
    console.log(`[Privacy] Protected site ${domain}: returning ${selectors.size} domain-specific rules only`);
  }
  
  return Array.from(selectors);
}

/**
 * Check if filter lists need refresh based on TTL
 */
export async function needsFilterListRefresh(): Promise<boolean> {
  const settings = await storage.get('privacySettings');
  
  if (!settings?.lastFilterUpdate) {
    return true;
  }
  
  return Date.now() - settings.lastFilterUpdate > FILTER_LIST_TTL;
}

/**
 * Get filter list statistics
 */
export async function getFilterListStats(): Promise<{
  listCount: number;
  totalRules: number;
  lastUpdate: number | null;
  lists: { url: string; ruleCount: number; fetchedAt: number }[];
}> {
  const cache = await getCachedFilterLists();
  const settings = await storage.get('privacySettings');
  
  const lists = Object.values(cache).map(entry => ({
    url: entry.url,
    ruleCount: entry.rules.length,
    fetchedAt: entry.fetchedAt,
  }));
  
  const totalRules = lists.reduce((sum, l) => sum + l.ruleCount, 0) + BOOTSTRAP_TRACKER_DOMAINS.length;
  
  return {
    listCount: lists.length,
    totalRules,
    lastUpdate: settings?.lastFilterUpdate || null,
    lists,
  };
}

/**
 * Get comprehensive filter list health summary
 * Includes fetch status, error counts, and per-list details
 */
export async function getFilterListHealth(): Promise<FilterListHealthSummary> {
  return getFilterListHealthSummary();
}

/**
 * Reset a specific filter list (clears cache and forces refetch)
 */
export async function resetFilterList(url: string): Promise<void> {
  await removeCachedFilterList(url);
  // Force refresh
  try {
    await fetchFilterListWithHealth(url);
  } catch (error) {
    console.error(`[Privacy] Failed to reset filter list ${url}:`, error);
    throw error;
  }
}

