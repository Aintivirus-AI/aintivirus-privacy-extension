/**
 * AINTIVIRUS Wallet - EVM Chain Adapter
 * 
 * This adapter implements the ChainAdapter interface for all
 * EVM-compatible chains (Ethereum, Polygon, Arbitrum, Optimism, Base).
 * 
 * The same adapter class works for all EVM chains - they share
 * the same address format, transaction structure, and signing logic.
 * 
 * SECURITY:
 * - Chain ID is always verified before signing
 * - Private keys never leave memory
 * - All transactions use EIP-155 replay protection
 */

import { formatUnits } from 'ethers';
import type {
  ChainAdapter,
  ChainBalance,
  ChainFeeEstimate,
  ChainKeypair,
  ChainTxHistoryItem,
  EVMChainId,
  NetworkEnvironment,
  NetworkStatus,
  SignedChainTx,
  TokenBalance,
  TxResult,
  UnsignedChainTx,
} from '../types';
import { ChainError, ChainErrorCode } from '../types';
import {
  getEVMChainConfig,
  getNumericChainId,
  getEVMExplorerUrl,
} from '../config';
import {
  deriveEVMKeypair,
  getEVMAddressFromMnemonic,
  isValidEVMAddress,
  normalizeMnemonic,
  validateMnemonic,
  type EVMKeypair,
} from '../../keychain';
import {
  getBalance as getEVMBalance,
  getBlockNumber,
  getRpcHealthStats,
  getBestProvider,
} from './client';
import {
  estimateNativeTransferGas,
  estimateTokenTransferGas,
  type GasEstimate,
} from './gas';
import {
  createNativeTransfer,
  createTokenTransfer,
  signTransaction,
  broadcastTransaction,
  confirmTransaction,
  type UnsignedEVMTransaction,
} from './transactions';
import {
  getPopularTokenBalances,
  getMultipleTokenBalances,
  toTokenBalance,
} from './tokens';

// ============================================
// EVM ADAPTER IMPLEMENTATION
// ============================================

/**
 * EVM Chain Adapter
 * 
 * Implements ChainAdapter interface for all EVM-compatible chains.
 * A single adapter instance handles one specific chain (e.g., Ethereum).
 */
export class EVMAdapter implements ChainAdapter {
  readonly chainType = 'evm' as const;
  readonly evmChainId: EVMChainId;
  readonly chainName: string;
  readonly nativeSymbol: string;
  
  private _network: NetworkEnvironment;
  private _customTokens: string[] = [];
  
  constructor(evmChainId: EVMChainId, network: NetworkEnvironment = 'mainnet') {
    this.evmChainId = evmChainId;
    this._network = network;
    
    const config = getEVMChainConfig(evmChainId);
    this.chainName = config.name;
    this.nativeSymbol = config.symbol;
  }
  
  get network(): NetworkEnvironment {
    return this._network;
  }
  
  /**
   * Get the numeric chain ID for the current network
   */
  get numericChainId(): number {
    return getNumericChainId(this.evmChainId, this._network === 'testnet');
  }
  
  // ---- Account Operations ----
  
