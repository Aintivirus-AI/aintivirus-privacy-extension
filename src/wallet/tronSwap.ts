/**
 * TRON Swap Service using SunSwap
 *
 * SunSwap is the primary DEX on TRON network.
 * This module provides swap functionality similar to Jupiter on Solana.
 *
 * Docs: https://sunswap.com/docs
 */

import { ChainError, ChainErrorCode } from './chains/types';
import {
  TRON_CONSTANTS,
  sunToTrx,
  trxToSun,
  getTronTxExplorerUrl,
} from './chains/tron/config';
import { signTransaction } from './chains/tron/addresses';
import { broadcastTransaction, getNowBlock } from './chains/tron/client';
import type { TronKeypair, SignedTronTransaction } from './chains/tron/types';

// ============================================================================
// Configuration
// ============================================================================

// SunSwap API endpoints
const SUNSWAP_API_BASE = 'https://rot.endjgfsv.link';
const SUNSWAP_V2_API = 'https://api.sunswap.com/api/v2';

// Native TRX address used by SunSwap
export const TRON_NATIVE_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'; // Wrapped TRX

// Request timeout
const API_TIMEOUT = 30000;

// ============================================================================
// Types
// ============================================================================

export interface TronSwapQuoteParams {
  fromToken: string; // Token address or 'trx' for native
  toToken: string;
  amount: string; // In smallest units
  slippageBps?: number; // Default 100 (1%)
}

export interface TronSwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  priceImpact: string;
  route: string[];
  exchangeRate: string;
  slippageBps: number;
  rawData?: unknown;
}

export interface TronSwapResult {
  txid: string;
  explorerUrl: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  confirmed: boolean;
  error?: string;
}

interface SunSwapPair {
  pairAddress: string;
  token0: {
    address: string;
    symbol: string;
    decimals: number;
  };
  token1: {
    address: string;
    symbol: string;
    decimals: number;
  };
  reserve0: string;
  reserve1: string;
}

// ============================================================================
// Common TRON Tokens
// ============================================================================

