

import { storage } from '@shared/storage';
import { 
  FingerprintSettings, 
  DEFAULT_FINGERPRINT_SETTINGS,
  InjectedScriptConfig,
  COMMON_RESOLUTIONS,
  FingerprintStatus,
} from './types';
import { 
  generateSessionSeed, 
  generateDomainSeed, 
  pickResolution,
} from './noise';
import { getSiteMode } from '../privacy/siteSettings';
import { extractDomain } from '../privacy/utils';
import { logScriptIntercepted } from '../privacy/metrics';
import { BOOTSTRAP_TRACKER_DOMAINS } from '../privacy/types';

let sessionSeed: number | null = null;
const injectedTabs = new Set<number>();


export async function initializeFingerprintProtection(): Promise<void> {

  sessionSeed = generateSessionSeed();
  setupNavigationListener();
  
  chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
  });

}

export function shutdownFingerprintProtection(): void {

  injectedTabs.clear();
}

export async function getFingerprintSettings(): Promise<FingerprintSettings> {
  const settings = await storage.get('fingerprintSettings');
  return settings || DEFAULT_FINGERPRINT_SETTINGS;
}

export async function setFingerprintSettings(
  settings: Partial<FingerprintSettings>
): Promise<void> {
  const current = await getFingerprintSettings();
  const updated = { ...current, ...settings };
  await storage.set('fingerprintSettings', updated);

}


export async function getFingerprintStatus(): Promise<FingerprintStatus> {
  const settings = await getFingerprintSettings();
  
  return {
    isEnabled: settings.enabled,
    protectionsActive: {
      canvas: settings.enabled && settings.canvasNoise,
      webgl: settings.enabled && settings.webglMask,
      screen: settings.enabled && settings.screenMask,
      audio: settings.enabled && settings.audioNoise,
      clientHints: settings.enabled && settings.clientHintsMask,
    },
    injectedTabCount: injectedTabs.size,
  };
}


function setupNavigationListener(): void {
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return; 
    
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      return;
    }
    
    try {
      await injectFingerprintProtection(details.tabId, details.url);
    } catch (error) {
      
      if (error instanceof Error && !error.message.includes('Cannot access')) {

      }
    }
  });
}


async function injectFingerprintProtection(
  tabId: number,
  url: string
): Promise<void> {
  const settings = await getFingerprintSettings();
  if (!settings.enabled) return;
  
  const domain = extractDomain(url);
  if (!domain) {

    return;
  }
  
  const siteMode = await getSiteMode(domain);
  if (siteMode === 'disabled') {

    return;
  }
  
  const config = buildInjectionConfig(settings, domain);
  
  
  const configKey = '_fp_cfg_' + Math.random().toString(36).substring(2, 10);
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    func: (key: string, configJson: string) => {
      (window as unknown as Record<string, unknown>)[key] = JSON.parse(configJson);
    },
    args: [configKey, JSON.stringify(config)],
  });
  
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    files: ['fingerprintInjected.js'],
  });
  
  injectedTabs.add(tabId);
  logScriptIntercepted();
}


function buildInjectionConfig(
  settings: FingerprintSettings,
  domain: string
): InjectedScriptConfig {
  if (sessionSeed === null) {
    sessionSeed = generateSessionSeed();
  }
  const domainSeed = generateDomainSeed(domain, sessionSeed);
  const resolution = pickResolution(domainSeed, COMMON_RESOLUTIONS);
  
  return {
    noiseSeed: domainSeed,
    protections: {
      canvas: settings.canvasNoise,
      webgl: settings.webglMask,
      screen: settings.screenMask,
      audio: settings.audioNoise,
      clientHints: settings.clientHintsMask,
      hardwareConcurrency: settings.hardwareConcurrencyMask,
      deviceMemory: settings.deviceMemoryMask,
      languages: settings.languagesMask,
      plugins: settings.pluginsMask,
      timezone: settings.timezoneMask,
    },
    maskedScreen: {
      width: resolution.width,
      height: resolution.height,
      availWidth: resolution.width,
      availHeight: resolution.height - 40, 
      colorDepth: 24,
      pixelDepth: 24,
    },
    trackerDomains: BOOTSTRAP_TRACKER_DOMAINS,
  };
}


export async function injectIntoTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      await injectFingerprintProtection(tabId, tab.url);
      return true;
    }
  } catch (error) {

  }
  return false;
}


export async function handleFingerprintMessage(
  type: string,
  payload: unknown
): Promise<unknown> {
  switch (type) {
    case 'GET_FINGERPRINT_SETTINGS':
      return getFingerprintSettings();
      
    case 'SET_FINGERPRINT_SETTINGS':
      await setFingerprintSettings(payload as Partial<FingerprintSettings>);
      return { success: true };
      
    case 'GET_FINGERPRINT_STATUS':
      return getFingerprintStatus();
      
    default:
      throw new Error(`Unknown fingerprint message type: ${type}`);
  }
}

export * from './types';

