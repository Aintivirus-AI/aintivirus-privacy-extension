/**
 * AINTIVIRUS Request Blocker
 * 
 * Manages Chrome's Declarative Net Request (DNR) API for blocking tracker requests.
 * 
 * MV3 Design Notes:
 * - Uses dynamic rules (updateDynamicRules) for runtime updates
 * - Static rules would require manifest changes and extension reload
 * - Dynamic rules limit is 5000, we reserve some for site exceptions
 * - Rules are persisted across browser restarts by Chrome
 * 
 * Priority system:
 * - 1: Standard block rules from filter lists
 * - 2: Allow rules from filter lists (@@)
 * - 100: Site exception rules (user allowlisted domains)
 */

import { PrivacyDNRRule, MAX_DYNAMIC_RULES } from './types';
import { 
  convertFilterRulesToDNR, 
  createSiteExceptionRule,
  filterValidRules,
  getRuleStats,
} from './ruleConverter';
import { fetchAllFilterLists } from './filterListManager';
import { logBlockedRequest } from './metrics';

/** Rule ID ranges for organization */
const RULE_ID_RANGES = {
  FILTER_RULES_START: 1,
  FILTER_RULES_END: 4000,
  SITE_EXCEPTIONS_START: 4001,
  SITE_EXCEPTIONS_END: 4500,
  HEADER_RULES_START: 4501,
  HEADER_RULES_END: 5000,
};

/** Currently loaded rules count */
let activeRuleCount = 0;

/** Site exception rules currently active */
const activeSiteExceptions = new Map<string, number>(); // domain -> ruleId

/** Next available site exception rule ID */
let nextSiteExceptionId = RULE_ID_RANGES.SITE_EXCEPTIONS_START;

/**
 * Initialize the request blocker
 * Loads filter lists and applies DNR rules
 */
export async function initializeBlocker(): Promise<void> {
  console.log('[Privacy] Initializing request blocker...');
  
  try {
    // Clear any existing dynamic rules first
    await clearAllDynamicRules();
    
    // Fetch and convert filter lists
    const filterRules = await fetchAllFilterLists();
    const dnrRules = convertFilterRulesToDNR(
      filterRules, 
      RULE_ID_RANGES.FILTER_RULES_START
    );
    
    // Validate and apply rules
    const validRules = filterValidRules(dnrRules);
    await applyDynamicRules(validRules);
    
    activeRuleCount = validRules.length;
    
    const stats = getRuleStats(validRules);
    console.log('[Privacy] Request blocker initialized:', stats);
    
    // Set up rule match listener for metrics
    setupRuleMatchListener();
    
  } catch (error) {
    console.error('[Privacy] Failed to initialize request blocker:', error);
    throw error;
  }
}

/**
 * Refresh filter lists and update rules
 */
export async function refreshBlockerRules(forceRefresh = false): Promise<void> {
  console.log('[Privacy] Refreshing blocker rules...');
  
  try {
    // Get current site exceptions to preserve them
    const exceptions = Array.from(activeSiteExceptions.entries());
    
    // Clear filter rules (but not site exceptions)
    await clearFilterRules();
    
    // Fetch fresh filter lists
    const filterRules = await fetchAllFilterLists(forceRefresh);
    const dnrRules = convertFilterRulesToDNR(
      filterRules,
      RULE_ID_RANGES.FILTER_RULES_START
    );
    
    // Validate and apply
    const validRules = filterValidRules(dnrRules);
    await applyDynamicRules(validRules);
    
    activeRuleCount = validRules.length + activeSiteExceptions.size;
    
    console.log(`[Privacy] Refreshed ${validRules.length} filter rules`);
    
  } catch (error) {
    console.error('[Privacy] Failed to refresh blocker rules:', error);
    throw error;
  }
}

/**
 * Apply dynamic rules via Chrome DNR API
 */
async function applyDynamicRules(rules: PrivacyDNRRule[]): Promise<void> {
  if (rules.length === 0) return;
  
  // Chrome API requires the rule objects without extra properties
  const cleanRules = rules.map(rule => ({
    id: rule.id,
    priority: rule.priority,
    action: rule.action,
    condition: rule.condition,
  }));
  
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: cleanRules as chrome.declarativeNetRequest.Rule[],
  });
  
  console.log(`[Privacy] Applied ${rules.length} dynamic rules`);
}

/**
 * Remove specific dynamic rules by ID
 */
async function removeDynamicRules(ruleIds: number[]): Promise<void> {
  if (ruleIds.length === 0) return;
  
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIds,
  });
}

/**
 * Clear all dynamic rules
 */
