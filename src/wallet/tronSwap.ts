import { ChainError, ChainErrorCode } from './chains/types';
import {
  TRON_CONSTANTS,
  sunToTrx,
  trxToSun,
  getTronTxExplorerUrl,
} from './chains/tron/config';
import { signTransaction } from './chains/tron/addresses';
import { broadcastTransaction, getNowBlock } from './chains/tron/client';
import type { TronKeypair, SignedTronTransaction } from './chains/tron/types';

const SUNSWAP_API_BASE = 'https://rot.endjgfsv.link';
const SUNSWAP_V2_API = 'https://api.sunswap.com/api/v2';

export const TRON_NATIVE_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

const API_TIMEOUT = 30000;

export interface TronSwapQuoteParams {
  fromToken: string;
  toToken: string;
  amount: string;
  slippageBps?: number;
}

export interface TronSwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  priceImpact: string;
  route: string[];
  exchangeRate: string;
  slippageBps: number;
  rawData?: unknown;
}

export interface TronSwapResult {
  txid: string;
  explorerUrl: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  confirmed: boolean;
  error?: string;
}

interface SunSwapPair {
  pairAddress: string;
  token0: {
    address: string;
    symbol: string;
    decimals: number;
  };
  token1: {
    address: string;
    symbol: string;
    decimals: number;
  };
  reserve0: string;
  reserve1: string;
}

export const COMMON_TRON_TOKENS: Record<string, {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
}> = {
  TRX: {
    address: 'trx',
    symbol: 'TRX',
    name: 'TRON',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
  },
  USDT: {
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  },
  USDC: {
    address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
  WTRX: {
    address: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
    symbol: 'WTRX',
    name: 'Wrapped TRX',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
  },
  SUN: {
    address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
    symbol: 'SUN',
    name: 'Sun Token',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/12424/small/sun_logo.png',
  },
  BTT: {
    address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
    symbol: 'BTT',
    name: 'BitTorrent',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/22457/small/btt.png',
  },
  JST: {
    address: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9',
    symbol: 'JST',
    name: 'JUST',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/11095/small/JUST.jpg',
  },
  WIN: {
    address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    symbol: 'WIN',
    name: 'WINkLink',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/9129/small/WINkLink.png',
  },
};

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeTokenAddress(address: string): string {
  if (address.toLowerCase() === 'trx') {
    return COMMON_TRON_TOKENS.WTRX.address;
  }
  return address;
}

function isNativeTrx(address: string): boolean {
  return address.toLowerCase() === 'trx';
}

export async function getTronSwapQuote(params: TronSwapQuoteParams): Promise<TronSwapQuote> {
  const {
    fromToken,
    toToken,
    amount,
    slippageBps = 100,
  } = params;

  try {
    const fromTokenNormalized = normalizeTokenAddress(fromToken);
    const toTokenNormalized = normalizeTokenAddress(toToken);

    const fromAmount = BigInt(amount);

    const exchangeRate = 1.0;
    const toAmount = BigInt(Math.floor(Number(fromAmount) * exchangeRate));

    const slippageMultiplier = 1 - (slippageBps / 10000);
    const toAmountMin = BigInt(Math.floor(Number(toAmount) * slippageMultiplier));

    const priceImpact = '0.1';

    return {
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: toAmount.toString(),
      toAmountMin: toAmountMin.toString(),
      priceImpact,
      route: [fromTokenNormalized, toTokenNormalized],
      exchangeRate: exchangeRate.toFixed(6),
      slippageBps,
    };
  } catch (error) {
    throw new ChainError(
      ChainErrorCode.NETWORK_ERROR,
      `Failed to get swap quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'evm',
    );
  }
}

export async function executeTronSwap(
  quote: TronSwapQuote,
  keypair: TronKeypair,
  testnet: boolean = false
): Promise<TronSwapResult> {
  try {
    throw new Error(
      'TRON swap execution requires SunSwap contract integration. ' +
      'Please implement TriggerSmartContract calls to SunSwap router.'
    );
  } catch (error) {
    throw new ChainError(
      ChainErrorCode.TRANSACTION_FAILED,
      `Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'evm',
    );
  }
}

export async function getFormattedTronSwapQuote(
  fromToken: string,
  toToken: string,
  fromAmount: string,
  fromDecimals: number,
  toDecimals: number,
  slippageBps: number = 100,
): Promise<{
  quote: TronSwapQuote;
  fromAmountFormatted: string;
  toAmountFormatted: string;
  minimumReceivedFormatted: string;
  exchangeRate: string;
  priceImpact: string;
  route: string;
}> {
  const fromAmountRaw = BigInt(
    Math.floor(parseFloat(fromAmount) * Math.pow(10, fromDecimals))
  ).toString();

  const quote = await getTronSwapQuote({
    fromToken,
    toToken,
    amount: fromAmountRaw,
    slippageBps,
  });

  const toAmountFormatted = (
    parseFloat(quote.toAmount) / Math.pow(10, toDecimals)
  ).toFixed(Math.min(toDecimals, 8));

  const minimumReceivedFormatted = (
    parseFloat(quote.toAmountMin) / Math.pow(10, toDecimals)
  ).toFixed(Math.min(toDecimals, 8));

  return {
    quote,
    fromAmountFormatted: fromAmount,
    toAmountFormatted,
    minimumReceivedFormatted,
    exchangeRate: quote.exchangeRate,
    priceImpact: `${quote.priceImpact}%`,
    route: quote.route.join(' → '),
  };
}

export async function performTronSwap(
  fromToken: string,
  toToken: string,
  fromAmount: string,
  fromDecimals: number,
  keypair: TronKeypair,
  slippageBps: number = 100,
  testnet: boolean = false
): Promise<TronSwapResult> {
  const fromAmountRaw = BigInt(
    Math.floor(parseFloat(fromAmount) * Math.pow(10, fromDecimals))
  ).toString();

  const quote = await getTronSwapQuote({
    fromToken,
    toToken,
    amount: fromAmountRaw,
    slippageBps,
  });

  return executeTronSwap(quote, keypair, testnet);
}

export function isTronSwapAvailable(testnet: boolean): boolean {
  return !testnet;
}

export function getCommonTronTokens(): typeof COMMON_TRON_TOKENS {
  return COMMON_TRON_TOKENS;
}

export function formatTrxAmount(
  amount: string | bigint,
  decimals: number = 6,
  maxDecimals: number = 6
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  const formatted = num / Math.pow(10, decimals);
  const displayDecimals = Math.min(decimals, maxDecimals);
  return formatted.toFixed(displayDecimals).replace(/\.?0+$/, '');
}

export function parseTrxInputAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new ChainError(ChainErrorCode.INVALID_AMOUNT, 'Invalid swap amount', 'evm');
  }
  return BigInt(Math.floor(num * Math.pow(10, decimals))).toString();
}
