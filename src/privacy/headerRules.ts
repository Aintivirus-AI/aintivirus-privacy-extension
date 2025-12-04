/**
 * AINTIVIRUS Header Rules
 * 
 * Manages DNR rules for header minimization and privacy headers.
 * 
 * Capabilities:
 * - Strip/minimize Referer header on cross-origin requests
 * - Add Global Privacy Control (Sec-GPC) header
 * - Strip tracking query parameters from URLs
 * 
 * MV3 Design Notes:
 * - Uses modifyHeaders action type in DNR
 * - Query param stripping uses redirect action
 * - Rules have dedicated ID range (4501-5000)
 */

import { TRACKING_PARAMS } from './types';
import { storage } from '@shared/storage';
import { logRequestModified } from './metrics';

// Type aliases to work around strict type checking
type RuleActionType = chrome.declarativeNetRequest.RuleActionType;
type ResourceType = chrome.declarativeNetRequest.ResourceType;
type HeaderOperation = chrome.declarativeNetRequest.HeaderOperation;

/** Header rule ID range */
const HEADER_RULE_START = 4501;

/** Rule IDs for specific features */
const RULE_IDS = {
  STRIP_REFERER: 4501,
  STRIP_REFERER_MAIN_FRAME: 4503,
  ADD_GPC: 4502,
  STRIP_TRACKING_PARAMS_BASE: 4510, // 4510-4599 reserved for param rules
};

/**
 * Initialize header modification rules
 */
export async function initializeHeaderRules(): Promise<void> {
  const settings = await storage.get('privacySettings');
  
  if (!settings?.enabled) {
    return;
  }
  
  const rulesToAdd: chrome.declarativeNetRequest.Rule[] = [];
  
  // Strip Referer on cross-origin requests (sub-resources and main frame)
  if (settings.headerMinimization) {
    rulesToAdd.push(createRefererStripRule());
    rulesToAdd.push(createMainFrameRefererStripRule());
  }
  
  // Add Global Privacy Control header
  if (settings.sendGPC) {
    rulesToAdd.push(createGPCRule());
  }
  
  // Apply rules
  if (rulesToAdd.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rulesToAdd,
    });
    console.log(`[Privacy] Applied ${rulesToAdd.length} header rules`);
  }
  
  // Set up request modification tracking for metrics
  setupRequestModificationTracking();
}

/**
 * Create rules to strip/minimize Referer header on cross-origin requests
 * 
 * Returns two rules:
 * 1. Strip Referer on third-party sub-resource requests
 * 2. Strip Referer on main frame navigations (prevents leaking where you came from)
 */
function createRefererStripRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: RULE_IDS.STRIP_REFERER,
    priority: 1,
    action: {
      type: 'modifyHeaders' as RuleActionType,
      requestHeaders: [
        {
          header: 'Referer',
          operation: 'remove' as HeaderOperation,
        },
      ],
    },
    condition: {
      // Only apply to third-party requests
      domainType: 'thirdParty' as chrome.declarativeNetRequest.DomainType,
      resourceTypes: [
        'script',
        'image',
        'stylesheet',
        'object',
        'xmlhttprequest',
        'sub_frame',
        'ping',
        'media',
        'font',
        'websocket',
        'other',
      ] as ResourceType[],
    },
  };
}

/**
 * Create rule to strip Referer on main frame navigations
 * This prevents sites from seeing where you came from when clicking links
 */
function createMainFrameRefererStripRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: RULE_IDS.STRIP_REFERER_MAIN_FRAME,
    priority: 1,
    action: {
      type: 'modifyHeaders' as RuleActionType,
      requestHeaders: [
        {
          header: 'Referer',
          operation: 'remove' as HeaderOperation,
        },
      ],
    },
    condition: {
      // Apply to all cross-origin main frame navigations
      domainType: 'thirdParty' as chrome.declarativeNetRequest.DomainType,
      resourceTypes: ['main_frame'] as ResourceType[],
    },
  };
}

/**
 * Create rule to add Global Privacy Control header
 * 
 * GPC (Sec-GPC: 1) signals to websites that the user does not consent to
 * having their data sold or shared. It's legally binding in some jurisdictions.
 * 
 * @see https://globalprivacycontrol.org/
 */
function createGPCRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: RULE_IDS.ADD_GPC,
    priority: 1,
    action: {
      type: 'modifyHeaders' as RuleActionType,
      requestHeaders: [
        {
          header: 'Sec-GPC',
          operation: 'set' as HeaderOperation,
          value: '1',
        },
      ],
    },
    condition: {
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'xmlhttprequest',
      ] as ResourceType[],
    },
  };
}

/**
 * Create redirect rules to strip tracking query parameters
 * 
 * Note: This is more complex as DNR redirect requires regex support
 * and careful construction. We use a transform approach instead.
 * 
 * For MV3, query param stripping is limited. We can use:
 * 1. redirect with regexSubstitution (requires careful regex)
 * 2. Content script to clean URLs after load
 * 
 * This implementation uses the redirect approach for key params.
 */
