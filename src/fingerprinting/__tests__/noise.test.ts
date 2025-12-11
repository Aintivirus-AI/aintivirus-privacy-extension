/**
 * Tests for fingerprinting noise generation
 */

import {
  createSeededRandom,
  hashString,
  combineSeeds,
  generateNoise,
  generateIntNoise,
  clampByte,
  applyCanvasNoise,
  generateSessionSeed,
  generateDomainSeed,
  pickResolution,
} from '../noise';

describe('Fingerprinting Noise', () => {
  describe('createSeededRandom', () => {
    it('should produce consistent values for the same seed', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);

      const values1 = Array.from({ length: 10 }, () => random1());
      const values2 = Array.from({ length: 10 }, () => random2());

      expect(values1).toEqual(values2);
    });

    it('should produce different values for different seeds', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(54321);

      const values1 = Array.from({ length: 10 }, () => random1());
      const values2 = Array.from({ length: 10 }, () => random2());

      expect(values1).not.toEqual(values2);
    });

    it('should produce values between 0 and 1', () => {
      const random = createSeededRandom(42);

      for (let i = 0; i < 1000; i++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should produce different values on successive calls', () => {
      const random = createSeededRandom(999);
      const values = new Set<number>();

      for (let i = 0; i < 100; i++) {
        values.add(random());
      }

      // Should have many unique values (not all identical)
      expect(values.size).toBeGreaterThan(90);
    });
  });

  describe('hashString', () => {
    it('should produce consistent hash for the same string', () => {
      const hash1 = hashString('example.com');
      const hash2 = hashString('example.com');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different strings', () => {
      const hash1 = hashString('example.com');
      const hash2 = hashString('google.com');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashString('');

      expect(typeof hash).toBe('number');
      expect(hash).toBeGreaterThanOrEqual(0);
    });

    it('should handle special characters', () => {
      const hash = hashString('test@#$%^&*()');

      expect(typeof hash).toBe('number');
      expect(hash).toBeGreaterThanOrEqual(0);
    });

    it('should handle unicode characters', () => {
      const hash = hashString('日本語');

      expect(typeof hash).toBe('number');
      expect(hash).toBeGreaterThanOrEqual(0);
    });

    it('should produce positive integers', () => {
      const strings = ['a', 'test', 'example.com', 'long string with spaces'];

      strings.forEach((str) => {
        const hash = hashString(str);
        expect(hash).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(hash)).toBe(true);
      });
    });
  });

  describe('combineSeeds', () => {
    it('should combine multiple seeds consistently', () => {
      const combined1 = combineSeeds(100, 200, 300);
      const combined2 = combineSeeds(100, 200, 300);

      expect(combined1).toBe(combined2);
    });

    it('should produce different result for different order', () => {
      const combined1 = combineSeeds(100, 200);
      const combined2 = combineSeeds(200, 100);

      expect(combined1).not.toBe(combined2);
    });

    it('should handle single seed', () => {
      const combined = combineSeeds(12345);

      expect(typeof combined).toBe('number');
    });

    it('should handle no seeds', () => {
      const combined = combineSeeds();

      expect(combined).toBe(0);
    });

    it('should produce positive integers', () => {
      const combined = combineSeeds(1, 2, 3, 4, 5);

      expect(combined).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateNoise', () => {
    it('should generate noise within amplitude bounds', () => {
      const random = createSeededRandom(42);
      const amplitude = 5;

      for (let i = 0; i < 1000; i++) {
        const noise = generateNoise(random, amplitude);
        expect(noise).toBeGreaterThanOrEqual(-amplitude);
        expect(noise).toBeLessThanOrEqual(amplitude);
      }
    });

    it('should generate values around zero', () => {
      const random = createSeededRandom(42);
      const amplitude = 10;
      let sum = 0;
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        sum += generateNoise(random, amplitude);
      }

      const average = sum / iterations;
      // Average should be close to 0 (within reasonable tolerance)
      expect(Math.abs(average)).toBeLessThan(0.5);
    });

    it('should handle zero amplitude', () => {
      const random = createSeededRandom(42);
      const noise = generateNoise(random, 0);

      expect(noise).toBe(0);
    });
  });

  describe('generateIntNoise', () => {
    it('should generate integer noise within bounds', () => {
      const random = createSeededRandom(42);
      const maxDelta = 5;

      for (let i = 0; i < 1000; i++) {
        const noise = generateIntNoise(random, maxDelta);
        expect(Number.isInteger(noise)).toBe(true);
        expect(noise).toBeGreaterThanOrEqual(-maxDelta);
        expect(noise).toBeLessThanOrEqual(maxDelta);
      }
    });

    it('should handle zero maxDelta', () => {
      const random = createSeededRandom(42);
      const noise = generateIntNoise(random, 0);

      expect(noise).toBe(0);
    });
  });

  describe('clampByte', () => {
    it('should return same value if within range', () => {
      expect(clampByte(0)).toBe(0);
      expect(clampByte(128)).toBe(128);
      expect(clampByte(255)).toBe(255);
    });

    it('should clamp values below 0', () => {
      expect(clampByte(-1)).toBe(0);
      expect(clampByte(-100)).toBe(0);
    });

    it('should clamp values above 255', () => {
      expect(clampByte(256)).toBe(255);
      expect(clampByte(1000)).toBe(255);
    });

    it('should round floating point values', () => {
      expect(clampByte(127.4)).toBe(127);
      expect(clampByte(127.6)).toBe(128);
    });
  });

  describe('applyCanvasNoise', () => {
    it('should modify RGBA data', () => {
      const random = createSeededRandom(42);
      const originalData = new Uint8ClampedArray([100, 150, 200, 255, 50, 75, 100, 255]);
      const data = new Uint8ClampedArray(originalData);

      applyCanvasNoise(data, random, 2);

      // Check that values changed (most should differ by small amount)
      let changes = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== originalData[i]) changes++;
        if (data[i + 1] !== originalData[i + 1]) changes++;
        if (data[i + 2] !== originalData[i + 2]) changes++;
        // Alpha should not change
        expect(data[i + 3]).toBe(originalData[i + 3]);
      }

      // Most RGB values should have changed
      expect(changes).toBeGreaterThan(0);
    });

    it('should not modify alpha channel', () => {
      const random = createSeededRandom(42);
      const data = new Uint8ClampedArray([100, 150, 200, 255, 50, 75, 100, 128]);
      const originalAlphas = [data[3], data[7]];

      applyCanvasNoise(data, random, 10);

      expect(data[3]).toBe(originalAlphas[0]);
      expect(data[7]).toBe(originalAlphas[1]);
    });

    it('should keep values within byte range', () => {
      const random = createSeededRandom(42);
      // Use extreme values
      const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);

      applyCanvasNoise(data, random, 10);

      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });

    it('should apply consistent noise with same seed', () => {
      const data1 = new Uint8ClampedArray([100, 150, 200, 255]);
      const data2 = new Uint8ClampedArray([100, 150, 200, 255]);

      applyCanvasNoise(data1, createSeededRandom(12345), 2);
      applyCanvasNoise(data2, createSeededRandom(12345), 2);

      expect(data1).toEqual(data2);
    });
  });

  describe('generateSessionSeed', () => {
    it('should generate a positive integer', () => {
      const seed = generateSessionSeed();

      expect(typeof seed).toBe('number');
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(seed)).toBe(true);
    });

    it('should generate different seeds on multiple calls (usually)', () => {
      const seeds = new Set<number>();

      for (let i = 0; i < 10; i++) {
        seeds.add(generateSessionSeed());
      }

      // Should have some variation (random component)
      expect(seeds.size).toBeGreaterThan(1);
    });
  });

  describe('generateDomainSeed', () => {
    it('should produce consistent seed for same domain and session', () => {
      const sessionSeed = 12345;
      const seed1 = generateDomainSeed('example.com', sessionSeed);
      const seed2 = generateDomainSeed('example.com', sessionSeed);

      expect(seed1).toBe(seed2);
    });

    it('should produce different seeds for different domains', () => {
      const sessionSeed = 12345;
      const seed1 = generateDomainSeed('example.com', sessionSeed);
      const seed2 = generateDomainSeed('google.com', sessionSeed);

      expect(seed1).not.toBe(seed2);
    });

    it('should produce different seeds for different sessions', () => {
      const seed1 = generateDomainSeed('example.com', 11111);
      const seed2 = generateDomainSeed('example.com', 22222);

      expect(seed1).not.toBe(seed2);
    });
  });

  describe('pickResolution', () => {
    it('should pick from available resolutions consistently', () => {
      const resolutions = [1080, 1440, 2160] as const;
      const seed = 42;

      const pick1 = pickResolution(seed, resolutions);
      const pick2 = pickResolution(seed, resolutions);

      expect(pick1).toBe(pick2);
    });

    it('should pick different values for different seeds', () => {
      const resolutions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
      const picks = new Set<number>();

      for (let seed = 0; seed < 100; seed++) {
        picks.add(pickResolution(seed, resolutions));
      }

      // Should pick multiple different values
      expect(picks.size).toBeGreaterThan(5);
    });

    it('should always pick from the provided list', () => {
      const resolutions = ['a', 'b', 'c'] as const;

      for (let seed = 0; seed < 100; seed++) {
        const pick = pickResolution(seed, resolutions);
        expect(resolutions).toContain(pick);
      }
    });

    it('should handle single-item array', () => {
      const resolutions = ['only'] as const;
      const pick = pickResolution(999, resolutions);

      expect(pick).toBe('only');
    });
  });
});
