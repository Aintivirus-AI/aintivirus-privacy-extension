/**
 * Solana Payment Utilities
 * 
 * Handles reading payment configuration from the on-chain Solana payment program.
 * This mirrors the website's implementation in lib/contracts/aintivirus-payment-solana.ts
 */

// Configuration
const API_URL = 'https://api.v2.aintivirus.ai';
const SOLANA_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
const AINTI_TOKEN_MINT = 'BAezfVmia8UYLt4rst6PCU4dvL2i2qHzqn4wGhytpNJW';
const AINTI_TOKEN_DECIMALS = 6;

// Payment Program ID - this should match the website's NEXT_PUBLIC_SOLANA_PAYMENT_PROGRAM_ID
// This is the deployed Anchor program that handles payments
const SOLANA_PAYMENT_PROGRAM_ID = process.env.SOLANA_PAYMENT_PROGRAM_ID || '';

// Fallback merchant address from environment (matches website's NEXT_PUBLIC_MERCHANT_SOL_ADDRESS)
// TODO: Replace with actual treasury address from website deployment
const MERCHANT_SOL_ADDRESS = process.env.MERCHANT_SOL_ADDRESS || 
  ''; // <-- Add your NEXT_PUBLIC_MERCHANT_SOL_ADDRESS here

// Cache for treasury address to avoid repeated RPC/API calls
let cachedTreasuryAddress: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Base58 alphabet for encoding/decoding
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encode bytes to base58 string
 */
function encodeBase58(bytes: Uint8Array): string {
  const digits = [0];
  
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  
  // Add leading zeros
  let result = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result += BASE58_ALPHABET[0];
  }
  
  // Add the rest
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  
  return result;
}

/**
 * Decode base58 string to bytes
 */
function decodeBase58(str: string): Uint8Array {
  const bytes: number[] = [];
  
  for (let i = 0; i < str.length; i++) {
    const value = BASE58_ALPHABET.indexOf(str[i]);
    if (value === -1) {
      throw new Error(`Invalid base58 character: ${str[i]}`);
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
  
  // Add leading zeros
  for (let i = 0; i < str.length && str[i] === BASE58_ALPHABET[0]; i++) {
    bytes.push(0);
  }
  
  return new Uint8Array(bytes.reverse());
}

/**
 * Derive Payment Vault PDA (Program Derived Address)
 * Uses the same seeds as the website: ['payment_vault']
 */
async function derivePaymentVaultPDA(programId: string): Promise<string> {
  // We need to compute a PDA which requires the ed25519 curve
  // Since we can't use @solana/web3.js directly in popup, we'll use a simplified approach
  // The PDA is derived from: sha256(seeds + programId + "ProgramDerivedAddress")
  
  const programIdBytes = decodeBase58(programId);
  const seeds = new TextEncoder().encode('payment_vault');
  
  // Combine: seeds + programId + bump (try bumps from 255 down to 0)
  // For simplicity, we'll call an RPC method to get program accounts
  // or use a known PDA if available
  
  // Since PDA derivation is complex without the full web3.js library,
  // we'll use getMultipleAccounts or getProgramAccounts RPC call
  // to find the vault account
  
  throw new Error('PDA derivation requires @solana/web3.js - using alternative method');
}

/**
 * Find payment vault account using getProgramAccounts RPC
 * This is a workaround since we can't easily derive PDAs without web3.js
 */
async function findPaymentVaultAccount(programId: string): Promise<{
  pubkey: string;
  data: Uint8Array;
} | null> {
  try {
    const response = await fetch(SOLANA_RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccounts',
        params: [
          programId,
          {
            encoding: 'base64',
            filters: [
              {
                // PaymentVault account size (approximate)
                // authority(32) + treasury_wallet(32) + ainti_token_mint(32) + 
                // total_volume(8) + payment_count(8) + is_paused(1) + bump(1) = 114 bytes
                // Plus 8 bytes for discriminator = 122 bytes
                dataSize: 122,
              },
            ],
          },
        ],
      }),
    });

    const result = await response.json();
    
    if (result.error) {
      console.error('RPC error:', result.error);
      return null;
    }

    if (!result.result || result.result.length === 0) {
      return null;
    }

    // Get the first vault account (there should only be one)
    const account = result.result[0];
    const dataBase64 = account.account.data[0];
    const dataBytes = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
    
    return {
      pubkey: account.pubkey,
      data: dataBytes,
    };
  } catch (err) {
    console.error('Failed to find payment vault:', err);
    return null;
  }
}

/**
 * Extract treasury wallet address from vault account data
 * 
 * Vault structure (from IDL):
 * - 8 bytes: Anchor discriminator
 * - 32 bytes: authority (PublicKey)
 * - 32 bytes: treasury_wallet (PublicKey)  <-- We want this
 * - 32 bytes: ainti_token_mint (PublicKey)
 * - 8 bytes: total_volume (u64)
 * - 8 bytes: payment_count (u64)
 * - 1 byte: is_paused (bool)
 * - 1 byte: bump (u8)
 */
