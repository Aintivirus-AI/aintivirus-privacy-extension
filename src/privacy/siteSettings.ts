/**
 * AINTIVIRUS Site Settings
 * 
 * Manages per-site privacy configuration.
 * Each site can have one of three modes:
 * - normal: Standard privacy protections (third-party blocking/cleanup)
 * - strict: Maximum privacy (block everything, delete all cookies)
 * - disabled: No privacy protections for this site
 */

import { storage } from '@shared/storage';
import { SitePrivacyMode, SitePrivacySettings } from './types';
import { addSiteException, removeSiteException } from './requestBlocker';
import { normalizeDomain } from './utils';

// Re-export for backward compatibility
export { normalizeDomain } from './utils';

/**
 * Get all site privacy settings
 */
export async function getAllSiteSettings(): Promise<SitePrivacySettings> {
  const settings = await storage.get('privacySiteSettings');
  return settings || {};
}

/**
 * Get the privacy mode for a specific site
 * Returns 'normal' as default if no specific setting exists
 */
export async function getSiteMode(domain: string): Promise<SitePrivacyMode> {
  const normalized = normalizeDomain(domain);
  const settings = await getAllSiteSettings();
  
  // Check exact match first
  if (settings[normalized]) {
    return settings[normalized];
  }
  
  // Check parent domain (e.g., sub.example.com falls back to example.com)
  const parts = normalized.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (settings[parent]) {
      return settings[parent];
    }
  }
  
  // Default to 'normal' mode
  return 'normal';
}

/**
 * Set the privacy mode for a specific site
 */
export async function setSiteMode(
  domain: string, 
  mode: SitePrivacyMode
): Promise<void> {
  const normalized = normalizeDomain(domain);
  const settings = await getAllSiteSettings();
  
  const previousMode = settings[normalized];
  
  // Update the setting
  if (mode === 'normal') {
    // Remove the entry since normal is the default
    delete settings[normalized];
  } else {
    settings[normalized] = mode;
  }
  
  await storage.set('privacySiteSettings', settings);
  
  // Handle DNR site exception changes
  if (mode === 'disabled' && previousMode !== 'disabled') {
    // Site is now disabled, add exception to bypass blocking
    await addSiteException(normalized);
  } else if (previousMode === 'disabled' && mode !== 'disabled') {
    // Site is no longer disabled, remove exception
    await removeSiteException(normalized);
  }
  
  console.log(`[Privacy] Site mode set: ${normalized} = ${mode}`);
}

/**
 * Remove site-specific setting (reverts to default)
 */
export async function removeSiteSetting(domain: string): Promise<void> {
  const normalized = normalizeDomain(domain);
  const settings = await getAllSiteSettings();
  
  const previousMode = settings[normalized];
  delete settings[normalized];
  
  await storage.set('privacySiteSettings', settings);
  
  // Remove any site exception if it was disabled
  if (previousMode === 'disabled') {
    await removeSiteException(normalized);
  }
  
  console.log(`[Privacy] Site setting removed: ${normalized}`);
}

/**
 * Get sites with a specific mode
 */
export async function getSitesByMode(mode: SitePrivacyMode): Promise<string[]> {
  const settings = await getAllSiteSettings();
  
  return Object.entries(settings)
    .filter(([_, m]) => m === mode)
    .map(([domain, _]) => domain);
}

/**
 * Get count of sites per mode
 */
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

/**
 * Import site settings (for backup/restore)
 */
export async function importSiteSettings(
  settings: SitePrivacySettings, 
  merge = true
): Promise<void> {
  if (merge) {
    const existing = await getAllSiteSettings();
    const merged = { ...existing, ...settings };
    await storage.set('privacySiteSettings', merged);
  } else {
    await storage.set('privacySiteSettings', settings);
  }
  
  // Sync DNR exceptions
  await syncSiteExceptions();
  
  console.log(`[Privacy] Imported ${Object.keys(settings).length} site settings`);
}

/**
 * Export site settings (for backup)
 */
export async function exportSiteSettings(): Promise<SitePrivacySettings> {
  return getAllSiteSettings();
}

/**
 * Clear all site settings
 */
export async function clearAllSiteSettings(): Promise<void> {
  // Remove all site exceptions first
  const settings = await getAllSiteSettings();
  for (const [domain, mode] of Object.entries(settings)) {
    if (mode === 'disabled') {
      await removeSiteException(domain);
    }
  }
  
  await storage.set('privacySiteSettings', {});
  console.log('[Privacy] Cleared all site settings');
}

/**
 * Sync DNR site exceptions with current settings
 * Should be called after import or on startup
 */
export async function syncSiteExceptions(): Promise<void> {
  const settings = await getAllSiteSettings();
  
  for (const [domain, mode] of Object.entries(settings)) {
    if (mode === 'disabled') {
      await addSiteException(domain);
    }
  }
}

/**
 * Search site settings by domain
 */
export async function searchSiteSettings(
  query: string
): Promise<{ domain: string; mode: SitePrivacyMode }[]> {
  const settings = await getAllSiteSettings();
  const normalizedQuery = query.toLowerCase();
  
  return Object.entries(settings)
    .filter(([domain, _]) => domain.includes(normalizedQuery))
    .map(([domain, mode]) => ({ domain, mode }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * Get suggested mode based on domain characteristics
 * Can be used to provide recommendations in the UI
 */
export function getSuggestedMode(domain: string): SitePrivacyMode {
  const normalized = normalizeDomain(domain);
  
  // Suggest 'strict' for known tracking/analytics domains
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
  
  // Suggest 'disabled' for common trusted services that might break
  const disabledDomains = [
    'github.com',
    'stackoverflow.com',
    'microsoft.com',
  ];
  
  for (const d of disabledDomains) {
    if (normalized.includes(d)) {
      return 'disabled';
    }
  }
  
  return 'normal';
}

/**
 * Bulk update site modes
 */
export async function bulkSetSiteMode(
  domains: string[], 
  mode: SitePrivacyMode
): Promise<void> {
  for (const domain of domains) {
    await setSiteMode(domain, mode);
  }
  
  console.log(`[Privacy] Bulk updated ${domains.length} sites to mode: ${mode}`);
}

