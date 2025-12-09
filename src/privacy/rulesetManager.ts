

import { storage } from '@shared/storage';


export const ALL_UBOL_RULESETS = [
  'ublock-filters',
  'easylist',
  'easyprivacy',
  'pgl',
  'ublock-badware',
  'urlhaus-full',
  'adguard-mobile',
  'block-lan',
  'dpollock-0',
  'adguard-spyware-url',
  'annoyances-cookies',
  'annoyances-overlays',
  'annoyances-social',
  'annoyances-widgets',
  'annoyances-others',
  'annoyances-notifications',
  'ublock-experimental',
  'stevenblack-hosts',
] as const;

export type UbolRulesetId = typeof ALL_UBOL_RULESETS[number];


export const DEFAULT_UBOL_RULESETS: UbolRulesetId[] = [
  'ublock-filters',
  'easylist',
  'easyprivacy',
  'pgl',
  'ublock-badware',
  'urlhaus-full',
];


export type FilteringLevel = 'off' | 'minimal' | 'basic' | 'optimal' | 'complete';


export const FILTERING_LEVEL_RULESETS: Record<FilteringLevel, UbolRulesetId[]> = {
  off: [],
  minimal: ['ublock-filters'],
  basic: ['ublock-filters', 'easylist'],
  optimal: ['ublock-filters', 'easylist', 'easyprivacy', 'pgl', 'ublock-badware', 'urlhaus-full'],
  complete: [...ALL_UBOL_RULESETS],
};


export interface RulesetState {
  enabledRulesets: UbolRulesetId[];
  filteringLevel: FilteringLevel;
  lastUpdated: number;
}

export const DEFAULT_RULESET_STATE: RulesetState = {
  enabledRulesets: [...DEFAULT_UBOL_RULESETS],
  filteringLevel: 'optimal',
  lastUpdated: Date.now(),
};


export async function getRulesetState(): Promise<RulesetState> {
  const state = await storage.get('rulesetState');
  return state || DEFAULT_RULESET_STATE;
}


export async function getEnabledRulesets(): Promise<UbolRulesetId[]> {
  const state = await getRulesetState();
  return state.enabledRulesets;
}


export async function enableRuleset(rulesetId: UbolRulesetId): Promise<void> {
  const state = await getRulesetState();
  
  if (!state.enabledRulesets.includes(rulesetId)) {
    state.enabledRulesets.push(rulesetId);
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);
    
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [rulesetId],
    });

  }
}


export async function disableRuleset(rulesetId: UbolRulesetId): Promise<void> {
  const state = await getRulesetState();
  
  const index = state.enabledRulesets.indexOf(rulesetId);
  if (index >= 0) {
    state.enabledRulesets.splice(index, 1);
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);
    
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: [rulesetId],
    });

  }
}


export async function toggleRuleset(rulesetId: UbolRulesetId): Promise<boolean> {
  const state = await getRulesetState();
  const isEnabled = state.enabledRulesets.includes(rulesetId);
  
  if (isEnabled) {
    await disableRuleset(rulesetId);
    return false;
  } else {
    await enableRuleset(rulesetId);
    return true;
  }
}


export async function setFilteringLevel(level: FilteringLevel): Promise<void> {

  const targetRulesets = FILTERING_LEVEL_RULESETS[level];
  const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
  
  
  const toEnable = targetRulesets.filter(id => !currentlyEnabled.includes(id));
  const toDisable = currentlyEnabled.filter(id => !(targetRulesets as string[]).includes(id));
  
  if (toEnable.length > 0 || toDisable.length > 0) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: toEnable,
      disableRulesetIds: toDisable,
    });
  }
  
  
  const state = await getRulesetState();
  state.enabledRulesets = [...targetRulesets];
  state.filteringLevel = level;
  state.lastUpdated = Date.now();
  await storage.set('rulesetState', state);

}


export async function getFilteringLevel(): Promise<FilteringLevel> {
  const state = await getRulesetState();
  return state.filteringLevel || 'optimal';
}


export async function initializeRulesetManager(): Promise<void> {

  try {
    const state = await getRulesetState();
    const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    
    
    const toEnable = state.enabledRulesets.filter(id => !currentlyEnabled.includes(id));
    const toDisable = currentlyEnabled.filter(id => 
      ALL_UBOL_RULESETS.includes(id as UbolRulesetId) && !state.enabledRulesets.includes(id as UbolRulesetId)
    );
    
    if (toEnable.length > 0 || toDisable.length > 0) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: toEnable,
        disableRulesetIds: toDisable,
      });
    }

  } catch (error) {

  }
}


export async function getRulesetStats(): Promise<{
  enabledRulesets: string[];
  availableRulesets: string[];
  filteringLevel: FilteringLevel;
  dynamicRuleCount: number;
  availableStaticSlots: number;
}> {
  const state = await getRulesetState();
  const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
  const availableSlots = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
  const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
  
  return {
    enabledRulesets: currentlyEnabled,
    availableRulesets: [...ALL_UBOL_RULESETS],
    filteringLevel: state.filteringLevel || 'optimal',
    dynamicRuleCount: dynamicRules.length,
    availableStaticSlots: availableSlots,
  };
}


export async function isRulesetEnabled(rulesetId: UbolRulesetId): Promise<boolean> {
  const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
  return currentlyEnabled.includes(rulesetId);
}


export async function resetRulesets(): Promise<void> {
  await setFilteringLevel('optimal');

}


export async function disableAllRulesets(): Promise<void> {

  try {
    const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();

    if (currentlyEnabled.length > 0) {

      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: currentlyEnabled,
      });

    } else {

    }
    
    
    const state = await getRulesetState();
    state.enabledRulesets = [];
    state.filteringLevel = 'off';
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);

    
    const afterDisable = await chrome.declarativeNetRequest.getEnabledRulesets();

    if (afterDisable.length === 0) {

    } else {

    }

  } catch (error) {

    throw error;
  }
}


export async function enableDefaultRulesets(): Promise<void> {


  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [...DEFAULT_UBOL_RULESETS],
    });

    
    const state = await getRulesetState();
    state.enabledRulesets = [...DEFAULT_UBOL_RULESETS];
    state.filteringLevel = 'optimal';
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);

    const afterEnable = await chrome.declarativeNetRequest.getEnabledRulesets();


  } catch (error) {

    throw error;
  }
}


export const enableAllStaticRulesets = enableDefaultRulesets;
export const disableAllStaticRulesets = disableAllRulesets;
export const ALL_RULESETS = ALL_UBOL_RULESETS;
export type StaticRulesetId = UbolRulesetId;
