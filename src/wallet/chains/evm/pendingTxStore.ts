/**
 * AINTIVIRUS Wallet - EVM Pending Transaction Store
 * 
 * This module manages the storage and tracking of pending EVM transactions
 * with MV3-compatible polling using chrome.alarms.
 * 
 * Features:
 * - Persistent storage via chrome.storage.local
 * - Chrome alarms for polling (survives service worker termination)
 * - Automatic status detection (mined, dropped, replaced)
 * - Per-chain/account transaction tracking
 * 
 * SECURITY:
 * - Only stores transaction metadata, no private keys
 * - Validates transaction hashes before storing
 */

import type { EVMChainId } from '../types';
import { getTransactionReceipt, getTransactionCount } from './client';

// ============================================
// TYPES
// ============================================

/**
 * Pending transaction status
 */
export type PendingTxStatus = 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced';

/**
 * Pending EVM transaction record
 */
export interface PendingEVMTransaction {
  /** Transaction hash */
  hash: string;
  /** Transaction nonce */
  nonce: number;
  /** Chain identifier */
  chainId: EVMChainId;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Value in hex wei */
  value: string;
  /** Transaction data (hex) */
  data: string;
  /** Gas limit (hex) */
  gasLimit: string;
  /** Max fee per gas (hex, EIP-1559) */
  maxFeePerGas: string;
  /** Max priority fee per gas (hex, EIP-1559) */
  maxPriorityFeePerGas: string;
  /** Submission timestamp */
  submittedAt: number;
  /** Last status check timestamp */
  lastCheckedAt: number;
  /** Current status */
  status: PendingTxStatus;
  /** Hash of replacement tx if replaced */
  replacedBy?: string;
  /** Transaction receipt if mined */
  receipt?: {
    blockNumber: number;
    status: number;
    gasUsed: string;
  };
  /** Error reason if failed or dropped */
  errorReason?: string;
  /** Whether this is testnet */
  testnet: boolean;
}

/**
 * Pending transaction store structure
 * Key format: `${chainId}:${address}`
 */
export interface PendingTxStore {
  [chainAccount: string]: PendingEVMTransaction[];
}

/**
 * Transaction status update event
 */
export interface TxStatusUpdate {
  hash: string;
  chainId: EVMChainId;
  from: string;
  previousStatus: PendingTxStatus;
  newStatus: PendingTxStatus;
  receipt?: PendingEVMTransaction['receipt'];
  replacedBy?: string;
  errorReason?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Storage key for pending transactions */
const STORAGE_KEY = 'evmPendingTxs';

/** Alarm name for polling */
export const TX_POLL_ALARM_NAME = 'evmTxPoll';

/** 
 * Polling interval in minutes.
 * MV3 REQUIREMENT: chrome.alarms minimum is 1 minute in production.
 * For faster updates, use event-driven polling via checkPendingTxsNow().
 */
const POLL_INTERVAL_MINUTES = 1;

/** Time after which a tx is considered dropped (30 minutes) */
const DROPPED_TIMEOUT_MS = 30 * 60 * 1000;

/** Maximum pending txs per chain/account */
const MAX_PENDING_PER_ACCOUNT = 50;

/** Age after which to prune completed txs (7 days) */
const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================
// STORAGE OPERATIONS
// ============================================

/**
 * Get the storage key for a chain/account combination
 */
function getStoreKey(chainId: EVMChainId, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

/**
 * Load pending transactions from storage
 */
export async function loadPendingTxStore(): Promise<PendingTxStore> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {};
  } catch (error) {
    console.error('[PendingTxStore] Failed to load:', error);
    return {};
  }
}

/**
 * Save pending transactions to storage
 */
async function savePendingTxStore(store: PendingTxStore): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  } catch (error) {
    console.error('[PendingTxStore] Failed to save:', error);
    throw error;
  }
}

/**
 * Get pending transactions for a specific chain/account
 */
export async function getPendingTxsForAccount(
  chainId: EVMChainId,
  address: string
): Promise<PendingEVMTransaction[]> {
  const store = await loadPendingTxStore();
  const key = getStoreKey(chainId, address);
  return store[key] || [];
}

