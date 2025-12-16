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
import { getEVMChainConfig, getNumericChainId, getEVMExplorerUrl } from '../config';
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
import { estimateNativeTransferGas, estimateTokenTransferGas, type GasEstimate } from './gas';
import {
  createNativeTransfer,
  createTokenTransfer,
  signTransaction,
  broadcastTransaction,
  confirmTransaction,
  type UnsignedEVMTransaction,
} from './transactions';
import { getPopularTokenBalances, getMultipleTokenBalances, toTokenBalance } from './tokens';
import { getAlchemyEVMHistory, isAlchemyConfigured } from '../../alchemy';

// EVM adapter implements ChainAdapter using the shared EVM utilities below.
const historyCache = new Map<
  string,
  {
    transactions: ChainTxHistoryItem[];
    timestamp: number;
    hasMore: boolean;
  }
>();

const HISTORY_CACHE_TTL = 2 * 60 * 1000;

function getCachedHistory(
  key: string,
): { transactions: ChainTxHistoryItem[]; hasMore: boolean } | null {
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
    return { transactions: cached.transactions, hasMore: cached.hasMore };
  }
  return null;
}

function setCachedHistory(key: string, transactions: ChainTxHistoryItem[], hasMore: boolean): void {
  historyCache.set(key, { transactions, timestamp: Date.now(), hasMore });
}

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

  get numericChainId(): number {
    return getNumericChainId(this.evmChainId, this._network === 'testnet');
  }

  async deriveAddress(mnemonic: string, index: number = 0): Promise<string> {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid mnemonic phrase', 'evm');
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

  async getBalance(address: string): Promise<ChainBalance> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid EVM address', 'evm');
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
        'evm',
      );
    }
  }

  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    if (!this.isValidAddress(address)) {
      throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid EVM address', 'evm');
    }

    const testnet = this._network === 'testnet';

    try {
      const popularBalances = await getPopularTokenBalances(this.evmChainId, testnet, address);

      let customBalances: TokenBalance[] = [];
      if (this._customTokens.length > 0) {
        const custom = await getMultipleTokenBalances(
          this.evmChainId,
          testnet,
          address,
          this._customTokens,
        );
        customBalances = custom.map(toTokenBalance);
      }

      const allBalances = [...popularBalances.map(toTokenBalance), ...customBalances];
      const seen = new Set<string>();

      return allBalances.filter((token) => {
        const key = token.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch (error) {
      throw new ChainError(
        ChainErrorCode.NETWORK_ERROR,
        `Failed to get token balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'evm',
      );
    }
  }

  addCustomToken(tokenAddress: string): void {
    if (isValidEVMAddress(tokenAddress)) {
      const normalized = tokenAddress.toLowerCase();
      if (!this._customTokens.includes(normalized)) {
        this._customTokens.push(normalized);
      }
    }
  }

  removeCustomToken(tokenAddress: string): void {
    const normalized = tokenAddress.toLowerCase();
    this._customTokens = this._customTokens.filter((t) => t !== normalized);
  }

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
    amount: bigint,
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
        '',
        tx.to,
        tx.tokenAddress,
        tx.amount,
      );
    } else {
      gasEstimate = await estimateNativeTransferGas(this.evmChainId, testnet, '', tx.to, tx.amount);
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
    if (tx.chainType !== 'evm' || keypair.chainType !== 'evm') {
      throw new ChainError(
        ChainErrorCode.CHAIN_MISMATCH,
        'Transaction and keypair must be for EVM',
        'evm',
      );
    }

    if (tx.evmChainId && tx.evmChainId !== this.evmChainId) {
      throw new ChainError(
        ChainErrorCode.CHAIN_MISMATCH,
        `Transaction is for ${tx.evmChainId}, but adapter is for ${this.evmChainId}`,
        'evm',
      );
    }

    const unsignedTx = tx._raw as UnsignedEVMTransaction;
    const evmKeypair = keypair._raw as EVMKeypair;

    const signedTxHex = signTransaction(unsignedTx, evmKeypair, this.numericChainId);

    return {
      chainType: 'evm',
      serialized: signedTxHex,
      hash: '',
      _raw: {
        signedTx: signedTxHex,
        chainId: this.evmChainId,
        testnet: this._network === 'testnet',
      },
    };
  }

  async broadcastTransaction(signedTx: SignedChainTx): Promise<TxResult> {
    if (signedTx.chainType !== 'evm') {
      throw new ChainError(ChainErrorCode.CHAIN_MISMATCH, 'Transaction must be for EVM', 'evm');
    }

    const testnet = this._network === 'testnet';
    const explorerBase = getEVMExplorerUrl(this.evmChainId, testnet);

    try {
      const txResponse = await broadcastTransaction(this.evmChainId, testnet, signedTx.serialized);

      const hash = txResponse.hash;
      const explorerUrl = `${explorerBase}/tx/${hash}`;

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
        'evm',
      );
    }
  }

  async getTransactionHistory(
    address: string,
    limit: number = 20,
    before?: string,
  ): Promise<{ transactions: ChainTxHistoryItem[]; hasMore: boolean; cursor: string | null }> {
    const testnet = this._network === 'testnet';
    const explorerBase = getEVMExplorerUrl(this.evmChainId, testnet);

    const cacheKey = `${this.evmChainId}:${address.toLowerCase()}:${testnet}`;
    const cached = getCachedHistory(cacheKey);
    if (cached && !before) {
      return { ...cached, cursor: null };
    }

    // Use Alchemy if configured, otherwise fallback to Etherscan-like APIs
    if (isAlchemyConfigured()) {
      try {
        const result = await getAlchemyEVMHistory(
          this.evmChainId,
          address,
          testnet,
          limit,
          before,
        );

        const transactions: ChainTxHistoryItem[] = result.transactions.map((tx) => {
          // Alchemy now returns value as Wei string (converted in alchemy.ts)
          const value = BigInt(tx.value || '0');
          const valueFormatted = Number(formatUnits(value, this.nativeDecimals));

          // Use the direction from Alchemy (based on which query returned this tx)
          // This is more reliable than comparing from/to addresses
          const direction = tx.direction;
          const isOutgoing = direction === 'sent';

          // Check for self-transfer (same address sent to itself)
          const isSelfTransfer = tx.from.toLowerCase() === address.toLowerCase() && 
                                  tx.to?.toLowerCase() === address.toLowerCase();
          const finalDirection: 'sent' | 'received' | 'self' | 'unknown' = isSelfTransfer ? 'self' : direction;

          // Set descriptive type based on category and direction
          let type: string;
          if (tx.category === 'erc20') {
            type = isOutgoing ? 'Sent Token' : 'Received Token';
          } else if (tx.category === 'erc721' || tx.category === 'erc1155') {
            type = isOutgoing ? 'Sent NFT' : 'Received NFT';
          } else {
            // Native currency (ETH, MATIC, etc.)
            type = isOutgoing ? 'Sent' : 'Received';
          }

          return {
            hash: tx.hash,
            timestamp: tx.timestamp || null,
            direction: finalDirection,
            type,
            amount: value,
            amountFormatted: valueFormatted,
            symbol: this.nativeSymbol,
            counterparty: isOutgoing ? tx.to : tx.from,
            fee: BigInt(0), // Alchemy doesn't provide fee in transfers API
            status: 'confirmed' as const,
            block: parseInt(tx.blockNum, 16),
            explorerUrl: `${explorerBase}/tx/${tx.hash}`,
            tokenAddress: tx.tokenAddress,
          };
        });

        const hasMore = !!result.pageKey;
        setCachedHistory(cacheKey, transactions, hasMore);

        return {
          transactions,
          hasMore,
          cursor: result.pageKey || null,
        };
      } catch {
        // Fall through to Etherscan fallback
      }
    }

    // Fallback to Etherscan-like APIs
    try {
      const apiUrl = this.getExplorerApiUrl(testnet);
      if (!apiUrl) {
        return { transactions: [], hasMore: false, cursor: null };
      }

      const txListUrl = `${apiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;

      const response = await fetch(txListUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== '1' || !Array.isArray(data.result)) {
        if (cached) {
          return { ...cached, cursor: null };
        }
        return { transactions: [], hasMore: false, cursor: null };
      }

      const transactions: ChainTxHistoryItem[] = data.result.map((tx: any) => {
        const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();
        const value = BigInt(tx.value || '0');
        const valueFormatted = Number(formatUnits(value, this.nativeDecimals));

        let direction: 'sent' | 'received' | 'self' | 'unknown' = 'unknown';
        if (isOutgoing && tx.to?.toLowerCase() === address.toLowerCase()) {
          direction = 'self';
        } else if (isOutgoing) {
          direction = 'sent';
        } else {
          direction = 'received';
        }

        // Determine type from method signature or default to direction-based type
        let type: string;
        if (tx.input && tx.input !== '0x' && tx.input.length > 2) {
          const methodId = tx.input.slice(0, 10);
          type = this.decodeMethodType(methodId);
        } else {
          // Simple transfer with no contract data
          type = isOutgoing ? 'Sent' : 'Received';
        }

        const gasUsed = tx.gasUsed ? BigInt(tx.gasUsed) * BigInt(tx.gasPrice || '0') : BigInt(0);

        return {
          hash: tx.hash,
          timestamp: parseInt(tx.timeStamp, 10),
          direction,
          type,
          amount: value,
          amountFormatted: valueFormatted,
          symbol: this.nativeSymbol,
          counterparty: isOutgoing ? tx.to : tx.from,
          fee: gasUsed,
          status:
            tx.txreceipt_status === '1'
              ? 'confirmed'
              : tx.txreceipt_status === '0'
                ? 'failed'
                : 'pending',
          block: parseInt(tx.blockNumber || '0', 10),
          explorerUrl: `${explorerBase}/tx/${tx.hash}`,
        };
      });

      const hasMore = transactions.length >= limit;
      setCachedHistory(cacheKey, transactions, hasMore);

      return {
        transactions,
        hasMore,
        cursor: transactions.length > 0 ? transactions[transactions.length - 1].hash : null,
      };
    } catch {
      const staleCache = getCachedHistory(cacheKey);
      if (staleCache) {
        return { ...staleCache, cursor: null };
      }
      return { transactions: [], hasMore: false, cursor: null };
    }
  }

  private getExplorerApiUrl(testnet: boolean): string | null {
    const apiUrls: Record<EVMChainId, { mainnet: string; testnet: string }> = {
      ethereum: {
        mainnet: 'https://api.etherscan.io/api',
        testnet: 'https://api-sepolia.etherscan.io/api',
      },
      polygon: {
        mainnet: 'https://api.polygonscan.com/api',
        testnet: 'https://api-amoy.polygonscan.com/api',
      },
      arbitrum: {
        mainnet: 'https://api.arbiscan.io/api',
        testnet: 'https://api-sepolia.arbiscan.io/api',
      },
      optimism: {
        mainnet: 'https://api-optimistic.etherscan.io/api',
        testnet: 'https://api-sepolia-optimistic.etherscan.io/api',
      },
      base: {
        mainnet: 'https://api.basescan.org/api',
        testnet: 'https://api-sepolia.basescan.org/api',
      },
    };

    const urls = apiUrls[this.evmChainId];
    if (!urls) return null;

    return testnet ? urls.testnet : urls.mainnet;
  }

  private decodeMethodType(methodId: string): string {
    const methodTypes: Record<string, string> = {
      '0xa9059cbb': 'Token Transfer',
      '0x23b872dd': 'Token Transfer',
      '0x095ea7b3': 'Token Approval',
      '0x38ed1739': 'Swap',
      '0x8803dbee': 'Swap',
      '0x7ff36ab5': 'Swap',
      '0x18cbafe5': 'Swap',
      '0x5c11d795': 'Swap',
      '0x791ac947': 'Swap',
      '0xfb3bdb41': 'Swap',
      '0xe8e33700': 'Add Liquidity',
      '0xf305d719': 'Add Liquidity',
      '0xbaa2abde': 'Remove Liquidity',
      '0x02751cec': 'Remove Liquidity',
      '0x2e1a7d4d': 'Withdraw',
      '0xd0e30db0': 'Deposit',
      '0x42842e0e': 'NFT Transfer',
      '0xb88d4fde': 'NFT Transfer',
      '0xa22cb465': 'NFT Approval',
    };

    return methodTypes[methodId.toLowerCase()] || 'Contract Call';
  }

  private get nativeDecimals(): number {
    return 18;
  }

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

export function createEVMAdapter(
  evmChainId: EVMChainId,
  network: NetworkEnvironment = 'mainnet',
): EVMAdapter {
  return new EVMAdapter(evmChainId, network);
}
