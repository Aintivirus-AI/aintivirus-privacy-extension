

import { storage } from '@shared/storage';
import { FilteringLevel } from '@shared/types';
import { PrivacySettings, DEFAULT_PRIVACY_SETTINGS } from './types';
import { 
  initializeCookieManager, 
  shutdownCookieManager,
  getCookieStats,
} from './cookieManager';
import { 
  initializeHeaderRules, 
  updateHeaderRules,
  removeHeaderRules,
  getHeaderRuleStatus,
} from './headerRules';
import { 
  initializeMetrics, 
  shutdownMetrics,
  getMetrics,
  getMetricsSummary,
  updateActiveRuleCount,
  updateFilterListCount,
  logScriptIntercepted,
  logRequestModified,
} from './metrics';
export { updateActiveRuleCount } from './metrics';
import {
  initializeBlockCountTracker,
  shutdownBlockCountTracker,
  getTabBlockCount,
  getTotalBlockCount,
} from './blockCountTracker';
import { 
  getSiteMode, 
  setSiteMode, 
  getAllSiteSettings,
  syncSiteExceptions,
} from './siteSettings';
import { 
  getFilterListStats,
} from './filterListManager';


import {
  initializeAdblocker,
  reconcileAdblockerState,
  setAdBlockEnabled as setAdblockerEnabled,
  isAdBlockEnabled as isAdblockerEnabled,
  getAdblockerStats,
  addToAllowlist,
  removeFromAllowlist,
  isDomainAllowlisted,
  getAllowlist,
  enableRulesets,
  disableAllRulesets,
  getEnabledRulesets,
  setFilteringMode,
  getFilteringMode,
  setDefaultFilteringMode,
  getDefaultFilteringMode,
  setupInternalApiAllowlist,
  MODE_NONE,
  MODE_BASIC,
  MODE_OPTIMAL,
  MODE_COMPLETE,
  DEFAULT_RULESETS,
  ALL_RULESETS,
} from '../aintivirusAdblocker';


let isInitialized = false;
let isEnabled = false;


async function updateActiveRules(): Promise<void> {
  try {
    
    const availableCount = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
    
    
    const TOTAL_STATIC_RULE_BUDGET = 330000;
    const activeRules = TOTAL_STATIC_RULE_BUDGET - availableCount;
    
    updateActiveRuleCount(activeRules);

  } catch (error) {

    
    const enabledRulesets = await getEnabledRulesets();
    updateActiveRuleCount(enabledRulesets.length * 10000); 
  }
}


export async function initializePrivacyEngine(): Promise<void> {
  if (isInitialized) {

    return;
  }

  try {
    
    await initializeMetrics();
    
    
    initializeBlockCountTracker();
    
    // Always set up internal API allowlist first (essential for wallet functionality)
    // This must run regardless of ad blocker settings to allow Jupiter, CoinGecko, etc.
    await setupInternalApiAllowlist();
    
    
    const settings = await getPrivacySettings();
    isEnabled = settings.enabled;
    const adBlockerEnabled = settings.adBlockerEnabled ?? true;
    
    
    if (adBlockerEnabled) {

      await initializeAdblocker();
    } else {

      await disableAllRulesets();
    }
    
    
    const enabledRulesets = await getEnabledRulesets();

    
    await updateActiveRules();
    
    
    if (isEnabled) {
      await enablePrivacyProtectionFeatures();
    }
    
    
    setupStorageListener();
    
    isInitialized = true;

  } catch (error) {

    throw error;
  }
}


export async function shutdownPrivacyEngine(): Promise<void> {

  if (isEnabled) {
    await disablePrivacyProtection();
  }
  
  shutdownBlockCountTracker();
  await shutdownMetrics();
  
  isInitialized = false;
  isEnabled = false;

}


async function enablePrivacyProtectionFeatures(): Promise<void> {

  
  try {
    await syncSiteExceptions();
  } catch (error) {

  }
  
  
  try {
    initializeCookieManager();
  } catch (error) {

  }
  
  
  try {
    await initializeHeaderRules();
  } catch (error) {

  }

}


async function disablePrivacyProtection(): Promise<void> {

  try {
    
    shutdownCookieManager();
    
    
    await removeHeaderRules();

  } catch (error) {

    throw error;
  }
}


export async function togglePrivacyProtection(enabled: boolean): Promise<void> {
  const settings = await getPrivacySettings();
  settings.enabled = enabled;
  await setPrivacySettings(settings);
  
  if (enabled && !isEnabled) {
    await enablePrivacyProtectionFeatures();
    isEnabled = true;
  } else if (!enabled && isEnabled) {
    await disablePrivacyProtection();
    isEnabled = false;
  }
}


export async function toggleAdBlocker(enabled: boolean): Promise<void> {


  const settings = await getPrivacySettings();
  settings.adBlockerEnabled = enabled;
  await setPrivacySettings(settings);
  
  
  await setAdblockerEnabled(enabled);
  
  
  await updateActiveRules();
  
  
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'AD_BLOCKER_TOGGLED',
          payload: { enabled },
        }).catch(() => {
          
        });
      }
    }
  } catch (error) {

  }

}