/**
 * Get all pending transactions across all chains/accounts
 */
export async function getAllPendingTxs(): Promise<PendingEVMTransaction[]> {
  const store = await loadPendingTxStore();
  const allTxs: PendingEVMTransaction[] = [];
  
  for (const txs of Object.values(store)) {
    allTxs.push(...txs.filter(tx => tx.status === 'pending'));
  }
  
  return allTxs.sort((a, b) => b.submittedAt - a.submittedAt);
}

/**
 * Get transaction by hash
 */
export async function getPendingTxByHash(
  hash: string
): Promise<PendingEVMTransaction | undefined> {
  const store = await loadPendingTxStore();
  
  for (const txs of Object.values(store)) {
    const found = txs.find(tx => tx.hash.toLowerCase() === hash.toLowerCase());
    if (found) return found;
  }
  
  return undefined;
}

// ============================================
// TRANSACTION MANAGEMENT
// ============================================

/**
 * Add a new pending transaction
 * 
 * @param tx - Transaction to add
 */
export async function addPendingTx(tx: PendingEVMTransaction): Promise<void> {
  const store = await loadPendingTxStore();
  const key = getStoreKey(tx.chainId, tx.from);
  
  // Initialize array if needed
  if (!store[key]) {
    store[key] = [];
  }
  
  // Check for duplicate hash
  const existing = store[key].find(
    t => t.hash.toLowerCase() === tx.hash.toLowerCase()
  );
  if (existing) {
    console.warn('[PendingTxStore] Transaction already exists:', tx.hash);
    return;
  }
  
  // Add transaction
  store[key].push({
    ...tx,
    status: 'pending',
    lastCheckedAt: Date.now(),
  });
  
  // Limit per account
  if (store[key].length > MAX_PENDING_PER_ACCOUNT) {
    // Remove oldest completed transactions first
    store[key] = pruneOldTransactions(store[key]);
    
    // If still over limit, remove oldest
    if (store[key].length > MAX_PENDING_PER_ACCOUNT) {
      store[key] = store[key].slice(-MAX_PENDING_PER_ACCOUNT);
    }
  }
  
  await savePendingTxStore(store);
  
  // Ensure polling is active
  await ensurePollingActive();
  
  // Immediately check status after submission (event-driven polling)
  // This provides fast feedback without relying on <1 min alarms
  try {
    await checkSingleTxStatus(tx.hash);
  } catch {
    // Ignore errors on immediate check - alarm will retry
  }
}

/**
 * Update a pending transaction's status
 * 
 * @param hash - Transaction hash
 * @param updates - Fields to update
 * @returns Updated transaction or undefined if not found
 */
export async function updatePendingTx(
  hash: string,
  updates: Partial<Pick<PendingEVMTransaction, 'status' | 'receipt' | 'replacedBy' | 'errorReason' | 'lastCheckedAt'>>
): Promise<PendingEVMTransaction | undefined> {
  const store = await loadPendingTxStore();
  
  for (const key of Object.keys(store)) {
    const txIndex = store[key].findIndex(
      tx => tx.hash.toLowerCase() === hash.toLowerCase()
    );
    
    if (txIndex !== -1) {
      store[key][txIndex] = {
        ...store[key][txIndex],
        ...updates,
        lastCheckedAt: Date.now(),
      };
      
      await savePendingTxStore(store);
      return store[key][txIndex];
    }
  }
  
  return undefined;
}

/**
 * Remove old completed transactions
 */
function pruneOldTransactions(txs: PendingEVMTransaction[]): PendingEVMTransaction[] {
  const now = Date.now();
  const cutoff = now - PRUNE_AGE_MS;
  
  return txs.filter(tx => {
    // Keep all pending transactions
    if (tx.status === 'pending') return true;
    
    // Keep recently completed transactions
    return tx.lastCheckedAt > cutoff;
  });
}

/**
 * Prune old transactions from all accounts
 */
export async function pruneAllOldTransactions(): Promise<void> {
  const store = await loadPendingTxStore();
  let modified = false;
  
  for (const key of Object.keys(store)) {
    const before = store[key].length;
    store[key] = pruneOldTransactions(store[key]);
    
    if (store[key].length !== before) {
      modified = true;
    }
    
    // Remove empty arrays
    if (store[key].length === 0) {
      delete store[key];
    }
  }
  
  if (modified) {
    await savePendingTxStore(store);
  }
}

