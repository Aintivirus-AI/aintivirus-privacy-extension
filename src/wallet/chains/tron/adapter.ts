/**
 * TRON Chain Adapter
 * 
 * Implements the ChainAdapter interface for TRON blockchain.
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
import type { TronKeypair, SignedTronTransaction } from './types';
import {
  TRON_NETWORKS,
  TRON_CONSTANTS,
  getTronAddressExplorerUrl,
  getTronTxExplorerUrl,
  sunToTrx,
} from './config';
import {
  deriveTronKeypair,
  getTronAddressFromMnemonic,
  isValidTronAddress,
  signTransaction,
  addressesEqual,
} from './addresses';
import {
  getBalance,
  getTRC20Balances,
  getTransactions,
  createTransferTransaction,
  broadcastTransaction,
  getNowBlock,
  estimateFee,
} from './client';
import { validateMnemonic, normalizeMnemonic } from '../../keychain';

/**
 * TRON chain adapter
 */
export class TronAdapter implements ChainAdapter {
  readonly chainType = 'evm' as const; // Use 'evm' for compatibility, actual family is 'tron'
  readonly chainName = 'TRON';
  readonly nativeSymbol = 'TRX';

  private _network: NetworkEnvironment;

  constructor(network: NetworkEnvironment = 'mainnet') {
    this._network = network;
  }

  get network(): NetworkEnvironment {
    return this._network;
  }

  async deriveAddress(mnemonic: string, index: number = 0): Promise<string> {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid mnemonic phrase', 'evm');
    }

