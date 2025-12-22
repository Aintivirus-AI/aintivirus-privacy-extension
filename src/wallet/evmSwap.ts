/**
 * EVM Swap Service using ParaSwap (No API Key Required)
 *
 * ParaSwap is a DEX aggregator that works across all major EVM chains
 * without requiring API keys. Similar flow to Jupiter on Solana.
 *
 * Supported chains: Ethereum, Polygon, Arbitrum, Optimism, Base
 *
 * Docs: https://developers.paraswap.network/api/
 */

import { Transaction, Interface } from 'ethers';
import type { EVMChainId } from './chains/types';
import { ChainError, ChainErrorCode } from './chains/types';
import {
  getNumericChainId,
  getEVMExplorerUrl,
  getEVMChainConfig,
} from './chains/config';
import {
  withFailover,
  estimateGas,
  getGasPrice,
  getFeeData,
  call,
} from './chains/evm/client';
import { broadcastTransaction, confirmTransaction } from './chains/evm/transactions';
import { getUnlockedEVMKeypair, getEVMAddress } from './storage';
import { Wallet } from 'ethers';

// ERC20 interface for allowance checks and approvals
const erc20Interface = new Interface([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

// ============================================================================
// Configuration
// ============================================================================

// ParaSwap API endpoints (no API key required!)
const PARASWAP_API_BASE = 'https://api.paraswap.io';

// Chain ID mapping for ParaSwap
const PARASWAP_CHAIN_IDS: Record<EVMChainId, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
};

// Common token addresses per chain
export const COMMON_EVM_TOKENS: Record<EVMChainId, Record<string, string>> = {
  ethereum: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EescdeCB5e6fBEf',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  polygon: {
    MATIC: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native MATIC
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC
    'USDC.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Bridged USDC
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  },
  arbitrum: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC
    'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // Bridged
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  optimism: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Native USDC
    'USDC.e': '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // Bridged
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    OP: '0x4200000000000000000000000000000000000042',
  },
  base: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  },
};

// Native token address used by ParaSwap
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Request timeout
const API_TIMEOUT = 30000;

// ============================================================================
// Types
// ============================================================================

export interface EVMSwapQuoteParams {
  chainId: EVMChainId;
  srcToken: string;
  destToken: string;
  amount: string; // In smallest units (wei)
  userAddress: string;
  slippageBps?: number; // Default 100 (1%)
}

interface ParaSwapPriceRoute {
  blockNumber: number;
  network: number;
  srcToken: string;
  srcDecimals: number;
  srcAmount: string;
  destToken: string;
  destDecimals: number;
  destAmount: string;
  bestRoute: Array<{
    percent: number;
    swaps: Array<{
      srcToken: string;
      srcDecimals: number;
      destToken: string;
      destDecimals: number;
      swapExchanges: Array<{
        exchange: string;
        srcAmount: string;
        destAmount: string;
        percent: number;
      }>;
    }>;
  }>;
  gasCostUSD: string;
  gasCost: string;
  side: string;
  tokenTransferProxy: string;
  contractAddress: string;
  contractMethod: string;
  srcUSD: string;
  destUSD: string;
  partner: string;
  partnerFee: number;
  maxImpactReached: boolean;
  hmac: string;
}

interface ParaSwapTransactionResponse {
  from: string;
  to: string;
  value: string;
  data: string;
  gasPrice: string;
  chainId: number;
  gas?: string;
}

export interface EVMSwapQuote {
  chainId: EVMChainId;
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  srcDecimals: number;
  destDecimals: number;
  priceRoute: ParaSwapPriceRoute;
  gasCostUSD: string;
  exchangeRate: string;
  slippageBps: number;
}

export interface EVMSwapResult {
  hash: string;
  explorerUrl: string;
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  confirmed: boolean;
  error?: string;
}

// ============================================================================
// Token Approval Functions
// ============================================================================

/**
 * Check current allowance for a token
 */
