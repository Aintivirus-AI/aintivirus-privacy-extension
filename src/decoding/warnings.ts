/**
 * AINTIVIRUS Decoding Module - Warning Rules
 *
 * Warning thresholds, rules, and helper functions for transaction analysis.
 */

import { TxWarning, WarningLevel } from './types';
import { isVerifiedContract } from './selectors';

// ============================================
// THRESHOLDS
// ============================================

/** Maximum uint256 value */
export const MAX_UINT256 = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);

/** Half of MaxUint256 - used for detecting "unlimited" approvals */
export const HALF_MAX_UINT256 = MAX_UINT256 / 2n;

export const WARNING_THRESHOLDS = {
  /** Amount >= this is considered "infinite" approval */
  INFINITE_APPROVAL: HALF_MAX_UINT256,

  /** ETH value >= this triggers large transfer warning (in wei) */
  LARGE_ETH_VALUE: 10n * 10n ** 18n, // 10 ETH

  /** Deadline more than this many years from now is suspicious */
  SUSPICIOUS_DEADLINE_YEARS: 10,

  /** Gas limit above this is unusual */
  HIGH_GAS_LIMIT: 1_000_000,
};

// ============================================
// WARNING CODES
// ============================================

export const WARNING_CODES = {
  INFINITE_APPROVAL: 'INFINITE_APPROVAL',
  UNKNOWN_SPENDER: 'UNKNOWN_SPENDER',
  CONTRACT_CREATION: 'CONTRACT_CREATION',
  DELEGATECALL_RISK: 'DELEGATECALL_RISK',
  VALUE_WITH_CALL: 'VALUE_WITH_CALL',
  UNVERIFIED_CONTRACT: 'UNVERIFIED_CONTRACT',
  LARGE_VALUE_TRANSFER: 'LARGE_VALUE_TRANSFER',
  LONG_DEADLINE: 'LONG_DEADLINE',
  NO_DEADLINE: 'NO_DEADLINE',
  PERMIT_SIGNATURE: 'PERMIT_SIGNATURE',
  PERMIT2_DETECTED: 'PERMIT2_DETECTED',
  NFT_APPROVAL_ALL: 'NFT_APPROVAL_ALL',
  HIGH_GAS: 'HIGH_GAS',
  EMPTY_DATA: 'EMPTY_DATA',
} as const;

// ============================================
// WARNING GENERATORS
// ============================================

/**
 * Create a warning object
 */
export function createWarning(
  level: WarningLevel,
  code: string,
  title: string,
  description: string
): TxWarning {
  return { level, code, title, description };
}

/**
 * Check if amount is an "infinite" approval
 */
export function isInfiniteApproval(amount: bigint): boolean {
  return amount >= WARNING_THRESHOLDS.INFINITE_APPROVAL;
}

/**
 * Check if deadline is suspicious (too far in future or no expiration)
 */
export function isSuspiciousDeadline(deadline: bigint | number): 'none' | 'long' | 'ok' {
  const deadlineNum = typeof deadline === 'bigint' ? Number(deadline) : deadline;

  // Max uint256 or similar means no expiration
  if (deadlineNum > Number.MAX_SAFE_INTEGER || deadline === MAX_UINT256) {
    return 'none';
  }

  // Check if deadline is more than 10 years from now
  const nowSeconds = Math.floor(Date.now() / 1000);
  const yearsFromNow = (deadlineNum - nowSeconds) / (365.25 * 24 * 60 * 60);

  if (yearsFromNow > WARNING_THRESHOLDS.SUSPICIOUS_DEADLINE_YEARS) {
    return 'long';
  }

  return 'ok';
}

/**
 * Format deadline for display
 */
