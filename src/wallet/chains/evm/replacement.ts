/**
 * AINTIVIRUS Wallet - EVM Transaction Replacement
 * 
 * This module handles speed up and cancel operations for pending
 * EVM transactions using EIP-1559 fee bumping.
 * 
 * Features:
 * - Speed up with configurable fee bump percentage
 * - Cancel via self-send with minimal gas
 * - Minimum fee bump validation (10% per EIP-1559)
 * - Fee cap safety checks
 * 
 * SECURITY:
 * - Validates minimum fee bump to prevent rejection
 * - Enforces maximum fee caps to prevent accidents
 * - Preserves original transaction integrity (same nonce, to, value, data)
 */

import type { EVMChainId } from '../types';
import { getFeeData } from './client';
import type { UnsignedEVMTransaction } from './transactions';
import {
  type PendingEVMTransaction,
  parseHexBigInt,
} from './pendingTxStore';
import { getNumericChainId } from '../config';

// ============================================
// CONSTANTS
// ============================================

/** Minimum fee bump percentage per EIP-1559 */
export const MIN_FEE_BUMP_PERCENT = 10;

/** Default fee bump percentage */
export const DEFAULT_BUMP_PERCENT = 15;

/** Warning threshold for max fee (500 gwei) */
export const FEE_WARNING_THRESHOLD_GWEI = 500n;

/** Block threshold for max fee (2000 gwei) */
export const FEE_BLOCK_THRESHOLD_GWEI = 2000n;

/** Minimum gas for simple transfer (cancel tx) */
export const MIN_GAS_LIMIT = 21000n;

/** Gwei to wei conversion */
const GWEI = 10n ** 9n;

// ============================================
// TYPES
// ============================================

/**
 * Speed up parameters
 */
export interface SpeedUpParams {
  /** Original pending transaction */
  originalTx: PendingEVMTransaction;
  /** Fee bump percentage (default 15%) */
  bumpPercent?: number;
  /** Custom max fee per gas (overrides bump calculation) */
  customMaxFeePerGas?: bigint;
  /** Custom priority fee (overrides bump calculation) */
  customMaxPriorityFeePerGas?: bigint;
}

/**
 * Cancel parameters
 */
export interface CancelParams {
  /** Original pending transaction to cancel */
  originalTx: PendingEVMTransaction;
  /** Fee bump percentage (default 15%) */
  bumpPercent?: number;
}

/**
 * Fee calculation result
 */
export interface ReplacementFees {
  /** New max fee per gas */
  maxFeePerGas: bigint;
  /** New max priority fee per gas */
  maxPriorityFeePerGas: bigint;
  /** Whether this exceeds the warning threshold */
  exceedsWarning: boolean;
  /** Whether this exceeds the blocking threshold */
  exceedsBlock: boolean;
  /** Bump percentage applied */
  bumpPercent: number;
}

/**
 * Fee validation result
 */
export interface FeeValidation {
  /** Whether the fees are valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Warning message if concerning but valid */
  warning?: string;
}

// ============================================
// FEE CALCULATION
// ============================================

/**
 * Calculate speed up fees with minimum bump
 * 
 * EIP-1559 requires at least 10% bump for replacement to be accepted.
 * We default to 15% to ensure reliable acceptance.
 * 
 * @param originalTx - Original pending transaction
 * @param bumpPercent - Bump percentage (minimum 10)
 * @returns New fee values
 */