async function checkAllowance(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
): Promise<bigint> {
  try {
    const data = erc20Interface.encodeFunctionData('allowance', [ownerAddress, spenderAddress]);
    const result = await call(chainId, testnet, {
      to: tokenAddress,
      data,
    });
    const [allowance] = erc20Interface.decodeFunctionResult('allowance', result);
    return BigInt(allowance);
  } catch {
    return 0n;
  }
}

/**
 * Create and execute an approval transaction
 */
async function approveToken(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
): Promise<string> {
  const keypair = getUnlockedEVMKeypair();
  if (!keypair) {
    throw new ChainError(
      ChainErrorCode.SIGNING_FAILED,
      'EVM wallet not available for approval.',
      'evm'
    );
  }

  const userAddress = keypair.address;
  const numericChainId = getNumericChainId(chainId, testnet);

  // Encode approval data - use max uint256 for unlimited approval
  const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const approvalAmount = amount > 0n ? MAX_UINT256 : 0n; // Approve unlimited to avoid repeated approvals
  const data = erc20Interface.encodeFunctionData('approve', [spenderAddress, approvalAmount]);

  // Get gas estimate
  let gasLimit: bigint;
  try {
    gasLimit = await estimateGas(chainId, testnet, {
      from: userAddress,
      to: tokenAddress,
      data,
    });
    gasLimit = (gasLimit * 130n) / 100n; // 30% buffer for approval
  } catch {
    gasLimit = 60000n; // Fallback for approval
  }

  // Get fee data
  const feeData = await getFeeData(chainId, testnet);

  // Build transaction
  const tx: Record<string, unknown> = {
    to: tokenAddress,
    value: 0n,
    data,
    gasLimit,
    chainId: numericChainId,
    nonce: await withFailover(chainId, testnet, async (provider) => {
      return await provider.getTransactionCount(userAddress, 'pending');
    }),
  };

  // Use EIP-1559 if available
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    tx.type = 2;
    tx.maxFeePerGas = feeData.maxFeePerGas;
    tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else {
    tx.type = 0;
    tx.gasPrice = feeData.gasPrice || (await getGasPrice(chainId, testnet));
  }

  // Sign and send
  const wallet = new Wallet(
    typeof keypair.privateKey === 'string'
      ? keypair.privateKey
      : Buffer.from(keypair.privateKey).toString('hex')
  );

  const transaction = Transaction.from(tx);
  const signedTx = wallet.signingKey.sign(transaction.unsignedHash);
  transaction.signature = signedTx;

  const txResponse = await broadcastTransaction(chainId, testnet, transaction.serialized);
  
  // Wait for approval confirmation
  const receipt = await confirmTransaction(chainId, testnet, txResponse.hash, 1);
  
  if (!receipt || receipt.status !== 1) {
    throw new ChainError(
      ChainErrorCode.TRANSACTION_FAILED,
      'Token approval transaction failed',
      'evm'
    );
  }

  return txResponse.hash;
}

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

