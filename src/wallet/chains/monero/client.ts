/**
 * Monero Node RPC Client
 * 
 * Connects to Monero daemon RPC for blockchain data.
 * For watch-only wallets, we can query outputs and transactions.
 */

import type {
  MoneroBalance,
  MoneroTransaction,
  MoneroNetworkInfo,
  MoneroOutput,
} from './types';
import {
  PUBLIC_MONERO_NODES,
  PUBLIC_MONERO_TESTNET_NODES,
  MONERO_CONSTANTS,
  piconeroToXmr,
} from './config';

const API_TIMEOUT = 30000;

// ============================================================================
// RPC Helper Functions
// ============================================================================

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

async function rpcCall<T>(
  nodeUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: '0',
    method,
    params,
  };

  const response = await fetchWithTimeout(`${nodeUrl}/json_rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data: JsonRpcResponse<T> = await response.json();

  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }

  if (data.result === undefined) {
    throw new Error('Empty RPC response');
  }

  return data.result;
}

// ============================================================================
// Node Selection
// ============================================================================

let currentNodeIndex = 0;

/**
 * Get the current node URL, cycling through available nodes on failure
 */
export function getCurrentNode(testnet: boolean = false): string {
  const nodes = testnet ? PUBLIC_MONERO_TESTNET_NODES : PUBLIC_MONERO_NODES;
  return nodes[currentNodeIndex % nodes.length].url;
}

/**
 * Switch to the next available node
 */
export function switchToNextNode(testnet: boolean = false): string {
  const nodes = testnet ? PUBLIC_MONERO_TESTNET_NODES : PUBLIC_MONERO_NODES;
  currentNodeIndex = (currentNodeIndex + 1) % nodes.length;
  return nodes[currentNodeIndex].url;
}

/**
 * Try to execute a function with node failover
 */
async function withNodeFailover<T>(
  fn: (nodeUrl: string) => Promise<T>,
  testnet: boolean = false
): Promise<T> {
  const nodes = testnet ? PUBLIC_MONERO_TESTNET_NODES : PUBLIC_MONERO_NODES;
  let lastError: Error | null = null;

  for (let i = 0; i < nodes.length; i++) {
    const nodeUrl = getCurrentNode(testnet);
    try {
      return await fn(nodeUrl);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      switchToNextNode(testnet);
    }
  }

  throw lastError || new Error('All nodes failed');
}

// ============================================================================
// Network Information
// ============================================================================

interface GetInfoResponse {
  height: number;
  difficulty: number;
  target_height: number;
  top_block_hash: string;
  tx_count: number;
  tx_pool_size: number;
  status: string;
}

/**
 * Get current network information
 */
export async function getNetworkInfo(testnet: boolean = false): Promise<MoneroNetworkInfo> {
  return withNodeFailover(async (nodeUrl) => {
    const info = await rpcCall<GetInfoResponse>(nodeUrl, 'get_info');

    return {
      height: info.height,
      difficulty: BigInt(info.difficulty),
      timestamp: Date.now(),
      synchronized: info.height >= info.target_height,
    };
  }, testnet);
}

/**
 * Get current block height
 */
export async function getBlockHeight(testnet: boolean = false): Promise<number> {
  return withNodeFailover(async (nodeUrl) => {
    const info = await rpcCall<GetInfoResponse>(nodeUrl, 'get_info');
    return info.height;
  }, testnet);
}

// ============================================================================
// Balance and Outputs (Limited for Watch-Only)
// ============================================================================

/**
 * Note: Getting balance for a watch-only wallet without a wallet daemon
 * is not straightforward. The Monero daemon RPC doesn't directly support
 * querying balances by address without a wallet.
 * 
 * Options for implementation:
 * 1. Use a Monero wallet RPC (requires running monerod + monero-wallet-rpc)
 * 2. Use a blockchain explorer API
 * 3. Scan the blockchain manually (complex, requires view key cryptography)
 * 
 * This implementation uses the Monero blockchain explorer API as a fallback.
 */

interface ExplorerBalanceResponse {
  data?: {
    spent_outputs?: {
      amount: number;
    }[];
    outputs?: {
      amount: number;
    }[];
    total_received?: string;
    total_sent?: string;
  };
}

/**
 * Get balance for an address using blockchain explorer
 * Note: This is limited functionality for watch-only wallets
 */
export async function getBalance(
  address: string,
  viewKey: string,
  testnet: boolean = false
): Promise<MoneroBalance> {
  try {
    // Using xmrchain.net API (or similar explorer)
    const explorerBase = testnet 
      ? 'https://stagenet.xmrchain.net/api'
      : 'https://xmrchain.net/api';
    
    // Note: Most explorers require the view key for accurate balance
    // This is a simplified implementation
    const response = await fetchWithTimeout(
      `${explorerBase}/outputs?address=${address}&viewkey=${viewKey}&limit=100`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      // If explorer fails, return zero balance
      return {
        balance: BigInt(0),
        unlockedBalance: BigInt(0),
        balanceXmr: 0,
        outputCount: 0,
      };
    }

    const data: ExplorerBalanceResponse = await response.json();
    
    // Calculate balance from outputs
    let totalReceived = BigInt(0);
    let outputCount = 0;

    if (data.data?.outputs) {
      for (const output of data.data.outputs) {
        totalReceived += BigInt(output.amount || 0);
        outputCount++;
      }
    }

    // Note: For accurate balance, we'd need to track spent outputs
    // This shows incoming amounts only for watch-only wallets
    return {
      balance: totalReceived,
      unlockedBalance: totalReceived,
      balanceXmr: piconeroToXmr(totalReceived),
      outputCount,
    };
  } catch {
    // Return empty balance on error
    return {
      balance: BigInt(0),
      unlockedBalance: BigInt(0),
      balanceXmr: 0,
      outputCount: 0,
    };
  }
}

// ============================================================================
// Transaction History
// ============================================================================

interface ExplorerTxResponse {
  data?: {
    txs?: Array<{
      tx_hash: string;
      block_height: number;
      timestamp: number;
      total_received?: string;
      total_sent?: string;
    }>;
  };
}

/**
 * Get transaction history for an address
 * Note: This uses explorer API and may have limitations
 */
export async function getTransactions(
  address: string,
  viewKey: string,
  testnet: boolean = false,
  limit: number = 20
): Promise<MoneroTransaction[]> {
  try {
    const explorerBase = testnet 
      ? 'https://stagenet.xmrchain.net/api'
      : 'https://xmrchain.net/api';
    
    const response = await fetchWithTimeout(
      `${explorerBase}/transactions?address=${address}&viewkey=${viewKey}&limit=${limit}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data: ExplorerTxResponse = await response.json();
    
    if (!data.data?.txs) {
      return [];
    }

    const currentHeight = await getBlockHeight(testnet);

    return data.data.txs.map(tx => ({
      hash: tx.tx_hash,
      blockHeight: tx.block_height,
      timestamp: tx.timestamp,
      confirmations: tx.block_height > 0 ? currentHeight - tx.block_height : 0,
      amount: BigInt(tx.total_received || '0'),
      isIncoming: true, // Watch-only can primarily see incoming
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a node is reachable
 */
export async function checkNodeHealth(nodeUrl: string): Promise<boolean> {
  try {
    await rpcCall<GetInfoResponse>(nodeUrl, 'get_info');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the best available node
 */
export async function findBestNode(testnet: boolean = false): Promise<string | null> {
  const nodes = testnet ? PUBLIC_MONERO_TESTNET_NODES : PUBLIC_MONERO_NODES;
  
  for (const node of nodes) {
    if (await checkNodeHealth(node.url)) {
      return node.url;
    }
  }
  
  return null;
}
