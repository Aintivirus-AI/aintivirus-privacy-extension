/**
 * Jupiter Swap Service with Referral Program Support
 * 
 * This module integrates with Jupiter's swap API to provide token swaps
 * with referral fee support. For more information, see:
 * https://dev.jup.ag/tool-kits/referral-program
 */

import {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import {
  WalletError,
  WalletErrorCode,
  SolanaNetwork,
} from './types';
import { getUnlockedKeypair, getWalletSettings } from './storage';
import { executeWithFailover, getConnection } from './solanaClient';
import { confirmTransaction } from './transactions';
import { getTransactionExplorerUrl } from './rpc';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Jupiter Referral Program Configuration
 * 
 * To earn referral fees:
 * 1. Create a referral account at https://referral.jup.ag
 * 2. Replace REFERRAL_ACCOUNT with your referral account public key
 * 3. Initialize token accounts for tokens you want to receive fees in
 */
export const JUPITER_REFERRAL_CONFIG = {
  // Your referral account public key from https://referral.jup.ag
  REFERRAL_ACCOUNT: 'ckrKLAG2CBwcwy25GH17bCMZ43wjcUbmbJ36fRQdvRx',
  
  // Fee in basis points (100 = 1%, 50 = 0.5%, 20 = 0.2%)
  // Jupiter allows up to 100 bps (1%) for referral fees
  FEE_BPS: 50, // 0.5% referral fee
  
  // Whether referral fees are enabled
  ENABLED: true,
};

// Jupiter API endpoints (v1 with API key required)
const JUPITER_API_BASE = 'https://api.jup.ag/swap/v1';
const JUPITER_QUOTE_ENDPOINT = `${JUPITER_API_BASE}/quote`;
const JUPITER_SWAP_ENDPOINT = `${JUPITER_API_BASE}/swap`;
const JUPITER_SWAP_INSTRUCTIONS_ENDPOINT = `${JUPITER_API_BASE}/swap-instructions`;

// Jupiter API Key - Free tier from https://station.jup.ag/
const JUPITER_API_KEY = '4123d8f3-ab20-4ffe-a8f0-e6695a50d1a2';

// Common token mints for Solana
export const COMMON_TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112', // Wrapped SOL
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

// Request timeout
const API_TIMEOUT = 30000;

// ============================================================================
// Types
// ============================================================================

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string; // In smallest units (lamports for SOL)
  slippageBps?: number; // Default 50 (0.5%)
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
  maxAccounts?: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: {
    amount: string;
    feeBps: number;
  } | null;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label?: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapParams {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  feeAccount?: string; // Referral token account
  trackingAccount?: string;
  computeUnitPriceMicroLamports?: number | 'auto';
  prioritizationFeeLamports?: number | 'auto';
  asLegacyTransaction?: boolean;
  useTokenLedger?: boolean;
  destinationTokenAccount?: string;
  dynamicComputeUnitLimit?: boolean;
  skipUserAccountsRpcCalls?: boolean;
}

export interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  prioritizationType?: {
    computeBudget?: {
      microLamports: number;
      estimatedMicroLamports: number;
    };
  };
  dynamicSlippageReport?: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
  };
  simulationError?: string;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  outputAmountFormatted: string;
  priceImpactPct: string;
  minimumReceived: string;
  platformFee: string | null;
  route: string[];
  rawQuote: JupiterQuoteResponse;
}

