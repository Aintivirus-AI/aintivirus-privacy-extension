/**
 * AINTIVIRUS Wallet - EVM Token Allowances Manager
 * 
 * This module handles ERC-20 token allowance discovery and revocation
 * for all supported EVM chains.
 * 
 * Features:
 * - Fast allowance discovery via known spenders
 * - Allowance caching with TTL
 * - Revoke transaction creation
 * - Infinite allowance detection
 * 
 * SECURITY:
 * - Always verify spender identity before revoking
 * - Each revoke is a separate on-chain transaction
 * - Spender labels are informational only
 */

import { Interface, formatUnits } from 'ethers';
import type { EVMChainId } from '../types';
import { ChainError, ChainErrorCode } from '../types';
import { call, getTransactionCount, estimateGas, getFeeData } from './client';
import { getNumericChainId, getEVMChainConfig } from '../config';
import { POPULAR_TOKENS, type TokenMetadata } from './tokens';
import { getKnownSpenders, getSpenderLabel, type SpenderInfo } from './knownSpenders';
import { isValidEVMAddress } from '../../keychain';

// ============================================
// TYPES
// ============================================

/**
 * Token allowance entry
 */
export interface TokenAllowance {
  /** Token contract address */
  tokenAddress: string;
  /** Token symbol (e.g., "USDC") */
  tokenSymbol: string;
  /** Token name (e.g., "USD Coin") */
  tokenName: string;
  /** Token decimals */
  tokenDecimals: number;
  /** Token logo URI */
  tokenLogoUri?: string;
  /** Spender contract address */
  spenderAddress: string;
  /** Known protocol name if available */
  spenderLabel?: string;
  /** Whether spender is a known verified protocol */
  spenderVerified?: boolean;
  /** Full precision allowance as string (bigint) */
  allowanceRaw: string;
  /** Human-readable formatted allowance */
  allowanceFormatted: number;
  /** Whether this is an infinite (unlimited) allowance */
  isInfinite: boolean;
  /** Timestamp of last check */
  lastUpdated: number;
}

/**
 * Cached allowances per account/chain
 */
export interface AllowanceCache {
  /** EVM chain identifier */
  chainId: EVMChainId;
  /** Account address */
  account: string;
  /** List of discovered allowances */
  allowances: TokenAllowance[];
  /** When the cache was fetched */
  fetchedAt: number;
  /** Block number when allowances were scanned (for event-based discovery) */
  scanBlockNumber?: number;
}

/**
 * Allowance discovery result
 */
export interface AllowanceDiscoveryResult {
  /** List of discovered allowances */
  allowances: TokenAllowance[];
  /** Whether the cache was used */
  fromCache: boolean;
  /** When the data was fetched/cached */
  fetchedAt: number;
}

/**
 * Unsigned revoke transaction
 */
