

import {
  DAppMessage,
  DAppResponse,
  SolanaProviderState,
  SolanaConnectOptions,
  SolanaSendOptions,
  SerializedTransaction,
  DAPP_MESSAGE_SOURCE,
  EIP1193_ERROR_CODES,
  generateRequestId,
} from '../types';
import { MESSAGE_SOURCE, PROVIDER_INFO, SOLANA_NETWORKS } from '../bridge/constants';


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

      }
    });
    return true;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }

  addListener(event: string, listener: EventListener): void {
    this.on(event, listener);
  }
}


interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();


class PublicKey {
  private _key: string;

  constructor(key: string | Uint8Array) {
    if (typeof key === 'string') {
      this._key = key;
    } else {
      
      this._key = this._toBase58(key);
    }
  }

  toString(): string {
    return this._key;
  }

  toBase58(): string {
    return this._key;
  }

  toBytes(): Uint8Array {
    return this._fromBase58(this._key);
  }

  toBuffer(): Uint8Array {
    return this.toBytes();
  }

  equals(other: PublicKey): boolean {
    return this._key === other._key;
  }

  
  private _toBase58(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const BASE = 58;

    
    let num = BigInt(0);
    for (const byte of bytes) {
      num = num * BigInt(256) + BigInt(byte);
    }

    
    let result = '';
    while (num > 0) {
      const remainder = Number(num % BigInt(BASE));
      num = num / BigInt(BASE);
      result = ALPHABET[remainder] + result;
    }

    
    for (const byte of bytes) {
      if (byte === 0) {
        result = '1' + result;
      } else {
        break;
      }
    }

    return result || '1';
  }

  
  private _fromBase58(str: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const BASE = 58;

    let num = BigInt(0);
    for (const char of str) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) throw new Error('Invalid base58 character');
      num = num * BigInt(BASE) + BigInt(index);
    }

    
    const bytes: number[] = [];
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }

    
    for (const char of str) {
      if (char === '1') {
        bytes.unshift(0);
      } else {
        break;
      }
    }

    return new Uint8Array(bytes);
  }
}


class AintivirusSolanaProvider extends SimpleEventEmitter {
  
  readonly isPhantom = PROVIDER_INFO.SOLANA.IS_PHANTOM;
  readonly isAintivirus = PROVIDER_INFO.SOLANA.IS_AINTIVIRUS;
  readonly isSolana = true;
  
  
  private _publicKey: PublicKey | null = null;
  private _isConnected: boolean = false;
  private _network: string = SOLANA_NETWORKS.MAINNET;

