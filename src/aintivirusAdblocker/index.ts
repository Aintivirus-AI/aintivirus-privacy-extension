import { registerInjectables, unregisterAllInjectables } from './scripting-manager';

export const MODE_NONE = 0;
export const MODE_BASIC = 1;
export const MODE_OPTIMAL = 2;
export const MODE_COMPLETE = 3;

export type FilteringMode =
  | typeof MODE_NONE
  | typeof MODE_BASIC
  | typeof MODE_OPTIMAL
  | typeof MODE_COMPLETE;

const STORAGE_KEYS = {
  RULESET_CONFIG: 'adblocker_rulesetConfig',
  FILTERING_MODE_DETAILS: 'adblocker_filteringModeDetails',
  ALLOWLIST: 'adblocker_allowlist',
  DEBUG: 'adblocker_debug',
} as const;

const ALLOWLIST_RULE_BASE_ID = 10000000;
const TRUSTED_DIRECTIVE_BASE_RULE_ID = 8000000;
const TRUSTED_DIRECTIVE_PRIORITY = 2000000;
const INTERNAL_API_RULE_BASE_ID = 9000000;

// API domains that should never be blocked (for extension functionality)
const INTERNAL_API_ALLOWLIST = [
  'quote-api.jup.ag',
  'api.jup.ag',
  'tokens.jup.ag',
  'price.jup.ag',
  'api.coingecko.com',
  'api.dexscreener.com',
  'mainnet.helius-rpc.com',
  'devnet.helius-rpc.com',
  'rpc.ankr.com',
];

export const DEFAULT_RULESETS = [
  'ublock-filters',
  'ublock-experimental',
  'easylist',
  'easyprivacy',
  'pgl',
  'ublock-badware',
  'urlhaus-full',
  'annoyances-overlays',
  'annoyances-others',
] as const;

export const ALL_RULESETS = [
  'ublock-filters',
  'easylist',
  'easyprivacy',
  'pgl',
  'ublock-badware',
  'urlhaus-full',
  'annoyances-overlays',
  'adguard-mobile',
  'block-lan',
  'dpollock-0',
  'adguard-spyware-url',
  'annoyances-cookies',
  'annoyances-social',
  'annoyances-widgets',
  'annoyances-others',
  'annoyances-notifications',
  'ublock-experimental',
  'stevenblack-hosts',
] as const;

export type RulesetId = (typeof ALL_RULESETS)[number];

interface RulesetConfig {
  version: string;
  enabledRulesets: string[];
  autoReload: boolean;
  showBlockedCount: boolean;
  strictBlockMode: boolean;
  developerMode: boolean;
  enabled: boolean;
}

interface FilteringModeDetails {
  none: Set<string>;
  basic: Set<string>;
  optimal: Set<string>;
  complete: Set<string>;
}

const defaultRulesetConfig: RulesetConfig = {
  version: '',
  enabledRulesets: [...DEFAULT_RULESETS],
  autoReload: true,
  showBlockedCount: false,
  strictBlockMode: false,
  developerMode: false,
  enabled: true,
};

const defaultFilteringModes: FilteringModeDetails = {
  none: new Set(),
  basic: new Set(),
  optimal: new Set(),
  complete: new Set(['all-urls']),
};

let rulesetConfigCache: RulesetConfig | null = null;
let filteringModesCache: FilteringModeDetails | null = null;
let debugEnabled = false;

function adblockerLog(...args: unknown[]): void {
  if (debugEnabled) {
  }
}

function adblockerDebug(...args: unknown[]): void {
  if (debugEnabled) {
  }
}

async function localRead<T>(key: string): Promise<T | undefined> {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key];
  } catch {
    return undefined;
  }
}

