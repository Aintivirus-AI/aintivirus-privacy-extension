import { logBlockedRequest, updateActiveRuleCount } from './metrics';
import { initializeRulesetManager, getRulesetStats } from './rulesetManager';

const SITE_EXCEPTION_BASE_ID = 50000;

const activeSiteExceptions = new Map<string, number>();
let nextExceptionId = SITE_EXCEPTION_BASE_ID;

export async function initializeBlocker(): Promise<void> {
  try {
    await initializeRulesetManager();

    const stats = await getRulesetStats();

    updateActiveRuleCount(stats.enabledRulesets.length);

    setupRuleMatchListener();
  } catch (error) {
    throw error;
  }
}

export async function addSiteException(domain: string): Promise<void> {
  if (activeSiteExceptions.has(domain)) {
    return;
  }

  const ruleId = nextExceptionId++;

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [
      {
        id: ruleId,
        priority: 2000000,
        action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
        },
      },
      {
        id: ruleId + 1,
        priority: 2000000,
        action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
        condition: {
          initiatorDomains: [domain],
        },
      },
    ],
  });

  activeSiteExceptions.set(domain, ruleId);
}

export async function removeSiteException(domain: string): Promise<void> {
  const ruleId = activeSiteExceptions.get(domain);
  if (!ruleId) {
    return;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId, ruleId + 1],
  });

  activeSiteExceptions.delete(domain);
}

export function hasSiteException(domain: string): boolean {
  return activeSiteExceptions.has(domain);
}

export function getSiteExceptions(): string[] {
  return Array.from(activeSiteExceptions.keys());
}

export async function getBlockerStatus(): Promise<{
  isActive: boolean;
  enabledRulesets: string[];
  siteExceptionCount: number;
  filteringLevel: string;
}> {
  const stats = await getRulesetStats();

  return {
    isActive: stats.enabledRulesets.length > 0,
    enabledRulesets: stats.enabledRulesets,
    siteExceptionCount: activeSiteExceptions.size,
    filteringLevel: stats.filteringLevel,
  };
}

export async function disableBlocker(): Promise<void> {
  const ruleIds: number[] = [];
  activeSiteExceptions.forEach((ruleId) => {
    ruleIds.push(ruleId, ruleId + 1);
  });

  if (ruleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds,
    });
  }

  activeSiteExceptions.clear();
  nextExceptionId = SITE_EXCEPTION_BASE_ID;
  updateActiveRuleCount(0);
}

export async function getBlockedCount(tabId: number): Promise<number> {
  try {
    const matchedRules = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    return matchedRules.rulesMatchedInfo.length;
  } catch {
    return 0;
  }
}

function setupRuleMatchListener(): void {
  if (!chrome.declarativeNetRequest.onRuleMatchedDebug) {
    return;
  }

  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (info.request.tabId > 0) {
      logBlockedRequest(info.request.tabId, info.request.url, info.rule.ruleId);
    }
  });
}

export function getActiveRuleCount(): number {
  return activeSiteExceptions.size;
}
