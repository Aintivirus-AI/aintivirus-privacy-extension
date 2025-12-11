import {
  QueuedRequest,
  QueuedRequestStatus,
  ApprovalType,
  RequestQueueStore,
  DAppChainType,
  DAppError,
  EIP1193_ERROR_CODES,
  createEIP1193Error,
  generateRequestId,
  generateSecureNonce,
  getApprovalType,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '../types';
import { STORAGE_KEYS, TIMEOUTS } from '../bridge/constants';

const REQUEST_QUEUE_VERSION = 2;
const REQUEST_CLEANUP_ALARM = 'dappRequestCleanup';
const REQUEST_EXPIRE_ALARM_PREFIX = 'dappRequestExpire:';
const POLL_RESOLUTION_INTERVAL_MS = 100;
const MAX_POLL_ATTEMPTS = 3000;

const changeListeners = new Set<(queue: QueuedRequest[]) => void>();

async function getQueueStore(): Promise<RequestQueueStore> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEYS.REQUEST_QUEUE);
    const store = result[STORAGE_KEYS.REQUEST_QUEUE] as RequestQueueStore | undefined;

    if (!store || store.version !== REQUEST_QUEUE_VERSION) {
      return createDefaultQueueStore();
    }

    return store;
  } catch (error) {
    return createDefaultQueueStore();
  }
}

async function saveQueueStore(store: RequestQueueStore): Promise<void> {
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.REQUEST_QUEUE]: store });
    notifyListeners(store.requests);
  } catch (error) {
    throw error;
  }
}

function createDefaultQueueStore(): RequestQueueStore {
  return {
    version: REQUEST_QUEUE_VERSION,
    requests: [],
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  };
}

export async function enqueue(request: {
  origin: string;
  tabId: number;
  chainType: DAppChainType;
  method: string;
  params: unknown;
  favicon?: string;
  title?: string;
}): Promise<{ id: string; nonce: string; promise: Promise<unknown> }> {
  const store = await getQueueStore();

  const id = generateRequestId();
  const nonce = generateSecureNonce();
  const now = Date.now();
  const expiresAt = now + store.timeoutMs;

  const approvalType = getApprovalType(request.method, request.chainType);

  const queuedRequest: QueuedRequest = {
    id,
    nonce,
    origin: request.origin,
    tabId: request.tabId,
    chainType: request.chainType,
    method: request.method,
    params: request.params,
    approvalType,
    createdAt: now,
    expiresAt,
    status: 'pending',
    favicon: request.favicon,
    title: request.title,
  };

  const isDuplicate = store.requests.some(
    (r) =>
      r.origin === request.origin &&
      r.method === request.method &&
      r.status === 'pending' &&
      JSON.stringify(r.params) === JSON.stringify(request.params),
  );

  if (isDuplicate) {
  }

  store.requests.push(queuedRequest);
  await saveQueueStore(store);

  await chrome.alarms.create(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`, {
    when: expiresAt,
  });

  const promise = pollForResolution(id, expiresAt);

  return { id, nonce, promise };
}

async function pollForResolution(id: string, expiresAt: number): Promise<unknown> {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    if (Date.now() > expiresAt) {
      throw createErrorWithCode(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Request timed out');
    }

    const request = await getRequest(id);

    if (!request) {
      throw createErrorWithCode(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Request not found');
    }

    switch (request.status) {
      case 'approved':
        return request.result;

      case 'rejected':
      case 'cancelled':
        throw createErrorWithCode(
          request.error?.code || EIP1193_ERROR_CODES.USER_REJECTED,
          request.error?.message || 'User rejected the request',
        );

      case 'expired':
        throw createErrorWithCode(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Request timed out');

      case 'pending':
        break;
    }

    await sleep(POLL_RESOLUTION_INTERVAL_MS);
    attempts++;
  }

  throw createErrorWithCode(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Request timed out');
}

function createErrorWithCode(code: number, message: string): Error & { code: number } {
  const err = new Error(message) as Error & { code: number };
  err.code = code;
  return err;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getRequest(id: string): Promise<QueuedRequest | null> {
  const store = await getQueueStore();
  return store.requests.find((r) => r.id === id) || null;
}

export async function getNextPendingForOrigin(origin: string): Promise<QueuedRequest | null> {
  const store = await getQueueStore();
  return store.requests.find((r) => r.origin === origin && r.status === 'pending') || null;
}

export async function getAllPendingRequests(): Promise<QueuedRequest[]> {
  const store = await getQueueStore();
  return store.requests.filter((r) => r.status === 'pending');
}

export async function getPendingRequestsByOrigin(origin: string): Promise<QueuedRequest[]> {
  const store = await getQueueStore();
  return store.requests.filter((r) => r.origin === origin && r.status === 'pending');
}

export async function getPendingRequestsByTab(tabId: number): Promise<QueuedRequest[]> {
  const store = await getQueueStore();
  return store.requests.filter((r) => r.tabId === tabId && r.status === 'pending');
}

async function updateRequestStatus(
  id: string,
  status: QueuedRequestStatus,
  result?: unknown,
  error?: DAppError,
): Promise<boolean> {
  const store = await getQueueStore();
  const index = store.requests.findIndex((r) => r.id === id);

  if (index === -1) {
    return false;
  }

  store.requests[index] = {
    ...store.requests[index],
    status,
    result,
    error,
  };

  await saveQueueStore(store);
  return true;
}

export async function approveRequest(id: string, result: unknown): Promise<void> {
  const request = await getRequest(id);

  if (!request || request.status !== 'pending') {
    return;
  }

  await updateRequestStatus(id, 'approved', result);

  await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`);

  scheduleRequestCleanup(id);
}

