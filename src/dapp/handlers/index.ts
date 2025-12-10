

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
import { preloadCommonSelectors } from '../../decoding';


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


const CONNECTED_TABS_KEY = 'dappConnectedTabs';


let approvalWindowId: number | null = null;


let connectedTabsCache = new Map<number, { origin: string; chainType: DAppChainType }>();


interface ConnectedTabEntry {
  tabId: number;
  origin: string;
  chainType: DAppChainType;
}


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

    return new Map();
  }
}


async function saveConnectedTabs(tabs: Map<number, { origin: string; chainType: DAppChainType }>): Promise<void> {
  try {
    const entries: ConnectedTabEntry[] = [];
    for (const [tabId, data] of tabs) {
      entries.push({ tabId, ...data });
    }
    await chrome.storage.session.set({ [CONNECTED_TABS_KEY]: entries });
  } catch (error) {

  }
}


async function addConnectedTab(tabId: number, origin: string, chainType: DAppChainType): Promise<void> {
  connectedTabsCache.set(tabId, { origin, chainType });
  await saveConnectedTabs(connectedTabsCache);
}


async function removeConnectedTab(tabId: number): Promise<void> {
  connectedTabsCache.delete(tabId);
  await saveConnectedTabs(connectedTabsCache);
}


async function clearConnectedTabs(): Promise<void> {
  connectedTabsCache.clear();
  await saveConnectedTabs(connectedTabsCache);
}


function getConnectedTabs(): Map<number, { origin: string; chainType: DAppChainType }> {
  return connectedTabsCache;
}


export async function initializeDAppHandlers(): Promise<void> {
  
  connectedTabsCache = await loadConnectedTabs();

  
  await initializeRequestQueue();
  
  
  preloadCommonSelectors();

  
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    handleTabClosed(tabId).catch(() => {});
    await removeConnectedTab(tabId);
  });
  
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'walletAutoLock') {
      handleWalletLocked().catch(() => {});
    }
  });

}


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
        
        const unloadPayload = payload as { tabId: number };
        if (unloadPayload?.tabId) {
          await removeConnectedTab(unloadPayload.tabId);
        }
        return { success: true };
        
      default:
        return { success: false, error: `Unknown dApp message type: ${type}` };
    }
  } catch (error) {

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}