function extractTreasuryFromVaultData(data: Uint8Array): string | null {
  if (data.length < 72) { // Need at least discriminator(8) + authority(32) + treasury(32)
    console.error('Vault data too short:', data.length);
    return null;
  }
  
  // Skip 8-byte discriminator and 32-byte authority
  // Treasury wallet starts at byte 40 and is 32 bytes
  const treasuryBytes = data.slice(40, 72);
  
  // Convert to base58 address
  return encodeBase58(treasuryBytes);
}

/**
 * Try to fetch treasury address from backend API
 * This is a simpler alternative to on-chain lookup
 */
async function fetchTreasuryFromApi(): Promise<string | null> {
  try {
    // Try to get payment config from API
    const response = await fetch(`${API_URL}/payment/config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      // Try different possible response formats
      const address = data.treasuryAddress || 
                      data.merchantAddress || 
                      data.solana?.treasuryAddress ||
                      data.solana?.merchantAddress;
      if (address) {
        console.log('Treasury address loaded from API:', address);
        return address;
      }
    }
  } catch (err) {
    // API endpoint might not exist, that's okay
    console.log('Payment config API not available, trying other methods');
  }
  return null;
}

/**
 * Get the treasury wallet address
 * Tries multiple methods in order:
 * 1. Cached value
 * 2. Environment variable (MERCHANT_SOL_ADDRESS)
 * 3. API endpoint
 * 4. On-chain payment vault (if program ID is configured)
 */
export async function getTreasuryAddress(): Promise<string | null> {
  // Check cache
  if (cachedTreasuryAddress && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedTreasuryAddress;
  }
  
  // Method 1: Check environment variable
  if (MERCHANT_SOL_ADDRESS) {
    console.log('Using treasury address from environment:', MERCHANT_SOL_ADDRESS);
    cachedTreasuryAddress = MERCHANT_SOL_ADDRESS;
    cacheTimestamp = Date.now();
    return MERCHANT_SOL_ADDRESS;
  }
  
  // Method 2: Try API
  const apiTreasury = await fetchTreasuryFromApi();
  if (apiTreasury) {
    cachedTreasuryAddress = apiTreasury;
    cacheTimestamp = Date.now();
    return apiTreasury;
  }
  
  // Method 3: Try on-chain lookup (if program ID is configured)
  if (SOLANA_PAYMENT_PROGRAM_ID) {
    try {
      const vault = await findPaymentVaultAccount(SOLANA_PAYMENT_PROGRAM_ID);
      
      if (vault) {
        const treasury = extractTreasuryFromVaultData(vault.data);
        
        if (treasury) {
          cachedTreasuryAddress = treasury;
          cacheTimestamp = Date.now();
          console.log('Treasury address loaded from chain:', treasury);
          return treasury;
        }
      }
    } catch (err) {
      console.error('Failed to get treasury from chain:', err);
    }
  } else {
    console.warn('SOLANA_PAYMENT_PROGRAM_ID not configured, cannot read treasury from chain');
  }
  
  console.warn('Treasury address not available. Please configure MERCHANT_SOL_ADDRESS or SOLANA_PAYMENT_PROGRAM_ID');
  return null;
}

/**
 * Get treasury token account (Associated Token Account for treasury + AINTI mint)
 */
export async function getTreasuryTokenAccount(treasuryAddress: string): Promise<string | null> {
  try {
    // Derive the Associated Token Account
    // ATA = PDA([wallet, TOKEN_PROGRAM_ID, mint], ATA_PROGRAM_ID)
    // For simplicity, we'll fetch it from the chain
    
    const response = await fetch(SOLANA_RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          treasuryAddress,
          { mint: AINTI_TOKEN_MINT },
          { encoding: 'jsonParsed' },
        ],
      }),
    });

    const result = await response.json();
    
    if (result.error || !result.result?.value?.length) {
      console.warn('Treasury token account not found');
      return null;
    }
    
    return result.result.value[0].pubkey;
  } catch (err) {
    console.error('Failed to get treasury token account:', err);
    return null;
  }
}

/**
 * Clear the treasury cache (useful for testing or forced refresh)
 */
export function clearTreasuryCache(): void {
  cachedTreasuryAddress = null;
  cacheTimestamp = 0;
}

/**
 * Get AINTI token configuration
 */
export function getAintiTokenConfig() {
  return {
    mint: AINTI_TOKEN_MINT,
    decimals: AINTI_TOKEN_DECIMALS,
  };
}

/**
 * Get Solana RPC endpoint
 */
export function getSolanaRpcEndpoint(): string {
  return SOLANA_RPC_ENDPOINT;
}

/**
 * Check if the payment program is configured
 */
export function isPaymentProgramConfigured(): boolean {
  return !!SOLANA_PAYMENT_PROGRAM_ID;
}

/**
 * Check if any payment configuration is available
 */
export function isPaymentConfigured(): boolean {
  return !!SOLANA_PAYMENT_PROGRAM_ID || !!MERCHANT_SOL_ADDRESS;
}

/**
 * Get the payment program ID
 */
export function getPaymentProgramId(): string | null {
  return SOLANA_PAYMENT_PROGRAM_ID || null;
}

/**
 * Get the merchant address from environment
 */
export function getMerchantAddress(): string | null {
  return MERCHANT_SOL_ADDRESS || null;
}
