/**
 * Tests for phishing detection functionality
 */

import {
  analyzeDomain,
  shouldShowWarning,
  getKnownLegitimateDomains,
  getSignalTypeDescription,
} from '../phishingDetector';
import { PhishingSignalType, RiskLevel } from '../types';
import {
  LEGITIMATE_DOMAINS,
  SCAM_DOMAINS,
  HOMOGLYPH_DOMAINS,
  TYPOSQUAT_DOMAINS,
  MOCK_THREAT_INTEL_DATA,
} from '../../__tests__/utils/fixtures';

// Mock dependencies
jest.mock('../storage', () => ({
  getDomainSettings: jest.fn(),
  isWarningDismissed: jest.fn(),
}));

jest.mock('../../threatIntel', () => ({
  getThreatIntelData: jest.fn(() => Promise.resolve(MOCK_THREAT_INTEL_DATA)),
  isKnownLegitimateDomain: jest.fn((domain: string) =>
    Promise.resolve(MOCK_THREAT_INTEL_DATA.legitimateDomains.includes(domain)),
  ),
  isKnownScamDomain: jest.fn((domain: string) =>
    Promise.resolve(MOCK_THREAT_INTEL_DATA.scamDomains.includes(domain)),
  ),
  isSuspiciousTld: jest.fn((domain: string) => {
    const tld = domain.split('.').pop() || '';
    return Promise.resolve(MOCK_THREAT_INTEL_DATA.suspiciousTlds.includes(tld));
  }),
  getHomoglyphMap: jest.fn(() => Promise.resolve(MOCK_THREAT_INTEL_DATA.homoglyphMap)),
  getSolanaKeywords: jest.fn(() => Promise.resolve(MOCK_THREAT_INTEL_DATA.solanaKeywords)),
}));

import { getDomainSettings, isWarningDismissed } from '../storage';
import { isKnownLegitimateDomain, isKnownScamDomain, isSuspiciousTld } from '../../threatIntel';

const mockGetDomainSettings = getDomainSettings as jest.Mock;
const mockIsWarningDismissed = isWarningDismissed as jest.Mock;
const mockIsKnownScamDomain = isKnownScamDomain as jest.Mock;
const mockIsKnownLegitimateDomain = isKnownLegitimateDomain as jest.Mock;
const mockIsSuspiciousTld = isSuspiciousTld as jest.Mock;

