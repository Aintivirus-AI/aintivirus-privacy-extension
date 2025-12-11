import type { EVMChainId } from '../types';
import { getFeeData } from './client';
import type { UnsignedEVMTransaction } from './transactions';
import { type PendingEVMTransaction, parseHexBigInt } from './pendingTxStore';
import { getNumericChainId } from '../config';

// Replacement helpers calculate gas bumps and construct speed-up/cancel requests.
export const MIN_FEE_BUMP_PERCENT = 10;

export const DEFAULT_BUMP_PERCENT = 15;

export const FEE_WARNING_THRESHOLD_GWEI = 500n;

export const FEE_BLOCK_THRESHOLD_GWEI = 2000n;

export const MIN_GAS_LIMIT = 21000n;

const GWEI = 10n ** 9n;

export interface SpeedUpParams {
  originalTx: PendingEVMTransaction;

  bumpPercent?: number;

  customMaxFeePerGas?: bigint;

  customMaxPriorityFeePerGas?: bigint;
}

export interface CancelParams {
  originalTx: PendingEVMTransaction;

  bumpPercent?: number;
}

export interface ReplacementFees {
  maxFeePerGas: bigint;

  maxPriorityFeePerGas: bigint;

  exceedsWarning: boolean;

  exceedsBlock: boolean;

  bumpPercent: number;
}

export interface FeeValidation {
  valid: boolean;

  error?: string;

  warning?: string;
}

export function calculateSpeedUpFees(
  originalTx: PendingEVMTransaction,
  bumpPercent: number = DEFAULT_BUMP_PERCENT,
): ReplacementFees {
  const effectiveBump = Math.max(bumpPercent, MIN_FEE_BUMP_PERCENT);

  const originalMaxFee = parseHexBigInt(originalTx.maxFeePerGas);
  const originalPriorityFee = parseHexBigInt(originalTx.maxPriorityFeePerGas);

  const multiplier = BigInt(100 + effectiveBump);
  const newMaxFeePerGas = (originalMaxFee * multiplier) / 100n;
  const newMaxPriorityFeePerGas = (originalPriorityFee * multiplier) / 100n;

  const maxFeeGwei = newMaxFeePerGas / GWEI;

  return {
    maxFeePerGas: newMaxFeePerGas,
    maxPriorityFeePerGas: newMaxPriorityFeePerGas,
    exceedsWarning: maxFeeGwei > FEE_WARNING_THRESHOLD_GWEI,
    exceedsBlock: maxFeeGwei > FEE_BLOCK_THRESHOLD_GWEI,
    bumpPercent: effectiveBump,
  };
}

export function getMinimumReplacementFees(originalTx: PendingEVMTransaction): {
  minMaxFee: bigint;
  minPriorityFee: bigint;
} {
  const originalMaxFee = parseHexBigInt(originalTx.maxFeePerGas);
  const originalPriorityFee = parseHexBigInt(originalTx.maxPriorityFeePerGas);

  const minMultiplier = BigInt(100 + MIN_FEE_BUMP_PERCENT);

  return {
    minMaxFee: (originalMaxFee * minMultiplier) / 100n,
    minPriorityFee: (originalPriorityFee * minMultiplier) / 100n,
  };
}

export function validateReplacementFees(
  originalTx: PendingEVMTransaction,
  newMaxFee: bigint,
  newPriorityFee: bigint,
): FeeValidation {
  const { minMaxFee, minPriorityFee } = getMinimumReplacementFees(originalTx);

  if (newMaxFee < minMaxFee) {
    return {
      valid: false,
      error:
        `Max fee must be at least ${formatGwei(minMaxFee)} gwei (10% bump). ` +
        `Current: ${formatGwei(newMaxFee)} gwei`,
    };
  }

  if (newPriorityFee < minPriorityFee) {
    return {
      valid: false,
      error:
        `Priority fee must be at least ${formatGwei(minPriorityFee)} gwei (10% bump). ` +
        `Current: ${formatGwei(newPriorityFee)} gwei`,
    };
  }

  const maxFeeGwei = newMaxFee / GWEI;
  if (maxFeeGwei > FEE_BLOCK_THRESHOLD_GWEI) {
    return {
      valid: false,
      error:
        `Max fee ${formatGwei(newMaxFee)} gwei exceeds safety limit of ` +
        `${FEE_BLOCK_THRESHOLD_GWEI} gwei`,
    };
  }

  if (maxFeeGwei > FEE_WARNING_THRESHOLD_GWEI) {
    return {
      valid: true,
      warning:
        `Max fee ${formatGwei(newMaxFee)} gwei is very high. ` +
        `Consider waiting for lower gas prices.`,
    };
  }

  return { valid: true };
}

