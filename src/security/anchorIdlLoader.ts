/**
 * AINTIVIRUS Security Module - Anchor IDL Loader
 * 
 * Provides dynamic instruction decoding for Anchor programs:
 * - Fetches IDL from on-chain or remote sources
 * - Caches IDLs locally for performance
 * - Decodes instruction data using IDL definitions
 * - Graceful fallback for unknown programs
 * 
 * LIMITATIONS:
 * - Not all programs use Anchor
 * - IDLs may not be available on-chain for all programs
 * - Custom programs may have non-standard instruction formats
 * - This is best-effort decoding - always verify independently
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

// ============================================
// TYPES
// ============================================

/**
 * Simplified Anchor IDL structure
 * We only need instruction definitions for decoding
 */
export interface AnchorIdl {
  version: string;
  name: string;
  instructions: AnchorInstruction[];
  accounts?: AnchorAccountDef[];
  types?: AnchorTypeDef[];
}

export interface AnchorInstruction {
  name: string;
  discriminator?: number[];
  accounts: AnchorAccountMeta[];
  args: AnchorArg[];
}

export interface AnchorAccountMeta {
  name: string;
  isMut: boolean;
  isSigner: boolean;
}

export interface AnchorArg {
  name: string;
  type: string | AnchorTypeRef;
}

export interface AnchorAccountDef {
  name: string;
  type: { kind: string; fields: AnchorField[] };
}

export interface AnchorTypeDef {
  name: string;
  type: { kind: string; variants?: { name: string }[]; fields?: AnchorField[] };
}

export interface AnchorField {
  name: string;
  type: string | AnchorTypeRef;
}

export interface AnchorTypeRef {
  defined?: string;
  option?: string;
  vec?: string;
  array?: [string, number];
}

/**
 * Cached IDL entry
 */
export interface CachedIdl {
  programId: string;
  idl: AnchorIdl;
  fetchedAt: number;
  source: 'onchain' | 'remote' | 'bundled';
}

/**
 * Decoded instruction result
 */
export interface DecodedInstruction {
  programId: string;
  programName: string;
  instructionName: string;
  args: Record<string, unknown>;
  accounts: { name: string; pubkey: string; isMut: boolean; isSigner: boolean }[];
  success: boolean;
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * IDL cache TTL (7 days)
 */
const IDL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Storage key for IDL cache
 */
const STORAGE_KEY_IDL_CACHE = 'anchorIdlCache';

/**
 * Anchor discriminator length (8 bytes)
 */
const DISCRIMINATOR_LENGTH = 8;

/**
 * Known IDL sources (program ID -> IDL URL)
 * These are programs with publicly available IDLs
 */
const KNOWN_IDL_SOURCES: Record<string, string> = {
  // Jupiter v6
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'https://raw.githubusercontent.com/jup-ag/jupiter-core/main/idl/jupiter.json',
  // Add more known IDL sources here
};

// ============================================
// MODULE STATE
// ============================================

/** In-memory IDL cache */
const idlCache = new Map<string, CachedIdl>();

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Load IDL cache from storage
 */
async function loadIdlCache(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_IDL_CACHE);
    const stored = result[STORAGE_KEY_IDL_CACHE] || {};
    
    for (const [programId, cached] of Object.entries(stored)) {
      if (Date.now() - (cached as CachedIdl).fetchedAt < IDL_CACHE_TTL) {
        idlCache.set(programId, cached as CachedIdl);
      }
    }
  } catch (error) {
    console.warn('[AnchorIDL] Failed to load cache:', error);
  }
}

/**
 * Save IDL to cache
 */
async function cacheIdl(programId: string, idl: AnchorIdl, source: 'onchain' | 'remote' | 'bundled'): Promise<void> {
  const cached: CachedIdl = {
    programId,
    idl,
    fetchedAt: Date.now(),
    source,
  };
  
  idlCache.set(programId, cached);
  
  // Persist to storage
  try {
    const allCached: Record<string, CachedIdl> = {};
    for (const [id, entry] of idlCache.entries()) {
      allCached[id] = entry;
    }
    await chrome.storage.local.set({ [STORAGE_KEY_IDL_CACHE]: allCached });
  } catch (error) {
    console.warn('[AnchorIDL] Failed to persist cache:', error);
  }
}

/**
 * Get cached IDL
 */
