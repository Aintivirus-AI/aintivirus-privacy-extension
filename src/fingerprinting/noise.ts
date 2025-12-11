export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return function (): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

export function combineSeeds(...seeds: number[]): number {
  let combined = 0;
  for (const seed of seeds) {
    combined = ((combined << 5) - combined + seed) >>> 0;
  }
  return combined;
}

export function generateNoise(random: () => number, amplitude: number): number {
  return (random() * 2 - 1) * amplitude;
}

export function generateIntNoise(random: () => number, maxDelta: number): number {
  return Math.floor(random() * (maxDelta * 2 + 1)) - maxDelta;
}

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function applyCanvasNoise(
  data: Uint8ClampedArray,
  random: () => number,
  amplitude: number = 2,
): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte(data[i] + generateIntNoise(random, amplitude));
    data[i + 1] = clampByte(data[i + 1] + generateIntNoise(random, amplitude));
    data[i + 2] = clampByte(data[i + 2] + generateIntNoise(random, amplitude));
  }
}

export function generateSessionSeed(): number {
  const datePart = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const randomPart = Math.floor(Math.random() * 0xffffff);
  return combineSeeds(datePart, randomPart);
}

export function generateDomainSeed(domain: string, sessionSeed: number): number {
  const domainHash = hashString(domain);
  return combineSeeds(domainHash, sessionSeed);
}

export function pickResolution<T>(seed: number, resolutions: readonly T[]): T {
  const random = createSeededRandom(seed);
  const index = Math.floor(random() * resolutions.length);
  return resolutions[index];
}
