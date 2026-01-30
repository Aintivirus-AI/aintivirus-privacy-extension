/**
 * Bitcoin Transaction Construction and Signing
 * 
 * Handles UTXO selection, transaction building, and signing.
 * Supports both legacy P2PKH and SegWit P2WPKH transactions.
 */

import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { blake2b } from '@noble/hashes/blake2b';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bech32 } from 'bech32';
import type { 
  BitcoinChainId, 
  BitcoinAddressType,
  UTXO, 
  UnsignedBitcoinTransaction, 
  SignedBitcoinTransaction,
  BitcoinKeypair,
  BitcoinFeeEstimate,
} from './types';
import { getBitcoinChainConfig } from './config';
import { getUtxos, getFeeEstimate } from './client';

// Opcodes
const OP_DUP = 0x76;
const OP_HASH160 = 0xa9;
const OP_EQUALVERIFY = 0x88;
const OP_CHECKSIG = 0xac;
const OP_0 = 0x00;
const OP_PUSHBYTES_20 = 0x14;

// Signature hash types
const SIGHASH_ALL = 0x01;
const SIGHASH_FORKID = 0x40; // Bitcoin Cash replay protection
const SIGHASH_ALL_FORKID = SIGHASH_ALL | SIGHASH_FORKID; // 0x41

// Transaction versions
const TX_VERSION = 2; // Bitcoin standard
const TX_VERSION_ZCASH_SAPLING = 4; // Zcash Sapling (v4)

// Zcash network upgrade activation heights (mainnet)
// IMPORTANT: Branch IDs are used in ZIP-243/ZIP-244 signature hashing
// After each network upgrade, ALL transactions (v4 and v5) must use the new branch ID
const ZCASH_UPGRADES = {
  SAPLING: { height: 419200, branchId: 0x76b809bb },
  BLOSSOM: { height: 653600, branchId: 0x2bb40e60 },
  HEARTWOOD: { height: 903000, branchId: 0xf5b9230b },
  CANOPY: { height: 1046400, branchId: 0xe9ff75a6 },
  // NU5 activated May 31, 2022
  NU5: { height: 1687104, branchId: 0xf919a198 },
  // NU6 activated November 2024 - branch ID confirmed from network error
  NU6: { height: 2726400, branchId: 0x4dec4df0 },
} as const;

// Zcash version group IDs
const ZCASH_VERSION_GROUP_ID_V4 = 0x892f2085; // Sapling v4
const ZCASH_VERSION_GROUP_ID_V5 = 0x26a7270a; // NU5 v5

/**
 * Get the consensus branch ID for a given block height
 * This is critical for ZIP-243/ZIP-244 signature hashing
 */
function getConsensusBranchId(blockHeight: number): number {
  // Return the branch ID of the highest activated upgrade at this height
  if (blockHeight >= ZCASH_UPGRADES.NU6.height) {
    return ZCASH_UPGRADES.NU6.branchId;
  } else if (blockHeight >= ZCASH_UPGRADES.NU5.height) {
    return ZCASH_UPGRADES.NU5.branchId;
  } else if (blockHeight >= ZCASH_UPGRADES.CANOPY.height) {
    return ZCASH_UPGRADES.CANOPY.branchId;
  } else if (blockHeight >= ZCASH_UPGRADES.HEARTWOOD.height) {
    return ZCASH_UPGRADES.HEARTWOOD.branchId;
  } else if (blockHeight >= ZCASH_UPGRADES.BLOSSOM.height) {
    return ZCASH_UPGRADES.BLOSSOM.branchId;
  } else {
    return ZCASH_UPGRADES.SAPLING.branchId;
  }
}

/**
 * Calculate Zcash fee according to ZIP 317
 * conventional_fee = max(10000, 5000 * max(2, logical_actions))
 * where logical_actions = max(t_in, t_out, nSpendsSapling + nOutputsSapling, 2 * nJoinSplit)
 */
function calculateZcashFee(inputCount: number, outputCount: number): number {
  // For transparent-only transactions
  const logicalActions = Math.max(inputCount, outputCount);
  const fee = Math.max(10000, 5000 * Math.max(2, logicalActions));
  return fee;
}

/**
 * Estimate transaction size in virtual bytes
 * 
 * IMPORTANT: Use conservative estimate for outputs to prevent dust errors.
 * Different output types have different sizes:
 * - P2PKH (legacy): 34 bytes
 * - P2SH (nested segwit): 32 bytes  
 * - P2WPKH (native segwit): 31 bytes
 * 
 * We use the largest size (34 bytes) to ensure we never underestimate the fee,
 * which could cause change outputs to fall below the dust threshold.
 */
function estimateTxSize(
  inputCount: number,
  outputCount: number,
  isSegwit: boolean = true,
  chainId?: BitcoinChainId
): number {
  // Zcash has a larger transaction size due to additional fields
  if (chainId === 'zcash') {
    // Zcash v4 transaction overhead:
    // - version (4) + version group (4) + expiry (4) + value balance (8)
    // - nSpendsSapling (1) + nOutputsSapling (1) + nJoinSplits (1)
    // Total overhead: ~80 bytes
    const baseSize = 80;
    const inputSize = 150; // Similar to legacy Bitcoin
    const outputSize = 34;
    return baseSize + (inputCount * inputSize) + (outputCount * outputSize);
  }
  
  if (isSegwit) {
    // SegWit transaction size estimation
    // Base size: 10 (version + locktime + marker + flag)
    // Input: ~68 vbytes (outpoint + sequence + witness)
    // Output: Use 34 vbytes (conservative - covers P2PKH, P2SH, and P2WPKH)
    const baseSize = 10;
    const inputSize = 68;
    const outputSize = 34; // Conservative: use largest output size to prevent underestimation
    return baseSize + (inputCount * inputSize) + (outputCount * outputSize);
  } else {
    // Legacy transaction size
    // Base: 10 bytes (version + locktime)
    // Input: ~148 bytes (outpoint + scriptsig + sequence)
    // Output: ~34 bytes (value + script)
    const baseSize = 10;
    const inputSize = 148;
    const outputSize = 34;
    return baseSize + (inputCount * inputSize) + (outputCount * outputSize);
  }
}

/**
 * Minimum total fee in satoshis to ensure transaction relay
 * This is a safety floor regardless of fee rate calculation
 * 
 * NOTE: Zcash requires 10,000 zatoshis minimum fee (ZIP 317)
 */
