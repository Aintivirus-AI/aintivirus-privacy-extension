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
import { historyDedup, historyKey, HISTORY_CACHE_TTL } from './requestDedup';
import { getTokenMetadata } from './tokens';

// Builds Solana transaction history results, merges token transfers, and
// maintains a small cache so the UI can refresh without hitting RPC too often.

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
  options: { limit?: number; before?: string; forceRefresh?: boolean } = {},
): Promise<TransactionHistoryResult> {
  const { limit = DEFAULT_LIMIT, before, forceRefresh } = options;

  const address = await getPublicAddress();
  if (!address) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_INITIALIZED, 'No wallet found');
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
      historyDedup
        .execute(bgKey, () => fetchHistoryInternal(address, limit, before), 0)
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
    forceRefresh ? 0 : HISTORY_CACHE_TTL,
  );
}

async function fetchHistoryInternal(
  address: string,
  limit: number,
  before?: string,
): Promise<TransactionHistoryResult> {
  // Note: Alchemy's Solana offering doesn't have enhanced transaction APIs like ETH
  // We use standard RPC calls which work with Alchemy's RPC endpoint (configured in network settings)
  // This provides the benefit of Alchemy's reliable infrastructure without needing special API methods
  
  // Use direct RPC calls for Solana transaction history
  try {
    const connection = await getCurrentConnection();
    const publicKey = new PublicKey(address);

    let walletSignatures: ConfirmedSignatureInfo[] = [];

    try {
      walletSignatures = await connection.getSignaturesForAddress(publicKey, {
        limit: Math.min(limit, MAX_LIMIT),
        before: before || undefined,
      });
    } catch (error) {}

    let tokenAccountSignatures: ConfirmedSignatureInfo[] = [];
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const accountsToCheck = tokenAccounts.value.slice(0, 5);

      for (const account of accountsToCheck) {
        try {
          const sigs = await connection.getSignaturesForAddress(account.pubkey, { limit: 10 });
          tokenAccountSignatures.push(...sigs);
        } catch {}
      }
    } catch (error) {}

    const allSignatures = [...walletSignatures];
    const seenSignatures = new Set(walletSignatures.map((s) => s.signature));

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
          cursor:
            historyCache.transactions.length > 0
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

    const transactions = await fetchTransactionDetails(limitedSignatures, address);

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
      cursor: transactions.length > 0 ? transactions[transactions.length - 1].signature : null,
    };
  } catch (error) {
    if (historyCache && historyCache.address === address) {
      return {
        transactions: historyCache.transactions.slice(0, limit),
        hasMore: historyCache.transactions.length > limit,
        cursor:
          historyCache.transactions.length > 0
            ? historyCache.transactions[historyCache.transactions.length - 1].signature
            : null,
      };
    }

    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.RPC_ERROR,
      `Failed to fetch transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

async function fetchTransactionDetails(
  signatures: ConfirmedSignatureInfo[],
  walletAddress: string,
): Promise<TransactionHistoryItem[]> {
  const connection = await getCurrentConnection();
  const transactions: TransactionHistoryItem[] = [];

  const signatureStrings = signatures.map((s) => s.signature);

  const batchSize = 5;

  const batchDelay = 100;

  for (let i = 0; i < signatureStrings.length; i += batchSize) {
    const batch = signatureStrings.slice(i, i + batchSize);

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchDelay));
    }

    const parsedTransactions = await Promise.all(
      batch.map((sig) =>
        connection
          .getParsedTransaction(sig, {
            maxSupportedTransactionVersion: 0,
          })
          .catch(() => null),
      ),
    );

    for (let j = 0; j < batch.length; j++) {
      const parsed = parsedTransactions[j];
      const sigInfo = signatures[i + j];

      const item = parseTransactionToHistoryItem(sigInfo, parsed, walletAddress);

      if (item.tokenInfo) {
        item.tokenInfo = await enrichTokenInfo(item.tokenInfo);
      }

      // Enrich swap token info
      if (item.swapInfo) {
        if (item.swapInfo.fromToken.mint) {
          const enrichedFrom = await enrichTokenInfo({
            mint: item.swapInfo.fromToken.mint,
            decimals: 0, // Not used for swap display
            amount: item.swapInfo.fromToken.amount,
            symbol: item.swapInfo.fromToken.symbol,
            logoUri: item.swapInfo.fromToken.logoUri,
          });
          item.swapInfo.fromToken.symbol = enrichedFrom.symbol || item.swapInfo.fromToken.symbol;
          item.swapInfo.fromToken.logoUri = enrichedFrom.logoUri || item.swapInfo.fromToken.logoUri;
        }
        if (item.swapInfo.toToken.mint) {
          const enrichedTo = await enrichTokenInfo({
            mint: item.swapInfo.toToken.mint,
            decimals: 0, // Not used for swap display
            amount: item.swapInfo.toToken.amount,
            symbol: item.swapInfo.toToken.symbol,
            logoUri: item.swapInfo.toToken.logoUri,
          });
          item.swapInfo.toToken.symbol = enrichedTo.symbol || item.swapInfo.toToken.symbol;
          item.swapInfo.toToken.logoUri = enrichedTo.logoUri || item.swapInfo.toToken.logoUri;
        }
      }

      transactions.push(item);
    }
  }

  return transactions;
}

function parseTransactionToHistoryItem(
  sigInfo: ConfirmedSignatureInfo,
  parsed: ParsedTransactionWithMeta | null,
  walletAddress: string,
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

  if (result.swapInfo) {
    item.swapInfo = result.swapInfo;
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
    const customToken = (settings.customTokens || []).find((t) => t.mint === mint);

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
  } catch (error) {}

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
  } catch (error) {}

  return tokenInfo;
}

function parseTransferInfo(
  parsed: ParsedTransactionWithMeta,
  walletAddress: string,
): {
  direction: TransactionDirection;
  amount: number;
  counterparty: string | null;
  type: string;
  tokenInfo?: ExtractedTokenInfo;
  swapInfo?: SwapInfo;
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

  // Calculate SOL balance change first
  const accountKeys = message.accountKeys;
  const walletIndex = accountKeys.findIndex((key) => key.pubkey.toBase58() === walletAddress);
  
  let solBalanceChange = 0;
  if (walletIndex !== -1) {
    const preBalance = meta.preBalances[walletIndex] || 0;
    const postBalance = meta.postBalances[walletIndex] || 0;
    solBalanceChange = postBalance - preBalance;
  }

  const tokenTransferInfo = parseTokenTransfer(parsed, walletAddress);

  // Check if this is a swap (token transfer has swap info OR SOL + token change)
  if (tokenTransferInfo) {
    // If we already detected a token-to-token swap
    if (tokenTransferInfo.swapInfo) {
      return {
        direction: 'self',
        amount: 0,
        counterparty: tokenTransferInfo.counterparty,
        type: 'Swap',
        tokenInfo: tokenTransferInfo.tokenInfo,
        swapInfo: tokenTransferInfo.swapInfo,
      };
    }
    
    // Check for SOL <-> Token swap
    // Significant SOL change (more than just fees, > 0.001 SOL = 1_000_000 lamports)
    const significantSolChange = Math.abs(solBalanceChange) > 1_000_000;
    
    if (significantSolChange) {
      const solSent = solBalanceChange < 0;
      const tokenReceived = tokenTransferInfo.direction === 'received';
      const tokenSent = tokenTransferInfo.direction === 'sent';
      
      // SOL sent + Token received = Swap SOL -> Token
      if (solSent && tokenReceived) {
        const solAmount = (Math.abs(solBalanceChange) - meta.fee) / LAMPORTS_PER_SOL;
        return {
          direction: 'self',
          amount: 0,
          counterparty: null,
          type: 'Swap',
          tokenInfo: tokenTransferInfo.tokenInfo,
          swapInfo: {
            fromToken: {
              symbol: 'SOL',
              amount: solAmount > 0 ? solAmount : 0,
            },
            toToken: {
              symbol: tokenTransferInfo.tokenInfo.symbol || 'Token',
              amount: tokenTransferInfo.tokenInfo.amount,
              mint: tokenTransferInfo.tokenInfo.mint,
              logoUri: tokenTransferInfo.tokenInfo.logoUri,
            },
          },
        };
      }
      
      // Token sent + SOL received = Swap Token -> SOL
      if (tokenSent && !solSent && solBalanceChange > 0) {
        const solAmount = solBalanceChange / LAMPORTS_PER_SOL;
        return {
          direction: 'self',
          amount: 0,
          counterparty: null,
          type: 'Swap',
          tokenInfo: tokenTransferInfo.tokenInfo,
          swapInfo: {
            fromToken: {
              symbol: tokenTransferInfo.tokenInfo.symbol || 'Token',
              amount: tokenTransferInfo.tokenInfo.amount,
              mint: tokenTransferInfo.tokenInfo.mint,
              logoUri: tokenTransferInfo.tokenInfo.logoUri,
            },
            toToken: {
              symbol: 'SOL',
              amount: solAmount,
            },
          },
        };
      }
    }
    
    // Regular token transfer (not a swap)
    return {
      direction: tokenTransferInfo.direction,
      amount: 0,
      counterparty: tokenTransferInfo.counterparty,
      type: tokenTransferInfo.direction === 'sent' ? 'Sent Token' : 'Received Token',
      tokenInfo: tokenTransferInfo.tokenInfo,
    };
  }

  if (walletIndex === -1) {
    return {
      direction: 'unknown',
      amount: 0,
      counterparty: null,
      type: 'Unknown',
    };
  }

  let direction: TransactionDirection = 'unknown';
  let amount = 0;
  let counterparty: string | null = null;

  if (solBalanceChange > 0) {
    direction = 'received';
    amount = solBalanceChange;

    counterparty = findCounterparty(meta, accountKeys, 'sender');
  } else if (solBalanceChange < 0) {
    direction = 'sent';

    amount = Math.abs(solBalanceChange) - meta.fee;
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

interface SwapInfo {
  fromToken: {
    symbol: string;
    amount: number;
    mint?: string;
    logoUri?: string;
  };
  toToken: {
    symbol: string;
    amount: number;
    mint?: string;
    logoUri?: string;
  };
}

interface TokenTransferResult {
  direction: TransactionDirection;
  counterparty: string | null;
  tokenInfo: ExtractedTokenInfo;
  swapInfo?: SwapInfo;
}

function parseTokenTransfer(
  parsed: ParsedTransactionWithMeta,
  walletAddress: string,
): TokenTransferResult | null {
  const instructions = parsed.transaction.message.instructions;
  const meta = parsed.meta;

  if (!meta) return null;

  // Check for swap first: look for multiple token balance changes (one sent, one received)
  const preTokenBalances = meta.preTokenBalances || [];
  const postTokenBalances = meta.postTokenBalances || [];
  
  if (preTokenBalances.length > 0 || postTokenBalances.length > 0) {
    const allChanges = findAllTokenBalanceChanges(
      preTokenBalances,
      postTokenBalances,
      walletAddress,
      parsed.transaction.message.accountKeys,
    );
    
    // Check if this is a swap (has both sent and received token changes)
    const sentChanges = allChanges.filter(c => c.direction === 'sent');
    const receivedChanges = allChanges.filter(c => c.direction === 'received');
    
    if (sentChanges.length > 0 && receivedChanges.length > 0) {
      // This is a swap! Use the first sent and first received
      const sentChange = sentChanges[0];
      const receivedChange = receivedChanges[0];
      
      return {
        direction: 'self', // Use 'self' to indicate swap
        counterparty: null,
        tokenInfo: {
          mint: sentChange.mint,
          decimals: sentChange.decimals,
          amount: Math.abs(sentChange.uiAmount),
        },
        swapInfo: {
          fromToken: {
            symbol: sentChange.symbol || 'Token',
            amount: Math.abs(sentChange.uiAmount),
            mint: sentChange.mint,
            logoUri: sentChange.logoUri,
          },
          toToken: {
            symbol: receivedChange.symbol || 'Token',
            amount: Math.abs(receivedChange.uiAmount),
            mint: receivedChange.mint,
            logoUri: receivedChange.logoUri,
          },
        },
      };
    }
    
    // Not a swap, just a single token transfer
    if (allChanges.length > 0) {
      const change = allChanges[0];
      return {
        direction: change.direction,
        counterparty: null,
        tokenInfo: {
          mint: change.mint,
          decimals: change.decimals,
          amount: Math.abs(change.uiAmount),
        },
      };
    }
  }

  // Fall back to instruction parsing for simple transfers
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
      }
    }
  }

  return null;
}

interface TokenBalanceChange {
  mint: string;
  decimals: number;
  uiAmount: number;
  direction: TransactionDirection;
  symbol?: string;
  logoUri?: string;
}

function findAllTokenBalanceChanges(
  preBalances: {
    accountIndex: number;
    mint: string;
    owner?: string;
    uiTokenAmount: { decimals: number; uiAmount: number | null };
  }[],
  postBalances: {
    accountIndex: number;
    mint: string;
    owner?: string;
    uiTokenAmount: { decimals: number; uiAmount: number | null };
  }[],
  walletAddress: string,
  _accountKeys: { pubkey: PublicKey }[],
): TokenBalanceChange[] {
  const changes: TokenBalanceChange[] = [];
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

  // Check for changes in existing tokens
  for (const [mint, postData] of postMap) {
    const preData = preMap.get(mint);
    const preAmount = preData?.uiAmount || 0;
    const postAmount = postData.uiAmount;
    const change = postAmount - preAmount;

    if (Math.abs(change) > 0.000001) {
      changes.push({
        mint: postData.mint,
        decimals: postData.decimals,
        uiAmount: change,
        direction: change > 0 ? 'received' : 'sent',
      });
    }
  }

  // Check for tokens that were fully sent (no longer in postBalances)
  for (const [mint, preData] of preMap) {
    if (!postMap.has(mint) && preData.uiAmount > 0) {
      changes.push({
        mint: preData.mint,
        decimals: preData.decimals,
        uiAmount: -preData.uiAmount,
        direction: 'sent',
      });
    }
  }

  // Check for newly received tokens (not in preBalances)
  for (const [mint, postData] of postMap) {
    if (!preMap.has(mint) && postData.uiAmount > 0) {
      changes.push({
        mint: postData.mint,
        decimals: postData.decimals,
        uiAmount: postData.uiAmount,
        direction: 'received',
      });
    }
  }

  return changes;
}

function findTokenBalanceChange(
  preBalances: {
    accountIndex: number;
    mint: string;
    owner?: string;
    uiTokenAmount: { decimals: number; uiAmount: number | null };
  }[],
  postBalances: {
    accountIndex: number;
    mint: string;
    owner?: string;
    uiTokenAmount: { decimals: number; uiAmount: number | null };
  }[],
  walletAddress: string,
  accountKeys: { pubkey: PublicKey }[],
): TokenBalanceChange | null {
  const changes = findAllTokenBalanceChanges(preBalances, postBalances, walletAddress, accountKeys);
  return changes.length > 0 ? changes[0] : null;
}

function findCounterparty(
  meta: NonNullable<ParsedTransactionWithMeta['meta']>,
  accountKeys: { pubkey: PublicKey; signer: boolean; writable: boolean }[],
  type: 'sender' | 'recipient',
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
  direction: TransactionDirection,
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
