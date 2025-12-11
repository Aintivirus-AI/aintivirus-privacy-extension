import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  Commitment,
} from '@solana/web3.js';
import {
  SolanaNetwork,
  NETWORK_CONFIGS,
  WalletBalance,
  WalletError,
  WalletErrorCode,
} from './types';
import { getWalletSettings } from './storage';
import {
  getBestRpcEndpoint,
  getSortedRpcEndpoints,
  recordRpcSuccess,
  recordRpcFailure,
  getRpcHealthSummary,
} from './rpcHealth';
import { balanceDedup, balanceKey, BALANCE_CACHE_TTL } from './requestDedup';

// Provides resilient Solana RPC execution with failover, caching, and throttling hooks.
const DEFAULT_COMMITMENT: Commitment = 'confirmed';

const RPC_TIMEOUT = 30000;

const MAX_RETRIES = 3;

function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, {
    commitment: DEFAULT_COMMITMENT,
    confirmTransactionInitialTimeout: RPC_TIMEOUT,

    disableRetryOnRateLimit: true,
  });
}

function isHardFailure(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('403') ||
    msg.includes('401') ||
    msg.includes('forbidden') ||
    msg.includes('unauthorized') ||
    msg.includes('access denied') ||
    msg.includes('api key')
  );
}

const hardFailedUrls: Set<string> = new Set();

export async function executeWithFailover<T>(
  network: SolanaNetwork,
  operation: (connection: Connection) => Promise<T>,
  customRpcUrl?: string,
): Promise<T> {
  if (customRpcUrl && !hardFailedUrls.has(customRpcUrl)) {
    try {
      const connection = createConnection(customRpcUrl);
      const startTime = performance.now();
      const result = await operation(connection);
      const latencyMs = Math.round(performance.now() - startTime);

      await recordRpcSuccess(customRpcUrl, latencyMs);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await recordRpcFailure(customRpcUrl, err.message);

      if (isHardFailure(err)) {
        hardFailedUrls.add(customRpcUrl);
      }
    }
  }

  const endpoints = (await getSortedRpcEndpoints(network)).filter(
    (url) => !hardFailedUrls.has(url),
  );

  let lastError: Error | null = null;
  let attempts = 0;

  for (const rpcUrl of endpoints) {
    if (attempts >= MAX_RETRIES) {
      break;
    }

    if (customRpcUrl && rpcUrl === customRpcUrl) {
      continue;
    }

    try {
      const connection = createConnection(rpcUrl);
      const startTime = performance.now();
      const result = await operation(connection);
      const latencyMs = Math.round(performance.now() - startTime);

      await recordRpcSuccess(rpcUrl, latencyMs);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await recordRpcFailure(rpcUrl, lastError.message);
      attempts++;

      if (isHardFailure(lastError)) {
        hardFailedUrls.add(rpcUrl);

        attempts--;
      } else {
      }
    }
  }

  throw new WalletError(
    WalletErrorCode.NETWORK_ERROR,
    `All RPC endpoints failed after ${attempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`,
  );
}

export async function getConnection(): Promise<Connection> {
  const settings = await getWalletSettings();

  if (settings.customRpcUrl) {
    return createConnection(settings.customRpcUrl);
  }

  const bestUrl = await getBestRpcEndpoint(settings.network);
  return createConnection(bestUrl);
}

export async function getBalance(
  address: string,
  forceRefresh: boolean = false,
): Promise<WalletBalance> {
  const settings = await getWalletSettings();
  const cacheKey = balanceKey('solana', address, settings.network);

  if (forceRefresh) {
    balanceDedup.invalidate(cacheKey);
  }

  return balanceDedup.execute(
    cacheKey,
    async () => {
      const publicKey = new PublicKey(address);

      const lamports = await executeWithFailover(
        settings.network,
        async (connection) => connection.getBalance(publicKey),
        settings.customRpcUrl,
      );

      return {
        lamports,
        sol: lamports / LAMPORTS_PER_SOL,
        lastUpdated: Date.now(),
      };
    },
    forceRefresh ? 0 : BALANCE_CACHE_TTL,
  );
}

