/**
 * AINTIVIRUS Threat Intelligence Module
 * 
 * Provides remotely-updatable threat intelligence data with:
 * - Periodic refresh with configurable TTL
 * - Local caching in chrome.storage
 * - Offline fallback to bootstrap data
 * - Stale-while-revalidate pattern
 * 
 * SECURITY: Only fetches from HTTPS endpoints
 */

import { storage } from '@shared/storage';
import {
  ThreatIntelData,
  CachedThreatIntel,
  ThreatIntelFetchResult,
  ThreatIntelHealth,
  ThreatIntelSource,
  THREAT_INTEL_TTL,
  THREAT_INTEL_STALE_WINDOW,
  THREAT_INTEL_MIN_REFRESH_INTERVAL,
  DEFAULT_THREAT_INTEL_SOURCES,
  DEFAULT_CACHED_THREAT_INTEL,
} from './types';
import {
  BOOTSTRAP_THREAT_INTEL,
  validateThreatIntelData,
  mergeThreatIntelData,
} from './sources';

// ============================================
// MODULE STATE
// ============================================

/** In-memory cache for fast access */
let memoryCache: CachedThreatIntel | null = null;

/** Last refresh attempt timestamp */
let lastRefreshAttempt = 0;

/** Whether a refresh is currently in progress */
let isRefreshing = false;

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEY_CACHE = 'threatIntelCache';
const STORAGE_KEY_SOURCES = 'threatIntelSources';

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Get cached threat intel from storage
 */
async function getCachedThreatIntel(): Promise<CachedThreatIntel> {
  if (memoryCache) {
    return memoryCache;
  }
  
  try {
    const cached = await storage.get(STORAGE_KEY_CACHE as keyof typeof storage.get);
    if (cached && typeof cached === 'object' && 'data' in (cached as object)) {
      memoryCache = cached as unknown as CachedThreatIntel;
      return memoryCache;
    }
  } catch (error) {
    console.warn('[ThreatIntel] Failed to read cache from storage:', error);
  }
  
  return DEFAULT_CACHED_THREAT_INTEL;
}

/**
 * Save threat intel to cache
 */
async function saveThreatIntelCache(cache: CachedThreatIntel): Promise<void> {
  memoryCache = cache;
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_CACHE]: cache });
  } catch (error) {
    console.error('[ThreatIntel] Failed to save cache to storage:', error);
  }
}

/**
 * Check if cache is expired (needs refresh)
 */
function isCacheExpired(cache: CachedThreatIntel): boolean {
  return Date.now() > cache.expiresAt;
}

/**
 * Check if cache is stale but still usable
 */
function isCacheStale(cache: CachedThreatIntel): boolean {
  const now = Date.now();
  return now > cache.expiresAt && now < cache.expiresAt + THREAT_INTEL_STALE_WINDOW;
}

// ============================================
// FETCHING
// ============================================

/**
 * Extract domain from a URL
 */
function extractDomainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    // Try to extract domain from malformed URLs
    const match = url.match(/(?:https?:\/\/)?([^\/\s:]+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Parse text-based feed (one URL per line)
 */
function parseTextFeed(text: string): string[] {
  const domains = new Set<string>();
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const domain = extractDomainFromUrl(trimmed);
    if (domain && domain.includes('.')) {
      domains.add(domain);
    }
  }
  
  return Array.from(domains);
}

/**
 * Parse PhishTank JSON feed
 */
function parsePhishTankFeed(data: unknown): string[] {
  const domains = new Set<string>();
  
  if (!Array.isArray(data)) {
    return [];
  }
  
  for (const entry of data) {
    if (entry && typeof entry === 'object' && 'url' in entry) {
      const domain = extractDomainFromUrl(String(entry.url));
      if (domain && domain.includes('.')) {
        domains.add(domain);
      }
    }
  }
  
  return Array.from(domains);
}

/**
 * Fetch and parse threat intel from a remote source
 */
async function fetchFromSource(source: ThreatIntelSource): Promise<ThreatIntelFetchResult> {
  const fetchedAt = Date.now();
  
  // SECURITY: Require HTTPS
  if (!source.url.startsWith('https://')) {
    return {
      success: false,
      error: 'Security: Only HTTPS sources are allowed',
      source: source.url,
      fetchedAt,
    };
  }
  
  try {
    const response = await fetch(source.url, {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        'Accept': source.format === 'json' ? 'application/json' : 'text/plain',
      },
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        source: source.url,
        fetchedAt,
      };
    }
    
    // Parse based on format
    let scamDomains: string[] = [];
    
    if (source.format === 'json') {
      const jsonData = await response.json();
      scamDomains = parsePhishTankFeed(jsonData);
    } else {
      const textData = await response.text();
      scamDomains = parseTextFeed(textData);
    }
    
    console.log(`[ThreatIntel] Parsed ${scamDomains.length} domains from ${source.name}`);
    
    // Create partial threat intel data from this source
    const partialData: ThreatIntelData = {
      legitimateDomains: [], // These feeds don't provide legitimate domains
      scamDomains,
      suspiciousTlds: [],
      homoglyphMap: {},
      solanaKeywords: [],
      version: `${source.id}-${Date.now()}`,
      updatedAt: fetchedAt,
    };
    
    return {
      success: true,
      data: partialData,
      source: source.url,
      fetchedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown fetch error',
      source: source.url,
      fetchedAt,
    };
  }
}

/**
 * Fetch from all sources and merge results
 */
async function fetchFromAllSources(sources: ThreatIntelSource[]): Promise<ThreatIntelFetchResult> {
  // Filter enabled sources and sort by priority
  const enabledSources = sources
    .filter(s => s.enabled)
    .sort((a, b) => a.priority - b.priority);
  
  if (enabledSources.length === 0) {
    return {
      success: false,
      error: 'No enabled threat intel sources',
      source: 'none',
      fetchedAt: Date.now(),
    };
  }
  
  // Fetch from all sources in parallel
  const results = await Promise.allSettled(
    enabledSources.map(source => fetchFromSource(source))
  );
  
  // Collect all scam domains from successful fetches
  const allScamDomains = new Set<string>();
  let anySuccess = false;
  const successfulSources: string[] = [];
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const source = enabledSources[i];
    
    if (result.status === 'fulfilled' && result.value.success && result.value.data) {
      anySuccess = true;
      successfulSources.push(source.name);
      
      for (const domain of result.value.data.scamDomains) {
        allScamDomains.add(domain);
      }
    } else {
      const error = result.status === 'rejected' 
        ? result.reason 
        : (result.value as ThreatIntelFetchResult).error;
      console.warn(`[ThreatIntel] Failed to fetch from ${source.name}: ${error}`);
    }
  }
  
  if (!anySuccess) {
    return {
      success: false,
      error: 'All threat intel sources failed',
      source: 'none',
      fetchedAt: Date.now(),
    };
  }
  
  // Merge with bootstrap data
  const mergedData: ThreatIntelData = {
    ...BOOTSTRAP_THREAT_INTEL,
    scamDomains: [
      ...BOOTSTRAP_THREAT_INTEL.scamDomains,
      ...Array.from(allScamDomains),
    ],
    version: `merged-${Date.now()}`,
    updatedAt: Date.now(),
  };
  
  console.log(`[ThreatIntel] Merged ${allScamDomains.size} threat domains from: ${successfulSources.join(', ')}`);
  
  return {
    success: true,
    data: mergedData,
    source: successfulSources.join(', '),
    fetchedAt: Date.now(),
  };
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get current threat intel data
 * 
 * Returns cached data immediately, triggering background refresh if stale.
 * Falls back to bootstrap data if no cache is available.
 */
export async function getThreatIntelData(): Promise<ThreatIntelData> {
  const cached = await getCachedThreatIntel();
  
  // If cache is expired or stale, trigger background refresh
  if (isCacheExpired(cached) || isCacheStale(cached)) {
    // Don't await - refresh in background
    refreshThreatIntel().catch(error => {
      console.error('[ThreatIntel] Background refresh failed:', error);
    });
  }
  
  // Return cached data if available, otherwise bootstrap
  if (cached.data && cached.data.version !== '0.0.0') {
    return cached.data;
  }
  
  return BOOTSTRAP_THREAT_INTEL;
}