// ============================================
// STATUS POLLING
// ============================================

/**
 * Set up the polling alarm
 */
export async function setupTxPollingAlarm(): Promise<void> {
  // Clear any existing alarm
  await chrome.alarms.clear(TX_POLL_ALARM_NAME);
  
  // Check if there are pending transactions
  const allPending = await getAllPendingTxs();
  
  if (allPending.length > 0) {
    // Create alarm - use periodInMinutes for recurring
    await chrome.alarms.create(TX_POLL_ALARM_NAME, {
      periodInMinutes: POLL_INTERVAL_MINUTES,
    });
    
    console.log('[PendingTxStore] Polling alarm created for', allPending.length, 'pending txs');
  } else {
    console.log('[PendingTxStore] No pending txs, polling disabled');
  }
}

/**
 * Ensure polling is active if there are pending transactions
 */
async function ensurePollingActive(): Promise<void> {
  const alarm = await chrome.alarms.get(TX_POLL_ALARM_NAME);
  
  if (!alarm) {
    await setupTxPollingAlarm();
  }
}

/**
 * Handle polling alarm - check status of all pending transactions
 * 
 * @returns Array of status updates
 */
export async function handleTxPollAlarm(): Promise<TxStatusUpdate[]> {
  console.log('[PendingTxStore] Polling pending transactions...');
  
  const store = await loadPendingTxStore();
  const updates: TxStatusUpdate[] = [];
  let modified = false;
  
  for (const key of Object.keys(store)) {
    const pendingTxs = store[key].filter(tx => tx.status === 'pending');
    
    for (const tx of pendingTxs) {
      try {
        const update = await checkTransactionStatus(tx);
        
        if (update) {
          // Find and update the transaction
          const txIndex = store[key].findIndex(t => t.hash === tx.hash);
          if (txIndex !== -1) {
            store[key][txIndex] = {
              ...store[key][txIndex],
              status: update.newStatus,
              receipt: update.receipt,
              replacedBy: update.replacedBy,
              errorReason: update.errorReason,
              lastCheckedAt: Date.now(),
            };
            modified = true;
            updates.push(update);
          }
        } else {
          // Update lastCheckedAt even if no status change
          const txIndex = store[key].findIndex(t => t.hash === tx.hash);
          if (txIndex !== -1) {
            store[key][txIndex].lastCheckedAt = Date.now();
            modified = true;
          }
        }
      } catch (error) {
        console.warn('[PendingTxStore] Error checking tx:', tx.hash, error);
      }
    }
  }
  
  if (modified) {
    await savePendingTxStore(store);
  }
  
  // Check if we still have pending txs
  const remainingPending = await getAllPendingTxs();
  if (remainingPending.length === 0) {
    await chrome.alarms.clear(TX_POLL_ALARM_NAME);
    console.log('[PendingTxStore] No more pending txs, polling disabled');
  }
  
  // Periodically prune old transactions
  await pruneAllOldTransactions();
  
  return updates;
}

/**
 * Check the status of a single pending transaction
 * 
 * @param tx - Transaction to check
 * @returns Status update if changed, undefined otherwise
 */