const MIN_TOTAL_FEE_SATOSHIS = 1000;
const MIN_ZCASH_FEE_ZATOSHIS = 10000; // ZIP 317 minimum fee

/**
 * Select UTXOs for a transaction using largest-first algorithm
 * 
 * This function handles the circular dependency between fee and output count:
 * - 2-output tx (with change): larger size, higher fee, less change
 * - 1-output tx (no change): smaller size, lower fee, change absorbed into fee
 * 
 * We always prefer creating change if it's above dust threshold.
 * If change would be dust, we absorb it into the fee and create 1-output tx.
 */
export function selectUtxos(
  utxos: UTXO[],
  targetAmount: number,
  feeRate: number,
  dustThreshold: number,
  chainId?: BitcoinChainId
): { selectedUtxos: UTXO[]; fee: number; change: number } | null {
  // Ensure all inputs are integers to avoid floating-point issues
  const targetAmountInt = Math.floor(targetAmount);
  // Use higher of provided fee rate or minimum 1 sat/vB
  const feeRateInt = Math.max(1, Math.ceil(feeRate));
  // Use higher dust threshold with aggressive safety margin to prevent dust errors
  // We need extra buffer because:
  // 1. Different output address types have different sizes
  // 2. Transaction size estimation may have slight variations
  // 3. Rounding errors can cause edge cases
  // For chains with 1000 sat dust threshold (like Litecoin), use 3000 sats minimum
  const effectiveDustThreshold = Math.max(dustThreshold * 3, 3000);
  
  // Sort UTXOs by value (largest first) for efficient selection
  const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value);
  
  const selectedUtxos: UTXO[] = [];
  let totalInput = 0;
  
  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo);
    totalInput += Math.floor(utxo.value);
    
    // STRATEGY 1: Try 2-output transaction (recipient + change)
    let feeWith2Outputs: number;
    if (chainId === 'zcash') {
      // Use ZIP 317 fee calculation for Zcash
      feeWith2Outputs = calculateZcashFee(selectedUtxos.length, 2);
    } else {
      const sizeWith2Outputs = estimateTxSize(selectedUtxos.length, 2, false, chainId);
      feeWith2Outputs = Math.max(
        Math.ceil(sizeWith2Outputs * feeRateInt),
        MIN_TOTAL_FEE_SATOSHIS
      );
    }
    const changeWith2Outputs = totalInput - targetAmountInt - feeWith2Outputs;
    
    // If change is above dust threshold, we can create a valid 2-output tx
    if (changeWith2Outputs >= effectiveDustThreshold) {
      return {
        selectedUtxos,
        fee: feeWith2Outputs,
        change: Math.floor(changeWith2Outputs),
      };
    }
    
    // STRATEGY 2: Try 1-output transaction (no change, absorb remainder into fee)
    let baseFeeWith1Output: number;
    if (chainId === 'zcash') {
      // Use ZIP 317 fee calculation for Zcash
      baseFeeWith1Output = calculateZcashFee(selectedUtxos.length, 1);
    } else {
      const sizeWith1Output = estimateTxSize(selectedUtxos.length, 1, false, chainId);
      baseFeeWith1Output = Math.max(
        Math.ceil(sizeWith1Output * feeRateInt),
        MIN_TOTAL_FEE_SATOSHIS
      );
    }
    const remainderAfter1Output = totalInput - targetAmountInt - baseFeeWith1Output;
    
    // If we have enough for 1-output tx, absorb all remainder into fee
    if (remainderAfter1Output >= 0) {
      // Remainder is absorbed into fee (could be 0 to just-below-dust)
      return {
        selectedUtxos,
        fee: baseFeeWith1Output + Math.floor(remainderAfter1Output),
        change: 0, // No change output - prevents dust
      };
    }
    
    // Need more UTXOs - continue to next iteration
  }
  
  // Exhausted all UTXOs without finding valid selection
  return null;
}

/**
 * Create an unsigned transaction
 */
export async function createUnsignedTransaction(
  chainId: BitcoinChainId,
  fromAddress: string,
  toAddress: string,
  amount: number, // in satoshis
  testnet: boolean = false
): Promise<{ tx: UnsignedBitcoinTransaction; fee: number }> {
  const config = getBitcoinChainConfig(chainId);
  
  // Validate amount is a valid positive integer
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `Invalid amount: ${amount}. Amount must be a positive number.`
    );
  }
  
  // Ensure amount is an integer (satoshis should be whole numbers)
  const amountSatoshis = Math.floor(amount);
  
  // Check if amount is below dust threshold - reject early before creating transaction
  if (amountSatoshis < config.dustThreshold) {
    throw new Error(
      `Amount ${amountSatoshis} ${config.symbol} (satoshis) is below the dust threshold of ${config.dustThreshold}. ` +
      `Minimum send amount is ${config.dustThreshold / Math.pow(10, config.decimals)} ${config.symbol}.`
    );
  }
  
  // Get UTXOs for the address
  const rawUtxos = await getUtxos(chainId, fromAddress, testnet);
  
  if (rawUtxos.length === 0) {
    throw new Error('No UTXOs available');
  }
  
  // Ensure UTXO values are valid integers
  const utxos = rawUtxos.map(utxo => ({
    ...utxo,
    value: Math.floor(Number(utxo.value) || 0),
  })).filter(utxo => utxo.value > 0);
  
  if (utxos.length === 0) {
    throw new Error('No valid UTXOs available');
  }
  
  // Get fee estimate
  const feeEstimate = await getFeeEstimate(chainId, testnet);
  
  // Select UTXOs
  const selection = selectUtxos(utxos, amountSatoshis, feeEstimate.feeRate, config.dustThreshold, chainId);
  
  if (!selection) {
    throw new Error('Insufficient funds');
  }
  
  // Build transaction inputs - ensure all values are integers
  const inputs = selection.selectedUtxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: Math.floor(utxo.value), // Ensure integer
    script: utxo.script,
    sequence: 0xffffffff,
  }));
  
  // Calculate total input first
  const totalInput = inputs.reduce((sum, input) => sum + input.value, 0);
  
  // Build transaction outputs - ensure all values are integers
  // CRITICAL: Only create change output if it's well above dust threshold
  // Use the same aggressive threshold as selectUtxos to ensure consistency
  const effectiveDustThreshold = Math.max(config.dustThreshold * 3, 3000);
  const changeAmount = Math.floor(selection.change);
  
  const outputs: Array<{ address: string; value: number }> = [
    { address: toAddress, value: Math.floor(amountSatoshis) },
  ];
  
  // Only add change output if it's definitively above dust threshold
  if (changeAmount >= effectiveDustThreshold) {
    outputs.push({ address: fromAddress, value: changeAmount });
  }
  // If change is between 0 and dustThreshold, it's absorbed into the fee (no output created)
  
  // Calculate total output and implicit fee
  const totalOutput = outputs.reduce((sum, output) => sum + output.value, 0);
  const implicitFee = totalInput - totalOutput;
  
  // Comprehensive validation
  if (implicitFee < 0) {
    throw new Error(
      `Transaction would have negative fee (${implicitFee}). This indicates insufficient funds.`
    );
  }
  
  // Ensure minimum fee is met (check chain-specific minimums)
  const minFee = chainId === 'zcash' ? MIN_ZCASH_FEE_ZATOSHIS : MIN_TOTAL_FEE_SATOSHIS;
  if (implicitFee < minFee) {
    throw new Error(
      `Transaction fee (${implicitFee}) is below minimum required (${minFee}). ` +
      `This may cause the transaction to be rejected by the network.`
    );
  }
  
  // Final validation: ensure NO outputs are below dust threshold
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    if (output.value < effectiveDustThreshold) {
      const outputType = i === 0 ? 'recipient' : 'change';
      throw new Error(
        `DUST ERROR: ${outputType} output value ${output.value} is below threshold ${effectiveDustThreshold}. ` +
        `This would cause the transaction to be rejected. Try a different amount.`
      );
    }
  }
  
  
  // Double-check: if we have change that's below threshold but above 0, something is wrong
  if (changeAmount > 0 && changeAmount < effectiveDustThreshold) {
    console.warn(`[${chainId}] Change ${changeAmount} is between 0 and dust threshold - absorbing into fee`);
    // This should have been handled by selectUtxos, but verify the math
    const expectedFee = totalInput - amountSatoshis;
    if (expectedFee !== implicitFee) {
      console.error(`[${chainId}] Fee mismatch: expected ${expectedFee}, got ${implicitFee}`);
    }
  }
  
  return {
    tx: {
      inputs,
      outputs,
      changeAddress: changeAmount >= effectiveDustThreshold ? fromAddress : undefined,
      feeRate: feeEstimate.feeRate,
    },
    fee: Math.floor(implicitFee), // Use the actual calculated fee
  };
}