async function handleDAppRequest(
  payload: DAppRequestPayload,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  const { chainType, method, params, origin, tabId, favicon, title } = payload;
  
  
  if (tabId) {
    await addConnectedTab(tabId, origin, chainType);
  }
  
  
  if (!requiresApproval(method, chainType)) {
    
    return await handleReadOnlyMethod(chainType, method, params);
  }
  
  
  const hasExistingPermission = await hasPermission(origin, chainType);
  const autoApprove = await shouldAutoApprove(origin, chainType);
  
  
  if (method === 'eth_requestAccounts' || method === 'connect') {
    if (hasExistingPermission && autoApprove) {
      
      await updateLastAccessed(origin, chainType);
      const permission = await getPermission(origin, chainType);
      
      if (chainType === 'evm') {
        return { success: true, data: permission?.accounts || [] };
      } else {
        return { success: true, data: { publicKey: permission?.accounts[0] } };
      }
    }
  }
  
  
  if (hasExistingPermission) {
    
    const walletState = await getWalletState();
    if (!walletState.isUnlocked) {
      return {
        success: false,
        error: 'Wallet is locked. Please unlock to continue.',
      };
    }
    
    
  }
  
  
  const { id, nonce, promise } = await enqueue({
    origin,
    tabId,
    chainType,
    method,
    params,
    favicon,
    title,
  });
  
  
  await openApprovalWindow(id);
  
  try {
    
    const result = await promise;
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}


async function handleReadOnlyMethod(
  chainType: DAppChainType,
  method: string,
  params: unknown
): Promise<MessageResponse> {
  
  
  if (chainType === 'evm') {
    return await handleEVMReadOnlyMethod(method, params);
  } else {
    return await handleSolanaReadOnlyMethod(method, params);
  }
}


async function handleEVMReadOnlyMethod(
  method: string,
  params: unknown
): Promise<MessageResponse> {
  
  
  try {
    
    switch (method) {
      case '_getProviderState':
        return await handleGetProviderState({ chainType: 'evm', origin: '' });
        
      default:
        
        return { success: false, error: 'RPC forwarding not yet implemented' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'RPC call failed',
    };
  }
}


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


async function handleDAppApprove(
  payload: DAppBackgroundPayloads['DAPP_APPROVE']
): Promise<MessageResponse> {
  const { requestId, selectedAccounts, remember } = payload;
  
  
  const request = await getRequest(requestId);
  if (!request) {
    return { success: false, error: 'Request not found' };
  }
  
  
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
    
    
    await approveRequest(requestId, result);
    
    
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


async function handleDAppReject(
  payload: DAppBackgroundPayloads['DAPP_REJECT']
): Promise<MessageResponse> {
  const { requestId, reason } = payload;
  
  await rejectRequest(requestId, reason);
  await closeApprovalWindow();
  
  return { success: true };
}


async function processConnectApproval(
  request: QueuedRequest,
  selectedAccounts: string[],
  remember: boolean
): Promise<unknown> {
  const { origin, chainType } = request;
  
  if (selectedAccounts.length === 0) {
    throw new Error('No accounts selected');
  }
  
  
  await createPermission(
    origin,
    chainType,
    selectedAccounts,
    chainType === 'evm' ? ['0x1'] : ['mainnet-beta'], 
    remember
  );
  
  
  if (request.tabId) {
    await addConnectedTab(request.tabId, origin, chainType);
  }
  
  
  if (chainType === 'evm') {
    return selectedAccounts; 
  } else {
    return { publicKey: selectedAccounts[0] }; 
  }
}


async function processSignMessageApproval(request: QueuedRequest): Promise<unknown> {
  const { chainType, params } = request;
  
  if (chainType === 'evm') {
    
    const [message, address] = params as [string, string];
    
    
    const result = await signEVMMessage(message, address);
    return result;
  } else {
    
    const { message } = params as { message: string };
    const result = await signSolanaMessage(message);
    return result;
  }
}


async function processSignApproval(request: QueuedRequest): Promise<unknown> {
  const { chainType, params } = request;
  
  if (chainType === 'solana') {
    const { transaction, transactions } = params as { 
      transaction?: { data: string; isVersioned: boolean };
      transactions?: { data: string; isVersioned: boolean }[];
    };
    
    if (transactions) {
      
      const signedTxs = await signSolanaTransactions(transactions);
      return { signedTransactions: signedTxs };
    } else if (transaction) {
      
      const signedTx = await signSolanaTransaction(transaction);
      return { signedTransaction: signedTx };
    }
    
    throw new Error('No transaction provided');
  }
  
  throw new Error('Sign not supported for this chain type');
}


async function processTransactionApproval(request: QueuedRequest): Promise<unknown> {
  const { chainType, params } = request;
  
  if (chainType === 'evm') {
    
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
    
    const { transaction, options } = params as {
      transaction: { data: string; isVersioned: boolean };
      options?: { skipPreflight?: boolean };
    };
    
    const result = await signAndSendSolanaTransaction(transaction, options);
    return result;
  }
}


async function processSwitchChainApproval(request: QueuedRequest): Promise<null> {
  const { params } = request;
  const { chainId } = (params as unknown[])[0] as { chainId: string };
  
  
  await broadcastChainChanged(chainId);
  
  return null;
}


async function processAddChainApproval(request: QueuedRequest): Promise<null> {
  const { params } = request;
  const chainParams = (params as unknown[])[0] as {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
  };
  
  
  return null;
}


async function signEVMMessage(message: string, address: string): Promise<string> {
  
  
  const response = await chrome.runtime.sendMessage({
    type: 'WALLET_SIGN_MESSAGE',
    payload: { message, address, chainType: 'evm' },
  });
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to sign message');
  }
  
  return response.data.signature;
}


async function signSolanaMessage(messageBase64: string): Promise<{ signature: string }> {
  
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


async function signAndSendSolanaTransaction(
  transaction: { data: string; isVersioned: boolean },
  options?: { skipPreflight?: boolean }
): Promise<{ signature: string }> {
  
  
  const signedTx = await signSolanaTransaction(transaction);
  
  
  return { signature: signedTx };
}


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
  
  
  const walletResponse = await chrome.runtime.sendMessage({
    type: 'WALLET_GET_STATE',
    payload: undefined,
  });
  
  if (!walletResponse.success) {
    return { success: false, error: 'Failed to get wallet state' };
  }
  
  const walletState = walletResponse.data;
  
  
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


async function openApprovalWindow(requestId: string): Promise<void> {
  
  await closeApprovalWindow();
  
  
  const window = await chrome.windows.create({
    url: chrome.runtime.getURL(`approval.html?requestId=${requestId}`),
    type: APPROVAL_WINDOW.TYPE,
    width: APPROVAL_WINDOW.WIDTH,
    height: APPROVAL_WINDOW.HEIGHT,
    focused: true,
  });
  
  if (window.id) {
    approvalWindowId = window.id;
    
    
    chrome.windows.onRemoved.addListener(function listener(windowId) {
      if (windowId === approvalWindowId) {
        approvalWindowId = null;
        chrome.windows.onRemoved.removeListener(listener);
        
        
        getRequest(requestId).then(request => {
          if (request && request.status === 'pending') {
            rejectRequest(requestId, 'User closed approval window');
          }
        });
      }
    });
  }
}


async function closeApprovalWindow(): Promise<void> {
  if (approvalWindowId !== null) {
    try {
      await chrome.windows.remove(approvalWindowId);
    } catch {
      
    }
    approvalWindowId = null;
  }
}


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
        
        tabsToRemove.push(tabId);
      }
    }
  }
  
  
  for (const tabId of tabsToRemove) {
    await removeConnectedTab(tabId);
  }
}


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
  
  
  for (const tabId of tabsToRemove) {
    await removeConnectedTab(tabId);
  }
}


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
      
    }
  }
  
  
  await clearConnectedTabs();
}


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
    
  }
  
  return { isUnlocked: false };
}


export {
  broadcastChainChanged,
  handleTabClosed as handleDAppTabClosed,
  handleWalletLocked as handleDAppWalletLocked,
};
