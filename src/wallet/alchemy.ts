// Alchemy API client for transaction history across ETH and SOL networks
import { parseUnits } from 'ethers';
import type { EVMChainId } from './types';

const ALCHEMY_API_KEY = process.env.AINTIVIRUS_ALCHEMY_API_KEY;

interface AlchemyEVMTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNum: string;
  category: string;
  asset?: string;
  rawContract?: {
    address?: string;
    value?: string;
    decimal?: string;
  };
  metadata?: {
    blockTimestamp?: string;
  };
}

interface AlchemyEVMHistoryResponse {
  transfers: AlchemyEVMTransaction[];
  pageKey?: string;
}

interface AlchemySolanaTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  fee: number;
  status: 'success' | 'failed';
  type: string;
  source: string;
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: Array<{
      mint: string;
      rawTokenAmount: {
        decimals: number;
        tokenAmount: string;
      };
    }>;
  }>;
}

interface AlchemySolanaHistoryResponse {
  transactions: AlchemySolanaTransaction[];
  pageKey?: string;
}

/**
 * Get Alchemy API URL for a given EVM chain
 */
function getAlchemyEVMUrl(evmChainId: EVMChainId, testnet: boolean): string | null {
  if (!ALCHEMY_API_KEY) {
    return null;
  }

  const networks: Record<EVMChainId, { mainnet: string; testnet: string }> = {
    ethereum: {
      mainnet: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      testnet: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    },
    polygon: {
      mainnet: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      testnet: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    },
    arbitrum: {
      mainnet: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      testnet: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    },
    optimism: {
      mainnet: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      testnet: `https://opt-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    },
    base: {
      mainnet: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      testnet: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    },
  };

  const urls = networks[evmChainId];
  if (!urls) return null;

  return testnet ? urls.testnet : urls.mainnet;
}

/**
 * Get Alchemy API URL for Solana
 */
function getAlchemySolanaUrl(testnet: boolean): string | null {
  if (!ALCHEMY_API_KEY) {
    return null;
  }

  return testnet
    ? `https://solana-devnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

/** Swap info for EVM transactions */
interface EVMSwapInfo {
  fromToken: {
    symbol: string;
    amount: number;
    address?: string;
  };
  toToken: {
    symbol: string;
    amount: number;
    address?: string;
  };
}

/**
 * Fetch EVM transaction history using Alchemy's Asset Transfers API
 */
export async function getAlchemyEVMHistory(
  evmChainId: EVMChainId,
  address: string,
  testnet: boolean,
  limit: number = 20,
  pageKey?: string,
): Promise<{
  transactions: Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    blockNum: string;
    timestamp: number;
    category: string;
    asset?: string;
    tokenAddress?: string;
    tokenValue?: string;
    tokenDecimals?: number;
    direction: 'sent' | 'received' | 'self';
    swapInfo?: EVMSwapInfo;
  }>;
  pageKey?: string;
}> {
  const url = getAlchemyEVMUrl(evmChainId, testnet);
  
  if (!url) {
    throw new Error('Alchemy API not configured for this chain');
  }

  try {
    const baseParams = {
      fromBlock: '0x0',
      toBlock: 'latest',
      category: ['external', 'erc20', 'erc721', 'erc1155', 'internal'],
      withMetadata: true,
      excludeZeroValue: false,
      maxCount: `0x${Math.min(limit, 1000).toString(16)}`,
      order: 'desc',
      ...(pageKey ? { pageKey } : {}),
    };

    const sentParams = { ...baseParams, fromAddress: address };
    const receivedParams = { ...baseParams, toAddress: address };

    // Fetch BOTH sent and received transactions in parallel with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s total timeout

    const fetchTransfers = async (params: any, id: number): Promise<AlchemyEVMTransaction[]> => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method: 'alchemy_getAssetTransfers',
            params: [params],
          }),
          signal: controller.signal,
        });

        if (!response.ok) return [];
        const data = await response.json();
        if (data.error) {
          return [];
        }
        return (data.result as AlchemyEVMHistoryResponse)?.transfers || [];
      } catch {
        return [];
      }
    };

    // Run both fetches in parallel
    const [sentTransfers, receivedTransfers] = await Promise.all([
      fetchTransfers(sentParams, 1),
      fetchTransfers(receivedParams, 2),
    ]);

    clearTimeout(timeoutId);

    // Tag each transaction with its direction based on which query it came from
    // This is more reliable than comparing from/to addresses (which can be misleading for internal txs)
    const taggedSent = sentTransfers.map(tx => ({ ...tx, _direction: 'sent' as const }));
    const taggedReceived = receivedTransfers.map(tx => ({ ...tx, _direction: 'received' as const }));

    // Group all transfers by transaction hash to detect swaps
    // A swap has both sent and received transfers in the same tx hash
    const txHashToTransfers = new Map<string, Array<AlchemyEVMTransaction & { _direction: 'sent' | 'received' }>>();
    
    for (const tx of [...taggedSent, ...taggedReceived]) {
      const existing = txHashToTransfers.get(tx.hash) || [];
      existing.push(tx);
      txHashToTransfers.set(tx.hash, existing);
    }
    
    // Build unique transaction list with swap detection
    type ProcessedTx = AlchemyEVMTransaction & { 
      _direction: 'sent' | 'received' | 'self';
      _swapInfo?: EVMSwapInfo;
    };
    
    const processedTxs: ProcessedTx[] = [];
    const processedHashes = new Set<string>();
    
    for (const [hash, transfers] of txHashToTransfers) {
      if (processedHashes.has(hash)) continue;
      processedHashes.add(hash);
      
      const sentTxs = transfers.filter(t => t._direction === 'sent');
      const receivedTxs = transfers.filter(t => t._direction === 'received');
      
      // Check if this is a swap (has both sent and received with different assets)
      if (sentTxs.length > 0 && receivedTxs.length > 0) {
        // Find the first sent and received with different assets (swap)
        const sentTx = sentTxs[0];
        const receivedTx = receivedTxs.find(r => 
          (r.asset || 'ETH') !== (sentTx.asset || 'ETH') || 
          r.rawContract?.address !== sentTx.rawContract?.address
        ) || receivedTxs[0];
        
        // If we found different assets, it's a swap
        const sentAsset = sentTx.asset || 'ETH';
        const receivedAsset = receivedTx.asset || 'ETH';
        const isDifferentAsset = sentAsset !== receivedAsset || 
          sentTx.rawContract?.address !== receivedTx.rawContract?.address;
        
        if (isDifferentAsset) {
          // Parse amounts for swap info
          const parseAmount = (tx: AlchemyEVMTransaction): number => {
            if (tx.rawContract?.value) {
              try {
                const decimals = tx.rawContract.decimal ? parseInt(tx.rawContract.decimal) : 18;
                return Number(BigInt(tx.rawContract.value)) / Math.pow(10, decimals);
              } catch {
                return 0;
              }
            }
            return parseFloat(tx.value || '0');
          };
          
          const swapInfo: EVMSwapInfo = {
            fromToken: {
              symbol: sentAsset,
              amount: parseAmount(sentTx),
              address: sentTx.rawContract?.address,
            },
            toToken: {
              symbol: receivedAsset,
              amount: parseAmount(receivedTx),
              address: receivedTx.rawContract?.address,
            },
          };
          
          processedTxs.push({
            ...sentTx,
            _direction: 'self',
            _swapInfo: swapInfo,
          });
          continue;
        }
      }
      
      // Not a swap - use the first transfer (prefer sent for self-transfers)
      const primaryTx = sentTxs[0] || receivedTxs[0];
      if (primaryTx) {
        processedTxs.push(primaryTx);
      }
    }

    // Sort by block number (descending)
    processedTxs.sort((a, b) => {
      const blockA = parseInt(a.blockNum, 16);
      const blockB = parseInt(b.blockNum, 16);
      return blockB - blockA;
    });

    // Helper to convert Alchemy's decimal value to Wei string
    const toWeiString = (decimalValue: string, decimals: number = 18): string => {
      try {
        if (!decimalValue || decimalValue === '0') return '0';
        // parseUnits handles decimal strings properly (e.g., "0.00118" -> "1180000000000000")
        return parseUnits(decimalValue, decimals).toString();
      } catch {
        // If parsing fails, return 0
        return '0';
      }
    };

    const transactions = processedTxs.slice(0, limit).map((tx) => {
      // For token transfers, use rawContract.value (already in smallest units as hex)
      // For native transfers, convert the decimal value to Wei
      let valueInWei: string;
      if (tx.rawContract?.value) {
        // Token transfer - rawContract.value is hex, convert to decimal string
        try {
          valueInWei = BigInt(tx.rawContract.value).toString();
        } catch {
          valueInWei = '0';
        }
      } else {
        // Native transfer - value is decimal (e.g., "0.00118"), convert to Wei
        valueInWei = toWeiString(tx.value || '0', 18);
      }

      // Parse timestamp from metadata.blockTimestamp (ISO 8601 format from Alchemy)
      let parsedTimestamp = 0;
      const blockTimestamp = tx.metadata?.blockTimestamp;
      if (blockTimestamp) {
        try {
          const date = new Date(blockTimestamp);
          if (!isNaN(date.getTime())) {
            parsedTimestamp = Math.floor(date.getTime() / 1000);
          }
        } catch {
          parsedTimestamp = 0;
        }
      }

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || '',
        value: valueInWei, // Now always in Wei as a string
        blockNum: tx.blockNum,
        timestamp: parsedTimestamp,
        category: tx.category,
        asset: tx.asset,
        tokenAddress: tx.rawContract?.address,
        tokenValue: tx.rawContract?.value,
        tokenDecimals: tx.rawContract?.decimal ? parseInt(tx.rawContract.decimal) : undefined,
        direction: tx._direction, // Pass the tagged direction from the query type
        swapInfo: tx._swapInfo, // Include swap info if detected
      };
    });

    // For transactions with missing timestamps, fetch block timestamps
    const txsWithoutTimestamp = transactions.filter(tx => !tx.timestamp);
    if (txsWithoutTimestamp.length > 0) {
      // Get unique block numbers
      const uniqueBlocks = [...new Set(txsWithoutTimestamp.map(tx => tx.blockNum))];
      
      // Fetch block timestamps (limit to first 10 blocks to avoid too many requests)
      const blocksToFetch = uniqueBlocks.slice(0, 10);
      const blockTimestamps: Record<string, number> = {};
      
      try {
        const blockPromises = blocksToFetch.map(async (blockNum) => {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getBlockByNumber',
                params: [blockNum, false],
              }),
            });
            const data = await response.json();
            if (data.result?.timestamp) {
              blockTimestamps[blockNum] = parseInt(data.result.timestamp, 16);
            }
          } catch {
            // Ignore errors for individual blocks
          }
        });
        
        await Promise.all(blockPromises);
        
        // Update transactions with block timestamps
        transactions.forEach(tx => {
          if (!tx.timestamp && blockTimestamps[tx.blockNum]) {
            tx.timestamp = blockTimestamps[tx.blockNum];
          }
        });
      } catch {
        // If batch fetching fails, continue without timestamps
      }
    }
    
    return {
      transactions,
      pageKey: undefined,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Note: Alchemy for Solana doesn't offer enhanced transaction history APIs like ETH
 * Solana transaction history is fetched using standard RPC methods in history.ts
 * Alchemy's benefit for Solana is providing a reliable RPC endpoint (configured in network settings)
 * This function is kept for potential future use if Alchemy adds enhanced Solana APIs
 */

/**
 * Check if Alchemy is configured
 */
export function isAlchemyConfigured(): boolean {
  return !!ALCHEMY_API_KEY;
}