export const COMMON_TRON_TOKENS: Record<string, {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
}> = {
  TRX: {
    address: 'trx',
    symbol: 'TRX',
    name: 'TRON',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
  },
  USDT: {
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  },
  USDC: {
    address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
  WTRX: {
    address: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
    symbol: 'WTRX',
    name: 'Wrapped TRX',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
  },
  SUN: {
    address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
    symbol: 'SUN',
    name: 'Sun Token',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/12424/small/sun_logo.png',
  },
  BTT: {
    address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
    symbol: 'BTT',
    name: 'BitTorrent',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/22457/small/btt.png',
  },
  JST: {
    address: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9',
    symbol: 'JST',
    name: 'JUST',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/11095/small/JUST.jpg',
  },
  WIN: {
    address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    symbol: 'WIN',
    name: 'WINkLink',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/9129/small/WINkLink.png',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the wrapped TRX address if input is native TRX
 */
function normalizeTokenAddress(address: string): string {
  if (address.toLowerCase() === 'trx') {
    return COMMON_TRON_TOKENS.WTRX.address;
  }
  return address;
}

/**
 * Check if address is native TRX
 */
function isNativeTrx(address: string): boolean {
  return address.toLowerCase() === 'trx';
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Get a swap quote from SunSwap
 * 
 * Note: SunSwap's API is complex. This is a simplified implementation
 * that calculates quotes based on pool reserves.
 */
export async function getTronSwapQuote(params: TronSwapQuoteParams): Promise<TronSwapQuote> {
  const {
    fromToken,
    toToken,
    amount,
    slippageBps = 100,
  } = params;

  try {
    // Normalize addresses
    const fromTokenNormalized = normalizeTokenAddress(fromToken);
    const toTokenNormalized = normalizeTokenAddress(toToken);
    
    // For a production implementation, you would:
    // 1. Query SunSwap's pool contracts for reserves
    // 2. Calculate the optimal swap route
    // 3. Compute expected output with price impact
    
    // Simplified quote calculation (would need actual pool data)
    const fromAmount = BigInt(amount);
    
    // Placeholder calculation - in production, fetch actual rates from SunSwap
    // This assumes a 1:1 rate for demonstration
    const exchangeRate = 1.0; // Would be fetched from pool reserves
    const toAmount = BigInt(Math.floor(Number(fromAmount) * exchangeRate));
    
    // Calculate minimum received with slippage
    const slippageMultiplier = 1 - (slippageBps / 10000);
    const toAmountMin = BigInt(Math.floor(Number(toAmount) * slippageMultiplier));
    
    // Estimate price impact (would be calculated from pool reserves)
    const priceImpact = '0.1'; // Placeholder

    return {
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: toAmount.toString(),
      toAmountMin: toAmountMin.toString(),
      priceImpact,
      route: [fromTokenNormalized, toTokenNormalized],
      exchangeRate: exchangeRate.toFixed(6),
      slippageBps,
    };
  } catch (error) {
    throw new ChainError(
      ChainErrorCode.NETWORK_ERROR,
      `Failed to get swap quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'evm',
    );
  }
}

/**
 * Execute a swap on SunSwap
 * 
 * Note: This is a simplified implementation. Full implementation would:
 * 1. Build the swap transaction calling SunSwap router contract
 * 2. Handle TRX wrapping/unwrapping
 * 3. Handle token approvals
 */
export async function executeTronSwap(
  quote: TronSwapQuote,
  keypair: TronKeypair,
  testnet: boolean = false
): Promise<TronSwapResult> {
  try {
    // In a full implementation, you would:
    // 1. Check and approve token spending if needed
    // 2. Build the swap transaction
    // 3. Sign and broadcast

    // For now, throw an error indicating the swap needs full contract integration
    throw new Error(
      'TRON swap execution requires SunSwap contract integration. ' +
      'Please implement TriggerSmartContract calls to SunSwap router.'
    );
  } catch (error) {
    throw new ChainError(
      ChainErrorCode.TRANSACTION_FAILED,
      `Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'evm',
    );
  }
}

// ============================================================================
// High-Level Swap Functions
// ============================================================================

/**
 * Get a formatted swap quote for display
 */
export async function getFormattedTronSwapQuote(
  fromToken: string,
  toToken: string,
  fromAmount: string,
  fromDecimals: number,
  toDecimals: number,
  slippageBps: number = 100,
): Promise<{
  quote: TronSwapQuote;
  fromAmountFormatted: string;
  toAmountFormatted: string;
  minimumReceivedFormatted: string;
  exchangeRate: string;
  priceImpact: string;
  route: string;
}> {
  // Convert input amount to smallest units
  const fromAmountRaw = BigInt(
    Math.floor(parseFloat(fromAmount) * Math.pow(10, fromDecimals))
  ).toString();

  const quote = await getTronSwapQuote({
    fromToken,
    toToken,
    amount: fromAmountRaw,
    slippageBps,
  });

  // Format amounts for display
  const toAmountFormatted = (
    parseFloat(quote.toAmount) / Math.pow(10, toDecimals)
  ).toFixed(Math.min(toDecimals, 8));

  const minimumReceivedFormatted = (
    parseFloat(quote.toAmountMin) / Math.pow(10, toDecimals)
  ).toFixed(Math.min(toDecimals, 8));

  return {
    quote,
    fromAmountFormatted: fromAmount,
    toAmountFormatted,
    minimumReceivedFormatted,
    exchangeRate: quote.exchangeRate,
    priceImpact: `${quote.priceImpact}%`,
    route: quote.route.join(' → '),
  };
}

/**
 * Perform a complete swap with quote and execution
 */
export async function performTronSwap(
  fromToken: string,
  toToken: string,
  fromAmount: string,
  fromDecimals: number,
  keypair: TronKeypair,
  slippageBps: number = 100,
  testnet: boolean = false
): Promise<TronSwapResult> {
  // Convert input amount to smallest units
  const fromAmountRaw = BigInt(
    Math.floor(parseFloat(fromAmount) * Math.pow(10, fromDecimals))
  ).toString();

  // Get quote
  const quote = await getTronSwapQuote({
    fromToken,
    toToken,
    amount: fromAmountRaw,
    slippageBps,
  });

  // Execute swap
  return executeTronSwap(quote, keypair, testnet);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if TRON swap is available
 */
export function isTronSwapAvailable(testnet: boolean): boolean {
  // SunSwap is only available on mainnet
  return !testnet;
}

/**
 * Get common tokens for TRON
 */
export function getCommonTronTokens(): typeof COMMON_TRON_TOKENS {
  return COMMON_TRON_TOKENS;
}

/**
 * Format TRX amount for display
 */
export function formatTrxAmount(
  amount: string | bigint,
  decimals: number = 6,
  maxDecimals: number = 6
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  const formatted = num / Math.pow(10, decimals);
  const displayDecimals = Math.min(decimals, maxDecimals);
  return formatted.toFixed(displayDecimals).replace(/\.?0+$/, '');
}

/**
 * Parse user input amount to raw amount
 */
export function parseTrxInputAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new ChainError(ChainErrorCode.INVALID_AMOUNT, 'Invalid swap amount', 'evm');
  }
  return BigInt(Math.floor(num * Math.pow(10, decimals))).toString();
}
