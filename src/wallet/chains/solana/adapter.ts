

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
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
import { SOLANA_CHAINS } from '../config';
import {
  deriveKeypair,
  getPublicKeyFromMnemonic,
  isValidSolanaAddress,
  normalizeMnemonic,
  validateMnemonic,
} from '../../keychain';
import {
  getBalance as getSolanaBalance,
  getBalanceWithRetry,
  setNetwork as setSolanaNetwork,
  getCurrentNetwork,
  getNetworkStatus as getSolanaNetworkStatus,
  getRecentBlockhash,
  getAddressExplorerUrl,
  getTransactionExplorerUrl,
  getCurrentConnection,
} from '../../rpc';
import {
  sendSol,
  estimateTransactionFee,
  validateRecipient,
} from '../../transactions';
import { getTransactionHistory as getSolanaHistory } from '../../history';
import { getTokenBalances as getSPLTokenBalances } from '../../tokens';
import type { SolanaNetwork, TransactionHistoryItem } from '../../types';


export class SolanaAdapter implements ChainAdapter {
  readonly chainType = 'solana' as const;
  readonly chainName = 'Solana';
  readonly nativeSymbol = 'SOL';
  
  private _network: NetworkEnvironment;
  
  constructor(network: NetworkEnvironment = 'mainnet') {
    this._network = network;
    
    const solanaNetwork: SolanaNetwork = network === 'mainnet' ? 'mainnet-beta' : 'devnet';
    setSolanaNetwork(solanaNetwork);
  }
  