  async deriveAddress(mnemonic: string, index: number = 0): Promise<string> {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Invalid mnemonic phrase',
        'evm'
      );
    }
    
    return getEVMAddressFromMnemonic(normalized, index);
  }
  
  async getKeypair(mnemonic: string, index: number = 0): Promise<ChainKeypair> {
    const keypair = deriveEVMKeypair(mnemonic, index);
    
    return {
      chainType: 'evm',
      address: keypair.address,
      privateKey: keypair.privateKey,
      _raw: keypair,
    };
  }
  
  isValidAddress(address: string): boolean {
    return isValidEVMAddress(address);
  }
  
  // ---- Balance Operations ----
  
  async getBalance(address: string): Promise<ChainBalance> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Invalid EVM address',
        'evm'
      );
    }
    
    const testnet = this._network === 'testnet';
    
    try {
      const balance = await getEVMBalance(this.evmChainId, testnet, address);
      const config = getEVMChainConfig(this.evmChainId);
      
      return {
        raw: balance,
        formatted: parseFloat(formatUnits(balance, config.decimals)),
        symbol: config.symbol,
        decimals: config.decimals,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm'
      );
    }
  }
  
  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(
        ChainErrorCode.INVALID_ADDRESS,
        'Invalid EVM address',
        'evm'
      );
    }
    
    const testnet = this._network === 'testnet';
    
    try {
      // Get popular token balances
      const popularBalances = await getPopularTokenBalances(
        this.evmChainId,
        testnet,
        address
      );
      
      // Get custom token balances if any
      let customBalances: TokenBalance[] = [];
      if (this._customTokens.length > 0) {
        const custom = await getMultipleTokenBalances(
          this.evmChainId,
          testnet,
          address,
          this._customTokens
        );
        customBalances = custom.map(toTokenBalance);
      }
      
      // Combine and deduplicate
      const allBalances = [...popularBalances.map(toTokenBalance), ...customBalances];
      const seen = new Set<string>();
      
      return allBalances.filter(token => {
        const key = token.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get token balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm'
      );
    }
  }
  
  /**
   * Add a custom token to track
   */
  addCustomToken(tokenAddress: string): void {
    if (isValidEVMAddress(tokenAddress)) {
      const normalized = tokenAddress.toLowerCase();
      if (!this._customTokens.includes(normalized)) {
        this._customTokens.push(normalized);
      }
    }
  }
  
  /**
   * Remove a custom token
   */
  removeCustomToken(tokenAddress: string): void {
    const normalized = tokenAddress.toLowerCase();
    this._customTokens = this._customTokens.filter(t => t !== normalized);
  }
  
  // ---- Transaction Operations ----
  
  async createTransfer(from: string, to: string, amount: bigint): Promise<UnsignedChainTx> {
    if (!this.isValidAddress(from)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
    }
    if (!this.isValidAddress(to)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
    }
    
    const testnet = this._network === 'testnet';
    const unsignedTx = await createNativeTransfer(this.evmChainId, testnet, {
      from,
      to,
      amount,
    });
    
    return {
      chainType: 'evm',
      evmChainId: this.evmChainId,
      to,
      amount,
      _raw: unsignedTx,
    };
  }
  
  async createTokenTransfer(
    from: string,
    to: string,
    tokenAddress: string,
    amount: bigint
  ): Promise<UnsignedChainTx> {
    if (!this.isValidAddress(from)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
    }
    if (!this.isValidAddress(to)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
    }
    if (!this.isValidAddress(tokenAddress)) {
      throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
    }
    
    const testnet = this._network === 'testnet';
    const unsignedTx = await createTokenTransfer(this.evmChainId, testnet, {
      from,
      to,
      tokenAddress,
      amount,
    });
    
    return {
      chainType: 'evm',
      evmChainId: this.evmChainId,
      to,
      amount,
      tokenAddress,
      _raw: unsignedTx,
    };
  }
  
  async estimateFee(tx: UnsignedChainTx): Promise<ChainFeeEstimate> {
    const testnet = this._network === 'testnet';
    const config = getEVMChainConfig(this.evmChainId);
    
    let gasEstimate: GasEstimate;
    
    if (tx.tokenAddress) {
      gasEstimate = await estimateTokenTransferGas(
        this.evmChainId,
        testnet,
        '', // from - will use a dummy for estimation
        tx.to,
        tx.tokenAddress,
        tx.amount
      );
    } else {
      gasEstimate = await estimateNativeTransferGas(
        this.evmChainId,
        testnet,
        '', // from
        tx.to,
        tx.amount
      );
    }
    
    return {
      fee: gasEstimate.totalFee,
      feeFormatted: gasEstimate.totalFeeFormatted,
      symbol: config.symbol,
      gasPrice: gasEstimate.gasPrice,
      gasLimit: gasEstimate.gasLimit,
      l1DataFee: gasEstimate.l1DataFee,
      priorityFee: gasEstimate.maxPriorityFee,
    };
  }
  
  async signTransaction(tx: UnsignedChainTx, keypair: ChainKeypair): Promise<SignedChainTx> {
    // Verify chain type
    if (tx.chainType !== 'evm' || keypair.chainType !== 'evm') {
      throw new ChainError(
        ChainErrorCode.CHAIN_MISMATCH,
        'Transaction and keypair must be for EVM',
        'evm'
      );
    }
    
    // Verify chain ID matches
    if (tx.evmChainId && tx.evmChainId !== this.evmChainId) {
      throw new ChainError(
        ChainErrorCode.CHAIN_MISMATCH,
        `Transaction is for ${tx.evmChainId}, but adapter is for ${this.evmChainId}`,
        'evm'
      );
    }
    
    const unsignedTx = tx._raw as UnsignedEVMTransaction;
    const evmKeypair = keypair._raw as EVMKeypair;
    
    // Sign the transaction
    const signedTxHex = signTransaction(unsignedTx, evmKeypair, this.numericChainId);
    
    return {
      chainType: 'evm',
      serialized: signedTxHex,
      hash: '', // Will be set after broadcast
      _raw: { signedTx: signedTxHex, chainId: this.evmChainId, testnet: this._network === 'testnet' },
    };
  }
  
  async broadcastTransaction(signedTx: SignedChainTx): Promise<TxResult> {
    if (signedTx.chainType !== 'evm') {
      throw new ChainError(
        ChainErrorCode.CHAIN_MISMATCH,
        'Transaction must be for EVM',
        'evm'
      );
    }
    
    const testnet = this._network === 'testnet';
    const explorerBase = getEVMExplorerUrl(this.evmChainId, testnet);
    
    try {
      const txResponse = await broadcastTransaction(
        this.evmChainId,
        testnet,
        signedTx.serialized
      );
      
      const hash = txResponse.hash;
      const explorerUrl = `${explorerBase}/tx/${hash}`;
      
      // Wait for confirmation
      const receipt = await confirmTransaction(this.evmChainId, testnet, hash);
      
      if (receipt) {
        const success = receipt.status === 1;
        return {
          hash,
          explorerUrl,
          confirmed: success,
          error: success ? undefined : 'Transaction reverted',
        };
      }
      
      return {
        hash,
        explorerUrl,
        confirmed: false,
        error: 'Confirmation timeout - check explorer for status',
      };
    } catch (error) {
      if (error instanceof ChainError) {
        throw error;
      }
      
      throw new ChainError(
        ChainErrorCode.BROADCAST_FAILED,
        error instanceof Error ? error.message : 'Broadcast failed',
        'evm'
      );
    }
  }
  
  async getTransactionHistory(
    address: string,
    limit: number = 20,
    before?: string
  ): Promise<{ transactions: ChainTxHistoryItem[]; hasMore: boolean; cursor: string | null }> {
    // Note: EVM transaction history requires an indexer API
    // (Etherscan, etc.) which typically needs API keys.
    // For now, return empty and let UI show "View on Explorer" link.
    
    // In production, integrate with:
    // - Etherscan API
    // - Alchemy/Infura transaction APIs
    // - The Graph
    
    console.warn('[EVM Adapter] Transaction history not implemented - use block explorer');
    
    return {
      transactions: [],
      hasMore: false,
      cursor: null,
    };
  }
  
  // ---- Network Operations ----
  
  async getNetworkStatus(): Promise<NetworkStatus> {
    const testnet = this._network === 'testnet';
    
    try {
      const startTime = performance.now();
      const blockNumber = await getBlockNumber(this.evmChainId, testnet);
      const latency = Math.round(performance.now() - startTime);
      
      const provider = getBestProvider(this.evmChainId, testnet);
      
      return {
        connected: true,
        latencyMs: latency,
        blockHeight: blockNumber,
        rpcUrl: provider._getConnection().url,
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
  }
  
  getAddressExplorerUrl(address: string): string {
    const testnet = this._network === 'testnet';
    const explorerBase = getEVMExplorerUrl(this.evmChainId, testnet);
    return `${explorerBase}/address/${address}`;
  }
  
  getTxExplorerUrl(hash: string): string {
    const testnet = this._network === 'testnet';
    const explorerBase = getEVMExplorerUrl(this.evmChainId, testnet);
    return `${explorerBase}/tx/${hash}`;
  }
}

/**
 * Create an EVM adapter for a specific chain
 * 
 * @param evmChainId - Chain identifier
 * @param network - Network environment
 * @returns EVMAdapter instance
 */
export function createEVMAdapter(
  evmChainId: EVMChainId,
  network: NetworkEnvironment = 'mainnet'
): EVMAdapter {
  return new EVMAdapter(evmChainId, network);
}



