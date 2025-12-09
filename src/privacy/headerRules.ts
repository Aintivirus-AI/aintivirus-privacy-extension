

import { TRACKING_PARAMS } from './types';
import { storage } from '@shared/storage';
import { logRequestModified } from './metrics';


type RuleActionType = chrome.declarativeNetRequest.RuleActionType;
type ResourceType = chrome.declarativeNetRequest.ResourceType;
type HeaderOperation = chrome.declarativeNetRequest.HeaderOperation;


const HEADER_RULE_START = 4501;


const RULE_IDS = {
  STRIP_REFERER: 4501,
  STRIP_REFERER_MAIN_FRAME: 4503,
  ADD_GPC: 4502,
  STRIP_TRACKING_PARAMS_BASE: 4510, 
};


export async function initializeHeaderRules(): Promise<void> {
  const settings = await storage.get('privacySettings');
  
  if (!settings?.enabled) {
    return;
  }
  
  const rulesToAdd: chrome.declarativeNetRequest.Rule[] = [];
  
  
  if (settings.headerMinimization) {
    rulesToAdd.push(createRefererStripRule());
    rulesToAdd.push(createMainFrameRefererStripRule());
  }
  
  
  if (settings.sendGPC) {
    rulesToAdd.push(createGPCRule());
  }
  
  
  if (rulesToAdd.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rulesToAdd,
    });

  }
  
  
  setupRequestModificationTracking();
}


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
      
      domainType: 'thirdParty' as chrome.declarativeNetRequest.DomainType,
      resourceTypes: ['main_frame'] as ResourceType[],
    },
  };
}


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


export function createTrackingParamStripRules(): chrome.declarativeNetRequest.Rule[] {
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  let ruleId = RULE_IDS.STRIP_TRACKING_PARAMS_BASE;
  
  
  const topParams = TRACKING_PARAMS.slice(0, 20);
  
  for (const param of topParams) {
    
    
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
        
        resourceTypes: ['main_frame'] as ResourceType[],
        
        regexFilter: `[?&]${escapeRegex(param)}=`,
        isUrlFilterCaseSensitive: false,
      },
    });
  }
  
  return rules;
}


function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


export async function updateHeaderRules(): Promise<void> {
  const settings = await storage.get('privacySettings');
  
  
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const headerRuleIds = existingRules
    .filter(r => r.id >= HEADER_RULE_START && r.id < 5000)
    .map(r => r.id);
  
  
  if (headerRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: headerRuleIds,
    });
  }
  
  
  if (!settings?.enabled) {
    return;
  }
  
  const rulesToAdd: chrome.declarativeNetRequest.Rule[] = [];
  
  
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
  
  
  if (rulesToAdd.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rulesToAdd,
    });

  }
}


export async function removeHeaderRules(): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const headerRuleIds = existingRules
    .filter(r => r.id >= HEADER_RULE_START && r.id < 5000)
    .map(r => r.id);
  
  if (headerRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: headerRuleIds,
    });

  }
}


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


export async function toggleHeaderFeature(
  feature: 'headerMinimization' | 'sendGPC' | 'stripTrackingParams',
  enabled: boolean
): Promise<void> {
  const settings = await storage.get('privacySettings');
  if (!settings) return;
  
  settings[feature] = enabled;
  await storage.set('privacySettings', settings);
  
  
  await updateHeaderRules();

}


let lastMatchedRuleCount = 0;


export function setupRequestModificationTracking(): void {
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    
    if (details.frameId !== 0) return;
    
    
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      return;
    }
    
    const settings = await storage.get('privacySettings');
    if (!settings?.enabled) return;
    
    
    const status = await getHeaderRuleStatus();
    
    
    if (status.gpcEnabled) {
      logRequestModified();
    }
    
    
    if (status.paramStripping && hasTrackingParams(details.url)) {
      logRequestModified();
    }
  });

}


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