export function calculateSpeedUpFees(
  originalTx: PendingEVMTransaction,
  bumpPercent: number = DEFAULT_BUMP_PERCENT
): ReplacementFees {
  // Enforce minimum bump
  const effectiveBump = Math.max(bumpPercent, MIN_FEE_BUMP_PERCENT);
  
  const originalMaxFee = parseHexBigInt(originalTx.maxFeePerGas);
  const originalPriorityFee = parseHexBigInt(originalTx.maxPriorityFeePerGas);
  
  // Calculate new fees with bump
  const multiplier = BigInt(100 + effectiveBump);
  const newMaxFeePerGas = (originalMaxFee * multiplier) / 100n;
  const newMaxPriorityFeePerGas = (originalPriorityFee * multiplier) / 100n;
  
  // Check thresholds
  const maxFeeGwei = newMaxFeePerGas / GWEI;
  
  return {
    maxFeePerGas: newMaxFeePerGas,
    maxPriorityFeePerGas: newMaxPriorityFeePerGas,
    exceedsWarning: maxFeeGwei > FEE_WARNING_THRESHOLD_GWEI,
    exceedsBlock: maxFeeGwei > FEE_BLOCK_THRESHOLD_GWEI,
    bumpPercent: effectiveBump,
  };
}

/**
 * Calculate minimum required fees for replacement
 * 
 * @param originalTx - Original pending transaction
 * @returns Minimum fees required
 */
export function getMinimumReplacementFees(
  originalTx: PendingEVMTransaction
): { minMaxFee: bigint; minPriorityFee: bigint } {
  const originalMaxFee = parseHexBigInt(originalTx.maxFeePerGas);
  const originalPriorityFee = parseHexBigInt(originalTx.maxPriorityFeePerGas);
  
  // Minimum 10% bump
  const minMultiplier = BigInt(100 + MIN_FEE_BUMP_PERCENT);
  
  return {
    minMaxFee: (originalMaxFee * minMultiplier) / 100n,
    minPriorityFee: (originalPriorityFee * minMultiplier) / 100n,
  };
}

/**
 * Validate replacement fees
 * 
 * @param originalTx - Original pending transaction
 * @param newMaxFee - Proposed new max fee
 * @param newPriorityFee - Proposed new priority fee
 * @returns Validation result
 */
export function validateReplacementFees(
  originalTx: PendingEVMTransaction,
  newMaxFee: bigint,
  newPriorityFee: bigint
): FeeValidation {
  const { minMaxFee, minPriorityFee } = getMinimumReplacementFees(originalTx);
  
  // Check minimum bump
  if (newMaxFee < minMaxFee) {
    return {
      valid: false,
      error: `Max fee must be at least ${formatGwei(minMaxFee)} gwei (10% bump). ` +
        `Current: ${formatGwei(newMaxFee)} gwei`,
    };
  }
  
  if (newPriorityFee < minPriorityFee) {
    return {
      valid: false,
      error: `Priority fee must be at least ${formatGwei(minPriorityFee)} gwei (10% bump). ` +
        `Current: ${formatGwei(newPriorityFee)} gwei`,
    };
  }
  
  // Check blocking threshold
  const maxFeeGwei = newMaxFee / GWEI;
  if (maxFeeGwei > FEE_BLOCK_THRESHOLD_GWEI) {
    return {
      valid: false,
      error: `Max fee ${formatGwei(newMaxFee)} gwei exceeds safety limit of ` +
        `${FEE_BLOCK_THRESHOLD_GWEI} gwei`,
    };
  }
  
  // Check warning threshold
  if (maxFeeGwei > FEE_WARNING_THRESHOLD_GWEI) {
    return {
      valid: true,
      warning: `Max fee ${formatGwei(newMaxFee)} gwei is very high. ` +
        `Consider waiting for lower gas prices.`,
    };
  }
  
  return { valid: true };
}

// ============================================
// TRANSACTION CREATION
// ============================================

/**
 * Create a speed up transaction
 * 
 * Keeps the same nonce, to, value, data - only increases fees.
 * 
 * @param params - Speed up parameters
 * @returns Unsigned replacement transaction
 */
