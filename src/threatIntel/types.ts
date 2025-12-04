/**
 * AINTIVIRUS Threat Intelligence Module - Type Definitions
 * 
 * Provides types for remotely-updatable threat intelligence data
 * including domain lists, homoglyph mappings, and scam indicators.
 */

// ============================================
// THREAT INTELLIGENCE DATA
// ============================================

/**
 * Core threat intelligence data structure
 * This is the format expected from remote JSON endpoints
 */
export interface ThreatIntelData {
  /** Known legitimate Solana ecosystem domains */
  legitimateDomains: string[];
  /** Known scam/phishing domains */
  scamDomains: string[];
  /** TLDs commonly associated with phishing */
  suspiciousTlds: string[];
  /** Character substitution map for homoglyph detection */
  homoglyphMap: Record<string, string[]>;
  /** Solana-related keywords for typosquat detection */
  solanaKeywords: string[];
  /** Version identifier for this data */
  version: string;
  /** When this data was last updated (Unix ms) */
  updatedAt: number;
}

/**
 * Cached threat intel with metadata
 */
export interface CachedThreatIntel {
  /** The actual threat intel data */
  data: ThreatIntelData;
  /** When this cache entry was fetched */
  fetchedAt: number;
  /** When this cache entry expires */
  expiresAt: number;
  /** Source URL this was fetched from (or 'bootstrap' for static data) */
  source: string;
  /** Whether this is from remote or bootstrap fallback */
  isBootstrap: boolean;
}

/**
 * Type of threat data provided by a source
 */
export type ThreatSourceType = 'phishing' | 'malware' | 'scam' | 'combined';

/**
 * Format of the threat feed
 */
export type ThreatFeedFormat = 'text' | 'json' | 'csv';

/**
 * Configuration for a threat intel source
 */
export interface ThreatIntelSource {
  /** Unique identifier for this source */
  id: string;
  /** Display name */
  name: string;
  /** URL to fetch from */
  url: string;
  /** Type of threats this source provides */
  type: ThreatSourceType;
  /** Format of the feed */
  format: ThreatFeedFormat;
  /** Whether this source is enabled */
  enabled: boolean;
  /** Refresh interval in hours */
  refreshIntervalHours: number;
  /** Priority (lower = higher priority) */
  priority: number;
}

/**
 * Result of a threat intel fetch operation
 */
export interface ThreatIntelFetchResult {
  success: boolean;
  data?: ThreatIntelData;
  error?: string;
  source: string;
  fetchedAt: number;
}

/**
 * Health status of threat intel system
 */
export interface ThreatIntelHealth {
  /** Current data version */
  version: string;
  /** When data was last successfully refreshed */
  lastRefresh: number;
  /** Whether currently using bootstrap fallback */
  usingBootstrap: boolean;
  /** Last fetch error if any */
  lastError?: string;
  /** Number of domains in current dataset */
  legitimateDomainCount: number;
  scamDomainCount: number;
  /** Number of configured sources */
  sourcesConfigured?: number;
  /** Number of enabled sources */
  sourcesEnabled?: number;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * TTL for threat intel cache (24 hours)
 */
export const THREAT_INTEL_TTL = 24 * 60 * 60 * 1000;

/**
 * Stale-while-revalidate window (1 hour)
 * Cache is still usable while fetching fresh data
 */
export const THREAT_INTEL_STALE_WINDOW = 60 * 60 * 1000;

/**
 * Minimum refresh interval to prevent hammering (5 minutes)
 */
export const THREAT_INTEL_MIN_REFRESH_INTERVAL = 5 * 60 * 1000;

/**
 * Default threat intel source configuration
 * 
 * Uses publicly available threat intelligence feeds:
 * - OpenPhish: Community phishing feed
 * - PhishTank: Collaborative phishing database
 * - URLhaus: Malware URL database from abuse.ch
 */
export const DEFAULT_THREAT_INTEL_SOURCES: ThreatIntelSource[] = [
  {
    id: 'openphish',
    name: 'OpenPhish',
    type: 'phishing',
    url: 'https://openphish.com/feed.txt',
    format: 'text',
    enabled: true,
    refreshIntervalHours: 6,
    priority: 1,
  },
  {
    id: 'phishtank',
    name: 'PhishTank',
    type: 'phishing',
    url: 'https://data.phishtank.com/data/online-valid.json',
    format: 'json',
    enabled: true,
    refreshIntervalHours: 12,
    priority: 2,
  },
  {
    id: 'urlhaus',
    name: 'URLhaus',
    type: 'malware',
    url: 'https://urlhaus.abuse.ch/downloads/text_online/',
    format: 'text',
    enabled: true,
    refreshIntervalHours: 6,
    priority: 3,
  },
];

/**
 * Empty threat intel data for initialization
 */
export const EMPTY_THREAT_INTEL: ThreatIntelData = {
  legitimateDomains: [],
  scamDomains: [],
  suspiciousTlds: [],
  homoglyphMap: {},
  solanaKeywords: [],
  version: '0.0.0',
  updatedAt: 0,
};

/**
 * Default cached state (uses bootstrap)
 */
export const DEFAULT_CACHED_THREAT_INTEL: CachedThreatIntel = {
  data: EMPTY_THREAT_INTEL,
  fetchedAt: 0,
  expiresAt: 0,
  source: 'bootstrap',
  isBootstrap: true,
};

