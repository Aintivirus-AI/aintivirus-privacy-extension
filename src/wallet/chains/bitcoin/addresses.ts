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
 * Supports both single-byte and multi-byte version prefixes (e.g., Zcash uses 2 bytes)
 */
function toBase58Check(data: Uint8Array, version: number | number[]): string {
  // Convert version to bytes array
  let versionBytes: Uint8Array;
  if (typeof version === 'number') {
    // Single-byte version (Bitcoin, Litecoin, etc.)
    versionBytes = new Uint8Array([version]);
  } else {
    // Multi-byte version (Zcash uses 2 bytes: [0x1c, 0xb8] for t1, [0x1c, 0xbd] for t3)
    versionBytes = new Uint8Array(version);
  }
  
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
 * Supports both single-byte and multi-byte version prefixes (e.g., Zcash uses 2 bytes)
 */
function createP2PKHAddress(publicKey: Uint8Array, pubKeyHash: number | number[]): string {
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
 * Supports both single-byte and multi-byte version prefixes (e.g., Zcash uses 2 bytes)
 */
function createP2SHP2WPKHAddress(publicKey: Uint8Array, scriptHash: number | number[]): string {
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
  const seedBuffer = bip39.mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  // Convert Buffer to Uint8Array for HDKey
  const seed = new Uint8Array(seedBuffer);
  
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
    // Support both single-byte (Bitcoin, Litecoin) and multi-byte (Zcash) versions
    const checkVersionMatch = (version: number | number[]): boolean => {
      if (typeof version === 'number') {
        // Single-byte version
        return payload[0] === version;
      } else {
        // Multi-byte version (e.g., Zcash uses 2 bytes)
        if (payload.length < version.length) return false;
        for (let i = 0; i < version.length; i++) {
          if (payload[i] !== version[i]) return false;
        }
        return true;
      }
    };
    
    const isValidVersion = 
      checkVersionMatch(network.pubKeyHash) || 
      checkVersionMatch(network.scriptHash);
    
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

// ============================================================================
// Bitcoin Cash CashAddr Format Support
// ============================================================================

// CashAddr uses a custom Base32 encoding with this alphabet
const CASHADDR_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * Polymod for BCH checksum calculation (CashAddr uses BCH error-correcting code)
 */
function cashAddrPolymod(values: number[]): bigint {
  const GENERATORS = [
    BigInt('0x98f2bc8e61'),
    BigInt('0x79b76d99e2'),
    BigInt('0xf33e5fb3c4'),
    BigInt('0xae2eabe2a8'),
    BigInt('0x1e4f43e470'),
  ];
  
  let chk = BigInt(1);
  for (const value of values) {
    const top = chk >> BigInt(35);
    chk = ((chk & BigInt(0x07ffffffff)) << BigInt(5)) ^ BigInt(value);
    for (let i = 0; i < 5; i++) {
      if ((top >> BigInt(i)) & BigInt(1)) {
        chk ^= GENERATORS[i];
      }
    }
  }
  return chk ^ BigInt(1);
}

/**
 * Expand the human-readable prefix for checksum computation
 */
function expandPrefix(prefix: string): number[] {
  const result: number[] = [];
  for (const char of prefix) {
    result.push(char.charCodeAt(0) & 0x1f);
  }
  result.push(0); // Separator
  return result;
}

/**
 * Convert data bytes to 5-bit groups for CashAddr encoding
 */
function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad && bits > 0) {
    result.push((acc << (toBits - bits)) & maxv);
  } else if (!pad && (bits >= fromBits || ((acc << (toBits - bits)) & maxv))) {
    throw new Error('Invalid bit conversion');
  }

  return result;
}

/**
 * Convert a legacy Bitcoin/BCH address to CashAddr format
 * @param legacyAddress - The legacy address starting with '1' (P2PKH) or '3' (P2SH)
 * @param prefix - The CashAddr prefix (default: 'bitcoincash' for mainnet)
 * @returns The CashAddr formatted address (e.g., 'bitcoincash:qp...')
 */
export function legacyToCashAddr(legacyAddress: string, prefix: string = 'bitcoincash'): string {
  // Decode the legacy Base58Check address
  const decoded = fromBase58(legacyAddress);
  
  // Verify checksum
  if (decoded.length < 25) {
    throw new Error('Invalid legacy address: too short');
  }
  
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);
  
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid legacy address: checksum mismatch');
    }
  }
  
  // Extract version byte and hash
  const version = payload[0];
  const hash = payload.slice(1);
  
  if (hash.length !== 20) {
    throw new Error('Invalid legacy address: wrong hash length');
  }
  
  // Determine CashAddr version byte based on legacy version
  // Legacy P2PKH (version 0x00) -> CashAddr type 0 (P2PKH)
  // Legacy P2SH (version 0x05) -> CashAddr type 1 (P2SH)
  let cashAddrVersion: number;
  if (version === 0x00) {
    cashAddrVersion = 0x00; // P2PKH, 160 bits
  } else if (version === 0x05) {
    cashAddrVersion = 0x08; // P2SH, 160 bits
  } else {
    throw new Error(`Unsupported legacy address version: ${version}`);
  }
  
  // Create payload: version byte + hash
  const payloadBytes = new Uint8Array(21);
  payloadBytes[0] = cashAddrVersion;
  payloadBytes.set(hash, 1);
  
  // Convert to 5-bit groups
  const payloadData = convertBits(payloadBytes, 8, 5, true);
  
  // Calculate checksum
  const prefixData = expandPrefix(prefix);
  const checksumInput = [...prefixData, ...payloadData, 0, 0, 0, 0, 0, 0, 0, 0];
  const polymod = cashAddrPolymod(checksumInput);
  
  // Extract 8 5-bit checksum values from the 40-bit polymod result
  const checksumData: number[] = [];
  for (let i = 0; i < 8; i++) {
    checksumData.push(Number((polymod >> BigInt(5 * (7 - i))) & BigInt(31)));
  }
  
  // Encode to CashAddr string
  const combined = [...payloadData, ...checksumData];
  let result = prefix + ':';
  for (const value of combined) {
    result += CASHADDR_CHARSET[value];
  }
  
  return result;
}

