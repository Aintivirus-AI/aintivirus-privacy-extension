import { Interface, Contract, formatUnits, isAddress, getAddress } from 'ethers';
import type { EVMChainId, NetworkEnvironment, TokenBalance } from '../types';
import { ChainError, ChainErrorCode } from '../types';
import { call, withFailover, getBestProvider } from './client';
import { isValidEVMAddress } from '../../keychain';

// Token helpers for EVM (ERC-20) metadata lookups, balances, and popular token lists.
export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUri?: string;
}

export interface ERC20Balance extends TokenMetadata {
  rawBalance: string;
  uiBalance: number;
}

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

const erc20Interface = new Interface(ERC20_ABI);

export const POPULAR_TOKENS: Record<EVMChainId, TokenMetadata[]> = {
  ethereum: [
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
    {
      address: '0x6B175474E89094C44Da98b954EescdeCF54d54d2B',
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      decimals: 18,
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EeRe95cdeCF54d54d2B/logo.png',
    },
    {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      decimals: 8,
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
    },
    {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
  ],
  polygon: [
    {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359/logo.png',
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

export async function getTokenBalance(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string,
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

export async function getTokenMetadata(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
): Promise<TokenMetadata> {
  if (!isValidEVMAddress(tokenAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
  }

  let name = 'Unknown Token';
  let symbol = '???';
  let decimals = 18;

  try {
    const nameResult = await call(chainId, testnet, {
      to: tokenAddress,
      data: erc20Interface.encodeFunctionData('name'),
    });
    [name] = erc20Interface.decodeFunctionResult('name', nameResult);
  } catch {}

  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const symbolResult = await call(chainId, testnet, {
      to: tokenAddress,
      data: erc20Interface.encodeFunctionData('symbol'),
    });
    [symbol] = erc20Interface.decodeFunctionResult('symbol', symbolResult);
  } catch {}

  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const decimalsResult = await call(chainId, testnet, {
      to: tokenAddress,
      data: erc20Interface.encodeFunctionData('decimals'),
    });
    const [dec] = erc20Interface.decodeFunctionResult('decimals', decimalsResult);
    decimals = Number(dec);
  } catch {}

  // Try to get logo from known tokens or construct TrustWallet URL
  const logoUri = getTokenLogoUri(chainId, tokenAddress);

  return {
    address: tokenAddress,
    name,
    symbol,
    decimals,
    logoUri,
  };
}

export async function getTokenBalanceWithMetadata(
  chainId: EVMChainId,
  testnet: boolean,
  tokenAddress: string,
  ownerAddress: string,
): Promise<ERC20Balance> {
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

async function executeWithRateLimit<T>(
  queries: Array<() => Promise<T>>,
  concurrency: number = 3,
  delayMs: number = 150,
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

export async function getPopularTokenBalances(
  chainId: EVMChainId,
  testnet: boolean,
  ownerAddress: string,
): Promise<ERC20Balance[]> {
  if (testnet) {
    return [];
  }

  const popularTokens = POPULAR_TOKENS[chainId] || [];

  if (popularTokens.length === 0) {
    return [];
  }

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
      return null;
    }
  });

  const results = await executeWithRateLimit(queryFunctions, 3, 150);

  return results.filter((b): b is ERC20Balance => b !== null);
}

// Pre-known metadata for custom tokens to skip RPC calls (like Solana does)
export interface PreKnownTokenMeta {
  symbol?: string;
  name?: string;
  decimals?: number;
  logoUri?: string;
}

export async function getMultipleTokenBalances(
  chainId: EVMChainId,
  testnet: boolean,
  ownerAddress: string,
  tokenAddresses: string[],
  // Optional pre-known metadata to skip slow RPC calls
  knownMetadata?: Map<string, PreKnownTokenMeta>,
): Promise<ERC20Balance[]> {
  if (tokenAddresses.length === 0) {
    return [];
  }

  const queryFunctions = tokenAddresses.map((address) => async (): Promise<ERC20Balance> => {
    const normalizedAddress = address.toLowerCase();
    const preKnown = knownMetadata?.get(normalizedAddress);
    
    try {
      // For custom tokens, ALWAYS skip slow RPC metadata fetch (like Solana does)
      // Just get the balance and use whatever metadata we have (or placeholders)
      // This prevents the plugin from hanging on slow/unresponsive RPCs
      if (preKnown) {
        const balance = await getTokenBalance(chainId, testnet, address, ownerAddress);
        const decimals = preKnown.decimals ?? 18;
        const uiBalance = parseFloat(formatUnits(balance, decimals));
        
        // Generate a short address label if no symbol provided
        const shortAddr = `${address.slice(0, 6)}...`;
        
        return {
          address: address,
          name: preKnown.name || 'Unknown Token',
          symbol: preKnown.symbol || shortAddr,
          decimals: decimals,
          rawBalance: balance.toString(),
          uiBalance,
          logoUri: preKnown.logoUri || getTokenLogoUri(chainId, address),
        };
      }
      
      // No pre-known metadata at all - this shouldn't happen for custom tokens
      // but handle it gracefully by just getting balance with placeholder metadata
      const balance = await getTokenBalance(chainId, testnet, address, ownerAddress);
      return {
        address: address,
        name: 'Unknown Token',
        symbol: `${address.slice(0, 6)}...`,
        decimals: 18,
        rawBalance: balance.toString(),
        uiBalance: parseFloat(formatUnits(balance, 18)),
        logoUri: getTokenLogoUri(chainId, address),
      };
    } catch (error) {
      // Return a placeholder entry for failed queries so custom tokens still appear
      return {
        address: address,
        name: preKnown?.name || 'Unknown Token',
        symbol: preKnown?.symbol || `${address.slice(0, 6)}...`,
        decimals: preKnown?.decimals ?? 18,
        rawBalance: '0',
        uiBalance: 0,
        logoUri: preKnown?.logoUri,
      };
    }
  });

  const results = await executeWithRateLimit(queryFunctions, 2, 200);
  return results;
}

export async function isERC20Token(
  chainId: EVMChainId,
  testnet: boolean,
  address: string,
): Promise<boolean> {
  if (!isValidEVMAddress(address)) {
    return false;
  }

  try {
    const data = erc20Interface.encodeFunctionData('decimals');
    const result = await call(chainId, testnet, { to: address, data });

    const [decimals] = erc20Interface.decodeFunctionResult('decimals', result);
    return typeof decimals === 'bigint' && decimals <= 255n;
  } catch {
    return false;
  }
}

export function getTokenLogoUri(chainId: EVMChainId, tokenAddress: string): string | undefined {
  const popularTokens = POPULAR_TOKENS[chainId] || [];
  const known = popularTokens.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());

  if (known?.logoUri) {
    return known.logoUri;
  }

  const chainNames: Record<EVMChainId, string> = {
    ethereum: 'ethereum',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    base: 'base',
  };

  const chainName = chainNames[chainId];
  if (chainName) {
    // TrustWallet requires checksummed addresses
    let checksumAddress: string;
    try {
      checksumAddress = getAddress(tokenAddress);
    } catch {
      checksumAddress = tokenAddress;
    }
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainName}/assets/${checksumAddress}/logo.png`;
  }

  return undefined;
}

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
