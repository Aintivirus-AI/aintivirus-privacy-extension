/**
 * AINTIVIRUS dApp Connectivity Module
 * 
 * This module provides dApp connectivity for the wallet extension.
 * Exports all handlers and types needed by other modules.
 */

// Types
export * from './types';

// Handlers
export {
  initializeDAppHandlers,
  broadcastAccountsChanged,
  broadcastChainChanged,
  broadcastDisconnect,
} from './handlers';

// Permission Store
export {
  getPermission,
  setPermission,
  createPermission,
  revokePermission,
  revokeAllPermissions,
  getAllPermissions,
  hasPermission,
  hasAccountPermission,
  shouldAutoApprove,
  getPermissionSettings,
  updatePermissionSettings,
} from './permissions/store';

// Request Queue
export {
  enqueue,
  getRequest,
  getAllPendingRequests,
  approveRequest,
  rejectRequest,
  cancelRequest,
  handleTabClosed,
  handleWalletLocked,
  initializeRequestQueue,
  onQueueChange,
  getQueueStats,
} from './queue/requestQueue';

// Content Bridge (for content script)
export {
  initializeDAppBridge,
  injectDAppScript,
} from './bridge/contentBridge';