    return getTronAddressFromMnemonic(normalized, index);
  }

  async getKeypair(mnemonic: string, index: number = 0): Promise<ChainKeypair> {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid mnemonic phrase', 'evm');
    }

    const keypair = deriveTronKeypair(normalized, index);

    return {
      chainType: 'evm', // For type compatibility
      address: keypair.address,
      privateKey: keypair.privateKey,
      _raw: keypair,
    };
  }

  isValidAddress(address: string): boolean {
    return isValidTronAddress(address);
  }

  async getBalance(address: string): Promise<ChainBalance> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid TRON address', 'evm');
    }

    const testnet = this._network === 'testnet';

    try {
      const balance = await getBalance(address, testnet);

      return {
        raw: BigInt(balance.balance),
        formatted: balance.trxBalance,
        symbol: 'TRX',
        decimals: 6,
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

  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid TRON address', 'evm');
    }

    const testnet = this._network === 'testnet';

    try {
      const trc20Balances = await getTRC20Balances(address, testnet);

      return trc20Balances.map(token => ({
        address: token.tokenAddress,
        symbol: token.tokenSymbol,
        name: token.tokenName,
        decimals: token.tokenDecimals,
        rawBalance: token.balance,
        uiBalance: token.uiBalance,
        logoUri: token.logoUri,
      }));
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get token balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  async createTransfer(from: string, to: string, amount: bigint): Promise<UnsignedChainTx> {
    if (!this.isValidAddress(from)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
    }
    if (!this.isValidAddress(to)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
    }

    const testnet = this._network === 'testnet';
    const amountSun = Number(amount);

    try {
      const tx = await createTransferTransaction(from, to, amountSun, testnet);

      return {
        chainType: 'evm', // For type compatibility
        to,
        amount,
        _raw: {
          tronTx: tx,
          testnet,
        },
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.TRANSACTION_FAILED,
        `Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  async createTokenTransfer(
    from: string,
    to: string,
    tokenAddress: string,
    amount: bigint,
  ): Promise<UnsignedChainTx> {
    // TRC20 transfers require smart contract calls
    // This is a simplified version - full implementation would use TriggerSmartContract
    throw new ChainError(
      ChainErrorCode.UNSUPPORTED_CHAIN,
      'TRC20 transfers require SunSwap integration - use swap functionality instead',
      'evm',
    );
  }

  async estimateFee(tx: UnsignedChainTx): Promise<ChainFeeEstimate> {
    const testnet = this._network === 'testnet';

    try {
      const rawData = tx._raw as any;
      const tronTx = rawData?.tronTx;
      
      if (tronTx) {
        const from = tronTx.raw_data?.contract?.[0]?.parameter?.value?.owner_address || '';
        const to = tronTx.raw_data?.contract?.[0]?.parameter?.value?.to_address || tx.to;
        const amount = Number(tx.amount);
        
        const fee = await estimateFee(from, to, amount, testnet);
        
        return {
          fee: BigInt(fee.trxFee),
          feeFormatted: fee.trxFeeFormatted,
          symbol: 'TRX',
        };
      }

      // Default fee estimate
      return {
        fee: BigInt(0), // Most TRX transfers are free with bandwidth
        feeFormatted: 0,
        symbol: 'TRX',
      };
    } catch {
      return {
        fee: BigInt(0),
        feeFormatted: 0,
        symbol: 'TRX',
      };
    }
  }

  async signTransaction(tx: UnsignedChainTx, keypair: ChainKeypair): Promise<SignedChainTx> {
    const rawData = tx._raw as any;
    const tronTx = rawData?.tronTx;

    if (!tronTx || !tronTx.raw_data_hex) {
      throw new ChainError(
        ChainErrorCode.SIGNING_FAILED,
        'Invalid transaction format',
        'evm',
      );
    }

    const tronKeypair = keypair._raw as TronKeypair;
    if (!tronKeypair || !tronKeypair.privateKey) {
      throw new ChainError(
        ChainErrorCode.SIGNING_FAILED,
        'Invalid keypair format',
        'evm',
      );
    }

    try {
      const signature = signTransaction(tronTx.raw_data_hex, tronKeypair.privateKey);

      const signedTx: SignedTronTransaction = {
        txID: tronTx.txID,
        raw_data: tronTx.raw_data,
        raw_data_hex: tronTx.raw_data_hex,
        signature: [signature],
        visible: tronTx.visible ?? true,
      };

      return {
        chainType: 'evm',
        serialized: JSON.stringify(signedTx),
        hash: tronTx.txID,
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
      const tronSignedTx = signedTx._raw as SignedTronTransaction;
      
      if (!tronSignedTx) {
        throw new Error('Invalid signed transaction format');
      }

      const txid = await broadcastTransaction(tronSignedTx, testnet);
      const explorerUrl = getTronTxExplorerUrl(txid, testnet);

      return {
        hash: txid,
        explorerUrl,
        confirmed: true, // TRON confirms quickly
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
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid TRON address', 'evm');
    }

    const testnet = this._network === 'testnet';

    try {
      const txs = await getTransactions(address, testnet, limit);

      const transactions: ChainTxHistoryItem[] = txs.map(tx => {
        // Determine direction - use addressesEqual to handle hex vs base58 formats
        const isOwner = addressesEqual(tx.ownerAddress, address);
        const isRecipient = addressesEqual(tx.toAddress || '', address);
        
        let direction: TxDirection = 'unknown';
        if (isOwner) {
          direction = isRecipient ? 'self' : 'sent';
        } else if (isRecipient) {
          direction = 'received';
        }

        const amount = BigInt(tx.amount || 0);
        const fee = BigInt(tx.fee || 0);

        return {
          hash: tx.txID,
          timestamp: tx.timestamp ? Math.floor(tx.timestamp / 1000) : null,
          direction,
          amount,
          amountFormatted: sunToTrx(Number(amount)),
          symbol: 'TRX',
          status: tx.confirmed ? 'confirmed' as const : 'pending' as const,
          fee,
          counterparty: direction === 'sent' ? tx.toAddress || null : tx.ownerAddress,
          type: direction === 'sent' ? 'Sent TRX' : 'Received TRX',
          block: tx.blockNumber || 0,
          explorerUrl: getTronTxExplorerUrl(tx.txID, testnet),
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
    const network = testnet ? TRON_NETWORKS.testnet : TRON_NETWORKS.mainnet;

    try {
      const startTime = performance.now();
      const block = await getNowBlock(testnet);
      const latency = Math.round(performance.now() - startTime);

      return {
        connected: true,
        latencyMs: latency,
        blockHeight: block.blockNumber,
        rpcUrl: network.fullNode,
      };
    } catch {
      return {
        connected: false,
        latencyMs: -1,
        blockHeight: null,
        rpcUrl: network.fullNode,
      };
    }
  }

  setNetwork(network: NetworkEnvironment): void {
    this._network = network;
  }

  getAddressExplorerUrl(address: string): string {
    const testnet = this._network === 'testnet';
    return getTronAddressExplorerUrl(address, testnet);
  }

  getTxExplorerUrl(hash: string): string {
    const testnet = this._network === 'testnet';
    return getTronTxExplorerUrl(hash, testnet);
  }
}

/**
 * Create a TRON adapter
 */
export function createTronAdapter(network: NetworkEnvironment = 'mainnet'): TronAdapter {
  return new TronAdapter(network);
}
