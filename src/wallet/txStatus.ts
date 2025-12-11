// Utilities for interpreting transaction confirmation progress and mapping it to
// badge metadata the UI can render.
export type TxDisplayStatus =
  | 'pending'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'unknown'
  | 'dropped'
  | 'replaced';

export type SolanaCommitment = 'processed' | 'confirmed' | 'finalized';

export interface TxConfirmationProgress {
  current: number;

  target: number;

  percentage: number;

  label: string;
}

export interface SolanaConfirmationProgress extends TxConfirmationProgress {
  commitment: SolanaCommitment;

  slot?: number;
}

export interface EVMConfirmationProgress extends TxConfirmationProgress {
  blockNumber?: number;

  currentBlock?: number;
}

export interface TxStatusBadgeConfig {
  status: TxDisplayStatus;

  label: string;

  color: string;

  bgColor: string;

  icon: 'pending' | 'confirming' | 'check' | 'x' | 'question' | 'dropped' | 'replace';

  animate: boolean;
}

export const EVM_CONFIRMATION_TARGETS: Record<string, number> = {
  ethereum: 12,
  polygon: 64,
  arbitrum: 12,
  optimism: 12,
  base: 12,

  sepolia: 3,
  goerli: 3,
  'polygon-mumbai': 3,
};

export const DEFAULT_EVM_CONFIRMATIONS = 12;

export const STUCK_THRESHOLD_MS = 10 * 60 * 1000;

export const SOLANA_COMMITMENT_ORDER: SolanaCommitment[] = ['processed', 'confirmed', 'finalized'];

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

export function mapSolanaStatus(
  commitment: SolanaCommitment | null,
  hasError: boolean,
  submittedAt?: number,
): TxDisplayStatus {
  if (hasError) {
    return 'failed';
  }

  if (!commitment) {
    if (submittedAt && Date.now() - submittedAt > STUCK_THRESHOLD_MS) {
      return 'unknown';
    }
    return 'pending';
  }

  switch (commitment) {
    case 'processed':
      return 'confirming';
    case 'confirmed':
      return 'confirming';
    case 'finalized':
      return 'confirmed';
    default:
      return 'unknown';
  }
}

export function getSolanaProgress(
  commitment: SolanaCommitment | null,
  slot?: number,
): SolanaConfirmationProgress {
  const commitmentIndex = commitment ? SOLANA_COMMITMENT_ORDER.indexOf(commitment) : -1;

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

export function mapEVMStatus(
  status: 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced',
  confirmations: number,
  chainId: string,
  submittedAt?: number,
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
      if (submittedAt && Date.now() - submittedAt > STUCK_THRESHOLD_MS) {
        return 'unknown';
      }
      return 'pending';
  }
}

export function getEVMConfirmationTarget(chainId: string): number {
  return EVM_CONFIRMATION_TARGETS[chainId.toLowerCase()] ?? DEFAULT_EVM_CONFIRMATIONS;
}

export function getEVMProgress(
  confirmations: number,
  chainId: string,
  blockNumber?: number,
  currentBlock?: number,
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

export function calculateEVMConfirmations(
  txBlockNumber: number | undefined,
  currentBlockNumber: number | undefined,
): number {
  if (!txBlockNumber || !currentBlockNumber) {
    return 0;
  }
  const confirmations = currentBlockNumber - txBlockNumber + 1;
  return Math.max(0, confirmations);
}

export function getStatusBadgeConfig(status: TxDisplayStatus): TxStatusBadgeConfig {
  return STATUS_BADGE_CONFIGS[status] || STATUS_BADGE_CONFIGS.unknown;
}

export function isInProgress(status: TxDisplayStatus): boolean {
  return status === 'pending' || status === 'confirming';
}

export function isTerminal(status: TxDisplayStatus): boolean {
  return ['confirmed', 'failed', 'dropped', 'replaced'].includes(status);
}

export function mightBeStuck(status: TxDisplayStatus, submittedAt: number): boolean {
  if (status !== 'pending') {
    return false;
  }
  return Date.now() - submittedAt > STUCK_THRESHOLD_MS;
}

export function getEstimatedTimeRemaining(
  status: TxDisplayStatus,
  chainType: 'solana' | 'evm',
  chainId?: string,
  progress?: TxConfirmationProgress,
): string | null {
  if (status === 'confirmed' || status === 'failed' || !progress) {
    return null;
  }

  if (chainType === 'solana') {
    const remainingSteps = progress.target - progress.current;
    if (remainingSteps <= 0) return null;

    const estimatedSeconds = remainingSteps * 12;
    return formatDuration(estimatedSeconds);
  } else {
    const blockTimeSeconds = getEVMBlockTime(chainId || 'ethereum');
    const remainingConfirmations = progress.target - progress.current;
    if (remainingConfirmations <= 0) return null;

    const estimatedSeconds = remainingConfirmations * blockTimeSeconds;
    return formatDuration(estimatedSeconds);
  }
}

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

export function getStatusActionSuggestion(
  status: TxDisplayStatus,
  chainType: 'solana' | 'evm',
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