/**
 * Encode a variable-length integer (CompactSize)
 */
function encodeVarInt(value: number): Uint8Array {
  if (value < 0xfd) {
    return new Uint8Array([value]);
  } else if (value <= 0xffff) {
    return new Uint8Array([0xfd, value & 0xff, (value >> 8) & 0xff]);
  } else if (value <= 0xffffffff) {
    return new Uint8Array([
      0xfe,
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      (value >> 24) & 0xff,
    ]);
  } else {
    throw new Error('Value too large for varint');
  }
}

/**
 * Encode a 32-bit little-endian integer
 */
function encodeUint32LE(value: number): Uint8Array {
  const buffer = new Uint8Array(4);
  buffer[0] = value & 0xff;
  buffer[1] = (value >> 8) & 0xff;
  buffer[2] = (value >> 16) & 0xff;
  buffer[3] = (value >> 24) & 0xff;
  return buffer;
}

/**
 * Encode a 64-bit little-endian integer (as two 32-bit values)
 */
function encodeUint64LE(value: number): Uint8Array {
  const buffer = new Uint8Array(8);
  const low = value >>> 0;
  const high = Math.floor(value / 0x100000000);
  buffer[0] = low & 0xff;
  buffer[1] = (low >> 8) & 0xff;
  buffer[2] = (low >> 16) & 0xff;
  buffer[3] = (low >> 24) & 0xff;
  buffer[4] = high & 0xff;
  buffer[5] = (high >> 8) & 0xff;
  buffer[6] = (high >> 16) & 0xff;
  buffer[7] = (high >> 24) & 0xff;
  return buffer;
}

/**
 * Reverse a hex string (for txid handling)
 */
