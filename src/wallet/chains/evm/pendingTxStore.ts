import type { EVMChainId } from '../types';
import { getTransactionReceipt, getTransactionCount } from './client';

// Tracks pending EVM transactions, polls their status, and exposes helpers needed for replacements.
export type PendingTxStatus = 'pending' | 'mined' | 'failed' | 'dropped' | 'replaced';

export interface PendingEVMTransaction {
  hash: string;

  nonce: number;

  chainId: EVMChainId;

  from: string;

  to: string;

  value: string;

  data: string;

  gasLimit: string;

  maxFeePerGas: string;

  maxPriorityFeePerGas: string;

  submittedAt: number;

  lastCheckedAt: number;

  status: PendingTxStatus;

  replacedBy?: string;

  receipt?: {
    blockNumber: number;
    status: number;
    gasUsed: string;
  };

  errorReason?: string;

  testnet: boolean;
}

export interface PendingTxStore {
  [chainAccount: string]: PendingEVMTransaction[];
}

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

const STORAGE_KEY = 'evmPendingTxs';

export const TX_POLL_ALARM_NAME = 'evmTxPoll';

const POLL_INTERVAL_MINUTES = 1;

const DROPPED_TIMEOUT_MS = 30 * 60 * 1000;

const MAX_PENDING_PER_ACCOUNT = 50;

const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getStoreKey(chainId: EVMChainId, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

export async function loadPendingTxStore(): Promise<PendingTxStore> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {};
  } catch (error) {
    return {};
  }
}

async function savePendingTxStore(store: PendingTxStore): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  } catch (error) {
    throw error;
  }
}

export async function getPendingTxsForAccount(
  chainId: EVMChainId,
  address: string,
): Promise<PendingEVMTransaction[]> {
  const store = await loadPendingTxStore();
  const key = getStoreKey(chainId, address);
  return store[key] || [];
}

export async function getAllPendingTxs(): Promise<PendingEVMTransaction[]> {
  const store = await loadPendingTxStore();
  const allTxs: PendingEVMTransaction[] = [];

  for (const txs of Object.values(store)) {
    allTxs.push(...txs.filter((tx) => tx.status === 'pending'));
  }

  return allTxs.sort((a, b) => b.submittedAt - a.submittedAt);
}

export async function getPendingTxByHash(hash: string): Promise<PendingEVMTransaction | undefined> {
  const store = await loadPendingTxStore();

  for (const txs of Object.values(store)) {
    const found = txs.find((tx) => tx.hash.toLowerCase() === hash.toLowerCase());
    if (found) return found;
  }

  return undefined;
}

export async function addPendingTx(tx: PendingEVMTransaction): Promise<void> {
  const store = await loadPendingTxStore();
  const key = getStoreKey(tx.chainId, tx.from);

  if (!store[key]) {
    store[key] = [];
  }

  const existing = store[key].find((t) => t.hash.toLowerCase() === tx.hash.toLowerCase());
  if (existing) {
    return;
  }

  store[key].push({
    ...tx,
    status: 'pending',
    lastCheckedAt: Date.now(),
  });

  if (store[key].length > MAX_PENDING_PER_ACCOUNT) {
    store[key] = pruneOldTransactions(store[key]);

    if (store[key].length > MAX_PENDING_PER_ACCOUNT) {
      store[key] = store[key].slice(-MAX_PENDING_PER_ACCOUNT);
    }
  }

  await savePendingTxStore(store);

  await ensurePollingActive();

  try {
    await checkSingleTxStatus(tx.hash);
  } catch {}
}