export async function getNetworkStatus(): Promise<{
  connected: boolean;
  latency: number;
  blockHeight: number | null;
  endpoint: string;
}> {
  const settings = await getWalletSettings();

  try {
    const bestUrl = settings.customRpcUrl || (await getBestRpcEndpoint(settings.network));
    const connection = createConnection(bestUrl);

    const startTime = performance.now();
    const blockHeight = await connection.getBlockHeight();
    const latency = Math.round(performance.now() - startTime);

    await recordRpcSuccess(bestUrl, latency);

    return {
      connected: true,
      latency,
      blockHeight,
      endpoint: bestUrl,
    };
  } catch (error) {
    return {
      connected: false,
      latency: -1,
      blockHeight: null,
      endpoint: 'none',
    };
  }
}

export async function getRecentBlockhash(): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  const settings = await getWalletSettings();

  return executeWithFailover(
    settings.network,
    async (connection) => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      return { blockhash, lastValidBlockHeight };
    },
    settings.customRpcUrl,
  );
}

export async function estimateTransactionFee(
  transaction: Transaction | VersionedTransaction,
): Promise<number> {
  try {
    const connection = await getConnection();

    if (transaction instanceof VersionedTransaction) {
      const fee = await connection.getFeeForMessage(transaction.message);
      return fee.value || 5000;
    }

    const { blockhash } = await getRecentBlockhash();
    transaction.recentBlockhash = blockhash;

    const message = transaction.compileMessage();
    const fee = await connection.getFeeForMessage(message);

    return fee.value || 5000;
  } catch (error) {
    return 5000;
  }
}

export async function sendTransaction(
  signedTransaction: Transaction | VersionedTransaction,
): Promise<string> {
  const settings = await getWalletSettings();

  return executeWithFailover(
    settings.network,
    async (connection) => {
      const serialized = signedTransaction.serialize();
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: DEFAULT_COMMITMENT,
      });
      return signature;
    },
    settings.customRpcUrl,
  );
}

export async function confirmTransaction(
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
): Promise<boolean> {
  const settings = await getWalletSettings();

  try {
    const result = await executeWithFailover(
      settings.network,
      async (connection) => {
        return connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });
      },
      settings.customRpcUrl,
    );

    return !result.value.err;
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_TIMEOUT,
      'Transaction confirmation timed out',
    );
  }
}

export async function getTransaction(signature: string) {
  const settings = await getWalletSettings();

  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    },
    settings.customRpcUrl,
  );
}

export async function getTransactions(
  address: string,
  options?: { limit?: number; before?: string },
) {
  const settings = await getWalletSettings();
  const publicKey = new PublicKey(address);

  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getSignaturesForAddress(publicKey, {
        limit: options?.limit || 20,
        before: options?.before,
      });
    },
    settings.customRpcUrl,
  );
}

export async function getTokenAccounts(address: string) {
  const settings = await getWalletSettings();
  const publicKey = new PublicKey(address);

  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
    },
    settings.customRpcUrl,
  );
}

export async function accountExists(address: string): Promise<boolean> {
  try {
    const balance = await getBalance(address);
    return balance.lamports > 0;
  } catch {
    return false;
  }
}

export async function getMinimumBalanceForRentExemption(dataSize: number = 0): Promise<number> {
  const settings = await getWalletSettings();

  return executeWithFailover(
    settings.network,
    async (connection) => {
      return connection.getMinimumBalanceForRentExemption(dataSize);
    },
    settings.customRpcUrl,
  );
}

export async function getAddressExplorerUrl(address: string): Promise<string> {
  const settings = await getWalletSettings();
  const config = NETWORK_CONFIGS[settings.network];
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/address/${address}${clusterParam}`;
}

export async function getTransactionExplorerUrl(signature: string): Promise<string> {
  const settings = await getWalletSettings();
  const config = NETWORK_CONFIGS[settings.network];
  const clusterParam = config.name === 'mainnet-beta' ? '' : `?cluster=${config.name}`;
  return `${config.explorerUrl}/tx/${signature}${clusterParam}`;
}

export async function getRpcHealth() {
  const settings = await getWalletSettings();
  return getRpcHealthSummary(settings.network);
}