export async function getAdBlockerStatus(): Promise<boolean> {
  return isAdblockerEnabled();
}


export async function getPrivacySettings(): Promise<PrivacySettings> {
  const settings = await storage.get('privacySettings');
  return settings || DEFAULT_PRIVACY_SETTINGS;
}


export async function setPrivacySettings(
  settings: Partial<PrivacySettings>
): Promise<void> {
  const current = await getPrivacySettings();
  const updated = { ...current, ...settings };
  await storage.set('privacySettings', updated);
  
  
  if (isEnabled) {
    if (
      settings.headerMinimization !== undefined ||
      settings.sendGPC !== undefined ||
      settings.stripTrackingParams !== undefined
    ) {
      await updateHeaderRules();
    }
  }
}


function setupStorageListener(): void {
  storage.onChange(async (changes) => {
    
    if (changes.privacySettings?.newValue) {
      const newSettings = changes.privacySettings.newValue;
      const oldSettings = changes.privacySettings.oldValue;
      
      
      if (newSettings.enabled !== oldSettings?.enabled) {
        if (newSettings.enabled && !isEnabled) {
          await enablePrivacyProtectionFeatures();
          isEnabled = true;
        } else if (!newSettings.enabled && isEnabled) {
          await disablePrivacyProtection();
          isEnabled = false;
        }
      }
    }
    
    
    if (changes.featureFlags?.newValue) {
      const privacyEnabled = changes.featureFlags.newValue.privacy;
      const wasEnabled = changes.featureFlags.oldValue?.privacy;
      
      if (privacyEnabled !== wasEnabled) {
        const settings = await getPrivacySettings();
        if (settings.enabled !== privacyEnabled) {
          await togglePrivacyProtection(privacyEnabled);
        }
      }
    }
  });
}


export async function refreshFilterLists(force = false): Promise<void> {
  if (!isEnabled) {

    return;
  }
  
  
  await reconcileAdblockerState();
  
  const stats = await getAdblockerStats();
  updateActiveRuleCount(stats.enabledRulesets.length);

}


export async function checkAndRefreshFilterLists(): Promise<void> {
  if (!isEnabled) return;
  await reconcileAdblockerState();
}


export async function getPrivacyStatus(): Promise<{
  isEnabled: boolean;
  isInitialized: boolean;
  adBlockerEnabled: boolean;
  headerStatus: Awaited<ReturnType<typeof getHeaderRuleStatus>>;
  cookieStats: Awaited<ReturnType<typeof getCookieStats>>;
  filterStats: Awaited<ReturnType<typeof getFilterListStats>>;
  adblockerStats: Awaited<ReturnType<typeof getAdblockerStats>>;
  metrics: ReturnType<typeof getMetricsSummary>;
}> {
  return {
    isEnabled,
    isInitialized,
    adBlockerEnabled: await isAdblockerEnabled(),
    headerStatus: await getHeaderRuleStatus(),
    cookieStats: await getCookieStats(),
    filterStats: await getFilterListStats(),
    adblockerStats: await getAdblockerStats(),
    metrics: getMetricsSummary(),
  };
}


export const FILTERING_LEVEL_RULESETS: Record<FilteringLevel, readonly string[]> = {
  off: [],
  minimal: ['ublock-filters'],
  basic: ['ublock-filters', 'easylist'],
  optimal: DEFAULT_RULESETS,
  complete: ALL_RULESETS,
};


export async function setFilteringLevel(level: FilteringLevel): Promise<void> {

  const targetRulesets = FILTERING_LEVEL_RULESETS[level];
  
  if (level === 'off') {
    await disableAllRulesets();
    await setAdblockerEnabled(false);
  } else {
    await setAdblockerEnabled(true);
    await enableRulesets([...targetRulesets]);
  }
  
  
  await storage.set('filteringLevel', level);
  
  
  await updateActiveRules();

}


export async function getFilteringLevel(): Promise<FilteringLevel> {
  const level = await storage.get('filteringLevel');
  return level || 'optimal';
}


export async function getRulesetStats(): Promise<{
  enabledRulesets: string[];
  availableRulesets: string[];
  filteringLevel: FilteringLevel;
  dynamicRuleCount: number;
  availableStaticSlots: number;
}> {
  const adblockerStats = await getAdblockerStats();
  const filteringLevel = await getFilteringLevel();
  
  let availableSlots = 0;
  try {
    availableSlots = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
  } catch {
    
  }
  
  return {
    enabledRulesets: adblockerStats.enabledRulesets,
    availableRulesets: [...ALL_RULESETS],
    filteringLevel,
    dynamicRuleCount: adblockerStats.dynamicRuleCount,
    availableStaticSlots: availableSlots,
  };
}


export async function enableRuleset(rulesetId: string): Promise<void> {
  const current = await getEnabledRulesets();
  if (!current.includes(rulesetId)) {
    await enableRulesets([...current, rulesetId]);
    await updateActiveRules();
  }
}