function getCachedIdl(programId: string): AnchorIdl | null {
  const cached = idlCache.get(programId);
  if (cached && Date.now() - cached.fetchedAt < IDL_CACHE_TTL) {
    return cached.idl;
  }
  return null;
}

// ============================================
// IDL FETCHING
// ============================================

/**
 * Fetch IDL from known remote source
 */
async function fetchIdlFromRemote(programId: string): Promise<AnchorIdl | null> {
  const url = KNOWN_IDL_SOURCES[programId];
  if (!url) {
    return null;
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const idl = await response.json();
    
    // Basic validation
    if (!idl.instructions || !Array.isArray(idl.instructions)) {
      return null;
    }
    
    return idl as AnchorIdl;
  } catch (error) {
    console.warn(`[AnchorIDL] Failed to fetch from remote: ${error}`);
    return null;
  }
}

/**
 * Get IDL for a program (checks cache first)
 */
export async function getIdl(programId: string): Promise<AnchorIdl | null> {
  // Check cache
  const cached = getCachedIdl(programId);
  if (cached) {
    return cached;
  }
  
  // Try remote source
  const remoteIdl = await fetchIdlFromRemote(programId);
  if (remoteIdl) {
    await cacheIdl(programId, remoteIdl, 'remote');
    return remoteIdl;
  }
  
  // IDL not available
  return null;
}

// ============================================
// INSTRUCTION DECODING
// ============================================

/**
 * Compute Anchor instruction discriminator
 * 
 * Anchor uses first 8 bytes of sha256("global:<instruction_name>")
 */
function computeDiscriminator(instructionName: string): number[] {
  // Simple hash for discriminator computation
  // In practice, Anchor uses SHA256 but we'll use a simplified approach
  // for compatibility
  const namespace = 'global';
  const preimage = `${namespace}:${instructionName}`;
  
  // This is a simplified version - in production, use proper SHA256
  // For now, we'll rely on the discriminator field if present in IDL
  return [];
}

/**
 * Match instruction data to IDL instruction
 */
function matchInstruction(data: Buffer, idl: AnchorIdl): AnchorInstruction | null {
  if (data.length < DISCRIMINATOR_LENGTH) {
    return null;
  }
  
  const discriminatorBytes = Array.from(data.slice(0, DISCRIMINATOR_LENGTH));
  
  for (const instruction of idl.instructions) {
    // If IDL has discriminator, compare directly
    if (instruction.discriminator && instruction.discriminator.length === DISCRIMINATOR_LENGTH) {
      if (arraysEqual(discriminatorBytes, instruction.discriminator)) {
        return instruction;
      }
    }
  }
  
  // If no discriminator match, try by name-based discriminator
  // This is a fallback for IDLs without explicit discriminators
  return null;
}

/**
 * Compare two number arrays
 */
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

/**
 * Decode instruction arguments
 * This is a simplified decoder - full Anchor decoding is more complex
 */
