

import {
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
  WalletError,
  WalletErrorCode,
} from './types';


export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}


function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}


function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}


export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}


export function generateSalt(): string {
  const salt = generateRandomBytes(SALT_LENGTH);
  return arrayBufferToBase64(salt.buffer as ArrayBuffer);
}


export function generateIV(): string {
  const iv = generateRandomBytes(IV_LENGTH);
  return arrayBufferToBase64(iv.buffer as ArrayBuffer);
}


export async function deriveKeyFromPassword(
  password: string,
  saltBase64: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  
  
  const passwordBuffer = stringToArrayBuffer(password);
  const salt = base64ToArrayBuffer(saltBase64);

  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false, 
    ['deriveKey']
  );

  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256, 
    },
    false, 
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}


export async function encrypt(
  plaintext: string,
  key: CryptoKey,
  ivBase64: string
): Promise<string> {
  try {
    const iv = base64ToArrayBuffer(ivBase64);
    const plaintextBuffer = stringToArrayBuffer(plaintext);

    
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128, 
      },
      key,
      plaintextBuffer
    );

    return arrayBufferToBase64(ciphertext);
  } catch (error) {
    
    throw new WalletError(
      WalletErrorCode.ENCRYPTION_FAILED,
      'Failed to encrypt data'
    );
  }
}


export async function decrypt(
  ciphertextBase64: string,
  key: CryptoKey,
  ivBase64: string
): Promise<string> {
  try {
    const iv = base64ToArrayBuffer(ivBase64);
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);

    
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      key,
      ciphertext
    );

    return arrayBufferToString(plaintextBuffer);
  } catch (error) {
    
    
    throw new WalletError(
      WalletErrorCode.DECRYPTION_FAILED,
      'Failed to decrypt data. Wrong password or corrupted data.'
    );
  }
}


export function clearSensitiveString(sensitiveData: string): string {
  
  
  return '';
}


export function zeroOutArray(array: Uint8Array): void {
  
  array.fill(0);
}


export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  
  
  if (a.length !== b.length) {
    return false;
  }
  
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  
  return result === 0;
}


export function constantTimeEqualBase64(a: string, b: string): boolean {
  try {
    const aBytes = new Uint8Array(base64ToArrayBuffer(a));
    const bBytes = new Uint8Array(base64ToArrayBuffer(b));
    return constantTimeEqual(aBytes, bBytes);
  } catch {
    
    return false;
  }
}


const MIN_PASSWORD_LENGTH = 10;


const SPECIAL_CHARS_PATTERN = /[!@#$%^&*(),.?":{}|<>\-_+=[\]\\;'`~]/;

export function validatePasswordStrength(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }
  
  if (!/[A-Z]/.test(password)) {
    return false;
  }
  
  if (!/[a-z]/.test(password)) {
    return false;
  }
  
  if (!/\d/.test(password)) {
    return false;
  }
  
  if (!SPECIAL_CHARS_PATTERN.test(password)) {
    return false;
  }
  
  return true;
}

export function getPasswordStrengthFeedback(password: string): {
  valid: boolean;
  message: string;
  strength: 'weak' | 'fair' | 'good' | 'strong';
} {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { 
      valid: false, 
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      strength: 'weak'
    };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one uppercase letter',
      strength: 'weak'
    };
  }
  
  if (!/[a-z]/.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one lowercase letter',
      strength: 'weak'
    };
  }
  
  if (!/\d/.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one number',
      strength: 'weak'
    };
  }
  
  if (!SPECIAL_CHARS_PATTERN.test(password)) {
    return { 
      valid: false, 
      message: 'Password must contain at least one special character (!@#$%^&* etc.)',
      strength: 'weak'
    };
  }
  
  const isVeryLong = password.length >= 16;
  const hasMultipleSpecial = (password.match(SPECIAL_CHARS_PATTERN) || []).length >= 2;
  const hasMultipleNumbers = (password.match(/\d/g) || []).length >= 2;
  
  const strengthFactors = [isVeryLong, hasMultipleSpecial, hasMultipleNumbers].filter(Boolean).length;
  
  if (strengthFactors >= 2) {
    return { valid: true, message: 'Very strong password', strength: 'strong' };
  } else if (strengthFactors >= 1) {
    return { valid: true, message: 'Strong password', strength: 'good' };
  }
  
  return { valid: true, message: 'Password meets requirements', strength: 'fair' };
}