  constructor() {
    super();
    this._setupMessageListener();
    this._initializeState();
  }

  
  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  
  async connect(options?: SolanaConnectOptions): Promise<{ publicKey: PublicKey }> {
    
    if (options?.onlyIfTrusted && !this._isConnected) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'User not trusted');
    }

    const result = await this._sendToBackground('connect', { options }) as { publicKey: string };
    
    if (result && result.publicKey) {
      this._publicKey = new PublicKey(result.publicKey);
      this._isConnected = true;
      this.emit('connect', { publicKey: this._publicKey });
      return { publicKey: this._publicKey };
    }
    
    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to connect');
  }

  
  async disconnect(): Promise<void> {
    try {
      await this._sendToBackground('disconnect', undefined);
    } finally {
      this._publicKey = null;
      this._isConnected = false;
      this.emit('disconnect');
    }
  }

  
  async signTransaction<T extends { serialize(): Uint8Array }>(transaction: T): Promise<T> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    const serialized = this._serializeTransaction(transaction);
    const result = await this._sendToBackground('signTransaction', { transaction: serialized }) as { signedTransaction: string };
    
    if (result && result.signedTransaction) {
      return this._deserializeTransaction(result.signedTransaction, transaction);
    }
    
    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to sign transaction');
  }

  
  async signAllTransactions<T extends { serialize(): Uint8Array }>(transactions: T[]): Promise<T[]> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    const serialized = transactions.map(tx => this._serializeTransaction(tx));
    const result = await this._sendToBackground('signAllTransactions', { transactions: serialized }) as { signedTransactions: string[] };
    
    if (result && result.signedTransactions) {
      return result.signedTransactions.map((signedTx, i) => 
        this._deserializeTransaction(signedTx, transactions[i])
      );
    }
    
    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to sign transactions');
  }

  
  async signMessage(message: Uint8Array, display?: 'utf8' | 'hex'): Promise<{ signature: Uint8Array }> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    
    const messageBase64 = btoa(String.fromCharCode(...message));
    
    const result = await this._sendToBackground('signMessage', { 
      message: messageBase64,
      display: display || 'utf8',
    }) as { signature: string };
    
    if (result && result.signature) {
      
      const signatureBytes = Uint8Array.from(atob(result.signature), c => c.charCodeAt(0));
      return { signature: signatureBytes };
    }
    
    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to sign message');
  }

  
  async signAndSendTransaction<T extends { serialize(): Uint8Array }>(
    transaction: T,
    options?: SolanaSendOptions
  ): Promise<{ signature: string }> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    const serialized = this._serializeTransaction(transaction);
    const result = await this._sendToBackground('signAndSendTransaction', { 
      transaction: serialized,
      options,
    }) as { signature: string };
    
    if (result && result.signature) {
      return { signature: result.signature };
    }
    
    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to send transaction');
  }

  
  async sendTransaction<T extends { serialize(): Uint8Array }>(
    transaction: T,
    options?: SolanaSendOptions
  ): Promise<{ signature: string }> {
    return this.signAndSendTransaction(transaction, options);
  }

  
  private async _initializeState(): Promise<void> {
    try {
      const state = await this._sendToBackground('_getProviderState', undefined);
      if (state && typeof state === 'object') {
        const providerState = state as SolanaProviderState;
        if (providerState.publicKey) {
          this._publicKey = new PublicKey(providerState.publicKey);
        }
        this._isConnected = providerState.isConnected || false;
        this._network = providerState.network || SOLANA_NETWORKS.MAINNET;
        
        if (this._isConnected && this._publicKey) {
          this.emit('connect', { publicKey: this._publicKey });
        }
      }
    } catch (error) {

    }
  }

  
  private _setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      
      if (event.source !== window) return;
      
      const data = event.data;
      if (!data || data.source !== MESSAGE_SOURCE.CONTENT) return;
      
      
      if (data.type === 'DAPP_RESPONSE' || data.type === 'DAPP_ERROR') {
        this._handleResponse(data);
      }
      
      
      if (data.type === 'SOLANA_CONNECT') {
        this._handleConnect(data.payload);
      }
      if (data.type === 'SOLANA_DISCONNECT') {
        this._handleDisconnect();
      }
    });
  }

  
  private _sendToBackground(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = generateRequestId();
      
      
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Request timeout'));
      }, 60000); 
      
      
      pendingRequests.set(requestId, { resolve, reject, timeout });
      
      
      const message: DAppMessage = {
        id: requestId,
        source: DAPP_MESSAGE_SOURCE.INPAGE,
        type: this._getMessageType(method),
        chainType: 'solana',
        payload: { method, params },
        origin: window.location.origin,
        timestamp: Date.now(),
      };
      
      
      window.postMessage(message, '*');
    });
  }

  
  private _getMessageType(method: string): 'SOLANA_CONNECT' | 'SOLANA_DISCONNECT' | 'SOLANA_SIGN_TRANSACTION' | 'SOLANA_SIGN_ALL_TRANSACTIONS' | 'SOLANA_SIGN_MESSAGE' | 'SOLANA_SIGN_AND_SEND' | 'DAPP_GET_STATE' {
    switch (method) {
      case 'connect':
        return 'SOLANA_CONNECT';
      case 'disconnect':
        return 'SOLANA_DISCONNECT';
      case 'signTransaction':
        return 'SOLANA_SIGN_TRANSACTION';
      case 'signAllTransactions':
        return 'SOLANA_SIGN_ALL_TRANSACTIONS';
      case 'signMessage':
        return 'SOLANA_SIGN_MESSAGE';
      case 'signAndSendTransaction':
      case 'sendTransaction':
        return 'SOLANA_SIGN_AND_SEND';
      default:
        return 'DAPP_GET_STATE';
    }
  }

  
  private _handleResponse(data: { payload: DAppResponse }): void {
    const response = data.payload;
    const pending = pendingRequests.get(response.id);
    
    if (!pending) return;
    
    clearTimeout(pending.timeout);
    pendingRequests.delete(response.id);
    
    if (response.success) {
      pending.resolve(response.result);
    } else {
      const error = response.error || { code: -32603, message: 'Unknown error' };
      pending.reject(this._createError(error.code as number, error.message));
    }
  }

  
  private _handleConnect(payload: { publicKey: string }): void {
    if (payload.publicKey) {
      this._publicKey = new PublicKey(payload.publicKey);
      this._isConnected = true;
      this.emit('connect', { publicKey: this._publicKey });
    }
  }

  
  private _handleDisconnect(): void {
    this._publicKey = null;
    this._isConnected = false;
    this.emit('disconnect');
  }

  
  private _serializeTransaction<T extends { serialize(): Uint8Array }>(transaction: T): SerializedTransaction {
    const serialized = transaction.serialize();
    const base64 = btoa(String.fromCharCode(...serialized));
    
    
    const isVersioned = (transaction as unknown as { version?: number }).version !== undefined;
    
    return {
      data: base64,
      isVersioned,
    };
  }

  
  private _deserializeTransaction<T>(base64: string, originalTransaction: T): T {
    
    
    const signedBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    
    
    const signed = Object.create(Object.getPrototypeOf(originalTransaction));
    Object.assign(signed, originalTransaction);
    
    
    signed.serialize = () => signedBytes;
    
    return signed as T;
  }

  
  private _createError(code: number, message: string): Error & { code: number } {
    const error = new Error(message) as Error & { code: number };
    error.code = code;
    return error;
  }
}


export { AintivirusSolanaProvider, PublicKey };


export function createSolanaProvider(): AintivirusSolanaProvider {
  return new AintivirusSolanaProvider();
}
