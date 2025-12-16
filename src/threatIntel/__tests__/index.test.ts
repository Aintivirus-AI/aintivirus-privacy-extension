/**
 * Tests for threat intelligence functionality
 */

import {
  getThreatIntelData,
  isKnownLegitimateDomain,
  isKnownScamDomain,
  isSuspiciousTld,
  getHomoglyphMap,
  getSolanaKeywords,
  getThreatIntelHealth,
} from '../index';
import {
  MOCK_THREAT_INTEL_DATA,
  LEGITIMATE_DOMAINS,
  SCAM_DOMAINS,
} from '../../__tests__/utils/fixtures';

// Mock storage
const mockStorage: Record<string, any> = {};

jest.mock('@shared/storage', () => ({
  storage: {
    get: jest.fn((key: string) => Promise.resolve(mockStorage[key])),
    set: jest.fn((key: string, value: any) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
  },
}));

// Mock chrome storage
const mockChromeStorage: Record<string, any> = {};
(global as any).chrome = {
  storage: {
    local: {
      get: jest.fn((key: string) => Promise.resolve({ [key]: mockChromeStorage[key] })),
      set: jest.fn((items: Record<string, any>) => {
        Object.assign(mockChromeStorage, items);
        return Promise.resolve();
      }),
    },
  },
  alarms: {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
    },
  },
};

// Mock sources
jest.mock('../sources', () => ({
  BOOTSTRAP_THREAT_INTEL: {
    legitimateDomains: [
      'phantom.app',
      'solana.com',
      'raydium.io',
      'jupiter.exchange',
      'metamask.io',
    ],
    scamDomains: ['phantom-app.com', 'solana-airdrop.xyz'],
    suspiciousTlds: ['xyz', 'tk', 'ml', 'ga', 'cf'],
    homoglyphMap: {
      o: ['0', 'ο'],
      a: ['а', '@'],
      e: ['е', '3'],
    },
    solanaKeywords: ['sol', 'solana', 'phantom', 'airdrop', 'wallet'],
    version: 'bootstrap',
    updatedAt: Date.now(),
  },
  validateThreatIntelData: jest.fn(() => true),
  mergeThreatIntelData: jest.fn((base, partial) => ({ ...base, ...partial })),
}));