function reverseHex(hex: string): string {
  const bytes = hex.match(/.{2}/g);
  return bytes ? bytes.reverse().join('') : '';
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a P2PKH scriptPubKey
 */
function createP2PKHScript(pubKeyHash: Uint8Array): Uint8Array {
  const script = new Uint8Array(25);
  script[0] = OP_DUP;
  script[1] = OP_HASH160;
  script[2] = 0x14; // Push 20 bytes
  script.set(pubKeyHash, 3);
  script[23] = OP_EQUALVERIFY;
  script[24] = OP_CHECKSIG;
  return script;
}

/**
 * Create a P2WPKH scriptPubKey
 */
function createP2WPKHScript(pubKeyHash: Uint8Array): Uint8Array {
  const script = new Uint8Array(22);
  script[0] = OP_0;
  script[1] = OP_PUSHBYTES_20;
  script.set(pubKeyHash, 2);
  return script;
}

/**
 * Compute double SHA256
 */
function doubleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

/**
 * Compute HASH160 (RIPEMD160(SHA256(data)))
 */
function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/**
 * Compute BLAKE2b-256 hash with personalization (for Zcash)
 */
function blake2bHash(data: Uint8Array, personalization: string): Uint8Array {
  const personalBytes = new Uint8Array(16);
  const encoded = new TextEncoder().encode(personalization);
  personalBytes.set(encoded.slice(0, 16), 0);
  return blake2b(data, { dkLen: 32, personalization: personalBytes });
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Decode a Bitcoin address to its hash and type
 */
function decodeAddress(
  address: string,
  chainId: BitcoinChainId,
  testnet: boolean = false
): { hash: Uint8Array; type: 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' } {
  const config = getBitcoinChainConfig(chainId);
  const network = testnet && config.testnet ? config.testnet : config.network;
  
  // Check for bech32 address (native SegWit)
  if (network.bech32 && address.toLowerCase().startsWith(network.bech32 + '1')) {
    const decoded = bech32.decode(address.toLowerCase());
    const data = bech32.fromWords(decoded.words.slice(1));
    const hash = new Uint8Array(data);
    
    if (hash.length === 20) {
      return { hash, type: 'p2wpkh' };
    } else if (hash.length === 32) {
      return { hash, type: 'p2wsh' };
    }
  }
  
  // Base58Check address (legacy or P2SH)
  const decoded = fromBase58(address);
  const payload = decoded.slice(0, -4);
  
  // Check version byte(s) - support both single-byte and multi-byte prefixes
  const checkVersionMatch = (version: number | number[]): boolean => {
    if (typeof version === 'number') {
      return payload[0] === version;
    } else {
      if (payload.length < version.length) return false;
      for (let i = 0; i < version.length; i++) {
        if (payload[i] !== version[i]) return false;
      }
      return true;
    }
  };
  
  const versionLength = typeof network.pubKeyHash === 'number' ? 1 : network.pubKeyHash.length;
  const hash = payload.slice(versionLength); // Remove version byte(s)
  
  if (checkVersionMatch(network.pubKeyHash)) {
    return { hash, type: 'p2pkh' };
  } else if (checkVersionMatch(network.scriptHash)) {
    return { hash, type: 'p2sh' };
  }
  
  throw new Error(`Unknown address format: ${address}`);
}

/**
 * Base58 alphabet
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode base58 string to bytes
 */
function fromBase58(str: string): Uint8Array {
  const bytes = [0];
  
  for (let i = 0; i < str.length; i++) {
    const value = BASE58_ALPHABET.indexOf(str[i]);
    if (value < 0) {
      throw new Error('Invalid base58 character');
    }
    
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  
  // Handle leading ones (zeros in decoded form)
  for (let i = 0; i < str.length && str[i] === BASE58_ALPHABET[0]; i++) {
    bytes.push(0);
  }
  
  return new Uint8Array(bytes.reverse());
}

/**
 * Create scriptPubKey for an address
 */
function createScriptPubKey(
  address: string,
  chainId: BitcoinChainId,
  testnet: boolean = false
): Uint8Array {
  const { hash, type } = decodeAddress(address, chainId, testnet);
  
  switch (type) {
    case 'p2pkh':
      return createP2PKHScript(hash);
    case 'p2sh': {
      // P2SH: OP_HASH160 <20-byte-script-hash> OP_EQUAL
      const script = new Uint8Array(23);
      script[0] = OP_HASH160;
      script[1] = 0x14; // Push 20 bytes
      script.set(hash, 2);
      script[22] = 0x87; // OP_EQUAL
      return script;
    }
    case 'p2wpkh':
      return createP2WPKHScript(hash);
    case 'p2wsh': {
      // P2WSH: OP_0 <32-byte-script-hash>
      const script = new Uint8Array(34);
      script[0] = OP_0;
      script[1] = 0x20; // Push 32 bytes
      script.set(hash, 2);
      return script;
    }
    default:
      throw new Error(`Unsupported address type: ${type}`);
  }
}

/**
 * Check if address is SegWit (P2WPKH or P2WSH)
 */
function isSegwitAddress(address: string, chainId: BitcoinChainId, testnet: boolean = false): boolean {
  const config = getBitcoinChainConfig(chainId);
  const network = testnet && config.testnet ? config.testnet : config.network;
  
  if (network.bech32 && address.toLowerCase().startsWith(network.bech32 + '1')) {
    return true;
  }
  return false;
}

/**
 * Serialize a transaction output
 */
function serializeOutput(output: { address: string; value: number }, chainId: BitcoinChainId, testnet: boolean): Uint8Array {
  const scriptPubKey = createScriptPubKey(output.address, chainId, testnet);
  const parts: Uint8Array[] = [
    encodeUint64LE(output.value),
    encodeVarInt(scriptPubKey.length),
    scriptPubKey,
  ];
  return concatBytes(...parts);
}

/**
 * Create a Zcash Sapling (v4) signature hash (ZIP 243)
 * Similar to BIP143 but with Zcash-specific modifications
 */
function createZcashSigHash(
  tx: UnsignedBitcoinTransaction,
  inputIndex: number,
  scriptCode: Uint8Array,
  value: number,
  hashType: number,
  consensusBranchId: number,
  chainId: BitcoinChainId,
  testnet: boolean
): Uint8Array {
  // 1. Header with overwintered flag
  const versionWithFlag = TX_VERSION_ZCASH_SAPLING | (1 << 31);
  const header = encodeUint32LE(versionWithFlag);
  
  // 2. Version group ID
  const versionGroupId = encodeUint32LE(ZCASH_VERSION_GROUP_ID_V4);
  
  // 3. hashPrevouts - using BLAKE2b for Zcash
  let hashPrevouts: Uint8Array;
  if ((hashType & 0x80) === 0) {
    const prevouts = concatBytes(...tx.inputs.map(input => {
      return concatBytes(
        hexToBytes(reverseHex(input.txid)),
        encodeUint32LE(input.vout)
      );
    }));
    hashPrevouts = blake2bHash(prevouts, 'ZcashPrevoutHash');
  } else {
    hashPrevouts = new Uint8Array(32);
  }
  
  // 4. hashSequence - using BLAKE2b for Zcash
  let hashSequence: Uint8Array;
  if ((hashType & 0x80) === 0 && (hashType & 0x1f) !== 0x02) {
    const sequences = concatBytes(...tx.inputs.map(input => 
      encodeUint32LE(input.sequence ?? 0xffffffff)
    ));
    hashSequence = blake2bHash(sequences, 'ZcashSequencHash');
  } else {
    hashSequence = new Uint8Array(32);
  }
  
  // 5. hashOutputs - using BLAKE2b for Zcash
  let hashOutputs: Uint8Array;
  if ((hashType & 0x1f) !== 0x02 && (hashType & 0x1f) !== 0x03) {
    const outputs = concatBytes(...tx.outputs.map(output => 
      serializeOutput(output, chainId, testnet)
    ));
    hashOutputs = blake2bHash(outputs, 'ZcashOutputsHash');
  } else {
    hashOutputs = new Uint8Array(32);
  }
  
  // 6. hashJoinSplits (empty for transparent-only)
  const hashJoinSplits = new Uint8Array(32);
  
  // 7. hashShieldedSpends (empty for transparent-only)
  const hashShieldedSpends = new Uint8Array(32);
  
  // 8. hashShieldedOutputs (empty for transparent-only)
  const hashShieldedOutputs = new Uint8Array(32);
  
  // 9. Locktime
  const locktime = encodeUint32LE(0);
  
  // 10. Expiry height
  const expiryHeight = encodeUint32LE(0);
  
  // 11. Value balance (0 for transparent-only)
  const valueBalance = new Uint8Array(8);
  
  // 12. Hash type
  const hashTypeBytes = encodeUint32LE(hashType);
  
  // 13. Current input outpoint
  const input = tx.inputs[inputIndex];
  const outpoint = concatBytes(
    hexToBytes(reverseHex(input.txid)),
    encodeUint32LE(input.vout)
  );
  
  // 14. ScriptCode
  const scriptCodeWithLength = concatBytes(
    encodeVarInt(scriptCode.length),
    scriptCode
  );
  
  // 15. Input value
  const valueBytes = new Uint8Array(8);
  const valueView = new DataView(valueBytes.buffer);
  valueView.setBigUint64(0, BigInt(value), true);
  
  // 16. Sequence
  const sequenceBytes = encodeUint32LE(input.sequence ?? 0xffffffff);
  
  // Concatenate all and hash
  const preimage = concatBytes(
    header,
    versionGroupId,
    hashPrevouts,
    hashSequence,
    hashOutputs,
    hashJoinSplits,
    hashShieldedSpends,
    hashShieldedOutputs,
    locktime,
    expiryHeight,
    valueBalance,
    hashTypeBytes,
    outpoint,
    scriptCodeWithLength,
    valueBytes,
    sequenceBytes
  );
  
  // Zcash uses BLAKE2b-256 with personalization "ZcashSigHash"
  // The personalization string is 16 bytes: "ZcashSigHash" + branch ID (4 bytes)
  const personalization = new Uint8Array(16);
  const sigHashText = new TextEncoder().encode('ZcashSigHash');
  personalization.set(sigHashText, 0);
  // Add branch ID at the end (little-endian)
  const branchIdView = new DataView(personalization.buffer, 12, 4);
  branchIdView.setUint32(0, consensusBranchId, true);
  
  // Use BLAKE2b-256 with personalization
  return blake2b(preimage, { dkLen: 32, personalization });
}

/**
 * Create BIP143 signature hash for SegWit inputs
 * https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki
 */
function createBIP143SigHash(
  tx: UnsignedBitcoinTransaction,
  inputIndex: number,
  scriptCode: Uint8Array,
  value: number,
  hashType: number,
  chainId: BitcoinChainId,
  testnet: boolean
): Uint8Array {
  // 1. Version (4 bytes, little-endian)
  const version = encodeUint32LE(TX_VERSION);
  
  // 2. hashPrevouts - hash of all input outpoints
  let hashPrevouts: Uint8Array;
  if ((hashType & 0x80) === 0) { // SIGHASH_ANYONECANPAY not set
    const prevouts = concatBytes(...tx.inputs.map(input => {
      return concatBytes(
        hexToBytes(reverseHex(input.txid)),
        encodeUint32LE(input.vout)
      );
    }));
    hashPrevouts = doubleSha256(prevouts);
  } else {
    hashPrevouts = new Uint8Array(32);
  }
  
  // 3. hashSequence - hash of all input sequences
  let hashSequence: Uint8Array;
  if ((hashType & 0x80) === 0 && (hashType & 0x1f) !== 0x02 && (hashType & 0x1f) !== 0x03) {
    const sequences = concatBytes(...tx.inputs.map(input => 
      encodeUint32LE(input.sequence ?? 0xffffffff)
    ));
    hashSequence = doubleSha256(sequences);
  } else {
    hashSequence = new Uint8Array(32);
  }
  
  // 4. Outpoint of this input
  const input = tx.inputs[inputIndex];
  const outpoint = concatBytes(
    hexToBytes(reverseHex(input.txid)),
    encodeUint32LE(input.vout)
  );
  
  // 5. scriptCode (for P2WPKH, this is OP_DUP OP_HASH160 <pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG)
  const scriptCodeWithLength = concatBytes(encodeVarInt(scriptCode.length), scriptCode);
  
  // 6. Value of the input
  const valueBytes = encodeUint64LE(value);
  
  // 7. Sequence of the input
  const sequence = encodeUint32LE(input.sequence ?? 0xffffffff);
  
  // 8. hashOutputs
  let hashOutputs: Uint8Array;
  if ((hashType & 0x1f) !== 0x02 && (hashType & 0x1f) !== 0x03) {
    const outputs = concatBytes(...tx.outputs.map(output => 
      serializeOutput(output, chainId, testnet)
    ));
    hashOutputs = doubleSha256(outputs);
  } else if ((hashType & 0x1f) === 0x03 && inputIndex < tx.outputs.length) {
    hashOutputs = doubleSha256(serializeOutput(tx.outputs[inputIndex], chainId, testnet));
  } else {
    hashOutputs = new Uint8Array(32);
  }
  
  // 9. Locktime (4 bytes, little-endian)
  const locktime = encodeUint32LE(0);
  
  // 10. Sighash type (4 bytes, little-endian)
  const hashTypeBytes = encodeUint32LE(hashType);
  
  // Concatenate all and hash
  const preimage = concatBytes(
    version,
    hashPrevouts,
    hashSequence,
    outpoint,
    scriptCodeWithLength,
    valueBytes,
    sequence,
    hashOutputs,
    locktime,
    hashTypeBytes
  );
  
  return doubleSha256(preimage);
}

/**
 * Create legacy signature hash for P2PKH inputs
 */
function createLegacySigHash(
  tx: UnsignedBitcoinTransaction,
  inputIndex: number,
  prevScriptPubKey: Uint8Array,
  hashType: number,
  chainId: BitcoinChainId,
  testnet: boolean
): Uint8Array {
  // Build the transaction with modified scripts
  const parts: Uint8Array[] = [];
  
  // Version
  parts.push(encodeUint32LE(TX_VERSION));
  
  // Number of inputs
  parts.push(encodeVarInt(tx.inputs.length));
  
  // Inputs
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    // Outpoint: txid (reversed) + vout
    parts.push(hexToBytes(reverseHex(input.txid)));
    parts.push(encodeUint32LE(input.vout));
    
    // Script: only the signing input gets the scriptPubKey
    if (i === inputIndex) {
      parts.push(encodeVarInt(prevScriptPubKey.length));
      parts.push(prevScriptPubKey);
    } else {
      parts.push(encodeVarInt(0));
    }
    
    // Sequence
    parts.push(encodeUint32LE(input.sequence ?? 0xffffffff));
  }
  
  // Number of outputs
  parts.push(encodeVarInt(tx.outputs.length));
  
  // Outputs
  for (const output of tx.outputs) {
    parts.push(serializeOutput(output, chainId, testnet));
  }
  
  // Locktime
  parts.push(encodeUint32LE(0));
  
  // Sighash type (4 bytes for signing)
  parts.push(encodeUint32LE(hashType));
  
  const preimage = concatBytes(...parts);
  return doubleSha256(preimage);
}

/**
 * Sign data with private key using ECDSA
 */
function signData(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const signature = secp256k1.sign(hash, privateKey);
  // Convert to DER format
  return signature.toDERRawBytes();
}

/**
 * Serialize a signed SegWit transaction
 */
function serializeSegwitTx(
  tx: UnsignedBitcoinTransaction,
  signatures: Array<{ signature: Uint8Array; publicKey: Uint8Array; sigHashType: number }>,
  chainId: BitcoinChainId,
  testnet: boolean
): Uint8Array {
  const parts: Uint8Array[] = [];
  
  // Version
  parts.push(encodeUint32LE(TX_VERSION));
  
  // Marker and flag for SegWit
  parts.push(new Uint8Array([0x00, 0x01]));
  
  // Number of inputs
  parts.push(encodeVarInt(tx.inputs.length));
  
  // Inputs (with empty scriptSig for SegWit)
  for (const input of tx.inputs) {
    parts.push(hexToBytes(reverseHex(input.txid)));
    parts.push(encodeUint32LE(input.vout));
    parts.push(encodeVarInt(0)); // Empty scriptSig
    parts.push(encodeUint32LE(input.sequence ?? 0xffffffff));
  }
  
  // Number of outputs
  parts.push(encodeVarInt(tx.outputs.length));
  
  // Outputs
  for (const output of tx.outputs) {
    parts.push(serializeOutput(output, chainId, testnet));
  }
  
  // Witness data for each input
  for (const sig of signatures) {
    parts.push(encodeVarInt(2)); // 2 stack items
    // Signature with sighash type
    const sigWithType = concatBytes(sig.signature, new Uint8Array([sig.sigHashType]));
    parts.push(encodeVarInt(sigWithType.length));
    parts.push(sigWithType);
    // Public key
    parts.push(encodeVarInt(sig.publicKey.length));
    parts.push(sig.publicKey);
  }
  
  // Locktime
  parts.push(encodeUint32LE(0));
  
  return concatBytes(...parts);
}

/**
 * Serialize a signed legacy transaction
 */
function serializeLegacyTx(
  tx: UnsignedBitcoinTransaction,
  signatures: Array<{ signature: Uint8Array; publicKey: Uint8Array; sigHashType: number }>,
  chainId: BitcoinChainId,
  testnet: boolean
): Uint8Array {
  const parts: Uint8Array[] = [];
  
  // Version
  parts.push(encodeUint32LE(TX_VERSION));
  
  // Number of inputs
  parts.push(encodeVarInt(tx.inputs.length));
  
  // Inputs with scriptSig
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    parts.push(hexToBytes(reverseHex(input.txid)));
    parts.push(encodeUint32LE(input.vout));
    
    // Build scriptSig: <sig> <pubkey>
    const sig = signatures[i];
    const sigWithType = concatBytes(sig.signature, new Uint8Array([sig.sigHashType]));
    const scriptSig = concatBytes(
      encodeVarInt(sigWithType.length),
      sigWithType,
      encodeVarInt(sig.publicKey.length),
      sig.publicKey
    );
    
    parts.push(encodeVarInt(scriptSig.length));
    parts.push(scriptSig);
    parts.push(encodeUint32LE(input.sequence ?? 0xffffffff));
  }
  
  // Number of outputs
  parts.push(encodeVarInt(tx.outputs.length));
  
  // Outputs
  for (const output of tx.outputs) {
    parts.push(serializeOutput(output, chainId, testnet));
  }
  
  // Locktime
  parts.push(encodeUint32LE(0));
  
  return concatBytes(...parts);
}

/**
 * Serialize a signed Zcash Sapling transaction (version 4)
 * Zcash transparent transactions have a different format from Bitcoin
 */
function serializeZcashTx(
  tx: UnsignedBitcoinTransaction,
  signatures: Array<{ signature: Uint8Array; publicKey: Uint8Array; sigHashType: number }>,
  chainId: BitcoinChainId,
  testnet: boolean
): Uint8Array {
  const parts: Uint8Array[] = [];
  
  // Header: version (4 bytes) with overwintered flag
  // Version 4 with overwintered flag set (bit 31)
  const versionWithFlag = TX_VERSION_ZCASH_SAPLING | (1 << 31);
  parts.push(encodeUint32LE(versionWithFlag));
  
  // Version group ID (4 bytes) - Sapling
  parts.push(encodeUint32LE(ZCASH_VERSION_GROUP_ID_V4));
  
  // Number of transparent inputs
  parts.push(encodeVarInt(tx.inputs.length));
  
  // Transparent inputs with scriptSig
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    parts.push(hexToBytes(reverseHex(input.txid)));
    parts.push(encodeUint32LE(input.vout));
    
    // Build scriptSig: <sig> <pubkey>
    const sig = signatures[i];
    const sigWithType = concatBytes(sig.signature, new Uint8Array([sig.sigHashType]));
    const scriptSig = concatBytes(
      encodeVarInt(sigWithType.length),
      sigWithType,
      encodeVarInt(sig.publicKey.length),
      sig.publicKey
    );
    
    parts.push(encodeVarInt(scriptSig.length));
    parts.push(scriptSig);
    parts.push(encodeUint32LE(input.sequence ?? 0xffffffff));
  }
  
  // Number of transparent outputs
  parts.push(encodeVarInt(tx.outputs.length));
  
  // Transparent outputs
  for (const output of tx.outputs) {
    parts.push(serializeOutput(output, chainId, testnet));
  }
  
  // Locktime (4 bytes)
  parts.push(encodeUint32LE(0));
  
  // Expiry height (4 bytes) - set to 0 for no expiry
  parts.push(encodeUint32LE(0));
  
  // Value balance (8 bytes, signed) - for shielded transactions, 0 for transparent-only
  parts.push(new Uint8Array(8)); // 0 value balance
  
  // Number of Spend descriptions (varint) - 0 for transparent-only
  parts.push(encodeVarInt(0));
  
  // Number of Output descriptions (varint) - 0 for transparent-only
  parts.push(encodeVarInt(0));
  
  // Number of JoinSplits (varint) - 0 for transparent-only
  parts.push(encodeVarInt(0));
  
  return concatBytes(...parts);
}

