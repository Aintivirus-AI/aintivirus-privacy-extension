/**
 * Bitcoin Address Generation and Key Derivation
 * 
 * Uses BIP-32/39/44/49/84/86 standards for hierarchical deterministic wallets.
 * Note: This requires bitcoinjs-lib and related packages.
 * For now, we implement minimal address derivation with crypto primitives.
 */

import * as bip39 from 'bip39';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { secp256k1 } from '@noble/curves/secp256k1';
import { HDKey } from '@scure/bip32';
import { bech32, bech32m } from 'bech32';
import type { BitcoinChainId, BitcoinAddressType, BitcoinKeypair } from './types';
import { getBitcoinChainConfig, getBitcoinDerivationPath } from './config';

// Base58 alphabet (Bitcoin's variant)
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
 * Compute HASH160 (RIPEMD160(SHA256(data)))
 */
function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/**
 * Encode bytes to Base58Check
 */
function toBase58Check(data: Uint8Array, version: number | number[]): string {
  const versionBytes = typeof version === 'number' 
    ? new Uint8Array([version])
    : new Uint8Array(version.length === 1 ? [version[0]] : [(version[0] >> 8) & 0xff, version[0] & 0xff]);
  
  const payload = new Uint8Array(versionBytes.length + data.length);
  payload.set(versionBytes);
  payload.set(data, versionBytes.length);
  
  const checksum = doubleSha256(payload).slice(0, 4);
  const result = new Uint8Array(payload.length + 4);
  result.set(payload);
  result.set(checksum, payload.length);
  
  return toBase58(result);
}

/**
 * Create a P2PKH (Pay-to-Public-Key-Hash) address - Legacy
 */
function createP2PKHAddress(publicKey: Uint8Array, pubKeyHash: number): string {
  const pubKeyHashBytes = hash160(publicKey);
  return toBase58Check(pubKeyHashBytes, pubKeyHash);
}

/**
 * Create a P2WPKH (Pay-to-Witness-Public-Key-Hash) address - Native SegWit
 */
function createP2WPKHAddress(publicKey: Uint8Array, hrp: string): string {
  const pubKeyHashBytes = hash160(publicKey);
  const words = bech32.toWords(pubKeyHashBytes);
  return bech32.encode(hrp, [0, ...words]); // Witness version 0
}

/**
 * Create a P2SH-P2WPKH address - SegWit wrapped in P2SH
 */
function createP2SHP2WPKHAddress(publicKey: Uint8Array, scriptHash: number): string {
  const pubKeyHashBytes = hash160(publicKey);
  // Create witness script: OP_0 <20 bytes pubkey hash>
  const witnessScript = new Uint8Array(22);
  witnessScript[0] = 0x00; // OP_0
  witnessScript[1] = 0x14; // Push 20 bytes
  witnessScript.set(pubKeyHashBytes, 2);
  
  const scriptHashBytes = hash160(witnessScript);
  return toBase58Check(scriptHashBytes, scriptHash);
}

/**
 * Create a P2TR (Pay-to-Taproot) address
 */
function createP2TRAddress(publicKey: Uint8Array, hrp: string): string {
  // For Taproot, we use the x-only public key (32 bytes)
  // This is a simplified implementation
  const xOnlyPubKey = publicKey.slice(1, 33); // Remove prefix byte
  const words = bech32m.toWords(xOnlyPubKey);
  return bech32m.encode(hrp, [1, ...words]); // Witness version 1
}

/**
 * Derive a Bitcoin keypair from mnemonic
 */
