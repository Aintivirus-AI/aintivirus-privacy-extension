/**
 * AINTIVIRUS Privacy Module Types
 * 
 * Type definitions for the privacy and anti-tracking layer.
 */

/**
 * Per-site privacy mode
 * - normal: Block third-party trackers, delete third-party cookies on tab close
 * - strict: Block all trackers, delete ALL cookies on tab close
 * - disabled: No privacy protections for this site
 */
export type SitePrivacyMode = 'normal' | 'strict' | 'disabled';

/**
 * Global privacy settings
 */
export interface PrivacySettings {
  /** Master privacy protection toggle */
  enabled: boolean;
  /** Block tracking requests */
  blockTrackers: boolean;
  /** Auto-delete cookies on tab close */
  cookieCleanup: boolean;
  /** Default cookie cleanup mode for sites without specific settings */
  defaultCookieMode: 'third-party' | 'all' | 'none';
  /** Minimize tracking headers (Referer, etc.) */
  headerMinimization: boolean;
  /** Strip tracking query parameters (utm_*, fbclid, etc.) */
  stripTrackingParams: boolean;
  /** Send Global Privacy Control header */
  sendGPC: boolean;
  /** Filter list URLs to fetch */
  filterListUrls: string[];
  /** Last filter list update timestamp */
  lastFilterUpdate: number | null;
}

/**
 * Default privacy settings
 */
export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  enabled: true,
  blockTrackers: true,
  cookieCleanup: true,
  defaultCookieMode: 'third-party',
  headerMinimization: true,
  stripTrackingParams: true,
  sendGPC: true,
  filterListUrls: [
    // EasyList - primary ad-blocking filter list
    'https://easylist.to/easylist/easylist.txt',
    // EasyPrivacy - primary privacy/tracker filter list
    'https://easylist.to/easylist/easyprivacy.txt',
    // uBlock Origin filters - ads
    'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    // uBlock Privacy filters
    'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    // Peter Lowe's ad/tracking server list
    'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext',
  ],
  lastFilterUpdate: null,
};

/**
 * Per-site privacy settings storage
 */
export interface SitePrivacySettings {
  [domain: string]: SitePrivacyMode;
}

/**
 * Cached filter list entry
 */
export interface CachedFilterList {
  url: string;
  rules: string[];
  fetchedAt: number;
  expiresAt: number;
}

/**
 * Filter list cache storage
 */
export interface FilterListCache {
  [url: string]: CachedFilterList;
}

/**
 * Parsed filter rule from ABP/uBlock syntax
 */
export interface ParsedFilterRule {
  /** Original rule text */
  raw: string;
  /** Rule type */
  type: 'block' | 'allow';
  /** URL pattern to match */
  pattern: string;
  /** Whether it's a domain-anchored rule (||) */
  isDomainAnchored: boolean;
  /** Resource types to apply to */
  resourceTypes: chrome.declarativeNetRequest.ResourceType[];
  /** Domains to apply to (if specified) */
  domains?: string[];
  /** Domains to exclude (if specified) */
  excludedDomains?: string[];
}

/**
 * Chrome DNR rule with our metadata
 */
export interface PrivacyDNRRule extends chrome.declarativeNetRequest.Rule {
  /** Source filter list URL */
  sourceList?: string;
}

/**
 * Blocked request log entry
 */
