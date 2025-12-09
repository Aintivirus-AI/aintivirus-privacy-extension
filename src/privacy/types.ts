

export type SitePrivacyMode = 'normal' | 'strict' | 'disabled';


export type FilteringLevel = 'off' | 'minimal' | 'basic' | 'optimal' | 'complete';


export interface PrivacySettings {
  
  enabled: boolean;
  
  adBlockerEnabled: boolean;
  
  filteringLevel: FilteringLevel;
  
  blockTrackers: boolean;
  
  cookieCleanup: boolean;
  
  defaultCookieMode: 'third-party' | 'all' | 'none';
  
  headerMinimization: boolean;
  
  stripTrackingParams: boolean;
  
  sendGPC: boolean;
  
  filterListUrls: string[];
  
  lastFilterUpdate: number | null;
}


export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  enabled: true,
  adBlockerEnabled: true,
  filteringLevel: 'optimal', 
  blockTrackers: true,
  cookieCleanup: true,
  defaultCookieMode: 'third-party',
  headerMinimization: true,
  stripTrackingParams: true,
  sendGPC: true,
  filterListUrls: [
    
    
  ],
  lastFilterUpdate: null,
};


export interface SitePrivacySettings {
  [domain: string]: SitePrivacyMode;
}


export interface CachedFilterList {
  url: string;
  rules: string[];
  fetchedAt: number;
  expiresAt: number;
}


export interface FilterListCache {
  [url: string]: CachedFilterList;
}


export interface ParsedFilterRule {
  
  raw: string;
  
  type: 'block' | 'allow';
  
  pattern: string;
  
  isDomainAnchored: boolean;
  
  resourceTypes: chrome.declarativeNetRequest.ResourceType[];
  
  domains?: string[];
  
  excludedDomains?: string[];
}


export interface PrivacyDNRRule extends chrome.declarativeNetRequest.Rule {
  
  sourceList?: string;
}


export interface BlockedRequest {
  
  tabId: number;
  
  url: string;
  
  domain: string;
  
  initiator: string | null;
  
  resourceType: string;
  
  ruleId: number;
  
  timestamp: number;
}


export interface CookieCleanupEntry {
  
  domain: string;
  
  count: number;
  
  mode: SitePrivacyMode;
  
  timestamp: number;
}


export interface PrivacyMetrics {
  
  totalBlockedRequests: number;
  
  blockedByDomain: { [domain: string]: number };
  
  totalCookiesDeleted: number;
  
  activeRuleCount: number;
  
  filterListCount: number;
  
  recentBlocked: BlockedRequest[];
  
  recentCookieCleanups: CookieCleanupEntry[];
  
  sessionStart: number;
  
  scriptsIntercepted: number;
  
  requestsModified: number;
}


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


export interface TabDomainMapping {
  [tabId: number]: {
    domain: string;
    url: string;
    thirdPartyDomains: Set<string>;
  };
}


export const BOOTSTRAP_TRACKER_DOMAINS: string[] = [
  
  'trackersimulator.org',
  'eviltracker.net',
  'do-not-tracker.org',
  'firstpartysimulator.org',
  'firstpartysimulator.net',
  
  
  'adblock-tester.com',
  'd3pkae9owd2lcf.cloudfront.net', 
  
  
  'sentry.io',
  'browser.sentry-cdn.com',
  'sentry-cdn.com',
  'ingest.sentry.io',
  'o0.ingest.sentry.io',
  'bugsnag.com',
  'd2wy8f7a9ursnm.cloudfront.net', 
  'sessions.bugsnag.com',
  'notify.bugsnag.com',
  'app.bugsnag.com',
  'api.bugsnag.com',
  'rollbar.com',
  'raygun.com',
  'trackjs.com',
  'logrocket.com',
  'logrocket.io',
  'lr-ingest.io',
  'lr-in.com',
  
  
  'mc.yandex.ru',
  'mc.yandex.com',
  'yandex.ru/metrika',
  'metrika.yandex.ru',
  'metrica.yandex.com',
  'watch.yandex.ru',
  'informer.yandex.ru',
  'webvisor.com',
  
  
  'google-analytics.com',
  'googleadservices.com',
  'googlesyndication.com',
  'doubleclick.net',
  'googletagmanager.com',
  'googletagservices.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'tpc.googlesyndication.com',
  'imasdk.googleapis.com', 
  
  'facebook.net',
  'facebook.com/tr',
  'connect.facebook.net',
  'pixel.facebook.com',
  'an.facebook.com',
  
  'analytics.twitter.com',
  't.co',
  'platform.twitter.com',
  'ads-twitter.com',
  
  'clarity.ms',
  'bat.bing.com',
  'ads.microsoft.com',
  
  'amazon-adsystem.com',
  'aax.amazon-adsystem.com',
  
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
  
  'serving-sys.com',
  'adserver.com',
  'adtechus.com',
  'atwola.com',
  'atdmt.com',
];