function getParaSwapChainId(chainId: EVMChainId): number {
  return PARASWAP_CHAIN_IDS[chainId];
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Get a swap quote from ParaSwap
 */
export async function getEVMSwapQuote(params: EVMSwapQuoteParams): Promise<EVMSwapQuote> {
  const {
    chainId,
    srcToken,
    destToken,
    amount,
    userAddress,
    slippageBps = 100, // 1% default
  } = params;

  const networkId = getParaSwapChainId(chainId);

  // Build query params for price endpoint
  const queryParams = new URLSearchParams({
    srcToken,
    destToken,
    amount,
    srcDecimals: '18', // Will be overridden by API response
    destDecimals: '18',
    side: 'SELL',
    network: networkId.toString(),
    userAddress,
  });

  const url = `${PARASWAP_API_BASE}/prices?${queryParams.toString()}`;

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `ParaSwap quote failed: ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        // Use default error message
      }

      throw new ChainError(ChainErrorCode.NETWORK_ERROR, errorMessage, 'evm');
    }

    const priceRoute: ParaSwapPriceRoute = (await response.json()).priceRoute;

    // Calculate exchange rate
    const srcAmountNum = parseFloat(priceRoute.srcAmount) / Math.pow(10, priceRoute.srcDecimals);
    const destAmountNum = parseFloat(priceRoute.destAmount) / Math.pow(10, priceRoute.destDecimals);
    const exchangeRate = (destAmountNum / srcAmountNum).toFixed(6);

    return {
      chainId,
      srcToken: priceRoute.srcToken,
      destToken: priceRoute.destToken,
      srcAmount: priceRoute.srcAmount,
      destAmount: priceRoute.destAmount,
      srcDecimals: priceRoute.srcDecimals,
      destDecimals: priceRoute.destDecimals,
      priceRoute,
      gasCostUSD: priceRoute.gasCostUSD,
      exchangeRate,
      slippageBps,
    };
  } catch (error) {
    if (error instanceof ChainError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('AbortError') || errorMessage.includes('aborted')) {
      throw new ChainError(ChainErrorCode.NETWORK_ERROR, 'Request timed out. Please try again.', 'evm');
    }

    throw new ChainError(
      ChainErrorCode.NETWORK_ERROR,
      `Failed to get swap quote: ${errorMessage}`,
      'evm'
    );
  }
}

/**
 * Build the swap transaction from ParaSwap
 */
export async function buildEVMSwapTransaction(
  quote: EVMSwapQuote,
  userAddress: string,
): Promise<ParaSwapTransactionResponse> {
  const networkId = getParaSwapChainId(quote.chainId);

  // ParaSwap expects slippage as a percentage (e.g., 1 for 1%), not basis points
  // Convert basis points to percentage: 100 bps = 1%
  const slippagePercent = quote.slippageBps / 100;

  const body = {
    srcToken: quote.srcToken,
    destToken: quote.destToken,
    srcAmount: quote.srcAmount,
    priceRoute: quote.priceRoute,
    userAddress,
    partner: 'aintivirus',
    srcDecimals: quote.srcDecimals,
    destDecimals: quote.destDecimals,
    slippage: slippagePercent, // Use slippage instead of destAmount
  };

  const url = `${PARASWAP_API_BASE}/transactions/${networkId}?ignoreChecks=true`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `ParaSwap transaction build failed: ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        // Use default error message
      }

      throw new ChainError(ChainErrorCode.TRANSACTION_FAILED, errorMessage, 'evm');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ChainError) {
      throw error;
    }

    throw new ChainError(
      ChainErrorCode.TRANSACTION_FAILED,
      `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'evm'
    );
  }
}

/**
 * Execute a swap transaction
 */
export async function executeEVMSwap(
  quote: EVMSwapQuote,
  testnet: boolean = false,
): Promise<EVMSwapResult> {
  // Get the EVM keypair
  const keypair = getUnlockedEVMKeypair();
  if (!keypair) {
    throw new ChainError(
      ChainErrorCode.SIGNING_FAILED,
      'EVM wallet not available. Please ensure wallet is unlocked.',
      'evm'
    );
  }

  const userAddress = keypair.address;

  // Check if source token is ERC20 (not native token) and needs approval
  const isNativeToken = quote.srcToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  
  if (!isNativeToken) {
    // Get the TokenTransferProxy address from the quote's price route
    const tokenTransferProxy = quote.priceRoute.tokenTransferProxy;
    
    if (tokenTransferProxy) {
      // Check current allowance
      const currentAllowance = await checkAllowance(
        quote.chainId,
        testnet,
        quote.srcToken,
        userAddress,
        tokenTransferProxy,
      );

      const requiredAmount = BigInt(quote.srcAmount);

      // If allowance is insufficient, approve first
      if (currentAllowance < requiredAmount) {
        try {
          await approveToken(
            quote.chainId,
            testnet,
            quote.srcToken,
            tokenTransferProxy,
            requiredAmount,
          );
          // Small delay to ensure approval is indexed
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          throw new ChainError(
            ChainErrorCode.TRANSACTION_FAILED,
            `Token approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'evm'
          );
        }
      }
    }
  }

  // Build the swap transaction
  const txParams = await buildEVMSwapTransaction(quote, userAddress);

  const numericChainId = getNumericChainId(quote.chainId, testnet);
  const explorerBase = getEVMExplorerUrl(quote.chainId, testnet);

  try {
    // Get current gas prices
    const feeData = await getFeeData(quote.chainId, testnet);

    // Estimate gas if not provided
    let gasLimit = txParams.gas ? BigInt(txParams.gas) : undefined;
    if (!gasLimit) {
      try {
        gasLimit = await estimateGas(quote.chainId, testnet, {
          from: userAddress,
          to: txParams.to,
          value: BigInt(txParams.value || '0'),
          data: txParams.data,
        });
        // Add 50% buffer for safety - swaps are complex multi-hop transactions
        gasLimit = (gasLimit * BigInt(150)) / BigInt(100);
      } catch {
        // Fallback gas limit for swaps - swaps often need high gas
        gasLimit = BigInt(800000);
      }
    }

    // Create the transaction object
    const wallet = new Wallet(
      typeof keypair.privateKey === 'string'
        ? keypair.privateKey
        : Buffer.from(keypair.privateKey).toString('hex')
    );

    // Build transaction with EIP-1559 if available
    const tx: Record<string, unknown> = {
      to: txParams.to,
      value: BigInt(txParams.value || '0'),
      data: txParams.data,
      gasLimit,
      chainId: numericChainId,
      nonce: await withFailover(quote.chainId, testnet, async (provider) => {
        return await provider.getTransactionCount(userAddress, 'pending');
      }),
    };

    // Use EIP-1559 if available
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      tx.type = 2;
      tx.maxFeePerGas = feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else {
      tx.type = 0;
      tx.gasPrice = feeData.gasPrice || (await getGasPrice(quote.chainId, testnet));
    }

    // Sign the transaction
    const transaction = Transaction.from(tx);
    const signedTx = wallet.signingKey.sign(transaction.unsignedHash);
    transaction.signature = signedTx;

    const serializedTx = transaction.serialized;

    // Broadcast the transaction
    const txResponse = await broadcastTransaction(quote.chainId, testnet, serializedTx);
    const hash = txResponse.hash;
    const explorerUrl = `${explorerBase}/tx/${hash}`;

    // Wait for confirmation
    const receipt = await confirmTransaction(quote.chainId, testnet, hash, 1);

    if (receipt) {
      const success = receipt.status === 1;
      return {
        hash,
        explorerUrl,
        srcToken: quote.srcToken,
        destToken: quote.destToken,
        srcAmount: quote.srcAmount,
        destAmount: quote.destAmount,
        confirmed: success,
        error: success ? undefined : 'Transaction reverted',
      };
    }

    return {
      hash,
      explorerUrl,
      srcToken: quote.srcToken,
      destToken: quote.destToken,
      srcAmount: quote.srcAmount,
      destAmount: quote.destAmount,
      confirmed: false,
      error: 'Confirmation timeout - check explorer for status',
    };
  } catch (error) {
    if (error instanceof ChainError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.toLowerCase().includes('insufficient')) {
      throw new ChainError(ChainErrorCode.INSUFFICIENT_FUNDS, 'Insufficient balance for swap', 'evm');
    }

    throw new ChainError(
      ChainErrorCode.TRANSACTION_FAILED,
      `Swap failed: ${errorMessage}`,
      'evm'
    );
  }
}

