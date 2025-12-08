/**
 * AINTIVIRUS Privacy Engine
 * 
 * Main coordinator for the privacy and anti-tracking layer.
 * Initializes, coordinates, and exposes APIs for all privacy submodules.
 * 
 * Submodules:
 * - filterListManager: Fetches and caches filter lists
 * - ruleConverter: Converts filter rules to DNR format
 * - requestBlocker: Manages DNR blocking rules
 * - cookieManager: Auto-deletes cookies on tab close
 * - siteSettings: Per-site privacy configuration
 * - headerRules: Header minimization and GPC
 * - metrics: Logging and dashboard metrics
 */

import { storage } from '@shared/storage';
import { PrivacySettings, DEFAULT_PRIVACY_SETTINGS } from './types';
import { 
  initializeBlocker, 
  disableBlocker, 
  refreshBlockerRules,
  getBlockerStatus,
  addSiteException,
  removeSiteException,
  getActiveRuleCount,
} from './requestBlocker';
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
  getSiteMode, 
  setSiteMode, 
  getAllSiteSettings,
  syncSiteExceptions,
} from './siteSettings';
import { 
  getFilterListStats,
  fetchAllFilterLists,
  addFilterListUrl,
  removeFilterListUrl,
  needsFilterListRefresh,
  fetchAllCosmeticRules,
  getCosmeticRulesForDomain,
  getCachedCosmeticRules,
} from './filterListManager';
import {
  enableAllStaticRulesets,
  disableAllStaticRulesets,
} from './rulesetManager';

/** Privacy engine state */
let isInitialized = false;
let isEnabled = false;

/**
 * Initialize the privacy engine
 * Called from background script on extension startup
 */
export async function initializePrivacyEngine(): Promise<void> {
  if (isInitialized) {
    console.log('[Privacy] Engine already initialized');
    return;
  }
  
  console.log('[Privacy] Initializing privacy engine...');
  
  try {
    // Initialize metrics first (for logging other modules)
    await initializeMetrics();
    
    // Get settings
    const settings = await getPrivacySettings();
    isEnabled = settings.enabled;
    const adBlockerEnabled = settings.adBlockerEnabled ?? true; // Default to enabled
    
    // Initialize ad blocker based on its own setting (separate from privacy)
    if (adBlockerEnabled) {
      console.log('[Privacy] Ad blocker is enabled, initializing...');
      await enableAllStaticRulesets();
      await initializeBlocker();
    } else {
      console.log('[Privacy] Ad blocker is disabled');
      await disableAllStaticRulesets();
      updateActiveRuleCount(0);
    }
    
    // Initialize privacy protection features (cookie cleanup, headers, etc.)
    if (isEnabled) {
      await enablePrivacyProtectionFeatures();
    }
    
    // Set up storage listener for reactive updates
    setupStorageListener();
    
    isInitialized = true;
    console.log('[Privacy] Privacy engine initialized (privacy:', isEnabled, ', adBlocker:', adBlockerEnabled, ')');
    
  } catch (error) {
    console.error('[Privacy] Failed to initialize privacy engine:', error);
    throw error;
  }
}

/**
 * Shutdown the privacy engine
 */
export async function shutdownPrivacyEngine(): Promise<void> {
  console.log('[Privacy] Shutting down privacy engine...');
  
  if (isEnabled) {
    await disablePrivacyProtection();
  }
  
  await shutdownMetrics();
  
  isInitialized = false;
  isEnabled = false;
  
  console.log('[Privacy] Privacy engine shutdown complete');
}

/**
 * Enable privacy protection features (cookie cleanup, headers, fingerprinting)
 * Does NOT include ad blocker - that's handled separately
 */
async function enablePrivacyProtectionFeatures(): Promise<void> {
  console.log('[Privacy] Enabling privacy protection features...');
  
  // Sync site exceptions
  try {
    await syncSiteExceptions();
  } catch (error) {
    console.warn('[Privacy] Failed to sync site exceptions:', error);
  }
  
  // Initialize cookie manager (synchronous, shouldn't fail)
  try {
    initializeCookieManager();
  } catch (error) {
    console.warn('[Privacy] Failed to initialize cookie manager:', error);
  }
  
  // Initialize header rules
  try {
    await initializeHeaderRules();
  } catch (error) {
    console.warn('[Privacy] Failed to initialize header rules:', error);
  }
  
  // Initialize cosmetic rules (element hiding)
  try {
    await initializeCosmeticRules();
  } catch (error) {
    console.warn('[Privacy] Failed to initialize cosmetic rules:', error);
  }
  
  console.log('[Privacy] Privacy protection features enabled');
}

