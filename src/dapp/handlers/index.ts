/**
 * AINTIVIRUS dApp Connectivity - Background Handlers
 * 
 * This module provides the background service worker handlers for dApp requests.
 * It processes requests from the content script bridge and manages approvals.
 * 
 * SECURITY ARCHITECTURE:
 * - All signing operations happen here (never exposed to inpage)
 * - Permission checks before any sensitive operation
 * - Request queue for user approval flow
 */

import {
  DAppChainType,
  DAppMessageType,
  DAppBackgroundPayloads,
  DAppResponse,
  EVMProviderState,
  SolanaProviderState,
  SitePermission,
  QueuedRequest,
  ApprovalType,
  EIP1193_ERROR_CODES,
  createEIP1193Error,
  requiresApproval,
  getApprovalType,
  toHexChainId,
  fromHexChainId,
} from '../types';
import {
  getPermission,
  setPermission,
  createPermission,
  hasPermission,
  shouldAutoApprove,
  revokePermission,
  revokeAllPermissions,
  getAllPermissions,
  updateLastAccessed,
} from '../permissions/store';
import {
  enqueue,
  getRequest,
  getAllPendingRequests,
  approveRequest,
  rejectRequest,
  cancelRequest,
  handleTabClosed,
  handleWalletLocked,
  initializeRequestQueue,
} from '../queue/requestQueue';
import { APPROVAL_WINDOW } from '../bridge/constants';

// ============================================
// TYPES
// ============================================

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface DAppRequestPayload {
  id: string;
  type: DAppMessageType;
  chainType: DAppChainType;
  method: string;
  params: unknown;
  origin: string;
  tabId: number;
  favicon?: string;
  title?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Storage key for connected tabs (session storage - cleared on browser close) */
const CONNECTED_TABS_KEY = 'dappConnectedTabs';

// ============================================
// STATE
// ============================================

/** Currently open approval window */
let approvalWindowId: number | null = null;

/** 
 * Tab connections for broadcasting events.
 * MV3 COMPLIANCE: This is a cache of persisted state.
 * All mutations must also persist to chrome.storage.session.
 */
let connectedTabsCache = new Map<number, { origin: string; chainType: DAppChainType }>();

// ============================================
// CONNECTED TABS PERSISTENCE
// ============================================

interface ConnectedTabEntry {
  tabId: number;
  origin: string;
  chainType: DAppChainType;
}

/**
 * Load connected tabs from session storage
 */
async function loadConnectedTabs(): Promise<Map<number, { origin: string; chainType: DAppChainType }>> {
  try {
    const result = await chrome.storage.session.get(CONNECTED_TABS_KEY);
    const entries: ConnectedTabEntry[] = result[CONNECTED_TABS_KEY] || [];
    
    const map = new Map<number, { origin: string; chainType: DAppChainType }>();
    for (const entry of entries) {
      map.set(entry.tabId, { origin: entry.origin, chainType: entry.chainType });
    }
    return map;
  } catch (error) {
    console.error('[dApp Handlers] Failed to load connected tabs:', error);
    return new Map();
  }
}

/**
 * Save connected tabs to session storage
 */
async function saveConnectedTabs(tabs: Map<number, { origin: string; chainType: DAppChainType }>): Promise<void> {
  try {
    const entries: ConnectedTabEntry[] = [];
    for (const [tabId, data] of tabs) {
      entries.push({ tabId, ...data });
    }
    await chrome.storage.session.set({ [CONNECTED_TABS_KEY]: entries });
  } catch (error) {
    console.error('[dApp Handlers] Failed to save connected tabs:', error);
  }
}

/**
 * Add a connected tab (persisted)
 */
async function addConnectedTab(tabId: number, origin: string, chainType: DAppChainType): Promise<void> {
  connectedTabsCache.set(tabId, { origin, chainType });
  await saveConnectedTabs(connectedTabsCache);
}

/**
 * Remove a connected tab (persisted)
 */
async function removeConnectedTab(tabId: number): Promise<void> {
  connectedTabsCache.delete(tabId);
  await saveConnectedTabs(connectedTabsCache);
}

/**
 * Clear all connected tabs (persisted)
 */
async function clearConnectedTabs(): Promise<void> {
  connectedTabsCache.clear();
  await saveConnectedTabs(connectedTabsCache);
}

/**
 * Get all connected tabs (from cache)
 */
function getConnectedTabs(): Map<number, { origin: string; chainType: DAppChainType }> {
  return connectedTabsCache;
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize dApp handlers
 * 
 * MV3 COMPLIANCE: Rehydrates connected tabs from session storage.
 */
export async function initializeDAppHandlers(): Promise<void> {
  // Rehydrate connected tabs from storage (MV3: survives SW restart)
  connectedTabsCache = await loadConnectedTabs();
  console.log('[dApp Handlers] Rehydrated', connectedTabsCache.size, 'connected tabs');
  
  // Initialize request queue
  await initializeRequestQueue();
  
  // Listen for tab removal to handle closed tabs
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    handleTabClosed(tabId).catch(console.error);
    await removeConnectedTab(tabId);
  });
  
  // Listen for wallet lock events
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'walletAutoLock') {
      handleWalletLocked().catch(console.error);
    }
  });
  
  console.log('[dApp Handlers] Initialized');
}

