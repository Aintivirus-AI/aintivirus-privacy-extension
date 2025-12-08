/**
 * AINTIVIRUS dApp Connectivity - EVM Provider
 * 
 * EIP-1193 compliant Ethereum provider injected as window.ethereum.
 * Supports all major EVM chains (Ethereum, Polygon, Arbitrum, Optimism, Base).
 * 
 * SECURITY ARCHITECTURE:
 * - All signing operations route through content script -> background
 * - Private keys never exposed to this script
 * - Origin validation on all requests
 * 
 * @see https://eips.ethereum.org/EIPS/eip-1193
 */

import {
  DAppMessage,
  DAppResponse,
  DAppError,
  EVMRequestPayload,
  EVMProviderState,
  DAPP_MESSAGE_SOURCE,
  EIP1193_ERROR_CODES,
  createEIP1193Error,
  generateRequestId,
  toHexChainId,
} from '../types';
import { MESSAGE_SOURCE, PROVIDER_INFO, EVM_CHAIN_IDS } from '../bridge/constants';

// ============================================
// EVENT EMITTER
// ============================================

type EventListener = (...args: unknown[]) => void;

class SimpleEventEmitter {
  private listeners: Map<string, Set<EventListener>> = new Map();

  on(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  once(event: string, listener: EventListener): void {
    const onceWrapper = (...args: unknown[]) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    this.on(event, onceWrapper);
  }

  off(event: string, listener: EventListener): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  removeListener(event: string, listener: EventListener): void {
    this.off(event, listener);
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  emit(event: string, ...args: unknown[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.size === 0) {
      return false;
    }
    eventListeners.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`[Aintivirus EVM] Event listener error for ${event}:`, error);
      }
    });
    return true;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }
}

// ============================================
// PENDING REQUESTS
// ============================================

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();

// ============================================
// EVM PROVIDER CLASS
// ============================================

class AintivirusEVMProvider extends SimpleEventEmitter {
  // Provider identification (EIP-1193)
  readonly isMetaMask = PROVIDER_INFO.EVM.IS_METAMASK;
  readonly isAintivirus = PROVIDER_INFO.EVM.IS_AINTIVIRUS;
  
  // Provider state
  private _chainId: string = EVM_CHAIN_IDS.ETHEREUM;
  private _accounts: string[] = [];
  private _isConnected: boolean = false;
  private _networkVersion: string = '1';
  
  // Deprecated but still used by some dApps
  public selectedAddress: string | null = null;
  public networkVersion: string = '1';

  constructor() {
    super();
    this._setupMessageListener();
    this._initializeState();
  }

  // ============================================
  // PUBLIC PROPERTIES
  // ============================================

  get chainId(): string {
    return this._chainId;
  }