export function deriveBitcoinKeypair(
  mnemonic: string,
  chainId: BitcoinChainId,
  accountIndex: number = 0,
  addressType?: BitcoinAddressType,
  testnet: boolean = false
): BitcoinKeypair {
  const config = getBitcoinChainConfig(chainId);
  const type = addressType || config.defaultAddressType;
  
  // Derive seed from mnemonic
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  
  // Create HD wallet from seed
  const hdKey = HDKey.fromMasterSeed(seed);
  
  // Get derivation path
  const path = getBitcoinDerivationPath(chainId, accountIndex, type);
  const derived = hdKey.derive(path);
  
  if (!derived.privateKey || !derived.publicKey) {
    throw new Error('Failed to derive keypair');
  }
  
  // Get network parameters
  const network = testnet && config.testnet ? config.testnet : config.network;
  
  // Get compressed public key (33 bytes)
  const publicKey = derived.publicKey;
  
  // Generate address based on type
  let address: string;
  switch (type) {
    case 'legacy':
      address = createP2PKHAddress(publicKey, network.pubKeyHash);
      break;
    case 'segwit':
      address = createP2SHP2WPKHAddress(publicKey, network.scriptHash);
      break;
    case 'native-segwit':
      if (!network.bech32) {
        // Fallback to legacy for chains without bech32 support
        address = createP2PKHAddress(publicKey, network.pubKeyHash);
      } else {
        address = createP2WPKHAddress(publicKey, network.bech32);
      }
      break;
    case 'taproot':
      if (!network.bech32) {
        throw new Error('Taproot not supported for this chain');
      }
      address = createP2TRAddress(publicKey, network.bech32);
      break;
    default:
      address = createP2PKHAddress(publicKey, network.pubKeyHash);
  }
  
  // Create WIF (Wallet Import Format) for private key
  const wifBytes = new Uint8Array(34);
  wifBytes[0] = network.wif;
  wifBytes.set(derived.privateKey, 1);
  wifBytes[33] = 0x01; // Compressed public key flag
  const wif = toBase58Check(wifBytes.slice(1), network.wif);
  
  return {
    address,
    publicKey: Buffer.from(publicKey).toString('hex'),
    privateKey: derived.privateKey,
    wif,
    addressType: type,
  };
}

/**
 * Get address from mnemonic
 */
export function getBitcoinAddressFromMnemonic(
  mnemonic: string,
  chainId: BitcoinChainId,
  accountIndex: number = 0,
  addressType?: BitcoinAddressType,
  testnet: boolean = false
): string {
  const keypair = deriveBitcoinKeypair(mnemonic, chainId, accountIndex, addressType, testnet);
  return keypair.address;
}

/**
 * Validate a Bitcoin address format
 */
export function isValidBitcoinAddress(
  address: string,
  chainId: BitcoinChainId,
  testnet: boolean = false
): boolean {
  const config = getBitcoinChainConfig(chainId);
  const network = testnet && config.testnet ? config.testnet : config.network;
  
  try {
    // Check for bech32/bech32m addresses
    if (network.bech32 && (address.startsWith(network.bech32 + '1') || address.startsWith(network.bech32.toUpperCase() + '1'))) {
      try {
        // Try bech32 first (SegWit v0)
        const decoded = bech32.decode(address.toLowerCase());
        if (decoded.prefix === network.bech32) {
          const data = bech32.fromWords(decoded.words.slice(1));
          // P2WPKH should be 20 bytes, P2WSH should be 32 bytes
          return data.length === 20 || data.length === 32;
        }
      } catch {
        // Try bech32m (Taproot)
        try {
          const decoded = bech32m.decode(address.toLowerCase());
          if (decoded.prefix === network.bech32) {
            const data = bech32m.fromWords(decoded.words.slice(1));
            return data.length === 32; // Taproot is 32 bytes
          }
        } catch {
          return false;
        }
      }
    }
    
    // Check for Base58Check addresses (legacy and P2SH)
    const decoded = fromBase58(address);
    if (decoded.length < 25) return false;
    
    // Verify checksum
    const payload = decoded.slice(0, -4);
    const checksum = decoded.slice(-4);
    const expectedChecksum = doubleSha256(payload).slice(0, 4);
    
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== expectedChecksum[i]) return false;
    }
    
    // Check version byte(s)
    const version = payload[0];
    const isValidVersion = 
      version === network.pubKeyHash || 
      version === network.scriptHash;
    
    return isValidVersion;
  } catch {
    return false;
  }
}

/**
 * Get all address types for a mnemonic on a given chain
 */
export function getAllBitcoinAddresses(
  mnemonic: string,
  chainId: BitcoinChainId,
  accountIndex: number = 0,
  testnet: boolean = false
): Record<BitcoinAddressType, string> {
  const config = getBitcoinChainConfig(chainId);
  const result: Partial<Record<BitcoinAddressType, string>> = {};
  
  for (const type of config.supportedAddressTypes) {
    try {
      result[type] = getBitcoinAddressFromMnemonic(mnemonic, chainId, accountIndex, type, testnet);
    } catch {
      // Skip unsupported address types
    }
  }
  
  return result as Record<BitcoinAddressType, string>;
}