/**
 * Decode a CashAddr address to get the hash and type
 * @param cashAddr - The CashAddr address (with or without prefix)
 * @returns Object containing the hash bytes and address type
 */
export function decodeCashAddr(cashAddr: string): { hash: Uint8Array; type: 'P2PKH' | 'P2SH'; prefix: string } {
  // Normalize to lowercase
  const addr = cashAddr.toLowerCase();
  
  // Split prefix and payload
  let prefix: string;
  let payload: string;
  
  if (addr.includes(':')) {
    const parts = addr.split(':');
    prefix = parts[0];
    payload = parts[1];
  } else {
    // Default to bitcoincash if no prefix
    prefix = 'bitcoincash';
    payload = addr;
  }
  
  // Decode the Base32 payload
  const payloadData: number[] = [];
  for (const char of payload) {
    const index = CASHADDR_CHARSET.indexOf(char);
    if (index < 0) {
      throw new Error(`Invalid CashAddr character: ${char}`);
    }
    payloadData.push(index);
  }
  
  // Verify checksum
  const prefixData = expandPrefix(prefix);
  const checksumInput = [...prefixData, ...payloadData];
  const polymod = cashAddrPolymod(checksumInput);
  
  if (polymod !== BigInt(0)) {
    throw new Error('Invalid CashAddr checksum');
  }
  
  // Remove checksum (last 8 values)
  const dataWithoutChecksum = payloadData.slice(0, -8);
  
  // Convert back to 8-bit bytes
  const bytes = new Uint8Array(convertBits(new Uint8Array(dataWithoutChecksum), 5, 8, false));
  
  // Extract version and hash
  const version = bytes[0];
  const hash = bytes.slice(1);
  
  // Determine address type
  const typeBits = version >> 3;
  const type = typeBits === 0 ? 'P2PKH' : 'P2SH';
  
  return { hash, type, prefix };
}

