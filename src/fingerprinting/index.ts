// Fingerprint protection coordinator
// Injects scripts that mess with browser APIs to make fingerprinting harder

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

// Start up the fingerprint protection
export async function initializeFingerprintProtection(): Promise<void> {
  console.log('[Fingerprint] Initializing fingerprint protection module...');
  
  sessionSeed = generateSessionSeed();
  setupNavigationListener();
  
  chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
  });
  
  console.log('[Fingerprint] Fingerprint protection initialized');
}

export function shutdownFingerprintProtection(): void {
  console.log('[Fingerprint] Shutting down fingerprint protection');
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
  console.log('[Fingerprint] Settings updated:', updated);
}

// Status info for the UI
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

// Inject our stuff when users navigate to a new page
function setupNavigationListener(): void {
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return; // main frame only
    
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      return;
    }
    
    try {
      await injectFingerprintProtection(details.tabId, details.url);
    } catch (error) {
      // Can't inject on some pages (chrome web store, etc) - that's fine
      if (error instanceof Error && !error.message.includes('Cannot access')) {
        console.warn('[Fingerprint] Injection failed:', error.message);
      }
    }
  });
}

// Actually inject the protection script into a tab
async function injectFingerprintProtection(
  tabId: number,
  url: string
): Promise<void> {
  const settings = await getFingerprintSettings();
  if (!settings.enabled) return;
  
  const domain = extractDomain(url);
  if (!domain) {
    console.log('[Fingerprint] Could not extract domain from URL:', url);
    return;
  }
  
  const siteMode = await getSiteMode(domain);
  if (siteMode === 'disabled') {
    console.log('[Fingerprint] Skipping injection for disabled site:', domain);
    return;
  }
  
  const config = buildInjectionConfig(settings, domain);
  
  // Random key so sites can't easily detect us
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

// Build the config we'll pass to the injected script
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
      availHeight: resolution.height - 40, // fake taskbar
      colorDepth: 24,
      pixelDepth: 24,
    },
    trackerDomains: BOOTSTRAP_TRACKER_DOMAINS,
  };
}

// For manually injecting into a tab from the popup
export async function injectIntoTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      await injectFingerprintProtection(tabId, tab.url);
      return true;
    }
  } catch (error) {
    console.warn('[Fingerprint] Manual injection failed:', error);
  }
  return false;
}

// Handle messages from popup/settings
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