/**
 * Force refresh threat intel data
 * 
 * Respects minimum refresh interval to prevent hammering.
 */
export async function refreshThreatIntel(force = false): Promise<boolean> {
  // Prevent concurrent refreshes
  if (isRefreshing) {
    console.log('[ThreatIntel] Refresh already in progress');
    return false;
  }
  
  const sources = await getThreatIntelSources();
  
  // Skip if no sources configured
  if (sources.length === 0 || !sources.some(s => s.enabled)) {
    console.log('[ThreatIntel] No remote sources configured, using bootstrap data');
    return false;
  }
  
  // Respect minimum refresh interval unless forced
  const now = Date.now();
  if (!force && now - lastRefreshAttempt < THREAT_INTEL_MIN_REFRESH_INTERVAL) {
    console.log('[ThreatIntel] Minimum refresh interval not reached');
    return false;
  }
  
  isRefreshing = true;
  lastRefreshAttempt = now;
  
  try {
    const result = await fetchFromAllSources(sources);
    
    if (result.success && result.data) {
      const cache: CachedThreatIntel = {
        data: result.data,
        fetchedAt: result.fetchedAt,
        expiresAt: result.fetchedAt + THREAT_INTEL_TTL,
        source: result.source,
        isBootstrap: false,
      };
      
      await saveThreatIntelCache(cache);
      console.log(`[ThreatIntel] Refreshed: ${result.data.legitimateDomains.length} legitimate, ${result.data.scamDomains.length} scam domains`);
      return true;
    }
    
    // Fetch failed - keep existing cache if available
    console.warn('[ThreatIntel] Refresh failed, using existing cache');
    return false;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Get configured threat intel sources
 */
export async function getThreatIntelSources(): Promise<ThreatIntelSource[]> {
  try {
    const sources = await chrome.storage.local.get(STORAGE_KEY_SOURCES);
    if (sources[STORAGE_KEY_SOURCES] && Array.isArray(sources[STORAGE_KEY_SOURCES])) {
      return sources[STORAGE_KEY_SOURCES];
    }
  } catch (error) {
    console.warn('[ThreatIntel] Failed to read sources from storage:', error);
  }
  
  return DEFAULT_THREAT_INTEL_SOURCES;
}

/**
 * Add a custom threat intel source
 */
export async function addThreatIntelSource(source: Omit<ThreatIntelSource, 'id'>): Promise<void> {
  // SECURITY: Require HTTPS
  if (!source.url.startsWith('https://')) {
    throw new Error('Security: Only HTTPS sources are allowed');
  }
  
  const sources = await getThreatIntelSources();
  const newSource: ThreatIntelSource = {
    ...source,
    id: `custom-${Date.now()}`,
  };
  
  sources.push(newSource);
  await chrome.storage.local.set({ [STORAGE_KEY_SOURCES]: sources });
}

/**
 * Remove a threat intel source
 */
export async function removeThreatIntelSource(sourceId: string): Promise<void> {
  const sources = await getThreatIntelSources();
  const filtered = sources.filter(s => s.id !== sourceId);
  await chrome.storage.local.set({ [STORAGE_KEY_SOURCES]: filtered });
}

/**
 * Toggle a threat intel source enabled/disabled
 */
export async function toggleThreatIntelSource(sourceId: string, enabled: boolean): Promise<void> {
  const sources = await getThreatIntelSources();
  const updated = sources.map(s => 
    s.id === sourceId ? { ...s, enabled } : s
  );
  await chrome.storage.local.set({ [STORAGE_KEY_SOURCES]: updated });
}

/**
 * Get threat intel health status
 */
export async function getThreatIntelHealth(): Promise<ThreatIntelHealth> {
  const cached = await getCachedThreatIntel();
  const sources = await getThreatIntelSources();
  const enabledCount = sources.filter(s => s.enabled).length;
  
  return {
    version: cached.data?.version || 'none',
    lastRefresh: cached.fetchedAt,
    usingBootstrap: cached.isBootstrap,
    legitimateDomainCount: cached.data?.legitimateDomains?.length || 0,
    scamDomainCount: cached.data?.scamDomains?.length || 0,
    lastError: undefined,
    sourcesConfigured: sources.length,
    sourcesEnabled: enabledCount,
  };
}

/**
 * Initialize threat intel module
 * Should be called on extension startup
 */
export async function initializeThreatIntel(): Promise<void> {
  console.log('[ThreatIntel] Initializing...');
  
  // Load cache from storage
  const cached = await getCachedThreatIntel();
  
  // If no cache or expired, trigger refresh
  if (!cached.data || cached.data.version === '0.0.0' || isCacheExpired(cached)) {
    // Use bootstrap immediately
    const bootstrapCache: CachedThreatIntel = {
      data: BOOTSTRAP_THREAT_INTEL,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + THREAT_INTEL_TTL,
      source: 'bootstrap',
      isBootstrap: true,
    };
    await saveThreatIntelCache(bootstrapCache);
    
    // Attempt remote refresh in background
    refreshThreatIntel().catch(error => {
      console.warn('[ThreatIntel] Initial refresh failed, using bootstrap:', error);
    });
  }
  
  console.log('[ThreatIntel] Initialized');
}

/**
 * Set up periodic refresh alarm
 * Should be called from background script
 */
export function setupThreatIntelAlarm(): void {
  const ALARM_NAME = 'threatIntelRefresh';
  
  // Create alarm for periodic refresh (every 6 hours)
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: 6 * 60, // 6 hours
  });
  
  // Handle alarm
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      refreshThreatIntel().catch(error => {
        console.error('[ThreatIntel] Scheduled refresh failed:', error);
      });
    }
  });
  
  console.log('[ThreatIntel] Refresh alarm configured');
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Check if a domain is in the known legitimate list
 */