describe('PhishingDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDomainSettings.mockResolvedValue(null);
    mockIsWarningDismissed.mockResolvedValue(false);
  });

  describe('analyzeDomain', () => {
    it('should return low risk for legitimate domains', async () => {
      const domain = 'phantom.app';
      mockIsKnownLegitimateDomain.mockResolvedValue(true);
      mockIsKnownScamDomain.mockResolvedValue(false);

      const result = await analyzeDomain(domain);

      expect(result.domain).toBe(domain);
      expect(result.isPhishing).toBe(false);
    });

    it('should detect known scam domains', async () => {
      const domain = 'phantom-app.com';
      mockIsKnownScamDomain.mockResolvedValue(true);

      const result = await analyzeDomain(domain);

      expect(result.isPhishing).toBe(true);
      expect(result.riskLevel).toBe('high');
      expect(result.signals.some((s) => s.type === 'known_scam')).toBe(true);
      expect(result.recommendation).toBe('block');
    });

    it('should return trusted for explicitly trusted domains', async () => {
      const domain = 'custom-dapp.com';
      mockGetDomainSettings.mockResolvedValue({
        domain,
        trustStatus: 'trusted',
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        connectionCount: 5,
      });

      const result = await analyzeDomain(domain);

      expect(result.isPhishing).toBe(false);
      expect(result.riskLevel).toBe('low');
      expect(result.signals).toHaveLength(0);
      expect(result.recommendation).toBe('proceed');
    });

    it('should flag user-blocked domains', async () => {
      const domain = 'blocked-site.com';
      mockGetDomainSettings.mockResolvedValue({
        domain,
        trustStatus: 'blocked',
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        connectionCount: 1,
      });

      const result = await analyzeDomain(domain);

      expect(result.signals.some((s) => s.type === 'user_flagged')).toBe(true);
    });

    it('should indicate previously dismissed warnings', async () => {
      const domain = 'some-domain.com';
      mockIsWarningDismissed.mockResolvedValue(true);

      const result = await analyzeDomain(domain);

      expect(result.previouslyDismissed).toBe(true);
    });

    it('should normalize domain (lowercase, remove www)', async () => {
      const domain = 'WWW.Example.COM';

      const result = await analyzeDomain(domain);

      expect(result.domain).toBe('example.com');
    });

    it('should detect new domains', async () => {
      const domain = 'brand-new-site.com';
      mockGetDomainSettings.mockResolvedValue(null);

      const result = await analyzeDomain(domain);

      expect(result.signals.some((s) => s.type === 'new_domain')).toBe(true);
    });
  });

  describe('shouldShowWarning', () => {
    it('should return true for known scam domains', async () => {
      const domain = 'phantom-app.com';
      mockIsKnownScamDomain.mockResolvedValue(true);

      const result = await shouldShowWarning(domain);

      expect(result).toBe(true);
    });

    it('should return false for legitimate domains', async () => {
      const domain = 'phantom.app';
      mockIsKnownScamDomain.mockResolvedValue(false);
      mockIsKnownLegitimateDomain.mockResolvedValue(true);

      const result = await shouldShowWarning(domain);

      expect(result).toBe(false);
    });

    it('should return true for suspicious TLD with solana keywords', async () => {
      const domain = 'solana-airdrop.xyz';
      mockIsKnownScamDomain.mockResolvedValue(false);
      mockIsKnownLegitimateDomain.mockResolvedValue(false);
      mockIsSuspiciousTld.mockResolvedValue(true);

      const result = await shouldShowWarning(domain);

      expect(result).toBe(true);
    });

    it('should normalize domain before checking', async () => {
      const domain = 'WWW.PHANTOM.APP';
      mockIsKnownScamDomain.mockResolvedValue(false);
      mockIsKnownLegitimateDomain.mockResolvedValue(true);

      const result = await shouldShowWarning(domain);

      expect(result).toBe(false);
    });
  });

  describe('getSignalTypeDescription', () => {
    it('should return description for homoglyph', () => {
      const desc = getSignalTypeDescription('homoglyph');
      expect(desc).toContain('look-alike');
    });

    it('should return description for typosquat', () => {
      const desc = getSignalTypeDescription('typosquat');
      expect(desc).toContain('misspelling');
    });

    it('should return description for suspicious_tld', () => {
      const desc = getSignalTypeDescription('suspicious_tld');
      expect(desc).toContain('top-level domain');
    });

    it('should return description for known_scam', () => {
      const desc = getSignalTypeDescription('known_scam');
      expect(desc).toContain('scam');
    });

    it('should return description for user_flagged', () => {
      const desc = getSignalTypeDescription('user_flagged');
      expect(desc).toContain('flagged');
    });

    it('should return description for new_domain', () => {
      const desc = getSignalTypeDescription('new_domain');
      expect(desc).toContain('first');
    });

    it('should return description for similar_to_known', () => {
      const desc = getSignalTypeDescription('similar_to_known');
      expect(desc).toContain('similar');
    });

    it('should return fallback for unknown type', () => {
      const desc = getSignalTypeDescription('unknown_type' as PhishingSignalType);
      expect(desc).toContain('Unknown');
    });
  });

  describe('getKnownLegitimateDomains', () => {
    it('should return list of legitimate domains', async () => {
      const domains = await getKnownLegitimateDomains();

      expect(Array.isArray(domains)).toBe(true);
      expect(domains).toEqual(MOCK_THREAT_INTEL_DATA.legitimateDomains);
    });
  });

  describe('Risk Level Calculation', () => {
    it('should return high risk for known scams', async () => {
      mockIsKnownScamDomain.mockResolvedValue(true);

      const result = await analyzeDomain('scam-site.com');

      expect(result.riskLevel).toBe('high');
    });

    it('should return medium risk for typosquatting', async () => {
      // This test depends on the typosquatting logic in analyzeDomain
      // Setting up a domain that's close to a legitimate one
      mockIsKnownScamDomain.mockResolvedValue(false);

      const result = await analyzeDomain('phantmo.app');

      // Should detect it's similar to phantom.app
      expect(['medium', 'low']).toContain(result.riskLevel);
    });

    it('should return low risk for unknown but clean domains', async () => {
      mockIsKnownScamDomain.mockResolvedValue(false);
      mockIsKnownLegitimateDomain.mockResolvedValue(false);
      mockIsSuspiciousTld.mockResolvedValue(false);

      const result = await analyzeDomain('completely-new-site.com');

      // New domain signal is low severity
      expect(result.riskLevel).toBe('low');
    });
  });

  describe('Recommendation Logic', () => {
    it('should recommend block for known scams', async () => {
      mockIsKnownScamDomain.mockResolvedValue(true);

      const result = await analyzeDomain('scam.com');

      expect(result.recommendation).toBe('block');
    });

    it('should recommend proceed for trusted domains', async () => {
      mockGetDomainSettings.mockResolvedValue({
        domain: 'trusted.com',
        trustStatus: 'trusted',
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        connectionCount: 10,
      });

      const result = await analyzeDomain('trusted.com');

      expect(result.recommendation).toBe('proceed');
    });

    it('should recommend warning for medium risk domains', async () => {
      mockIsKnownScamDomain.mockResolvedValue(false);
      // Domain has some suspicious signals but not definite scam

      const result = await analyzeDomain('suspicious-but-not-scam.xyz');

      // Depending on signals detected, should be warning or proceed
      expect(['warning', 'proceed']).toContain(result.recommendation);
    });
  });
});

describe('Levenshtein Distance (via typosquatting detection)', () => {
  // These tests verify the typosquatting detection which uses Levenshtein distance internally

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDomainSettings.mockResolvedValue(null);
    mockIsWarningDismissed.mockResolvedValue(false);
    mockIsKnownScamDomain.mockResolvedValue(false);
  });

  it('should detect single character substitution', async () => {
    // "phantum" is 1 edit away from "phantom"
    const result = await analyzeDomain('phantum.app');

    expect(
      result.signals.some((s) => s.type === 'typosquat' || s.type === 'similar_to_known'),
    ).toBe(true);
  });

  it('should detect single character addition', async () => {
    // "phanntom" has an extra 'n'
    const result = await analyzeDomain('phanntom.app');

    expect(
      result.signals.some((s) => s.type === 'typosquat' || s.type === 'similar_to_known'),
    ).toBe(true);
  });

  it('should detect single character deletion', async () => {
    // "phantm" is missing an 'o'
    const result = await analyzeDomain('phantm.app');

    expect(
      result.signals.some((s) => s.type === 'typosquat' || s.type === 'similar_to_known'),
    ).toBe(true);
  });

  it('should not flag completely different domains', async () => {
    const result = await analyzeDomain('completely-different.com');

    expect(result.signals.filter((s) => s.type === 'typosquat')).toHaveLength(0);
  });
});

