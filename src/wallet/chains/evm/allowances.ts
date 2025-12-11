import { Interface, formatUnits } from 'ethers';
import type { EVMChainId } from '../types';
import { ChainError, ChainErrorCode } from '../types';
import { call, getTransactionCount, estimateGas, getFeeData } from './client';
import { getNumericChainId } from '../config';
import { POPULAR_TOKENS } from './tokens';
import { getKnownSpenders, getSpenderLabel } from './knownSpenders';
import { isValidEVMAddress } from '../../keychain';

// ERC-20 allowance discovery and cache helpers for the EVM wallet flows.
export interface TokenAllowance {
  tokenAddress: string;

  tokenSymbol: string;

  tokenName: string;

  tokenDecimals: number;

  tokenLogoUri?: string;

  spenderAddress: string;

  spenderLabel?: string;

  spenderVerified?: boolean;

  allowanceRaw: string;

  allowanceFormatted: number;

  isInfinite: boolean;

  lastUpdated: number;
}

export interface AllowanceCache {
  chainId: EVMChainId;

  account: string;

  allowances: TokenAllowance[];

  fetchedAt: number;

  scanBlockNumber?: number;
}

export interface AllowanceDiscoveryResult {
  allowances: TokenAllowance[];

  fromCache: boolean;

  fetchedAt: number;
}

export interface UnsignedRevokeTransaction {
  chainId: number;

  to: string;

  data: string;

  value: bigint;

  gasLimit: bigint;

  maxFeePerGas?: bigint;

  maxPriorityFeePerGas?: bigint;

  gasPrice?: bigint;

  nonce: number;

  type: number;
}

export const MAX_UINT256 = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
);

export const INFINITE_THRESHOLD = BigInt(2) ** BigInt(255);

export const ALLOWANCE_CACHE_TTL = 5 * 60 * 1000;

export const ALLOWANCE_CACHE_KEY = 'evmAllowanceCache';

const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const erc20Interface = new Interface(ERC20_ALLOWANCE_ABI);

export function isInfiniteAllowance(allowance: bigint): boolean {
  return allowance >= INFINITE_THRESHOLD;
}

export function formatAllowance(allowance: bigint, decimals: number): string {
  if (isInfiniteAllowance(allowance)) {
    return 'Unlimited';
  }

  if (allowance === 0n) {
    return '0';
  }

  const formatted = formatUnits(allowance, decimals);
  const num = parseFloat(formatted);

  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  if (num >= 1) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (num >= 0.0001) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  return num.toExponential(2);
}