export interface UnsignedRevokeTransaction {
  /** Numeric chain ID */
  chainId: number;
  /** Token contract address (where approve is called) */
  to: string;
  /** Encoded approve(spender, 0) call */
  data: string;
  /** No value needed for approve */
  value: bigint;
  /** Estimated gas limit */
  gasLimit: bigint;
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: bigint;
  /** Legacy gas price */
  gasPrice?: bigint;
  /** Transaction nonce */
  nonce: number;
  /** Transaction type (0 = legacy, 2 = EIP-1559) */
  type: number;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Maximum value for uint256 (2^256 - 1)
 * Used for infinite/unlimited allowances
 */
export const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

/**
 * Threshold for "infinite" allowance (>= 2^255)
 * Any allowance at or above this is considered unlimited
 */
export const INFINITE_THRESHOLD = BigInt(2) ** BigInt(255);

/**
 * Cache TTL in milliseconds (5 minutes)
 */
export const ALLOWANCE_CACHE_TTL = 5 * 60 * 1000;

/**
 * Storage key for allowance cache
 */
export const ALLOWANCE_CACHE_KEY = 'evmAllowanceCache';

/**
 * ERC-20 ABI for allowance operations
 */
const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

/**
 * ERC-20 interface for encoding/decoding
 */
const erc20Interface = new Interface(ERC20_ALLOWANCE_ABI);

// ============================================
// ALLOWANCE HELPERS
// ============================================

/**
 * Check if an allowance is considered "infinite" (unlimited)
 * 
 * @param allowance - Allowance value as bigint
 * @returns True if allowance is effectively unlimited
 */
export function isInfiniteAllowance(allowance: bigint): boolean {
  return allowance >= INFINITE_THRESHOLD;
}

/**
 * Format allowance for display
 * 
 * @param allowance - Allowance value as bigint
 * @param decimals - Token decimals
 * @returns Formatted string or "Unlimited"
 */
export function formatAllowance(allowance: bigint, decimals: number): string {
  if (isInfiniteAllowance(allowance)) {
    return 'Unlimited';
  }
  
  if (allowance === 0n) {
    return '0';
  }
  
  const formatted = formatUnits(allowance, decimals);
  const num = parseFloat(formatted);
  
  // Format with appropriate precision
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  if (num >= 1) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (num >= 0.0001) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  
  return num.toExponential(2);
}

/**
 * Parse allowance display string back to number
 * 
 * @param allowance - Allowance as bigint
 * @param decimals - Token decimals
 * @returns Numeric value for sorting/comparison
 */
export function parseAllowanceToNumber(allowance: bigint, decimals: number): number {
  if (isInfiniteAllowance(allowance)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return parseFloat(formatUnits(allowance, decimals));
}

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Get cache key for account/chain combination
 */
function getCacheKey(chainId: EVMChainId, account: string): string {
  return `${chainId}-${account.toLowerCase()}`;
}

/**
 * Load allowance cache from storage
 */
async function loadAllowanceCache(): Promise<Record<string, AllowanceCache>> {
  try {
    const result = await chrome.storage.local.get(ALLOWANCE_CACHE_KEY);
    return result[ALLOWANCE_CACHE_KEY] || {};
  } catch (error) {
    console.warn('[Allowances] Failed to load cache:', error);
    return {};
  }
}

/**
 * Save allowance cache to storage
 */
async function saveAllowanceCache(
  cache: Record<string, AllowanceCache>
): Promise<void> {
  try {
    await chrome.storage.local.set({ [ALLOWANCE_CACHE_KEY]: cache });
  } catch (error) {
    console.warn('[Allowances] Failed to save cache:', error);
  }
}

/**
 * Get cached allowances if still valid
 */
async function getCachedAllowances(
  chainId: EVMChainId,
  account: string
): Promise<AllowanceCache | null> {
  const cache = await loadAllowanceCache();
  const key = getCacheKey(chainId, account);
  const cached = cache[key];
  
  if (!cached) {
    return null;
  }
  
  // Check if cache is still valid
  const age = Date.now() - cached.fetchedAt;
  if (age > ALLOWANCE_CACHE_TTL) {
    return null;
  }
  
  return cached;
}

/**
 * Update cached allowances
 */
async function setCachedAllowances(
  chainId: EVMChainId,
  account: string,
  allowances: TokenAllowance[]
): Promise<void> {
  const cache = await loadAllowanceCache();
  const key = getCacheKey(chainId, account);
  
  cache[key] = {
    chainId,
    account: account.toLowerCase(),
    allowances,
    fetchedAt: Date.now(),
  };
  
  await saveAllowanceCache(cache);
}

/**
 * Clear cached allowances for account/chain
 */
export async function clearAllowanceCache(
  chainId: EVMChainId,
  account: string
): Promise<void> {
  const cache = await loadAllowanceCache();
  const key = getCacheKey(chainId, account);
  delete cache[key];
  await saveAllowanceCache(cache);
}

/**
 * Clear all cached allowances
 */
export async function clearAllAllowanceCache(): Promise<void> {
  await chrome.storage.local.remove(ALLOWANCE_CACHE_KEY);
}

// ============================================
// ALLOWANCE DISCOVERY
// ============================================

/**
 * Query single allowance
 */
async function queryAllowance(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<bigint> {
  try {
    const data = erc20Interface.encodeFunctionData('allowance', [
      ownerAddress,
      spenderAddress,
    ]);
    
    const result = await call(chainId, testnet, {
      to: tokenAddress,
      data,
    });
    
    const [allowance] = erc20Interface.decodeFunctionResult('allowance', result);
    return BigInt(allowance);
  } catch (error) {
    // Silently fail for individual queries
    return 0n;
  }
}

/**
 * Query token metadata with sequential calls to avoid rate limiting
 */
async function queryTokenMetadata(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  try {
    let name = 'Unknown Token';
    let symbol = '???';
    let decimals = 18;
    
    // Sequential calls to avoid rate limiting
    try {
      const nameData = await call(chainId, testnet, {
        to: tokenAddress,
        data: erc20Interface.encodeFunctionData('name'),
      });
      [name] = erc20Interface.decodeFunctionResult('name', nameData);
    } catch {}
    
    // Small delay between calls
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const symbolData = await call(chainId, testnet, {
        to: tokenAddress,
        data: erc20Interface.encodeFunctionData('symbol'),
      });
      [symbol] = erc20Interface.decodeFunctionResult('symbol', symbolData);
    } catch {}
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const decimalsData = await call(chainId, testnet, {
        to: tokenAddress,
        data: erc20Interface.encodeFunctionData('decimals'),
      });
      const [dec] = erc20Interface.decodeFunctionResult('decimals', decimalsData);
      decimals = Number(dec);
    } catch {}
    
    return { name, symbol, decimals };
  } catch {
    return null;
  }
}

/**
 * Helper to execute queries with proper rate limiting
 * Limits concurrent requests to avoid RPC rate limiting (429 errors)
 */
async function executeWithRateLimit<T>(
  queries: Array<() => Promise<T>>,
  concurrency: number = 3,
  delayMs: number = 200
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
    
    // Delay between batches (skip after last batch)
    if (i + concurrency < queries.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Discover allowances for an account using fast path
 * 
 * This queries allowances for:
 * - Popular tokens on the chain
 * - Known spender contracts (DEXs, protocols)
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param account - Account address to check
 * @param forceRefresh - Skip cache and force fresh query
 * @returns Discovery result with allowances
 */
export async function discoverAllowances(
  chainId: EVMChainId,
  testnet: boolean,
  account: string,
  forceRefresh: boolean = false
): Promise<AllowanceDiscoveryResult> {
  if (!isValidEVMAddress(account)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid account address', 'evm');
  }
  
  // Check cache first (skip for testnet or force refresh)
  if (!testnet && !forceRefresh) {
    const cached = await getCachedAllowances(chainId, account);
    if (cached) {
      return {
        allowances: cached.allowances,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }
  }
  
  // Get tokens and spenders for this chain
  const tokens = POPULAR_TOKENS[chainId] || [];
  const spenders = getKnownSpenders(chainId);
  
  if (tokens.length === 0 || spenders.length === 0) {
    return {
      allowances: [],
      fromCache: false,
      fetchedAt: Date.now(),
    };
  }
  
  const now = Date.now();
  
  // Limit to top 5 tokens and top 5 spenders to reduce RPC calls
  // This gives us max 25 queries instead of potentially hundreds
  const limitedTokens = tokens.slice(0, 5);
  const limitedSpenders = spenders.slice(0, 5);
  
  console.log(`[Allowances] Checking ${limitedTokens.length} tokens × ${limitedSpenders.length} spenders = ${limitedTokens.length * limitedSpenders.length} queries`);
  
  // Create query functions (not promises!) for rate limiting
  const queryFunctions: Array<() => Promise<TokenAllowance | null>> = [];
  
  for (const token of limitedTokens) {
    for (const spender of limitedSpenders) {
      queryFunctions.push(async () => {
        try {
          const allowance = await queryAllowance(
            chainId,
            testnet,
            token.address,
            account,
            spender.address
          );
          
          // Skip zero allowances
          if (allowance === 0n) {
            return null;
          }
          
          return {
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            tokenName: token.name,
            tokenDecimals: token.decimals,
            tokenLogoUri: token.logoUri,
            spenderAddress: spender.address,
            spenderLabel: spender.label,
            spenderVerified: spender.verified,
            allowanceRaw: allowance.toString(),
            allowanceFormatted: parseAllowanceToNumber(allowance, token.decimals),
            isInfinite: isInfiniteAllowance(allowance),
            lastUpdated: now,
          };
        } catch {
          return null;
        }
      });
    }
  }
  
  // Execute with rate limiting: 3 concurrent, 200ms delay between batches
  const results = await executeWithRateLimit(queryFunctions, 3, 200);
  
  // Filter out nulls
  const allowances = results.filter((a): a is TokenAllowance => a !== null);
  
  // Cache the results (skip for testnet)
  if (!testnet) {
    await setCachedAllowances(chainId, account, allowances);
  }
  
  console.log(`[Allowances] Found ${allowances.length} active allowances`);
  
  return {
    allowances,
    fromCache: false,
    fetchedAt: now,
  };
}

/**
 * Get single token allowance for specific spender
 */
export async function getTokenAllowance(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<TokenAllowance | null> {
  if (!isValidEVMAddress(tokenAddress) ||
      !isValidEVMAddress(ownerAddress) ||
      !isValidEVMAddress(spenderAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid address', 'evm');
  }
  
  const allowance = await queryAllowance(
    chainId,
    testnet,
    tokenAddress,
    ownerAddress,
    spenderAddress
  );
  
  if (allowance === 0n) {
    return null;
  }
  
  // Get token metadata
  const metadata = await queryTokenMetadata(chainId, testnet, tokenAddress);
  if (!metadata) {
    return null;
  }
  
  return {
    tokenAddress,
    tokenSymbol: metadata.symbol,
    tokenName: metadata.name,
    tokenDecimals: metadata.decimals,
    spenderAddress,
    spenderLabel: getSpenderLabel(chainId, spenderAddress),
    allowanceRaw: allowance.toString(),
    allowanceFormatted: parseAllowanceToNumber(allowance, metadata.decimals),
    isInfinite: isInfiniteAllowance(allowance),
    lastUpdated: Date.now(),
  };
}

// ============================================
// REVOKE TRANSACTIONS
// ============================================

/**
 * Create an unsigned revoke transaction
 * 
 * Revokes an allowance by calling approve(spender, 0) on the token contract.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param from - Account address (owner)
 * @param tokenAddress - Token contract address
 * @param spenderAddress - Spender to revoke allowance for
 * @returns Unsigned transaction ready for signing
 */
export async function createRevokeTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  tokenAddress: string,
  spenderAddress: string
): Promise<UnsignedRevokeTransaction> {
  // Validate addresses
  if (!isValidEVMAddress(from)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
  }
  if (!isValidEVMAddress(tokenAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
  }
  if (!isValidEVMAddress(spenderAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid spender address', 'evm');
  }
  
  // Encode approve(spender, 0)
  const data = erc20Interface.encodeFunctionData('approve', [spenderAddress, 0n]);
  
  // Get gas estimate
  let gasLimit: bigint;
  try {
    gasLimit = await estimateGas(chainId, testnet, {
      from,
      to: tokenAddress,
      data,
    });
    // Add 20% buffer for safety
    gasLimit = (gasLimit * 120n) / 100n;
  } catch (error) {
    // Fallback to standard approve gas limit
    gasLimit = 65000n;
  }
  
  // Get nonce
  const nonce = await getTransactionCount(chainId, testnet, from, 'pending');
  
  // Get fee data
  const feeData = await getFeeData(chainId, testnet);
  
  // Get numeric chain ID
  const numericChainId = getNumericChainId(chainId, testnet);
  
  // Build transaction (prefer EIP-1559 if supported)
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    return {
      chainId: numericChainId,
      to: tokenAddress,
      data,
      value: 0n,
      gasLimit,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      nonce,
      type: 2, // EIP-1559
    };
  } else {
    return {
      chainId: numericChainId,
      to: tokenAddress,
      data,
      value: 0n,
      gasLimit,
      gasPrice: feeData.gasPrice || 1000000000n, // 1 gwei fallback
      nonce,
      type: 0, // Legacy
    };
  }
}

/**
 * Create multiple revoke transactions for bulk revocation
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param from - Account address (owner)
 * @param revocations - Array of {tokenAddress, spenderAddress} to revoke
 * @returns Array of unsigned transactions
 */
export async function createBulkRevokeTransactions(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  revocations: Array<{ tokenAddress: string; spenderAddress: string }>
): Promise<UnsignedRevokeTransaction[]> {
  if (revocations.length === 0) {
    return [];
  }
  
  // Get base nonce and fee data once (2 parallel calls)
  const [baseNonce, feeData] = await Promise.all([
    getTransactionCount(chainId, testnet, from, 'pending'),
    getFeeData(chainId, testnet),
  ]);
  
  const numericChainId = getNumericChainId(chainId, testnet);
  
  // Create query functions for gas estimation with rate limiting
  const gasEstimateFunctions: Array<() => Promise<{ index: number; gasLimit: bigint; data: string }>> = [];
  
  for (let i = 0; i < revocations.length; i++) {
    const { tokenAddress, spenderAddress } = revocations[i];
    const data = erc20Interface.encodeFunctionData('approve', [spenderAddress, 0n]);
    
    gasEstimateFunctions.push(async () => {
      let gasLimit: bigint;
      try {
        gasLimit = await estimateGas(chainId, testnet, {
          from,
          to: tokenAddress,
          data,
        });
        gasLimit = (gasLimit * 120n) / 100n;
      } catch {
        gasLimit = 65000n;
      }
      return { index: i, gasLimit, data };
    });
  }
  
  // Execute gas estimates with rate limiting
  const gasResults = await executeWithRateLimit(gasEstimateFunctions, 2, 300);
  
  // Build transactions
  const transactions: UnsignedRevokeTransaction[] = [];
  
  for (const { index, gasLimit, data } of gasResults) {
    const { tokenAddress } = revocations[index];
    
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      transactions.push({
        chainId: numericChainId,
        to: tokenAddress,
        data,
        value: 0n,
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        nonce: baseNonce + index,
        type: 2,
      });
    } else {
      transactions.push({
        chainId: numericChainId,
        to: tokenAddress,
        data,
        value: 0n,
        gasLimit,
        gasPrice: feeData.gasPrice || 1000000000n,
        nonce: baseNonce + index,
        type: 0,
      });
    }
  }
  
  // Sort by nonce to ensure correct order
  transactions.sort((a, b) => a.nonce - b.nonce);
  
  return transactions;
}

/**
 * Estimate gas cost for a revoke transaction
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param from - Account address
 * @param tokenAddress - Token address
 * @param spenderAddress - Spender address
 * @returns Estimated gas in native token (ETH)
 */
export async function estimateRevokeFee(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  tokenAddress: string,
  spenderAddress: string
): Promise<{ gasLimit: bigint; totalFeeWei: bigint; totalFeeFormatted: number }> {
  const data = erc20Interface.encodeFunctionData('approve', [spenderAddress, 0n]);
  
  // Estimate gas
  let gasLimit: bigint;
  try {
    gasLimit = await estimateGas(chainId, testnet, {
      from,
      to: tokenAddress,
      data,
    });
    gasLimit = (gasLimit * 120n) / 100n;
  } catch {
    gasLimit = 65000n;
  }
  
  // Get fee data
  const feeData = await getFeeData(chainId, testnet);
  const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;
  
  const totalFeeWei = gasLimit * gasPrice;
  const totalFeeFormatted = parseFloat(formatUnits(totalFeeWei, 18));
  
  return {
    gasLimit,
    totalFeeWei,
    totalFeeFormatted,
  };
}