async function localWrite(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

async function sessionRead<T>(key: string): Promise<T | undefined> {
  try {
    const result = await chrome.storage.session.get(key);
    return result[key];
  } catch {
    return undefined;
  }
}

async function sessionWrite(key: string, value: unknown): Promise<void> {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch {}
}

export async function loadRulesetConfig(): Promise<RulesetConfig> {
  if (rulesetConfigCache) {
    return rulesetConfigCache;
  }

  let config = await sessionRead<RulesetConfig>(STORAGE_KEYS.RULESET_CONFIG);
  if (config) {
    rulesetConfigCache = config;
    return config;
  }

  config = await localRead<RulesetConfig>(STORAGE_KEYS.RULESET_CONFIG);
  if (config) {
    rulesetConfigCache = { ...defaultRulesetConfig, ...config };
    await sessionWrite(STORAGE_KEYS.RULESET_CONFIG, rulesetConfigCache);
    return rulesetConfigCache;
  }

  rulesetConfigCache = { ...defaultRulesetConfig };
  await localWrite(STORAGE_KEYS.RULESET_CONFIG, rulesetConfigCache);
  await sessionWrite(STORAGE_KEYS.RULESET_CONFIG, rulesetConfigCache);
  return rulesetConfigCache;
}

export async function saveRulesetConfig(config?: Partial<RulesetConfig>): Promise<void> {
  const current = await loadRulesetConfig();
  const updated = { ...current, ...config };
  rulesetConfigCache = updated;
  await localWrite(STORAGE_KEYS.RULESET_CONFIG, updated);
  await sessionWrite(STORAGE_KEYS.RULESET_CONFIG, updated);
  adblockerLog('Config saved:', updated);
}

function serializeFilteringModes(details: FilteringModeDetails): Record<string, string[]> {
  return {
    none: Array.from(details.none),
    basic: Array.from(details.basic),
    optimal: Array.from(details.optimal),
    complete: Array.from(details.complete),
  };
}

function deserializeFilteringModes(data: Record<string, string[]>): FilteringModeDetails {
  return {
    none: new Set(data.none || []),
    basic: new Set(data.basic || []),
    optimal: new Set(data.optimal || []),
    complete: new Set(data.complete || []),
  };
}

export async function getFilteringModeDetails(): Promise<FilteringModeDetails> {
  if (filteringModesCache) {
    return filteringModesCache;
  }

  const data = await localRead<Record<string, string[]>>(STORAGE_KEYS.FILTERING_MODE_DETAILS);
  if (data) {
    filteringModesCache = deserializeFilteringModes(data);
  } else {
    filteringModesCache = {
      none: new Set(defaultFilteringModes.none),
      basic: new Set(defaultFilteringModes.basic),
      optimal: new Set(defaultFilteringModes.optimal),
      complete: new Set(defaultFilteringModes.complete),
    };
  }
  return filteringModesCache;
}

async function saveFilteringModeDetails(details: FilteringModeDetails): Promise<void> {
  filteringModesCache = details;
  await localWrite(STORAGE_KEYS.FILTERING_MODE_DETAILS, serializeFilteringModes(details));
}

function lookupFilteringMode(modes: FilteringModeDetails, hostname: string): FilteringMode {
  if (hostname === 'all-urls') {
    if (modes.none.has('all-urls')) return MODE_NONE;
    if (modes.basic.has('all-urls')) return MODE_BASIC;
    if (modes.optimal.has('all-urls')) return MODE_OPTIMAL;
    if (modes.complete.has('all-urls')) return MODE_COMPLETE;
    return MODE_BASIC;
  }

  if (modes.none.has(hostname)) return MODE_NONE;
  if (modes.basic.has(hostname)) return MODE_BASIC;
  if (modes.optimal.has(hostname)) return MODE_OPTIMAL;
  if (modes.complete.has(hostname)) return MODE_COMPLETE;

  for (const hn of modes.none) {
    if (hn !== 'all-urls' && hostname.endsWith(`.${hn}`)) return MODE_NONE;
  }
  for (const hn of modes.basic) {
    if (hn !== 'all-urls' && hostname.endsWith(`.${hn}`)) return MODE_BASIC;
  }
  for (const hn of modes.optimal) {
    if (hn !== 'all-urls' && hostname.endsWith(`.${hn}`)) return MODE_OPTIMAL;
  }
  for (const hn of modes.complete) {
    if (hn !== 'all-urls' && hostname.endsWith(`.${hn}`)) return MODE_COMPLETE;
  }

  return lookupFilteringMode(modes, 'all-urls');
}

export async function getFilteringMode(hostname: string): Promise<FilteringMode> {
  const modes = await getFilteringModeDetails();
  return lookupFilteringMode(modes, hostname);
}

export async function getDefaultFilteringMode(): Promise<FilteringMode> {
  return getFilteringMode('all-urls');
}

export async function setFilteringMode(
  hostname: string,
  mode: FilteringMode,
): Promise<FilteringMode> {
  const modes = await getFilteringModeDetails();

  modes.none.delete(hostname);
  modes.basic.delete(hostname);
  modes.optimal.delete(hostname);
  modes.complete.delete(hostname);

  switch (mode) {
    case MODE_NONE:
      modes.none.add(hostname);
      break;
    case MODE_BASIC:
      modes.basic.add(hostname);
      break;
    case MODE_OPTIMAL:
      modes.optimal.add(hostname);
      break;
    case MODE_COMPLETE:
      modes.complete.add(hostname);
      break;
  }

  await saveFilteringModeDetails(modes);
  await updateTrustedDirectiveRules(modes);
  await registerInjectables();

  return mode;
}

export async function setDefaultFilteringMode(mode: FilteringMode): Promise<FilteringMode> {
  return setFilteringMode('all-urls', mode);
}

async function updateTrustedDirectiveRules(modes: FilteringModeDetails): Promise<void> {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const trustedRules = existingRules.filter(
      (rule) => rule.id >= TRUSTED_DIRECTIVE_BASE_RULE_ID && rule.id < ALLOWLIST_RULE_BASE_ID,
    );
    const removeRuleIds = trustedRules.map((rule) => rule.id);

    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    const noneHostnames = Array.from(modes.none).filter((h) => h !== 'all-urls');

    if (modes.none.has('all-urls')) {
      const excludedDomains = [
        ...Array.from(modes.basic),
        ...Array.from(modes.optimal),
        ...Array.from(modes.complete),
      ].filter((h) => h !== 'all-urls');

      if (excludedDomains.length > 0) {
        addRules.push({
          id: TRUSTED_DIRECTIVE_BASE_RULE_ID,
          priority: TRUSTED_DIRECTIVE_PRIORITY,
          action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
          condition: {
            excludedRequestDomains: excludedDomains,
            resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
          },
        });
      } else {
        addRules.push({
          id: TRUSTED_DIRECTIVE_BASE_RULE_ID,
          priority: TRUSTED_DIRECTIVE_PRIORITY,
          action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
          condition: {
            resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
          },
        });
      }
    } else if (noneHostnames.length > 0) {
      addRules.push({
        id: TRUSTED_DIRECTIVE_BASE_RULE_ID,
        priority: TRUSTED_DIRECTIVE_PRIORITY,
        action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          requestDomains: noneHostnames,
          resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
        },
      });
    }

    if (removeRuleIds.length > 0 || addRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules,
      });
      adblockerLog('Updated trusted directive rules');
    }
  } catch (error) {}
}

