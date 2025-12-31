/**
 * Mock for ed25519-hd-key
 */

interface DerivedKeyResult {
  key: Buffer;
  chainCode: Buffer;
}

export const derivePath = (path: string, seed: Buffer | string): DerivedKeyResult => {
  // Parse path to get index for deterministic derivation
  const pathParts = path.split('/');
  let index = 0;
  for (const part of pathParts) {
    const match = part.match(/(\d+)/);
    if (match) {
      index += parseInt(match[1], 10);
    }
  }

  // Generate deterministic key based on seed and path
  const seedBuffer = typeof seed === 'string' ? Buffer.from(seed, 'hex') : seed;
  const key = Buffer.alloc(32);
  const chainCode = Buffer.alloc(32);

  for (let i = 0; i < 32; i++) {
    key[i] = (seedBuffer[i % seedBuffer.length] + index + i) & 0xff;
    chainCode[i] = (seedBuffer[(i + 16) % seedBuffer.length] + index) & 0xff;
  }

  return { key, chainCode };
};

export const getMasterKeyFromSeed = (seed: Buffer | string): DerivedKeyResult => {
  const seedBuffer = typeof seed === 'string' ? Buffer.from(seed, 'hex') : seed;
  const key = Buffer.alloc(32);
  const chainCode = Buffer.alloc(32);

  for (let i = 0; i < 32; i++) {
    key[i] = seedBuffer[i % seedBuffer.length];
    chainCode[i] = seedBuffer[(i + 32) % seedBuffer.length];
  }

  return { key, chainCode };
};

export default {
  derivePath,
  getMasterKeyFromSeed,
};



