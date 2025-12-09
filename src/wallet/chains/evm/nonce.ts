

import type { EVMChainId } from '../types';
import { getTransactionCount } from './client';
import { getPendingTxsForAccount, type PendingEVMTransaction } from './pendingTxStore';


export interface NonceGapResult {
  
  hasGap: boolean;
  
  missingNonces: number[];
  
  expectedNext: number;
  
  onChainNonce: number;
  
  highestPendingNonce: number | null;
}


export interface NonceStatus {
  
  onChain: number;
  
  pending: number;
  
  next: number;
  
  localPendingCount: number;
  
  externalActivity: boolean;
}


export async function getOnChainNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<number> {
  return getTransactionCount(chainId, testnet, address, 'pending');
}


export async function getConfirmedNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<number> {
  return getTransactionCount(chainId, testnet, address, 'latest');
}


export async function getNextNonce(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<number> {
  
  const onChainNonce = await getOnChainNonce(chainId, testnet, address);
  
  
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  const activePendingTxs = pendingTxs.filter(tx => tx.status === 'pending' && tx.testnet === testnet);
  
  if (activePendingTxs.length === 0) {
    return onChainNonce;
  }
  
  
  const maxPendingNonce = Math.max(...activePendingTxs.map(tx => tx.nonce));
  
  
  return Math.max(onChainNonce, maxPendingNonce + 1);
}


export function getReplacementNonce(originalTx: PendingEVMTransaction): number {
  return originalTx.nonce;
}


export async function getNonceStatus(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<NonceStatus> {
  
  const [confirmedNonce, pendingNonce] = await Promise.all([
    getConfirmedNonce(chainId, testnet, address),
    getOnChainNonce(chainId, testnet, address),
  ]);
  
  
  const pendingTxs = await getPendingTxsForAccount(chainId, address);
  const activePendingTxs = pendingTxs.filter(tx => tx.status === 'pending' && tx.testnet === testnet);
  
  
  let nextNonce = pendingNonce;
  
  if (activePendingTxs.length > 0) {
    const maxPendingNonce = Math.max(...activePendingTxs.map(tx => tx.nonce));
    nextNonce = Math.max(pendingNonce, maxPendingNonce + 1);
  }
  
  
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


export async function detectNonceGap(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<NonceGapResult> {
  
  const onChainNonce = await getConfirmedNonce(chainId, testnet, address);
  
  
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
  
  
  const pendingNonces = activePendingTxs.map(tx => tx.nonce).sort((a, b) => a - b);
  const highestPendingNonce = pendingNonces[pendingNonces.length - 1];
  const lowestPendingNonce = pendingNonces[0];
  
  
  const missingNonces: number[] = [];
  
  
  for (let i = onChainNonce; i < lowestPendingNonce; i++) {
    if (!pendingNonces.includes(i)) {
      missingNonces.push(i);
    }
  }
  
  
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
  
  
  if (proposedNonce < status.onChain) {
    return {
      valid: false,
      reason: `Nonce ${proposedNonce} already used. Next available: ${status.next}`,
      suggestedNonce: status.next,
    };
  }
  
  
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
  
  
  if (proposedNonce > status.next) {
    

  }
  
  return { valid: true };
}


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
  
  
  if (nonce < confirmedNonce) {
    return {
      canReplace: false,
      reason: `Transaction at nonce ${nonce} is already confirmed`,
    };
  }
  
  
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
      
      
      droppedCount++;
    }
  }
  
  return droppedCount;
}


export type { PendingEVMTransaction } from './pendingTxStore';
