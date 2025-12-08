/**
 * AINTIVIRUS dApp Connectivity - Request Queue Manager
 * 
 * Manages pending dApp requests with FIFO ordering and persistence.
 * Handles multiple simultaneous requests across tabs with deterministic ordering.
 * 
 * MV3 COMPLIANCE:
 * - NO in-memory state for correctness (service worker can terminate anytime)
 * - All state persisted to chrome.storage.session
 * - Uses chrome.alarms for expiration (not setTimeout)
 * - Polling-based resolution after SW restart
 * 
 * FEATURES:
 * - FIFO ordering per origin
 * - Global queue view for UI
 * - Persistence via chrome.storage.session
 * - Request expiration via chrome.alarms
 * - Multi-tab handling
 * - Wallet lock handling
 * - Nonce-based response validation
 */

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

// ============================================
// CONSTANTS
// ============================================

const REQUEST_QUEUE_VERSION = 2; // Bumped for schema change
const REQUEST_CLEANUP_ALARM = 'dappRequestCleanup';
const REQUEST_EXPIRE_ALARM_PREFIX = 'dappRequestExpire:';
const POLL_RESOLUTION_INTERVAL_MS = 100; // Polling interval for waiting on resolution
const MAX_POLL_ATTEMPTS = 3000; // 5 minutes max wait (3000 * 100ms)

// ============================================
// STATE
// ============================================

/** Event listeners for queue changes (in-memory, non-critical) */
const changeListeners = new Set<(queue: QueuedRequest[]) => void>();

// ============================================
// STORAGE
// ============================================

/**
 * Get the request queue from session storage
 * Uses session storage so queue is cleared on browser close
 */
async function getQueueStore(): Promise<RequestQueueStore> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEYS.REQUEST_QUEUE);
    const store = result[STORAGE_KEYS.REQUEST_QUEUE] as RequestQueueStore | undefined;
    
    if (!store || store.version !== REQUEST_QUEUE_VERSION) {
      return createDefaultQueueStore();
    }
    
    return store;
  } catch (error) {
    console.error('[Request Queue] Failed to get store:', error);
    return createDefaultQueueStore();
  }
}

/**
 * Save the request queue to session storage
 */
async function saveQueueStore(store: RequestQueueStore): Promise<void> {
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.REQUEST_QUEUE]: store });
    notifyListeners(store.requests);
  } catch (error) {
    console.error('[Request Queue] Failed to save store:', error);
    throw error;
  }
}

/**
 * Create a default empty queue store
 */
function createDefaultQueueStore(): RequestQueueStore {
  return {
    version: REQUEST_QUEUE_VERSION,
    requests: [],
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  };
}

// ============================================
// QUEUE OPERATIONS
// ============================================