export interface SwapResult {
  signature: string;
  explorerUrl: string;
  inputAmount: string;
  outputAmount: string;
  inputMint: string;
  outputMint: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    // Build fetch options with headers including API key if available
    const defaultHeaders: HeadersInit = {
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // Add Jupiter API key if available
    if (JUPITER_API_KEY) {
      (defaultHeaders as Record<string, string>)['x-api-key'] = JUPITER_API_KEY;
    }

    const fetchOptions: RequestInit = {
      signal: controller.signal,
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };
    
    // Add Content-Type for POST requests
    if (options.method === 'POST' && options.body) {
      (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(url, fetchOptions);
    return response;
  } catch (error) {
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Derives the referral token account for a specific token mint
 * This is used to collect referral fees in that token
 */
export function deriveReferralTokenAccount(
  referralAccount: string,
  tokenMint: string
): PublicKey {
  const REFERRAL_PROGRAM_ID = new PublicKey('REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3');
  
  const [tokenAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('referral_ata'),
      new PublicKey(referralAccount).toBuffer(),
      new PublicKey(tokenMint).toBuffer(),
    ],
    REFERRAL_PROGRAM_ID
  );
  
  return tokenAccount;
}

/**
 * Get the fee account for a swap (if referral is enabled)
 */
function getFeeAccount(outputMint: string): string | undefined {
  if (!JUPITER_REFERRAL_CONFIG.ENABLED) {
    return undefined;
  }
  
  try {
    const feeAccount = deriveReferralTokenAccount(
      JUPITER_REFERRAL_CONFIG.REFERRAL_ACCOUNT,
      outputMint
    );
    return feeAccount.toBase58();
  } catch (error) {
    console.error('Failed to derive referral token account:', error);
    return undefined;
  }
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Get a quote for a token swap
 */
export async function getSwapQuote(params: JupiterQuoteParams): Promise<SwapQuote> {
  const {
    inputMint,
    outputMint,
    amount,
    slippageBps = 50,
    onlyDirectRoutes = false,
    asLegacyTransaction = false,
  } = params;

  // Build query parameters
  const queryParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: onlyDirectRoutes.toString(),
    asLegacyTransaction: asLegacyTransaction.toString(),
  });

  // Add referral fee if enabled
  if (JUPITER_REFERRAL_CONFIG.ENABLED) {
    queryParams.append('platformFeeBps', JUPITER_REFERRAL_CONFIG.FEE_BPS.toString());
  }

  const url = `${JUPITER_QUOTE_ENDPOINT}?${queryParams.toString()}`;

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new WalletError(
        WalletErrorCode.NETWORK_ERROR,
        `Jupiter quote failed: ${response.status} - ${errorText}`
      );
    }

    const quoteResponse: JupiterQuoteResponse = await response.json();

    // Format route labels
    const routeLabels = quoteResponse.routePlan.map(
      step => step.swapInfo.label || 'Unknown DEX'
    );

    // Calculate minimum received (considering slippage)
    const minimumReceived = quoteResponse.otherAmountThreshold;

    // Format output for display
    const quote: SwapQuote = {
      inputMint: quoteResponse.inputMint,
      outputMint: quoteResponse.outputMint,
      inputAmount: quoteResponse.inAmount,
      outputAmount: quoteResponse.outAmount,
      outputAmountFormatted: quoteResponse.outAmount,
      priceImpactPct: quoteResponse.priceImpactPct,
      minimumReceived,
      platformFee: quoteResponse.platformFee?.amount || null,
      route: routeLabels,
      rawQuote: quoteResponse,
    };

    return quote;
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    // Provide more specific error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('AbortError') || errorMessage.includes('aborted')) {
      throw new WalletError(
        WalletErrorCode.NETWORK_ERROR,
        'Request timed out. Please try again.'
      );
    }
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      throw new WalletError(
        WalletErrorCode.NETWORK_ERROR,
        'Network error. Check your connection or try disabling ad-blocker for this request.'
      );
    }
    throw new WalletError(
      WalletErrorCode.NETWORK_ERROR,
      `Failed to get swap quote: ${errorMessage}`
    );
  }
}

/**
 * Build and get the swap transaction
 */
