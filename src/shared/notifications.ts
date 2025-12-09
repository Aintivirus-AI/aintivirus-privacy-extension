

import { getFeatureFlag } from './featureFlags';

export type NotificationType = 
  | 'phishing'
  | 'connection_warning'
  | 'transaction_warning'
  | 'tracker_blocked'
  | 'wallet_activity'
  | 'security_alert';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface NotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;      
  tabId?: number;          
  contextId?: string;      
  requireInteraction?: boolean;  
}

function getPriorityLevel(priority: NotificationPriority): 0 | 1 | 2 {
  switch (priority) {
    case 'critical': return 2;
    case 'high': return 2;
    case 'medium': return 1;
    case 'low': return 0;
    default: return 1;
  }
}

function getIconForType(type: NotificationType): string {
  return 'icons/icon128.png';
}

function generateNotificationId(type: NotificationType, contextId?: string): string {
  const timestamp = Date.now();
  const base = `aintivirus-${type}-${timestamp}`;
  return contextId ? `${base}-${contextId}` : base;
}

const notificationHandlers = new Map<string, { actionUrl?: string; tabId?: number }>();

export async function areNotificationsEnabled(): Promise<boolean> {
  return getFeatureFlag('notifications');
}


export async function showNotification(options: NotificationOptions): Promise<string | null> {
  const enabled = await areNotificationsEnabled();
  if (!enabled) {

    return null;
  }

  const {
    type,
    title,
    message,
    priority = 'medium',
    actionUrl,
    tabId,
    contextId,
    requireInteraction = false,
  } = options;

  const notificationId = generateNotificationId(type, contextId);
  
  if (actionUrl || tabId) {
    notificationHandlers.set(notificationId, { actionUrl, tabId });
  }

  return new Promise((resolve) => {
    chrome.notifications.create(
      notificationId,
      {
        type: 'basic',
        iconUrl: getIconForType(type),
        title: `🛡️ ${title}`,
        message,
        priority: getPriorityLevel(priority),
        requireInteraction: requireInteraction || priority === 'critical',
      },
      (createdId) => {
        if (chrome.runtime.lastError) {

          resolve(null);
        } else {

          resolve(createdId);
        }
      }
    );
  });
}

export function clearNotification(notificationId: string): void {
  chrome.notifications.clear(notificationId);
  notificationHandlers.delete(notificationId);
}


export function initializeNotificationHandlers(): void {
  chrome.notifications.onClicked.addListener((notificationId) => {

    const handler = notificationHandlers.get(notificationId);
    if (handler) {
      if (handler.tabId) {
        chrome.tabs.update(handler.tabId, { active: true });
        chrome.tabs.get(handler.tabId, (tab) => {
          if (tab.windowId) {
            chrome.windows.update(tab.windowId, { focused: true });
          }
        });
      } else if (handler.actionUrl) {
        chrome.tabs.create({ url: handler.actionUrl });
      }
      notificationHandlers.delete(notificationId);
    }
    chrome.notifications.clear(notificationId);
  });

  chrome.notifications.onClosed.addListener((notificationId) => {
    notificationHandlers.delete(notificationId);
  });

}


export async function notifyPhishingSite(
  domain: string,
  riskLevel: string,
  tabId?: number
): Promise<string | null> {
  return showNotification({
    type: 'phishing',
    title: 'Phishing Site Detected',
    message: `${domain} has been flagged as a potential phishing site. Risk level: ${riskLevel.toUpperCase()}`,
    priority: riskLevel === 'high' ? 'critical' : 'high',
    tabId,
    contextId: domain,
    requireInteraction: true,
  });
}

export async function notifyConnectionRequest(
  domain: string,
  riskLevel: string,
  tabId?: number
): Promise<string | null> {
  return showNotification({
    type: 'connection_warning',
    title: 'Wallet Connection Request',
    message: `${domain} is requesting wallet access. Risk assessment: ${riskLevel.toUpperCase()}`,
    priority: riskLevel === 'high' ? 'high' : 'medium',
    tabId,
    contextId: `conn-${domain}`,
  });
}

export async function notifyRiskyTransaction(
  domain: string,
  riskLevel: string,
  warnings: string[],
  tabId?: number
): Promise<string | null> {
  const warningText = warnings.length > 0 
    ? ` Issues: ${warnings.slice(0, 2).join(', ')}${warnings.length > 2 ? '...' : ''}`
    : '';
  
  return showNotification({
    type: 'transaction_warning',
    title: 'Transaction Risk Alert',
    message: `${domain} transaction flagged as ${riskLevel.toUpperCase()}.${warningText}`,
    priority: riskLevel === 'high' ? 'critical' : 'high',
    tabId,
    contextId: `tx-${Date.now()}`,
    requireInteraction: true,
  });
}


let blockedCount = 0;
let blockedNotificationTimeout: ReturnType<typeof setTimeout> | null = null;

export async function notifyBlockedContent(
  domain: string,
  count: number = 1
): Promise<void> {
  blockedCount += count;
  
  if (blockedNotificationTimeout) {
    return;
  }
  
  blockedNotificationTimeout = setTimeout(async () => {
    if (blockedCount > 0) {
      await showNotification({
        type: 'tracker_blocked',
        title: 'Trackers Blocked',
        message: `Blocked ${blockedCount} tracker${blockedCount > 1 ? 's' : ''} on ${domain}`,
        priority: 'low',
        contextId: `blocked-${domain}`,
      });
      blockedCount = 0;
    }
    blockedNotificationTimeout = null;
  }, 10000);
}

export async function notifySecurityAlert(
  title: string,
  message: string,
  priority: NotificationPriority = 'medium',
  tabId?: number
): Promise<string | null> {
  return showNotification({
    type: 'security_alert',
    title,
    message,
    priority,
    tabId,
  });
}