export function formatDeadline(deadline: bigint | number): string {
  const deadlineNum = typeof deadline === 'bigint' ? Number(deadline) : deadline;

  if (deadlineNum > Number.MAX_SAFE_INTEGER) {
    return 'Never expires';
  }

  // Check if it's a timestamp (> year 2000)
  if (deadlineNum > 946684800) {
    const date = new Date(deadlineNum * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Might be a block number or relative time
  return deadlineNum.toLocaleString();
}

/**
 * Generate warning for infinite approval
 */
export function warnInfiniteApproval(): TxWarning {
  return createWarning(
    'danger',
    WARNING_CODES.INFINITE_APPROVAL,
    'Unlimited Approval',
    'This grants unlimited spending permission for your tokens. The spender can transfer all tokens of this type from your wallet at any time.'
  );
}

/**
 * Generate warning for unknown spender
 */
export function warnUnknownSpender(address: string): TxWarning {
  return createWarning(
    'caution',
    WARNING_CODES.UNKNOWN_SPENDER,
    'Unknown Spender',
    `The spender address (${address.slice(0, 10)}...) is not a recognized protocol. Verify this is the intended recipient.`
  );
}

/**
 * Generate warning for contract creation
 */
export function warnContractCreation(): TxWarning {
  return createWarning(
    'caution',
    WARNING_CODES.CONTRACT_CREATION,
    'Contract Deployment',
    'This transaction will deploy a new smart contract. Make sure you understand what code is being deployed.'
  );
}

/**
 * Generate warning for value sent with contract call
 */
export function warnValueWithCall(ethValue: string): TxWarning {
  return createWarning(
    'caution',
    WARNING_CODES.VALUE_WITH_CALL,
    'ETH Sent with Call',
    `This transaction sends ${ethValue} ETH to a contract. Ensure this is intentional.`
  );
}

/**
 * Generate warning for unverified contract
 */
export function warnUnverifiedContract(): TxWarning {
  return createWarning(
    'caution',
    WARNING_CODES.UNVERIFIED_CONTRACT,
    'Unverified Contract',
    'This contract is not verified on our known protocols list. Exercise caution.'
  );
}

/**
 * Generate warning for large value transfer
 */
export function warnLargeValue(ethValue: string): TxWarning {
  return createWarning(
    'caution',
    WARNING_CODES.LARGE_VALUE_TRANSFER,
    'Large Transfer',
    `This transaction transfers ${ethValue} ETH. Please verify this amount is correct.`
  );
}

/**
 * Generate warning for long/no deadline
 */
export function warnDeadline(type: 'none' | 'long'): TxWarning {
  if (type === 'none') {
    return createWarning(
      'danger',
      WARNING_CODES.NO_DEADLINE,
      'No Expiration',
      'This approval never expires. Consider using a shorter deadline for better security.'
    );
  }
  return createWarning(
    'caution',
    WARNING_CODES.LONG_DEADLINE,
    'Long Deadline',
    'This approval has an unusually long expiration (>10 years). Consider using a shorter deadline.'
  );
}

/**
 * Generate warning for Permit signature
 */
export function warnPermitSignature(): TxWarning {
  return createWarning(
    'info',
    WARNING_CODES.PERMIT_SIGNATURE,
    'Token Spending Permission',
    'This signature grants permission to spend your tokens. Only sign if you trust this site.'
  );
}

/**
 * Generate warning for Permit2
 */
export function warnPermit2(): TxWarning {
  return createWarning(
    'info',
    WARNING_CODES.PERMIT2_DETECTED,
    'Permit2 Approval',
    'This uses Uniswap Permit2 for token approvals. The signature allows token transfers without additional on-chain approval.'
  );
}

/**
 * Generate warning for setApprovalForAll
 */
export function warnNftApprovalForAll(): TxWarning {
  return createWarning(
    'danger',
    WARNING_CODES.NFT_APPROVAL_ALL,
    'Approve All NFTs',
    'This grants permission to transfer ALL your NFTs from this collection. The operator can move any token at any time.'
  );
}

// ============================================
// ANALYSIS HELPERS
// ============================================

/**
 * Analyze an approval amount and generate appropriate warnings
 */
export function analyzeApprovalAmount(amount: bigint, spender: string): TxWarning[] {
  const warnings: TxWarning[] = [];

  if (isInfiniteApproval(amount)) {
    warnings.push(warnInfiniteApproval());
  }

  if (!isVerifiedContract(spender)) {
    warnings.push(warnUnknownSpender(spender));
  }

  return warnings;
}

/**
 * Analyze ETH value and generate appropriate warnings
 */
export function analyzeEthValue(valueWei: bigint, hasData: boolean): TxWarning[] {
  const warnings: TxWarning[] = [];

  if (valueWei >= WARNING_THRESHOLDS.LARGE_ETH_VALUE) {
    const ethValue = (Number(valueWei) / 1e18).toFixed(4);
    warnings.push(warnLargeValue(ethValue));
  }

  if (valueWei > 0n && hasData) {
    const ethValue = (Number(valueWei) / 1e18).toFixed(4);
    warnings.push(warnValueWithCall(ethValue));
  }

  return warnings;
}

/**
 * Format amount for display, handling large numbers
 */
export function formatAmount(amount: bigint, decimals: number = 18): string {
  if (isInfiniteApproval(amount)) {
    return 'UNLIMITED';
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toLocaleString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

/**
 * Format ETH value for display
 */
export function formatEthValue(weiValue: bigint | string): string {
  const wei = typeof weiValue === 'string' ? BigInt(weiValue) : weiValue;

  if (wei === 0n) return '0 ETH';

  const eth = Number(wei) / 1e18;

  if (eth < 0.0001) return '< 0.0001 ETH';
  if (eth < 1) return `${eth.toFixed(6)} ETH`;
  if (eth < 100) return `${eth.toFixed(4)} ETH`;
  return `${eth.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETH`;
}
