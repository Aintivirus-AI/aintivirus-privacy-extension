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
    eventListeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {}
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
    this._initializeStateWithRetry();
  }

  private async _initializeStateWithRetry(attempt = 0): Promise<void> {
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 300;

    try {
      await this._initializeState();
    } catch {
      // If initialization fails and we have retries left, wait and try again
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        await this._initializeStateWithRetry(attempt + 1);
      }
      // Best-effort initialization: if it still fails, the provider
      // will function once events arrive from the background.
    }
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

    const result = (await this._sendToBackground('connect', { options })) as { publicKey: string };

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
    const result = (await this._sendToBackground('signTransaction', {
      transaction: serialized,
    })) as { signedTransaction: string };

    if (result && result.signedTransaction) {
      return this._deserializeTransaction(result.signedTransaction, transaction);
    }

    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to sign transaction');
  }

  async signAllTransactions<T extends { serialize(): Uint8Array }>(
    transactions: T[],
  ): Promise<T[]> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    const serialized = transactions.map((tx) => this._serializeTransaction(tx));
    const result = (await this._sendToBackground('signAllTransactions', {
      transactions: serialized,
    })) as { signedTransactions: string[] };

    if (result && result.signedTransactions) {
      return result.signedTransactions.map((signedTx, i) =>
        this._deserializeTransaction(signedTx, transactions[i]),
      );
    }

    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to sign transactions');
  }

  async signMessage(
    message: Uint8Array,
    display?: 'utf8' | 'hex',
  ): Promise<{ signature: Uint8Array }> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    const messageBase64 = btoa(String.fromCharCode(...message));

    const result = (await this._sendToBackground('signMessage', {
      message: messageBase64,
      display: display || 'utf8',
    })) as { signature: string };

    if (result && result.signature) {
      const signatureBytes = Uint8Array.from(atob(result.signature), (c) => c.charCodeAt(0));
      return { signature: signatureBytes };
    }

    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to sign message');
  }

  async signAndSendTransaction<T extends { serialize(): Uint8Array }>(
    transaction: T,
    options?: SolanaSendOptions,
  ): Promise<{ signature: string }> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    const serialized = this._serializeTransaction(transaction);
    const result = (await this._sendToBackground('signAndSendTransaction', {
      transaction: serialized,
      options,
    })) as { signature: string };

    if (result && result.signature) {
      return { signature: result.signature };
    }

    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to send transaction');
  }

  async sendTransaction<T extends { serialize(): Uint8Array }>(
    transaction: T,
    options?: SolanaSendOptions,
  ): Promise<{ signature: string }> {
    return this.signAndSendTransaction(transaction, options);
  }

  // Wallet-standard compatible method: accepts and returns Uint8Array bytes
  async signTransactionBytes(transactionBytes: Uint8Array): Promise<Uint8Array> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    // Convert bytes to base64 for transport
    const base64 = btoa(String.fromCharCode(...transactionBytes));
    
    // Determine if versioned by checking the first byte (version prefix)
    // VersionedTransaction has version byte at start, legacy Transaction doesn't
    const isVersioned = transactionBytes[0] === 0x80 || transactionBytes[0] < 0x80;
    
    const result = (await this._sendToBackground('signTransaction', {
      transaction: { data: base64, isVersioned },
    })) as { signedTransaction: string };

    if (result && result.signedTransaction) {
      // Convert base64 back to bytes
      return Uint8Array.from(atob(result.signedTransaction), (c) => c.charCodeAt(0));
    }

    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to sign transaction');
  }

  // Wallet-standard compatible method: accepts Uint8Array bytes
  async signAndSendTransactionBytes(
    transactionBytes: Uint8Array,
    options?: SolanaSendOptions,
  ): Promise<{ signature: string }> {
    if (!this._isConnected || !this._publicKey) {
      throw this._createError(EIP1193_ERROR_CODES.UNAUTHORIZED, 'Wallet not connected');
    }

    // Convert bytes to base64 for transport
    const base64 = btoa(String.fromCharCode(...transactionBytes));
    
    // Determine if versioned
    const isVersioned = transactionBytes[0] === 0x80 || transactionBytes[0] < 0x80;
    
    const result = (await this._sendToBackground('signAndSendTransaction', {
      transaction: { data: base64, isVersioned },
      options,
    })) as { signature: string };

    if (result && result.signature) {
      return { signature: result.signature };
    }

    throw this._createError(EIP1193_ERROR_CODES.INTERNAL_ERROR, 'Failed to send transaction');
  }

  // Helper to convert base58 to bytes (for signatures)
  base58ToBytes(base58: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const BASE = 58;

    let num = BigInt(0);
    for (const char of base58) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) throw new Error('Invalid base58 character');
      num = num * BigInt(BASE) + BigInt(index);
    }

    const bytes: number[] = [];
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }

    // Handle leading zeros
    for (const char of base58) {
      if (char === '1') {
        bytes.unshift(0);
      } else {
        break;
      }
    }

    return new Uint8Array(bytes);
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
      // Initialization failed - will retry
      throw error;
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

  private _getMessageType(
    method: string,
  ):
    | 'SOLANA_CONNECT'
    | 'SOLANA_DISCONNECT'
    | 'SOLANA_SIGN_TRANSACTION'
    | 'SOLANA_SIGN_ALL_TRANSACTIONS'
    | 'SOLANA_SIGN_MESSAGE'
    | 'SOLANA_SIGN_AND_SEND'
    | 'DAPP_GET_STATE' {
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

  private _serializeTransaction<T extends { serialize(): Uint8Array }>(
    transaction: T,
  ): SerializedTransaction {
    const serialized = transaction.serialize();
    const base64 = btoa(String.fromCharCode(...serialized));

    const isVersioned = (transaction as unknown as { version?: number }).version !== undefined;

    return {
      data: base64,
      isVersioned,
    };
  }

  private _deserializeTransaction<T extends { serialize(): Uint8Array }>(
    base64: string,
    originalTransaction: T,
  ): T {
    // Decode the base64 signed transaction bytes
    const signedBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // Check if this is a VersionedTransaction by looking for the version property
    const isVersioned = (originalTransaction as unknown as { version?: number }).version !== undefined;

    // Strategy 1: Use the constructor's static deserialize/from method
    // This creates a proper class instance with all methods working correctly
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TransactionClass = (originalTransaction as any).constructor;
      
      if (isVersioned && typeof TransactionClass.deserialize === 'function') {
        // VersionedTransaction uses static deserialize() method
        const deserialized = TransactionClass.deserialize(signedBytes);
        if (deserialized && typeof deserialized.serialize === 'function') {
          return deserialized as T;
        }
      } else if (!isVersioned && typeof TransactionClass.from === 'function') {
        // Legacy Transaction uses static from() method
        const deserialized = TransactionClass.from(signedBytes);
        if (deserialized && typeof deserialized.serialize === 'function') {
          return deserialized as T;
        }
      }
    } catch (err) {
      // Log for debugging - constructor approach failed
      console.warn('[Aintivirus] Constructor deserialization failed:', err);
    }

    // Strategy 2: Create a wrapper object that delegates to original but overrides serialize
    // This is more reliable than Proxy in some environments
    try {
      // Create object with same prototype chain
      const proto = Object.getPrototypeOf(originalTransaction);
      const signedTx = Object.create(proto);
      
      // Copy all properties from original transaction
      const keys = Object.keys(originalTransaction as object);
      for (const key of keys) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (signedTx as any)[key] = (originalTransaction as any)[key];
      }
      
      // Also copy symbol properties if any
      const symbols = Object.getOwnPropertySymbols(originalTransaction as object);
      for (const sym of symbols) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (signedTx as any)[sym] = (originalTransaction as any)[sym];
      }
      
      // Override serialize to return signed bytes - this is the critical part
      signedTx.serialize = function serialize(): Uint8Array {
        return signedBytes;
      };
      
      // Verify our serialize is actually a function before returning
      if (typeof signedTx.serialize === 'function') {
        return signedTx as T;
      }
    } catch (err) {
      console.warn('[Aintivirus] Object creation failed:', err);
    }

    // Strategy 3: Absolute fallback - create minimal object with serialize
    // This should never fail but may not pass all type checks
    const fallback = {
      serialize: (): Uint8Array => signedBytes,
      // Copy essential properties that wallet adapters might check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message: (originalTransaction as any).message,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signatures: (originalTransaction as any).signatures,
    };
    
    // If versioned, add version getter
    if (isVersioned) {
      Object.defineProperty(fallback, 'version', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: () => (originalTransaction as any).version,
        enumerable: true,
      });
    }
    
    console.warn('[Aintivirus] Using fallback transaction wrapper');
    return fallback as unknown as T;
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