export function createSpeedUpTx(params: SpeedUpParams): UnsignedEVMTransaction {
  const { originalTx, bumpPercent, customMaxFeePerGas, customMaxPriorityFeePerGas } = params;
  
  let newMaxFeePerGas: bigint;
  let newMaxPriorityFeePerGas: bigint;
  
  if (customMaxFeePerGas !== undefined && customMaxPriorityFeePerGas !== undefined) {
    // Use custom values (already validated externally)
    newMaxFeePerGas = customMaxFeePerGas;
    newMaxPriorityFeePerGas = customMaxPriorityFeePerGas;
  } else {
    // Calculate with bump
    const fees = calculateSpeedUpFees(originalTx, bumpPercent);
    newMaxFeePerGas = fees.maxFeePerGas;
    newMaxPriorityFeePerGas = fees.maxPriorityFeePerGas;
  }
  
  // Get numeric chain ID
  const numericChainId = getNumericChainId(originalTx.chainId, originalTx.testnet);
  
  return {
    chainId: numericChainId,
    to: originalTx.to,
    value: parseHexBigInt(originalTx.value),
    data: originalTx.data,
    gasLimit: parseHexBigInt(originalTx.gasLimit),
    maxFeePerGas: newMaxFeePerGas,
    maxPriorityFeePerGas: newMaxPriorityFeePerGas,
    nonce: originalTx.nonce,
    type: 2, // EIP-1559
  };
}

/**
 * Create a cancel transaction
 * 
 * A cancel transaction is a self-send with zero value and minimal gas.
 * It uses the same nonce as the original transaction, effectively
 * replacing it with a no-op.
 * 
 * @param params - Cancel parameters
 * @returns Unsigned cancel transaction
 */
export function createCancelTx(params: CancelParams): UnsignedEVMTransaction {
  const { originalTx, bumpPercent } = params;
  
  // Calculate fees with bump
  const fees = calculateSpeedUpFees(originalTx, bumpPercent);
  
  // Get numeric chain ID
  const numericChainId = getNumericChainId(originalTx.chainId, originalTx.testnet);
  
  return {
    chainId: numericChainId,
    to: originalTx.from, // Self-send
    value: 0n,
    data: '0x',
    gasLimit: MIN_GAS_LIMIT, // Minimum for simple transfer
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    nonce: originalTx.nonce,
    type: 2, // EIP-1559
  };
}

// ============================================
// FEE ESTIMATION
// ============================================

/**
 * Estimate replacement fees based on current network conditions
 * 
 * Compares current network fees with the bumped original fees
 * and suggests the higher of the two.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param originalTx - Original pending transaction
 * @param bumpPercent - Desired bump percentage
 * @returns Recommended replacement fees
 */
export async function estimateReplacementFees(
  chainId: EVMChainId,
  testnet: boolean,
  originalTx: PendingEVMTransaction,
  bumpPercent: number = DEFAULT_BUMP_PERCENT
): Promise<ReplacementFees & { networkFees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } }> {
  // Get current network fees
  const feeData = await getFeeData(chainId, testnet);
  
  // Calculate bumped fees
  const bumpedFees = calculateSpeedUpFees(originalTx, bumpPercent);
  
  // Get network fees
  const networkMaxFee = feeData.maxFeePerGas || feeData.gasPrice || 0n;
  const networkPriorityFee = feeData.maxPriorityFeePerGas || 0n;
  
  // Use the higher of bumped or network fees
  const finalMaxFee = networkMaxFee > bumpedFees.maxFeePerGas
    ? networkMaxFee
    : bumpedFees.maxFeePerGas;
  
  const finalPriorityFee = networkPriorityFee > bumpedFees.maxPriorityFeePerGas
    ? networkPriorityFee
    : bumpedFees.maxPriorityFeePerGas;
  
  // Ensure we still meet minimum bump
  const { minMaxFee, minPriorityFee } = getMinimumReplacementFees(originalTx);
  
  const safeFinalMaxFee = finalMaxFee < minMaxFee ? minMaxFee : finalMaxFee;
  const safeFinalPriorityFee = finalPriorityFee < minPriorityFee ? minPriorityFee : finalPriorityFee;
  
  const maxFeeGwei = safeFinalMaxFee / GWEI;
  
  return {
    maxFeePerGas: safeFinalMaxFee,
    maxPriorityFeePerGas: safeFinalPriorityFee,
    exceedsWarning: maxFeeGwei > FEE_WARNING_THRESHOLD_GWEI,
    exceedsBlock: maxFeeGwei > FEE_BLOCK_THRESHOLD_GWEI,
    bumpPercent,
    networkFees: {
      maxFeePerGas: networkMaxFee,
      maxPriorityFeePerGas: networkPriorityFee,
    },
  };
}

