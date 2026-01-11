/**
 * Bitcoin Chain Adapter
 * 
 * Implements the ChainAdapter interface for Bitcoin-family chains:
 * Bitcoin, Bitcoin Cash, Litecoin, and Zcash (transparent addresses).
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
  TxDirection,
} from '../types';
import { ChainError, ChainErrorCode } from '../types';
import type { BitcoinChainId, BitcoinKeypair } from './types';
import { getBitcoinChainConfig, getBitcoinAddressExplorerUrl, getBitcoinTxExplorerUrl } from './config';
import { deriveBitcoinKeypair, getBitcoinAddressFromMnemonic, isValidBitcoinAddress } from './addresses';
import { getBalance, getUtxos, getTransactions, getFeeEstimate, broadcastTransaction, getBlockHeight } from './client';
import { createUnsignedTransaction, estimateTransactionFee, validateTransaction, signTransaction } from './transactions';
import { validateMnemonic, normalizeMnemonic } from '../../keychain';

/**
 * Bitcoin-family chain adapter
 * Handles Bitcoin, Bitcoin Cash, Litecoin, and Zcash
 */
export class BitcoinAdapter implements ChainAdapter {
  readonly chainType = 'evm' as const; // Use 'evm' for compatibility, actual family is 'bitcoin'
  readonly bitcoinChainId: BitcoinChainId;
  readonly chainName: string;
  readonly nativeSymbol: string;

  private _network: NetworkEnvironment;
  private readonly config;

  constructor(bitcoinChainId: BitcoinChainId, network: NetworkEnvironment = 'mainnet') {
    this.bitcoinChainId = bitcoinChainId;
    this._network = network;
    this.config = getBitcoinChainConfig(bitcoinChainId);
    this.chainName = this.config.name;
    this.nativeSymbol = this.config.symbol;
  }

  get network(): NetworkEnvironment {
    return this._network;
  }

  async deriveAddress(mnemonic: string, index: number = 0): Promise<string> {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid mnemonic phrase', 'evm');
    }