export function parseAllowanceToNumber(allowance: bigint, decimals: number): number {
  if (isInfiniteAllowance(allowance)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return parseFloat(formatUnits(allowance, decimals));
}

function getCacheKey(chainId: EVMChainId, account: string): string {
  return `${chainId}-${account.toLowerCase()}`;
}

async function loadAllowanceCache(): Promise<Record<string, AllowanceCache>> {
  try {
    const result = await chrome.storage.local.get(ALLOWANCE_CACHE_KEY);
    return result[ALLOWANCE_CACHE_KEY] || {};
  } catch (error) {
    return {};
  }
}

async function saveAllowanceCache(cache: Record<string, AllowanceCache>): Promise<void> {
  try {
    await chrome.storage.local.set({ [ALLOWANCE_CACHE_KEY]: cache });
  } catch (error) {}
}

async function getCachedAllowances(
  chainId: EVMChainId,
  account: string,
): Promise<AllowanceCache | null> {
  const cache = await loadAllowanceCache();
  const key = getCacheKey(chainId, account);
  const cached = cache[key];

  if (!cached) {
    return null;
  }

  const age = Date.now() - cached.fetchedAt;
  if (age > ALLOWANCE_CACHE_TTL) {
    return null;
  }

  return cached;
}

async function setCachedAllowances(
  chainId: EVMChainId,
  account: string,
  allowances: TokenAllowance[],
): Promise<void> {
  const cache = await loadAllowanceCache();
  const key = getCacheKey(chainId, account);

  cache[key] = {
    chainId,
    account: account.toLowerCase(),
    allowances,
    fetchedAt: Date.now(),
  };

  await saveAllowanceCache(cache);
}

export async function clearAllowanceCache(chainId: EVMChainId, account: string): Promise<void> {
  const cache = await loadAllowanceCache();
  const key = getCacheKey(chainId, account);
  delete cache[key];
  await saveAllowanceCache(cache);
}

export async function clearAllAllowanceCache(): Promise<void> {
  await chrome.storage.local.remove(ALLOWANCE_CACHE_KEY);
}

async function queryAllowance(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
): Promise<bigint> {
  try {
    const data = erc20Interface.encodeFunctionData('allowance', [ownerAddress, spenderAddress]);

    const result = await call(chainId, testnet, {
      to: tokenAddress,
      data,
    });

    const [allowance] = erc20Interface.decodeFunctionResult('allowance', result);
    return BigInt(allowance);
  } catch (error) {
    return 0n;
  }
}

async function queryTokenMetadata(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  try {
    let name = 'Unknown Token';
    let symbol = '???';
    let decimals = 18;

    try {
      const nameData = await call(chainId, testnet, {
        to: tokenAddress,
        data: erc20Interface.encodeFunctionData('name'),
      });
      [name] = erc20Interface.decodeFunctionResult('name', nameData);
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const symbolData = await call(chainId, testnet, {
        to: tokenAddress,
        data: erc20Interface.encodeFunctionData('symbol'),
      });
      [symbol] = erc20Interface.decodeFunctionResult('symbol', symbolData);
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const decimalsData = await call(chainId, testnet, {
        to: tokenAddress,
        data: erc20Interface.encodeFunctionData('decimals'),
      });
      const [dec] = erc20Interface.decodeFunctionResult('decimals', decimalsData);
      decimals = Number(dec);
    } catch {}

    return { name, symbol, decimals };
  } catch {
    return null;
  }
}

async function executeWithRateLimit<T>(
  queries: Array<() => Promise<T>>,
  concurrency: number = 3,
  delayMs: number = 200,
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);

    if (i + concurrency < queries.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

export async function discoverAllowances(
  chainId: EVMChainId,
  testnet: boolean,
  account: string,
  forceRefresh: boolean = false,
): Promise<AllowanceDiscoveryResult> {
  if (!isValidEVMAddress(account)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid account address', 'evm');
  }

  if (!testnet && !forceRefresh) {
    const cached = await getCachedAllowances(chainId, account);
    if (cached) {
      return {
        allowances: cached.allowances,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }
  }

  const tokens = POPULAR_TOKENS[chainId] || [];
  const spenders = getKnownSpenders(chainId);

  if (tokens.length === 0 || spenders.length === 0) {
    return {
      allowances: [],
      fromCache: false,
      fetchedAt: Date.now(),
    };
  }

  const now = Date.now();

  const limitedTokens = tokens.slice(0, 5);
  const limitedSpenders = spenders.slice(0, 5);

  const queryFunctions: Array<() => Promise<TokenAllowance | null>> = [];

  for (const token of limitedTokens) {
    for (const spender of limitedSpenders) {
      queryFunctions.push(async () => {
        try {
          const allowance = await queryAllowance(
            chainId,
            testnet,
            token.address,
            account,
            spender.address,
          );

          if (allowance === 0n) {
            return null;
          }

          return {
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            tokenName: token.name,
            tokenDecimals: token.decimals,
            tokenLogoUri: token.logoUri,
            spenderAddress: spender.address,
            spenderLabel: spender.label,
            spenderVerified: spender.verified,
            allowanceRaw: allowance.toString(),
            allowanceFormatted: parseAllowanceToNumber(allowance, token.decimals),
            isInfinite: isInfiniteAllowance(allowance),
            lastUpdated: now,
          };
        } catch {
          return null;
        }
      });
    }
  }

  const results = await executeWithRateLimit(queryFunctions, 3, 200);

  const allowances = results.filter((a): a is TokenAllowance => a !== null);

  if (!testnet) {
    await setCachedAllowances(chainId, account, allowances);
  }

  return {
    allowances,
    fromCache: false,
    fetchedAt: now,
  };
}

export async function getTokenAllowance(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
): Promise<TokenAllowance | null> {
  if (
    !isValidEVMAddress(tokenAddress) ||
    !isValidEVMAddress(ownerAddress) ||
    !isValidEVMAddress(spenderAddress)
  ) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid address', 'evm');
  }

  const allowance = await queryAllowance(
    chainId,
    testnet,
    tokenAddress,
    ownerAddress,
    spenderAddress,
  );

  if (allowance === 0n) {
    return null;
  }

  const metadata = await queryTokenMetadata(chainId, testnet, tokenAddress);
  if (!metadata) {
    return null;
  }

  return {
    tokenAddress,
    tokenSymbol: metadata.symbol,
    tokenName: metadata.name,
    tokenDecimals: metadata.decimals,
    spenderAddress,
    spenderLabel: getSpenderLabel(chainId, spenderAddress),
    allowanceRaw: allowance.toString(),
    allowanceFormatted: parseAllowanceToNumber(allowance, metadata.decimals),
    isInfinite: isInfiniteAllowance(allowance),
    lastUpdated: Date.now(),
  };
}

export async function createRevokeTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  tokenAddress: string,
  spenderAddress: string,
): Promise<UnsignedRevokeTransaction> {
  if (!isValidEVMAddress(from)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
  }
  if (!isValidEVMAddress(tokenAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
  }
  if (!isValidEVMAddress(spenderAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid spender address', 'evm');
  }

  const data = erc20Interface.encodeFunctionData('approve', [spenderAddress, 0n]);

  let gasLimit: bigint;
  try {
    gasLimit = await estimateGas(chainId, testnet, {
      from,
      to: tokenAddress,
      data,
    });

    gasLimit = (gasLimit * 120n) / 100n;
  } catch (error) {
    gasLimit = 65000n;
  }

  const nonce = await getTransactionCount(chainId, testnet, from, 'pending');

  const feeData = await getFeeData(chainId, testnet);

  const numericChainId = getNumericChainId(chainId, testnet);

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    return {
      chainId: numericChainId,
      to: tokenAddress,
      data,
      value: 0n,
      gasLimit,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      nonce,
      type: 2,
    };
  } else {
    return {
      chainId: numericChainId,
      to: tokenAddress,
      data,
      value: 0n,
      gasLimit,
      gasPrice: feeData.gasPrice || 1000000000n,
      nonce,
      type: 0,
    };
  }
}

export async function createBulkRevokeTransactions(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  revocations: Array<{ tokenAddress: string; spenderAddress: string }>,
): Promise<UnsignedRevokeTransaction[]> {
  if (revocations.length === 0) {
    return [];
  }

  const [baseNonce, feeData] = await Promise.all([
    getTransactionCount(chainId, testnet, from, 'pending'),
    getFeeData(chainId, testnet),
  ]);

  const numericChainId = getNumericChainId(chainId, testnet);

  const gasEstimateFunctions: Array<
    () => Promise<{ index: number; gasLimit: bigint; data: string }>
  > = [];

  for (let i = 0; i < revocations.length; i++) {
    const { tokenAddress, spenderAddress } = revocations[i];
    const data = erc20Interface.encodeFunctionData('approve', [spenderAddress, 0n]);

    gasEstimateFunctions.push(async () => {
      let gasLimit: bigint;
      try {
        gasLimit = await estimateGas(chainId, testnet, {
          from,
          to: tokenAddress,
          data,
        });
        gasLimit = (gasLimit * 120n) / 100n;
      } catch {
        gasLimit = 65000n;
      }
      return { index: i, gasLimit, data };
    });
  }

  const gasResults = await executeWithRateLimit(gasEstimateFunctions, 2, 300);

  const transactions: UnsignedRevokeTransaction[] = [];

  for (const { index, gasLimit, data } of gasResults) {
    const { tokenAddress } = revocations[index];

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      transactions.push({
        chainId: numericChainId,
        to: tokenAddress,
        data,
        value: 0n,
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        nonce: baseNonce + index,
        type: 2,
      });
    } else {
      transactions.push({
        chainId: numericChainId,
        to: tokenAddress,
        data,
        value: 0n,
        gasLimit,
        gasPrice: feeData.gasPrice || 1000000000n,
        nonce: baseNonce + index,
        type: 0,
      });
    }
  }

  transactions.sort((a, b) => a.nonce - b.nonce);

  return transactions;
}

export async function estimateRevokeFee(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  tokenAddress: string,
  spenderAddress: string,
): Promise<{ gasLimit: bigint; totalFeeWei: bigint; totalFeeFormatted: number }> {
  const data = erc20Interface.encodeFunctionData('approve', [spenderAddress, 0n]);

  let gasLimit: bigint;
  try {
    gasLimit = await estimateGas(chainId, testnet, {
      from,
      to: tokenAddress,
      data,
    });
    gasLimit = (gasLimit * 120n) / 100n;
  } catch {
    gasLimit = 65000n;
  }

  const feeData = await getFeeData(chainId, testnet);
  const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;

  const totalFeeWei = gasLimit * gasPrice;
  const totalFeeFormatted = parseFloat(formatUnits(totalFeeWei, 18));

  return {
    gasLimit,
    totalFeeWei,
    totalFeeFormatted,
  };
}
