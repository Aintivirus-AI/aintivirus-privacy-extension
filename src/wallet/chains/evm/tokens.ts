/**
 * AINTIVIRUS Wallet - ERC-20 Token Operations
 * 
 * This module handles ERC-20 token balance fetching and metadata
 * retrieval for all supported EVM chains.
 * 
 * Features:
 * - Token balance queries
 * - Token metadata (name, symbol, decimals)
 * - Popular token lists per chain
 * - Token logo resolution
 * 
 * SECURITY:
 * - Read-only operations (no token approvals)
 * - Validates contract addresses
 */

import { Interface, Contract, formatUnits, isAddress } from 'ethers';
import type { EVMChainId, NetworkEnvironment, TokenBalance } from '../types';
import { ChainError, ChainErrorCode } from '../types';
import { call, withFailover, getBestProvider } from './client';
import { isValidEVMAddress } from '../../keychain';

// ============================================
// TYPES
// ============================================

/**
 * Token metadata
 */
export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUri?: string;
}

/**
 * Token balance with metadata
 */
export interface ERC20Balance extends TokenMetadata {
  rawBalance: string;
  uiBalance: number;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * ERC-20 ABI (partial - read-only functions)
 */
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

/**
 * ERC-20 interface for encoding/decoding
 */
const erc20Interface = new Interface(ERC20_ABI);

/**
 * Popular tokens per chain (mainnet addresses)
 * These are checked by default for balances
 */
export const POPULAR_TOKENS: Record<EVMChainId, TokenMetadata[]> = {
  ethereum: [
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
      logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
    {
      address: '0x6B175474E89094C44Da98b954EescdeCF54d54d2B',
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      decimals: 18,
      logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EeRe95cdeCF54d54d2B/logo.png',
    },
    {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      decimals: 8,
      logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
    },
    {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
      logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
  ],
  polygon: [
    {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359/logo.png',
    },
    {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
    },
    {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
    },
  ],
  arbitrum: [
    {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
    },
    {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
    },
    {
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
    },
  ],
  optimism: [
    {
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
    },
    {
      address: '0x4200000000000000000000000000000000000006',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
    },
    {
      address: '0x4200000000000000000000000000000000000042',
      name: 'Optimism',
      symbol: 'OP',
      decimals: 18,
    },
  ],
  base: [
    {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0x4200000000000000000000000000000000000006',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
    },
  ],
};

// ============================================
// TOKEN BALANCE QUERIES
// ============================================

/**
 * Get ERC-20 token balance for an address
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param tokenAddress - Token contract address
 * @param ownerAddress - Owner address
 * @returns Balance in smallest units
 */
export async function getTokenBalance(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string
): Promise<bigint> {
  if (!isValidEVMAddress(tokenAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
  }
  if (!isValidEVMAddress(ownerAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid owner address', 'evm');
  }
  
  const data = erc20Interface.encodeFunctionData('balanceOf', [ownerAddress]);
  
  const result = await call(chainId, testnet, {
    to: tokenAddress,
    data,
  });
  
  const [balance] = erc20Interface.decodeFunctionResult('balanceOf', result);
  return BigInt(balance);
}

/**
 * Get token metadata (name, symbol, decimals)
 * Uses sequential calls to avoid rate limiting.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param tokenAddress - Token contract address
 * @returns Token metadata
 */
export async function getTokenMetadata(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string
): Promise<TokenMetadata> {
  if (!isValidEVMAddress(tokenAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
  }
  
  let name = 'Unknown Token';
  let symbol = '???';
  let decimals = 18;
  
  // Sequential calls to avoid rate limiting
  try {
    const nameResult = await call(chainId, testnet, {
      to: tokenAddress,
      data: erc20Interface.encodeFunctionData('name'),
    });
    [name] = erc20Interface.decodeFunctionResult('name', nameResult);
  } catch {}
  
  // Small delay between calls
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    const symbolResult = await call(chainId, testnet, {
      to: tokenAddress,
      data: erc20Interface.encodeFunctionData('symbol'),
    });
    [symbol] = erc20Interface.decodeFunctionResult('symbol', symbolResult);
  } catch {}
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    const decimalsResult = await call(chainId, testnet, {
      to: tokenAddress,
      data: erc20Interface.encodeFunctionData('decimals'),
    });
    const [dec] = erc20Interface.decodeFunctionResult('decimals', decimalsResult);
    decimals = Number(dec);
  } catch {}
  
  return {
    address: tokenAddress,
    name,
    symbol,
    decimals,
  };
}


/**
 * Get full token balance with metadata
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param tokenAddress - Token contract address
 * @param ownerAddress - Owner address
 * @returns Token balance with metadata
 */
export async function getTokenBalanceWithMetadata(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string
): Promise<ERC20Balance> {
  // Get balance and metadata in parallel
  const [balance, metadata] = await Promise.all([
    getTokenBalance(chainId, testnet, tokenAddress, ownerAddress),
    getTokenMetadata(chainId, testnet, tokenAddress),
  ]);
  
  const uiBalance = parseFloat(formatUnits(balance, metadata.decimals));
  
  return {
    ...metadata,
    rawBalance: balance.toString(),
    uiBalance,
  };
}

/**
 * Helper to execute queries with rate limiting
 * Limits concurrent requests to avoid RPC rate limiting (429 errors)
 */
async function executeWithRateLimit<T>(
  queries: Array<() => Promise<T>>,
  concurrency: number = 3,
  delayMs: number = 150
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
    
    // Delay between batches (skip after last batch)
    if (i + concurrency < queries.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Get balances for popular tokens
 * 
 * Checks balances for common tokens on the specified chain.
 * Only returns tokens with non-zero balances.
 * Uses rate limiting to avoid 429 errors from RPC providers.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param ownerAddress - Owner address
 * @returns Array of token balances with non-zero amounts
 */
export async function getPopularTokenBalances(
  chainId: EVMChainId,
  testnet: boolean,
  ownerAddress: string
): Promise<ERC20Balance[]> {
  // Don't check popular tokens on testnet (different addresses)
  if (testnet) {
    return [];
  }
  
  const popularTokens = POPULAR_TOKENS[chainId] || [];
  
  if (popularTokens.length === 0) {
    return [];
  }
  
  // Create query functions (not running promises) for rate limiting
  const queryFunctions = popularTokens.map((token) => async (): Promise<ERC20Balance | null> => {
    try {
      const balance = await getTokenBalance(chainId, testnet, token.address, ownerAddress);
      
      if (balance === 0n) {
        return null;
      }
      
      const uiBalance = parseFloat(formatUnits(balance, token.decimals));
      
      return {
        ...token,
        rawBalance: balance.toString(),
        uiBalance,
      };
    } catch (error) {
      // Skip tokens that fail
      console.warn(`[EVM Tokens] Failed to get balance for ${token.symbol}:`, error);
      return null;
    }
  });
  
  // Execute with rate limiting: 3 concurrent, 150ms delay between batches
  const results = await executeWithRateLimit(queryFunctions, 3, 150);
  
  // Filter out nulls (zero balances or errors)
  return results.filter((b): b is ERC20Balance => b !== null);
}

/**
 * Get balances for a list of specific tokens
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param ownerAddress - Owner address
 * @param tokenAddresses - Array of token addresses
 * @returns Array of token balances
 */
export async function getMultipleTokenBalances(
  chainId: EVMChainId,
  testnet: boolean,
  ownerAddress: string,
  tokenAddresses: string[]
): Promise<ERC20Balance[]> {
  if (tokenAddresses.length === 0) {
    return [];
  }
  
  // Create query functions for rate limiting
  const queryFunctions = tokenAddresses.map((address) => async (): Promise<ERC20Balance | null> => {
    try {
      return await getTokenBalanceWithMetadata(chainId, testnet, address, ownerAddress);
    } catch (error) {
      console.warn(`[EVM Tokens] Failed to get balance for ${address}:`, error);
      return null;
    }
  });
  
  // Execute with rate limiting: 2 concurrent (because each call makes multiple RPC calls)
  const results = await executeWithRateLimit(queryFunctions, 2, 200);
  return results.filter((b): b is ERC20Balance => b !== null);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if an address is an ERC-20 token contract
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param address - Address to check
 * @returns True if likely an ERC-20 token
 */
export async function isERC20Token(
  chainId: EVMChainId,
  testnet: boolean,
  address: string
): Promise<boolean> {
  if (!isValidEVMAddress(address)) {
    return false;
  }
  
  try {
    // Try to call decimals() - most ERC-20 tokens implement this
    const data = erc20Interface.encodeFunctionData('decimals');
    const result = await call(chainId, testnet, { to: address, data });
    
    // If we got a result, it's likely an ERC-20
    const [decimals] = erc20Interface.decodeFunctionResult('decimals', result);
    return typeof decimals === 'bigint' && decimals <= 255n;
  } catch {
    return false;
  }
}

/**
 * Get token logo URI
 * 
 * Tries to get logo from known sources.
 * 
 * @param chainId - EVM chain identifier
 * @param tokenAddress - Token address
 * @returns Logo URI or undefined
 */
export function getTokenLogoUri(
  chainId: EVMChainId,
  tokenAddress: string
): string | undefined {
  // Check popular tokens first
  const popularTokens = POPULAR_TOKENS[chainId] || [];
  const known = popularTokens.find(
    t => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  
  if (known?.logoUri) {
    return known.logoUri;
  }
  
  // Generate TrustWallet assets URL
  const chainNames: Record<EVMChainId, string> = {
    ethereum: 'ethereum',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    base: 'base',
  };
  
  const chainName = chainNames[chainId];
  if (chainName) {
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainName}/assets/${tokenAddress}/logo.png`;
  }
  
  return undefined;
}

/**
 * Convert token balance to TokenBalance interface
 * 
 * @param balance - ERC20 balance
 * @returns TokenBalance
 */
export function toTokenBalance(balance: ERC20Balance): TokenBalance {
  return {
    address: balance.address,
    symbol: balance.symbol,
    name: balance.name,
    decimals: balance.decimals,
    rawBalance: balance.rawBalance,
    uiBalance: balance.uiBalance,
    logoUri: balance.logoUri,
  };
}



