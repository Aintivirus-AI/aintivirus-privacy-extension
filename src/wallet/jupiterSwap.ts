import {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import { WalletError, WalletErrorCode, SolanaNetwork } from './types';
import { getUnlockedKeypair, getWalletSettings } from './storage';
import { executeWithFailover, getConnection } from './solanaClient';
import { confirmTransaction } from './transactions';
import { getTransactionExplorerUrl } from './rpc';

export const JUPITER_REFERRAL_CONFIG = {
  REFERRAL_ACCOUNT: process.env.AINTIVIRUS_JUPITER_REFERRAL_ACCOUNT || '',

  FEE_BPS: (() => {
    const raw = process.env.AINTIVIRUS_JUPITER_REFERRAL_FEE_BPS;
    const parsed = raw ? Number.parseInt(raw, 10) : 50;
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50;
  })(),

  ENABLED:
    (process.env.AINTIVIRUS_JUPITER_REFERRAL_ENABLED || '').toLowerCase() === 'true' &&
    Boolean(process.env.AINTIVIRUS_JUPITER_REFERRAL_ACCOUNT),
};

const JUPITER_API_BASE = 'https://api.jup.ag/swap/v1';
const JUPITER_QUOTE_ENDPOINT = `${JUPITER_API_BASE}/quote`;
const JUPITER_SWAP_ENDPOINT = `${JUPITER_API_BASE}/swap`;
const JUPITER_SWAP_INSTRUCTIONS_ENDPOINT = `${JUPITER_API_BASE}/swap-instructions`;

const JUPITER_API_KEY = process.env.AINTIVIRUS_JUPITER_API_KEY || '';

export const COMMON_TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

const API_TIMEOUT = 30000;

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
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
  // Priority fee can be a number, 'auto', or the new structured format
  prioritizationFeeLamports?: number | 'auto' | {
    priorityLevelWithMaxLamports: {
      maxLamports: number;
      priorityLevel: 'low' | 'medium' | 'high' | 'veryHigh';
    };
  };
  asLegacyTransaction?: boolean;
  useTokenLedger?: boolean;
  destinationTokenAccount?: string;
  dynamicComputeUnitLimit?: boolean;
  skipUserAccountsRpcCalls?: boolean;
}