export const TRACKING_PARAMS: string[] = [
  
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gclsrc',
  
  'fbclid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  
  'msclkid',
  
  'twclid',
  
  'mc_cid',
  'mc_eid',
  
  '_ga',
  '_gl',
  'ref',
  'ref_src',
  'ref_url',
  '__hssc',
  '__hstc',
  '__hsfp',
  'hsCtaTracking',
  
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


export const FILTER_LIST_TTL = 24 * 60 * 60 * 1000;


export const BOOTSTRAP_URL_PATTERNS: string[] = [
  '*/ads/*',
  '*/adv/*',
  '*/advert/*',
  '*/advertisement/*',
  '*/banner/*',
  '*/banners/*',
  '*/sponsor/*',
  '*/sponsored/*',
  '*ad.gif',
  '*ad.jpg',
  '*ad.png',
  '*ad.webp',
  '*ads.gif',
  '*ads.jpg', 
  '*ads.png',
  '*banner.gif',
  '*banner.jpg',
  '*banner.png',
  '*_ad_*',
  '*-ad-*',
  '*/ad_*',
  '*/ad-*',
  '*_ads_*',
  '*-ads-*',
  '*_ad.*',
  '*-ad.*',
  '*.swf',
  '*flash*.swf',
  '*flash*.gif',
  '*flash*banner*',
  '*banner*.swf',
  '*/adserver/*',
  '*/adserve/*',
  '*/ad-server/*',
  '*/doubleclick/*',
  '*/pagead/*',
  '*/googleads/*',
  '*/pixel/*',
  '*/tracking/*',
  '*/tracker/*',
  '*/beacon/*',
  '*pixel.gif',
  '*pixel.png',
  '*spacer.gif',
  '*1x1.gif',
  '*clear.gif',
  '*/analytics.js',
  '*/ga.js',
  '*/gtag/*',
  '*/gtm.js',
  '*/ads.js',
  '*/tag.js',
  '*noop-sentry*',
  '*noop-bugsnag*',
  '*noop*.js',
  '*/metrika/*',
  '*/watch/*',
  '*mc.yandex*',
  '*metrica*',
  '*metrika*',
  '*tag.js*yandex*',
  '*/test/ad*',
  '*/test/banner*',
  '*/test/flash*',
  '*/test/gif*',
  '*/test/static*',
  '*/test/image*',
  '*adblock*test*ad*',
  '*tester*ad*',
  '*tester*banner*',
];


export const MAX_DYNAMIC_RULES = 4500; 


export const MAX_RECENT_BLOCKED = 50;


export const MAX_RECENT_CLEANUPS = 20;


export type CosmeticRuleType = 'generic' | 'domain-specific' | 'exception';


export interface CosmeticRule {
  
  raw: string;
  
  type: CosmeticRuleType;
  
  selector: string;
  
  domains?: string[];
  
  excludedDomains?: string[];
}


export interface CachedCosmeticRules {
  
  generic: string[];
  
  domainSpecific: { [domain: string]: string[] };
  
  exceptions: { [domain: string]: string[] };
  
  updatedAt: number;
}


export const DEFAULT_COSMETIC_RULES: CachedCosmeticRules = {
  generic: [],
  domainSpecific: {},
  exceptions: {},
  updatedAt: 0,
};


export interface FilterListHealth {
  
  url: string;
  
  lastFetchStatus: 'success' | 'error' | 'pending';
  
  lastFetchAt: number;
  
  lastError?: string;
  
  ruleCount: number;
  
  parseErrors: number;
  
  unsupportedPatterns: string[];
  
  hasLastKnownGood: boolean;
  
  lastSuccessAt?: number;
}


export interface LastKnownGoodFilterList {
  url: string;
  rules: string[];
  fetchedAt: number;
  ruleCount: number;
}


export interface FilterListHealthSummary {
  
  totalLists: number;
  
  healthyLists: number;
  
  errorLists: number;
  
  totalRules: number;
  
  lastRefresh: number;
  
  lists: FilterListHealth[];
}


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


export interface FilterListHealthStorage {
  [url: string]: FilterListHealth;
}


export interface LastKnownGoodStorage {
  [url: string]: LastKnownGoodFilterList;
}


export const DEFAULT_FILTER_LIST_HEALTH: FilterListHealthStorage = {};


export const DEFAULT_LAST_KNOWN_GOOD: LastKnownGoodStorage = {};


export const MAX_UNSUPPORTED_PATTERNS = 50;


export const BOOTSTRAP_COSMETIC_SELECTORS: string[] = [
  
  '.adsbygoogle',
  'ins.adsbygoogle',
  '[id^="google_ads_iframe"]',
  '[id^="div-gpt-ad"]',
  '[data-ad-slot]',
  '[data-ad-client]',
  '[data-google-query-id]',
  
  
  '.taboola-widget',
  '[id^="taboola-"]',
  '.OUTBRAIN',
  '[data-widget-id^="outbrain"]',
  '.adthrive-ad',
  '[id^="adthrive-"]',
  
  
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="doubleclick.net"]',
  'iframe[id^="google_ads_"]',
  
  
  '[aria-label="Advertisement"]',
  '[data-testid="ad"]',
  '[data-ad-unit]',
  
  
  'img[src*="/ads/"]',
  'img[src*="/adv/"]',
  'img[src*="/banner"]',
  'img[src*="banner."]',
  'img[src*="/adserver"]',
  'a[href*="doubleclick.net"] img',
  'a[href*="googleadservices.com"] img',
  
  
  'object[data*="ads"]',
  'embed[src*="ads"]',
  
  
  '.ad-img',
  '.ad-banner',
  '.banner-ad',
  '.ad-image',
  '#ad-image',
  '#ad-banner',
  '.advertisement-image',
  '.sponsored-banner',
  
  
  '#sentry-feedback',
  '.sentry-error-embed',
];


export const PROTECTED_SITES: string[] = [
  'twitter.com',
  'x.com',
  'youtube.com',
  'github.com',
  'google.com',
  'mail.google.com',
  'drive.google.com',
  'docs.google.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'reddit.com',
  'amazon.com',
  'ebay.com',
  'netflix.com',
  'twitch.tv',
  'discord.com',
  'slack.com',
  'notion.so',
  'figma.com',
];

