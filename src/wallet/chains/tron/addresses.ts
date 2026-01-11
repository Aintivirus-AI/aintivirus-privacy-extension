/**
 * TRON Address Generation and Key Derivation
 * 
 * TRON uses secp256k1 (like Ethereum) but with a different address format.
 * Addresses are base58check encoded with a 0x41 prefix.
 */

import * as bip39 from 'bip39';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { HDKey } from '@scure/bip32';
import type { TronKeypair } from './types';
import { TRON_CONSTANTS } from './config';

// Base58 alphabet (same as Bitcoin)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Convert bytes to base58
 */
function toBase58(bytes: Uint8Array): string {
  const digits = [0];
  
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  
  // Handle leading zeros
  let result = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result += BASE58_ALPHABET[0];
  }
  
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  
  return result;
}

/**
 * Convert base58 to bytes
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
 * Compute double SHA256 hash
 */
function doubleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

/**
 * Encode bytes to Base58Check
 */
function toBase58Check(data: Uint8Array): string {
  const checksum = doubleSha256(data).slice(0, 4);
  const result = new Uint8Array(data.length + 4);
  result.set(data);
  result.set(checksum, data.length);
  return toBase58(result);
}

/**
 * Decode Base58Check to bytes
 */
function fromBase58Check(address: string): Uint8Array {
  const decoded = fromBase58(address);
  if (decoded.length < 5) {
    throw new Error('Invalid address length');
  }
  
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);
  
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid checksum');
    }
  }
  
  return payload;
}

/**
 * Convert public key to TRON address
 * TRON address = Base58Check(0x41 + Keccak256(pubKey)[12:])
 */
function publicKeyToAddress(publicKey: Uint8Array): string {
  // Ensure we have an uncompressed public key (65 bytes starting with 0x04)
  let uncompressedKey: Uint8Array;
  
  if (publicKey.length === 33) {
    // Compressed key - decompress it
    const point = secp256k1.ProjectivePoint.fromHex(publicKey);
    uncompressedKey = point.toRawBytes(false);
  } else if (publicKey.length === 65) {
    uncompressedKey = publicKey;
  } else {
    throw new Error('Invalid public key length');
  }
  
  // Remove the 0x04 prefix and hash with Keccak256
  const pubKeyNoPrefix = uncompressedKey.slice(1);
  const hash = keccak_256(pubKeyNoPrefix);
  
  // Take the last 20 bytes of the hash
  const addressBytes = hash.slice(-20);
  
  // Add the TRON prefix (0x41 for mainnet)
  const prefixedAddress = new Uint8Array(21);
  prefixedAddress[0] = TRON_CONSTANTS.ADDRESS_PREFIX;
  prefixedAddress.set(addressBytes, 1);
  
  // Encode to Base58Check
  return toBase58Check(prefixedAddress);
}

/**
 * Convert address to hex format (for API calls)
 */
export function addressToHex(address: string): string {
  const decoded = fromBase58Check(address);
  return Array.from(decoded)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex address to base58 format
 */
export function hexToAddress(hex: string): string {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  
  // Convert to bytes
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  
  return toBase58Check(bytes);
}

/**
 * Derive a TRON keypair from mnemonic
 */
export function deriveTronKeypair(
  mnemonic: string,
  accountIndex: number = 0
): TronKeypair {
  // Derive seed from mnemonic
  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
  
  // Create HD wallet from seed
  const hdKey = HDKey.fromMasterSeed(seed);
  
  // Derive using TRON's derivation path
  const path = TRON_CONSTANTS.DERIVATION_PATH.replace('{index}', accountIndex.toString());
  const derived = hdKey.derive(path);
  
  if (!derived.privateKey || !derived.publicKey) {
    throw new Error('Failed to derive keypair');
  }
  
  // Get uncompressed public key for address derivation
  const point = secp256k1.ProjectivePoint.fromPrivateKey(derived.privateKey);
  const uncompressedPubKey = point.toRawBytes(false);
  
  // Generate address
  const address = publicKeyToAddress(uncompressedPubKey);
  const hexAddress = addressToHex(address);
  
  return {
    address,
    hexAddress,
    publicKey: Buffer.from(derived.publicKey).toString('hex'),
    privateKey: derived.privateKey,
  };
}

/**
 * Get TRON address from mnemonic
 */
export function getTronAddressFromMnemonic(
  mnemonic: string,
  accountIndex: number = 0
): string {
  const keypair = deriveTronKeypair(mnemonic, accountIndex);
  return keypair.address;
}

/**
 * Validate a TRON address
 */
export function isValidTronAddress(address: string): boolean {
  try {
    // Must start with 'T'
    if (!address.startsWith('T')) {
      return false;
    }
    
    // Must be 34 characters
    if (address.length !== 34) {
      return false;
    }
    
    // Validate base58check
    const decoded = fromBase58Check(address);
    
    // First byte must be 0x41 (mainnet)
    if (decoded[0] !== TRON_CONSTANTS.ADDRESS_PREFIX) {
      return false;
    }
    
    // Should be 21 bytes total (1 prefix + 20 address)
    if (decoded.length !== 21) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign a message with TRON private key
 */
export function signMessage(message: Uint8Array, privateKey: Uint8Array): string {
  const hash = sha256(message);
  const signature = secp256k1.sign(hash, privateKey);
  
  // Convert to hex
  const r = signature.r.toString(16).padStart(64, '0');
  const s = signature.s.toString(16).padStart(64, '0');
  const v = (signature.recovery + 27).toString(16).padStart(2, '0');
  
  return r + s + v;
}

/**
 * Sign a transaction
 */
export function signTransaction(
  txRawDataHex: string,
  privateKey: Uint8Array
): string {
  // Convert hex to bytes
  const rawData = new Uint8Array(txRawDataHex.length / 2);
  for (let i = 0; i < rawData.length; i++) {
    rawData[i] = parseInt(txRawDataHex.substr(i * 2, 2), 16);
  }
  
  // Hash the raw data
  const hash = sha256(rawData);
  
  // Sign
  const signature = secp256k1.sign(hash, privateKey);
  
  // Convert to hex format expected by TRON
  const r = signature.r.toString(16).padStart(64, '0');
  const s = signature.s.toString(16).padStart(64, '0');
  const v = (signature.recovery + 27).toString(16).padStart(2, '0');
  
  return r + s + v;
}
