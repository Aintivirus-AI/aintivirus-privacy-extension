/**
 * AINTIVIRUS Wallet - Transaction Status Model
 * 
 * This module provides a unified transaction status model for both
 * Solana and EVM chains, with confirmation progress tracking.
 * 
 * Status Lifecycle:
 * - Pending: Transaction submitted but not yet included in a block
 * - Confirming: Transaction included in block, awaiting confirmations
 * - Confirmed: Transaction fully confirmed (finalized on Solana, N confirmations on EVM)
 * - Failed: Transaction reverted or failed
 * - Unknown: Unable to determine status (possibly stuck)
 * - Dropped: Transaction was dropped from mempool
 * - Replaced: Transaction was replaced by another
 */

// ============================================
// TYPES
// ============================================

/**
 * Unified transaction status across all chains
 */
export type TxDisplayStatus = 
  | 'pending'      // Submitted, not in block yet
  | 'confirming'   // In block, awaiting confirmations
  | 'confirmed'    // Fully confirmed
  | 'failed'       // Failed/reverted
  | 'unknown'      // Cannot determine status (stuck)
  | 'dropped'      // Dropped from mempool
  | 'replaced';    // Replaced by another tx

/**
 * Solana confirmation commitment levels
 */
export type SolanaCommitment = 'processed' | 'confirmed' | 'finalized';

/**
 * Confirmation progress for a transaction
 */
export interface TxConfirmationProgress {
  /** Current number of confirmations */
  current: number;
  /** Target confirmations for "confirmed" status */
  target: number;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Human-readable label */
  label: string;
}

/**
 * Solana-specific confirmation progress
 */
export interface SolanaConfirmationProgress extends TxConfirmationProgress {
  /** Current commitment level */
  commitment: SolanaCommitment;
  /** Slot number */
  slot?: number;
}

/**
 * EVM-specific confirmation progress
 */
export interface EVMConfirmationProgress extends TxConfirmationProgress {
  /** Block number transaction was included in */
  blockNumber?: number;
  /** Current chain head block number */
  currentBlock?: number;
}

/**
 * Badge display configuration
 */
