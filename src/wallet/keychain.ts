

import { Keypair, PublicKey } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { HDNodeWallet, Mnemonic, Wallet, getBytes, hexlify } from 'ethers';
import {
  SOLANA_DERIVATION_PATH,
  MNEMONIC_WORD_COUNT,
  WalletError,
  WalletErrorCode,
  EVMDerivationPathType,
  SolanaDerivationPathType,
} from './types';
import { DERIVATION_PATHS } from './chains/config';


export interface EVMKeypair {
  
  address: string;
  
  privateKey: string;
  
  privateKeyBytes: Uint8Array;
}


export function generateMnemonic(): string {
  
  
  const mnemonic = bip39.generateMnemonic(256);
  
  
  const wordCount = mnemonic.split(' ').length;
  if (wordCount !== MNEMONIC_WORD_COUNT) {
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      `Unexpected mnemonic word count: ${wordCount}`
    );
  }
  
  return mnemonic;
}


export function validateMnemonic(mnemonic: string): boolean {
  
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  
  
  return bip39.validateMnemonic(normalized);
}


export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
}


export function deriveKeypair(mnemonic: string): Keypair {
  
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  
  
  if (!validateMnemonic(normalizedMnemonic)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase'
    );
  }
  
  try {
    
    
    const seed = bip39.mnemonicToSeedSync(normalizedMnemonic, '');
    
    
    const derivedSeed = derivePath(SOLANA_DERIVATION_PATH, seed.toString('hex'));
    
    
    const keypair = Keypair.fromSeed(derivedSeed.key);
    
    return keypair;
  } catch (error) {
    
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to derive keypair from mnemonic'
    );
  }
}


export function getPublicKeyFromMnemonic(mnemonic: string): string {
  const keypair = deriveKeypair(mnemonic);
  const publicKey = keypair.publicKey.toBase58();
  
  
  return publicKey;
}


export function deriveSolanaKeypair(
  mnemonic: string,
  accountIndex: number,
  pathType: SolanaDerivationPathType = 'standard'
): Keypair {
  
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  
  
  if (!validateMnemonic(normalizedMnemonic)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase'
    );
  }
  
  
  if (pathType === 'legacy' && accountIndex !== 0) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Legacy derivation path only supports account index 0'
    );
  }
  
  try {
    
    const seed = bip39.mnemonicToSeedSync(normalizedMnemonic, '');
    
    
    const derivationPath = DERIVATION_PATHS.getSolanaPath(accountIndex, pathType);
    
    
    const derivedSeed = derivePath(derivationPath, seed.toString('hex'));
    
    
    const keypair = Keypair.fromSeed(derivedSeed.key);
    
    return keypair;
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to derive Solana keypair from mnemonic'
    );
  }
}


export function getSolanaAddressFromMnemonic(
  mnemonic: string,
  accountIndex: number,
  pathType: SolanaDerivationPathType = 'standard'
): string {
  const keypair = deriveSolanaKeypair(mnemonic, accountIndex, pathType);
  return keypair.publicKey.toBase58();
}


export function keypairToSecretKey(keypair: Keypair): Uint8Array {
  
  return keypair.secretKey;
}


export function secretKeyToKeypair(secretKey: Uint8Array): Keypair {
  return Keypair.fromSecretKey(secretKey);
}


export function getPublicKeyBase58(keypair: Keypair): string {
  return keypair.publicKey.toBase58();
}


export function isValidSolanaAddress(address: string): boolean {
  try {
    
    if (address.length < 32 || address.length > 44) {
      return false;
    }
    
    
    new PublicKey(address);
    
    return true;
  } catch {
    return false;
  }
}


export function getMnemonicWordCount(mnemonic: string): number {
  const normalized = normalizeMnemonic(mnemonic);
  if (!normalized) return 0;
  return normalized.split(' ').length;
}


export function hasValidMnemonicWordCount(mnemonic: string): boolean {
  const wordCount = getMnemonicWordCount(mnemonic);
  
  return wordCount === 12 || wordCount === 24;
}


export function deriveEVMKeypair(mnemonic: string, index: number = 0): EVMKeypair {
  return deriveEVMKeypairWithPath(mnemonic, index, 'standard');
}


export function deriveEVMKeypairWithPath(
  mnemonic: string,
  accountIndex: number,
  pathType: EVMDerivationPathType = 'standard'
): EVMKeypair {
  
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  
  
  if (!validateMnemonic(normalizedMnemonic)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid mnemonic phrase'
    );
  }
  
  try {
    
    const mnemonicObj = Mnemonic.fromPhrase(normalizedMnemonic);
    
    
    const path = DERIVATION_PATHS.getEVMPath(accountIndex, pathType);
    const hdNode = HDNodeWallet.fromMnemonic(mnemonicObj, path);
    
    
    const address = hdNode.address; 
    const privateKey = hdNode.privateKey; 
    const privateKeyBytes = getBytes(privateKey);
    
    return {
      address,
      privateKey,
      privateKeyBytes,
    };
  } catch (error) {
    
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to derive EVM keypair from mnemonic'
    );
  }
}


export function getEVMAddressFromMnemonic(
  mnemonic: string,
  index: number = 0,
  pathType: EVMDerivationPathType = 'standard'
): string {
  const keypair = deriveEVMKeypairWithPath(mnemonic, index, pathType);
  const address = keypair.address;
  
  
  return address;
}


