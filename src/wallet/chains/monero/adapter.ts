/**
 * Monero Watch-Only Adapter
 * 
 * Implements watch-only functionality for Monero.
 * Watch-only wallets can view balance and incoming transactions
 * but cannot sign or send transactions.
 */

import type {
  ChainAdapter,
  ChainBalance,
  ChainFeeEstimate,
  ChainKeypair,
  ChainTxHistoryItem,
  NetworkEnvironment,
  NetworkStatus,
  SignedChainTx,
  TokenBalance,
  TxResult,
  UnsignedChainTx,
} from '../types';
import { ChainError, ChainErrorCode } from '../types';
import type { MoneroWatchOnlyConfig } from './types';
import {
  MONERO_CONSTANTS,
  getMoneroAddressExplorerUrl,
  getMoneroTxExplorerUrl,
  piconeroToXmr,
  getRandomNode,
} from './config';
import { isValidMoneroAddress, isValidViewKey, validateWatchOnlyConfig } from './validation';
import { getBalance, getTransactions, getBlockHeight, getCurrentNode } from './client';

/**
 * Monero watch-only adapter
 * 
 * Note: This adapter has limited functionality compared to full wallets.
 * It can only view balances and incoming transactions, not send.
 */
export class MoneroAdapter implements ChainAdapter {
  readonly chainType = 'evm' as const; // For type compatibility
  readonly chainName = 'Monero';
  readonly nativeSymbol = 'XMR';

  private _network: NetworkEnvironment;
  private watchOnlyConfig: MoneroWatchOnlyConfig | null = null;

  constructor(network: NetworkEnvironment = 'mainnet') {
    this._network = network;
  }

  get network(): NetworkEnvironment {
    return this._network;
  }

