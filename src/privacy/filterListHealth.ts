/**
 * AINTIVIRUS Privacy Module - Filter List Health Tracking
 * 
 * Provides health monitoring for filter lists with:
 * - Fetch success/failure tracking
 * - Parse error counting
 * - Last-known-good fallback
 * - Unsupported syntax telemetry
 * 
 * This module works alongside filterListManager.ts to provide
 * visibility into filter list status for the settings UI.
 */

import { storage } from '@shared/storage';
import {
  FilterListHealth,
  FilterListHealthSummary,
  FilterListHealthStorage,
  LastKnownGoodFilterList,
  LastKnownGoodStorage,
  createDefaultFilterListHealth,
  DEFAULT_FILTER_LIST_HEALTH,
  DEFAULT_LAST_KNOWN_GOOD,
  MAX_UNSUPPORTED_PATTERNS,
} from './types';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEY_HEALTH = 'filterListHealth';
const STORAGE_KEY_LAST_KNOWN_GOOD = 'filterListLastKnownGood';

// ============================================
// HEALTH DATA MANAGEMENT
// ============================================

/**
 * Get all filter list health data
 */
export async function getAllFilterListHealth(): Promise<FilterListHealthStorage> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_HEALTH);
    return result[STORAGE_KEY_HEALTH] || DEFAULT_FILTER_LIST_HEALTH;
  } catch (error) {
    console.error('[FilterListHealth] Failed to read health data:', error);
    return DEFAULT_FILTER_LIST_HEALTH;
  }
}

/**
 * Get health data for a specific filter list
 */
export async function getFilterListHealth(url: string): Promise<FilterListHealth> {
  const all = await getAllFilterListHealth();
  return all[url] || createDefaultFilterListHealth(url);
}

/**
 * Update health data for a filter list
 */
export async function updateFilterListHealth(
  url: string,
  update: Partial<FilterListHealth>
): Promise<void> {
  const all = await getAllFilterListHealth();
  const current = all[url] || createDefaultFilterListHealth(url);
  
  all[url] = {
    ...current,
    ...update,
    url, // Ensure URL is always set
  };
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_HEALTH]: all });
  } catch (error) {
    console.error('[FilterListHealth] Failed to save health data:', error);
  }
}

/**
 * Record a successful fetch for a filter list
 */
export async function recordFetchSuccess(
  url: string,
  ruleCount: number,
  parseErrors: number = 0,
  unsupportedPatterns: string[] = []
): Promise<void> {
  const now = Date.now();
  
  await updateFilterListHealth(url, {
    lastFetchStatus: 'success',
    lastFetchAt: now,
    lastSuccessAt: now,
    lastError: undefined,
    ruleCount,
    parseErrors,
    unsupportedPatterns: unsupportedPatterns.slice(0, MAX_UNSUPPORTED_PATTERNS),
    hasLastKnownGood: true,
  });
  
  console.log(`[FilterListHealth] Success: ${url} (${ruleCount} rules, ${parseErrors} parse errors)`);
}

/**
 * Record a failed fetch for a filter list
 */
export async function recordFetchError(
  url: string,
  error: string
): Promise<void> {
  const current = await getFilterListHealth(url);
  
  await updateFilterListHealth(url, {
    lastFetchStatus: 'error',
    lastFetchAt: Date.now(),
    lastError: error,
    // Keep existing ruleCount and lastSuccessAt from last known good
  });
  
  console.warn(`[FilterListHealth] Error: ${url} - ${error}`);
}

/**
 * Record that a fetch is in progress
 */
export async function recordFetchStart(url: string): Promise<void> {
  await updateFilterListHealth(url, {
    lastFetchStatus: 'pending',
  });
}

/**
 * Remove health data for a filter list
 */
export async function removeFilterListHealth(url: string): Promise<void> {
  const all = await getAllFilterListHealth();
  delete all[url];
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_HEALTH]: all });
  } catch (error) {
    console.error('[FilterListHealth] Failed to remove health data:', error);
  }
  
  // Also remove last-known-good
  await removeLastKnownGood(url);
}

/**
 * Clear all health data
 */
export async function clearAllFilterListHealth(): Promise<void> {
  try {
    await chrome.storage.local.set({ 
      [STORAGE_KEY_HEALTH]: DEFAULT_FILTER_LIST_HEALTH,
      [STORAGE_KEY_LAST_KNOWN_GOOD]: DEFAULT_LAST_KNOWN_GOOD,
    });
  } catch (error) {
    console.error('[FilterListHealth] Failed to clear health data:', error);
  }
}

// ============================================
// LAST-KNOWN-GOOD MANAGEMENT
// ============================================

/**
 * Get all last-known-good filter lists
 */
export async function getAllLastKnownGood(): Promise<LastKnownGoodStorage> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_LAST_KNOWN_GOOD);
    return result[STORAGE_KEY_LAST_KNOWN_GOOD] || DEFAULT_LAST_KNOWN_GOOD;
  } catch (error) {
    console.error('[FilterListHealth] Failed to read last-known-good data:', error);
    return DEFAULT_LAST_KNOWN_GOOD;
  }
}

/**
 * Get last-known-good rules for a specific filter list
 */
export async function getLastKnownGood(url: string): Promise<LastKnownGoodFilterList | null> {
  const all = await getAllLastKnownGood();
  return all[url] || null;
}