export interface JupiterSwapResponse {
  swapTransaction: string;
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

/**
 * Parse swap simulation errors into user-friendly messages
 * Common Solana program error codes:
 * - 0x0: Generic error
 * - 0x1: Insufficient funds / InsufficientFunds (Token Program)
 * - 0x2: Invalid mint
 * - 0x3: Token account mismatch
 * - 0x6: Slippage tolerance exceeded
 * - 0x1771: Slippage tolerance exceeded (Jupiter specific - 6001 in decimal)
 * - 0x1786: Slippage tolerance exceeded (Raydium specific - 6022 in decimal)
 * - 0x1772: Invalid input amount (Jupiter - 6002)
 * - 0x1773: Invalid output amount (Jupiter - 6003)
 */
function parseSwapSimulationError(errorMsg: string): string {
  const lowerError = errorMsg.toLowerCase();
  
  // Check for slippage errors - be VERY specific with error codes
  // 0x1771 (6001) = Jupiter SlippageToleranceExceeded
  // 0x1786 (6022) = Raydium slippage
  if (lowerError.includes('0x1771') || lowerError.includes('error: 6001') ||
      lowerError.includes('0x1786') || lowerError.includes('error: 6022') ||
      lowerError.includes('slippagetoleranceexceeded') ||
      lowerError.includes('slippage tolerance')) {
    return 'Slippage tolerance exceeded - the price changed between quote and execution. Fix: Increase slippage to 2%, 5%, or even 10% for volatile tokens and retry.';
  }
  
  if (lowerError.includes('0x1772') || lowerError.includes('error: 6002') ||
      lowerError.includes('0x1773') || lowerError.includes('error: 6003') ||
      lowerError.includes('invalid input') || lowerError.includes('invalid output')) {
    return 'Invalid swap amount. The amount may be too small or too large for this token pair.';
  }
  
  // Check for insufficient funds - look for specific patterns
  if (lowerError.includes('insufficient funds') || 
      lowerError.includes('insufficient balance') ||
      lowerError.includes('insufficient lamports') ||
      (lowerError.includes('custom program error: 0x1') && !lowerError.includes('0x1771') && !lowerError.includes('0x1772') && !lowerError.includes('0x1773') && !lowerError.includes('0x1786'))) {
    return 'Insufficient balance. Please check that you have enough tokens to swap AND at least 0.01 SOL for transaction fees. If swapping SOL, leave some for fees.';
  }
  
  if (lowerError.includes('account not found') || lowerError.includes('account does not exist') || lowerError.includes('owner does not match')) {
    return 'Token account issue. You may need to have a small SOL balance (at least 0.002 SOL) to create the token account for receiving the output token.';
  }
  
  // Compute budget errors - be more specific
  if (lowerError.includes('computationalbudgetexceeded') || lowerError.includes('exceeded computational budget')) {
    return 'Transaction too complex. Try swapping a smaller amount or use a direct route.';
  }
  
  if (lowerError.includes('custom program error: 0x0')) {
    return 'Transaction failed (error 0x0). This may be due to low liquidity, pool state change, or network congestion. Try a smaller amount or try again in a moment.';
  }
  
  // Blockhash/expiry issues
  if (lowerError.includes('blockhash') || lowerError.includes('expired')) {
    return 'Transaction expired. The network is congested. Please try again.';
  }
  
  if (lowerError.includes('rent') && lowerError.includes('lamports')) {
    return 'Insufficient SOL for rent. You need at least 0.01 SOL to cover account creation fees.';
  }
  
  // AMM/Pool specific errors
  if (lowerError.includes('0x1789') || lowerError.includes('error: 6025') ||
      lowerError.includes('price impact')) {
    return 'Price impact too high. The swap amount is too large for the available liquidity. Try a smaller amount.';
  }
  
  const hexMatch = errorMsg.match(/0x[0-9a-f]+/i);
  const decimalMatch = errorMsg.match(/error[:\s]+(\d+)/i);
  
  if (hexMatch || decimalMatch) {
    const code = hexMatch?.[0] || decimalMatch?.[1];
    return `Swap failed with error code ${code}. This may be a liquidity or routing issue. Try: 1) Smaller amount, 2) Higher slippage (5-10%), 3) Wait and retry. Raw: ${errorMsg.slice(0, 200)}`;
  }
  
  return `Swap simulation failed: ${errorMsg.slice(0, 300)}. Try with a smaller amount, higher slippage, or wait a moment and retry.`;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    // Build fetch options with headers including API key if available
    const defaultHeaders: HeadersInit = {
      Accept: 'application/json',
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

    if (options.method === 'POST' && options.body) {
      (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, fetchOptions);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function deriveReferralTokenAccount(referralAccount: string, tokenMint: string): PublicKey {
  const REFERRAL_PROGRAM_ID = new PublicKey('REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3');

  const [tokenAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('referral_ata'),
      new PublicKey(referralAccount).toBuffer(),
      new PublicKey(tokenMint).toBuffer(),
    ],
    REFERRAL_PROGRAM_ID,
  );

  return tokenAccount;
}

/**
 * Get the fee account for a swap (if referral is enabled)
 * Returns undefined if referral is disabled or fee account can't be derived
 */
function getFeeAccount(outputMint: string): string | undefined {
  if (!JUPITER_REFERRAL_CONFIG.ENABLED || !JUPITER_REFERRAL_CONFIG.REFERRAL_ACCOUNT) {
    return undefined;
  }

  try {
    const feeAccount = deriveReferralTokenAccount(
      JUPITER_REFERRAL_CONFIG.REFERRAL_ACCOUNT,
      outputMint,
    );
    return feeAccount.toBase58();
  } catch {
    return undefined;
  }
}

function shouldIncludePlatformFee(): boolean {
  return JUPITER_REFERRAL_CONFIG.ENABLED && 
         Boolean(JUPITER_REFERRAL_CONFIG.REFERRAL_ACCOUNT) &&
         JUPITER_REFERRAL_CONFIG.REFERRAL_ACCOUNT.length > 0;
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

  const queryParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: onlyDirectRoutes.toString(),
    asLegacyTransaction: asLegacyTransaction.toString(),
  });

  // Only add platform fee if we have a valid referral setup and can derive fee account
  // If we add platformFeeBps to quote, we MUST provide feeAccount when building swap
  if (shouldIncludePlatformFee()) {
    const feeAccount = getFeeAccount(outputMint);
    if (feeAccount) {
      queryParams.append('platformFeeBps', JUPITER_REFERRAL_CONFIG.FEE_BPS.toString());
    }
  }

  const url = `${JUPITER_QUOTE_ENDPOINT}?${queryParams.toString()}`;

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new WalletError(
        WalletErrorCode.NETWORK_ERROR,
        `Jupiter quote failed: ${response.status} - ${errorText}`,
      );
    }

