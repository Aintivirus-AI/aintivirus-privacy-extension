

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
import { 
  getPublicAddress, 
  getWalletSettings,
  getCachedTokenMetadata,
  saveTokenMetadataToCache,
} from './storage';
import {
  historyDedup,
  historyKey,
  HISTORY_CACHE_TTL,
} from './requestDedup';
import { getTokenMetadata } from './tokens';


const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');


const DEFAULT_LIMIT = 15;


const MAX_LIMIT = 50;


const CACHE_DURATION = 10 * 60 * 1000;


const STALE_WINDOW = 60 * 1000;


interface CachedHistory {
  transactions: TransactionHistoryItem[];
  fetchedAt: number;
  address: string;
}

let historyCache: CachedHistory | null = null;


export function clearHistoryCache(): void {
  historyCache = null;
  
  historyDedup.invalidate(/^history:/);
}


function getCacheStatus(address: string): { valid: boolean; stale: boolean } {
  if (!historyCache) return { valid: false, stale: false };
  if (historyCache.address !== address) return { valid: false, stale: false };
  
  const age = Date.now() - historyCache.fetchedAt;
  
  if (age <= CACHE_DURATION) {
    return { valid: true, stale: false };
  }
  
  if (age <= CACHE_DURATION + STALE_WINDOW) {
    return { valid: true, stale: true };
  }
  
  return { valid: false, stale: false };
}


function isCacheValid(address: string): boolean {
  return getCacheStatus(address).valid;
}


let historyRefreshInProgress = false;


export async function getTransactionHistory(
  options: { limit?: number; before?: string; forceRefresh?: boolean } = {}
): Promise<TransactionHistoryResult> {
  const { limit = DEFAULT_LIMIT, before, forceRefresh } = options;
  
  
  const address = await getPublicAddress();
  if (!address) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }

  
  if (forceRefresh) {
    clearHistoryCache();
    historyDedup.invalidate(new RegExp(`^history:solana:${address}`));
  }

  
  const cacheStatus = getCacheStatus(address);
  
  
  if (!before && !forceRefresh && cacheStatus.valid) {
    const cached = historyCache!.transactions.slice(0, limit);
    
    
    if (cacheStatus.stale && !historyRefreshInProgress) {
      historyRefreshInProgress = true;
      const bgKey = historyKey('solana', address, limit, 'background');
      historyDedup.execute(bgKey, () => fetchHistoryInternal(address, limit, before), 0)
        .finally(() => {
          historyRefreshInProgress = false;
        });
    }
    
    return {
      transactions: cached,
      hasMore: historyCache!.transactions.length > limit,
      cursor: cached.length > 0 ? cached[cached.length - 1].signature : null,
    };
  }

  
  const cacheKey = historyKey('solana', address, limit);
  return historyDedup.execute(
    before ? `${cacheKey}:${before}` : cacheKey,
    () => fetchHistoryInternal(address, limit, before),
    forceRefresh ? 0 : HISTORY_CACHE_TTL
  );
}


