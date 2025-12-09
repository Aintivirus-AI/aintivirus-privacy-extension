

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


const STORAGE_KEY_HEALTH = 'filterListHealth';
const STORAGE_KEY_LAST_KNOWN_GOOD = 'filterListLastKnownGood';


export async function getAllFilterListHealth(): Promise<FilterListHealthStorage> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_HEALTH);
    return result[STORAGE_KEY_HEALTH] || DEFAULT_FILTER_LIST_HEALTH;
  } catch (error) {

    return DEFAULT_FILTER_LIST_HEALTH;
  }
}


export async function getFilterListHealth(url: string): Promise<FilterListHealth> {
  const all = await getAllFilterListHealth();
  return all[url] || createDefaultFilterListHealth(url);
}


export async function updateFilterListHealth(
  url: string,
  update: Partial<FilterListHealth>
): Promise<void> {
  const all = await getAllFilterListHealth();
  const current = all[url] || createDefaultFilterListHealth(url);
  
  all[url] = {
    ...current,
    ...update,
    url, 
  };
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_HEALTH]: all });
  } catch (error) {

  }
}


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

}


export async function recordFetchError(
  url: string,
  error: string
): Promise<void> {
  const current = await getFilterListHealth(url);
  
  await updateFilterListHealth(url, {
    lastFetchStatus: 'error',
    lastFetchAt: Date.now(),
    lastError: error,
    
  });

}


export async function recordFetchStart(url: string): Promise<void> {
  await updateFilterListHealth(url, {
    lastFetchStatus: 'pending',
  });
}


export async function removeFilterListHealth(url: string): Promise<void> {
  const all = await getAllFilterListHealth();
  delete all[url];
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_HEALTH]: all });
  } catch (error) {

  }
  
  
  await removeLastKnownGood(url);
}


export async function clearAllFilterListHealth(): Promise<void> {
  try {
    await chrome.storage.local.set({ 
      [STORAGE_KEY_HEALTH]: DEFAULT_FILTER_LIST_HEALTH,
      [STORAGE_KEY_LAST_KNOWN_GOOD]: DEFAULT_LAST_KNOWN_GOOD,
    });
  } catch (error) {

  }
}


export async function getAllLastKnownGood(): Promise<LastKnownGoodStorage> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_LAST_KNOWN_GOOD);
    return result[STORAGE_KEY_LAST_KNOWN_GOOD] || DEFAULT_LAST_KNOWN_GOOD;
  } catch (error) {

    return DEFAULT_LAST_KNOWN_GOOD;
  }
}


export async function getLastKnownGood(url: string): Promise<LastKnownGoodFilterList | null> {
  const all = await getAllLastKnownGood();
  return all[url] || null;
}


const MAX_LKG_RULES_PER_LIST = 500;


export async function saveLastKnownGood(
  url: string,
  rules: string[]
): Promise<void> {
  
  
  const domainRules = rules.filter(r => r.startsWith('||')).slice(0, MAX_LKG_RULES_PER_LIST * 0.7);
  const otherRules = rules.filter(r => !r.startsWith('||')).slice(0, MAX_LKG_RULES_PER_LIST * 0.3);
  const truncatedRules = [...domainRules, ...otherRules].slice(0, MAX_LKG_RULES_PER_LIST);
  
  const all = await getAllLastKnownGood();
  
  all[url] = {
    url,
    rules: truncatedRules,
    fetchedAt: Date.now(),
    ruleCount: rules.length, 
  };
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_LAST_KNOWN_GOOD]: all });

  } catch (error) {
    
    if (error instanceof Error && error.message.includes('quota')) {

      try {
        
        await chrome.storage.local.set({ 
          [STORAGE_KEY_LAST_KNOWN_GOOD]: { [url]: all[url] } 
        });
      } catch (retryError) {

      }
    } else {

    }
  }
}


export async function removeLastKnownGood(url: string): Promise<void> {
  const all = await getAllLastKnownGood();
  delete all[url];
  
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_LAST_KNOWN_GOOD]: all });
  } catch (error) {

  }
}


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


export async function trackUnsupportedPattern(
  url: string,
  pattern: string
): Promise<void> {
  const health = await getFilterListHealth(url);
  
  
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


export async function isFilterListHealthy(url: string): Promise<boolean> {
  const health = await getFilterListHealth(url);
  return health.lastFetchStatus === 'success';
}


export async function hasAnyFilterListErrors(): Promise<boolean> {
  const summary = await getFilterListHealthSummary();
  return summary.errorLists > 0;
}


export async function getErrorFilterLists(): Promise<FilterListHealth[]> {
  const health = await getAllFilterListHealth();
  return Object.values(health).filter(l => l.lastFetchStatus === 'error');
}


export async function resetFilterListHealth(url: string): Promise<void> {
  await updateFilterListHealth(url, createDefaultFilterListHealth(url));
}