    const testnet = this._network === 'testnet';
    return getBitcoinAddressFromMnemonic(normalized, this.bitcoinChainId, index, undefined, testnet);
  }

  async getKeypair(mnemonic: string, index: number = 0): Promise<ChainKeypair> {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid mnemonic phrase', 'evm');
    }

    const testnet = this._network === 'testnet';
    const keypair = deriveBitcoinKeypair(normalized, this.bitcoinChainId, index, undefined, testnet);

    return {
      chainType: 'evm', // For type compatibility
      address: keypair.address,
      privateKey: keypair.privateKey,
      _raw: keypair,
    };
  }

  isValidAddress(address: string): boolean {
    const testnet = this._network === 'testnet';
    return isValidBitcoinAddress(address, this.bitcoinChainId, testnet);
  }

  async getBalance(address: string): Promise<ChainBalance> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, `Invalid ${this.chainName} address`, 'evm');
    }

    const testnet = this._network === 'testnet';

    try {
      const balance = await getBalance(this.bitcoinChainId, address, testnet);

      return {
        raw: BigInt(balance.total),
        formatted: balance.total / Math.pow(10, this.config.decimals),
        symbol: this.nativeSymbol,
        decimals: this.config.decimals,
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
    // Bitcoin-family chains don't have tokens in the same way as EVM/Solana
    // Could potentially add support for Omni Layer (BTC) or SLP tokens (BCH) in the future
    return [];
  }

  async createTransfer(from: string, to: string, amount: bigint): Promise<UnsignedChainTx> {
    if (!this.isValidAddress(from)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
    }
    if (!this.isValidAddress(to)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
    }

    const testnet = this._network === 'testnet';
    const amountSatoshis = Number(amount);

    try {
      const { tx, fee } = await createUnsignedTransaction(
        this.bitcoinChainId,
        from,
        to,
        amountSatoshis,
        testnet
      );

      return {
        chainType: 'evm', // For type compatibility
        to,
        amount,
        _raw: {
          bitcoinTx: tx,
          fee,
          chainId: this.bitcoinChainId,
          testnet,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient')) {
        throw new ChainError(ChainErrorCode.INSUFFICIENT_FUNDS, error.message, 'evm');
      }
      throw new ChainError(
        ChainErrorCode.TRANSACTION_FAILED,
        `Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  async createTokenTransfer(
    _from: string,
    _to: string,
    _tokenAddress: string,
    _amount: bigint,
  ): Promise<UnsignedChainTx> {
    throw new ChainError(
      ChainErrorCode.UNSUPPORTED_CHAIN,
      `Token transfers not supported on ${this.chainName}`,
      'evm',
    );
  }

  async estimateFee(tx: UnsignedChainTx): Promise<ChainFeeEstimate> {
    const testnet = this._network === 'testnet';

    try {
      // If we have a pre-calculated fee from createTransfer
      if (tx._raw && typeof (tx._raw as any).fee === 'number') {
        const fee = (tx._raw as any).fee as number;
        return {
          fee: BigInt(fee),
          feeFormatted: fee / Math.pow(10, this.config.decimals),
          symbol: this.nativeSymbol,
        };
      }

      // Otherwise, estimate
      const feeEstimate = await getFeeEstimate(this.bitcoinChainId, testnet);
      
      return {
        fee: BigInt(feeEstimate.totalFee || 1000), // Default to 1000 satoshis if not calculated
        feeFormatted: (feeEstimate.totalFee || 1000) / Math.pow(10, this.config.decimals),
        symbol: this.nativeSymbol,
      };
    } catch (error) {
      // Return a reasonable default
      return {
        fee: BigInt(1000),
        feeFormatted: 0.00001,
        symbol: this.nativeSymbol,
      };
    }
  }

  async signTransaction(tx: UnsignedChainTx, keypair: ChainKeypair): Promise<SignedChainTx> {
    const rawData = tx._raw as any;
    if (!rawData || !rawData.bitcoinTx) {
      throw new ChainError(
        ChainErrorCode.SIGNING_FAILED,
        'Invalid transaction format',
        'evm',
      );
    }

    const bitcoinKeypair = keypair._raw as BitcoinKeypair;
    if (!bitcoinKeypair || !bitcoinKeypair.privateKey) {
      throw new ChainError(
        ChainErrorCode.SIGNING_FAILED,
        'Invalid keypair format',
        'evm',
      );
    }

    try {
      const signedTx = signTransaction(rawData.bitcoinTx, bitcoinKeypair, this.bitcoinChainId);

      return {
        chainType: 'evm',
        serialized: signedTx.hex,
        hash: signedTx.txid,
        _raw: signedTx,
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.SIGNING_FAILED,
        `Signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  async broadcastTransaction(signedTx: SignedChainTx): Promise<TxResult> {
    const testnet = this._network === 'testnet';

    try {
      const txid = await broadcastTransaction(this.bitcoinChainId, signedTx.serialized, testnet);
      const explorerUrl = getBitcoinTxExplorerUrl(this.bitcoinChainId, txid, testnet);

      return {
        hash: txid,
        explorerUrl,
        confirmed: false, // Bitcoin transactions need confirmations
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.BROADCAST_FAILED,
        `Broadcast failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  async getTransactionHistory(
    address: string,
    limit: number = 20,
    _before?: string,
  ): Promise<{ transactions: ChainTxHistoryItem[]; hasMore: boolean; cursor: string | null }> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, `Invalid ${this.chainName} address`, 'evm');
    }

    const testnet = this._network === 'testnet';

    try {
      const txs = await getTransactions(this.bitcoinChainId, address, testnet, limit);

      const transactions: ChainTxHistoryItem[] = txs.map(tx => {
        // Determine transaction direction
        let direction: TxDirection = 'unknown';
        let amount = BigInt(0);
        let counterparty: string | null = null;

        // Check inputs for outgoing
        const isOutgoing = tx.vin.some(
          vin => vin.addresses?.some(addr => addr.toLowerCase() === address.toLowerCase())
        );

        // Check outputs for incoming
        const ourOutputs = tx.vout.filter(
          vout => vout.scriptPubKey.addresses?.some(
            addr => addr.toLowerCase() === address.toLowerCase()
          )
        );

        const theirOutputs = tx.vout.filter(
          vout => !vout.scriptPubKey.addresses?.some(
            addr => addr.toLowerCase() === address.toLowerCase()
          )
        );

        if (isOutgoing && theirOutputs.length > 0) {
          direction = 'sent';
          amount = BigInt(theirOutputs.reduce((sum, out) => sum + out.value, 0));
          counterparty = theirOutputs[0]?.scriptPubKey.addresses?.[0] || null;
        } else if (!isOutgoing && ourOutputs.length > 0) {
          direction = 'received';
          amount = BigInt(ourOutputs.reduce((sum, out) => sum + out.value, 0));
          counterparty = tx.vin[0]?.addresses?.[0] || null;
        } else if (isOutgoing && ourOutputs.length > 0 && theirOutputs.length === 0) {
          direction = 'self';
          amount = BigInt(ourOutputs.reduce((sum, out) => sum + out.value, 0));
        }

        return {
          hash: tx.txid,
          timestamp: tx.time || tx.blocktime || null,
          direction,
          amount,
          amountFormatted: Number(amount) / Math.pow(10, this.config.decimals),
          symbol: this.nativeSymbol,
          status: tx.confirmations > 0 ? 'confirmed' as const : 'pending' as const,
          fee: BigInt(tx.fees || 0),
          counterparty,
          type: direction === 'sent' ? `Sent ${this.nativeSymbol}` : `Received ${this.nativeSymbol}`,
          block: tx.blockheight || 0,
          explorerUrl: getBitcoinTxExplorerUrl(this.bitcoinChainId, tx.txid, testnet),
        };
      });

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

    try {
      const startTime = performance.now();
      const blockHeight = await getBlockHeight(this.bitcoinChainId, testnet);
      const latency = Math.round(performance.now() - startTime);

      return {
        connected: true,
        latencyMs: latency,
        blockHeight,
        rpcUrl: this.config.apiUrls[0],
      };
    } catch {
      return {
        connected: false,
        latencyMs: -1,
        blockHeight: null,
        rpcUrl: this.config.apiUrls[0],
      };
    }
  }

  setNetwork(network: NetworkEnvironment): void {
    this._network = network;
  }

  getAddressExplorerUrl(address: string): string {
    const testnet = this._network === 'testnet';
    return getBitcoinAddressExplorerUrl(this.bitcoinChainId, address, testnet);
  }

  getTxExplorerUrl(hash: string): string {
    const testnet = this._network === 'testnet';
    return getBitcoinTxExplorerUrl(this.bitcoinChainId, hash, testnet);
  }
}

/**
 * Create a Bitcoin adapter
 */
export function createBitcoinAdapter(
  chainId: BitcoinChainId,
  network: NetworkEnvironment = 'mainnet'
): BitcoinAdapter {
  return new BitcoinAdapter(chainId, network);
}