// ============================================
// MESSAGE HANDLER
// ============================================

/**
 * Handle incoming dApp messages from content script
 */
export async function handleDAppMessage(
  type: string,
  payload: unknown,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  try {
    switch (type) {
      case 'DAPP_REQUEST':
        return await handleDAppRequest(payload as DAppRequestPayload, sender);
        
      case 'DAPP_APPROVE':
        return await handleDAppApprove(payload as DAppBackgroundPayloads['DAPP_APPROVE']);
        
      case 'DAPP_REJECT':
        return await handleDAppReject(payload as DAppBackgroundPayloads['DAPP_REJECT']);
        
      case 'DAPP_GET_PERMISSIONS':
        return await handleGetPermissions();
        
      case 'DAPP_REVOKE_PERMISSION':
        return await handleRevokePermission(payload as DAppBackgroundPayloads['DAPP_REVOKE_PERMISSION']);
        
      case 'DAPP_REVOKE_ALL_PERMISSIONS':
        return await handleRevokeAllPermissions();
        
      case 'DAPP_GET_PENDING_REQUESTS':
        return await handleGetPendingRequests();
        
      case 'DAPP_CANCEL_REQUEST':
        return await handleCancelRequest(payload as DAppBackgroundPayloads['DAPP_CANCEL_REQUEST']);
        
      case 'DAPP_GET_PROVIDER_STATE':
        return await handleGetProviderState(payload as DAppBackgroundPayloads['DAPP_GET_PROVIDER_STATE']);
        
      case 'GET_TAB_ID':
        return { success: true, data: { tabId: sender.tab?.id } };
        
      case 'DAPP_PAGE_UNLOAD':
        // Handle page unload - cleanup if needed
        const unloadPayload = payload as { tabId: number };
        if (unloadPayload?.tabId) {
          await removeConnectedTab(unloadPayload.tabId);
        }
        return { success: true };
        
      default:
        return { success: false, error: `Unknown dApp message type: ${type}` };
    }
  } catch (error) {
    console.error('[dApp Handlers] Error handling message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// REQUEST HANDLERS
// ============================================

/**
 * Handle incoming dApp request
 */
async function handleDAppRequest(
  payload: DAppRequestPayload,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  const { chainType, method, params, origin, tabId, favicon, title } = payload;
  
  // Track connected tab (persisted for SW restart recovery)
  if (tabId) {
    await addConnectedTab(tabId, origin, chainType);
  }
  
  // Check if method requires approval
  if (!requiresApproval(method, chainType)) {
    // Handle read-only methods directly
    return await handleReadOnlyMethod(chainType, method, params);
  }
  
  // Check if already has permission and auto-approve is enabled
  const hasExistingPermission = await hasPermission(origin, chainType);
  const autoApprove = await shouldAutoApprove(origin, chainType);
  
  // For connect requests, check if already connected
  if (method === 'eth_requestAccounts' || method === 'connect') {
    if (hasExistingPermission && autoApprove) {
      // Update last accessed and return cached accounts
      await updateLastAccessed(origin, chainType);
      const permission = await getPermission(origin, chainType);
      
      if (chainType === 'evm') {
        return { success: true, data: permission?.accounts || [] };
      } else {
        return { success: true, data: { publicKey: permission?.accounts[0] } };
      }
    }
  }
  
  // For signing/transaction requests, verify permission first
  if (hasExistingPermission) {
    // Check if wallet is unlocked
    const walletState = await getWalletState();
    if (!walletState.isUnlocked) {
      return {
        success: false,
        error: 'Wallet is locked. Please unlock to continue.',
      };
    }
    
    // For transactions and signing, still show approval UI
    // unless we add a "trust this site for transactions" option
  }
  
  // Enqueue request for approval
  // MV3: enqueue returns nonce for response validation (used by content bridge)
  const { id, nonce, promise } = await enqueue({
    origin,
    tabId,
    chainType,
    method,
    params,
    favicon,
    title,
  });
  
  // Store nonce for response validation (content script will verify)
  console.debug('[dApp Handlers] Request queued with nonce:', id, nonce.substring(0, 8) + '...');
  
  // Open approval window
  await openApprovalWindow(id);
  
  try {
    // Wait for user decision
    const result = await promise;
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

/**
 * Handle read-only RPC methods
 */
async function handleReadOnlyMethod(
  chainType: DAppChainType,
  method: string,
  params: unknown
): Promise<MessageResponse> {
  // These methods can be handled without user approval
  // They should proxy to the appropriate RPC endpoint
  
  if (chainType === 'evm') {
    return await handleEVMReadOnlyMethod(method, params);
  } else {
    return await handleSolanaReadOnlyMethod(method, params);
  }
}

/**
 * Handle EVM read-only methods
 */
async function handleEVMReadOnlyMethod(
  method: string,
  params: unknown
): Promise<MessageResponse> {
  // Import EVM adapter
  // These would normally proxy to the configured RPC endpoint
  try {
    // For now, return appropriate responses for common methods
    switch (method) {
      case '_getProviderState':
        return await handleGetProviderState({ chainType: 'evm', origin: '' });
        
      default:
        // Proxy to RPC - would need to implement RPC forwarding
        return { success: false, error: 'RPC forwarding not yet implemented' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'RPC call failed',
    };
  }
}

/**
 * Handle Solana read-only methods
 */
async function handleSolanaReadOnlyMethod(
  method: string,
  params: unknown
): Promise<MessageResponse> {
  try {
    switch (method) {
      case '_getProviderState':
        return await handleGetProviderState({ chainType: 'solana', origin: '' });
        
      default:
        return { success: false, error: 'Method not supported' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'RPC call failed',
    };
  }
}

/**
 * Handle approval from UI
 */
async function handleDAppApprove(
  payload: DAppBackgroundPayloads['DAPP_APPROVE']
): Promise<MessageResponse> {
  const { requestId, selectedAccounts, remember } = payload;
  
  // Get the request
  const request = await getRequest(requestId);
  if (!request) {
    return { success: false, error: 'Request not found' };
  }
  
  // Process based on approval type
  let result: unknown;
  
  try {
    switch (request.approvalType) {
      case 'connect':
        result = await processConnectApproval(request, selectedAccounts || [], remember || false);
        break;
        
      case 'signMessage':
        result = await processSignMessageApproval(request);
        break;
        
      case 'sign':
        result = await processSignApproval(request);
        break;
        
      case 'transaction':
        result = await processTransactionApproval(request);
        break;
        
      case 'switchChain':
        result = await processSwitchChainApproval(request);
        break;
        
      case 'addChain':
        result = await processAddChainApproval(request);
        break;
        
      default:
        throw new Error(`Unknown approval type: ${request.approvalType}`);
    }
    
    // Approve the request with result
    await approveRequest(requestId, result);
    
    // Close approval window
    await closeApprovalWindow();
    
    return { success: true, data: result };
  } catch (error) {
    await rejectRequest(requestId, error instanceof Error ? error.message : 'Processing failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    };
  }
}

/**
 * Handle rejection from UI
 */
async function handleDAppReject(
  payload: DAppBackgroundPayloads['DAPP_REJECT']
): Promise<MessageResponse> {
  const { requestId, reason } = payload;
  
  await rejectRequest(requestId, reason);
  await closeApprovalWindow();
  
  return { success: true };
}

// ============================================
// APPROVAL PROCESSORS
// ============================================

/**
 * Process connect approval
 */
async function processConnectApproval(
  request: QueuedRequest,
  selectedAccounts: string[],
  remember: boolean
): Promise<unknown> {
  const { origin, chainType } = request;
  
  if (selectedAccounts.length === 0) {
    throw new Error('No accounts selected');
  }
  
  // Create or update permission
  await createPermission(
    origin,
    chainType,
    selectedAccounts,
    chainType === 'evm' ? ['0x1'] : ['mainnet-beta'], // Default chains
    remember
  );
  
  // Track connection (persisted)
  if (request.tabId) {
    await addConnectedTab(request.tabId, origin, chainType);
  }
  
  // Return appropriate response
  if (chainType === 'evm') {
    return selectedAccounts; // eth_requestAccounts returns accounts array
  } else {
    return { publicKey: selectedAccounts[0] }; // Solana returns publicKey
  }
}

/**
 * Process sign message approval
 */
async function processSignMessageApproval(request: QueuedRequest): Promise<unknown> {
  const { chainType, params } = request;
  
  if (chainType === 'evm') {
    // For personal_sign, params are [message, address]
    const [message, address] = params as [string, string];
    
    // Sign using wallet module
    const result = await signEVMMessage(message, address);
    return result;
  } else {
    // For Solana signMessage
    const { message } = params as { message: string };
    const result = await signSolanaMessage(message);
    return result;
  }
}

/**
 * Process sign approval (transactions)
 */
async function processSignApproval(request: QueuedRequest): Promise<unknown> {
  const { chainType, params } = request;
  
  if (chainType === 'solana') {
    const { transaction, transactions } = params as { 
      transaction?: { data: string; isVersioned: boolean };
      transactions?: { data: string; isVersioned: boolean }[];
    };
    
    if (transactions) {
      // signAllTransactions
      const signedTxs = await signSolanaTransactions(transactions);
      return { signedTransactions: signedTxs };
    } else if (transaction) {
      // signTransaction
      const signedTx = await signSolanaTransaction(transaction);
      return { signedTransaction: signedTx };
    }
    
    throw new Error('No transaction provided');
  }
  
  throw new Error('Sign not supported for this chain type');
}

/**
 * Process transaction approval
 */
async function processTransactionApproval(request: QueuedRequest): Promise<unknown> {
  const { chainType, params } = request;
  
  if (chainType === 'evm') {
    // eth_sendTransaction
    const txParams = (params as unknown[])[0] as { 
      from: string;
      to?: string;
      value?: string;
      data?: string;
      gas?: string;
    };
    
    const result = await sendEVMTransaction(txParams);
    return result;
  } else {
    // signAndSendTransaction
    const { transaction, options } = params as {
      transaction: { data: string; isVersioned: boolean };
      options?: { skipPreflight?: boolean };
    };
    
    const result = await signAndSendSolanaTransaction(transaction, options);
    return result;
  }
}

/**
 * Process switch chain approval
 */
async function processSwitchChainApproval(request: QueuedRequest): Promise<null> {
  const { params } = request;
  const { chainId } = (params as unknown[])[0] as { chainId: string };
  
  // Switch the active chain in wallet settings
  // This would update the wallet's active EVM chain
  console.log('[dApp Handlers] Switching to chain:', chainId);
  
  // Broadcast chain changed event to all connected tabs
  await broadcastChainChanged(chainId);
  
  return null;
}

/**
 * Process add chain approval
 */
async function processAddChainApproval(request: QueuedRequest): Promise<null> {
  const { params } = request;
  const chainParams = (params as unknown[])[0] as {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
  };
  
  // Add the chain to wallet configuration
  // This would need to integrate with the wallet's chain management
  console.log('[dApp Handlers] Adding chain:', chainParams.chainName);
  
  return null;
}

// ============================================
// SIGNING IMPLEMENTATIONS
// ============================================

/**
 * Sign an EVM message
 */
async function signEVMMessage(message: string, address: string): Promise<string> {
  // Use wallet module to sign
  // This integrates with the existing wallet signing infrastructure
  const response = await chrome.runtime.sendMessage({
    type: 'WALLET_SIGN_MESSAGE',
    payload: { message, address, chainType: 'evm' },
  });
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to sign message');
  }
  
  return response.data.signature;
}

/**
 * Sign a Solana message
 */
async function signSolanaMessage(messageBase64: string): Promise<{ signature: string }> {
  // Decode base64 message
  const message = atob(messageBase64);
  
  const response = await chrome.runtime.sendMessage({
    type: 'WALLET_SIGN_MESSAGE',
    payload: { message },
  });
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to sign message');
  }
  
  return { signature: response.data.signature };
}

/**
 * Sign a Solana transaction
 */
async function signSolanaTransaction(
  transaction: { data: string; isVersioned: boolean }
): Promise<string> {
  const response = await chrome.runtime.sendMessage({
    type: 'WALLET_SIGN_TRANSACTION',
    payload: { serializedTransaction: transaction.data },
  });
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to sign transaction');
  }
  
  return response.data.signedTransaction;
}

/**
 * Sign multiple Solana transactions
 */
async function signSolanaTransactions(
  transactions: { data: string; isVersioned: boolean }[]
): Promise<string[]> {
  const results: string[] = [];
  
  for (const tx of transactions) {
    const signed = await signSolanaTransaction(tx);
    results.push(signed);
  }
  
  return results;
}

/**
 * Send an EVM transaction
 */
async function sendEVMTransaction(txParams: {
  from: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
}): Promise<string> {
  const response = await chrome.runtime.sendMessage({
    type: 'WALLET_SEND_ETH',
    payload: {
      recipient: txParams.to || '',
      amount: txParams.value ? (parseInt(txParams.value, 16) / 1e18).toString() : '0',
    },
  });
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to send transaction');
  }
  
  return response.data.hash;
}

/**
 * Sign and send a Solana transaction
 */
async function signAndSendSolanaTransaction(
  transaction: { data: string; isVersioned: boolean },
  options?: { skipPreflight?: boolean }
): Promise<{ signature: string }> {
  // For now, sign then send separately
  // A full implementation would use sendTransaction
  const signedTx = await signSolanaTransaction(transaction);
  
  // The wallet module would handle sending
  // For now return the signature
  return { signature: signedTx };
}

// ============================================
// PERMISSION HANDLERS
// ============================================

async function handleGetPermissions(): Promise<MessageResponse> {
  const permissions = await getAllPermissions();
  return { success: true, data: permissions };
}

async function handleRevokePermission(
  payload: DAppBackgroundPayloads['DAPP_REVOKE_PERMISSION']
): Promise<MessageResponse> {
  await revokePermission(payload.origin, payload.chainType);
  return { success: true };
}

async function handleRevokeAllPermissions(): Promise<MessageResponse> {
  await revokeAllPermissions();
  return { success: true };
}

async function handleGetPendingRequests(): Promise<MessageResponse> {
  const requests = await getAllPendingRequests();
  return { success: true, data: requests };
}

async function handleCancelRequest(
  payload: DAppBackgroundPayloads['DAPP_CANCEL_REQUEST']
): Promise<MessageResponse> {
  await cancelRequest(payload.requestId);
  return { success: true };
}

async function handleGetProviderState(
  payload: DAppBackgroundPayloads['DAPP_GET_PROVIDER_STATE']
): Promise<MessageResponse> {
  const { chainType, origin } = payload;
  
  // Get wallet state
  const walletResponse = await chrome.runtime.sendMessage({
    type: 'WALLET_GET_STATE',
    payload: undefined,
  });
  
  if (!walletResponse.success) {
    return { success: false, error: 'Failed to get wallet state' };
  }
  
  const walletState = walletResponse.data;
  
  // Check if origin has permission
  const permission = origin ? await getPermission(origin, chainType) : null;
  
  if (chainType === 'evm') {
    const state: EVMProviderState = {
      isConnected: !!permission,
      chainId: toHexChainId(walletState.activeEVMChain === 'ethereum' ? 1 : 137),
      accounts: permission?.accounts || [],
      networkVersion: '1',
    };
    return { success: true, data: state };
  } else {
    const state: SolanaProviderState = {
      isConnected: !!permission,
      publicKey: permission?.accounts[0] || null,
      network: walletState.network || 'mainnet-beta',
    };
    return { success: true, data: state };
  }
}

// ============================================
// APPROVAL WINDOW
// ============================================

/**
 * Open the approval window
 */
async function openApprovalWindow(requestId: string): Promise<void> {
  // Close existing window if any
  await closeApprovalWindow();
  
  // Create new approval window
  const window = await chrome.windows.create({
    url: chrome.runtime.getURL(`approval.html?requestId=${requestId}`),
    type: APPROVAL_WINDOW.TYPE,
    width: APPROVAL_WINDOW.WIDTH,
    height: APPROVAL_WINDOW.HEIGHT,
    focused: true,
  });
  
  if (window.id) {
    approvalWindowId = window.id;
    
    // Listen for window close
    chrome.windows.onRemoved.addListener(function listener(windowId) {
      if (windowId === approvalWindowId) {
        approvalWindowId = null;
        chrome.windows.onRemoved.removeListener(listener);
        
        // If window was closed without decision, reject the request
        getRequest(requestId).then(request => {
          if (request && request.status === 'pending') {
            rejectRequest(requestId, 'User closed approval window');
          }
        });
      }
    });
  }
}

/**
 * Close the approval window
 */
async function closeApprovalWindow(): Promise<void> {
  if (approvalWindowId !== null) {
    try {
      await chrome.windows.remove(approvalWindowId);
    } catch {
      // Window might already be closed
    }
    approvalWindowId = null;
  }
}

// ============================================
// EVENT BROADCASTING
// ============================================

/**
 * Broadcast chain changed event to all connected tabs
 * MV3 COMPLIANCE: Uses persisted connected tabs cache.
 */
async function broadcastChainChanged(chainId: string): Promise<void> {
  const tabs = getConnectedTabs();
  const tabsToRemove: number[] = [];
  
  for (const [tabId, connection] of tabs) {
    if (connection.chainType === 'evm') {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'DAPP_BROADCAST_EVENT',
          payload: {
            type: 'EVM_CHAIN_CHANGED',
            chainType: 'evm',
            data: { chainId },
          },
        });
      } catch {
        // Tab might be closed - mark for removal
        tabsToRemove.push(tabId);
      }
    }
  }
  
  // Remove dead tabs
  for (const tabId of tabsToRemove) {
    await removeConnectedTab(tabId);
  }
}

/**
 * Broadcast accounts changed event to all connected tabs
 * MV3 COMPLIANCE: Uses persisted connected tabs cache.
 */
export async function broadcastAccountsChanged(accounts: string[]): Promise<void> {
  const tabs = getConnectedTabs();
  const tabsToRemove: number[] = [];
  
  for (const [tabId, connection] of tabs) {
    try {
      if (connection.chainType === 'evm') {
        await chrome.tabs.sendMessage(tabId, {
          type: 'DAPP_BROADCAST_EVENT',
          payload: {
            type: 'EVM_ACCOUNTS_CHANGED',
            chainType: 'evm',
            data: { accounts },
          },
        });
      } else {
        await chrome.tabs.sendMessage(tabId, {
          type: 'DAPP_BROADCAST_EVENT',
          payload: {
            type: 'SOLANA_CONNECT',
            chainType: 'solana',
            data: { publicKey: accounts[0] },
          },
        });
      }
    } catch {
      tabsToRemove.push(tabId);
    }
  }
  
  // Remove dead tabs
  for (const tabId of tabsToRemove) {
    await removeConnectedTab(tabId);
  }
}

/**
 * Broadcast disconnect event to all connected tabs
 * MV3 COMPLIANCE: Uses persisted connected tabs cache.
 */
export async function broadcastDisconnect(): Promise<void> {
  const tabs = getConnectedTabs();
  
  for (const [tabId, connection] of tabs) {
    try {
      if (connection.chainType === 'evm') {
        await chrome.tabs.sendMessage(tabId, {
          type: 'DAPP_BROADCAST_EVENT',
          payload: {
            type: 'EVM_DISCONNECT',
            chainType: 'evm',
            data: {},
          },
        });
      } else {
        await chrome.tabs.sendMessage(tabId, {
          type: 'DAPP_BROADCAST_EVENT',
          payload: {
            type: 'SOLANA_DISCONNECT',
            chainType: 'solana',
            data: {},
          },
        });
      }
    } catch {
      // Tab might be closed - will be cleaned up below
    }
  }
  
  // Clear all connected tabs (persisted)
  await clearConnectedTabs();
}

// ============================================
// HELPERS
// ============================================

/**
 * Get wallet state from wallet module
 */
async function getWalletState(): Promise<{ isUnlocked: boolean }> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'WALLET_GET_STATE',
      payload: undefined,
    });
    
    if (response.success && response.data) {
      return {
        isUnlocked: response.data.lockState === 'unlocked',
      };
    }
  } catch {
    // Ignore errors
  }
  
  return { isUnlocked: false };
}

// ============================================
// ADDITIONAL EXPORTS
// ============================================

export {
  broadcastChainChanged,
  handleTabClosed as handleDAppTabClosed,
  handleWalletLocked as handleDAppWalletLocked,
};