/**
 * Maximum rules to store per filter list in last-known-good cache
 * Chrome storage has a 5MB limit - storing full lists would exceed this
 * We store a representative subset that provides basic protection if fetch fails
 */
const MAX_LKG_RULES_PER_LIST = 500;

/**
 * Save last-known-good rules for a filter list
 * NOTE: We only store a subset of rules to avoid exceeding storage quota
 */
export async function saveLastKnownGood(
  url: string,
  rules: string[]
): Promise<void> {
  // Only store a subset of rules to stay within storage limits
  // Prioritize rules that start with || (domain blocks) as they're most valuable
  const domainRules = rules.filter(r => r.startsWith('||')).slice(0, MAX_LKG_RULES_PER_LIST * 0.7);
  const otherRules = rules.filter(r => !r.startsWith('||')).slice(0, MAX_LKG_RULES_PER_LIST * 0.3);
  const truncatedRules = [...domainRules, ...otherRules].slice(0, MAX_LKG_RULES_PER_LIST);
  
  const all = await getAllLastKnownGood();
  
  all[url] = {
    url,
    rules: truncatedRules,
    fetchedAt: Date.now(),
    ruleCount: rules.length, // Store original count for reference
  };
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_LAST_KNOWN_GOOD]: all });
    console.log(`[FilterListHealth] Saved last-known-good for ${url} (${truncatedRules.length}/${rules.length} rules cached)`);
  } catch (error) {
    // If still too large, clear old entries and try again
    if (error instanceof Error && error.message.includes('quota')) {
      console.warn('[FilterListHealth] Storage quota exceeded, clearing old LKG entries');
      try {
        // Only keep this list's LKG
        await chrome.storage.local.set({ 
          [STORAGE_KEY_LAST_KNOWN_GOOD]: { [url]: all[url] } 
        });
      } catch (retryError) {
        console.error('[FilterListHealth] Failed to save last-known-good even after cleanup:', retryError);
      }
    } else {
      console.error('[FilterListHealth] Failed to save last-known-good:', error);
    }
  }
}

/**
 * Remove last-known-good for a filter list
 */
export async function removeLastKnownGood(url: string): Promise<void> {
  const all = await getAllLastKnownGood();
  delete all[url];
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_LAST_KNOWN_GOOD]: all });
  } catch (error) {
    console.error('[FilterListHealth] Failed to remove last-known-good:', error);
  }
}

// ============================================
// HEALTH SUMMARY
// ============================================

/**
 * Get aggregate health summary for all filter lists
 */
export async function getFilterListHealthSummary(): Promise<FilterListHealthSummary> {
  const health = await getAllFilterListHealth();
  const lists = Object.values(health);
  
  const healthyLists = lists.filter(l => l.lastFetchStatus === 'success').length;
  const errorLists = lists.filter(l => l.lastFetchStatus === 'error').length;
  const totalRules = lists.reduce((sum, l) => sum + l.ruleCount, 0);
  
  const lastRefresh = lists.length > 0
    ? Math.max(...lists.map(l => l.lastFetchAt))
    : 0;
  
  return {
    totalLists: lists.length,
    healthyLists,
    errorLists,
    totalRules,
    lastRefresh,
    lists,
  };
}

// ============================================
// UNSUPPORTED PATTERN TRACKING
// ============================================

/**
 * Track an unsupported filter pattern
 * Used for telemetry and future syntax support decisions
 */
export async function trackUnsupportedPattern(
  url: string,
  pattern: string
): Promise<void> {
  const health = await getFilterListHealth(url);
  
  // Only track if we haven't already and under limit
  if (
    health.unsupportedPatterns.length < MAX_UNSUPPORTED_PATTERNS &&
    !health.unsupportedPatterns.includes(pattern)
  ) {
    health.unsupportedPatterns.push(pattern);
    await updateFilterListHealth(url, {
      unsupportedPatterns: health.unsupportedPatterns,
    });
  }
}

/**
 * Get all unsupported patterns across all lists
 * Useful for identifying common patterns to prioritize support
 */
export async function getAllUnsupportedPatterns(): Promise<Map<string, number>> {
  const health = await getAllFilterListHealth();
  const patternCounts = new Map<string, number>();
  
  for (const listHealth of Object.values(health)) {
    for (const pattern of listHealth.unsupportedPatterns) {
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }
  }
  
  return patternCounts;
}

// ============================================
// HEALTH CHECK UTILITIES
// ============================================

/**
 * Check if a filter list is healthy (fetched successfully recently)
 */
export async function isFilterListHealthy(url: string): Promise<boolean> {
  const health = await getFilterListHealth(url);
  return health.lastFetchStatus === 'success';
}

/**
 * Check if any filter list has errors
 */
export async function hasAnyFilterListErrors(): Promise<boolean> {
  const summary = await getFilterListHealthSummary();
  return summary.errorLists > 0;
}

/**
 * Get list of filter lists with errors
 */
export async function getErrorFilterLists(): Promise<FilterListHealth[]> {
  const health = await getAllFilterListHealth();
  return Object.values(health).filter(l => l.lastFetchStatus === 'error');
}

/**
 * Reset health for a specific filter list (for retry)
 */
export async function resetFilterListHealth(url: string): Promise<void> {
  await updateFilterListHealth(url, createDefaultFilterListHealth(url));
}





