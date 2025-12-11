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
import { BOOTSTRAP_THREAT_INTEL } from './sources';

let memoryCache: CachedThreatIntel | null = null;

let lastRefreshAttempt = 0;

let isRefreshing = false;

const STORAGE_KEY_CACHE = 'threatIntelCache';
const STORAGE_KEY_SOURCES = 'threatIntelSources';

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
  } catch (error) {}

  return DEFAULT_CACHED_THREAT_INTEL;
}

async function saveThreatIntelCache(cache: CachedThreatIntel): Promise<void> {
  memoryCache = cache;

  try {
    await chrome.storage.local.set({ [STORAGE_KEY_CACHE]: cache });
  } catch (error) {}
}

function isCacheExpired(cache: CachedThreatIntel): boolean {
  return Date.now() > cache.expiresAt;
}

function isCacheStale(cache: CachedThreatIntel): boolean {
  const now = Date.now();
  return now > cache.expiresAt && now < cache.expiresAt + THREAT_INTEL_STALE_WINDOW;
}

function extractDomainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    const match = url.match(/(?:https?:\/\/)?([^\/\s:]+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

function parseTextFeed(text: string): string[] {
  const domains = new Set<string>();
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const domain = extractDomainFromUrl(trimmed);
    if (domain && domain.includes('.')) {
      domains.add(domain);
    }
  }

  return Array.from(domains);
}

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

async function fetchFromSource(source: ThreatIntelSource): Promise<ThreatIntelFetchResult> {
  const fetchedAt = Date.now();

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
        Accept: source.format === 'json' ? 'application/json' : 'text/plain',
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

    let scamDomains: string[] = [];

    if (source.format === 'json') {
      const jsonData = await response.json();
      scamDomains = parsePhishTankFeed(jsonData);
    } else {
      const textData = await response.text();
      scamDomains = parseTextFeed(textData);
    }

    const partialData: ThreatIntelData = {
      legitimateDomains: [],
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

async function fetchFromAllSources(sources: ThreatIntelSource[]): Promise<ThreatIntelFetchResult> {
  const enabledSources = sources.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority);

  if (enabledSources.length === 0) {
    return {
      success: false,
      error: 'No enabled threat intel sources',
      source: 'none',
      fetchedAt: Date.now(),
    };
  }

  const results = await Promise.allSettled(enabledSources.map((source) => fetchFromSource(source)));

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
      const error =
        result.status === 'rejected'
          ? result.reason
          : (result.value as ThreatIntelFetchResult).error;
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

  const mergedData: ThreatIntelData = {
    ...BOOTSTRAP_THREAT_INTEL,
    scamDomains: [...BOOTSTRAP_THREAT_INTEL.scamDomains, ...Array.from(allScamDomains)],
    version: `merged-${Date.now()}`,
    updatedAt: Date.now(),
  };

  return {
    success: true,
    data: mergedData,
    source: successfulSources.join(', '),
    fetchedAt: Date.now(),
  };
}

export async function getThreatIntelData(): Promise<ThreatIntelData> {
  const cached = await getCachedThreatIntel();

  if (isCacheExpired(cached) || isCacheStale(cached)) {
    refreshThreatIntel().catch((error) => {});
  }

  if (cached.data && cached.data.version !== '0.0.0') {
    return cached.data;
  }

  return BOOTSTRAP_THREAT_INTEL;
}

export async function refreshThreatIntel(force = false): Promise<boolean> {
  if (isRefreshing) {
    return false;
  }

  const sources = await getThreatIntelSources();

  if (sources.length === 0 || !sources.some((s) => s.enabled)) {
    return false;
  }

  const now = Date.now();
  if (!force && now - lastRefreshAttempt < THREAT_INTEL_MIN_REFRESH_INTERVAL) {
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

      return true;
    }

    return false;
  } finally {
    isRefreshing = false;
  }
}

export async function getThreatIntelSources(): Promise<ThreatIntelSource[]> {
  try {
    const sources = await chrome.storage.local.get(STORAGE_KEY_SOURCES);
    if (sources[STORAGE_KEY_SOURCES] && Array.isArray(sources[STORAGE_KEY_SOURCES])) {
      return sources[STORAGE_KEY_SOURCES];
    }
  } catch (error) {}

  return DEFAULT_THREAT_INTEL_SOURCES;
}

export async function addThreatIntelSource(source: Omit<ThreatIntelSource, 'id'>): Promise<void> {
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

export async function removeThreatIntelSource(sourceId: string): Promise<void> {
  const sources = await getThreatIntelSources();
  const filtered = sources.filter((s) => s.id !== sourceId);
  await chrome.storage.local.set({ [STORAGE_KEY_SOURCES]: filtered });
}

export async function toggleThreatIntelSource(sourceId: string, enabled: boolean): Promise<void> {
  const sources = await getThreatIntelSources();
  const updated = sources.map((s) => (s.id === sourceId ? { ...s, enabled } : s));
  await chrome.storage.local.set({ [STORAGE_KEY_SOURCES]: updated });
}

export async function getThreatIntelHealth(): Promise<ThreatIntelHealth> {
  const cached = await getCachedThreatIntel();
  const sources = await getThreatIntelSources();
  const enabledCount = sources.filter((s) => s.enabled).length;

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

export async function initializeThreatIntel(): Promise<void> {
  const cached = await getCachedThreatIntel();

  if (!cached.data || cached.data.version === '0.0.0' || isCacheExpired(cached)) {
    const bootstrapCache: CachedThreatIntel = {
      data: BOOTSTRAP_THREAT_INTEL,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + THREAT_INTEL_TTL,
      source: 'bootstrap',
      isBootstrap: true,
    };
    await saveThreatIntelCache(bootstrapCache);

    refreshThreatIntel().catch((error) => {});
  }
}

export function setupThreatIntelAlarm(): void {
  const ALARM_NAME = 'threatIntelRefresh';

  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: 6 * 60,
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      refreshThreatIntel().catch((error) => {});
    }
  });
}