/**
 * Enable privacy protection (legacy - includes ad blocker)
 * Uses graceful degradation - if one component fails, others still initialize
 */
async function enablePrivacyProtection(): Promise<void> {
  console.log('[Privacy] Enabling privacy protection...');
  
  const errors: Error[] = [];
  
  // Initialize request blocker
  try {
    await initializeBlocker();
  } catch (error) {
    console.error('[Privacy] Failed to initialize request blocker:', error);
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  
  // Enable other privacy features
  await enablePrivacyProtectionFeatures();
  
  // Update metrics
  try {
    const filterStats = await getFilterListStats();
    updateFilterListCount(filterStats.listCount);
  } catch (error) {
    console.warn('[Privacy] Failed to update metrics:', error);
  }
  
  if (errors.length > 0) {
    console.warn(`[Privacy] Privacy protection enabled with ${errors.length} error(s)`);
    // Only throw if critical components failed
    if (errors.some(e => e.message?.includes('call stack'))) {
      throw errors[0]; // Re-throw stack overflow errors
    }
  } else {
    console.log('[Privacy] Privacy protection enabled');
  }
}

/**
 * Initialize cosmetic rules for element hiding
 */
async function initializeCosmeticRules(): Promise<void> {
  console.log('[Privacy] Initializing cosmetic rules...');
  
  try {
    const rules = await fetchAllCosmeticRules();
    console.log(`[Privacy] Loaded ${rules.generic.length} generic cosmetic selectors`);
  } catch (error) {
    console.warn('[Privacy] Failed to initialize cosmetic rules:', error);
    // Non-fatal - continue without cosmetic filtering
  }
}

/**
 * Disable privacy protection
 */
async function disablePrivacyProtection(): Promise<void> {
  console.log('[Privacy] Disabling privacy protection...');
  
  try {
    // Disable request blocker
    await disableBlocker();
    
    // Shutdown cookie manager
    shutdownCookieManager();
    
    // Remove header rules
    await removeHeaderRules();
    
    // Update metrics
    updateActiveRuleCount(0);
    
    console.log('[Privacy] Privacy protection disabled');
    
  } catch (error) {
    console.error('[Privacy] Failed to disable privacy protection:', error);
    throw error;
  }
}

/**
 * Toggle privacy protection on/off (cookie cleanup, headers, fingerprinting)
 * Note: This does NOT affect the ad blocker - use toggleAdBlocker for that
 */
export async function togglePrivacyProtection(enabled: boolean): Promise<void> {
  const settings = await getPrivacySettings();
  settings.enabled = enabled;
  await setPrivacySettings(settings);
  
  if (enabled && !isEnabled) {
    await enablePrivacyProtection();
    isEnabled = true;
  } else if (!enabled && isEnabled) {
    await disablePrivacyProtection();
    isEnabled = false;
  }
}

/**
 * Toggle ad blocker on/off (static rulesets + dynamic rules)
 * This is separate from privacy protection
 */
export async function toggleAdBlocker(enabled: boolean): Promise<void> {
  const settings = await getPrivacySettings();
  settings.adBlockerEnabled = enabled;
  await setPrivacySettings(settings);
  
  if (enabled) {
    // Enable static rulesets and initialize dynamic rules
    await enableAllStaticRulesets();
    await initializeBlocker();
    console.log('[Privacy] Ad blocker enabled');
  } else {
    // Disable everything
    await disableBlocker();
    console.log('[Privacy] Ad blocker disabled');
  }
}

/**
 * Get ad blocker status
 */
export async function getAdBlockerStatus(): Promise<boolean> {
  const settings = await getPrivacySettings();
  return settings.adBlockerEnabled ?? true; // Default to enabled for backwards compatibility
}

/**
 * Get privacy settings
 */
export async function getPrivacySettings(): Promise<PrivacySettings> {
  const settings = await storage.get('privacySettings');
  return settings || DEFAULT_PRIVACY_SETTINGS;
}

/**
 * Update privacy settings
 */
export async function setPrivacySettings(
  settings: Partial<PrivacySettings>
): Promise<void> {
  const current = await getPrivacySettings();
  const updated = { ...current, ...settings };
  await storage.set('privacySettings', updated);
  
  // If already enabled, refresh components as needed
  if (isEnabled) {
    // Check if we need to update header rules
    if (
      settings.headerMinimization !== undefined ||
      settings.sendGPC !== undefined ||
      settings.stripTrackingParams !== undefined
    ) {
      await updateHeaderRules();
    }
  }
}

/**
 * Set up listener for storage changes
 * Enables reactive updates when settings change
 */
function setupStorageListener(): void {
  storage.onChange(async (changes) => {
    // React to privacy settings changes
    if (changes.privacySettings?.newValue) {
      const newSettings = changes.privacySettings.newValue;
      const oldSettings = changes.privacySettings.oldValue;
      
      // Handle enable/disable toggle
      if (newSettings.enabled !== oldSettings?.enabled) {
        if (newSettings.enabled && !isEnabled) {
          await enablePrivacyProtection();
          isEnabled = true;
        } else if (!newSettings.enabled && isEnabled) {
          await disablePrivacyProtection();
          isEnabled = false;
        }
      }
    }
    
    // React to feature flag changes
    if (changes.featureFlags?.newValue) {
      const privacyEnabled = changes.featureFlags.newValue.privacy;
      const wasEnabled = changes.featureFlags.oldValue?.privacy;
      
      if (privacyEnabled !== wasEnabled) {
        // Sync privacy settings with feature flag
        const settings = await getPrivacySettings();
        if (settings.enabled !== privacyEnabled) {
          await togglePrivacyProtection(privacyEnabled);
        }
      }
    }
  });
}

/**
 * Refresh filter lists and update blocking rules
 */
export async function refreshFilterLists(force = false): Promise<void> {
  if (!isEnabled) {
    console.log('[Privacy] Cannot refresh - privacy not enabled');
    return;
  }
  
  await refreshBlockerRules(force);
  
  // Update metrics
  updateActiveRuleCount(getActiveRuleCount());
  const filterStats = await getFilterListStats();
  updateFilterListCount(filterStats.listCount);
}

/**
 * Check if filter lists should be refreshed and do so if needed
 */
export async function checkAndRefreshFilterLists(): Promise<void> {
  if (!isEnabled) return;
  
  const needsRefresh = await needsFilterListRefresh();
  if (needsRefresh) {
    console.log('[Privacy] Filter lists need refresh');
    await refreshFilterLists();
  }
}

/**
 * Get current privacy status
 */
export async function getPrivacyStatus(): Promise<{
  isEnabled: boolean;
  isInitialized: boolean;
  blockerStatus: Awaited<ReturnType<typeof getBlockerStatus>>;
  headerStatus: Awaited<ReturnType<typeof getHeaderRuleStatus>>;
  cookieStats: Awaited<ReturnType<typeof getCookieStats>>;
  filterStats: Awaited<ReturnType<typeof getFilterListStats>>;
  metrics: ReturnType<typeof getMetricsSummary>;
}> {
  return {
    isEnabled,
    isInitialized,
    blockerStatus: await getBlockerStatus(),
    headerStatus: await getHeaderRuleStatus(),
    cookieStats: await getCookieStats(),
    filterStats: await getFilterListStats(),
    metrics: getMetricsSummary(),
  };
}

/**
 * Handle messages from popup/settings/content scripts
 */
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
      
    case 'ADD_FILTER_LIST': {
      const { url } = payload as { url: string };
      await addFilterListUrl(url);
      if (isEnabled) {
        await refreshFilterLists();
      }
      return { success: true };
    }
      
    case 'REMOVE_FILTER_LIST': {
      const { url } = payload as { url: string };
      await removeFilterListUrl(url);
      if (isEnabled) {
        await refreshFilterLists();
      }
      return { success: true };
    }
      
    case 'GET_ALL_SITE_SETTINGS':
      return getAllSiteSettings();
      
    case 'GET_FILTER_LIST_STATS':
      return getFilterListStats();
      
    case 'GET_BLOCKED_REQUESTS':
      return getMetrics().recentBlocked;
    
    case 'GET_COSMETIC_RULES': {
      const { domain } = payload as { domain: string };
      const selectors = await getCosmeticRulesForDomain(domain);
      return { selectors };
    }
      
    default:
      throw new Error(`Unknown privacy message type: ${type}`);
  }
}

// Re-export commonly used functions for convenience
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
  getFilterListStats,
  addFilterListUrl,
  removeFilterListUrl,
  getCosmeticRulesForDomain,
  getCachedCosmeticRules,
} from './filterListManager';

export {
  getCookieStats,
  manualCleanupCookies,
} from './cookieManager';

export {
  getBlockerStatus,
  getBlockedCount,
} from './requestBlocker';

export {
  enableRuleset,
  disableRuleset,
  toggleRuleset,
  getRulesetStats,
  isRulesetEnabled,
  resetRulesets,
  enableAllStaticRulesets,
  disableAllStaticRulesets,
} from './rulesetManager';

export {
  getSiteFixForDomain,
  hasSiteFix,
} from './siteFixes';

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

// Export types
export * from './types';

