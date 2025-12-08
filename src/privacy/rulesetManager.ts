/**
 * AINTIVIRUS Ruleset Manager
 * 
 * Manages static and dynamic DNR rulesets.
 * Static rulesets are pre-compiled and loaded from manifest.json.
 * Dynamic rulesets are managed at runtime for user customizations.
 * 
 * uBOL-style architecture:
 * - Static rulesets are enabled by default and provide base protection
 * - Dynamic rules handle site exceptions and user customizations
 * - Service worker can stay idle; Chrome handles rule matching
 */

import { storage } from '@shared/storage';

/** Available static ruleset IDs (must match manifest.json) */
export type StaticRulesetId = 'ruleset_custom' | 'ruleset_fixes';

/** Ruleset enable state stored in extension storage */
export interface RulesetState {
  enabledRulesets: StaticRulesetId[];
  lastUpdated: number;
}

export const DEFAULT_RULESET_STATE: RulesetState = {
  enabledRulesets: ['ruleset_custom', 'ruleset_fixes'],
  lastUpdated: Date.now(),
};

/**
 * Get the current state of enabled rulesets
 */
export async function getRulesetState(): Promise<RulesetState> {
  const state = await storage.get('rulesetState');
  return state || DEFAULT_RULESET_STATE;
}

/**
 * Get list of enabled static rulesets
 */
export async function getEnabledRulesets(): Promise<StaticRulesetId[]> {
  const state = await getRulesetState();
  return state.enabledRulesets;
}

/**
 * Enable a static ruleset
 */
export async function enableRuleset(rulesetId: StaticRulesetId): Promise<void> {
  const state = await getRulesetState();
  
  if (!state.enabledRulesets.includes(rulesetId)) {
    state.enabledRulesets.push(rulesetId);
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);
    
    await updateEnabledRulesets(state.enabledRulesets);
    console.log(`[Privacy] Enabled ruleset: ${rulesetId}`);
  }
}

/**
 * Disable a static ruleset
 */
export async function disableRuleset(rulesetId: StaticRulesetId): Promise<void> {
  const state = await getRulesetState();
  
  const index = state.enabledRulesets.indexOf(rulesetId);
  if (index >= 0) {
    state.enabledRulesets.splice(index, 1);
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);
    
    await updateEnabledRulesets(state.enabledRulesets);
    console.log(`[Privacy] Disabled ruleset: ${rulesetId}`);
  }
}

/**
 * Toggle a static ruleset
 */
export async function toggleRuleset(rulesetId: StaticRulesetId): Promise<boolean> {
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

/**
 * Update Chrome's enabled rulesets
 */
async function updateEnabledRulesets(enabledRulesets: StaticRulesetId[]): Promise<void> {
  try {
    // Get all available static rulesets
    const availableRulesets = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
    console.log(`[Privacy] Available static rule slots: ${availableRulesets}`);
    
    // Calculate which to enable/disable
    const allRulesets: StaticRulesetId[] = ['ruleset_custom', 'ruleset_fixes'];
    const disableRulesets = allRulesets.filter(id => !enabledRulesets.includes(id));
    
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabledRulesets,
      disableRulesetIds: disableRulesets,
    });
    
    console.log(`[Privacy] Updated enabled rulesets:`, enabledRulesets);
  } catch (error) {
    console.error('[Privacy] Failed to update enabled rulesets:', error);
    throw error;
  }
}

/**
 * Initialize ruleset manager
 * Called on extension startup to ensure rulesets are in expected state
 */
export async function initializeRulesetManager(): Promise<void> {
  console.log('[Privacy] Initializing ruleset manager...');
  
  try {
    const state = await getRulesetState();
    
    // Ensure the stored state matches Chrome's actual state
    await updateEnabledRulesets(state.enabledRulesets);
    
    // Log ruleset statistics
    const staticRuleCount = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    
    console.log(`[Privacy] Ruleset manager initialized:`);
    console.log(`  - Enabled static rulesets: ${state.enabledRulesets.join(', ')}`);
    console.log(`  - Available static rule slots: ${staticRuleCount}`);
    console.log(`  - Active dynamic rules: ${dynamicRules.length}`);
    
  } catch (error) {
    console.error('[Privacy] Failed to initialize ruleset manager:', error);
    // Non-fatal - continue without static rulesets
  }
}

/**
 * Get ruleset statistics
 */
export async function getRulesetStats(): Promise<{
  staticRulesets: {
    id: StaticRulesetId;
    enabled: boolean;
    ruleCount: number;
  }[];
  dynamicRuleCount: number;
  availableStaticSlots: number;
}> {
  const state = await getRulesetState();
  const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
  const availableSlots = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
  
  // Get info about each static ruleset
  const staticRulesets: {
    id: StaticRulesetId;
    enabled: boolean;
    ruleCount: number;
  }[] = [
    {
      id: 'ruleset_custom',
      enabled: state.enabledRulesets.includes('ruleset_custom'),
      ruleCount: 45, // Approximate, would need to read JSON to get exact
    },
    {
      id: 'ruleset_fixes',
      enabled: state.enabledRulesets.includes('ruleset_fixes'),
      ruleCount: 26, // Approximate
    },
  ];
  
  return {
    staticRulesets,
    dynamicRuleCount: dynamicRules.length,
    availableStaticSlots: availableSlots,
  };
}

/**
 * Check if a specific ruleset is enabled
 */
export async function isRulesetEnabled(rulesetId: StaticRulesetId): Promise<boolean> {
  const state = await getRulesetState();
  return state.enabledRulesets.includes(rulesetId);
}

/**
 * Reset all rulesets to default state
 */
export async function resetRulesets(): Promise<void> {
  await storage.set('rulesetState', DEFAULT_RULESET_STATE);
  await updateEnabledRulesets(DEFAULT_RULESET_STATE.enabledRulesets);
  console.log('[Privacy] Reset rulesets to default state');
}

/**
 * Disable all static rulesets (for turning off ad blocking)
 */
export async function disableAllStaticRulesets(): Promise<void> {
  console.log('[Privacy] Disabling all static rulesets...');
  
  try {
    const allRulesets: StaticRulesetId[] = ['ruleset_custom', 'ruleset_fixes'];
    
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: allRulesets,
    });
    
    // Update stored state
    const state = await getRulesetState();
    state.enabledRulesets = [];
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);
    
    console.log('[Privacy] All static rulesets disabled');
  } catch (error) {
    console.error('[Privacy] Failed to disable static rulesets:', error);
    throw error;
  }
}

/**
 * Enable all static rulesets (for turning on ad blocking)
 */
export async function enableAllStaticRulesets(): Promise<void> {
  console.log('[Privacy] Enabling all static rulesets...');
  
  try {
    const allRulesets: StaticRulesetId[] = ['ruleset_custom', 'ruleset_fixes'];
    
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: allRulesets,
    });
    
    // Update stored state
    const state = await getRulesetState();
    state.enabledRulesets = [...allRulesets];
    state.lastUpdated = Date.now();
    await storage.set('rulesetState', state);
    
    console.log('[Privacy] All static rulesets enabled');
  } catch (error) {
    console.error('[Privacy] Failed to enable static rulesets:', error);
    throw error;
  }
}