  get accounts(): string[] {
    return this._accounts;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ============================================
  // EIP-1193 METHODS
  // ============================================

  /**
   * Main request method (EIP-1193)
   */
  async request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown> {
    if (!args || typeof args.method !== 'string') {
      throw this._createError(EIP1193_ERROR_CODES.INVALID_REQUEST, 'Invalid request');
    }

    const { method, params } = args;
    
    // Handle methods that can be resolved locally
    switch (method) {
      case 'eth_chainId':
        return this._chainId;
        
      case 'net_version':
        return this._networkVersion;
        
      case 'eth_accounts':
        return this._accounts;
        
      case 'eth_coinbase':
        return this._accounts[0] || null;

      case 'wallet_getPermissions':
        return this._getPermissions();

      // Methods that require background communication
      case 'eth_requestAccounts':
      case 'personal_sign':
      case 'eth_sign':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4':
      case 'eth_sendTransaction':
      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain':
      case 'wallet_requestPermissions':
      case 'wallet_watchAsset':
        return this._sendToBackground(method, params);

      // Read-only methods that can be forwarded to RPC
      case 'eth_blockNumber':
      case 'eth_getBalance':
      case 'eth_getCode':
      case 'eth_getStorageAt':
      case 'eth_call':
      case 'eth_estimateGas':
      case 'eth_gasPrice':
      case 'eth_maxPriorityFeePerGas':
      case 'eth_feeHistory':
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt':
      case 'eth_getTransactionCount':
      case 'eth_getLogs':
      case 'eth_getFilterChanges':
      case 'eth_newFilter':
      case 'eth_newBlockFilter':
      case 'eth_uninstallFilter':
        return this._sendToBackground(method, params);

      default:
        // Forward unknown methods to background
        return this._sendToBackground(method, params);
    }
  }

  /**
   * Deprecated enable method (EIP-1102)
   * @deprecated Use request({ method: 'eth_requestAccounts' }) instead
   */
  async enable(): Promise<string[]> {
    console.warn('[Aintivirus EVM] enable() is deprecated. Use request({ method: "eth_requestAccounts" }) instead.');
    return this.request({ method: 'eth_requestAccounts' }) as Promise<string[]>;
  }

  /**
   * Deprecated send method
   * @deprecated Use request() instead
   */
  send(methodOrPayload: string | { method: string; params?: unknown[] }, paramsOrCallback?: unknown[] | ((error: Error | null, result?: unknown) => void)): unknown {
    // Handle different call signatures
    if (typeof methodOrPayload === 'string') {
      if (typeof paramsOrCallback === 'function') {
        // send(method, callback)
        this.request({ method: methodOrPayload })
          .then(result => (paramsOrCallback as (error: Error | null, result?: unknown) => void)(null, { result }))
          .catch(error => (paramsOrCallback as (error: Error | null, result?: unknown) => void)(error));
        return;
      }
      // send(method, params)
      return this.request({ method: methodOrPayload, params: paramsOrCallback as unknown[] });
    }
    
    // send({ method, params })
    return this.request(methodOrPayload);
  }

  /**
   * Deprecated sendAsync method
   * @deprecated Use request() instead
   */
  sendAsync(
    payload: { method: string; params?: unknown[]; id?: number; jsonrpc?: string },
    callback: (error: Error | null, result?: { id?: number; jsonrpc: string; result?: unknown; error?: unknown }) => void
  ): void {
    this.request({ method: payload.method, params: payload.params })
      .then(result => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
      .catch(error => callback(null, { id: payload.id, jsonrpc: '2.0', error: { code: error.code || -32603, message: error.message } }));
  }

  /**
   * Check if connected to the network
   */
  isConnectedSync(): boolean {
    return this._isConnected;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Initialize provider state from background
   */
  private async _initializeState(): Promise<void> {
    try {
      const state = await this._sendToBackground('_getProviderState', undefined);
      if (state && typeof state === 'object') {
        const providerState = state as EVMProviderState;
        this._chainId = providerState.chainId || EVM_CHAIN_IDS.ETHEREUM;
        this._accounts = providerState.accounts || [];
        this._isConnected = providerState.isConnected || false;
        this._networkVersion = providerState.networkVersion || '1';
        this.selectedAddress = this._accounts[0] || null;
        this.networkVersion = this._networkVersion;
        
        if (this._isConnected) {
          this.emit('connect', { chainId: this._chainId });
        }
      }
    } catch (error) {
      console.debug('[Aintivirus EVM] Failed to initialize state:', error);
    }
  }

  /**
   * Set up message listener for responses from content script
   */
  private _setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      // Only accept messages from same window
      if (event.source !== window) return;
      
      const data = event.data;
      if (!data || data.source !== MESSAGE_SOURCE.CONTENT) return;
      
      // Handle response messages
      if (data.type === 'DAPP_RESPONSE' || data.type === 'DAPP_ERROR') {
        this._handleResponse(data);
      }
      
      // Handle event messages
      if (data.type === 'EVM_CHAIN_CHANGED') {
        this._handleChainChanged(data.payload);
      }
      if (data.type === 'EVM_ACCOUNTS_CHANGED') {
        this._handleAccountsChanged(data.payload);
      }
      if (data.type === 'EVM_CONNECT') {
        this._handleConnect(data.payload);
      }
      if (data.type === 'EVM_DISCONNECT') {
        this._handleDisconnect(data.payload);
      }
    });
  }