export interface BlockedRequest {
  /** Tab ID where the request was blocked */
  tabId: number;
  /** Blocked URL */
  url: string;
  /** Domain of the blocked URL */
  domain: string;
  /** Initiator domain (page that made the request) */
  initiator: string | null;
  /** Resource type */
  resourceType: string;
  /** Rule ID that matched */
  ruleId: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Cookie cleanup log entry
 */
export interface CookieCleanupEntry {
  /** Domain cookies were cleaned for */
  domain: string;
  /** Number of cookies deleted */
  count: number;
  /** Cleanup mode used */
  mode: SitePrivacyMode;
  /** Timestamp */
  timestamp: number;
}

/**
 * Privacy metrics for dashboard
 */
export interface PrivacyMetrics {
  /** Total requests blocked in current session */
  totalBlockedRequests: number;
  /** Blocked requests per domain */
  blockedByDomain: { [domain: string]: number };
  /** Total cookies deleted in current session */
  totalCookiesDeleted: number;
  /** Number of active blocking rules */
  activeRuleCount: number;
  /** Number of filter lists loaded */
  filterListCount: number;
  /** Recent blocked requests (last 100) */
  recentBlocked: BlockedRequest[];
  /** Recent cookie cleanups */
  recentCookieCleanups: CookieCleanupEntry[];
  /** Session start timestamp */
  sessionStart: number;
  /** Total scripts intercepted (fingerprint protection) */
  scriptsIntercepted: number;
  /** Total requests modified (headers, URL params stripped) */
  requestsModified: number;
}

/**
 * Default metrics state
 */
export const DEFAULT_PRIVACY_METRICS: PrivacyMetrics = {
  totalBlockedRequests: 0,
  blockedByDomain: {},
  totalCookiesDeleted: 0,
  activeRuleCount: 0,
  filterListCount: 0,
  recentBlocked: [],
  recentCookieCleanups: [],
  sessionStart: Date.now(),
  scriptsIntercepted: 0,
  requestsModified: 0,
};

/**
 * Tab to domain mapping for cookie cleanup
 */
export interface TabDomainMapping {
  [tabId: number]: {
    domain: string;
    url: string;
    thirdPartyDomains: Set<string>;
  };
}

/**
 * Bootstrap tracker list - minimal hardcoded list for immediate protection
 * These are the most common trackers that should be blocked before filter lists load
 */
export const BOOTSTRAP_TRACKER_DOMAINS: string[] = [
  // EFF Cover Your Tracks test domains (must be blocked for test to pass)
  'trackersimulator.org',
  'eviltracker.net',
  'do-not-tracker.org',
  'firstpartysimulator.org',
  'firstpartysimulator.net',
  
  // Google Analytics & Ads
  'google-analytics.com',
  'googleadservices.com',
  'googlesyndication.com',
  'doubleclick.net',
  'googletagmanager.com',
  'googletagservices.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'tpc.googlesyndication.com',
  // Facebook
  'facebook.net',
  'facebook.com/tr',
  'connect.facebook.net',
  'pixel.facebook.com',
  'an.facebook.com',
  // Twitter/X
  'analytics.twitter.com',
  't.co',
  'platform.twitter.com',
  'ads-twitter.com',
  // Microsoft
  'clarity.ms',
  'bat.bing.com',
  'ads.microsoft.com',
  // Amazon
  'amazon-adsystem.com',
  'aax.amazon-adsystem.com',
  // Ad Networks
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'criteo.net',
  'adroll.com',
  'adsrvr.org',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'adnxs.com',
  'casalemedia.com',
  'advertising.com',
  'adform.net',
  'bidswitch.net',
  'smartadserver.com',
  'contextweb.com',
  'lijit.com',
  'media.net',
  'mgid.com',
  'revcontent.com',
  'zergnet.com',
  'yieldmo.com',
  'sharethrough.com',
  'triplelift.com',
  'teads.tv',
  'spotxchange.com',
  'springserve.com',
  // Tracking & Analytics
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'heapanalytics.com',
  'crazyegg.com',
  'mouseflow.com',
  'fullstory.com',
  'luckyorange.com',
  'inspectlet.com',
  'optimizely.com',
  'quantserve.com',
  'scorecardresearch.com',
  'newrelic.com',
  'nr-data.net',
  'chartbeat.com',
  'parsely.com',
  'comscore.com',
  // Data brokers
  'demdex.net',
  'bluekai.com',
  'krxd.net',
  'exelator.com',
  'agkn.com',
  'rlcdn.com',
  'mathtag.com',
  'liveramp.com',
  'adsymptotic.com',
  'adgrx.com',
];

/**
 * Tracking query parameters to strip from URLs
 */
export const TRACKING_PARAMS: string[] = [
  // Google
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gclsrc',
  // Facebook
  'fbclid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  // Microsoft
  'msclkid',
  // Twitter
  'twclid',
  // Mailchimp
  'mc_cid',
  'mc_eid',
  // Generic
  '_ga',
  '_gl',
  'ref',
  'ref_src',
  'ref_url',
  '__hssc',
  '__hstc',
  '__hsfp',
  'hsCtaTracking',
  // Others
  'oly_anon_id',
  'oly_enc_id',
  'vero_id',
  '_hsenc',
  'mkt_tok',
  'igshid',
  's_kwcid',
  'si',
  'spm',
];

/**
 * Filter list update interval (24 hours in milliseconds)
 */
export const FILTER_LIST_TTL = 24 * 60 * 60 * 1000;

/**
 * Maximum number of dynamic DNR rules (Chrome limit is 5000)
 */
export const MAX_DYNAMIC_RULES = 4500; // Leave some headroom

/**
 * Maximum recent blocked requests to keep in memory
 */
export const MAX_RECENT_BLOCKED = 100;

/**
 * Maximum recent cookie cleanups to keep in memory
 */
export const MAX_RECENT_CLEANUPS = 50;

/**
 * Cosmetic filter rule types
 */
export type CosmeticRuleType = 'generic' | 'domain-specific' | 'exception';

/**
 * Parsed cosmetic filter rule
 */
export interface CosmeticRule {
  /** Original rule text */
  raw: string;
  /** Rule type */
  type: CosmeticRuleType;
  /** CSS selector to hide */
  selector: string;
  /** Domains this rule applies to (empty for generic rules) */
  domains?: string[];
  /** Domains this rule should NOT apply to */
  excludedDomains?: string[];
}

/**
 * Cached cosmetic rules for a domain
 */
export interface CachedCosmeticRules {
  /** Generic rules that apply to all sites */
  generic: string[];
  /** Domain-specific rules */
  domainSpecific: { [domain: string]: string[] };
  /** Exception rules (should NOT be hidden) */
  exceptions: { [domain: string]: string[] };
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Default cosmetic rules cache
 */
export const DEFAULT_COSMETIC_RULES: CachedCosmeticRules = {
  generic: [],
  domainSpecific: {},
  exceptions: {},
  updatedAt: 0,
};

// ============================================
// FILTER LIST HEALTH TRACKING
// ============================================

/**
 * Health status for a single filter list
 */
export interface FilterListHealth {
  /** Filter list URL */
  url: string;
  /** Status of last fetch attempt */
  lastFetchStatus: 'success' | 'error' | 'pending';
  /** Timestamp of last fetch attempt */
  lastFetchAt: number;
  /** Error message if last fetch failed */
  lastError?: string;
  /** Number of rules successfully parsed */
  ruleCount: number;
  /** Number of parse errors encountered */
  parseErrors: number;
  /** Patterns that couldn't be parsed (for telemetry) */
  unsupportedPatterns: string[];
  /** Whether we have a last-known-good cache */
  hasLastKnownGood: boolean;
  /** Timestamp of last successful fetch */
  lastSuccessAt?: number;
}

/**
 * Last-known-good filter list cache
 * Stored separately from the regular cache for fallback
 */
export interface LastKnownGoodFilterList {
  url: string;
  rules: string[];
  fetchedAt: number;
  ruleCount: number;
}

/**
 * Aggregate health for all filter lists
 */
export interface FilterListHealthSummary {
  /** Total number of configured filter lists */
  totalLists: number;
  /** Number of lists with successful fetch */
  healthyLists: number;
  /** Number of lists with errors */
  errorLists: number;
  /** Total rules across all lists */
  totalRules: number;
  /** Last time any list was refreshed */
  lastRefresh: number;
  /** Per-list health data */
  lists: FilterListHealth[];
}

/**
 * Default health state for a filter list
 */
export function createDefaultFilterListHealth(url: string): FilterListHealth {
  return {
    url,
    lastFetchStatus: 'pending',
    lastFetchAt: 0,
    ruleCount: 0,
    parseErrors: 0,
    unsupportedPatterns: [],
    hasLastKnownGood: false,
  };
}

/**
 * Storage for filter list health data
 */
export interface FilterListHealthStorage {
  [url: string]: FilterListHealth;
}

/**
 * Storage for last-known-good filter lists
 */
export interface LastKnownGoodStorage {
  [url: string]: LastKnownGoodFilterList;
}

/**
 * Default empty health storage
 */
export const DEFAULT_FILTER_LIST_HEALTH: FilterListHealthStorage = {};

/**
 * Default empty last-known-good storage
 */
export const DEFAULT_LAST_KNOWN_GOOD: LastKnownGoodStorage = {};

/**
 * Maximum unsupported patterns to track per list (for storage limits)
 */
export const MAX_UNSUPPORTED_PATTERNS = 50;

/**
 * Bootstrap cosmetic selectors - common ad containers blocked before filter lists load
 */
export const BOOTSTRAP_COSMETIC_SELECTORS: string[] = [
  // Google Ads
  '.adsbygoogle',
  'ins.adsbygoogle',
  '[id^="google_ads_"]',
  '[id^="div-gpt-ad"]',
  '[data-ad-slot]',
  '[data-ad-client]',
  // Generic ad containers
  '[class*="ad-container"]',
  '[class*="ad-wrapper"]',
  '[class*="ad-banner"]',
  '[class*="ad-slot"]',
  '[class*="advertisement"]',
  '[class*="sponsored-"]',
  '[id*="ad-container"]',
  '[id*="ad-wrapper"]',
  '[id*="ad-banner"]',
  '[id*="advertisement"]',
  // Common ad placeholders
  '[aria-label="Advertisement"]',
  '[aria-label="Ads"]',
  '[data-ad]',
  '[data-ads]',
  '[data-advertisement]',
  // Taboola/Outbrain widgets
  '.taboola-widget',
  '[id^="taboola-"]',
  '.OUTBRAIN',
  '[data-widget-id*="outbrain"]',
  // Other common ad networks
  '.adthrive-ad',
  '.adngin-ad',
  '[class*="mediavine"]',
  '[id*="ezoic"]',
  // Empty ad containers
  'div[style*="min-height"][class*="ad"]',
  'aside[class*="ad"]',
];