/**
 * Add a new request to the queue
 * 
 * MV3 COMPLIANCE:
 * - Uses chrome.alarms for expiration (not setTimeout)
 * - Returns polling-based promise that survives SW restart
 * - All state is persisted to storage
 */
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
  
  // Generate unique ID and secure nonce
  const id = generateRequestId();
  const nonce = generateSecureNonce();
  const now = Date.now();
  const expiresAt = now + store.timeoutMs;
  
  // Determine approval type
  const approvalType = getApprovalType(request.method, request.chainType);
  
  // Create queued request with MV3-safe fields
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
  
  // Check for duplicate requests (same origin, method, params)
  const isDuplicate = store.requests.some(r => 
    r.origin === request.origin &&
    r.method === request.method &&
    r.status === 'pending' &&
    JSON.stringify(r.params) === JSON.stringify(request.params)
  );
  
  if (isDuplicate) {
    console.log('[Request Queue] Duplicate request detected, skipping:', request.method);
    // Continue anyway - the duplicate check is informational
  }
  
  // Add to queue (FIFO - add to end)
  store.requests.push(queuedRequest);
  await saveQueueStore(store);
  
  // Set up expiration alarm (MV3-safe, survives SW termination)
  await chrome.alarms.create(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`, {
    when: expiresAt,
  });
  
  console.log('[Request Queue] Request enqueued:', id, request.method);
  
  // Create polling-based promise that survives SW restart
  // This polls storage for resolution instead of relying on in-memory callbacks
  const promise = pollForResolution(id, expiresAt);
  
  return { id, nonce, promise };
}

/**
 * Poll storage for request resolution.
 * MV3 COMPLIANCE: Works across service worker restarts.
 * 
 * @param id - Request ID to poll for
 * @param expiresAt - Absolute expiration timestamp
 * @returns Promise that resolves with result or rejects with error
 */
async function pollForResolution(id: string, expiresAt: number): Promise<unknown> {
  let attempts = 0;
  
  while (attempts < MAX_POLL_ATTEMPTS) {
    // Check if expired
    if (Date.now() > expiresAt) {
      throw createErrorWithCode(
        EIP1193_ERROR_CODES.INTERNAL_ERROR,
        'Request timed out'
      );
    }
    
    // Get current request state from storage
    const request = await getRequest(id);
    
    if (!request) {
      throw createErrorWithCode(
        EIP1193_ERROR_CODES.INTERNAL_ERROR,
        'Request not found'
      );
    }
    
    // Check if resolved
    switch (request.status) {
      case 'approved':
        return request.result;
        
      case 'rejected':
      case 'cancelled':
        throw createErrorWithCode(
          request.error?.code || EIP1193_ERROR_CODES.USER_REJECTED,
          request.error?.message || 'User rejected the request'
        );
        
      case 'expired':
        throw createErrorWithCode(
          EIP1193_ERROR_CODES.INTERNAL_ERROR,
          'Request timed out'
        );
        
      case 'pending':
        // Still pending, continue polling
        break;
    }
    
    // Wait before next poll
    await sleep(POLL_RESOLUTION_INTERVAL_MS);
    attempts++;
  }
  
  throw createErrorWithCode(
    EIP1193_ERROR_CODES.INTERNAL_ERROR,
    'Request timed out'
  );
}

/**
 * Helper to create Error with code property
 */
function createErrorWithCode(code: number, message: string): Error & { code: number } {
  const err = new Error(message) as Error & { code: number };
  err.code = code;
  return err;
}

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get a specific request by ID
 */
export async function getRequest(id: string): Promise<QueuedRequest | null> {
  const store = await getQueueStore();
  return store.requests.find(r => r.id === id) || null;
}

/**
 * Get the next pending request for an origin (FIFO)
 */
export async function getNextPendingForOrigin(origin: string): Promise<QueuedRequest | null> {
  const store = await getQueueStore();
  return store.requests.find(r => 
    r.origin === origin && 
    r.status === 'pending'
  ) || null;
}

/**
 * Get all pending requests
 */
export async function getAllPendingRequests(): Promise<QueuedRequest[]> {
  const store = await getQueueStore();
  return store.requests.filter(r => r.status === 'pending');
}

/**
 * Get pending requests for a specific origin
 */
export async function getPendingRequestsByOrigin(origin: string): Promise<QueuedRequest[]> {
  const store = await getQueueStore();
  return store.requests.filter(r => 
    r.origin === origin && 
    r.status === 'pending'
  );
}

/**
 * Get pending requests for a specific tab
 */
export async function getPendingRequestsByTab(tabId: number): Promise<QueuedRequest[]> {
  const store = await getQueueStore();
  return store.requests.filter(r => 
    r.tabId === tabId && 
    r.status === 'pending'
  );
}

/**
 * Update request status
 */
async function updateRequestStatus(
  id: string,
  status: QueuedRequestStatus,
  result?: unknown,
  error?: DAppError
): Promise<boolean> {
  const store = await getQueueStore();
  const index = store.requests.findIndex(r => r.id === id);
  
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

/**
 * Approve a request
 * 
 * MV3 COMPLIANCE: Just updates storage. The polling promise will pick up the change.
 * Idempotent - safe to call multiple times (double-approve safe).
 */
export async function approveRequest(id: string, result: unknown): Promise<void> {
  const request = await getRequest(id);
  
  // Idempotent: if already resolved, do nothing
  if (!request || request.status !== 'pending') {
    console.log('[Request Queue] Request already resolved or not found:', id);
    return;
  }
  
  await updateRequestStatus(id, 'approved', result);
  
  // Clear the expiration alarm
  await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`);
  
  // Schedule cleanup (use alarm since we can't rely on setTimeout)
  scheduleRequestCleanup(id);
  
  console.log('[Request Queue] Request approved:', id);
}

