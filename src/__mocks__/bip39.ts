/**
 * Mock for bip39
 */

const VALID_WORDS = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'art', 'zoo', // Include edge words for tests
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
  if (!words.every(word => VALID_WORDS.includes(word))) {
    return false;
  }
  
  // Reject if all words are the same (invalid checksum)
  const allSame = words.every(word => word === words[0]);
  if (allSame) {
    return false;
  }
  
  return true;
};

export const mnemonicToSeedSync = (mnemonic: string, password?: string): Buffer => {
  // Return a deterministic seed based on the mnemonic
  const seed = Buffer.alloc(64);
  const mnemonicBytes = Buffer.from(mnemonic, 'utf8');
  for (let i = 0; i < 64; i++) {
    seed[i] = mnemonicBytes[i % mnemonicBytes.length] ^ (i * 7);
  }
  return seed;
};

export const mnemonicToSeed = async (mnemonic: string, password?: string): Promise<Buffer> => {
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