async function fetchHistoryInternal(
  address: string,
  limit: number,
  before?: string
): Promise<TransactionHistoryResult> {
  try {
    const connection = await getCurrentConnection();
    const publicKey = new PublicKey(address);
    
    
    let walletSignatures: ConfirmedSignatureInfo[] = [];
    
    try {
      walletSignatures = await connection.getSignaturesForAddress(
        publicKey,
        {
          limit: Math.min(limit, MAX_LIMIT),
          before: before || undefined,
        }
      );
    } catch (error) {
      
    }

    
    let tokenAccountSignatures: ConfirmedSignatureInfo[] = [];
    try {
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );
      
      
      const accountsToCheck = tokenAccounts.value.slice(0, 5);
      
      for (const account of accountsToCheck) {
        try {
          const sigs = await connection.getSignaturesForAddress(
            account.pubkey,
            { limit: 10 } 
          );
          tokenAccountSignatures.push(...sigs);
        } catch {
          
        }
      }
    } catch (error) {
      
    }

    
    const allSignatures = [...walletSignatures];
    const seenSignatures = new Set(walletSignatures.map(s => s.signature));
    
    for (const sig of tokenAccountSignatures) {
      if (!seenSignatures.has(sig.signature)) {
        seenSignatures.add(sig.signature);
        allSignatures.push(sig);
      }
    }
    
    
    allSignatures.sort((a, b) => b.slot - a.slot);
    
    
    const limitedSignatures = allSignatures.slice(0, Math.min(limit, MAX_LIMIT));
    
    
    if (limitedSignatures.length === 0) {
      if (historyCache && historyCache.address === address) {
        return {
          transactions: historyCache.transactions.slice(0, limit),
          hasMore: historyCache.transactions.length > limit,
          cursor: historyCache.transactions.length > 0 
            ? historyCache.transactions[historyCache.transactions.length - 1].signature 
            : null,
        };
      }
      return {
        transactions: [],
        hasMore: false,
        cursor: null,
      };
    }

    
    const transactions = await fetchTransactionDetails(
      limitedSignatures,
      address
    );

    
    if (!before) {
      historyCache = {
        transactions,
        fetchedAt: Date.now(),
        address,
      };
    }

    return {
      transactions,
      hasMore: limitedSignatures.length === limit,
      cursor: transactions.length > 0 
        ? transactions[transactions.length - 1].signature 
        : null,
    };
  } catch (error) {
    
    if (historyCache && historyCache.address === address) {
      return {
        transactions: historyCache.transactions.slice(0, limit),
        hasMore: historyCache.transactions.length > limit,
        cursor: historyCache.transactions.length > 0 
          ? historyCache.transactions[historyCache.transactions.length - 1].signature 
          : null,
      };
    }
    
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      `Failed to fetch transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}


async function fetchTransactionDetails(
  signatures: ConfirmedSignatureInfo[],
  walletAddress: string
): Promise<TransactionHistoryItem[]> {
  const connection = await getCurrentConnection();
  const transactions: TransactionHistoryItem[] = [];

  const signatureStrings = signatures.map(s => s.signature);
  
  
  const batchSize = 5;
  
  
  const batchDelay = 100; 
  
  for (let i = 0; i < signatureStrings.length; i += batchSize) {
    const batch = signatureStrings.slice(i, i + batchSize);
    
    
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
    
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
      
      
      if (item.tokenInfo) {
        item.tokenInfo = await enrichTokenInfo(item.tokenInfo);
      }
      
      transactions.push(item);
    }
  }

  return transactions;
}


function parseTransactionToHistoryItem(
  sigInfo: ConfirmedSignatureInfo,
  parsed: ParsedTransactionWithMeta | null,
  walletAddress: string
): TransactionHistoryItem {
  
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

  
  if (!parsed || !parsed.meta) {
    return item;
  }

  
  item.feeLamports = parsed.meta.fee;

  
  const result = parseTransferInfo(parsed, walletAddress);
  item.direction = result.direction;
  item.amountLamports = result.amount;
  item.amountSol = result.amount / LAMPORTS_PER_SOL;
  item.counterparty = result.counterparty;
  item.type = result.type;
  
  
  if (result.tokenInfo) {
    item.tokenInfo = {
      mint: result.tokenInfo.mint,
      decimals: result.tokenInfo.decimals,
      amount: result.tokenInfo.amount,
      symbol: result.tokenInfo.symbol,
      name: result.tokenInfo.name,
      logoUri: result.tokenInfo.logoUri,
    };
  }

  return item;
}


interface ExtractedTokenInfo {
  mint: string;
  decimals: number;
  amount: number;
  symbol?: string;
  name?: string;
  logoUri?: string;
}


async function enrichTokenInfo(tokenInfo: ExtractedTokenInfo): Promise<ExtractedTokenInfo> {
  const mint = tokenInfo.mint;
  
  
  try {
    const settings = await getWalletSettings();
    const customToken = (settings.customTokens || []).find(t => t.mint === mint);
    
    if (customToken) {
      const enriched = {
        ...tokenInfo,
        symbol: customToken.symbol || tokenInfo.symbol,
        name: customToken.name || tokenInfo.name,
        logoUri: customToken.logoUri || tokenInfo.logoUri,
      };
      
      // Cache this token metadata for future use
      await saveTokenMetadataToCache(mint, {
        symbol: enriched.symbol,
        name: enriched.name,
        decimals: enriched.decimals,
        logoUri: enriched.logoUri,
      });
      
      return enriched;
    }
  } catch (error) {
    
  }
  
  
  const metadata = getTokenMetadata(mint);
  if (metadata) {
    const enriched = {
      ...tokenInfo,
      symbol: metadata.symbol || tokenInfo.symbol,
      name: metadata.name || tokenInfo.name,
      logoUri: metadata.logoUri || tokenInfo.logoUri,
    };
    
    // Cache this token metadata for future use
    await saveTokenMetadataToCache(mint, {
      symbol: enriched.symbol,
      name: enriched.name,
      decimals: enriched.decimals,
      logoUri: enriched.logoUri,
    });
    
    return enriched;
  }
  
  // Check the persistent cache (for tokens that were previously added but now removed)
  try {
    const cachedMetadata = await getCachedTokenMetadata(mint);
    if (cachedMetadata && (cachedMetadata.symbol || cachedMetadata.name)) {
      return {
        ...tokenInfo,
        symbol: cachedMetadata.symbol || tokenInfo.symbol,
        name: cachedMetadata.name || tokenInfo.name,
        logoUri: cachedMetadata.logoUri || tokenInfo.logoUri,
      };
    }
  } catch (error) {
    
  }
  
  return tokenInfo;
}


function parseTransferInfo(
  parsed: ParsedTransactionWithMeta,
  walletAddress: string
): {
  direction: TransactionDirection;
  amount: number;
  counterparty: string | null;
  type: string;
  tokenInfo?: ExtractedTokenInfo;
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

  
  const tokenTransferInfo = parseTokenTransfer(parsed, walletAddress);
  
  
  if (tokenTransferInfo) {
    return {
      direction: tokenTransferInfo.direction,
      amount: 0, 
      counterparty: tokenTransferInfo.counterparty,
      type: tokenTransferInfo.direction === 'sent' ? 'Sent Token' : 'Received Token',
      tokenInfo: tokenTransferInfo.tokenInfo,
    };
  }

  
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
  
  
  const preBalance = meta.preBalances[walletIndex] || 0;
  const postBalance = meta.postBalances[walletIndex] || 0;
  const balanceChange = postBalance - preBalance;

  
  let direction: TransactionDirection = 'unknown';
  let amount = 0;
  let counterparty: string | null = null;

  if (balanceChange > 0) {
    direction = 'received';
    amount = balanceChange;
    
    counterparty = findCounterparty(meta, accountKeys, 'sender');
  } else if (balanceChange < 0) {
    direction = 'sent';
    
    amount = Math.abs(balanceChange) - meta.fee;
    if (amount < 0) amount = 0;
    
    counterparty = findCounterparty(meta, accountKeys, 'recipient');
  }

  
  const type = determineTransactionType(parsed, direction);

  return {
    direction,
    amount,
    counterparty,
    type,
  };
}


function parseTokenTransfer(
  parsed: ParsedTransactionWithMeta,
  walletAddress: string
): {
  direction: TransactionDirection;
  counterparty: string | null;
  tokenInfo: ExtractedTokenInfo;
} | null {
  const instructions = parsed.transaction.message.instructions;
  const meta = parsed.meta;
  
  if (!meta) return null;

  
  for (const instruction of instructions) {
    if ('program' in instruction && instruction.program === 'spl-token') {
      const parsedInstruction = instruction as {
        parsed?: {
          type?: string;
          info?: {
            source?: string;
            destination?: string;
            authority?: string;
            mint?: string;
            tokenAmount?: {
              amount: string;
              decimals: number;
              uiAmount: number;
              uiAmountString: string;
            };
            amount?: string;
          };
        };
      };
      
      const parsedType = parsedInstruction.parsed?.type;
      const info = parsedInstruction.parsed?.info;
      
      if ((parsedType === 'transfer' || parsedType === 'transferChecked') && info) {
        
        if (parsedType === 'transferChecked' && info.mint && info.tokenAmount) {
          const isSource = info.authority === walletAddress;
          const direction: TransactionDirection = isSource ? 'sent' : 'received';
          
          return {
            direction,
            counterparty: isSource ? info.destination || null : info.source || null,
            tokenInfo: {
              mint: info.mint,
              decimals: info.tokenAmount.decimals,
              amount: info.tokenAmount.uiAmount,
            },
          };
        }
        
        
        if (meta.preTokenBalances && meta.postTokenBalances) {
          const tokenBalanceChange = findTokenBalanceChange(
            meta.preTokenBalances,
            meta.postTokenBalances,
            walletAddress,
            parsed.transaction.message.accountKeys
          );
          
          if (tokenBalanceChange) {
            return {
              direction: tokenBalanceChange.direction,
              counterparty: null,
              tokenInfo: {
                mint: tokenBalanceChange.mint,
                decimals: tokenBalanceChange.decimals,
                amount: Math.abs(tokenBalanceChange.uiAmount),
              },
            };
          }
        }
      }
    }
  }

  
  const preTokenBalances = meta.preTokenBalances || [];
  const postTokenBalances = meta.postTokenBalances || [];
  if (preTokenBalances.length > 0 || postTokenBalances.length > 0) {
    const tokenBalanceChange = findTokenBalanceChange(
      preTokenBalances,
      postTokenBalances,
      walletAddress,
      parsed.transaction.message.accountKeys
    );
    
    if (tokenBalanceChange) {
      return {
        direction: tokenBalanceChange.direction,
        counterparty: null,
        tokenInfo: {
          mint: tokenBalanceChange.mint,
          decimals: tokenBalanceChange.decimals,
          amount: Math.abs(tokenBalanceChange.uiAmount),
        },
      };
    }
  }

  return null;
}


function findTokenBalanceChange(
  preBalances: { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { decimals: number; uiAmount: number | null } }[],
  postBalances: { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { decimals: number; uiAmount: number | null } }[],
  walletAddress: string,
  _accountKeys: { pubkey: PublicKey }[]
): {
  mint: string;
  decimals: number;
  uiAmount: number;
  direction: TransactionDirection;
} | null {
  
  const preMap = new Map<string, { mint: string; uiAmount: number; decimals: number }>();
  const postMap = new Map<string, { mint: string; uiAmount: number; decimals: number }>();
  
  
  for (const balance of preBalances) {
    if (balance.owner === walletAddress) {
      preMap.set(balance.mint, {
        mint: balance.mint,
        uiAmount: balance.uiTokenAmount.uiAmount || 0,
        decimals: balance.uiTokenAmount.decimals,
      });
    }
  }
  
  for (const balance of postBalances) {
    if (balance.owner === walletAddress) {
      postMap.set(balance.mint, {
        mint: balance.mint,
        uiAmount: balance.uiTokenAmount.uiAmount || 0,
        decimals: balance.uiTokenAmount.decimals,
      });
    }
  }

  
  for (const [mint, postData] of postMap) {
    const preData = preMap.get(mint);
    const preAmount = preData?.uiAmount || 0;
    const postAmount = postData.uiAmount;
    const change = postAmount - preAmount;
    
    if (Math.abs(change) > 0.000001) {
      return {
        mint: postData.mint,
        decimals: postData.decimals,
        uiAmount: change,
        direction: change > 0 ? 'received' : 'sent',
      };
    }
  }

  
  for (const [mint, preData] of preMap) {
    if (!postMap.has(mint) && preData.uiAmount > 0) {
      return {
        mint: preData.mint,
        decimals: preData.decimals,
        uiAmount: -preData.uiAmount,
        direction: 'sent',
      };
    }
  }

  
  for (const [mint, postData] of postMap) {
    if (!preMap.has(mint) && postData.uiAmount > 0) {
      return {
        mint: postData.mint,
        decimals: postData.decimals,
        uiAmount: postData.uiAmount,
        direction: 'received',
      };
    }
  }

  return null;
}


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


function determineTransactionType(
  parsed: ParsedTransactionWithMeta,
  direction: TransactionDirection
): string {
  const instructions = parsed.transaction.message.instructions;
  
  
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
    
    
    if ('programId' in instruction) {
      const programId = instruction.programId.toBase58();
      
      
      if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        return 'Token Transaction';
      }
      
      
      if (programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
        return 'Token 2022 Transaction';
      }
      
      
      if (programId === 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s') {
        return 'NFT Transaction';
      }
    }
  }

  
  if (direction === 'sent') return 'Sent';
  if (direction === 'received') return 'Received';
  return 'Transaction';
}


export function formatTransactionTime(timestamp: number | null): string {
  if (!timestamp) return 'Unknown';
  
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  
  if (diff < 60 * 1000) {
    return 'Just now';
  }
  
  
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  }
  
  
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }
  
  
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }
  
  
  return date.toLocaleDateString();
}


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


export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}


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

