/**
 * Tests for site privacy settings functionality
 */

import {
  getAllSiteSettings,
  getSiteMode,
  setSiteMode,
  removeSiteSetting,
  getSitesByMode,
  getSiteModeStats,
  importSiteSettings,
  exportSiteSettings,
  clearAllSiteSettings,
  searchSiteSettings,
  getSuggestedMode,
  bulkSetSiteMode,
} from '../siteSettings';
import { SitePrivacyMode } from '../types';

// Mock dependencies
const mockStorage: { [key: string]: any } = {};

jest.mock('@shared/storage', () => ({
  storage: {
    get: jest.fn((key: string) => Promise.resolve(mockStorage[key])),
    set: jest.fn((key: string, value: any) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
  },
}));

jest.mock('../requestBlocker', () => ({
  addSiteException: jest.fn(() => Promise.resolve()),
  removeSiteException: jest.fn(() => Promise.resolve()),
}));

import { addSiteException, removeSiteException } from '../requestBlocker';

const mockAddSiteException = addSiteException as jest.Mock;
const mockRemoveSiteException = removeSiteException as jest.Mock;

describe('SiteSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock storage
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  });

  describe('getAllSiteSettings', () => {
    it('should return empty object when no settings exist', async () => {
      const settings = await getAllSiteSettings();
      expect(settings).toEqual({});
    });

    it('should return existing settings', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
        'test.com': 'disabled',
      };

      const settings = await getAllSiteSettings();

      expect(settings).toEqual({
        'example.com': 'strict',
        'test.com': 'disabled',
      });
    });
  });

  describe('getSiteMode', () => {
    it('should return normal as default mode', async () => {
      const mode = await getSiteMode('newsite.com');
      expect(mode).toBe('normal');
    });

    it('should return stored mode for domain', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
      };

      const mode = await getSiteMode('example.com');
      expect(mode).toBe('strict');
    });

    it('should normalize domain (lowercase, remove www)', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'disabled',
      };

      const mode = await getSiteMode('WWW.EXAMPLE.COM');
      expect(mode).toBe('disabled');
    });

    it('should check parent domains', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
      };

      const mode = await getSiteMode('subdomain.example.com');
      expect(mode).toBe('strict');
    });

    it('should use privacy settings default cookie mode', async () => {
      mockStorage.privacySettings = {
        defaultCookieMode: 'all',
      };

      const mode = await getSiteMode('newsite.com');
      expect(mode).toBe('strict');
    });

    it('should map cookie mode "third-party" to "normal"', async () => {
      mockStorage.privacySettings = {
        defaultCookieMode: 'third-party',
      };

      const mode = await getSiteMode('newsite.com');
      expect(mode).toBe('normal');
    });

    it('should map cookie mode "none" to "disabled"', async () => {
      mockStorage.privacySettings = {
        defaultCookieMode: 'none',
      };

      const mode = await getSiteMode('newsite.com');
      expect(mode).toBe('disabled');
    });
  });

  describe('setSiteMode', () => {
    it('should set site mode', async () => {
      await setSiteMode('example.com', 'strict');

      expect(mockStorage.privacySiteSettings['example.com']).toBe('strict');
    });

    it('should remove setting when mode is normal', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
      };

      await setSiteMode('example.com', 'normal');

      expect(mockStorage.privacySiteSettings['example.com']).toBeUndefined();
    });

    it('should add site exception when mode changes to disabled', async () => {
      mockStorage.privacySiteSettings = {};

      await setSiteMode('example.com', 'disabled');

      expect(mockAddSiteException).toHaveBeenCalledWith('example.com');
    });

    it('should remove site exception when mode changes from disabled', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'disabled',
      };

      await setSiteMode('example.com', 'strict');

      expect(mockRemoveSiteException).toHaveBeenCalledWith('example.com');
    });

    it('should normalize domain before storing', async () => {
      await setSiteMode('WWW.EXAMPLE.COM', 'strict');

      expect(mockStorage.privacySiteSettings['example.com']).toBe('strict');
    });
  });

  describe('removeSiteSetting', () => {
    it('should remove site setting', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
        'other.com': 'disabled',
      };

      await removeSiteSetting('example.com');

      expect(mockStorage.privacySiteSettings['example.com']).toBeUndefined();
      expect(mockStorage.privacySiteSettings['other.com']).toBe('disabled');
    });

    it('should remove site exception if mode was disabled', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'disabled',
      };

      await removeSiteSetting('example.com');

      expect(mockRemoveSiteException).toHaveBeenCalledWith('example.com');
    });

    it('should not call removeSiteException if mode was not disabled', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
      };

      await removeSiteSetting('example.com');

      expect(mockRemoveSiteException).not.toHaveBeenCalled();
    });
  });

  describe('getSitesByMode', () => {
    it('should return sites with specified mode', async () => {
      mockStorage.privacySiteSettings = {
        'strict1.com': 'strict',
        'strict2.com': 'strict',
        'disabled1.com': 'disabled',
      };

      const strictSites = await getSitesByMode('strict');

      expect(strictSites).toHaveLength(2);
      expect(strictSites).toContain('strict1.com');
      expect(strictSites).toContain('strict2.com');
    });

    it('should return empty array when no sites match', async () => {
      mockStorage.privacySiteSettings = {
        'strict.com': 'strict',
      };

      const disabledSites = await getSitesByMode('disabled');

      expect(disabledSites).toHaveLength(0);
    });
  });

  describe('getSiteModeStats', () => {
    it('should return statistics for all modes', async () => {
      mockStorage.privacySiteSettings = {
        'strict1.com': 'strict',
        'strict2.com': 'strict',
        'disabled1.com': 'disabled',
      };

      const stats = await getSiteModeStats();

      expect(stats).toEqual({
        normal: 0,
        strict: 2,
        disabled: 1,
        total: 3,
      });
    });

    it('should return zeros when no settings exist', async () => {
      mockStorage.privacySiteSettings = {};

      const stats = await getSiteModeStats();

      expect(stats).toEqual({
        normal: 0,
        strict: 0,
        disabled: 0,
        total: 0,
      });
    });
  });

  describe('importSiteSettings', () => {
    it('should merge settings by default', async () => {
      mockStorage.privacySiteSettings = {
        'existing.com': 'strict',
      };

      await importSiteSettings({
        'new.com': 'disabled',
      });

      expect(mockStorage.privacySiteSettings).toEqual({
        'existing.com': 'strict',
        'new.com': 'disabled',
      });
    });

    it('should replace settings when merge is false', async () => {
      mockStorage.privacySiteSettings = {
        'existing.com': 'strict',
      };

      await importSiteSettings({ 'new.com': 'disabled' }, false);

      expect(mockStorage.privacySiteSettings).toEqual({
        'new.com': 'disabled',
      });
    });

    it('should override existing values during merge', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
      };

      await importSiteSettings({
        'example.com': 'disabled',
      });

      expect(mockStorage.privacySiteSettings['example.com']).toBe('disabled');
    });
  });

  describe('exportSiteSettings', () => {
    it('should return all site settings', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
        'test.com': 'disabled',
      };

      const exported = await exportSiteSettings();

      expect(exported).toEqual({
        'example.com': 'strict',
        'test.com': 'disabled',
      });
    });
  });

  describe('clearAllSiteSettings', () => {
    it('should clear all settings', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
        'test.com': 'disabled',
      };

      await clearAllSiteSettings();

      expect(mockStorage.privacySiteSettings).toEqual({});
    });

    it('should remove site exceptions for disabled sites', async () => {
      mockStorage.privacySiteSettings = {
        'strict.com': 'strict',
        'disabled.com': 'disabled',
      };

      await clearAllSiteSettings();

      expect(mockRemoveSiteException).toHaveBeenCalledWith('disabled.com');
      expect(mockRemoveSiteException).not.toHaveBeenCalledWith('strict.com');
    });
  });

  describe('searchSiteSettings', () => {
    it('should find sites matching query', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
        'example.org': 'disabled',
        'other.com': 'strict',
      };

      const results = await searchSiteSettings('example');

      expect(results).toHaveLength(2);
      expect(results.map(r => r.domain)).toContain('example.com');
      expect(results.map(r => r.domain)).toContain('example.org');
    });

    it('should be case-insensitive', async () => {
      mockStorage.privacySiteSettings = {
        'Example.com': 'strict',
      };

      const results = await searchSiteSettings('EXAMPLE');

      expect(results).toHaveLength(1);
    });

    it('should return sorted results', async () => {
      mockStorage.privacySiteSettings = {
        'z-example.com': 'strict',
        'a-example.com': 'strict',
      };

      const results = await searchSiteSettings('example');

      expect(results[0].domain).toBe('a-example.com');
      expect(results[1].domain).toBe('z-example.com');
    });

    it('should return empty array for no matches', async () => {
      mockStorage.privacySiteSettings = {
        'example.com': 'strict',
      };

      const results = await searchSiteSettings('nomatch');

      expect(results).toHaveLength(0);
    });
  });

  describe('getSuggestedMode', () => {
    it('should suggest strict for tracking domains', () => {
      expect(getSuggestedMode('google-analytics.com')).toBe('strict');
      expect(getSuggestedMode('facebook.com')).toBe('strict');
      expect(getSuggestedMode('doubleclick.net')).toBe('strict');
    });

    it('should suggest disabled for trusted domains', () => {
      expect(getSuggestedMode('github.com')).toBe('disabled');
      expect(getSuggestedMode('stackoverflow.com')).toBe('disabled');
    });

    it('should suggest normal for unknown domains', () => {
      expect(getSuggestedMode('random-site.com')).toBe('normal');
    });

    it('should match subdomains', () => {
      expect(getSuggestedMode('subdomain.google-analytics.com')).toBe('strict');
      expect(getSuggestedMode('subdomain.github.com')).toBe('disabled');
    });
  });

  describe('bulkSetSiteMode', () => {
    it('should set mode for multiple domains', async () => {
      await bulkSetSiteMode(['site1.com', 'site2.com', 'site3.com'], 'strict');

      expect(mockStorage.privacySiteSettings['site1.com']).toBe('strict');
      expect(mockStorage.privacySiteSettings['site2.com']).toBe('strict');
      expect(mockStorage.privacySiteSettings['site3.com']).toBe('strict');
    });

    it('should handle empty array', async () => {
      await bulkSetSiteMode([], 'strict');
      // Should not throw
      expect(true).toBe(true);
    });
  });
});

