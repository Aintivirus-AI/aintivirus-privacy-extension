

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';


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


export interface CachedIdl {
  programId: string;
  idl: AnchorIdl;
  fetchedAt: number;
  source: 'onchain' | 'remote' | 'bundled';
}


export interface DecodedInstruction {
  programId: string;
  programName: string;
  instructionName: string;
  args: Record<string, unknown>;
  accounts: { name: string; pubkey: string; isMut: boolean; isSigner: boolean }[];
  success: boolean;
  error?: string;
}


const IDL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;


const STORAGE_KEY_IDL_CACHE = 'anchorIdlCache';


const DISCRIMINATOR_LENGTH = 8;


const KNOWN_IDL_SOURCES: Record<string, string> = {
  
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'https://raw.githubusercontent.com/jup-ag/jupiter-core/main/idl/jupiter.json',
  
};


const idlCache = new Map<string, CachedIdl>();


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
  }
}


async function cacheIdl(programId: string, idl: AnchorIdl, source: 'onchain' | 'remote' | 'bundled'): Promise<void> {
  const cached: CachedIdl = {
    programId,
    idl,
    fetchedAt: Date.now(),
    source,
  };
  
  idlCache.set(programId, cached);
  
  
  try {
    const allCached: Record<string, CachedIdl> = {};
    for (const [id, entry] of idlCache.entries()) {
      allCached[id] = entry;
    }
    await chrome.storage.local.set({ [STORAGE_KEY_IDL_CACHE]: allCached });
  } catch (error) {
  }
}


function getCachedIdl(programId: string): AnchorIdl | null {
  const cached = idlCache.get(programId);
  if (cached && Date.now() - cached.fetchedAt < IDL_CACHE_TTL) {
    return cached.idl;
  }
  return null;
}


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
    
    
    if (!idl.instructions || !Array.isArray(idl.instructions)) {
      return null;
    }
    
    return idl as AnchorIdl;
  } catch (error) {
    return null;
  }
}


export async function getIdl(programId: string): Promise<AnchorIdl | null> {
  
  const cached = getCachedIdl(programId);
  if (cached) {
    return cached;
  }
  
  
  const remoteIdl = await fetchIdlFromRemote(programId);
  if (remoteIdl) {
    await cacheIdl(programId, remoteIdl, 'remote');
    return remoteIdl;
  }
  
  
  return null;
}


function computeDiscriminator(instructionName: string): number[] {
  
  
  const namespace = 'global';
  const preimage = `${namespace}:${instructionName}`;
  
  
  return [];
}


function matchInstruction(data: Buffer, idl: AnchorIdl): AnchorInstruction | null {
  if (data.length < DISCRIMINATOR_LENGTH) {
    return null;
  }
  
  const discriminatorBytes = Array.from(data.slice(0, DISCRIMINATOR_LENGTH));
  
  for (const instruction of idl.instructions) {
    
    if (instruction.discriminator && instruction.discriminator.length === DISCRIMINATOR_LENGTH) {
      if (arraysEqual(discriminatorBytes, instruction.discriminator)) {
        return instruction;
      }
    }
  }
  
  
  return null;
}


function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}


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
  
  
  const idl = await getIdl(programId);
  if (!idl) {
    result.error = 'No IDL available for this program';
    return result;
  }
  
  result.programName = idl.name || 'Unknown Program';
  
  
  const instruction = matchInstruction(data, idl);
  if (!instruction) {
    result.error = 'Could not match instruction discriminator';
    return result;
  }
  
  result.instructionName = instruction.name;
  
  
  try {
    result.args = decodeArgs(data, DISCRIMINATOR_LENGTH, instruction.args);
  } catch (error) {
    result.error = 'Failed to decode instruction arguments';
    return result;
  }
  
  
  result.accounts = instruction.accounts.map((acc, i) => ({
    name: acc.name,
    pubkey: i < accountKeys.length ? accountKeys[i].toBase58() : 'unknown',
    isMut: acc.isMut,
    isSigner: acc.isSigner,
  }));
  
  result.success = true;
  return result;
}


export function hasKnownIdl(programId: string): boolean {
  return programId in KNOWN_IDL_SOURCES || idlCache.has(programId);
}


export function getProgramsWithIdls(): string[] {
  const fromCache = Array.from(idlCache.keys());
  const fromKnown = Object.keys(KNOWN_IDL_SOURCES);
  return [...new Set([...fromCache, ...fromKnown])];
}


export async function initializeIdlLoader(): Promise<void> {
  await loadIdlCache();
}


export async function clearIdlCache(): Promise<void> {
  idlCache.clear();
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_IDL_CACHE]: {} });
  } catch (error) {
  }
}


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