/**
 * Calculate cost difference between original and replacement
 * 
 * @param originalTx - Original pending transaction
 * @param newMaxFee - New max fee per gas
 * @returns Cost difference in wei
 */
export function calculateCostDifference(
  originalTx: PendingEVMTransaction,
  newMaxFee: bigint
): {
  originalMaxCost: bigint;
  newMaxCost: bigint;
  difference: bigint;
  percentIncrease: number;
} {
  const originalMaxFee = parseHexBigInt(originalTx.maxFeePerGas);
  const gasLimit = parseHexBigInt(originalTx.gasLimit);
  
  const originalMaxCost = originalMaxFee * gasLimit;
  const newMaxCost = newMaxFee * gasLimit;
  const difference = newMaxCost - originalMaxCost;
  
  const percentIncrease = Number((difference * 100n) / originalMaxCost);
  
  return {
    originalMaxCost,
    newMaxCost,
    difference,
    percentIncrease,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format wei to gwei with decimal places
 */
function formatGwei(wei: bigint, decimals: number = 2): string {
  const gwei = Number(wei) / 1e9;
  return gwei.toFixed(decimals);
}

/**
 * Get gas presets for replacement transactions
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param originalTx - Original pending transaction
 * @returns Gas presets
 */
export async function getReplacementGasPresets(
  chainId: EVMChainId,
  testnet: boolean,
  originalTx: PendingEVMTransaction
): Promise<{
  slow: ReplacementFees;
  market: ReplacementFees;
  fast: ReplacementFees;
}> {
  // Get current network fees for comparison
  const feeData = await getFeeData(chainId, testnet);
  const networkMaxFee = feeData.maxFeePerGas || feeData.gasPrice || 0n;
  
  // Calculate different bump levels
  const slowBump = MIN_FEE_BUMP_PERCENT; // 10%
  const marketBump = DEFAULT_BUMP_PERCENT; // 15%
  const fastBump = 25; // 25%
  
  const slowFees = calculateSpeedUpFees(originalTx, slowBump);
  const marketFees = calculateSpeedUpFees(originalTx, marketBump);
  const fastFees = calculateSpeedUpFees(originalTx, fastBump);
  
  // Ensure market/fast fees are at least as high as current network
  if (networkMaxFee > marketFees.maxFeePerGas) {
    marketFees.maxFeePerGas = networkMaxFee;
    marketFees.exceedsWarning = (networkMaxFee / GWEI) > FEE_WARNING_THRESHOLD_GWEI;
    marketFees.exceedsBlock = (networkMaxFee / GWEI) > FEE_BLOCK_THRESHOLD_GWEI;
  }
  
  if (networkMaxFee > fastFees.maxFeePerGas) {
    fastFees.maxFeePerGas = networkMaxFee * 120n / 100n; // 20% above network
    fastFees.exceedsWarning = (fastFees.maxFeePerGas / GWEI) > FEE_WARNING_THRESHOLD_GWEI;
    fastFees.exceedsBlock = (fastFees.maxFeePerGas / GWEI) > FEE_BLOCK_THRESHOLD_GWEI;
  }
  
  return {
    slow: slowFees,
    market: marketFees,
    fast: fastFees,
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  formatGwei as formatGweiValue,
};