  /**
   * Send request to background via content script
   */
  private _sendToBackground(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = generateRequestId();
      
      // Set up timeout
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Request timeout'));
      }, 30000);
      
      // Store pending request
      pendingRequests.set(requestId, { resolve, reject, timeout });
      
      // Create message
      const message: DAppMessage<EVMRequestPayload> = {
        id: requestId,
        source: DAPP_MESSAGE_SOURCE.INPAGE,
        type: 'EVM_REQUEST',
        chainType: 'evm',
        payload: { method, params: params as unknown[] },
        origin: window.location.origin,
        timestamp: Date.now(),
      };
      
      // Send to content script
      window.postMessage(message, '*');
    });
  }

  /**
   * Handle response from background
   */
  private _handleResponse(data: { payload: DAppResponse }): void {
    const response = data.payload;
    const pending = pendingRequests.get(response.id);
    
    if (!pending) return;
    
    clearTimeout(pending.timeout);
    pendingRequests.delete(response.id);
    
    if (response.success) {
      // Update local state for certain responses
      if (response.result && Array.isArray(response.result)) {
        // eth_requestAccounts response
        const accounts = response.result as string[];
        if (accounts.length > 0 && accounts[0].startsWith('0x')) {
          this._accounts = accounts;
          this.selectedAddress = accounts[0];
          this._isConnected = true;
        }
      }
      pending.resolve(response.result);
    } else {
      const error = response.error || { code: -32603, message: 'Unknown error' };
      pending.reject(this._createError(error.code as number, error.message));
    }
  }

  /**
   * Handle chain changed event
   */
  private _handleChainChanged(payload: { chainId: string }): void {
    const newChainId = toHexChainId(payload.chainId);
    if (this._chainId !== newChainId) {
      this._chainId = newChainId;
      this._networkVersion = parseInt(newChainId, 16).toString();
      this.networkVersion = this._networkVersion;
      this.emit('chainChanged', newChainId);
    }
  }

  /**
   * Handle accounts changed event
   */
  private _handleAccountsChanged(payload: { accounts: string[] }): void {
    const newAccounts = payload.accounts || [];
    if (JSON.stringify(this._accounts) !== JSON.stringify(newAccounts)) {
      this._accounts = newAccounts;
      this.selectedAddress = newAccounts[0] || null;
      this.emit('accountsChanged', newAccounts);
    }
  }

  /**
   * Handle connect event
   */
  private _handleConnect(payload: { chainId: string }): void {
    this._isConnected = true;
    this._chainId = toHexChainId(payload.chainId);
    this.emit('connect', { chainId: this._chainId });
  }

  /**
   * Handle disconnect event
   */
  private _handleDisconnect(payload: { code?: number; message?: string }): void {
    this._isConnected = false;
    this._accounts = [];
    this.selectedAddress = null;
    this.emit('disconnect', this._createError(
      payload?.code || EIP1193_ERROR_CODES.DISCONNECTED,
      payload?.message || 'Disconnected'
    ));
  }

  /**
   * Get current permissions
   */
  private _getPermissions(): { parentCapability: string; caveats: unknown[] }[] {
    if (this._accounts.length === 0) {
      return [];
    }
    return [{
      parentCapability: 'eth_accounts',
      caveats: [{
        type: 'restrictReturnedAccounts',
        value: this._accounts,
      }],
    }];
  }

  /**
   * Create an error object
   */
  private _createError(code: number, message: string): Error & { code: number } {
    const error = new Error(message) as Error & { code: number };
    error.code = code;
    return error;
  }
}

// ============================================
// EXPORTS
// ============================================

export { AintivirusEVMProvider };

/**
 * Create and return the EVM provider instance
 */
export function createEVMProvider(): AintivirusEVMProvider {
  return new AintivirusEVMProvider();
}