export async function disableRuleset(rulesetId: string): Promise<void> {
  const current = await getEnabledRulesets();
  const filtered = current.filter(id => id !== rulesetId);
  await enableRulesets(filtered);
  await updateActiveRules();
}


export async function toggleRuleset(rulesetId: string): Promise<boolean> {
  const current = await getEnabledRulesets();
  const isCurrentlyEnabled = current.includes(rulesetId);
  
  if (isCurrentlyEnabled) {
    await disableRuleset(rulesetId);
    return false;
  } else {
    await enableRuleset(rulesetId);
    return true;
  }
}


export async function isRulesetEnabled(rulesetId: string): Promise<boolean> {
  const enabled = await getEnabledRulesets();
  return enabled.includes(rulesetId);
}


export async function resetRulesets(): Promise<void> {
  await setFilteringLevel('optimal');

}


export async function enableAllStaticRulesets(): Promise<void> {
  await enableRulesets([...DEFAULT_RULESETS]);
}


export async function disableAllStaticRulesets(): Promise<void> {
  await disableAllRulesets();
}


export async function handlePrivacyMessage(
  type: string,
  payload: unknown
): Promise<unknown> {
  switch (type) {
    case 'GET_PRIVACY_SETTINGS':
      return getPrivacySettings();
      
    case 'SET_PRIVACY_SETTINGS':
      await setPrivacySettings(payload as Partial<PrivacySettings>);
      return { success: true };
    
    case 'GET_AD_BLOCKER_STATUS':
      return getAdBlockerStatus();
      
    case 'SET_AD_BLOCKER_STATUS': {
      const { enabled } = payload as { enabled: boolean };
      await toggleAdBlocker(enabled);
      return { success: true };
    }
    
    case 'GET_FILTERING_LEVEL':
      return getFilteringLevel();
      
    case 'SET_FILTERING_LEVEL': {
      const { level } = payload as { level: FilteringLevel };
      await setFilteringLevel(level);
      return { success: true };
    }
    
    case 'GET_RULESET_STATS':
      return getRulesetStats();
      
    case 'GET_SITE_PRIVACY_MODE':
      return getSiteMode((payload as { domain: string }).domain);
      
    case 'SET_SITE_PRIVACY_MODE': {
      const { domain, mode } = payload as { domain: string; mode: 'normal' | 'strict' | 'disabled' };
      await setSiteMode(domain, mode);
      return { success: true };
    }
      
    case 'GET_PRIVACY_METRICS':
      return getMetrics();
      
    case 'GET_PRIVACY_STATUS':
      return getPrivacyStatus();
      
    case 'REFRESH_FILTER_LISTS':
      await refreshFilterLists(true);
      return { success: true };
      
    case 'GET_ALL_SITE_SETTINGS':
      return getAllSiteSettings();
      
    case 'GET_FILTER_LIST_STATS':
      return getFilterListStats();
      
    case 'GET_BLOCKED_REQUESTS':
      return getMetrics().recentBlocked;
    
    
    case 'ADD_TO_ALLOWLIST': {
      const { domain } = payload as { domain: string };
      await addToAllowlist(domain);
      return { success: true };
    }
    
    case 'REMOVE_FROM_ALLOWLIST': {
      const { domain } = payload as { domain: string };
      await removeFromAllowlist(domain);
      return { success: true };
    }
    
    case 'IS_DOMAIN_ALLOWLISTED': {
      const { domain } = payload as { domain: string };
      return isDomainAllowlisted(domain);
    }
    
    case 'GET_ALLOWLIST':
      return getAllowlist();
    
    case 'GET_COSMETIC_RULES': {
      
      
      return { selectors: [] };
    }
      
    default:
      throw new Error(`Unknown privacy message type: ${type}`);
  }
}


export { 
  getSiteMode, 
  setSiteMode,
  getAllSiteSettings,
} from './siteSettings';

export { 
  getMetrics, 
  getMetricsSummary,
  logScriptIntercepted,
  logRequestModified,
} from './metrics';

export {
  getTabBlockCount,
  getTotalBlockCount,
} from './blockCountTracker';

export {
  getFilterListStats,
} from './filterListManager';

export {
  getCookieStats,
  manualCleanupCookies,
} from './cookieManager';

export {
  getHeaderRuleStatus,
  toggleHeaderFeature,
} from './headerRules';

export {
  extractDomain,
  normalizeDomain,
  isSameDomain,
  matchesDomain,
} from './utils';

export {
  getSiteFixForDomain,
  hasSiteFix,
} from './siteFixes';


export {
  MODE_NONE,
  MODE_BASIC,
  MODE_OPTIMAL,
  MODE_COMPLETE,
  ALL_RULESETS,
  DEFAULT_RULESETS,
  addToAllowlist,
  removeFromAllowlist,
  isDomainAllowlisted,
  getAllowlist,
} from '../aintivirusAdblocker';

export type { FilteringMode, RulesetId } from '../aintivirusAdblocker';
export type { FilteringLevel } from '@shared/types';


export const ALL_ADBLOCKER_RULESETS = ALL_RULESETS;
export type StaticRulesetId = string;


export * from './types';