/**
 * Compute Zcash transaction ID (Sapling v4)
 */
function computeZcashTxid(rawTx: Uint8Array): string {
  // For Zcash v4, the txid is the double SHA256 of the serialized transaction
  const hash = doubleSha256(rawTx);
  // Reverse for display (Bitcoin/Zcash use little-endian internally)
  return bytesToHex(hash.reverse());
}

/**
 * Compute transaction ID (hash of non-witness serialization, reversed)
 */
function computeTxid(rawTx: Uint8Array, isSegwit: boolean): string {
  let txForHash: Uint8Array;
  
  if (isSegwit) {
    // For SegWit, txid is computed without witness data
    // We need to strip marker, flag, and witness
    const parts: Uint8Array[] = [];
    let offset = 0;
    
    // Version (4 bytes)
    parts.push(rawTx.slice(0, 4));
    offset = 4;
    
    // Skip marker and flag
    offset += 2;
    
    // Read input count
    const inputCountResult = readVarInt(rawTx, offset);
    parts.push(encodeVarInt(inputCountResult.value));
    offset = inputCountResult.offset;
    
    // Read inputs (without witness)
    for (let i = 0; i < inputCountResult.value; i++) {
      // Outpoint (36 bytes)
      parts.push(rawTx.slice(offset, offset + 36));
      offset += 36;
      
      // ScriptSig length and script
      const scriptLenResult = readVarInt(rawTx, offset);
      parts.push(encodeVarInt(scriptLenResult.value));
      offset = scriptLenResult.offset;
      parts.push(rawTx.slice(offset, offset + scriptLenResult.value));
      offset += scriptLenResult.value;
      
      // Sequence (4 bytes)
      parts.push(rawTx.slice(offset, offset + 4));
      offset += 4;
    }
    
    // Read output count
    const outputCountResult = readVarInt(rawTx, offset);
    parts.push(encodeVarInt(outputCountResult.value));
    offset = outputCountResult.offset;
    
    // Read outputs
    for (let i = 0; i < outputCountResult.value; i++) {
      // Value (8 bytes)
      parts.push(rawTx.slice(offset, offset + 8));
      offset += 8;
      
      // ScriptPubKey length and script
      const scriptLenResult = readVarInt(rawTx, offset);
      parts.push(encodeVarInt(scriptLenResult.value));
      offset = scriptLenResult.offset;
      parts.push(rawTx.slice(offset, offset + scriptLenResult.value));
      offset += scriptLenResult.value;
    }
    
    // Skip witness data and read locktime from end
    parts.push(rawTx.slice(rawTx.length - 4));
    
    txForHash = concatBytes(...parts);
  } else {
    txForHash = rawTx;
  }
  
  const hash = doubleSha256(txForHash);
  // Reverse for display (Bitcoin uses little-endian internally)
  return bytesToHex(hash.reverse());
}