export async function updateAllowlistRules(allowlist: string[]): Promise<void> {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const allowlistRules = existingRules.filter(
      (rule) => rule.id >= ALLOWLIST_RULE_BASE_ID && rule.id < ALLOWLIST_RULE_BASE_ID + 10000,
    );
    const removeRuleIds = allowlistRules.map((rule) => rule.id);

    const addRules: chrome.declarativeNetRequest.Rule[] = [];

    if (allowlist.length > 0) {
      addRules.push({
        id: ALLOWLIST_RULE_BASE_ID,
        priority: TRUSTED_DIRECTIVE_PRIORITY + 1000,
        action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          requestDomains: allowlist,
          resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
        },
      });

      addRules.push({
        id: ALLOWLIST_RULE_BASE_ID + 1,
        priority: TRUSTED_DIRECTIVE_PRIORITY + 1000,
        action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          initiatorDomains: allowlist,
        },
      });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });

    adblockerLog('Allowlist rules updated:', allowlist);
  } catch (error) {}
}

/**
 * Set up rules to allow internal API requests (Jupiter, CoinGecko, etc.)
 * These are essential for wallet functionality and should never be blocked
 */
export async function setupInternalApiAllowlist(): Promise<void> {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const internalApiRules = existingRules.filter(
      (rule) => rule.id >= INTERNAL_API_RULE_BASE_ID && rule.id < INTERNAL_API_RULE_BASE_ID + 100,
    );
    const removeRuleIds = internalApiRules.map((rule) => rule.id);

    // IMPORTANT: In Manifest V3, declarativeNetRequest rules DO NOT affect
    // requests made by the extension's own service worker (background script).
    // These rules only affect requests from web pages.
    // Service worker fetch() should work without these rules.
    //
    // However, we still create these rules to allow web page requests to these APIs
    // (e.g., if a dApp page tries to fetch from Jupiter directly)
    const addRules: chrome.declarativeNetRequest.Rule[] = [
      {
        id: INTERNAL_API_RULE_BASE_ID,
        priority: TRUSTED_DIRECTIVE_PRIORITY + 2000, // Highest priority
        action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          requestDomains: INTERNAL_API_ALLOWLIST,
        },
      },
    ];

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });
  } catch (error) {
    // Silently fail - allowlist is optional
  }
}

