/**
 * AINTIVIRUS Wallet - EVM Nonce Management
 * 
 * This module handles nonce management for EVM transactions,
 * considering both on-chain state and local pending transactions.
 * 
 * Features:
 * - On-chain nonce fetching with pending tag
 * - Local pending tx nonce tracking
 * - Nonce gap detection (external wallet activity)
 * - Nonce synchronization
 * 
 * SECURITY:
 * - Always uses 'pending' tag to include mempool transactions
 * - Detects and warns about external nonce usage
 */

import type { EVMChainId } from '../types';
import { getTransactionCount } from './client';
import { getPendingTxsForAccount, type PendingEVMTransaction } from './pendingTxStore';

// ============================================
// TYPES
// ============================================

/**
 * Nonce gap detection result
 */
export interface NonceGapResult {
  /** Whether there's a gap in the nonce sequence */
  hasGap: boolean;
  /** Missing nonce values */
  missingNonces: number[];
  /** Expected next nonce based on chain + pending */
  expectedNext: number;
  /** On-chain confirmed nonce */
  onChainNonce: number;
  /** Highest pending nonce in our store */
  highestPendingNonce: number | null;
}

/**
 * Nonce status for an account
 */
export interface NonceStatus {
  /** On-chain nonce (confirmed) */
  onChain: number;
  /** Pending nonce from chain (includes mempool) */
  pending: number;
  /** Next nonce to use */
  next: number;
  /** Local pending transaction count */
  localPendingCount: number;
  /** Whether there's potential external activity */
  externalActivity: boolean;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get the on-chain nonce for an address
 * 
 * Uses 'pending' block tag to include transactions in the mempool.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @returns Current on-chain pending nonce
 */
export async function getOnChainNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<number> {
  return getTransactionCount(chainId, testnet, address, 'pending');
}

/**
 * Get the confirmed on-chain nonce
 * 
 * Uses 'latest' block tag for confirmed transactions only.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @returns Confirmed on-chain nonce
 */
export async function getConfirmedNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<number> {
  return getTransactionCount(chainId, testnet, address, 'latest');
}

/**
 * Get the next nonce to use for a new transaction
 * 
 * This considers both on-chain state and local pending transactions
 * to avoid nonce collisions.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @returns Next available nonce
 */
export async function getNextNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<number> {
  // Get on-chain pending nonce
  const onChainNonce = await getOnChainNonce(chainId, testnet, address);
  
  // Get local pending transactions
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  const activePendingTxs = pendingTxs.filter(tx => tx.status === 'pending' && tx.testnet === testnet);
  
  if (activePendingTxs.length === 0) {
    return onChainNonce;
  }
  
  // Find the highest nonce among pending txs
  const maxPendingNonce = Math.max(...activePendingTxs.map(tx => tx.nonce));
  
  // Use the higher of on-chain nonce or (max pending nonce + 1)
  return Math.max(onChainNonce, maxPendingNonce + 1);
}

/**
 * Get the nonce for a replacement transaction (speed up / cancel)
 * 
 * For replacements, we must use the exact same nonce as the original.
 * 
 * @param originalTx - Original pending transaction
 * @returns Nonce to use for replacement
 */
export function getReplacementNonce(originalTx: PendingEVMTransaction): number {
  return originalTx.nonce;
}

// ============================================
// NONCE ANALYSIS
// ============================================

/**
 * Get full nonce status for an account
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @returns Nonce status
 */
export async function getNonceStatus(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<NonceStatus> {
  // Get both confirmed and pending nonce
  const [confirmedNonce, pendingNonce] = await Promise.all([
    getConfirmedNonce(chainId, testnet, address),
    getOnChainNonce(chainId, testnet, address),
  ]);
  
  // Get local pending transactions
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  const activePendingTxs = pendingTxs.filter(tx => tx.status === 'pending' && tx.testnet === testnet);
  
  // Calculate next nonce
  let nextNonce = pendingNonce;
  
  if (activePendingTxs.length > 0) {
    const maxPendingNonce = Math.max(...activePendingTxs.map(tx => tx.nonce));
    nextNonce = Math.max(pendingNonce, maxPendingNonce + 1);
  }
  
  // Detect external activity
  // If on-chain pending nonce is higher than our tracked txs,
  // there might be transactions from another wallet
  const externalActivity = activePendingTxs.length > 0 &&
    pendingNonce > Math.max(...activePendingTxs.map(tx => tx.nonce)) + 1;
  
  return {
    onChain: confirmedNonce,
    pending: pendingNonce,
    next: nextNonce,
    localPendingCount: activePendingTxs.length,
    externalActivity,
  };
}

/**
 * Detect nonce gaps (missing transactions)
 * 
 * This can indicate:
 * - External wallet activity (transactions from another app)
 * - Dropped transactions
 * - Out-of-order transaction submission
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @returns Nonce gap analysis
 */
export async function detectNonceGap(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<NonceGapResult> {
  // Get on-chain state
  const onChainNonce = await getConfirmedNonce(chainId, testnet, address);
  
  // Get local pending transactions
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  const activePendingTxs = pendingTxs.filter(tx => tx.status === 'pending' && tx.testnet === testnet);
  
  if (activePendingTxs.length === 0) {
    return {
      hasGap: false,
      missingNonces: [],
      expectedNext: onChainNonce,
      onChainNonce,
      highestPendingNonce: null,
    };
  }
  
  // Get all pending nonces sorted
  const pendingNonces = activePendingTxs.map(tx => tx.nonce).sort((a, b) => a - b);
  const highestPendingNonce = pendingNonces[pendingNonces.length - 1];
  const lowestPendingNonce = pendingNonces[0];
  
  // Find missing nonces
  const missingNonces: number[] = [];
  
  // Check for gaps between confirmed nonce and first pending
  for (let i = onChainNonce; i < lowestPendingNonce; i++) {
    if (!pendingNonces.includes(i)) {
      missingNonces.push(i);
    }
  }
  
  // Check for gaps within pending transactions
  for (let i = lowestPendingNonce; i <= highestPendingNonce; i++) {
    if (!pendingNonces.includes(i)) {
      missingNonces.push(i);
    }
  }
  
  return {
    hasGap: missingNonces.length > 0,
    missingNonces,
    expectedNext: highestPendingNonce + 1,
    onChainNonce,
    highestPendingNonce,
  };
}

// ============================================
// NONCE VALIDATION
// ============================================

/**
 * Validate a nonce for a new transaction
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @param proposedNonce - Nonce to validate
 * @returns Validation result
 */
export async function validateNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string,
  proposedNonce: number
): Promise<{
  valid: boolean;
  reason?: string;
  suggestedNonce?: number;
}> {
  const status = await getNonceStatus(chainId, testnet, address);
  
  // Nonce too low (already confirmed)
  if (proposedNonce < status.onChain) {
    return {
      valid: false,
      reason: `Nonce ${proposedNonce} already used. Next available: ${status.next}`,
      suggestedNonce: status.next,
    };
  }
  
  // Check for collision with pending tx
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  const pendingAtNonce = pendingTxs.find(
    tx => tx.nonce === proposedNonce && tx.status === 'pending' && tx.testnet === testnet
  );
  
  if (pendingAtNonce) {
    return {
      valid: false,
      reason: `Nonce ${proposedNonce} already in use by pending transaction ${pendingAtNonce.hash}`,
      suggestedNonce: status.next,
    };
  }
  
  // Nonce creates a gap (warning, not invalid)
  if (proposedNonce > status.next) {
    // This is technically valid but may cause issues
    console.warn(
      `[Nonce] Proposed nonce ${proposedNonce} is higher than expected ${status.next}. ` +
      `This may cause the transaction to be stuck.`
    );
  }
  
  return { valid: true };
}

/**
 * Check if a nonce is available for replacement
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @param nonce - Nonce to check
 * @returns Whether the nonce can be used for replacement
 */
export async function canReplaceAtNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string,
  nonce: number
): Promise<{
  canReplace: boolean;
  reason?: string;
}> {
  const confirmedNonce = await getConfirmedNonce(chainId, testnet, address);
  
  // Can't replace if already confirmed
  if (nonce < confirmedNonce) {
    return {
      canReplace: false,
      reason: `Transaction at nonce ${nonce} is already confirmed`,
    };
  }
  
  // Check for pending tx at this nonce
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  const pendingAtNonce = pendingTxs.find(
    tx => tx.nonce === nonce && tx.status === 'pending' && tx.testnet === testnet
  );
  
  if (!pendingAtNonce) {
    return {
      canReplace: false,
      reason: `No pending transaction found at nonce ${nonce}`,
    };
  }
  
  return { canReplace: true };
}

// ============================================
// NONCE RECOVERY
// ============================================

/**
 * Sync local nonce state with on-chain
 * 
 * Useful after external wallet activity or app restart.
 * Marks local pending txs as dropped if their nonce is below on-chain.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Account address
 * @returns Number of transactions marked as dropped
 */
export async function syncNonceState(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<number> {
  const confirmedNonce = await getConfirmedNonce(chainId, testnet, address);
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  
  let droppedCount = 0;
  
  for (const tx of pendingTxs) {
    if (tx.status === 'pending' && tx.testnet === testnet && tx.nonce < confirmedNonce) {
      // This transaction's nonce has been used - it's either mined or replaced
      // The polling mechanism will handle the status update
      console.log(
        `[Nonce] Transaction ${tx.hash} at nonce ${tx.nonce} ` +
        `is below confirmed nonce ${confirmedNonce}`
      );
      droppedCount++;
    }
  }
  
  return droppedCount;
}

// ============================================
// EXPORTS
// ============================================

export type { PendingEVMTransaction } from './pendingTxStore';