/**
 * Read a variable-length integer
 */
function readVarInt(data: Uint8Array, offset: number): { value: number; offset: number } {
  const first = data[offset];
  if (first < 0xfd) {
    return { value: first, offset: offset + 1 };
  } else if (first === 0xfd) {
    return { 
      value: data[offset + 1] | (data[offset + 2] << 8), 
      offset: offset + 3 
    };
  } else if (first === 0xfe) {
    return { 
      value: data[offset + 1] | (data[offset + 2] << 8) | 
             (data[offset + 3] << 16) | (data[offset + 4] << 24), 
      offset: offset + 5 
    };
  }
  throw new Error('64-bit varint not supported');
}

/**
 * Sign a Bitcoin transaction
 * 
 * Supports both legacy P2PKH and native SegWit P2WPKH addresses.
 * For Zcash, this requires fetching the current block height to determine
 * the correct consensus branch ID for signature hashing.
 */
export async function signTransaction(
  tx: UnsignedBitcoinTransaction,
  keypair: BitcoinKeypair,
  chainId: BitcoinChainId,
  testnet: boolean = false
): Promise<SignedBitcoinTransaction> {
  // Validate transaction before signing
  const validation = validateTransaction(tx, chainId);
  if (!validation.valid) {
    throw new Error(`Transaction validation failed: ${validation.error}`);
  }
  
  // Get public key bytes from hex string
  const publicKeyHex = keypair.publicKey;
  const publicKey = hexToBytes(publicKeyHex);
  const pubKeyHash = hash160(publicKey);
  
  // Determine if we're using SegWit based on address type
  const isSegwit = keypair.addressType === 'native-segwit' || 
                   keypair.addressType === 'segwit';
  
  // Check if this is Zcash or Bitcoin Cash
  const isZcash = chainId === 'zcash';
  const isBitcoinCash = chainId === 'bitcoincash';
  
  // For Zcash, fetch current block height to determine consensus branch ID
  let consensusBranchId = 0;
  if (isZcash) {
    try {
      const { getBlockHeight } = await import('./client');
      const blockHeight = await getBlockHeight(chainId, testnet);
      consensusBranchId = getConsensusBranchId(blockHeight);
    } catch (error) {
      console.error('[Zcash Sign] Failed to fetch block height, using fallback (NU6):', error);
      // Fallback to NU6 if we can't fetch block height (activated November 2024)
      consensusBranchId = ZCASH_UPGRADES.NU6.branchId;
    }
  }
  
  // Determine which sighash type to use
  const sigHashType = isBitcoinCash ? SIGHASH_ALL_FORKID : SIGHASH_ALL;
  
  // Create signatures for each input
  const signatures: Array<{ signature: Uint8Array; publicKey: Uint8Array; sigHashType: number }> = [];
  
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    let sigHash: Uint8Array;
    
    if (isZcash) {
      // Use ZIP-243 signature hash for Zcash v4 (Sapling) transactions
      const scriptCode = createP2PKHScript(pubKeyHash);
      sigHash = createZcashSigHash(tx, i, scriptCode, input.value, SIGHASH_ALL, consensusBranchId, chainId, testnet);
    } else if (isBitcoinCash || isSegwit) {
      // BIP143 signature hash for Bitcoin Cash (with FORKID) and SegWit
      // Bitcoin Cash uses BIP143 digest algorithm with SIGHASH_FORKID
      // scriptCode for P2WPKH/P2PKH is: OP_DUP OP_HASH160 <pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG
      const scriptCode = createP2PKHScript(pubKeyHash);
      sigHash = createBIP143SigHash(tx, i, scriptCode, input.value, sigHashType, chainId, testnet);
    } else {
      // Legacy signature hash
      const prevScriptPubKey = createP2PKHScript(pubKeyHash);
      sigHash = createLegacySigHash(tx, i, prevScriptPubKey, SIGHASH_ALL, chainId, testnet);
    }
    
    // Sign the hash
    const signature = signData(sigHash, keypair.privateKey);
    signatures.push({ signature, publicKey, sigHashType });
  }
  
  // Serialize the signed transaction
  let rawTx: Uint8Array;
  let txid: string;
  
  if (isZcash) {
    rawTx = serializeZcashTx(tx, signatures, chainId, testnet);
    txid = computeZcashTxid(rawTx);
  } else if (isSegwit && !isBitcoinCash) {
    // Bitcoin Cash does not support SegWit
    rawTx = serializeSegwitTx(tx, signatures, chainId, testnet);
    txid = computeTxid(rawTx, true);
  } else {
    // Legacy format for Bitcoin Cash and other non-SegWit chains
    rawTx = serializeLegacyTx(tx, signatures, chainId, testnet);
    txid = computeTxid(rawTx, false);
  }
  
  return {
    hex: bytesToHex(rawTx),
    txid,
  };
}

