/**
 * Bitcoin Transaction Construction and Signing
 * 
 * Handles UTXO selection, transaction building, and signing.
 */

import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { 
  BitcoinChainId, 
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

/**
 * Estimate transaction size in virtual bytes
 */
function estimateTxSize(
  inputCount: number,
  outputCount: number,
  isSegwit: boolean = true
): number {
  if (isSegwit) {
    // SegWit transaction size estimation
    // Base size: 10 (version + locktime + marker + flag)
    // Input: ~68 vbytes (outpoint + sequence + witness)
    // Output: ~31 vbytes (value + script)
    const baseSize = 10;
    const inputSize = 68;
    const outputSize = 31;
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
 * Select UTXOs for a transaction using largest-first algorithm
 */
export function selectUtxos(
  utxos: UTXO[],
  targetAmount: number,
  feeRate: number,
  dustThreshold: number
): { selectedUtxos: UTXO[]; fee: number; change: number } | null {
  // Sort UTXOs by value (largest first)
  const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value);
  
  const selectedUtxos: UTXO[] = [];
  let totalInput = 0;
  
  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo);
    totalInput += utxo.value;
    
    // Estimate fee with current selection
    const hasChange = true; // Assume we'll have change
    const outputCount = hasChange ? 2 : 1;
    const estimatedSize = estimateTxSize(selectedUtxos.length, outputCount);
    const fee = Math.ceil(estimatedSize * feeRate);
    
    const totalNeeded = targetAmount + fee;
    
    if (totalInput >= totalNeeded) {
      const change = totalInput - totalNeeded;
      
      // If change is dust, add it to the fee
      if (change > 0 && change < dustThreshold) {
        return {
          selectedUtxos,
          fee: fee + change,
          change: 0,
        };
      }
      
      return {
        selectedUtxos,
        fee,
        change,
      };
    }
  }
  
  // Not enough funds
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
  
  // Get UTXOs for the address
  const utxos = await getUtxos(chainId, fromAddress, testnet);
  
  if (utxos.length === 0) {
    throw new Error('No UTXOs available');
  }
  
  // Get fee estimate
  const feeEstimate = await getFeeEstimate(chainId, testnet);
  
  // Select UTXOs
  const selection = selectUtxos(utxos, amount, feeEstimate.feeRate, config.dustThreshold);
  
  if (!selection) {
    throw new Error('Insufficient funds');
  }
  
  // Build transaction inputs
  const inputs = selection.selectedUtxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    script: utxo.script,
    sequence: 0xffffffff,
  }));
  
  // Build transaction outputs
  const outputs: Array<{ address: string; value: number }> = [
    { address: toAddress, value: amount },
  ];
  
  // Add change output if needed
  if (selection.change > 0) {
    outputs.push({ address: fromAddress, value: selection.change });
  }
  
  return {
    tx: {
      inputs,
      outputs,
      changeAddress: selection.change > 0 ? fromAddress : undefined,
      feeRate: feeEstimate.feeRate,
    },
    fee: selection.fee,
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
 * Sign a transaction (simplified legacy P2PKH signing)
 * 
 * Note: This is a simplified implementation. For production use,
 * consider using bitcoinjs-lib for proper transaction signing.
 */
export function signTransaction(
  tx: UnsignedBitcoinTransaction,
  keypair: BitcoinKeypair,
  chainId: BitcoinChainId
): SignedBitcoinTransaction {
  // This is a placeholder for the actual signing implementation
  // Full Bitcoin transaction signing is complex and would require:
  // 1. Building the raw transaction
  // 2. Creating signature hashes for each input
  // 3. Signing with the private key
  // 4. Adding signatures and public keys to inputs
  
  // For now, we'll throw an error indicating this needs the full bitcoinjs-lib
  throw new Error(
    'Full Bitcoin transaction signing requires bitcoinjs-lib. ' +
    'Install the package and implement proper signing for production use.'
  );
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
  
  // Get UTXOs to estimate input count
  const utxos = await getUtxos(chainId, fromAddress, testnet);
  
  // Get current fee rate
  const baseFeeEstimate = await getFeeEstimate(chainId, testnet);
  
  // Select UTXOs to estimate actual transaction size
  const selection = selectUtxos(utxos, amount, baseFeeEstimate.feeRate, config.dustThreshold);
  
  if (!selection) {
    return {
      ...baseFeeEstimate,
      totalFee: 0,
    };
  }
  
  return {
    ...baseFeeEstimate,
    totalFee: selection.fee,
  };
}

/**
 * Validate a transaction before signing
 */
export function validateTransaction(
  tx: UnsignedBitcoinTransaction,
  chainId: BitcoinChainId
): { valid: boolean; error?: string } {
  const config = getBitcoinChainConfig(chainId);
  
  // Check inputs
  if (tx.inputs.length === 0) {
    return { valid: false, error: 'No inputs provided' };
  }
  
  // Check outputs
  if (tx.outputs.length === 0) {
    return { valid: false, error: 'No outputs provided' };
  }
  
  // Check for dust outputs
  for (const output of tx.outputs) {
    if (output.value < config.dustThreshold) {
      return { valid: false, error: `Output value ${output.value} is below dust threshold` };
    }
  }
  
  // Calculate totals
  const totalInput = tx.inputs.reduce((sum, input) => sum + input.value, 0);
  const totalOutput = tx.outputs.reduce((sum, output) => sum + output.value, 0);
  
  // Check that inputs cover outputs (fee is the difference)
  if (totalInput < totalOutput) {
    return { valid: false, error: 'Insufficient input value for outputs' };
  }
  
  return { valid: true };
}
