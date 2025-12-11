export interface ThreatIntelData {
  legitimateDomains: string[];

  scamDomains: string[];

  suspiciousTlds: string[];

  homoglyphMap: Record<string, string[]>;

  solanaKeywords: string[];

  version: string;

  updatedAt: number;
}

export interface CachedThreatIntel {
  data: ThreatIntelData;

  fetchedAt: number;

  expiresAt: number;

  source: string;

  isBootstrap: boolean;
}

export type ThreatSourceType = 'phishing' | 'malware' | 'scam' | 'combined';

export type ThreatFeedFormat = 'text' | 'json' | 'csv';

export interface ThreatIntelSource {
  id: string;

  name: string;

  url: string;

  type: ThreatSourceType;

  format: ThreatFeedFormat;

  enabled: boolean;

  refreshIntervalHours: number;

  priority: number;
}

export interface ThreatIntelFetchResult {
  success: boolean;
  data?: ThreatIntelData;
  error?: string;
  source: string;
  fetchedAt: number;
}

export interface ThreatIntelHealth {
  version: string;

  lastRefresh: number;

  usingBootstrap: boolean;

  lastError?: string;

  legitimateDomainCount: number;
  scamDomainCount: number;

  sourcesConfigured?: number;

  sourcesEnabled?: number;
}

export const THREAT_INTEL_TTL = 24 * 60 * 60 * 1000;

export const THREAT_INTEL_STALE_WINDOW = 60 * 60 * 1000;

export const THREAT_INTEL_MIN_REFRESH_INTERVAL = 5 * 60 * 1000;

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

export const EMPTY_THREAT_INTEL: ThreatIntelData = {
  legitimateDomains: [],
  scamDomains: [],
  suspiciousTlds: [],
  homoglyphMap: {},
  solanaKeywords: [],
  version: '0.0.0',
  updatedAt: 0,
};

export const DEFAULT_CACHED_THREAT_INTEL: CachedThreatIntel = {
  data: EMPTY_THREAT_INTEL,
  fetchedAt: 0,
  expiresAt: 0,
  source: 'bootstrap',
  isBootstrap: true,
};
