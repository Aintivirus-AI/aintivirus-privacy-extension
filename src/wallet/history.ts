/**
 * AINTIVIRUS Wallet Module - Transaction History
 * 
 * This module handles fetching and parsing transaction history:
 * - Fetch recent transactions via RPC
 * - Parse transaction data into readable format
 * - Cache management for performance
 * 
 * Uses standard Solana RPC methods:
 * - getSignaturesForAddress: Get transaction signatures
 * - getParsedTransaction: Get detailed transaction info
 */

import {
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TransactionHistoryItem,
  TransactionHistoryResult,
  TransactionDirection,
  TransactionStatus,
  WalletError,
  WalletErrorCode,
} from './types';
import { getCurrentConnection } from './rpc';
import { getPublicAddress } from './storage';

// ============================================
// CONSTANTS
// ============================================

/**
 * Default number of transactions to fetch per page
 */
const DEFAULT_LIMIT = 20;

/**
 * Maximum number of transactions to fetch per request
 */
const MAX_LIMIT = 100;

/**
 * Cache duration in milliseconds (5 minutes)
 */
const CACHE_DURATION = 5 * 60 * 1000;

// ============================================
// CACHE
// ============================================

interface CachedHistory {
  transactions: TransactionHistoryItem[];
  fetchedAt: number;
  address: string;
}

let historyCache: CachedHistory | null = null;

/**
 * Clear the transaction history cache
 */
export function clearHistoryCache(): void {
  historyCache = null;
}

/**
 * Check if cache is valid
 */
function isCacheValid(address: string): boolean {
  if (!historyCache) return false;
  if (historyCache.address !== address) return false;
  if (Date.now() - historyCache.fetchedAt > CACHE_DURATION) return false;
  return true;
}

// ============================================
// TRANSACTION HISTORY
// ============================================

/**
 * Get transaction history for the wallet
 * 
 * @param options - Pagination options
 * @returns Transaction history result
 */