export async function rejectRequest(id: string, reason?: string): Promise<void> {
  const request = await getRequest(id);

  if (!request || request.status !== 'pending') {
    return;
  }

  const error = createEIP1193Error(
    EIP1193_ERROR_CODES.USER_REJECTED,
    reason || 'User rejected the request',
  );

  await updateRequestStatus(id, 'rejected', undefined, error);

  await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`);

  scheduleRequestCleanup(id);
}

async function expireRequest(id: string): Promise<void> {
  const request = await getRequest(id);

  if (!request || request.status !== 'pending') {
    return;
  }

  const error = createEIP1193Error(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Request timed out');

  await updateRequestStatus(id, 'expired', undefined, error);

  scheduleRequestCleanup(id);
}

export async function cancelRequest(id: string): Promise<void> {
  const request = await getRequest(id);

  if (!request || request.status !== 'pending') {
    return;
  }

  const error = createEIP1193Error(EIP1193_ERROR_CODES.USER_REJECTED, 'Request cancelled');

  await updateRequestStatus(id, 'cancelled', undefined, error);

  await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`);

  scheduleRequestCleanup(id);
}

function scheduleRequestCleanup(id: string): void {}

async function removeRequest(id: string): Promise<void> {
  const store = await getQueueStore();
  store.requests = store.requests.filter((r) => r.id !== id);
  await saveQueueStore(store);
}

export async function handleTabClosed(tabId: number): Promise<void> {
  const store = await getQueueStore();
  const tabRequests = store.requests.filter((r) => r.tabId === tabId && r.status === 'pending');

  for (const request of tabRequests) {
    await cancelRequest(request.id);
  }

  if (tabRequests.length > 0) {
  }
}

export async function handleWalletLocked(): Promise<void> {
  const store = await getQueueStore();
  const pendingReqs = store.requests.filter((r) => r.status === 'pending');

  for (const request of pendingReqs) {
    const error = createEIP1193Error(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet is locked');

    request.status = 'rejected';
    request.error = error;

    await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${request.id}`);
  }

  await saveQueueStore(store);

  if (pendingReqs.length > 0) {
  }
}

export async function handleNetworkSwitch(newChainId: string): Promise<void> {}

export async function cleanupExpiredRequests(): Promise<number> {
  const store = await getQueueStore();
  const now = Date.now();
  let cleanedCount = 0;

  for (const request of store.requests) {
    if (request.status === 'pending' && now - request.createdAt > store.timeoutMs) {
      await expireRequest(request.id);
      cleanedCount++;
    }
  }

  store.requests = store.requests.filter((r) => {
    if (r.status === 'pending') return true;

    return now - r.createdAt < 30000;
  });

  await saveQueueStore(store);

  return cleanedCount;
}

export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  byOrigin: Record<string, number>;
  byType: Record<ApprovalType, number>;
}> {
  const store = await getQueueStore();

  const byOrigin: Record<string, number> = {};
  const byType: Record<ApprovalType, number> = {
    connect: 0,
    sign: 0,
    signMessage: 0,
    transaction: 0,
    switchChain: 0,
    addChain: 0,
  };

  let pending = 0;

  for (const request of store.requests) {
    if (request.status === 'pending') {
      pending++;
      byOrigin[request.origin] = (byOrigin[request.origin] || 0) + 1;
      byType[request.approvalType]++;
    }
  }

  return {
    total: store.requests.length,
    pending,
    byOrigin,
    byType,
  };
}

export function onQueueChange(listener: (queue: QueuedRequest[]) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function notifyListeners(queue: QueuedRequest[]): void {
  for (const listener of changeListeners) {
    try {
      listener(queue);
    } catch (error) {}
  }
}

export async function handleRequestQueueAlarm(alarm: chrome.alarms.Alarm): Promise<boolean> {
  if (alarm.name.startsWith(REQUEST_EXPIRE_ALARM_PREFIX)) {
    const id = alarm.name.substring(REQUEST_EXPIRE_ALARM_PREFIX.length);
    await expireRequest(id);
    return true;
  }

  if (alarm.name === REQUEST_CLEANUP_ALARM) {
    await cleanupExpiredRequests();
    return true;
  }

  return false;
}

export async function initializeRequestQueue(): Promise<void> {
  await cleanupExpiredRequests();

  await chrome.alarms.clear(REQUEST_CLEANUP_ALARM);
  await chrome.alarms.create(REQUEST_CLEANUP_ALARM, {
    periodInMinutes: 1,
  });
}

export { REQUEST_CLEANUP_ALARM };
export type { QueuedRequest };