export async function enableRulesets(rulesetIds: string[]): Promise<void> {
  try {
    const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();

    const validRulesets = rulesetIds.filter((id) => ALL_RULESETS.includes(id as RulesetId));

    const toEnable = validRulesets.filter((id) => !currentlyEnabled.includes(id));
    const toDisable = currentlyEnabled.filter(
      (id) => ALL_RULESETS.includes(id as RulesetId) && !validRulesets.includes(id),
    );

    if (toEnable.length > 0 || toDisable.length > 0) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: toEnable,
        disableRulesetIds: toDisable,
      });
      adblockerLog('Updated rulesets - enabled:', toEnable, 'disabled:', toDisable);
    }

    await saveRulesetConfig({ enabledRulesets: validRulesets });
  } catch (error) {}
}

export async function disableAllRulesets(): Promise<void> {
  try {
    const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    const adblockerRulesets = currentlyEnabled.filter((id) =>
      ALL_RULESETS.includes(id as RulesetId),
    );

    if (adblockerRulesets.length > 0) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: adblockerRulesets,
      });
      adblockerLog('Disabled all Aintivirus Adblocker rulesets');
    }

    await saveRulesetConfig({ enabledRulesets: [] });
  } catch (error) {}
}

export async function getEnabledRulesets(): Promise<string[]> {
  const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
  return enabled.filter((id) => ALL_RULESETS.includes(id as RulesetId));
}

export async function setAdBlockEnabled(enabled: boolean): Promise<void> {
  adblockerLog('Setting ad blocking:', enabled ? 'enabled' : 'disabled');

  const config = await loadRulesetConfig();

  if (enabled) {
    const rulesetsToEnable =
      config.enabledRulesets.length > 0 ? config.enabledRulesets : [...DEFAULT_RULESETS];
    await enableRulesets(rulesetsToEnable);

    await registerInjectables();
  } else {
    await disableAllRulesets();

    await unregisterAllInjectables();
  }

  await saveRulesetConfig({ enabled });
}

export async function isAdBlockEnabled(): Promise<boolean> {
  const config = await loadRulesetConfig();
  return config.enabled;
}

export async function addToAllowlist(domain: string): Promise<void> {
  const allowlist = (await localRead<string[]>(STORAGE_KEYS.ALLOWLIST)) || [];
  if (!allowlist.includes(domain)) {
    allowlist.push(domain);
    await localWrite(STORAGE_KEYS.ALLOWLIST, allowlist);
    await updateAllowlistRules(allowlist);
    adblockerLog('Added to allowlist:', domain);
  }
}

