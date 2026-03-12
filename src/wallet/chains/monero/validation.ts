/**
 * Monero Address and View Key Validation
 * 
 * Monero addresses use a custom format different from other cryptocurrencies.
 * Watch-only wallets require both an address and a view key.
 */

import { MONERO_CONSTANTS } from './config';

// Monero base58 alphabet (different from Bitcoin!)
const MONERO_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Check if a string is valid hexadecimal
 */
function isValidHex(str: string): boolean {
  return /^[0-9a-fA-F]+$/.test(str);
}

/**
 * Check if all characters in a string are valid Monero base58 characters
 */
function isValidBase58(input: string): boolean {
  for (const char of input) {
    if (!MONERO_BASE58_ALPHABET.includes(char)) {
      return false;
    }
  }
  return true;
}

/**
 * Validate a Monero standard address
 * 
 * Monero addresses are 95 characters long and start with:
 * - '4' for mainnet standard addresses
 * - '8' for mainnet integrated addresses  
 * - '9' or 'A' for stagenet/testnet
 * 
 * Note: Monero uses a special chunked base58 encoding. We validate format
 * without full checksum verification for performance reasons.
 */
export function isValidMoneroAddress(address: string, testnet: boolean = false): boolean {
  // Basic validation
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Check length - standard (95) or integrated (106)
  const validLengths = [95, 106];
  if (!validLengths.includes(address.length)) {
    return false;
  }

  // Check prefix
  const firstChar = address[0];
  if (testnet) {
    // Testnet/stagenet addresses start with '9' or 'A'
    if (firstChar !== '9' && firstChar !== 'A') {
      return false;
    }
  } else {
    // Mainnet addresses start with '4' (standard) or '8' (integrated)
    if (firstChar !== '4' && firstChar !== '8') {
      return false;
    }
  }

  // Check all characters are valid base58
  if (!isValidBase58(address)) {
    return false;
  }

  return true;
}

/**
 * Validate a Monero view key
 * 
 * View keys are 64 character hexadecimal strings (32 bytes)
 */
export function isValidViewKey(viewKey: string): boolean {
  if (!viewKey) return false;
  
  // Must be exactly 64 hex characters
  if (viewKey.length !== MONERO_CONSTANTS.VIEW_KEY_LENGTH) {
    return false;
  }

  // Must be valid hexadecimal
  if (!isValidHex(viewKey)) {
    return false;
  }

  // Additional validation: should not be all zeros
  if (/^0+$/.test(viewKey)) {
    return false;
  }

  return true;
}

/**
 * Validate a complete watch-only configuration
 */
export function validateWatchOnlyConfig(
  address: string,
  viewKey: string,
  testnet: boolean = false
): { valid: boolean; error?: string } {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }

  if (!viewKey) {
    return { valid: false, error: 'View key is required' };
  }

  if (!isValidMoneroAddress(address, testnet)) {
    return { valid: false, error: 'Invalid Monero address format' };
  }

  if (!isValidViewKey(viewKey)) {
    return { valid: false, error: 'Invalid view key format (must be 64 hex characters)' };
  }

  return { valid: true };
}

/**
 * Get address type description
 */
export function getAddressType(address: string): string {
  if (!address) return 'Unknown';
  
  const firstChar = address[0];
  const length = address.length;
  
  if (firstChar === '4') {
    return length === 95 ? 'Standard' : length === 106 ? 'Integrated' : 'Unknown';
  }
  
  if (firstChar === '8') {
    return 'Integrated';
  }
  
  if (firstChar === '9' || firstChar === 'A') {
    return 'Testnet/Stagenet';
  }
  
  return 'Unknown';
}

/**
 * Mask an address for display (show first and last parts)
 */
export function maskAddress(address: string): string {
  if (!address || address.length < 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-10)}`;
}

/**
 * Mask a view key for display
 */
export function maskViewKey(viewKey: string): string {
  if (!viewKey || viewKey.length < 16) return '****';
  return `${viewKey.slice(0, 8)}...${viewKey.slice(-8)}`;
}
