import {
  detectSpamToken,
  detectSpamEVMToken,
  getSpamWarningLevel,
  getSpamReasonSummary,
  shouldFlagToken,
  filterSpamTokens,
  DEFAULT_SPAM_CONFIG,
  type SpamDetectionConfig,
} from '../spamDetection';
import type { SPLTokenBalance, EVMTokenBalance } from '../types';

// Helper to create mock SPL token
function createMockSPLToken(overrides: Partial<SPLTokenBalance> = {}): SPLTokenBalance {
  return {
    mint: 'ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 9,
    rawBalance: '1000000000',
    uiBalance: 1.0,
    tokenAccount: 'tokenAccountXYZ',
    logoUri: 'https://example.com/logo.png',
    ...overrides,
  };
}

// Helper to create mock EVM token
function createMockEVMToken(overrides: Partial<EVMTokenBalance> = {}): EVMTokenBalance {
  return {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 18,
    rawBalance: '1000000000000000000',
    uiBalance: 1.0,
    logoUri: 'https://example.com/logo.png',
    ...overrides,
  };
}

describe('Spam Detection', () => {
  describe('detectSpamToken', () => {
    it('should not flag a normal token', () => {
      const token = createMockSPLToken();
      const result = detectSpamToken(token);

      expect(result.isSpam).toBe(false);
      expect(result.confidence).toBeLessThan(70);
    });

    it('should not flag verified tokens (USDC)', () => {
      const token = createMockSPLToken({
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        symbol: 'USDC',
        name: 'USD Coin',
      });
      const result = detectSpamToken(token);

      expect(result.isSpam).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should flag tokens with URLs in name', () => {
      const token = createMockSPLToken({
        name: 'Claim rewards at scam.xyz',
        symbol: 'SCAM',
      });
      const result = detectSpamToken(token);

      expect(result.isSpam).toBe(true);
      expect(result.signals.some((s) => s.type === 'url_in_name')).toBe(true);
    });

    it('should flag tokens with domain patterns', () => {
      const token = createMockSPLToken({
        name: 'solana-airdrop.com token',
        symbol: 'AIR',
      });
      const result = detectSpamToken(token);

      // Domain pattern alone triggers a signal (35 weight)
      expect(result.signals.some((s) => s.type === 'url_in_name')).toBe(true);
      expect(result.confidence).toBeGreaterThan(30);
    });

    it('should flag tokens with multiple phishing keywords', () => {
      const token = createMockSPLToken({
        name: 'Free Airdrop Claim Now',
        symbol: 'FREE',
      });
      const result = detectSpamToken(token);

      // Multiple phishing keywords detected (should accumulate)
      expect(result.signals.some((s) => s.type === 'phishing_keywords')).toBe(true);
      // 3 keywords: free, airdrop, claim = 30 weight (2+ keywords)
      expect(result.confidence).toBeGreaterThanOrEqual(30);
    });

    it('should flag tokens with promotional patterns', () => {
      const token = createMockSPLToken({
        name: 'Claim your $500 reward now',
        symbol: 'RWD',
      });
      const result = detectSpamToken(token);

      expect(result.isSpam).toBe(true);
      expect(result.signals.some((s) => s.type === 'promotional_text')).toBe(true);
    });

    it('should flag tokens with homoglyph characters', () => {
      const token = createMockSPLToken({
        symbol: 'USDС', // Cyrillic 'С' instead of Latin 'C'
        name: 'Fake USDC',
      });
      const result = detectSpamToken(token);

      // Homoglyph attack gets 35 weight
      expect(result.signals.some((s) => s.type === 'homoglyph_attack')).toBe(true);
      expect(result.confidence).toBeGreaterThan(30);
    });

    it('should flag tokens trying to impersonate known tokens', () => {
      const token = createMockSPLToken({
        symbol: 'SOLANAA', // Extra A
        name: 'Solana 2.0',
      });
      const result = detectSpamToken(token);

      expect(result.signals.some((s) => s.type === 'impersonation')).toBe(true);
    });

    it('should flag tokens with excessively long symbols', () => {
      const token = createMockSPLToken({
        symbol: 'VERYLONGTOKENSYMBOL123',
        name: 'Long Token',
      });
      const result = detectSpamToken(token);

      expect(result.signals.some((s) => s.type === 'excessive_length')).toBe(true);
    });

    it('should flag tokens with no metadata', () => {
      const token = createMockSPLToken({
        name: 'Unknown Token',
        logoUri: undefined,
      });
      const result = detectSpamToken(token);

      expect(result.signals.some((s) => s.type === 'no_metadata')).toBe(true);
    });

    it('should not flag verified tokens when using known mint address', () => {
      const token = createMockSPLToken({
        mint: 'So11111111111111111111111111111111111111112', // wSOL verified address
        symbol: 'SOL',
        name: 'Wrapped SOL',
      });
      const result = detectSpamToken(token);

      // Verified tokens should never be flagged
      expect(result.isSpam).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should respect user whitelist', () => {
      const token = createMockSPLToken({
        mint: 'user-whitelisted-mint-address',
        name: 'Claim free tokens at scam.xyz',
        symbol: 'SCAM',
      });
      const config: SpamDetectionConfig = {
        ...DEFAULT_SPAM_CONFIG,
        whitelistedTokens: ['user-whitelisted-mint-address'],
      };
      const result = detectSpamToken(token, config);

      expect(result.isSpam).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should return no results when detection is disabled', () => {
      const token = createMockSPLToken({
        name: 'Claim free scam tokens',
        symbol: 'SCAM',
      });
      const config: SpamDetectionConfig = {
        ...DEFAULT_SPAM_CONFIG,
        enabled: false,
      };
      const result = detectSpamToken(token, config);

      expect(result.isSpam).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should accumulate multiple signals', () => {
      const token = createMockSPLToken({
        name: 'Free USDC claim at airdrop.xyz',
        symbol: 'FREEUSDCAIRDROP',
      });
      const result = detectSpamToken(token);

      expect(result.signals.length).toBeGreaterThan(2);
      expect(result.confidence).toBeGreaterThan(50);
    });
  });

  describe('detectSpamEVMToken', () => {
    it('should not flag normal EVM tokens', () => {
      const token = createMockEVMToken();
      const result = detectSpamEVMToken(token);

      expect(result.isSpam).toBe(false);
    });

    it('should not flag verified EVM tokens (USDC)', () => {
      const token = createMockEVMToken({
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        symbol: 'USDC',
        name: 'USD Coin',
      });
      const result = detectSpamEVMToken(token);

      expect(result.isSpam).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should flag EVM tokens with scam patterns', () => {
      const token = createMockEVMToken({
        name: 'Visit claimrewards.xyz for free ETH',
        symbol: 'FREEETH',
      });
      const result = detectSpamEVMToken(token);

      expect(result.isSpam).toBe(true);
    });
  });

  describe('getSpamWarningLevel', () => {
    it('should return none for low confidence', () => {
      const result = { isSpam: false, confidence: 20, reasons: [], signals: [] };
      expect(getSpamWarningLevel(result)).toBe('none');
    });

    it('should return low for moderate confidence', () => {
      const result = { isSpam: false, confidence: 40, reasons: [], signals: [] };
      expect(getSpamWarningLevel(result)).toBe('low');
    });

    it('should return medium for higher confidence', () => {
      const result = { isSpam: false, confidence: 60, reasons: [], signals: [] };
      expect(getSpamWarningLevel(result)).toBe('medium');
    });

    it('should return high for high confidence', () => {
      const result = { isSpam: true, confidence: 80, reasons: [], signals: [] };
      expect(getSpamWarningLevel(result)).toBe('high');
    });
  });

  describe('getSpamReasonSummary', () => {
    it('should return empty string for non-spam', () => {
      const result = { isSpam: false, confidence: 0, reasons: [], signals: [] };
      expect(getSpamReasonSummary(result)).toBe('');
    });

    it('should return single reason', () => {
      const result = {
        isSpam: true,
        confidence: 80,
        reasons: ['Contains URL'],
        signals: [],
      };
      expect(getSpamReasonSummary(result)).toBe('Contains URL');
    });

    it('should summarize multiple reasons', () => {
      const result = {
        isSpam: true,
        confidence: 90,
        reasons: ['Contains URL', 'Phishing keywords', 'Impersonation'],
        signals: [],
      };
      const summary = getSpamReasonSummary(result);
      expect(summary).toBe('Contains URL (+2 more)');
    });
  });

  describe('shouldFlagToken', () => {
    it('should not flag very low confidence', () => {
      const result = { isSpam: false, confidence: 20, reasons: [], signals: [] };
      expect(shouldFlagToken(result)).toBe(false);
    });

    it('should flag moderate confidence even if not spam', () => {
      const result = { isSpam: false, confidence: 35, reasons: [], signals: [] };
      expect(shouldFlagToken(result)).toBe(true);
    });
  });

  describe('filterSpamTokens', () => {
    it('should separate clean and spam tokens', () => {
      const tokens: SPLTokenBalance[] = [
        createMockSPLToken({ mint: 'clean1', symbol: 'CLEAN', name: 'Clean Token' }),
        createMockSPLToken({
          mint: 'spam1',
          symbol: 'SCAM',
          name: 'Free claim at scam.xyz',
        }),
        createMockSPLToken({ mint: 'clean2', symbol: 'GOOD', name: 'Good Token' }),
      ];

      const { clean, spam } = filterSpamTokens(tokens);

      expect(clean.length).toBe(2);
      expect(spam.length).toBe(1);
      expect(spam[0].mint).toBe('spam1');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings gracefully', () => {
      const token = createMockSPLToken({
        symbol: '',
        name: '',
      });
      const result = detectSpamToken(token);

      // Should not crash
      expect(result).toBeDefined();
    });

    it('should handle very long names without crashing', () => {
      const longName = 'A'.repeat(1000);
      const token = createMockSPLToken({
        name: longName,
      });
      const result = detectSpamToken(token);

      expect(result.signals.some((s) => s.type === 'excessive_length')).toBe(true);
    });

    it('should handle special characters in names', () => {
      const token = createMockSPLToken({
        name: '🚀 To The Moon 🌙',
        symbol: '🚀MOON',
      });
      const result = detectSpamToken(token);

      // Emoji in symbol should trigger non-ASCII warning
      expect(result.signals.some((s) => s.type === 'suspicious_characters')).toBe(true);
    });
  });
});
