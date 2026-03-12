/**
 * Mock for bip39
 */

const VALID_WORDS = [
  'abandon',
  'ability',
  'able',
  'about',
  'above',
  'absent',
  'absorb',
  'abstract',
  'absurd',
  'abuse',
  'access',
  'accident',
  'account',
  'accuse',
  'achieve',
  'acid',
  'acoustic',
  'acquire',
  'across',
  'act',
  'action',
  'actor',
  'actress',
  'actual',
  'adapt',
  'add',
  'addict',
  'address',
  'adjust',
  'admit',
  'adult',
  'advance',
  'advice',
  'aerobic',
  'affair',
  'afford',
  'afraid',
  'again',
  'age',
  'agent',
  'agree',
  'ahead',
  'aim',
  'air',
  'airport',
  'aisle',
  'alarm',
  'album',
  'art',
  'zoo', // Include edge words for tests
];

let mnemonicCounter = 0;

export const generateMnemonic = (strength: number = 256): string => {
  // Generate unique mnemonics by varying words based on counter
  const wordCount = strength === 128 ? 12 : 24;
  const words: string[] = [];

  // Use counter to generate different mnemonics
  const seed = mnemonicCounter++;

  for (let i = 0; i < wordCount; i++) {
    const wordIndex = (seed + i * 7) % VALID_WORDS.length;
    words.push(VALID_WORDS[wordIndex]);
  }

  return words.join(' ');
};

export const validateMnemonic = (mnemonic: string): boolean => {
  if (!mnemonic || typeof mnemonic !== 'string') return false;
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) return false;

  // Check if all words are in the valid word list
  if (!words.every((word) => VALID_WORDS.includes(word))) {
    return false;
  }

  // Reject if all words are the same (invalid checksum)
  const allSame = words.every((word) => word === words[0]);
  if (allSame) {
    return false;
  }

  return true;
};

// Return type is Uint8Array for compatibility with @scure/bip32's HDKey.fromMasterSeed
// The real bip39 returns Buffer which extends Uint8Array, but tests need plain Uint8Array
export const mnemonicToSeedSync = (mnemonic: string, _password?: string): Uint8Array => {
  // Return a deterministic 64-byte seed based on the mnemonic
  const result = new Uint8Array(64);
  const encoder = new TextEncoder();
  const mnemonicBytes = encoder.encode(mnemonic);
  
  // Create deterministic bytes - ensure different mnemonics produce different seeds
  for (let i = 0; i < 64; i++) {
    const byte = mnemonicBytes[i % mnemonicBytes.length] || 0;
    result[i] = (byte ^ (i * 7) ^ (mnemonicBytes.length * 3)) & 0xff;
  }
  return result;
};

export const mnemonicToSeed = async (mnemonic: string, password?: string): Promise<Uint8Array> => {
  return mnemonicToSeedSync(mnemonic, password);
};

export const entropyToMnemonic = (entropy: Buffer | Uint8Array): string => {
  return generateMnemonic(entropy.length * 8);
};

export const mnemonicToEntropy = (mnemonic: string): string => {
  return 'a'.repeat(64);
};

export default {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
  mnemonicToSeed,
  entropyToMnemonic,
  mnemonicToEntropy,
};
