/**
 * Store API utilities for gift cards, eSIMs, and payment processing
 */

// API URL
const API_URL = 'https://api.v2.aintivirus.ai';

// Contract addresses (should match website configuration)
export const AINTIVIRUS_PAYMENT_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: Set from env
export const SOLANA_PAYMENT_PROGRAM_ID = ''; // TODO: Set from env
export const AINTI_TOKEN_ETH_ADDRESS = ''; // TODO: Set from env
export const AINTI_TOKEN_SOL_MINT = 'BAezfVmia8UYLt4rst6PCU4dvL2i2qHzqn4wGhytpNJW';

// Token decimals
export const AINTI_TOKEN_ETH_DECIMALS = 18;
export const AINTI_TOKEN_SOL_DECIMALS = 6;

// ============================================================================
// Types
// ============================================================================

export interface GiftCardType {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  supportedCountries: string[];
}

export interface PlanType {
  id: string;
  type: string;
  price: number;
}

export interface ESimNamesResponse {
  names: string[];
  count: number;
}

export interface PlanTypesResponse {
  planTypes: PlanType[];
  count: number;
}

export interface OrderResult {
  orderId: string;
  status: string;
  price?: number;
  paymentMethod: string;
}

export interface TokenPriceResult {
  price: number | null;
  error?: string;
}

// ============================================================================
// API Helper
// ============================================================================

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('API request failed:', err);
    throw new Error('Unable to connect to API. Please try again later.');
  }
}

// ============================================================================
// Gift Card API
// ============================================================================

/**
 * Fetch all active gift card types
 */
export async function getAllGiftCardTypes(): Promise<GiftCardType[]> {
  const data = await fetchApi<GiftCardType[] | { giftCardTypes?: GiftCardType[]; items?: GiftCardType[] }>(
    '/public-gift-card-types'
  );

  if (Array.isArray(data)) {
    return data;
  }

  if (data.giftCardTypes && Array.isArray(data.giftCardTypes)) {
    return data.giftCardTypes;
  }

  if (data.items && Array.isArray(data.items)) {
    return data.items;
  }

  return [];
}

/**
 * Get unique gift card names from all gift cards
 */
export function getUniqueGiftCardNames(giftCardTypes: GiftCardType[]): string[] {
  const uniqueNames = new Set<string>();
  giftCardTypes.forEach((card) => {
    if (card.name) {
      uniqueNames.add(card.name);
    }
  });
  return Array.from(uniqueNames).sort();
}

/**
 * Get gift card types by name
 */
export function getGiftCardTypesByName(
  giftCardTypes: GiftCardType[],
  name: string
): GiftCardType[] {
  return giftCardTypes.filter((gct) => gct.name === name);
}

/**
 * Get merged min/max amounts for a gift card name
 */
export function getMergedGiftCardData(
  giftCardTypes: GiftCardType[],
  name: string
): { id: string; name: string; minAmount: number; maxAmount: number; supportedCountries: string[] } | null {
  const types = getGiftCardTypesByName(giftCardTypes, name);
  if (types.length === 0) return null;

  const countriesSet = new Set<string>();
  types.forEach((gct) => {
    gct.supportedCountries?.forEach((country) => {
      if (country) countriesSet.add(country);
    });
  });

  return {
    id: types[0].id,
    name,
    minAmount: Math.min(...types.map((gct) => gct.minAmount || 0)),
    maxAmount: Math.max(...types.map((gct) => gct.maxAmount || 0)),
    supportedCountries: Array.from(countriesSet).sort(),
  };
}

// ============================================================================
// eSIM API
// ============================================================================

/**
 * Fetch unique eSIM names
 */
export async function getUniqueESimNames(): Promise<ESimNamesResponse> {
  return fetchApi<ESimNamesResponse>('/public-esims/names');
}

/**
 * Get plan types by eSIM name
 */
export async function getPlanTypesByName(name: string): Promise<PlanTypesResponse> {
  if (!name) {
    throw new Error('eSIM name is required');
  }

  const params = new URLSearchParams();
  params.append('name', name);

  return fetchApi<PlanTypesResponse>(`/public-esims/plan-types?${params.toString()}`);
}

// ============================================================================
// Order API
// ============================================================================

/**
 * Generate a unique order ID
 */
export function generateOrderId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a gift card order
 */
export async function createGiftCardOrder(params: {
  orderId: string;
  giftCardTypeId: string;
  amount: number;
  network: 'evm' | 'solana';
}): Promise<OrderResult> {
  return fetchApi<OrderResult>('/public-orders/gift-card', {
    method: 'POST',
    body: JSON.stringify({
      orderId: params.orderId,
      giftCardTypeId: params.giftCardTypeId,
      amount: params.amount,
      network: params.network,
    }),
  });
}

/**
 * Create an eSIM order
 */
export async function createESimOrder(params: {
  orderId: string;
  eSimPlanTypeId: string;
  network: 'evm' | 'solana';
}): Promise<OrderResult> {
  return fetchApi<OrderResult>('/public-orders/esim', {
    method: 'POST',
    body: JSON.stringify({
      orderId: params.orderId,
      eSimPlanTypeId: params.eSimPlanTypeId,
      network: params.network,
    }),
  });
}

/**
 * Confirm payment for an order
 */
export async function confirmOrderPayment(
  orderId: string,
  paymentTxHash: string
): Promise<{ orderId: string; status: string; message: string }> {
  return fetchApi(`/public-orders/${orderId}/confirm-payment`, {
    method: 'POST',
    body: JSON.stringify({ paymentTxHash }),
  });
}

/**
 * Get order details by ID
 */
