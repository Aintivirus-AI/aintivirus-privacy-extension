import { storage } from '@shared/storage';
import { SitePrivacyMode, SitePrivacySettings } from './types';
import { addSiteException, removeSiteException } from './requestBlocker';
import { normalizeDomain } from './utils';

export { normalizeDomain } from './utils';

export async function getAllSiteSettings(): Promise<SitePrivacySettings> {
  const settings = await storage.get('privacySiteSettings');
  return settings || {};
}

export async function getSiteMode(domain: string): Promise<SitePrivacyMode> {
  const normalized = normalizeDomain(domain);
  const settings = await getAllSiteSettings();

  if (settings[normalized]) {
    return settings[normalized];
  }

  const parts = normalized.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (settings[parent]) {
      return settings[parent];
    }
  }

  const privacySettings = await storage.get('privacySettings');
  if (privacySettings && privacySettings.defaultCookieMode) {
    switch (privacySettings.defaultCookieMode) {
      case 'all':
        return 'strict';
      case 'third-party':
        return 'normal';
      case 'none':
        return 'disabled';
      default:
        return 'normal';
    }
  }

  return 'normal';
}

export async function setSiteMode(domain: string, mode: SitePrivacyMode): Promise<void> {
  const normalized = normalizeDomain(domain);
  const settings = await getAllSiteSettings();

  const previousMode = settings[normalized];

  if (mode === 'normal') {
    delete settings[normalized];
  } else {
    settings[normalized] = mode;
  }

  await storage.set('privacySiteSettings', settings);

  if (mode === 'disabled' && previousMode !== 'disabled') {
    await addSiteException(normalized);
  } else if (previousMode === 'disabled' && mode !== 'disabled') {
    await removeSiteException(normalized);
  }
}

export async function removeSiteSetting(domain: string): Promise<void> {
  const normalized = normalizeDomain(domain);
  const settings = await getAllSiteSettings();

  const previousMode = settings[normalized];
  delete settings[normalized];

  await storage.set('privacySiteSettings', settings);

  if (previousMode === 'disabled') {
    await removeSiteException(normalized);
  }
}

export async function getSitesByMode(mode: SitePrivacyMode): Promise<string[]> {
  const settings = await getAllSiteSettings();

  return Object.entries(settings)
    .filter(([_, m]) => m === mode)
    .map(([domain, _]) => domain);
}

export async function getSiteModeStats(): Promise<{
  normal: number;
  strict: number;
  disabled: number;
  total: number;
}> {
  const settings = await getAllSiteSettings();

  const stats = {
    normal: 0,
    strict: 0,
    disabled: 0,
    total: 0,
  };

  for (const mode of Object.values(settings)) {
    stats[mode]++;
    stats.total++;
  }

  return stats;
}

export async function importSiteSettings(
  settings: SitePrivacySettings,
  merge = true,
): Promise<void> {
  if (merge) {
    const existing = await getAllSiteSettings();
    const merged = { ...existing, ...settings };
    await storage.set('privacySiteSettings', merged);
  } else {
    await storage.set('privacySiteSettings', settings);
  }

  await syncSiteExceptions();
}

export async function exportSiteSettings(): Promise<SitePrivacySettings> {
  return getAllSiteSettings();
}

export async function clearAllSiteSettings(): Promise<void> {
  const settings = await getAllSiteSettings();
  for (const [domain, mode] of Object.entries(settings)) {
    if (mode === 'disabled') {
      await removeSiteException(domain);
    }
  }

  await storage.set('privacySiteSettings', {});
}

export async function syncSiteExceptions(): Promise<void> {
  const settings = await getAllSiteSettings();

  for (const [domain, mode] of Object.entries(settings)) {
    if (mode === 'disabled') {
      await addSiteException(domain);
    }
  }
}

export async function searchSiteSettings(
  query: string,
): Promise<{ domain: string; mode: SitePrivacyMode }[]> {
  const settings = await getAllSiteSettings();
  const normalizedQuery = query.toLowerCase();

  return Object.entries(settings)
    .filter(([domain, _]) => domain.toLowerCase().includes(normalizedQuery))
    .map(([domain, mode]) => ({ domain, mode }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

export function getSuggestedMode(domain: string): SitePrivacyMode {
  const normalized = normalizeDomain(domain);

  const strictDomains = [
    'google-analytics.com',
    'doubleclick.net',
    'facebook.com',
    'twitter.com',
    'linkedin.com',
  ];

  for (const d of strictDomains) {
    if (normalized.includes(d)) {
      return 'strict';
    }
  }

  const disabledDomains = ['github.com', 'stackoverflow.com', 'microsoft.com'];

  for (const d of disabledDomains) {
    if (normalized.includes(d)) {
      return 'disabled';
    }
  }

  return 'normal';
}

export async function bulkSetSiteMode(domains: string[], mode: SitePrivacyMode): Promise<void> {
  for (const domain of domains) {
    await setSiteMode(domain, mode);
  }
}