  /**
   * Set watch-only configuration
   * This is required for Monero as we don't derive from mnemonic
   */
  setWatchOnlyConfig(config: MoneroWatchOnlyConfig): void {
    const testnet = this._network === 'testnet';
    const validation = validateWatchOnlyConfig(config.address, config.viewKey, testnet);
    
    if (!validation.valid) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        validation.error || 'Invalid watch-only configuration',
        'evm',
      );
    }
    
    this.watchOnlyConfig = config;
  }

  /**
   * Check if watch-only config is set
   */
  hasWatchOnlyConfig(): boolean {
    return this.watchOnlyConfig !== null;
  }

  /**
   * Get the watch-only address
   */
  getWatchOnlyAddress(): string | null {
    return this.watchOnlyConfig?.address || null;
  }

  /**
   * Derive address is not supported for Monero watch-only
   * Users must import their view key instead
   */
  async deriveAddress(_mnemonic: string, _index: number = 0): Promise<string> {
    throw new ChainError(
      ChainErrorCode.UNSUPPORTED_CHAIN,
      'Monero watch-only does not derive addresses from mnemonic. ' +
      'Please import your Monero address and view key.',
      'evm',
    );
  }

  /**
   * Get keypair is not supported for watch-only
   */
  async getKeypair(_mnemonic: string, _index: number = 0): Promise<ChainKeypair> {
    throw new ChainError(
      ChainErrorCode.UNSUPPORTED_CHAIN,
      'Monero watch-only does not support keypair derivation. ' +
      'This is a watch-only wallet.',
      'evm',
    );
  }

  isValidAddress(address: string): boolean {
    const testnet = this._network === 'testnet';
    return isValidMoneroAddress(address, testnet);
  }

  /**
   * Validate a view key
   */
  isValidViewKey(viewKey: string): boolean {
    return isValidViewKey(viewKey);
  }

  async getBalance(address: string): Promise<ChainBalance> {
    if (!this.watchOnlyConfig) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Watch-only configuration not set. Please import address and view key.',
        'evm',
      );
    }

    if (address !== this.watchOnlyConfig.address) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Address does not match watch-only configuration',
        'evm',
      );
    }

    const testnet = this._network === 'testnet';

    try {
      const balance = await getBalance(
        this.watchOnlyConfig.address,
        this.watchOnlyConfig.viewKey,
        testnet,
      );

      return {
        raw: balance.balance,
        formatted: balance.balanceXmr,
        symbol: 'XMR',
        decimals: MONERO_CONSTANTS.DECIMALS,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  async getTokenBalances(_address: string): Promise<TokenBalance[]> {
    // Monero doesn't have tokens
    return [];
  }

  async createTransfer(
    _from: string,
    _to: string,
    _amount: bigint,
  ): Promise<UnsignedChainTx> {
    throw new ChainError(
      ChainErrorCode.UNSUPPORTED_CHAIN,
      'Monero watch-only cannot create transactions. ' +
      'Use your full Monero wallet to send transactions.',
      'evm',
    );
  }

  async createTokenTransfer(
    _from: string,
    _to: string,
    _tokenAddress: string,
    _amount: bigint,
  ): Promise<UnsignedChainTx> {
    throw new ChainError(
      ChainErrorCode.UNSUPPORTED_CHAIN,
      'Monero does not support tokens',
      'evm',
    );
  }

  async estimateFee(_tx: UnsignedChainTx): Promise<ChainFeeEstimate> {
    // Watch-only cannot estimate fees for transactions
    return {
      fee: BigInt(0),
      feeFormatted: 0,
      symbol: 'XMR',
    };
  }

  async signTransaction(
    _tx: UnsignedChainTx,
    _keypair: ChainKeypair,
  ): Promise<SignedChainTx> {
    throw new ChainError(
      ChainErrorCode.SIGNING_FAILED,
      'Monero watch-only cannot sign transactions. ' +
      'Use your full Monero wallet to sign transactions.',
      'evm',
    );
  }

  async broadcastTransaction(_signedTx: SignedChainTx): Promise<TxResult> {
    throw new ChainError(
      ChainErrorCode.BROADCAST_FAILED,
      'Monero watch-only cannot broadcast transactions. ' +
      'Use your full Monero wallet to send transactions.',
      'evm',
    );
  }

  async getTransactionHistory(
    address: string,
    limit: number = 20,
    _before?: string,
  ): Promise<{ transactions: ChainTxHistoryItem[]; hasMore: boolean; cursor: string | null }> {
    if (!this.watchOnlyConfig) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Watch-only configuration not set',
        'evm',
      );
    }

    if (address !== this.watchOnlyConfig.address) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Address does not match watch-only configuration',
        'evm',
      );
    }

    const testnet = this._network === 'testnet';

    try {
      const txs = await getTransactions(
        this.watchOnlyConfig.address,
        this.watchOnlyConfig.viewKey,
        testnet,
        limit,
      );

      const transactions: ChainTxHistoryItem[] = txs.map(tx => ({
        hash: tx.hash,
        timestamp: tx.timestamp,
        direction: tx.isIncoming ? 'received' as const : 'unknown' as const,
        amount: tx.amount,
        amountFormatted: piconeroToXmr(tx.amount),
        symbol: 'XMR',
        status: tx.confirmations >= MONERO_CONSTANTS.MIN_CONFIRMATIONS 
          ? 'confirmed' as const 
          : 'pending' as const,
        fee: tx.fee || BigInt(0),
        counterparty: null, // Monero hides sender addresses
        type: tx.isIncoming ? 'Received XMR' : 'Unknown',
        block: tx.blockHeight,
        explorerUrl: getMoneroTxExplorerUrl(tx.hash, testnet),
      }));

      return {
        transactions,
        hasMore: transactions.length >= limit,
        cursor: transactions.length > 0 ? transactions[transactions.length - 1].hash : null,
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    const testnet = this._network === 'testnet';
    const nodeUrl = getCurrentNode(testnet);

    try {
      const startTime = performance.now();
      const height = await getBlockHeight(testnet);
      const latency = Math.round(performance.now() - startTime);

      return {
        connected: true,
        latencyMs: latency,
        blockHeight: height,
        rpcUrl: nodeUrl,
      };
    } catch {
      return {
        connected: false,
        latencyMs: -1,
        blockHeight: null,
        rpcUrl: nodeUrl,
      };
    }
  }

  setNetwork(network: NetworkEnvironment): void {
    this._network = network;
  }

  getAddressExplorerUrl(address: string): string {
    const testnet = this._network === 'testnet';
    return getMoneroAddressExplorerUrl(address, testnet);
  }

  getTxExplorerUrl(hash: string): string {
    const testnet = this._network === 'testnet';
    return getMoneroTxExplorerUrl(hash, testnet);
  }
}

/**
 * Create a Monero watch-only adapter
 */
export function createMoneroAdapter(network: NetworkEnvironment = 'mainnet'): MoneroAdapter {
  return new MoneroAdapter(network);
}

/**
 * Create a Monero adapter with watch-only config
 */
export function createMoneroWatchOnlyAdapter(
  config: MoneroWatchOnlyConfig,
  network: NetworkEnvironment = 'mainnet',
): MoneroAdapter {
  const adapter = new MoneroAdapter(network);
  adapter.setWatchOnlyConfig(config);
  return adapter;
}