async function clearAllDynamicRules(): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIds = existingRules.map(r => r.id);
  
  if (ruleIds.length > 0) {
    await removeDynamicRules(ruleIds);
    console.log(`[Privacy] Cleared ${ruleIds.length} existing dynamic rules`);
  }
  
  activeSiteExceptions.clear();
  nextSiteExceptionId = RULE_ID_RANGES.SITE_EXCEPTIONS_START;
  activeRuleCount = 0;
}

/**
 * Clear only filter rules (preserve site exceptions)
 */
async function clearFilterRules(): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const filterRuleIds = existingRules
    .filter(r => r.id >= RULE_ID_RANGES.FILTER_RULES_START && 
                 r.id <= RULE_ID_RANGES.FILTER_RULES_END)
    .map(r => r.id);
  
  if (filterRuleIds.length > 0) {
    await removeDynamicRules(filterRuleIds);
  }
}

/**
 * Add a site exception (allowlist a domain)
 * This creates a high-priority allow rule that overrides block rules
 */
export async function addSiteException(domain: string): Promise<void> {
  // Check if already excepted
  if (activeSiteExceptions.has(domain)) {
    console.log('[Privacy] Site already excepted:', domain);
    return;
  }
  
  // Check if we have room for more exceptions
  if (nextSiteExceptionId > RULE_ID_RANGES.SITE_EXCEPTIONS_END) {
    throw new Error('Maximum site exceptions reached');
  }
  
  const ruleId = nextSiteExceptionId++;
  const rule = createSiteExceptionRule(domain, ruleId);
  
  await applyDynamicRules([rule]);
  activeSiteExceptions.set(domain, ruleId);
  activeRuleCount++;
  
  console.log(`[Privacy] Added site exception for: ${domain}`);
}

/**
 * Remove a site exception
 */
export async function removeSiteException(domain: string): Promise<void> {
  const ruleId = activeSiteExceptions.get(domain);
  if (!ruleId) {
    console.log('[Privacy] No exception found for:', domain);
    return;
  }
  
  await removeDynamicRules([ruleId]);
  activeSiteExceptions.delete(domain);
  activeRuleCount--;
  
  console.log(`[Privacy] Removed site exception for: ${domain}`);
}

/**
 * Check if a domain has a site exception
 */
export function hasSiteException(domain: string): boolean {
  return activeSiteExceptions.has(domain);
}

/**
 * Get all site exceptions
 */
export function getSiteExceptions(): string[] {
  return Array.from(activeSiteExceptions.keys());
}

/**
 * Get blocked request count for a specific tab
 * Uses Chrome's getMatchedRules API with the declarativeNetRequestFeedback permission
 */
export async function getBlockedCount(tabId: number): Promise<number> {
  try {
    const matchedRules = await chrome.declarativeNetRequest.getMatchedRules({
      tabId,
    });
    
    // Count only block actions
    return matchedRules.rulesMatchedInfo.filter(
      info => info.rule.rulesetId === '_dynamic'
    ).length;
    
  } catch (error) {
    // This can fail if tab doesn't exist anymore
    console.warn('[Privacy] Failed to get blocked count for tab:', tabId, error);
    return 0;
  }
}

/**
 * Set up listener for rule matches (for metrics/logging)
 * Requires declarativeNetRequestFeedback permission
 */
function setupRuleMatchListener(): void {
  // Check if the API is available (requires declarativeNetRequestFeedback)
  if (!chrome.declarativeNetRequest.onRuleMatchedDebug) {
    console.log('[Privacy] Rule match listener not available (need feedback permission)');
    return;
  }
  
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    // Log blocked requests for metrics
    if (info.request.tabId > 0) {
      logBlockedRequest(
        info.request.tabId,
        info.request.url,
        info.rule.ruleId
      );
    }
  });
  
  console.log('[Privacy] Rule match listener set up');
}

/**
 * Get current blocker status
 */
export async function getBlockerStatus(): Promise<{
  isActive: boolean;
  activeRuleCount: number;
  siteExceptionCount: number;
  maxRules: number;
}> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  
  return {
    isActive: existingRules.length > 0,
    activeRuleCount: existingRules.length,
    siteExceptionCount: activeSiteExceptions.size,
    maxRules: MAX_DYNAMIC_RULES,
  };
}

/**
 * Disable the blocker (remove all rules)
 */
export async function disableBlocker(): Promise<void> {
  console.log('[Privacy] Disabling request blocker...');
  await clearAllDynamicRules();
  console.log('[Privacy] Request blocker disabled');
}

/**
 * Re-enable the blocker (reload rules)
 */
export async function enableBlocker(): Promise<void> {
  console.log('[Privacy] Enabling request blocker...');
  await initializeBlocker();
  console.log('[Privacy] Request blocker enabled');
}

/**
 * Get the active rule count
 */
export function getActiveRuleCount(): number {
  return activeRuleCount;
}