/**
 * Estimate fee for a transaction
 */
export async function estimateTransactionFee(
  chainId: BitcoinChainId,
  fromAddress: string,
  toAddress: string,
  amount: number,
  testnet: boolean = false
): Promise<BitcoinFeeEstimate> {
  const config = getBitcoinChainConfig(chainId);
  
  // Get current fee rate first
  const baseFeeEstimate = await getFeeEstimate(chainId, testnet);
  
  // Get UTXOs to estimate input count
  let utxos;
  try {
    utxos = await getUtxos(chainId, fromAddress, testnet);
  } catch (e) {
    console.warn(`[${chainId}] Failed to get UTXOs for fee estimation:`, e);
    // Return an estimate based on typical tx size (1 input, 2 outputs)
    const typicalTxSize = 250; // bytes
    return {
      ...baseFeeEstimate,
      totalFee: Math.ceil(typicalTxSize * baseFeeEstimate.feeRate),
    };
  }
  
  if (utxos.length === 0) {
    // No UTXOs available, return estimate for typical tx
    const typicalTxSize = 250;
    return {
      ...baseFeeEstimate,
      totalFee: Math.ceil(typicalTxSize * baseFeeEstimate.feeRate),
    };
  }
  
  // Select UTXOs to estimate actual transaction size
  const selection = selectUtxos(utxos, amount, baseFeeEstimate.feeRate, config.dustThreshold, chainId);
  
  if (!selection) {
    // Selection failed (likely insufficient funds), estimate based on all UTXOs
    const estimatedInputs = Math.min(utxos.length, 5); // Assume up to 5 inputs
    const estimatedSize = estimateTxSize(estimatedInputs, 2);
    return {
      ...baseFeeEstimate,
      totalFee: Math.ceil(estimatedSize * baseFeeEstimate.feeRate),
    };
  }
  
  return {
    ...baseFeeEstimate,
    totalFee: selection.fee,
  };
}