export async function updatePendingTx(
  hash: string,
  updates: Partial<
    Pick<
      PendingEVMTransaction,
      'status' | 'receipt' | 'replacedBy' | 'errorReason' | 'lastCheckedAt'
    >
  >,
): Promise<PendingEVMTransaction | undefined> {
  const store = await loadPendingTxStore();

  for (const key of Object.keys(store)) {
    const txIndex = store[key].findIndex((tx) => tx.hash.toLowerCase() === hash.toLowerCase());

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

function pruneOldTransactions(txs: PendingEVMTransaction[]): PendingEVMTransaction[] {
  const now = Date.now();
  const cutoff = now - PRUNE_AGE_MS;

  return txs.filter((tx) => {
    if (tx.status === 'pending') return true;

    return tx.lastCheckedAt > cutoff;
  });
}

export async function pruneAllOldTransactions(): Promise<void> {
  const store = await loadPendingTxStore();
  let modified = false;

  for (const key of Object.keys(store)) {
    const before = store[key].length;
    store[key] = pruneOldTransactions(store[key]);

    if (store[key].length !== before) {
      modified = true;
    }

    if (store[key].length === 0) {
      delete store[key];
    }
  }

  if (modified) {
    await savePendingTxStore(store);
  }
}

export async function setupTxPollingAlarm(): Promise<void> {
  await chrome.alarms.clear(TX_POLL_ALARM_NAME);

  const allPending = await getAllPendingTxs();

  if (allPending.length > 0) {
    await chrome.alarms.create(TX_POLL_ALARM_NAME, {
      periodInMinutes: POLL_INTERVAL_MINUTES,
    });
  } else {
  }
}

async function ensurePollingActive(): Promise<void> {
  const alarm = await chrome.alarms.get(TX_POLL_ALARM_NAME);

  if (!alarm) {
    await setupTxPollingAlarm();
  }
}

export async function handleTxPollAlarm(): Promise<TxStatusUpdate[]> {
  const store = await loadPendingTxStore();
  const updates: TxStatusUpdate[] = [];
  let modified = false;

  for (const key of Object.keys(store)) {
    const pendingTxs = store[key].filter((tx) => tx.status === 'pending');

    for (const tx of pendingTxs) {
      try {
        const update = await checkTransactionStatus(tx);

        if (update) {
          const txIndex = store[key].findIndex((t) => t.hash === tx.hash);
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
          const txIndex = store[key].findIndex((t) => t.hash === tx.hash);
          if (txIndex !== -1) {
            store[key][txIndex].lastCheckedAt = Date.now();
            modified = true;
          }
        }
      } catch (error) {}
    }
  }

  if (modified) {
    await savePendingTxStore(store);
  }

  const remainingPending = await getAllPendingTxs();
  if (remainingPending.length === 0) {
    await chrome.alarms.clear(TX_POLL_ALARM_NAME);
  }

  await pruneAllOldTransactions();

  return updates;
}

async function checkTransactionStatus(
  tx: PendingEVMTransaction,
): Promise<TxStatusUpdate | undefined> {
  const { hash, chainId, from, nonce, testnet, submittedAt } = tx;

  const receipt = await getTransactionReceipt(chainId, testnet, hash);

  if (receipt) {
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

  const timeSinceSubmit = Date.now() - submittedAt;

  if (timeSinceSubmit > DROPPED_TIMEOUT_MS) {
    const onChainNonce = await getTransactionCount(chainId, testnet, from, 'latest');

    if (onChainNonce > nonce) {
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

  return undefined;
}

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

export async function checkPendingTxsNow(): Promise<TxStatusUpdate[]> {
  return handleTxPollAlarm();
}

async function findReplacementTx(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  nonce: number,
): Promise<string | undefined> {
  const store = await loadPendingTxStore();
  const key = getStoreKey(chainId, from);
  const accountTxs = store[key] || [];

  const replacement = accountTxs.find((tx) => tx.nonce === nonce && tx.status === 'mined');

  return replacement?.hash;
}

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

export function parseHexBigInt(hex: string): bigint {
  if (!hex.startsWith('0x')) {
    return BigInt(hex);
  }
  return BigInt(hex);
}

export {
  STORAGE_KEY,
  POLL_INTERVAL_MINUTES,
  DROPPED_TIMEOUT_MS,
  MAX_PENDING_PER_ACCOUNT,
  PRUNE_AGE_MS,
};