export async function getTransactionHistory(
  options: { limit?: number; before?: string } = {}
): Promise<TransactionHistoryResult> {
  const { limit = DEFAULT_LIMIT, before } = options;
  
  // Get wallet address
  const address = await getPublicAddress();
  if (!address) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }

  // Use cache for first page if available
  if (!before && isCacheValid(address)) {
    const cached = historyCache!.transactions.slice(0, limit);
    return {
      transactions: cached,
      hasMore: historyCache!.transactions.length > limit,
      cursor: cached.length > 0 ? cached[cached.length - 1].signature : null,
    };
  }

  try {
    const connection = await getCurrentConnection();
    const publicKey = new PublicKey(address);
    
    // Fetch signatures
    const signatures = await connection.getSignaturesForAddress(
      publicKey,
      {
        limit: Math.min(limit, MAX_LIMIT),
        before: before || undefined,
      }
    );

    if (signatures.length === 0) {
      return {
        transactions: [],
        hasMore: false,
        cursor: null,
      };
    }

    // Fetch transaction details
    const transactions = await fetchTransactionDetails(
      signatures,
      address
    );

    // Update cache for first page
    if (!before) {
      historyCache = {
        transactions,
        fetchedAt: Date.now(),
        address,
      };
    }

    return {
      transactions,
      hasMore: signatures.length === limit,
      cursor: transactions.length > 0 
        ? transactions[transactions.length - 1].signature 
        : null,
    };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      `Failed to fetch transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Fetch detailed transaction information for signatures
 * 
 * @param signatures - Array of signature info
 * @param walletAddress - Wallet address for direction detection
 * @returns Parsed transaction items
 */
async function fetchTransactionDetails(
  signatures: ConfirmedSignatureInfo[],
  walletAddress: string
): Promise<TransactionHistoryItem[]> {
  const connection = await getCurrentConnection();
  const transactions: TransactionHistoryItem[] = [];

  // Batch fetch transactions (max 100 per request)
  const signatureStrings = signatures.map(s => s.signature);
  
  // Fetch in batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < signatureStrings.length; i += batchSize) {
    const batch = signatureStrings.slice(i, i + batchSize);
    
    const parsedTransactions = await Promise.all(
      batch.map(sig => 
        connection.getParsedTransaction(sig, {
          maxSupportedTransactionVersion: 0,
        }).catch(() => null)
      )
    );

    for (let j = 0; j < batch.length; j++) {
      const parsed = parsedTransactions[j];
      const sigInfo = signatures[i + j];
      
      const item = parseTransactionToHistoryItem(
        sigInfo,
        parsed,
        walletAddress
      );
      
      transactions.push(item);
    }
  }

  return transactions;
}

/**
 * Parse a transaction into a history item
 * 
 * @param sigInfo - Signature info from getSignaturesForAddress
 * @param parsed - Parsed transaction data (may be null)
 * @param walletAddress - Wallet address for direction detection
 * @returns Transaction history item
 */
function parseTransactionToHistoryItem(
  sigInfo: ConfirmedSignatureInfo,
  parsed: ParsedTransactionWithMeta | null,
  walletAddress: string
): TransactionHistoryItem {
  // Base item from signature info
  const item: TransactionHistoryItem = {
    signature: sigInfo.signature,
    timestamp: sigInfo.blockTime ?? null,
    direction: 'unknown',
    amountLamports: 0,
    amountSol: 0,
    status: sigInfo.err ? 'failed' : 'confirmed',
    feeLamports: 0,
    counterparty: null,
    type: 'Unknown',
    slot: sigInfo.slot,
  };

  // If we don't have parsed data, return basic item
  if (!parsed || !parsed.meta) {
    return item;
  }

  // Get fee
  item.feeLamports = parsed.meta.fee;

  // Parse transaction type and amount
  const result = parseTransferInfo(parsed, walletAddress);
  item.direction = result.direction;
  item.amountLamports = result.amount;
  item.amountSol = result.amount / LAMPORTS_PER_SOL;
  item.counterparty = result.counterparty;
  item.type = result.type;

  return item;
}

/**
 * Parse transfer information from a parsed transaction
 * 
 * @param parsed - Parsed transaction
 * @param walletAddress - Wallet address
 * @returns Transfer info
 */
function parseTransferInfo(
  parsed: ParsedTransactionWithMeta,
  walletAddress: string
): {
  direction: TransactionDirection;
  amount: number;
  counterparty: string | null;
  type: string;
} {
  const meta = parsed.meta;
  const message = parsed.transaction.message;
  
  if (!meta) {
    return {
      direction: 'unknown',
      amount: 0,
      counterparty: null,
      type: 'Unknown',
    };
  }

  // Find wallet account index
  const accountKeys = message.accountKeys;
  const walletIndex = accountKeys.findIndex(
    key => key.pubkey.toBase58() === walletAddress
  );

  if (walletIndex === -1) {
    return {
      direction: 'unknown',
      amount: 0,
      counterparty: null,
      type: 'Unknown',
    };
  }

  // Calculate SOL change for wallet
  const preBalance = meta.preBalances[walletIndex] || 0;
  const postBalance = meta.postBalances[walletIndex] || 0;
  const balanceChange = postBalance - preBalance;

  // Determine direction and amount
  let direction: TransactionDirection = 'unknown';
  let amount = 0;
  let counterparty: string | null = null;

  if (balanceChange > 0) {
    direction = 'received';
    amount = balanceChange;
    // Find sender (account that lost SOL)
    counterparty = findCounterparty(meta, accountKeys, 'sender');
  } else if (balanceChange < 0) {
    direction = 'sent';
    // Amount is absolute value minus fee
    amount = Math.abs(balanceChange) - meta.fee;
    if (amount < 0) amount = 0;
    // Find recipient (account that gained SOL)
    counterparty = findCounterparty(meta, accountKeys, 'recipient');
  }

  // Determine transaction type
  const type = determineTransactionType(parsed, direction);

  return {
    direction,
    amount,
    counterparty,
    type,
  };
}

/**
 * Find counterparty in a transaction
 * 
 * @param meta - Transaction meta
 * @param accountKeys - Account keys
 * @param type - 'sender' or 'recipient'
 * @returns Counterparty address or null
 */
function findCounterparty(
  meta: NonNullable<ParsedTransactionWithMeta['meta']>,
  accountKeys: { pubkey: PublicKey; signer: boolean; writable: boolean }[],
  type: 'sender' | 'recipient'
): string | null {
  const preBalances = meta.preBalances;
  const postBalances = meta.postBalances;

  for (let i = 0; i < accountKeys.length; i++) {
    const change = postBalances[i] - preBalances[i];
    
    if (type === 'sender' && change < 0) {
      return accountKeys[i].pubkey.toBase58();
    }
    if (type === 'recipient' && change > 0) {
      return accountKeys[i].pubkey.toBase58();
    }
  }

  return null;
}

/**
 * Determine transaction type from parsed data
 * 
 * @param parsed - Parsed transaction
 * @param direction - Transaction direction
 * @returns Transaction type description
 */
function determineTransactionType(
  parsed: ParsedTransactionWithMeta,
  direction: TransactionDirection
): string {
  const instructions = parsed.transaction.message.instructions;
  
  // Check for common program types
  for (const instruction of instructions) {
    if ('program' in instruction) {
      const program = instruction.program;
      
      if (program === 'system') {
        const parsed_type = (instruction as { parsed?: { type?: string } }).parsed?.type;
        if (parsed_type === 'transfer') {
          return direction === 'sent' ? 'Sent SOL' : 'Received SOL';
        }
        if (parsed_type === 'createAccount') {
          return 'Create Account';
        }
      }
      
      if (program === 'spl-token') {
        const parsed_type = (instruction as { parsed?: { type?: string } }).parsed?.type;
        if (parsed_type === 'transfer' || parsed_type === 'transferChecked') {
          return 'Token Transfer';
        }
      }
    }
    
    // Check by program ID for known programs
    if ('programId' in instruction) {
      const programId = instruction.programId.toBase58();
      
      // Token Program
      if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        return 'Token Transaction';
      }
      
      // Token 2022
      if (programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
        return 'Token 2022 Transaction';
      }
      
      // Metaplex
      if (programId === 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s') {
        return 'NFT Transaction';
      }
    }
  }

  // Default based on direction
  if (direction === 'sent') return 'Sent';
  if (direction === 'received') return 'Received';
  return 'Transaction';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format transaction timestamp for display
 * 
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string
 */
export function formatTransactionTime(timestamp: number | null): string {
  if (!timestamp) return 'Unknown';
  
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than 1 minute ago
  if (diff < 60 * 1000) {
    return 'Just now';
  }
  
  // Less than 1 hour ago
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  }
  
  // Less than 24 hours ago
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }
  
  // Less than 7 days ago
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }
  
  // Full date
  return date.toLocaleDateString();
}

/**
 * Get status color for a transaction
 * 
 * @param status - Transaction status
 * @returns CSS color variable name
 */
export function getStatusColor(status: TransactionStatus): string {
  switch (status) {
    case 'confirmed':
      return 'var(--success)';
    case 'pending':
      return 'var(--warning)';
    case 'failed':
      return 'var(--error)';
    default:
      return 'var(--text-muted)';
  }
}

/**
 * Truncate address for display
 * 
 * @param address - Full address
 * @param chars - Characters to show on each side
 * @returns Truncated address
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get direction icon for display
 * 
 * @param direction - Transaction direction
 * @returns Icon character
 */
export function getDirectionIcon(direction: TransactionDirection): string {
  switch (direction) {
    case 'sent':
      return '↗';
    case 'received':
      return '↘';
    default:
      return '↔';
  }
}