export async function isKnownLegitimateDomain(domain: string): Promise<boolean> {
  const data = await getThreatIntelData();
  const normalizedDomain = domain.toLowerCase();
  
  // Check exact match
  if (data.legitimateDomains.includes(normalizedDomain)) {
    return true;
  }
  
  // Check if it's a subdomain of a known domain
  for (const knownDomain of data.legitimateDomains) {
    if (normalizedDomain.endsWith('.' + knownDomain)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Major legitimate domains that should NEVER be flagged as scams
 * These are platforms commonly abused for phishing (Google Sites, etc.)
 * but the platforms themselves are not malicious
 */
const NEVER_FLAG_DOMAINS = new Set([
  'google.com',
  'www.google.com',
  'sites.google.com',
  'docs.google.com',
  'forms.google.com',
  'drive.google.com',
  'microsoft.com',
  'outlook.com',
  'github.com',
  'apple.com',
  'icloud.com',
  'amazon.com',
  'paypal.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'dropbox.com',
  'notion.so',
]);

/**
 * Check if a domain is in the known scam list
 */
export async function isKnownScamDomain(domain: string): Promise<boolean> {
  const normalizedDomain = domain.toLowerCase();
  
  // Never flag major legitimate domains - feeds sometimes include
  // phishing pages hosted on these platforms (Google Sites, etc.)
  if (NEVER_FLAG_DOMAINS.has(normalizedDomain)) {
    return false;
  }
  
  const data = await getThreatIntelData();
  return data.scamDomains.includes(normalizedDomain);
}

/**
 * Check if a TLD is suspicious
 */
export async function isSuspiciousTld(domain: string): Promise<boolean> {
  const data = await getThreatIntelData();
  return data.suspiciousTlds.some(tld => domain.toLowerCase().endsWith(tld));
}

/**
 * Get homoglyph map for character analysis
 */
export async function getHomoglyphMap(): Promise<Record<string, string[]>> {
  const data = await getThreatIntelData();
  return data.homoglyphMap;
}

/**
 * Get Solana keywords for typosquat detection
 */
export async function getSolanaKeywords(): Promise<string[]> {
  const data = await getThreatIntelData();
  return data.solanaKeywords;
}