/**
 * Convert a CashAddr address back to legacy format
 * @param cashAddr - The CashAddr address (with or without prefix)
 * @returns The legacy address (starting with '1' for P2PKH or '3' for P2SH)
 */
export function cashAddrToLegacy(cashAddr: string): string {
  const { hash, type } = decodeCashAddr(cashAddr);
  
  // Determine legacy version byte
  const version = type === 'P2PKH' ? 0x00 : 0x05;
  
  // Encode to legacy Base58Check
  return toBase58Check(hash, version);
}

// ============================================================================
// WIF (Wallet Import Format) Support
// ============================================================================

/**
 * WIF version bytes for different networks
 * - 0x80: Bitcoin mainnet
 * - 0xef: Bitcoin testnet
 * - 0xb0: Litecoin mainnet
 */
const WIF_VERSION_BYTES: Record<number, { network: string; testnet: boolean }> = {
  0x80: { network: 'bitcoin', testnet: false },
  0xef: { network: 'bitcoin', testnet: true },
  0xb0: { network: 'litecoin', testnet: false },
};

export interface DecodedWIF {
  privateKey: Uint8Array;
  compressed: boolean;
  network: string;
  testnet: boolean;
}

/**
 * Validate if a string is a valid WIF private key
 */
export function isValidWIF(wif: string): boolean {
  try {
    decodeWIF(wif);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode a WIF (Wallet Import Format) private key
 * @param wif - The WIF encoded private key
 * @returns Decoded private key info including the raw key bytes
 * @throws Error if WIF is invalid
 */
export function decodeWIF(wif: string): DecodedWIF {
  // WIF should be 51-52 characters
  if (wif.length < 51 || wif.length > 52) {
    throw new Error('Invalid WIF length');
  }
  
  // Decode from Base58
  const decoded = fromBase58(wif);
  
  // Minimum: 1 version byte + 32 private key bytes + 4 checksum bytes = 37
  // With compression flag: 1 + 32 + 1 + 4 = 38
  if (decoded.length < 37 || decoded.length > 38) {
    throw new Error('Invalid WIF decoded length');
  }
  
  // Verify checksum
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);
  
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid WIF checksum');
    }
  }
  
  // Extract version byte
  const version = payload[0];
  const networkInfo = WIF_VERSION_BYTES[version];
  
  if (!networkInfo) {
    throw new Error(`Unknown WIF version byte: 0x${version.toString(16)}`);
  }
  
  // Check for compression flag
  let privateKey: Uint8Array;
  let compressed: boolean;
  
  if (payload.length === 34) {
    // Compressed: version (1) + key (32) + compression flag (1) = 34
    if (payload[33] !== 0x01) {
      throw new Error('Invalid compression flag');
    }
    privateKey = payload.slice(1, 33);
    compressed = true;
  } else if (payload.length === 33) {
    // Uncompressed: version (1) + key (32) = 33
    privateKey = payload.slice(1, 33);
    compressed = false;
  } else {
    throw new Error('Invalid WIF payload length');
  }
  
  // Validate private key is within valid range for secp256k1
  // Must be > 0 and < curve order (n)
  const keyBigInt = BigInt('0x' + Buffer.from(privateKey).toString('hex'));
  const curveOrder = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  
  if (keyBigInt === BigInt(0) || keyBigInt >= curveOrder) {
    throw new Error('Private key out of valid range');
  }
  
  return {
    privateKey,
    compressed,
    network: networkInfo.network,
    testnet: networkInfo.testnet,
  };
}

/**
 * Derive Bitcoin address from WIF private key
 * @param wif - WIF encoded private key
 * @param addressType - Type of address to generate (defaults to native-segwit)
 * @returns Bitcoin address and keypair info
 */