    const quoteResponse: JupiterQuoteResponse = await response.json();

    const routeLabels = quoteResponse.routePlan.map((step) => step.swapInfo.label || 'Unknown DEX');

    const minimumReceived = quoteResponse.otherAmountThreshold;

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
      throw new WalletError(WalletErrorCode.NETWORK_ERROR, 'Request timed out. Please try again.');
    }
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      throw new WalletError(
        WalletErrorCode.NETWORK_ERROR,
        'Network error. Check your connection or try disabling ad-blocker for this request.',
      );
    }
    throw new WalletError(
      WalletErrorCode.NETWORK_ERROR,
      `Failed to get swap quote: ${errorMessage}`,
    );
  }
}

export async function getSwapTransaction(
  quote: SwapQuote,
  userPublicKey: string,
  options: Partial<JupiterSwapParams> = {},
): Promise<JupiterSwapResponse> {
  const feeAccount = getFeeAccount(quote.outputMint);

  const baseParams: JupiterSwapParams = {
    quoteResponse: quote.rawQuote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    useSharedAccounts: false,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        maxLamports: 2000000,
        priorityLevel: 'high',
      },
    },
    skipUserAccountsRpcCalls: false,
    ...options,
  };

  // Add fee account if referral is configured
  if (feeAccount) {
    baseParams.feeAccount = feeAccount;
  }

  const makeSwapRequest = async (params: JupiterSwapParams): Promise<JupiterSwapResponse> => {
    const response = await fetchWithTimeout(JUPITER_SWAP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Check if error is about fee account - this means the quote has platformFee 
      // but we couldn't provide a valid fee account
      if (errorText.includes('feeAccount is required') || errorText.includes('NOT_SUPPORTED')) {
        throw new WalletError(
          WalletErrorCode.TRANSACTION_FAILED,
          `PLATFORM_FEE_ERROR: ${errorText}`,
        );
      }
      
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        `Jupiter swap build failed: ${response.status} - ${errorText}`,
      );
    }

    return response.json();
  };

  try {
    const swapResponse = await makeSwapRequest(baseParams);

    if (swapResponse.simulationError) {
      const errorMsg =
        typeof swapResponse.simulationError === 'string'
          ? swapResponse.simulationError
          : JSON.stringify(swapResponse.simulationError);
      
      const retryParams = { ...baseParams, useSharedAccounts: true };
      const retryResponse = await makeSwapRequest(retryParams);
      
      if (retryResponse.simulationError) {
        const retryErrorMsg =
          typeof retryResponse.simulationError === 'string'
            ? retryResponse.simulationError
            : JSON.stringify(retryResponse.simulationError);
        
        if (baseParams.feeAccount) {
          const noFeeParams = { ...retryParams };
          delete noFeeParams.feeAccount;
          const noFeeResponse = await makeSwapRequest(noFeeParams);
          
          if (noFeeResponse.simulationError) {
            const noFeeErrorMsg =
              typeof noFeeResponse.simulationError === 'string'
                ? noFeeResponse.simulationError
                : JSON.stringify(noFeeResponse.simulationError);
            
            const userFriendlyError = parseSwapSimulationError(noFeeErrorMsg);
            throw new WalletError(
              WalletErrorCode.SIMULATION_FAILED,
              userFriendlyError,
            );
          }
          
          return noFeeResponse;
        }
        
        const userFriendlyError = parseSwapSimulationError(retryErrorMsg);
        throw new WalletError(
          WalletErrorCode.SIMULATION_FAILED,
          userFriendlyError,
        );
      }
      
      return retryResponse;
    }

    return swapResponse;
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Execute a swap transaction
 */
export async function executeSwap(
  quote: SwapQuote,
  options: { slippageBps?: number } = {},
): Promise<SwapResult> {
  // Get the unlocked keypair
  const keypair = getUnlockedKeypair();
  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to perform swaps.',
    );
  }

  const userPublicKey = keypair.publicKey.toBase58();

  const swapResponse = await getSwapTransaction(quote, userPublicKey);

  const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  transaction.sign([keypair]);

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
      settings.customRpcUrl,
    );

    // Await confirmation (non-blocking - swap was already broadcast)
    await confirmTransaction(signature);
    const explorerUrl = await getTransactionExplorerUrl(signature);

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
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes('insufficient') || lowerError.includes('0x1')) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        'Insufficient balance for swap. Make sure you have enough tokens and SOL for fees.',
      );
    }

    if (lowerError.includes('slippage') || lowerError.includes('0x1771') || lowerError.includes('0x1786')) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        'Slippage tolerance exceeded. Try increasing slippage or using a smaller amount.',
      );
    }

    if (lowerError.includes('blockhash') || lowerError.includes('expired')) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        'Transaction expired due to network congestion. Please try again.',
      );
    }

    if (lowerError.includes('timeout') || lowerError.includes('network')) {
      throw new WalletError(
        WalletErrorCode.NETWORK_ERROR,
        'Network error during swap. Check your connection and try again.',
      );
    }

    throw new WalletError(WalletErrorCode.TRANSACTION_FAILED, `Swap failed: ${errorMessage}`);
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
  slippageBps: number = 100, // Default 1% for better success rate
): Promise<{
  quote: SwapQuote;
  inputAmountFormatted: string;
  outputAmountFormatted: string;
  minimumReceivedFormatted: string;
  priceImpact: string;
  platformFeeFormatted: string | null;
  route: string;
}> {
  const inputAmountRaw = Math.floor(
    parseFloat(inputAmount) * Math.pow(10, inputDecimals),
  ).toString();

  const quote = await getSwapQuote({
    inputMint,
    outputMint,
    amount: inputAmountRaw,
    slippageBps,
  });

  // Format amounts for display
  // IMPORTANT: Use Number() instead of parseInt() to avoid precision loss with large numbers
  const outputAmountFormatted = (
    Number(quote.outputAmount) / Math.pow(10, outputDecimals)
  ).toFixed(outputDecimals);

  const minimumReceivedFormatted = (
    Number(quote.minimumReceived) / Math.pow(10, outputDecimals)
  ).toFixed(outputDecimals);

  const platformFeeFormatted = quote.platformFee
    ? (Number(quote.platformFee) / Math.pow(10, outputDecimals)).toFixed(outputDecimals)
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

export async function performSwap(
  inputMint: string,
  outputMint: string,
  inputAmount: string,
  inputDecimals: number,
  slippageBps: number = 100,
): Promise<SwapResult> {
  const inputAmountRaw = Math.floor(
    parseFloat(inputAmount) * Math.pow(10, inputDecimals),
  ).toString();

  let quote = await getSwapQuote({
    inputMint,
    outputMint,
    amount: inputAmountRaw,
    slippageBps,
  });

  try {
    return await executeSwap(quote, { slippageBps });
  } catch (error) {
    // If the error is about platform fee, retry without referral
    if (error instanceof WalletError && error.message.includes('PLATFORM_FEE_ERROR')) {
      const originalEnabled = JUPITER_REFERRAL_CONFIG.ENABLED;
      (JUPITER_REFERRAL_CONFIG as { ENABLED: boolean }).ENABLED = false;
      
      try {
        quote = await getSwapQuote({
          inputMint,
          outputMint,
          amount: inputAmountRaw,
          slippageBps,
        });
        
        return await executeSwap(quote, { slippageBps });
      } finally {
        (JUPITER_REFERRAL_CONFIG as { ENABLED: boolean }).ENABLED = originalEnabled;
      }
    }
    
    throw error;
  }
}

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

export function formatTokenAmount(
  amount: string | number,
  decimals: number,
  maxDecimals: number = 6,
): string {
  const num = typeof amount === 'string' ? parseInt(amount) : amount;
  const formatted = num / Math.pow(10, decimals);

  const displayDecimals = Math.min(decimals, maxDecimals);
  return formatted.toFixed(displayDecimals).replace(/\.?0+$/, '');
}

export function parseInputAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new WalletError(WalletErrorCode.INVALID_AMOUNT, 'Invalid swap amount');
  }
  return Math.floor(num * Math.pow(10, decimals)).toString();
}