export async function getOrderById(orderId: string): Promise<{
  id: string;
  status: string;
  price?: number;
  paymentMethod: string;
  paymentNetwork?: string;
  productType?: string;
}> {
  return fetchApi(`/public-orders/${orderId}`);
}

// ============================================================================
// Token Price API
// ============================================================================

/**
 * Fetch AINTI token price from backend API (matches website implementation)
 */
export async function getAintiTokenPrice(network: 'eth' | 'sol'): Promise<TokenPriceResult> {
  try {
    const response = await fetch(
      `${API_URL}/payment/token-price?network=${network}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch token price from backend');
      // Fallback to DexScreener if backend fails
      return getAintiTokenPriceFallback(network);
    }

    const data = await response.json();
    const price = data.data?.priceUsd;

    if (price === null || price === undefined) {
      return getAintiTokenPriceFallback(network);
    }

    return { price };
  } catch (err) {
    console.error('Failed to fetch token price:', err);
    // Fallback to DexScreener
    return getAintiTokenPriceFallback(network);
  }
}

/**
 * Fallback: Fetch AINTI token price from DexScreener
 */
async function getAintiTokenPriceFallback(network: 'eth' | 'sol'): Promise<TokenPriceResult> {
  try {
    const tokenAddress = network === 'eth'
      ? AINTI_TOKEN_ETH_ADDRESS || '0x...'
      : AINTI_TOKEN_SOL_MINT;

    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }

    const data = await response.json();
    const pairs = data.pairs || [];

    if (pairs.length === 0) {
      return { price: null, error: 'No trading pairs found' };
    }

    // Get the pair with highest liquidity
    const sortedPairs = pairs.sort((a: any, b: any) => 
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    );

    const price = parseFloat(sortedPairs[0].priceUsd);
    return { price: isNaN(price) ? null : price };
  } catch (err) {
    console.error('DexScreener fallback failed:', err);
    return { price: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Convert USD amount to AINTI tokens
 */
export function convertUsdToAintiTokens(
  usdAmount: number,
  tokenPriceUsd: number | null
): number {
  if (!tokenPriceUsd || tokenPriceUsd <= 0) {
    // Fallback: assume 1 AINTI = $0.10
    return Math.round(usdAmount / 0.1);
  }

  const tokenAmount = usdAmount / tokenPriceUsd;
  return Math.round(tokenAmount * 1000000) / 1000000;
}

// ============================================================================
// Mixer Note Storage
// ============================================================================

export interface MixerNote {
  id: string;
  secret: string;
  nullifier: string;
  commitment: string;
  amount: string;
  mode: 'ETH' | 'SOL' | 'TOKEN';
  sourceChain: 'evm' | 'solana';
  targetChain: 'evm' | 'solana';
  depositTxHash: string;
  createdAt: number;
  withdrawn: boolean;
  withdrawTxHash?: string;
  withdrawnAt?: number;
}

const MIXER_NOTES_KEY = 'mixerNotes';

/**
 * Save a mixer note to storage
 */
export async function saveMixerNote(note: MixerNote): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([MIXER_NOTES_KEY], (result) => {
      const notes: MixerNote[] = result[MIXER_NOTES_KEY] || [];
      notes.push(note);
      chrome.storage.local.set({ [MIXER_NOTES_KEY]: notes }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Get all mixer notes from storage
 */
export async function getMixerNotes(): Promise<MixerNote[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([MIXER_NOTES_KEY], (result) => {
      resolve(result[MIXER_NOTES_KEY] || []);
    });
  });
}

/**
 * Mark a note as withdrawn
 */
export async function markNoteWithdrawn(
  noteId: string,
  withdrawTxHash: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([MIXER_NOTES_KEY], (result) => {
      const notes: MixerNote[] = result[MIXER_NOTES_KEY] || [];
      const noteIndex = notes.findIndex((n) => n.id === noteId);
      
      if (noteIndex === -1) {
        reject(new Error('Note not found'));
        return;
      }

      notes[noteIndex] = {
        ...notes[noteIndex],
        withdrawn: true,
        withdrawTxHash,
        withdrawnAt: Date.now(),
      };

      chrome.storage.local.set({ [MIXER_NOTES_KEY]: notes }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Delete a mixer note
 */
export async function deleteMixerNote(noteId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([MIXER_NOTES_KEY], (result) => {
      const notes: MixerNote[] = result[MIXER_NOTES_KEY] || [];
      const filteredNotes = notes.filter((n) => n.id !== noteId);

      chrome.storage.local.set({ [MIXER_NOTES_KEY]: filteredNotes }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

// ============================================================================
// Payment Contract ABI (for EVM)
// ============================================================================

export const AINTIVIRUS_PAYMENT_ABI = [
  {
    inputs: [
      { internalType: 'bytes32', name: '_orderId', type: 'bytes32' },
      { internalType: 'uint256', name: '_amount', type: 'uint256' },
    ],
    name: 'processPayment',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: '_orderId', type: 'bytes32' }],
    name: 'isOrderPaid',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'AINTI_TOKEN',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
] as const;

/**
 * Convert order ID string to bytes32 for EVM contracts
 */
export function orderIdToBytes32(orderId: string): string {
  // Simple hash using TextEncoder
  const encoder = new TextEncoder();
  const data = encoder.encode(orderId);
  
  // Create a simple hash (in production, use proper keccak256)
  let hash = '';
  for (let i = 0; i < 32; i++) {
    const byte = data[i % data.length] ^ (i * 17);
    hash += byte.toString(16).padStart(2, '0');
  }
  
  return '0x' + hash;
}
