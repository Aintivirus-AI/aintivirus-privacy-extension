

import { logBlockedRequest } from './metrics';


const tabBlockCounts = new Map<number, number>();


const POLL_INTERVAL = 3000;


let pollTimer: ReturnType<typeof setInterval> | null = null;


let debugMode = false;


let usingRealtimeAPI = false;


export function initializeBlockCountTracker(): void {

  
  debugMode = process.env.NODE_ENV !== 'production';
  
  
  if (chrome.declarativeNetRequest.onRuleMatchedDebug) {

    usingRealtimeAPI = true;
    
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
      const tabId = info.request.tabId;
      if (tabId && tabId > 0) {
        
        const currentCount = tabBlockCounts.get(tabId) || 0;
        tabBlockCounts.set(tabId, currentCount + 1);
        
        
        logBlockedRequest(
          tabId,
          info.request.url,
          info.rule.ruleId
        );
        
        if (debugMode) {

        }
      }
    });
  } else {

    
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    pollTimer = setInterval(pollBlockCounts, POLL_INTERVAL);
    pollBlockCounts();
    
    
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete') {
        setTimeout(() => checkTabBlocks(tabId), 1000);
      }
    });
  }
  
  
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabBlockCounts.delete(tabId);
    if (debugMode) {

    }
  });

}


export function shutdownBlockCountTracker(): void {
  
  
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  tabBlockCounts.clear();
  usingRealtimeAPI = false;

}


async function checkTabBlocks(tabId: number): Promise<void> {
  try {
    
    const result = await chrome.declarativeNetRequest.getMatchedRules({
      tabId: tabId,
    });
    
    const currentCount = result.rulesMatchedInfo?.length || 0;
    const previousCount = tabBlockCounts.get(tabId) || 0;
    
    if (debugMode && currentCount > 0) {

    }
    
    
    if (currentCount > previousCount) {
      const newBlocks = currentCount - previousCount;
      
      if (debugMode) {

      }
      
      
      for (let i = 0; i < newBlocks; i++) {
        const ruleIndex = previousCount + i;
        const ruleInfo = result.rulesMatchedInfo?.[ruleIndex];
        
        if (ruleInfo) {
          
          logBlockedRequest(
            tabId,
            'blocked-request', 
            ruleInfo.rule.ruleId
          );
        } else {
          
          logBlockedRequest(
            tabId,
            'blocked-request',
            0
          );
        }
      }
    }
    
    
    tabBlockCounts.set(tabId, currentCount);
    
  } catch (error) {
    if (debugMode) {

    }
  }
}


async function pollBlockCounts(): Promise<void> {
  try {
    
    const tabs = await chrome.tabs.query({});
    
    if (debugMode) {

    }
    
    
    for (const tab of tabs) {
      if (!tab.id || tab.id < 0) continue;
      
      
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        await checkTabBlocks(tab.id);
      }
    }
    
  } catch (error) {

  }
}


export function getTabBlockCount(tabId: number): number {
  return tabBlockCounts.get(tabId) || 0;
}


export function getTotalBlockCount(): number {
  let total = 0;
  for (const count of tabBlockCounts.values()) {
    total += count;
  }
  return total;
}


export async function checkTabBlocksNow(tabId: number): Promise<void> {
  await checkTabBlocks(tabId);
}