// ============================================================================
// High-Level Swap Functions
// ============================================================================

/**
 * Get a formatted swap quote for display
 */
export async function getFormattedEVMSwapQuote(
  chainId: EVMChainId,
  srcToken: string,
  destToken: string,
  srcAmount: string,
  srcDecimals: number,
  destDecimals: number,
  userAddress: string,
  slippageBps: number = 100,
): Promise<{
  quote: EVMSwapQuote;
  srcAmountFormatted: string;
  destAmountFormatted: string;
  minimumReceivedFormatted: string;
  exchangeRate: string;
  gasCostUSD: string;
  route: string;
}> {
  // Convert input amount to smallest units
  const srcAmountRaw = BigInt(
    Math.floor(parseFloat(srcAmount) * Math.pow(10, srcDecimals))
  ).toString();

  const quote = await getEVMSwapQuote({
    chainId,
    srcToken,
    destToken,
    amount: srcAmountRaw,
    userAddress,
    slippageBps,
  });

  // Format amounts for display
  const destAmountFormatted = (
    parseFloat(quote.destAmount) / Math.pow(10, quote.destDecimals)
  ).toFixed(Math.min(quote.destDecimals, 8));

  // Calculate minimum received with slippage
  const slippageMultiplier = 1 - slippageBps / 10000;
  const minimumReceived = parseFloat(quote.destAmount) * slippageMultiplier;
  const minimumReceivedFormatted = (
    minimumReceived / Math.pow(10, quote.destDecimals)
  ).toFixed(Math.min(quote.destDecimals, 8));

  // Extract route info
  const routeExchanges: string[] = [];
  if (quote.priceRoute.bestRoute) {
    for (const route of quote.priceRoute.bestRoute) {
      for (const swap of route.swaps) {
        for (const exchange of swap.swapExchanges) {
          if (!routeExchanges.includes(exchange.exchange)) {
            routeExchanges.push(exchange.exchange);
          }
        }
      }
    }
  }

  return {
    quote,
    srcAmountFormatted: srcAmount,
    destAmountFormatted,
    minimumReceivedFormatted,
    exchangeRate: quote.exchangeRate,
    gasCostUSD: quote.gasCostUSD,
    route: routeExchanges.join(' → ') || 'Direct',
  };
}