export function createSpeedUpTx(params: SpeedUpParams): UnsignedEVMTransaction {
  const { originalTx, bumpPercent, customMaxFeePerGas, customMaxPriorityFeePerGas } = params;

  let newMaxFeePerGas: bigint;
  let newMaxPriorityFeePerGas: bigint;

  if (customMaxFeePerGas !== undefined && customMaxPriorityFeePerGas !== undefined) {
    newMaxFeePerGas = customMaxFeePerGas;
    newMaxPriorityFeePerGas = customMaxPriorityFeePerGas;
  } else {
    const fees = calculateSpeedUpFees(originalTx, bumpPercent);
    newMaxFeePerGas = fees.maxFeePerGas;
    newMaxPriorityFeePerGas = fees.maxPriorityFeePerGas;
  }

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
    type: 2,
  };
}

export function createCancelTx(params: CancelParams): UnsignedEVMTransaction {
  const { originalTx, bumpPercent } = params;

  const fees = calculateSpeedUpFees(originalTx, bumpPercent);

  const numericChainId = getNumericChainId(originalTx.chainId, originalTx.testnet);

  return {
    chainId: numericChainId,
    to: originalTx.from,
    value: 0n,
    data: '0x',
    gasLimit: MIN_GAS_LIMIT,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    nonce: originalTx.nonce,
    type: 2,
  };
}

export async function estimateReplacementFees(
  chainId: EVMChainId,
  testnet: boolean,
  originalTx: PendingEVMTransaction,
  bumpPercent: number = DEFAULT_BUMP_PERCENT,
): Promise<
  ReplacementFees & { networkFees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } }
> {
  const feeData = await getFeeData(chainId, testnet);

  const bumpedFees = calculateSpeedUpFees(originalTx, bumpPercent);

  const networkMaxFee = feeData.maxFeePerGas || feeData.gasPrice || 0n;
  const networkPriorityFee = feeData.maxPriorityFeePerGas || 0n;

  const finalMaxFee =
    networkMaxFee > bumpedFees.maxFeePerGas ? networkMaxFee : bumpedFees.maxFeePerGas;

  const finalPriorityFee =
    networkPriorityFee > bumpedFees.maxPriorityFeePerGas
      ? networkPriorityFee
      : bumpedFees.maxPriorityFeePerGas;

  const { minMaxFee, minPriorityFee } = getMinimumReplacementFees(originalTx);

  const safeFinalMaxFee = finalMaxFee < minMaxFee ? minMaxFee : finalMaxFee;
  const safeFinalPriorityFee =
    finalPriorityFee < minPriorityFee ? minPriorityFee : finalPriorityFee;

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

export function calculateCostDifference(
  originalTx: PendingEVMTransaction,
  newMaxFee: bigint,
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

function formatGwei(wei: bigint, decimals: number = 2): string {
  const gwei = Number(wei) / 1e9;
  return gwei.toFixed(decimals);
}

export async function getReplacementGasPresets(
  chainId: EVMChainId,
  testnet: boolean,
  originalTx: PendingEVMTransaction,
): Promise<{
  slow: ReplacementFees;
  market: ReplacementFees;
  fast: ReplacementFees;
}> {
  const feeData = await getFeeData(chainId, testnet);
  const networkMaxFee = feeData.maxFeePerGas || feeData.gasPrice || 0n;

  const slowBump = MIN_FEE_BUMP_PERCENT;
  const marketBump = DEFAULT_BUMP_PERCENT;
  const fastBump = 25;

  const slowFees = calculateSpeedUpFees(originalTx, slowBump);
  const marketFees = calculateSpeedUpFees(originalTx, marketBump);
  const fastFees = calculateSpeedUpFees(originalTx, fastBump);

  if (networkMaxFee > marketFees.maxFeePerGas) {
    marketFees.maxFeePerGas = networkMaxFee;
    marketFees.exceedsWarning = networkMaxFee / GWEI > FEE_WARNING_THRESHOLD_GWEI;
    marketFees.exceedsBlock = networkMaxFee / GWEI > FEE_BLOCK_THRESHOLD_GWEI;
  }

  if (networkMaxFee > fastFees.maxFeePerGas) {
    fastFees.maxFeePerGas = (networkMaxFee * 120n) / 100n;
    fastFees.exceedsWarning = fastFees.maxFeePerGas / GWEI > FEE_WARNING_THRESHOLD_GWEI;
    fastFees.exceedsBlock = fastFees.maxFeePerGas / GWEI > FEE_BLOCK_THRESHOLD_GWEI;
  }

  return {
    slow: slowFees,
    market: marketFees,
    fast: fastFees,
  };
}

export { formatGwei as formatGweiValue };