describe('ThreatIntel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear mock storages
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    Object.keys(mockChromeStorage).forEach((key) => delete mockChromeStorage[key]);
  });

  describe('getThreatIntelData', () => {
    it('should return threat intel data', async () => {
      const data = await getThreatIntelData();

      expect(data).toBeDefined();
      expect(data.legitimateDomains).toBeDefined();
      expect(data.scamDomains).toBeDefined();
      expect(data.suspiciousTlds).toBeDefined();
      expect(data.homoglyphMap).toBeDefined();
      expect(data.solanaKeywords).toBeDefined();
    });

    it('should return bootstrap data when cache is empty', async () => {
      const data = await getThreatIntelData();

      expect(data.legitimateDomains).toContain('phantom.app');
      expect(data.legitimateDomains).toContain('solana.com');
    });
  });

  describe('isKnownLegitimateDomain', () => {
    it('should return true for legitimate domains', async () => {
      expect(await isKnownLegitimateDomain('phantom.app')).toBe(true);
      expect(await isKnownLegitimateDomain('solana.com')).toBe(true);
    });

    it('should return true for subdomains of legitimate domains', async () => {
      expect(await isKnownLegitimateDomain('app.phantom.app')).toBe(true);
      expect(await isKnownLegitimateDomain('docs.solana.com')).toBe(true);
    });

    it('should return false for unknown domains', async () => {
      expect(await isKnownLegitimateDomain('unknown-site.com')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      expect(await isKnownLegitimateDomain('PHANTOM.APP')).toBe(true);
      expect(await isKnownLegitimateDomain('Solana.Com')).toBe(true);
    });
  });

  describe('isKnownScamDomain', () => {
    it('should return true for known scam domains', async () => {
      expect(await isKnownScamDomain('phantom-app.com')).toBe(true);
      expect(await isKnownScamDomain('solana-airdrop.xyz')).toBe(true);
    });

    it('should return false for legitimate domains', async () => {
      expect(await isKnownScamDomain('phantom.app')).toBe(false);
      expect(await isKnownScamDomain('solana.com')).toBe(false);
    });

    it('should return false for domains in never-flag list', async () => {
      expect(await isKnownScamDomain('google.com')).toBe(false);
      expect(await isKnownScamDomain('github.com')).toBe(false);
      expect(await isKnownScamDomain('microsoft.com')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      expect(await isKnownScamDomain('PHANTOM-APP.COM')).toBe(true);
    });
  });

  describe('isSuspiciousTld', () => {
    it('should return true for suspicious TLDs', async () => {
      expect(await isSuspiciousTld('example.xyz')).toBe(true);
      expect(await isSuspiciousTld('scam.tk')).toBe(true);
      expect(await isSuspiciousTld('phishing.ml')).toBe(true);
    });

    it('should return false for common TLDs', async () => {
      expect(await isSuspiciousTld('example.com')).toBe(false);
      expect(await isSuspiciousTld('example.org')).toBe(false);
      expect(await isSuspiciousTld('example.net')).toBe(false);
    });
  });

  describe('getHomoglyphMap', () => {
    it('should return homoglyph mapping', async () => {
      const map = await getHomoglyphMap();

      expect(map).toBeDefined();
      expect(typeof map).toBe('object');
      expect(map['o']).toContain('0');
      expect(map['a']).toContain('а'); // Cyrillic 'а'
    });
  });

  describe('getSolanaKeywords', () => {
    it('should return Solana-related keywords', async () => {
      const keywords = await getSolanaKeywords();

      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords).toContain('sol');
      expect(keywords).toContain('solana');
      expect(keywords).toContain('phantom');
    });
  });

  describe('getThreatIntelHealth', () => {
    it('should return health status', async () => {
      const health = await getThreatIntelHealth();

      expect(health).toBeDefined();
      expect(health.version).toBeDefined();
      expect(typeof health.legitimateDomainCount).toBe('number');
      expect(typeof health.scamDomainCount).toBe('number');
      expect(typeof health.sourcesConfigured).toBe('number');
      expect(typeof health.sourcesEnabled).toBe('number');
    });

    it('should report bootstrap usage', async () => {
      const health = await getThreatIntelHealth();

      // When no cache, should be using bootstrap
      expect(health.usingBootstrap).toBeDefined();
    });
  });
});

describe('Domain Validation', () => {
  describe('Legitimate domain matching', () => {
    it('should match exact domains', async () => {
      expect(await isKnownLegitimateDomain('phantom.app')).toBe(true);
    });

    it('should match subdomains', async () => {
      expect(await isKnownLegitimateDomain('docs.phantom.app')).toBe(true);
      expect(await isKnownLegitimateDomain('api.phantom.app')).toBe(true);
    });

    it('should not match partial domain names', async () => {
      // "phantom.app.fake.com" should NOT match "phantom.app"
      expect(await isKnownLegitimateDomain('phantom.app.fake.com')).toBe(false);
    });
  });

  describe('Scam domain detection', () => {
    it('should detect exact scam domains', async () => {
      expect(await isKnownScamDomain('phantom-app.com')).toBe(true);
    });

    it('should not false positive on similar legitimate domains', async () => {
      expect(await isKnownScamDomain('phantom.app')).toBe(false);
    });
  });
});

describe('Protected Domains', () => {
  const protectedDomains = [
    'google.com',
    'accounts.google.com',
    'youtube.com',
    'github.com',
    'microsoft.com',
    'apple.com',
    'amazon.com',
    'paypal.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
  ];

  it.each(protectedDomains)('should never flag %s as scam', async (domain) => {
    const isScam = await isKnownScamDomain(domain);
    expect(isScam).toBe(false);
  });
});