/**
 * Validate a transaction before signing
 * Performs comprehensive checks to catch issues before broadcast
 */
export function validateTransaction(
  tx: UnsignedBitcoinTransaction,
  chainId: BitcoinChainId
): { valid: boolean; error?: string } {
  const config = getBitcoinChainConfig(chainId);
  
  // Check inputs
  if (tx.inputs.length === 0) {
    return { valid: false, error: 'No inputs provided. Cannot create transaction without UTXOs.' };
  }
  
  // Validate each input has required fields and positive values
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    if (!input.txid || input.txid.length !== 64) {
      return { valid: false, error: `Input ${i} has invalid txid` };
    }
    if (typeof input.vout !== 'number' || input.vout < 0) {
      return { valid: false, error: `Input ${i} has invalid vout` };
    }
    if (typeof input.value !== 'number' || input.value <= 0) {
      return { valid: false, error: `Input ${i} has invalid value: ${input.value}` };
    }
    // Ensure input value is an integer
    if (!Number.isInteger(input.value)) {
      return { valid: false, error: `Input ${i} value must be an integer (satoshis): ${input.value}` };
    }
  }
  
  // Check outputs
  if (tx.outputs.length === 0) {
    return { valid: false, error: 'No outputs provided. Transaction must have at least one recipient.' };
  }
  
  // Check for dust outputs with detailed error messages
  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    const outputType = i === 0 ? 'recipient' : 'change';
    
    // Ensure output value is an integer
    if (!Number.isInteger(output.value)) {
      return { 
        valid: false, 
        error: `Output ${i} value must be an integer (satoshis): ${output.value}. ` +
               `This may indicate a floating-point calculation error.`
      };
    }
    
    // Use aggressive threshold for change outputs to prevent dust errors
    // Recipient outputs only need to meet network minimum
    const threshold = i === 0 
      ? config.dustThreshold  // Recipient: use network minimum
      : Math.max(config.dustThreshold * 3, 3000);  // Change: use aggressive threshold
    
    if (output.value < threshold) {
      return { 
        valid: false, 
        error: `Output ${i} (${outputType}) value ${output.value} ${config.symbol} (satoshis) ` +
               `is below ${outputType} threshold of ${threshold}. ` +
               `Try sending a slightly different amount to avoid dust outputs.`
      };
    }
    
    if (!output.address) {
      return { valid: false, error: `Output ${i} has no address specified` };
    }
  }
  
  // Calculate totals
  const totalInput = tx.inputs.reduce((sum, input) => sum + input.value, 0);
  const totalOutput = tx.outputs.reduce((sum, output) => sum + output.value, 0);
  const implicitFee = totalInput - totalOutput;
  
  // Check that inputs cover outputs (fee is the difference)
  if (totalInput < totalOutput) {
    return { 
      valid: false, 
      error: `Insufficient input value. Total inputs: ${totalInput}, Total outputs: ${totalOutput}. ` +
             `Shortfall: ${totalOutput - totalInput} satoshis.`
    };
  }
  
  // Sanity check: fee should be reasonable (not more than 10% of total input for normal transactions)
  const maxReasonableFee = Math.max(totalInput * 0.1, 100000); // Max 10% or 0.001 BTC/LTC
  if (implicitFee > maxReasonableFee) {
    return { 
      valid: false, 
      error: `Implicit fee ${implicitFee} satoshis seems unusually high. ` +
             `This may indicate a calculation error. Max reasonable fee: ${maxReasonableFee} satoshis.`
    };
  }
  
  // Check fee is not negative (should be caught above, but extra safety)
  if (implicitFee < 0) {
    return { 
      valid: false, 
      error: `Transaction has negative fee (${implicitFee}). This is invalid.`
    };
  }
  
  return { valid: true };
}
