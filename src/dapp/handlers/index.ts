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
import { approveConnection } from '../../security/connectionMonitor';
import { getWalletState as getWalletStateFromStorage } from '../../wallet/storage';
import { handleWalletMessage } from '../../wallet';
import { getNumericChainId, DEFAULT_EVM_CHAIN } from '../../wallet/chains/config';
import type { EVMChainId } from '../../wallet/chains/types';
import type { WalletMessageType } from '../../wallet/types';
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

async function loadConnectedTabs(): Promise<
  Map<number, { origin: string; chainType: DAppChainType }>
> {
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

async function saveConnectedTabs(
  tabs: Map<number, { origin: string; chainType: DAppChainType }>,
): Promise<void> {
  try {
    const entries: ConnectedTabEntry[] = [];
    for (const [tabId, data] of tabs) {
      entries.push({ tabId, ...data });
    }
    await chrome.storage.session.set({ [CONNECTED_TABS_KEY]: entries });
  } catch (error) {}
}

async function addConnectedTab(
  tabId: number,
  origin: string,
  chainType: DAppChainType,
): Promise<void> {
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
  sender: chrome.runtime.MessageSender,
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
        return await handleRevokePermission(
          payload as DAppBackgroundPayloads['DAPP_REVOKE_PERMISSION'],
        );

      case 'DAPP_REVOKE_ALL_PERMISSIONS':
        return await handleRevokeAllPermissions();

      case 'DAPP_GET_PENDING_REQUESTS':
        return await handleGetPendingRequests();

      case 'DAPP_CANCEL_REQUEST':
        return await handleCancelRequest(payload as DAppBackgroundPayloads['DAPP_CANCEL_REQUEST']);

      case 'DAPP_GET_PROVIDER_STATE':
        return await handleGetProviderState(
          payload as DAppBackgroundPayloads['DAPP_GET_PROVIDER_STATE'],
        );

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
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  const { chainType, method, params, origin, tabId, favicon, title } = payload;

  if (tabId) {
    await addConnectedTab(tabId, origin, chainType);
  }

  if (!requiresApproval(method, chainType)) {
    return await handleReadOnlyMethod(chainType, method, params, origin);
  }

  const hasExistingPermission = await hasPermission(origin, chainType);
  const autoApprove = await shouldAutoApprove(origin, chainType);

  if (method === 'eth_requestAccounts' || method === 'connect') {
    if (hasExistingPermission && autoApprove) {
      await updateLastAccessed(origin, chainType);
      const permission = await getPermission(origin, chainType);

      // Record in security module for auto-approved connections too
      if (permission?.accounts[0]) {
        try {
          await approveConnection(origin, origin, permission.accounts[0], 'low', [], tabId);
        } catch (err) {
          console.error('[DApp Handler] Failed to record auto-approved connection:', err);
        }
      }

      if (chainType === 'evm') {
        return { success: true, data: permission?.accounts || [] };
      } else {
        return { success: true, data: { publicKey: permission?.accounts[0] } };
      }
    }
  }

  if (hasExistingPermission) {
    const walletLockState = await getWalletLockState();
    if (!walletLockState.isUnlocked) {
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
  params: unknown,
  origin: string,
): Promise<MessageResponse> {
  if (chainType === 'evm') {
    return await handleEVMReadOnlyMethod(method, params, origin);
  } else {
    return await handleSolanaReadOnlyMethod(method, params);
  }
}

async function handleEVMReadOnlyMethod(
  method: string,
  params: unknown,
  origin: string,
): Promise<MessageResponse> {
  try {
    // Handle internal provider state request specially
    if (method === '_getProviderState') {
      return await handleGetProviderState({ chainType: 'evm', origin });
    }

    // Get current chain configuration from wallet directly
    const walletState = await getWalletStateFromStorage();
    if (!walletState) {
      return { success: false, error: 'Failed to get wallet state' };
    }

    const chainId = walletState.activeEVMChain || 'ethereum';
    const testnet = walletState.networkEnvironment === 'testnet';

    // Forward RPC request directly to wallet handler
    const rpcResult = await handleWalletMessage('EVM_RPC_REQUEST' as WalletMessageType, {
      method,
      params,
      chainId,
      testnet,
    });

    return { success: true, data: rpcResult };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'RPC call failed',
    };
  }
}

async function handleSolanaReadOnlyMethod(
  method: string,
  params: unknown,
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
  payload: DAppBackgroundPayloads['DAPP_APPROVE'],
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
  payload: DAppBackgroundPayloads['DAPP_REJECT'],
): Promise<MessageResponse> {
  const { requestId, reason } = payload;

  await rejectRequest(requestId, reason);
  await closeApprovalWindow();

  return { success: true };
}

async function processConnectApproval(
  request: QueuedRequest,
  selectedAccounts: string[],
  remember: boolean,
): Promise<unknown> {
  const { origin, chainType, tabId } = request;

  if (selectedAccounts.length === 0) {
    throw new Error('No accounts selected');
  }

  await createPermission(
    origin,
    chainType,
    selectedAccounts,
    chainType === 'evm' ? ['0x1'] : ['mainnet-beta'],
    remember,
  );

  if (tabId) {
    await addConnectedTab(tabId, origin, chainType);
  }

  // Also record in security module so connections show in the Security tab
  try {
    await approveConnection(
      origin,
      origin, // Use origin as URL since we may not have full URL
      selectedAccounts[0],
      'low',
      [],
      tabId,
    );
  } catch (err) {
    // Don't fail the connection if security recording fails
    console.error('[DApp Handler] Failed to record connection in security module:', err);
  }

  if (chainType === 'evm') {
    return selectedAccounts;
  } else {
    return { publicKey: selectedAccounts[0] };
  }
}

async function processSignMessageApproval(request: QueuedRequest): Promise<unknown> {
  const { chainType, method, params } = request;

  if (chainType === 'evm') {
    const isTypedData =
      method === 'eth_signTypedData' ||
      method === 'eth_signTypedData_v3' ||
      method === 'eth_signTypedData_v4';

    if (isTypedData) {
      // eth_signTypedData params: [address, typedDataJSON]
      // Note: param order is REVERSED compared to personal_sign
      const [address, typedDataJSON] = params as [string, string];
      return signEVMTypedData(typedDataJSON, address);
    } else {
      // personal_sign / eth_sign params: [message, address]
      const [message, address] = params as [string, string];
      return signEVMMessage(message, address);
    }
  } else {
    const { message } = params as { message: string };
    return signSolanaMessage(message);
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
      gasPrice?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
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
  const result = (await handleWalletMessage('WALLET_SIGN_MESSAGE' as WalletMessageType, {
    message,
    address,
    chainType: 'evm',
  })) as { signature: string };

  return result.signature;
}

async function signEVMTypedData(typedDataJSON: string, address: string): Promise<string> {
  const result = (await handleWalletMessage('WALLET_SIGN_MESSAGE' as WalletMessageType, {
    message: '', // Not used for typed data; routing is based on typedData presence
    address, // Verified against unlocked wallet in handleSignMessageEVM
    chainType: 'evm',
    typedData: typedDataJSON,
  })) as { signature: string };

  return result.signature;
}

async function signSolanaMessage(messageBase64: string): Promise<{ signature: string }> {
  const message = atob(messageBase64);

  const result = (await handleWalletMessage('WALLET_SIGN_MESSAGE' as WalletMessageType, {
    message,
  })) as { signature: string };

  return { signature: result.signature };
}

async function signSolanaTransaction(transaction: {
  data: string;
  isVersioned: boolean;
}): Promise<string> {
  const result = (await handleWalletMessage('WALLET_SIGN_TRANSACTION' as WalletMessageType, {
    serializedTransaction: transaction.data,
  })) as { signedTransaction: string };

  return result.signedTransaction;
}

async function signSolanaTransactions(
  transactions: { data: string; isVersioned: boolean }[],
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
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}): Promise<string> {
  // For contract calls (with data), pass raw hex value to preserve precision
  // For simple transfers, convert to decimal string
  const hasData = txParams.data && txParams.data !== '0x';
  
  const result = (await handleWalletMessage('WALLET_SEND_ETH' as WalletMessageType, {
    recipient: txParams.to || '',
    amount: txParams.value ? (parseInt(txParams.value, 16) / 1e18).toString() : '0',
    // Pass raw hex value for contract calls to avoid precision loss
    valueHex: hasData ? txParams.value : undefined,
    data: txParams.data,
    gas: txParams.gas,
    gasPrice: txParams.gasPrice,
    maxFeePerGas: txParams.maxFeePerGas,
    maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
  })) as { hash: string };

  return result.hash;
}

async function signAndSendSolanaTransaction(
  transaction: { data: string; isVersioned: boolean },
  options?: { skipPreflight?: boolean },
): Promise<{ signature: string }> {
  const signedTx = await signSolanaTransaction(transaction);

  return { signature: signedTx };
}

async function handleGetPermissions(): Promise<MessageResponse> {
  const permissions = await getAllPermissions();
  return { success: true, data: permissions };
}

async function handleRevokePermission(
  payload: DAppBackgroundPayloads['DAPP_REVOKE_PERMISSION'],
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
  payload: DAppBackgroundPayloads['DAPP_CANCEL_REQUEST'],
): Promise<MessageResponse> {
  await cancelRequest(payload.requestId);
  return { success: true };
}

async function handleGetProviderState(
  payload: DAppBackgroundPayloads['DAPP_GET_PROVIDER_STATE'],
): Promise<MessageResponse> {
  const { chainType, origin } = payload;

  // Get wallet state directly instead of self-messaging
  const walletState = await getWalletStateFromStorage();
  if (!walletState) {
    return { success: false, error: 'Failed to get wallet state' };
  }

  const permission = origin ? await getPermission(origin, chainType) : null;

  if (chainType === 'evm') {
    const activeChain = (walletState.activeEVMChain || DEFAULT_EVM_CHAIN) as EVMChainId;
    const testnet = walletState.networkEnvironment === 'testnet';
    let numericChainId: number;
    try {
      numericChainId = getNumericChainId(activeChain, testnet);
    } catch {
      // Fallback to Ethereum mainnet if chain config is missing
      numericChainId = 1;
    }
    const state: EVMProviderState = {
      isConnected: !!permission,
      chainId: toHexChainId(numericChainId),
      accounts: permission?.accounts || [],
      networkVersion: numericChainId.toString(),
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

        getRequest(requestId).then((request) => {
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
    } catch {}
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
    } catch {}
  }

  await clearConnectedTabs();
}

async function getWalletLockState(): Promise<{ isUnlocked: boolean }> {
  try {
    // Call the wallet storage function directly instead of using messaging
    // This is more reliable since we're already in the background script
    const walletState = await getWalletStateFromStorage();
    return {
      isUnlocked: walletState.lockState === 'unlocked',
    };
  } catch {
    return { isUnlocked: false };
  }
}

export {
  broadcastChainChanged,
  handleTabClosed as handleDAppTabClosed,
  handleWalletLocked as handleDAppWalletLocked,
};