/**
 * Reject a request
 * 
 * MV3 COMPLIANCE: Just updates storage. The polling promise will pick up the change.
 * Idempotent - safe to call multiple times.
 */
export async function rejectRequest(id: string, reason?: string): Promise<void> {
  const request = await getRequest(id);
  
  // Idempotent: if already resolved, do nothing
  if (!request || request.status !== 'pending') {
    console.log('[Request Queue] Request already resolved or not found:', id);
    return;
  }
  
  const error = createEIP1193Error(
    EIP1193_ERROR_CODES.USER_REJECTED,
    reason || 'User rejected the request'
  );
  
  await updateRequestStatus(id, 'rejected', undefined, error);
  
  // Clear the expiration alarm
  await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`);
  
  // Schedule cleanup
  scheduleRequestCleanup(id);
  
  console.log('[Request Queue] Request rejected:', id);
}

/**
 * Expire a request due to timeout
 * 
 * Called by the alarm handler when request expires.
 */
async function expireRequest(id: string): Promise<void> {
  const request = await getRequest(id);
  
  // Idempotent: if already resolved, do nothing
  if (!request || request.status !== 'pending') {
    return;
  }
  
  const error = createEIP1193Error(
    EIP1193_ERROR_CODES.INTERNAL_ERROR,
    'Request timed out'
  );
  
  await updateRequestStatus(id, 'expired', undefined, error);
  
  // Schedule cleanup
  scheduleRequestCleanup(id);
  
  console.log('[Request Queue] Request expired:', id);
}

/**
 * Cancel a request
 */
export async function cancelRequest(id: string): Promise<void> {
  const request = await getRequest(id);
  
  // Idempotent: if already resolved, do nothing
  if (!request || request.status !== 'pending') {
    console.log('[Request Queue] Request already resolved or not found:', id);
    return;
  }
  
  const error = createEIP1193Error(
    EIP1193_ERROR_CODES.USER_REJECTED,
    'Request cancelled'
  );
  
  await updateRequestStatus(id, 'cancelled', undefined, error);
  
  // Clear the expiration alarm
  await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${id}`);
  
  // Schedule cleanup
  scheduleRequestCleanup(id);
  
  console.log('[Request Queue] Request cancelled:', id);
}

/**
 * Schedule a request for cleanup after a delay
 * Uses the periodic cleanup alarm rather than setTimeout
 */
function scheduleRequestCleanup(id: string): void {
  // The periodic cleanup alarm will handle this
  // Resolved requests are kept for 30 seconds for debugging
  console.debug('[Request Queue] Request cleanup scheduled:', id);
}

/**
 * Remove a request from the queue
 */
async function removeRequest(id: string): Promise<void> {
  const store = await getQueueStore();
  store.requests = store.requests.filter(r => r.id !== id);
  await saveQueueStore(store);
}

// ============================================
// EDGE CASE HANDLERS
// ============================================

/**
 * Handle tab closed - reject all pending requests for that tab
 */
export async function handleTabClosed(tabId: number): Promise<void> {
  const store = await getQueueStore();
  const tabRequests = store.requests.filter(r => 
    r.tabId === tabId && 
    r.status === 'pending'
  );
  
  for (const request of tabRequests) {
    await cancelRequest(request.id);
  }
  
  if (tabRequests.length > 0) {
    console.log('[Request Queue] Cancelled', tabRequests.length, 'requests for closed tab:', tabId);
  }
}

/**
 * Handle wallet locked - reject all pending requests
 * 
 * MV3 COMPLIANCE: Only updates storage, polling promises will pick up changes.
 */