export function createTrackingParamStripRules(): chrome.declarativeNetRequest.Rule[] {
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  let ruleId = RULE_IDS.STRIP_TRACKING_PARAMS_BASE;
  
  // Create rules for the most common tracking params
  // We limit to top params due to rule count constraints
  const topParams = TRACKING_PARAMS.slice(0, 20);
  
  for (const param of topParams) {
    // Create a regex that matches URLs with this parameter
    // This is a simplified approach - full implementation would be more sophisticated
    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'redirect' as RuleActionType,
        redirect: {
          transform: {
            queryTransform: {
              removeParams: [param],
            },
          },
        },
      },
      condition: {
        // Only apply to main frame navigations
        resourceTypes: ['main_frame'] as ResourceType[],
        // Regex to match URLs containing this param
        regexFilter: `[?&]${escapeRegex(param)}=`,
        isUrlFilterCaseSensitive: false,
      },
    });
  }
  
  return rules;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update header rules based on current settings
 */
export async function updateHeaderRules(): Promise<void> {
  const settings = await storage.get('privacySettings');
  
  // Get current header rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const headerRuleIds = existingRules
    .filter(r => r.id >= HEADER_RULE_START && r.id < 5000)
    .map(r => r.id);
  
  // Remove existing header rules
  if (headerRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: headerRuleIds,
    });
  }
  
  // If privacy is disabled, don't add new rules
  if (!settings?.enabled) {
    return;
  }
  
  const rulesToAdd: chrome.declarativeNetRequest.Rule[] = [];
  
  // Add rules based on settings
  if (settings.headerMinimization) {
    rulesToAdd.push(createRefererStripRule());
    rulesToAdd.push(createMainFrameRefererStripRule());
  }
  
  if (settings.sendGPC) {
    rulesToAdd.push(createGPCRule());
  }
  
  if (settings.stripTrackingParams) {
    rulesToAdd.push(...createTrackingParamStripRules());
  }
  
  // Apply new rules
  if (rulesToAdd.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rulesToAdd,
    });
    console.log(`[Privacy] Updated ${rulesToAdd.length} header rules`);
  }
}

/**
 * Remove all header rules
 */
export async function removeHeaderRules(): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const headerRuleIds = existingRules
    .filter(r => r.id >= HEADER_RULE_START && r.id < 5000)
    .map(r => r.id);
  
  if (headerRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: headerRuleIds,
    });
    console.log(`[Privacy] Removed ${headerRuleIds.length} header rules`);
  }
}

/**
 * Get current header rule status
 */
export async function getHeaderRuleStatus(): Promise<{
  refererStripping: boolean;
  gpcEnabled: boolean;
  paramStripping: boolean;
  ruleCount: number;
}> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const headerRules = existingRules.filter(
    r => r.id >= HEADER_RULE_START && r.id < 5000
  );
  
  return {
    refererStripping: headerRules.some(r => 
      r.id === RULE_IDS.STRIP_REFERER || r.id === RULE_IDS.STRIP_REFERER_MAIN_FRAME
    ),
    gpcEnabled: headerRules.some(r => r.id === RULE_IDS.ADD_GPC),
    paramStripping: headerRules.some(
      r => r.id >= RULE_IDS.STRIP_TRACKING_PARAMS_BASE
    ),
    ruleCount: headerRules.length,
  };
}

/**
 * Toggle specific header feature
 */
export async function toggleHeaderFeature(
  feature: 'headerMinimization' | 'sendGPC' | 'stripTrackingParams',
  enabled: boolean
): Promise<void> {
  const settings = await storage.get('privacySettings');
  if (!settings) return;
  
  settings[feature] = enabled;
  await storage.set('privacySettings', settings);
  
  // Refresh rules
  await updateHeaderRules();
  
  console.log(`[Privacy] Header feature toggled: ${feature} = ${enabled}`);
}

/** Track last matched rule count for delta calculation */
let lastMatchedRuleCount = 0;

/**
 * Set up listener for main frame navigations to track request modifications
 * Since DNR doesn't provide direct feedback in MV3, we track navigations
 * where header rules would apply
 */
export function setupRequestModificationTracking(): void {
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    // Only track main frame navigations
    if (details.frameId !== 0) return;
    
    // Skip non-http(s) URLs
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      return;
    }
    
    const settings = await storage.get('privacySettings');
    if (!settings?.enabled) return;
    
    // Check if any header modification rules are active
    const status = await getHeaderRuleStatus();
    
    // If GPC is enabled, every main frame navigation gets the header
    if (status.gpcEnabled) {
      logRequestModified();
    }
    
    // If param stripping is enabled and URL had tracking params, it was modified
    if (status.paramStripping && hasTrackingParams(details.url)) {
      logRequestModified();
    }
  });
  
  console.log('[Privacy] Request modification tracking initialized');
}

/**
 * Check if URL contains tracking parameters
 */
function hasTrackingParams(url: string): boolean {
  try {
    const urlObj = new URL(url);
    for (const param of TRACKING_PARAMS.slice(0, 20)) {
      if (urlObj.searchParams.has(param)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