export function evmKeypairToWallet(keypair: EVMKeypair): Wallet {
  return new Wallet(keypair.privateKey);
}


export function isValidEVMAddress(address: string): boolean {
  
  if (!address.startsWith('0x')) {
    return false;
  }
  
  
  if (address.length !== 42) {
    return false;
  }
  
  
  const hexPart = address.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
    return false;
  }
  
  return true;
}


export function isValidAddressForChain(
  address: string,
  chainType: 'solana' | 'evm'
): boolean {
  if (chainType === 'solana') {
    return isValidSolanaAddress(address);
  }
  return isValidEVMAddress(address);
}


export function getAllAddressesFromMnemonic(
  mnemonic: string,
  accountIndex: number = 0
): { solanaAddress: string; evmAddress: string } {
  return {
    solanaAddress: getSolanaAddressFromMnemonic(mnemonic, accountIndex),
    evmAddress: getEVMAddressFromMnemonic(mnemonic, accountIndex),
  };
}


export function deriveAddressesForIndex(
  mnemonic: string,
  accountIndex: number,
  evmPathType: EVMDerivationPathType = 'standard',
  solanaPathType: SolanaDerivationPathType = 'standard'
): { solanaAddress: string; evmAddress: string } {
  return {
    solanaAddress: getSolanaAddressFromMnemonic(mnemonic, accountIndex, solanaPathType),
    evmAddress: getEVMAddressFromMnemonic(mnemonic, accountIndex, evmPathType),
  };
}


export function deriveKeypairsForIndex(
  mnemonic: string,
  accountIndex: number,
  evmPathType: EVMDerivationPathType = 'standard',
  solanaPathType: SolanaDerivationPathType = 'standard'
): { solanaKeypair: Keypair; evmKeypair: EVMKeypair } {
  return {
    solanaKeypair: deriveSolanaKeypair(mnemonic, accountIndex, solanaPathType),
    evmKeypair: deriveEVMKeypairWithPath(mnemonic, accountIndex, evmPathType),
  };
}


import bs58 from 'bs58';


export function keypairFromPrivateKey(privateKey: string): Keypair {
  const trimmed = privateKey.trim();
  
  try {
    let secretKey: Uint8Array;
    
    
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      
      const bytes = JSON.parse(trimmed) as number[];
      secretKey = new Uint8Array(bytes);
    } else if (trimmed.startsWith('0x')) {
      
      const hex = trimmed.slice(2);
      secretKey = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else if (/^[0-9a-fA-F]+$/.test(trimmed) && (trimmed.length === 64 || trimmed.length === 128)) {
      
      secretKey = new Uint8Array(trimmed.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else {
      
      secretKey = bs58.decode(trimmed);
    }
    
    
    if (secretKey.length === 32) {
      
      return Keypair.fromSeed(secretKey);
    } else if (secretKey.length === 64) {
      
      return Keypair.fromSecretKey(secretKey);
    } else {
      throw new WalletError(
        WalletErrorCode.INVALID_MNEMONIC, 
        `Invalid private key length: ${secretKey.length} bytes. Expected 32 or 64 bytes.`
      );
    }
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid private key format. Accepted formats: Base58, Hex (with/without 0x), or JSON array.'
    );
  }
}


export function evmKeypairFromPrivateKey(privateKey: string): EVMKeypair {
  let normalizedKey = privateKey.trim();
  
  
  if (!normalizedKey.startsWith('0x')) {
    normalizedKey = '0x' + normalizedKey;
  }
  
  
  if (normalizedKey.length !== 66) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      `Invalid EVM private key length. Expected 64 hex characters (32 bytes).`
    );
  }
  
  if (!/^0x[0-9a-fA-F]+$/.test(normalizedKey)) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Invalid EVM private key format. Must be a hex string.'
    );
  }
  
  try {
    const wallet = new Wallet(normalizedKey);
    const privateKeyBytes = getBytes(normalizedKey);
    
    return {
      address: wallet.address,
      privateKey: normalizedKey,
      privateKeyBytes,
    };
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Failed to create wallet from private key. Please check the key is valid.'
    );
  }
}


export function getSolanaPrivateKeyBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}


export function getEVMPrivateKeyHex(keypair: EVMKeypair): string {
  return keypair.privateKey;
}


export function validatePrivateKey(privateKey: string): {
  valid: boolean;
  chainType: 'solana' | 'evm' | 'unknown';
  error?: string;
} {
  const trimmed = privateKey.trim();
  
  
  if (trimmed.startsWith('0x') || (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 64)) {
    try {
      evmKeypairFromPrivateKey(trimmed);
      return { valid: true, chainType: 'evm' };
    } catch (e) {
      
    }
  }
  
  
  try {
    keypairFromPrivateKey(trimmed);
    return { valid: true, chainType: 'solana' };
  } catch (e) {
    
    if (trimmed.startsWith('0x')) {
      return {
        valid: false,
        chainType: 'evm',
        error: 'Invalid EVM private key format',
      };
    }
    return {
      valid: false,
      chainType: 'unknown',
      error: 'Invalid private key format',
    };
  }
}