export async function isKnownLegitimateDomain(domain: string): Promise<boolean> {
  const data = await getThreatIntelData();
  const normalizedDomain = domain.toLowerCase();

  if (data.legitimateDomains.includes(normalizedDomain)) {
    return true;
  }

  for (const knownDomain of data.legitimateDomains) {
    if (normalizedDomain.endsWith('.' + knownDomain)) {
      return true;
    }
  }

  return false;
}

const NEVER_FLAG_DOMAINS = new Set([
  'google.com',
  'www.google.com',
  'accounts.google.com',
  'myaccount.google.com',
  'sites.google.com',
  'docs.google.com',
  'forms.google.com',
  'drive.google.com',
  'mail.google.com',
  'calendar.google.com',
  'meet.google.com',
  'chat.google.com',
  'youtube.com',
  'www.youtube.com',
  'gmail.com',
  'www.gmail.com',

  'microsoft.com',
  'www.microsoft.com',
  'outlook.com',
  'login.microsoftonline.com',
  'account.microsoft.com',
  'office.com',
  'www.office.com',
  'live.com',
  'www.live.com',

  'github.com',
  'www.github.com',
  'gist.github.com',
  'apple.com',
  'www.apple.com',
  'appleid.apple.com',
  'icloud.com',
  'www.icloud.com',
  'amazon.com',
  'www.amazon.com',
  'paypal.com',
  'www.paypal.com',
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
  'facebook.com',
  'www.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'linkedin.com',
  'www.linkedin.com',
  'dropbox.com',
  'www.dropbox.com',
  'notion.so',
  'www.notion.so',
]);

export async function isKnownScamDomain(domain: string): Promise<boolean> {
  const normalizedDomain = domain.toLowerCase();

  if (NEVER_FLAG_DOMAINS.has(normalizedDomain)) {
    return false;
  }

  const data = await getThreatIntelData();
  return data.scamDomains.includes(normalizedDomain);
}

export async function isSuspiciousTld(domain: string): Promise<boolean> {
  const data = await getThreatIntelData();
  return data.suspiciousTlds.some((tld) => domain.toLowerCase().endsWith(tld));
}

export async function getHomoglyphMap(): Promise<Record<string, string[]>> {
  const data = await getThreatIntelData();
  return data.homoglyphMap;
}

export async function getSolanaKeywords(): Promise<string[]> {
  const data = await getThreatIntelData();
  return data.solanaKeywords;
}