/**
 * Perform a complete swap with quote and execution
 */
export async function performEVMSwap(
  chainId: EVMChainId,
  srcToken: string,
  destToken: string,
  srcAmount: string,
  srcDecimals: number,
  userAddress: string,
  slippageBps: number = 100,
  testnet: boolean = false,
): Promise<EVMSwapResult> {
  // Convert input amount to smallest units
  const srcAmountRaw = BigInt(
    Math.floor(parseFloat(srcAmount) * Math.pow(10, srcDecimals))
  ).toString();

  // Get quote
  const quote = await getEVMSwapQuote({
    chainId,
    srcToken,
    destToken,
    amount: srcAmountRaw,
    userAddress,
    slippageBps,
  });

  // Execute swap
  return executeEVMSwap(quote, testnet);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if EVM swap is available for a chain
 */
export function isEVMSwapAvailable(chainId: EVMChainId, testnet: boolean): boolean {
  // ParaSwap only works on mainnet
  if (testnet) {
    return false;
  }

  // Check if chain is supported
  return chainId in PARASWAP_CHAIN_IDS;
}

/**
 * Get supported chains for swapping
 */
export function getSupportedSwapChains(): EVMChainId[] {
  return Object.keys(PARASWAP_CHAIN_IDS) as EVMChainId[];
}

/**
 * Check if a token is the native token
 */
export function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Get common tokens for a chain
 */
export function getCommonTokensForChain(chainId: EVMChainId): Record<string, string> {
  return COMMON_EVM_TOKENS[chainId] || {};
}

/**
 * Format token amount for display
 */
export function formatEVMTokenAmount(
  amount: string | bigint,
  decimals: number,
  maxDecimals: number = 6,
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  const formatted = num / Math.pow(10, decimals);
  const displayDecimals = Math.min(decimals, maxDecimals);
  return formatted.toFixed(displayDecimals).replace(/\.?0+$/, '');
}

/**
 * Parse user input amount to raw amount
 */
export function parseEVMInputAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new ChainError(ChainErrorCode.INVALID_AMOUNT, 'Invalid swap amount', 'evm');
  }
  return BigInt(Math.floor(num * Math.pow(10, decimals))).toString();
}