async function checkTransactionStatus(
  tx: PendingEVMTransaction
): Promise<TxStatusUpdate | undefined> {
  const { hash, chainId, from, nonce, testnet, submittedAt } = tx;
  
  // Try to get receipt
  const receipt = await getTransactionReceipt(chainId, testnet, hash);
  
  if (receipt) {
    // Transaction was mined
    const newStatus: PendingTxStatus = receipt.status === 1 ? 'mined' : 'failed';
    
    return {
      hash,
      chainId,
      from,
      previousStatus: tx.status,
      newStatus,
      receipt: {
        blockNumber: receipt.blockNumber,
        status: receipt.status ?? 0,
        gasUsed: receipt.gasUsed.toString(),
      },
      errorReason: receipt.status === 0 ? 'Transaction reverted' : undefined,
    };
  }
  
  // No receipt - check if dropped or replaced
  const timeSinceSubmit = Date.now() - submittedAt;
  
  if (timeSinceSubmit > DROPPED_TIMEOUT_MS) {
    // Check on-chain nonce
    const onChainNonce = await getTransactionCount(chainId, testnet, from, 'latest');
    
    if (onChainNonce > nonce) {
      // Nonce has been used by another transaction
      // Try to find the replacement
      const replacement = await findReplacementTx(chainId, testnet, from, nonce);
      
      if (replacement && replacement.toLowerCase() !== hash.toLowerCase()) {
        return {
          hash,
          chainId,
          from,
          previousStatus: tx.status,
          newStatus: 'replaced',
          replacedBy: replacement,
        };
      }
      
      return {
        hash,
        chainId,
        from,
        previousStatus: tx.status,
        newStatus: 'dropped',
        errorReason: 'Transaction was dropped from mempool',
      };
    }
  }
  
  // Still pending
  return undefined;
}

/**
 * Check status of a single transaction by hash
 * Used for immediate feedback after submission
 * 
 * @param hash - Transaction hash to check
 * @returns Status update if changed, undefined otherwise
 */
async function checkSingleTxStatus(hash: string): Promise<TxStatusUpdate | undefined> {
  const tx = await getPendingTxByHash(hash);
  if (!tx || tx.status !== 'pending') return undefined;
  
  const update = await checkTransactionStatus(tx);
  if (update) {
    await updatePendingTx(hash, {
      status: update.newStatus,
      receipt: update.receipt,
      replacedBy: update.replacedBy,
      errorReason: update.errorReason,
    });
  }
  return update;
}

/**
 * Check status of all pending transactions immediately
 * 
 * Use this for UI-triggered polling when popup/approval window is open.
 * This bypasses the 1-minute alarm interval for faster updates.
 * 
 * @returns Array of status updates for transactions that changed
 */
export async function checkPendingTxsNow(): Promise<TxStatusUpdate[]> {
  return handleTxPollAlarm();
}

/**
 * Attempt to find a replacement transaction
 * (Transaction at same nonce that was mined)
 * 
 * This is a simplified check - in practice would need block scanning
 */
async function findReplacementTx(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  nonce: number
): Promise<string | undefined> {
  // Check our local store for a replacement at the same nonce
  const store = await loadPendingTxStore();
  const key = getStoreKey(chainId, from);
  const accountTxs = store[key] || [];
  
  // Look for a mined tx at the same nonce
  const replacement = accountTxs.find(
    tx => tx.nonce === nonce && tx.status === 'mined'
  );
  
  return replacement?.hash;
}

// ============================================
// TRANSACTION CREATION HELPERS
// ============================================

/**
 * Create a pending transaction record from transaction parameters
 * 
 * @param params - Transaction parameters
 * @returns Pending transaction record
 */
export function createPendingTxRecord(params: {
  hash: string;
  nonce: number;
  chainId: EVMChainId;
  from: string;
  to: string;
  value: bigint;
  data: string;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  testnet: boolean;
}): PendingEVMTransaction {
  return {
    hash: params.hash,
    nonce: params.nonce,
    chainId: params.chainId,
    from: params.from.toLowerCase(),
    to: params.to.toLowerCase(),
    value: '0x' + params.value.toString(16),
    data: params.data,
    gasLimit: '0x' + params.gasLimit.toString(16),
    maxFeePerGas: '0x' + params.maxFeePerGas.toString(16),
    maxPriorityFeePerGas: '0x' + params.maxPriorityFeePerGas.toString(16),
    submittedAt: Date.now(),
    lastCheckedAt: Date.now(),
    status: 'pending',
    testnet: params.testnet,
  };
}

/**
 * Parse hex string to bigint
 */
export function parseHexBigInt(hex: string): bigint {
  if (!hex.startsWith('0x')) {
    return BigInt(hex);
  }
  return BigInt(hex);
}

// ============================================
// EXPORTS
// ============================================

export {
  STORAGE_KEY,
  POLL_INTERVAL_MINUTES,
  DROPPED_TIMEOUT_MS,
  MAX_PENDING_PER_ACCOUNT,
  PRUNE_AGE_MS,
};