export async function handleWalletLocked(): Promise<void> {
  const store = await getQueueStore();
  const pendingReqs = store.requests.filter(r => r.status === 'pending');
  
  for (const request of pendingReqs) {
    const error = createEIP1193Error(
      EIP1193_ERROR_CODES.UNAUTHORIZED,
      'Wallet is locked'
    );
    
    // Update status (polling will pick this up)
    request.status = 'rejected';
    request.error = error;
    
    // Clear the expiration alarm
    await chrome.alarms.clear(`${REQUEST_EXPIRE_ALARM_PREFIX}${request.id}`);
  }
  
  // Save updated store
  await saveQueueStore(store);
  
  if (pendingReqs.length > 0) {
    console.log('[Request Queue] Rejected', pendingReqs.length, 'requests due to wallet lock');
  }
}

/**
 * Handle network switch - optionally reject pending transaction requests
 */
export async function handleNetworkSwitch(newChainId: string): Promise<void> {
  // For now, we allow requests to continue after network switch
  // Transaction requests will be validated at signing time
  console.log('[Request Queue] Network switched to:', newChainId);
}

/**
 * Clean up expired requests
 */
export async function cleanupExpiredRequests(): Promise<number> {
  const store = await getQueueStore();
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const request of store.requests) {
    if (
      request.status === 'pending' &&
      now - request.createdAt > store.timeoutMs
    ) {
      await expireRequest(request.id);
      cleanedCount++;
    }
  }
  
  // Also clean up old completed/rejected/expired requests
  store.requests = store.requests.filter(r => {
    if (r.status === 'pending') return true;
    // Keep non-pending requests for 30 seconds for debugging
    return now - r.createdAt < 30000;
  });
  
  await saveQueueStore(store);
  
  return cleanedCount;
}

// ============================================
// QUEUE STATISTICS
// ============================================

/**
 * Get queue statistics
 */
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

// ============================================
// EVENT LISTENERS
// ============================================

/**
 * Add a listener for queue changes
 */
export function onQueueChange(listener: (queue: QueuedRequest[]) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/**
 * Notify all listeners of queue change
 */
function notifyListeners(queue: QueuedRequest[]): void {
  for (const listener of changeListeners) {
    try {
      listener(queue);
    } catch (error) {
      console.error('[Request Queue] Listener error:', error);
    }
  }
}

// ============================================
// ALARM HANDLERS
// ============================================

/**
 * Handle chrome.alarms for request expiration and cleanup.
 * Must be called from background script's alarm listener.
 * 
 * @param alarm - Chrome alarm that fired
 * @returns true if this alarm was handled by request queue
 */
export async function handleRequestQueueAlarm(alarm: chrome.alarms.Alarm): Promise<boolean> {
  // Handle individual request expiration
  if (alarm.name.startsWith(REQUEST_EXPIRE_ALARM_PREFIX)) {
    const id = alarm.name.substring(REQUEST_EXPIRE_ALARM_PREFIX.length);
    await expireRequest(id);
    return true;
  }
  
  // Handle periodic cleanup
  if (alarm.name === REQUEST_CLEANUP_ALARM) {
    await cleanupExpiredRequests();
    return true;
  }
  
  return false;
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the request queue
 * 
 * MV3 COMPLIANCE: Uses chrome.alarms for periodic cleanup instead of setInterval.
 */
export async function initializeRequestQueue(): Promise<void> {
  // Clean up any stale requests from previous session
  await cleanupExpiredRequests();
  
  // Set up periodic cleanup alarm (MV3-safe, survives SW termination)
  // Clear existing alarm first to avoid duplicates
  await chrome.alarms.clear(REQUEST_CLEANUP_ALARM);
  await chrome.alarms.create(REQUEST_CLEANUP_ALARM, {
    periodInMinutes: 1, // MV3 minimum is 1 minute
  });
  
  console.log('[Request Queue] Initialized with MV3-compliant alarms');
}

// ============================================
// EXPORTS
// ============================================

export { REQUEST_CLEANUP_ALARM };
export type { QueuedRequest };