export function getBitcoinAddressFromWIF(
  wif: string,
  addressType: BitcoinAddressType = 'native-segwit'
): { address: string; publicKey: string; wif: string } {
  const decoded = decodeWIF(wif);
  
  // Derive public key from private key
  const publicKey = secp256k1.getPublicKey(decoded.privateKey, decoded.compressed);
  
  // Get network config
  const chainId: BitcoinChainId = decoded.network === 'litecoin' ? 'litecoin' : 'bitcoin';
  const config = getBitcoinChainConfig(chainId);
  const network = decoded.testnet && config.testnet ? config.testnet : config.network;
  
  // Generate address based on type
  let address: string;
  switch (addressType) {
    case 'legacy':
      address = createP2PKHAddress(publicKey, network.pubKeyHash);
      break;
    case 'segwit':
      address = createP2SHP2WPKHAddress(publicKey, network.scriptHash);
      break;
    case 'native-segwit':
      if (!network.bech32) {
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
  
  return {
    address,
    publicKey: Buffer.from(publicKey).toString('hex'),
    wif,
  };
}

/**
 * Derive address for any Bitcoin-family chain from a WIF private key
 * This allows using a BTC WIF key to derive addresses for BCH, LTC, ZEC, etc.
 * @param wif - WIF encoded private key (from any Bitcoin-family chain)
 * @param targetChainId - The chain to derive address for (bitcoin, bitcoincash, litecoin, zcash)
 * @param addressType - Type of address to generate (defaults to native-segwit)
 * @param testnet - Whether to use testnet parameters
 * @returns Address string for the target chain
 */
export function getBitcoinFamilyAddressFromWIF(
  wif: string,
  targetChainId: BitcoinChainId,
  addressType: BitcoinAddressType = 'native-segwit',
  testnet: boolean = false
): string {
  // Decode WIF to get raw private key
  const decoded = decodeWIF(wif);
  
  // Derive public key from private key (same for all Bitcoin-family chains)
  const publicKey = secp256k1.getPublicKey(decoded.privateKey, decoded.compressed);
  
  // Get target chain's network config
  const config = getBitcoinChainConfig(targetChainId);
  const network = testnet && config.testnet ? config.testnet : config.network;
  
  // Generate address based on type and target chain
  let address: string;
  
  // BCH uses CashAddr format for native-segwit equivalent
  if (targetChainId === 'bitcoincash' && (addressType === 'native-segwit' || addressType === 'segwit')) {
    // BCH doesn't have SegWit, use legacy P2PKH with CashAddr encoding
    const legacyAddress = createP2PKHAddress(publicKey, network.pubKeyHash);
    // Convert to CashAddr format
    address = legacyToCashAddr(legacyAddress, testnet ? 'bchtest' : 'bitcoincash');
    return address;
  }
  
  switch (addressType) {
    case 'legacy':
      address = createP2PKHAddress(publicKey, network.pubKeyHash);
      break;
    case 'segwit':
      if (targetChainId === 'zcash') {
        // ZEC doesn't support SegWit, use legacy
        address = createP2PKHAddress(publicKey, network.pubKeyHash);
      } else {
        address = createP2SHP2WPKHAddress(publicKey, network.scriptHash);
      }
      break;
    case 'native-segwit':
      if (!network.bech32 || targetChainId === 'zcash') {
        // Fall back to legacy for chains without bech32 support
        address = createP2PKHAddress(publicKey, network.pubKeyHash);
      } else {
        address = createP2WPKHAddress(publicKey, network.bech32);
      }
      break;
    case 'taproot':
      if (!network.bech32 || targetChainId !== 'bitcoin') {
        // Only BTC supports Taproot currently
        address = createP2PKHAddress(publicKey, network.pubKeyHash);
      } else {
        address = createP2TRAddress(publicKey, network.bech32);
      }
      break;
    default:
      address = createP2PKHAddress(publicKey, network.pubKeyHash);
  }
  
  return address;
}