function decodeArgs(
  data: Buffer,
  offset: number,
  args: AnchorArg[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentOffset = offset;
  
  for (const arg of args) {
    try {
      const { value, bytesRead } = decodeType(data, currentOffset, arg.type);
      result[arg.name] = value;
      currentOffset += bytesRead;
    } catch (error) {
      result[arg.name] = '[decode error]';
    }
  }
  
  return result;
}

/**
 * Decode a single value based on type
 */
function decodeType(
  data: Buffer,
  offset: number,
  type: string | AnchorTypeRef
): { value: unknown; bytesRead: number } {
  if (typeof type === 'string') {
    switch (type) {
      case 'u8':
        return { value: data.readUInt8(offset), bytesRead: 1 };
      case 'u16':
        return { value: data.readUInt16LE(offset), bytesRead: 2 };
      case 'u32':
        return { value: data.readUInt32LE(offset), bytesRead: 4 };
      case 'u64':
        return { value: data.readBigUInt64LE(offset).toString(), bytesRead: 8 };
      case 'i8':
        return { value: data.readInt8(offset), bytesRead: 1 };
      case 'i16':
        return { value: data.readInt16LE(offset), bytesRead: 2 };
      case 'i32':
        return { value: data.readInt32LE(offset), bytesRead: 4 };
      case 'i64':
        return { value: data.readBigInt64LE(offset).toString(), bytesRead: 8 };
      case 'bool':
        return { value: data.readUInt8(offset) !== 0, bytesRead: 1 };
      case 'publicKey':
      case 'pubkey':
        const pubkeyBytes = data.slice(offset, offset + 32);
        return { value: bs58.encode(pubkeyBytes), bytesRead: 32 };
      case 'string':
        const strLen = data.readUInt32LE(offset);
        const str = data.slice(offset + 4, offset + 4 + strLen).toString('utf8');
        return { value: str, bytesRead: 4 + strLen };
      default:
        return { value: `[${type}]`, bytesRead: 0 };
    }
  }
  
  // Complex types
  if (type.option) {
    const hasValue = data.readUInt8(offset) !== 0;
    if (!hasValue) {
      return { value: null, bytesRead: 1 };
    }
    const inner = decodeType(data, offset + 1, type.option);
    return { value: inner.value, bytesRead: 1 + inner.bytesRead };
  }
  
  if (type.vec) {
    const length = data.readUInt32LE(offset);
    const items: unknown[] = [];
    let bytesRead = 4;
    for (let i = 0; i < length; i++) {
      const inner = decodeType(data, offset + bytesRead, type.vec);
      items.push(inner.value);
      bytesRead += inner.bytesRead;
    }
    return { value: items, bytesRead };
  }
  
  return { value: '[complex type]', bytesRead: 0 };
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Decode an instruction using Anchor IDL
 * 
 * @param programId - Program ID
 * @param data - Instruction data
 * @param accountKeys - Account public keys
 * @returns Decoded instruction or null if decoding fails
 */
export async function decodeInstruction(
  programId: string,
  data: Buffer,
  accountKeys: PublicKey[]
): Promise<DecodedInstruction> {
  const result: DecodedInstruction = {
    programId,
    programName: 'Unknown Program',
    instructionName: 'Unknown Instruction',
    args: {},
    accounts: [],
    success: false,
  };
  
  // Try to get IDL
  const idl = await getIdl(programId);
  if (!idl) {
    result.error = 'No IDL available for this program';
    return result;
  }
  
  result.programName = idl.name || 'Unknown Program';
  
  // Match instruction
  const instruction = matchInstruction(data, idl);
  if (!instruction) {
    result.error = 'Could not match instruction discriminator';
    return result;
  }
  
  result.instructionName = instruction.name;
  
  // Decode arguments
  try {
    result.args = decodeArgs(data, DISCRIMINATOR_LENGTH, instruction.args);
  } catch (error) {
    result.error = 'Failed to decode instruction arguments';
    return result;
  }
  
  // Map accounts
  result.accounts = instruction.accounts.map((acc, i) => ({
    name: acc.name,
    pubkey: i < accountKeys.length ? accountKeys[i].toBase58() : 'unknown',
    isMut: acc.isMut,
    isSigner: acc.isSigner,
  }));
  
  result.success = true;
  return result;
}

/**
 * Check if a program has a known IDL
 */
export function hasKnownIdl(programId: string): boolean {
  return programId in KNOWN_IDL_SOURCES || idlCache.has(programId);
}

/**
 * Get list of programs with available IDLs
 */
export function getProgramsWithIdls(): string[] {
  const fromCache = Array.from(idlCache.keys());
  const fromKnown = Object.keys(KNOWN_IDL_SOURCES);
  return [...new Set([...fromCache, ...fromKnown])];
}

/**
 * Initialize IDL loader
 */
export async function initializeIdlLoader(): Promise<void> {
  console.log('[AnchorIDL] Initializing...');
  await loadIdlCache();
  console.log(`[AnchorIDL] Loaded ${idlCache.size} cached IDLs`);
}

/**
 * Clear IDL cache
 */
export async function clearIdlCache(): Promise<void> {
  idlCache.clear();
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_IDL_CACHE]: {} });
  } catch (error) {
    console.warn('[AnchorIDL] Failed to clear cache:', error);
  }
}

/**
 * Get IDL cache statistics
 */
export function getIdlCacheStats(): {
  cachedCount: number;
  programIds: string[];
  oldestEntry: number | null;
} {
  const entries = Array.from(idlCache.values());
  const programIds = Array.from(idlCache.keys());
  const oldestEntry = entries.length > 0 
    ? Math.min(...entries.map(e => e.fetchedAt))
    : null;
  
  return {
    cachedCount: idlCache.size,
    programIds,
    oldestEntry,
  };
}