export async function removeFromAllowlist(domain: string): Promise<void> {
  const allowlist = (await localRead<string[]>(STORAGE_KEYS.ALLOWLIST)) || [];
  const index = allowlist.indexOf(domain);
  if (index !== -1) {
    allowlist.splice(index, 1);
    await localWrite(STORAGE_KEYS.ALLOWLIST, allowlist);
    await updateAllowlistRules(allowlist);
    adblockerLog('Removed from allowlist:', domain);
  }
}

export async function isDomainAllowlisted(domain: string): Promise<boolean> {
  const allowlist = (await localRead<string[]>(STORAGE_KEYS.ALLOWLIST)) || [];

  if (allowlist.includes(domain)) {
    return true;
  }

  for (const allowed of allowlist) {
    if (domain.endsWith(`.${allowed}`)) {
      return true;
    }
  }

  return false;
}

export async function getAllowlist(): Promise<string[]> {
  return (await localRead<string[]>(STORAGE_KEYS.ALLOWLIST)) || [];
}

export async function initializeAdblocker(): Promise<void> {
  adblockerLog('Initializing Aintivirus Adblocker integration...');

  const config = await loadRulesetConfig();
  debugEnabled = (await localRead<boolean>(STORAGE_KEYS.DEBUG)) || false;

  adblockerLog('Config loaded:', config);

  if (config.enabled) {
    const rulesetsToEnable =
      config.enabledRulesets.length > 0 ? config.enabledRulesets : [...DEFAULT_RULESETS];
    await enableRulesets(rulesetsToEnable);

    const modes = await getFilteringModeDetails();
    await updateTrustedDirectiveRules(modes);

    const allowlist = await getAllowlist();
    await updateAllowlistRules(allowlist);

    await registerInjectables();
  } else {
    adblockerLog('Ad blocking is disabled, skipping initialization');
  }

  adblockerLog('Aintivirus Adblocker initialization complete');
}

export async function reconcileAdblockerState(): Promise<void> {
  adblockerLog('Reconciling Aintivirus Adblocker state...');

  const config = await loadRulesetConfig();

  if (config.enabled) {
    const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    const expectedRulesets =
      config.enabledRulesets.length > 0 ? config.enabledRulesets : [...DEFAULT_RULESETS];

    const needsUpdate =
      currentlyEnabled.length !== expectedRulesets.length ||
      !expectedRulesets.every((id) => currentlyEnabled.includes(id));

    if (needsUpdate) {
      await enableRulesets(expectedRulesets);
    }

    await registerInjectables();
  } else {
    await disableAllRulesets();
    await unregisterAllInjectables();
  }

  adblockerLog('Aintivirus Adblocker state reconciled');
}

export async function getAdblockerStats(): Promise<{
  enabled: boolean;
  enabledRulesets: string[];
  allowlist: string[];
  availableStaticRuleCount: number;
  dynamicRuleCount: number;
  defaultFilteringMode: FilteringMode;
}> {
  const config = await loadRulesetConfig();
  const allowlist = await getAllowlist();
  const defaultMode = await getDefaultFilteringMode();

  let availableStaticRuleCount = 0;
  let dynamicRuleCount = 0;

  try {
    availableStaticRuleCount = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    dynamicRuleCount = dynamicRules.length;
  } catch {}

  return {
    enabled: config.enabled,
    enabledRulesets: config.enabledRulesets,
    allowlist,
    availableStaticRuleCount,
    dynamicRuleCount,
    defaultFilteringMode: defaultMode,
  };
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes[STORAGE_KEYS.DEBUG]) {
    debugEnabled = changes[STORAGE_KEYS.DEBUG].newValue ?? false;
  }

  if (changes[STORAGE_KEYS.ALLOWLIST]) {
    const newAllowlist = changes[STORAGE_KEYS.ALLOWLIST].newValue ?? [];
    adblockerLog('Detected allowlist change:', newAllowlist);
    updateAllowlistRules(newAllowlist);
  }
});

export { registerInjectables, unregisterAllInjectables };