  get network(): NetworkEnvironment {
    return this._network;
  }
  
  
  async deriveAddress(mnemonic: string, index: number = 0): Promise<string> {
    
    
    if (index !== 0) {
    }
    
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Invalid mnemonic phrase',
        'solana'
      );
    }
    
    return getPublicKeyFromMnemonic(normalized);
  }
  
  async getKeypair(mnemonic: string, index: number = 0): Promise<ChainKeypair> {
    if (index !== 0) {
    }
    
    const keypair = deriveKeypair(mnemonic);
    
    return {
      chainType: 'solana',
      address: keypair.publicKey.toBase58(),
      privateKey: keypair.secretKey,
      _raw: keypair,
    };
  }
  
  isValidAddress(address: string): boolean {
    return isValidSolanaAddress(address);
  }
  
  
  async getBalance(address: string): Promise<ChainBalance> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Invalid Solana address',
        'solana'
      );
    }
    
    try {
      const balance = await getBalanceWithRetry(address);
      
      return {
        raw: BigInt(balance.lamports),
        formatted: balance.sol,
        symbol: 'SOL',
        decimals: 9,
        lastUpdated: balance.lastUpdated,
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get Solana balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'solana'
      );
    }
  }
  
  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Invalid Solana address',
        'solana'
      );
    }
    
    try {
      const splBalances = await getSPLTokenBalances();
      
      return splBalances.map(token => ({
        address: token.mint,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        rawBalance: token.rawBalance,
        uiBalance: token.uiBalance,
        logoUri: token.logoUri,
      }));
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get token balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'solana'
      );
    }
  }
  
  
  async createTransfer(from: string, to: string, amount: bigint): Promise<UnsignedChainTx> {
    if (!this.isValidAddress(from)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'solana');
    }
    if (!this.isValidAddress(to)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'solana');
    }
    
    
    return {
      chainType: 'solana',
      to,
      amount,
      _raw: { from, to, amount },
    };
  }
  
  async createTokenTransfer(
    from: string,
    to: string,
    tokenAddress: string,
    amount: bigint
  ): Promise<UnsignedChainTx> {
    
    
    if (!this.isValidAddress(from)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'solana');
    }
    if (!this.isValidAddress(to)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'solana');
    }
    if (!this.isValidAddress(tokenAddress)) {
      throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token mint address', 'solana');
    }
    
    return {
      chainType: 'solana',
      to,
      amount,
      tokenAddress,
      _raw: { from, to, tokenAddress, amount },
    };
  }
  
  async estimateFee(tx: UnsignedChainTx): Promise<ChainFeeEstimate> {
    try {
      const amountSol = Number(tx.amount) / LAMPORTS_PER_SOL;
      const feeEstimate = await estimateTransactionFee(tx.to, amountSol);
      
      return {
        fee: BigInt(feeEstimate.feeLamports),
        feeFormatted: feeEstimate.feeSol,
        symbol: 'SOL',
        priorityFee: BigInt(feeEstimate.priorityFee),
      };
    } catch (error) {
      
      return {
        fee: BigInt(5000),
        feeFormatted: 0.000005,
        symbol: 'SOL',
      };
    }
  }
  
  async signTransaction(tx: UnsignedChainTx, keypair: ChainKeypair): Promise<SignedChainTx> {
    
    if (tx.chainType !== 'solana' || keypair.chainType !== 'solana') {
      throw new ChainError(
        ChainErrorCode.CHAIN_MISMATCH,
        'Transaction and keypair must be for Solana',
        'solana'
      );
    }
    
    
    return {
      chainType: 'solana',
      serialized: JSON.stringify({
        to: tx.to,
        amount: tx.amount.toString(),
        tokenAddress: tx.tokenAddress,
      }),
      hash: '', 
      _raw: { tx, keypair },
    };
  }
  
  async broadcastTransaction(signedTx: SignedChainTx): Promise<TxResult> {
    if (signedTx.chainType !== 'solana') {
      throw new ChainError(
        ChainErrorCode.CHAIN_MISMATCH,
        'Transaction must be for Solana',
        'solana'
      );
    }
    
    
    const rawData = signedTx._raw as { tx: UnsignedChainTx; keypair: ChainKeypair };
    const { tx } = rawData;
    
    
    const amountSol = Number(tx.amount) / LAMPORTS_PER_SOL;
    
    try {
      const result = await sendSol({
        recipient: tx.to,
        amountSol,
      });
      
      return {
        hash: result.signature,
        explorerUrl: result.explorerUrl,
        confirmed: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transaction failed';
      
      if (message.includes('insufficient')) {
        throw new ChainError(ChainErrorCode.INSUFFICIENT_FUNDS, message, 'solana');
      }
      
      throw new ChainError(ChainErrorCode.BROADCAST_FAILED, message, 'solana');
    }
  }
  
  async getTransactionHistory(
    address: string,
    limit: number = 20,
    before?: string
  ): Promise<{ transactions: ChainTxHistoryItem[]; hasMore: boolean; cursor: string | null }> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid Solana address', 'solana');
    }
    
    try {
      const result = await getSolanaHistory({ limit, before });
      
      const transactions: ChainTxHistoryItem[] = result.transactions.map(tx => ({
        hash: tx.signature,
        timestamp: tx.timestamp,
        direction: tx.direction,
        amount: BigInt(tx.amountLamports),
        amountFormatted: tx.amountSol,
        symbol: 'SOL',
        status: tx.status,
        fee: BigInt(tx.feeLamports),
        counterparty: tx.counterparty,
        type: tx.type,
        block: tx.slot,
      }));
      
      return {
        transactions,
        hasMore: result.hasMore,
        cursor: result.cursor,
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'solana'
      );
    }
  }
  
  
  async getNetworkStatus(): Promise<NetworkStatus> {
    try {
      const status = await getSolanaNetworkStatus();
      const config = await getCurrentNetwork();
      
      return {
        connected: status.connected,
        latencyMs: status.latency,
        blockHeight: status.blockHeight,
        rpcUrl: config.rpcUrl,
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: -1,
        blockHeight: null,
        rpcUrl: '',
      };
    }
  }
  
  setNetwork(network: NetworkEnvironment): void {
    this._network = network;
    const solanaNetwork: SolanaNetwork = network === 'mainnet' ? 'mainnet-beta' : 'devnet';
    setSolanaNetwork(solanaNetwork);
  }
  
  getAddressExplorerUrl(address: string): string {
    const config = SOLANA_CHAINS[this._network === 'mainnet' ? 'mainnet-beta' : 'devnet'];
    const clusterParam = this._network === 'mainnet' ? '' : '?cluster=devnet';
    return `${config.explorerUrl}/address/${address}${clusterParam}`;
  }
  
  getTxExplorerUrl(hash: string): string {
    const config = SOLANA_CHAINS[this._network === 'mainnet' ? 'mainnet-beta' : 'devnet'];
    const clusterParam = this._network === 'mainnet' ? '' : '?cluster=devnet';
    return `${config.explorerUrl}/tx/${hash}${clusterParam}`;
  }
}


export function createSolanaAdapter(network: NetworkEnvironment = 'mainnet'): SolanaAdapter {
  return new SolanaAdapter(network);
}