export async function getSwapTransaction(
  quote: SwapQuote,
  userPublicKey: string,
  options: Partial<JupiterSwapParams> = {}
): Promise<JupiterSwapResponse> {
  const feeAccount = getFeeAccount(quote.outputMint);

  const swapParams: JupiterSwapParams = {
    quoteResponse: quote.rawQuote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    useSharedAccounts: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
    ...options,
  };

  // Add fee account if referral is configured
  if (feeAccount) {
    swapParams.feeAccount = feeAccount;
  }

  try {
    const response = await fetchWithTimeout(JUPITER_SWAP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(swapParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        `Jupiter swap build failed: ${response.status} - ${errorText}`
      );
    }

    const swapResponse: JupiterSwapResponse = await response.json();

    if (swapResponse.simulationError) {
      const errorMsg = typeof swapResponse.simulationError === 'string' 
        ? swapResponse.simulationError 
        : JSON.stringify(swapResponse.simulationError);
      throw new WalletError(
        WalletErrorCode.SIMULATION_FAILED,
        `Swap simulation failed: ${errorMsg}`
      );
    }

    return swapResponse;
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Execute a swap transaction
 */
export async function executeSwap(
  quote: SwapQuote,
  options: { slippageBps?: number } = {}
): Promise<SwapResult> {
  // Get the unlocked keypair
  const keypair = getUnlockedKeypair();
  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to perform swaps.'
    );
  }

  const userPublicKey = keypair.publicKey.toBase58();

  // Get the swap transaction
  const swapResponse = await getSwapTransaction(quote, userPublicKey);

  // Deserialize the transaction
  const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  // Sign the transaction
  transaction.sign([keypair]);

  // Get connection and send
  const settings = await getWalletSettings();
  
  try {
    const signature = await executeWithFailover(
      settings.network,
      async (connection) => {
        const sig = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        return sig;
      },
      settings.customRpcUrl
    );

    // Confirm the transaction
    const confirmResult = await confirmTransaction(signature);
    
    // Get explorer URL
    const explorerUrl = await getTransactionExplorerUrl(signature);

    if (!confirmResult.confirmed) {
      console.warn('Swap transaction may not have confirmed:', confirmResult.error);
    }

    return {
      signature,
      explorerUrl,
      inputAmount: quote.inputAmount,
      outputAmount: quote.outputAmount,
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
    };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('insufficient') || errorMessage.includes('Insufficient')) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        'Insufficient balance for swap'
      );
    }
    
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Swap failed: ${errorMessage}`
    );
  }
}

// ============================================================================
// High-Level Swap Functions
// ============================================================================

/**
 * Get a swap quote with formatted output
 * This is the main function to call when getting a quote for display
 */
export async function getFormattedSwapQuote(
  inputMint: string,
  outputMint: string,
  inputAmount: string,
  inputDecimals: number,
  outputDecimals: number,
  slippageBps: number = 50
): Promise<{
  quote: SwapQuote;
  inputAmountFormatted: string;
  outputAmountFormatted: string;
  minimumReceivedFormatted: string;
  priceImpact: string;
  platformFeeFormatted: string | null;
  route: string;
}> {
  // Convert input amount to smallest units
  const inputAmountRaw = Math.floor(
    parseFloat(inputAmount) * Math.pow(10, inputDecimals)
  ).toString();

  const quote = await getSwapQuote({
    inputMint,
    outputMint,
    amount: inputAmountRaw,
    slippageBps,
  });

  // Format amounts for display
  const outputAmountFormatted = (
    parseInt(quote.outputAmount) / Math.pow(10, outputDecimals)
  ).toFixed(outputDecimals);

  const minimumReceivedFormatted = (
    parseInt(quote.minimumReceived) / Math.pow(10, outputDecimals)
  ).toFixed(outputDecimals);

  const platformFeeFormatted = quote.platformFee
    ? (parseInt(quote.platformFee) / Math.pow(10, outputDecimals)).toFixed(outputDecimals)
    : null;

  return {
    quote,
    inputAmountFormatted: inputAmount,
    outputAmountFormatted,
    minimumReceivedFormatted,
    priceImpact: `${parseFloat(quote.priceImpactPct).toFixed(2)}%`,
    platformFeeFormatted,
    route: quote.route.join(' → '),
  };
}

/**
 * Perform a complete swap with quote and execution
 * This is the main function to call when executing a swap
 */
export async function performSwap(
  inputMint: string,
  outputMint: string,
  inputAmount: string,
  inputDecimals: number,
  slippageBps: number = 50
): Promise<SwapResult> {
  // Convert input amount to smallest units
  const inputAmountRaw = Math.floor(
    parseFloat(inputAmount) * Math.pow(10, inputDecimals)
  ).toString();

  // Get quote
  const quote = await getSwapQuote({
    inputMint,
    outputMint,
    amount: inputAmountRaw,
    slippageBps,
  });

  // Execute swap
  return executeSwap(quote, { slippageBps });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if Jupiter swap is available (mainnet only)
 */
export async function isSwapAvailable(): Promise<boolean> {
  const settings = await getWalletSettings();
  return settings.network === 'mainnet-beta';
}

/**
 * Get the current referral configuration status
 */
export function getReferralStatus(): {
  enabled: boolean;
  feeBps: number;
  referralAccount: string | null;
} {
  return {
    enabled: JUPITER_REFERRAL_CONFIG.ENABLED,
    feeBps: JUPITER_REFERRAL_CONFIG.FEE_BPS,
    referralAccount: JUPITER_REFERRAL_CONFIG.ENABLED 
      ? JUPITER_REFERRAL_CONFIG.REFERRAL_ACCOUNT 
      : null,
  };
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(
  amount: string | number,
  decimals: number,
  maxDecimals: number = 6
): string {
  const num = typeof amount === 'string' ? parseInt(amount) : amount;
  const formatted = num / Math.pow(10, decimals);
  
  // Use fewer decimals for display
  const displayDecimals = Math.min(decimals, maxDecimals);
  return formatted.toFixed(displayDecimals).replace(/\.?0+$/, '');
}

/**
 * Parse user input amount to raw amount
 */
export function parseInputAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new WalletError(
      WalletErrorCode.INVALID_AMOUNT,
      'Invalid swap amount'
    );
  }
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