export interface TxStatusBadgeConfig {
  /** Status type */
  status: TxDisplayStatus;
  /** Display label */
  label: string;
  /** CSS color variable */
  color: string;
  /** Background color variable */
  bgColor: string;
  /** Icon identifier */
  icon: 'pending' | 'confirming' | 'check' | 'x' | 'question' | 'dropped' | 'replace';
  /** Whether badge should pulse/animate */
  animate: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Required confirmations per EVM chain for "confirmed" status
 * Higher for mainnet chains, lower for L2s which have faster finality
 */
export const EVM_CONFIRMATION_TARGETS: Record<string, number> = {
  ethereum: 12,    // ~2.5 minutes
  polygon: 64,     // ~2 minutes (faster blocks)
  arbitrum: 12,    // Same as L1 for bridged security
  optimism: 12,    // Same as L1 for bridged security
  base: 12,        // Same as L1 for bridged security
  // Testnets
  sepolia: 3,
  goerli: 3,
  'polygon-mumbai': 3,
};

/** Default confirmation target for unknown chains */
export const DEFAULT_EVM_CONFIRMATIONS = 12;

/**
 * Time thresholds for "stuck" detection (milliseconds)
 */
export const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Solana commitment level progression
 */
export const SOLANA_COMMITMENT_ORDER: SolanaCommitment[] = ['processed', 'confirmed', 'finalized'];

// ============================================
// STATUS BADGE CONFIGS
// ============================================

/**
 * Badge configuration for each status
 */
export const STATUS_BADGE_CONFIGS: Record<TxDisplayStatus, TxStatusBadgeConfig> = {
  pending: {
    status: 'pending',
    label: 'Pending',
    color: 'var(--warning)',
    bgColor: 'var(--warning-muted)',
    icon: 'pending',
    animate: true,
  },
  confirming: {
    status: 'confirming',
    label: 'Confirming',
    color: 'var(--accent-primary)',
    bgColor: 'var(--accent-muted)',
    icon: 'confirming',
    animate: true,
  },
  confirmed: {
    status: 'confirmed',
    label: 'Confirmed',
    color: 'var(--success)',
    bgColor: 'var(--success-muted)',
    icon: 'check',
    animate: false,
  },
  failed: {
    status: 'failed',
    label: 'Failed',
    color: 'var(--error)',
    bgColor: 'var(--error-muted)',
    icon: 'x',
    animate: false,
  },
  unknown: {
    status: 'unknown',
    label: 'Unknown',
    color: 'var(--text-muted)',
    bgColor: 'var(--bg-tertiary)',
    icon: 'question',
    animate: true,
  },
  dropped: {
    status: 'dropped',
    label: 'Dropped',
    color: 'var(--text-muted)',
    bgColor: 'var(--bg-tertiary)',
    icon: 'dropped',
    animate: false,
  },
  replaced: {
    status: 'replaced',
    label: 'Replaced',
    color: 'var(--accent-primary)',
    bgColor: 'var(--accent-muted)',
    icon: 'replace',
    animate: false,
  },
};

// ============================================
// SOLANA STATUS MAPPING
// ============================================

/**
 * Map Solana transaction state to display status
 * 
 * @param commitment - Current commitment level (null if not found)
 * @param hasError - Whether the transaction has an error
 * @param submittedAt - When the transaction was submitted
 * @returns Display status
 */
export function mapSolanaStatus(
  commitment: SolanaCommitment | null,
  hasError: boolean,
  submittedAt?: number
): TxDisplayStatus {
  // Check for failed transaction
  if (hasError) {
    return 'failed';
  }

  // No commitment means not yet processed
  if (!commitment) {
    // Check if stuck
    if (submittedAt && Date.now() - submittedAt > STUCK_THRESHOLD_MS) {
      return 'unknown';
    }
    return 'pending';
  }

  // Map commitment levels to display status
  switch (commitment) {
    case 'processed':
      return 'confirming';
    case 'confirmed':
      return 'confirming'; // Still confirming until finalized
    case 'finalized':
      return 'confirmed';
    default:
      return 'unknown';
  }
}

/**
 * Get Solana confirmation progress
 * 
 * @param commitment - Current commitment level
 * @param slot - Current slot
 * @returns Confirmation progress
 */
export function getSolanaProgress(
  commitment: SolanaCommitment | null,
  slot?: number
): SolanaConfirmationProgress {
  const commitmentIndex = commitment 
    ? SOLANA_COMMITMENT_ORDER.indexOf(commitment) 
    : -1;
  
  const current = commitmentIndex + 1;
  const target = SOLANA_COMMITMENT_ORDER.length;
  const percentage = Math.round((current / target) * 100);

  let label: string;
  switch (commitment) {
    case 'processed':
      label = 'Processed (1/3)';
      break;
    case 'confirmed':
      label = 'Confirmed (2/3)';
      break;
    case 'finalized':
      label = 'Finalized (3/3)';
      break;
    default:
      label = 'Pending (0/3)';
  }

  return {
    current,
    target,
    percentage,
    label,
    commitment: commitment || 'processed',
    slot,
  };
}

/**
 * Get human-readable description for Solana commitment level
 */
export function getSolanaCommitmentDescription(commitment: SolanaCommitment): string {
  switch (commitment) {
    case 'processed':
      return 'Transaction has been processed but not yet confirmed';
    case 'confirmed':
      return 'Transaction confirmed by supermajority of validators';
    case 'finalized':
      return 'Transaction finalized and cannot be rolled back';
    default:
      return 'Unknown confirmation status';
  }
}

// ============================================
// EVM STATUS MAPPING
// ============================================

/**
 * Map EVM transaction state to display status
 * 
 * @param status - Raw status from pending tx store
 * @param confirmations - Number of confirmations
 * @param chainId - Chain identifier for confirmation target
 * @param submittedAt - When the transaction was submitted
 * @returns Display status
 */
export function mapEVMStatus(
  status: 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced',
  confirmations: number,
  chainId: string,
  submittedAt?: number
): TxDisplayStatus {
  switch (status) {
    case 'failed':
      return 'failed';
    case 'dropped':
      return 'dropped';
    case 'replaced':
      return 'replaced';
    case 'mined': {
      const target = getEVMConfirmationTarget(chainId);
      if (confirmations >= target) {
        return 'confirmed';
      }
      return 'confirming';
    }
    case 'pending':
    default:
      // Check if stuck
      if (submittedAt && Date.now() - submittedAt > STUCK_THRESHOLD_MS) {
        return 'unknown';
      }
      return 'pending';
  }
}

/**
 * Get confirmation target for an EVM chain
 */
export function getEVMConfirmationTarget(chainId: string): number {
  return EVM_CONFIRMATION_TARGETS[chainId.toLowerCase()] ?? DEFAULT_EVM_CONFIRMATIONS;
}

/**
 * Get EVM confirmation progress
 * 
 * @param confirmations - Current confirmations
 * @param chainId - Chain identifier
 * @param blockNumber - Block the tx was included in
 * @param currentBlock - Current chain head
 * @returns Confirmation progress
 */
export function getEVMProgress(
  confirmations: number,
  chainId: string,
  blockNumber?: number,
  currentBlock?: number
): EVMConfirmationProgress {
  const target = getEVMConfirmationTarget(chainId);
  const current = Math.min(confirmations, target);
  const percentage = Math.round((current / target) * 100);

  let label: string;
  if (confirmations >= target) {
    label = `${target}+ confirmations`;
  } else if (confirmations > 0) {
    label = `${confirmations} / ${target} confirmations`;
  } else {
    label = 'Awaiting confirmation';
  }

  return {
    current,
    target,
    percentage,
    label,
    blockNumber,
    currentBlock,
  };
}

/**
 * Calculate EVM confirmations from block numbers
 */
export function calculateEVMConfirmations(
  txBlockNumber: number | undefined,
  currentBlockNumber: number | undefined
): number {
  if (!txBlockNumber || !currentBlockNumber) {
    return 0;
  }
  const confirmations = currentBlockNumber - txBlockNumber + 1;
  return Math.max(0, confirmations);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get badge configuration for a status
 */
export function getStatusBadgeConfig(status: TxDisplayStatus): TxStatusBadgeConfig {
  return STATUS_BADGE_CONFIGS[status] || STATUS_BADGE_CONFIGS.unknown;
}

/**
 * Check if a transaction status indicates it's still in progress
 */
export function isInProgress(status: TxDisplayStatus): boolean {
  return status === 'pending' || status === 'confirming';
}

/**
 * Check if a transaction status indicates a terminal state
 */
export function isTerminal(status: TxDisplayStatus): boolean {
  return ['confirmed', 'failed', 'dropped', 'replaced'].includes(status);
}

/**
 * Check if a transaction might be stuck
 */
export function mightBeStuck(status: TxDisplayStatus, submittedAt: number): boolean {
  if (status !== 'pending') {
    return false;
  }
  return Date.now() - submittedAt > STUCK_THRESHOLD_MS;
}

/**
 * Get estimated time remaining for confirmation (rough estimate)
 * Returns null if unable to estimate
 */
export function getEstimatedTimeRemaining(
  status: TxDisplayStatus,
  chainType: 'solana' | 'evm',
  chainId?: string,
  progress?: TxConfirmationProgress
): string | null {
  if (status === 'confirmed' || status === 'failed' || !progress) {
    return null;
  }

  if (chainType === 'solana') {
    // Solana: ~400ms per slot, finalization typically ~32 slots
    const remainingSteps = progress.target - progress.current;
    if (remainingSteps <= 0) return null;
    
    const estimatedSeconds = remainingSteps * 12; // ~12 seconds per commitment level
    return formatDuration(estimatedSeconds);
  } else {
    // EVM: Block time varies by chain
    const blockTimeSeconds = getEVMBlockTime(chainId || 'ethereum');
    const remainingConfirmations = progress.target - progress.current;
    if (remainingConfirmations <= 0) return null;
    
    const estimatedSeconds = remainingConfirmations * blockTimeSeconds;
    return formatDuration(estimatedSeconds);
  }
}

/**
 * Get approximate block time for EVM chains (in seconds)
 */
function getEVMBlockTime(chainId: string): number {
  const blockTimes: Record<string, number> = {
    ethereum: 12,
    polygon: 2,
    arbitrum: 0.25,
    optimism: 2,
    base: 2,
  };
  return blockTimes[chainId.toLowerCase()] ?? 12;
}

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `~${Math.ceil(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return minutes > 0 ? `~${hours}h ${minutes}m` : `~${hours}h`;
  }
}

/**
 * Get status-specific action suggestions
 */
export function getStatusActionSuggestion(
  status: TxDisplayStatus,
  chainType: 'solana' | 'evm'
): string | null {
  switch (status) {
    case 'pending':
      if (chainType === 'evm') {
        return 'You can speed up or cancel this transaction';
      }
      return 'Transaction is being processed by the network';
    case 'confirming':
      return 'Transaction included in block, awaiting additional confirmations';
    case 'unknown':
      if (chainType === 'evm') {
        return 'This transaction may be stuck. Consider speeding up or canceling.';
      }
      return 'Unable to determine transaction status. It may still succeed.';
    case 'dropped':
      return 'Transaction was dropped from mempool. You may need to resubmit.';
    default:
      return null;
  }
}
