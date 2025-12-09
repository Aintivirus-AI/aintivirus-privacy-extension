

import { FunctionSignature, KnownContracts, KnownProtocol } from './types';


export const KNOWN_SELECTORS: Record<string, FunctionSignature> = {
  
  
  '0xa9059cbb': {
    name: 'transfer',
    params: ['address to', 'uint256 amount'],
    category: 'token',
  },
  '0x095ea7b3': {
    name: 'approve',
    params: ['address spender', 'uint256 amount'],
    category: 'approval',
  },
  '0x23b872dd': {
    name: 'transferFrom',
    params: ['address from', 'address to', 'uint256 amount'],
    category: 'token',
  },
  '0x70a08231': {
    name: 'balanceOf',
    params: ['address account'],
    category: 'other',
  },
  '0xdd62ed3e': {
    name: 'allowance',
    params: ['address owner', 'address spender'],
    category: 'other',
  },

  
  '0x42842e0e': {
    name: 'safeTransferFrom',
    params: ['address from', 'address to', 'uint256 tokenId'],
    category: 'nft',
  },
  '0xb88d4fde': {
    name: 'safeTransferFrom',
    params: ['address from', 'address to', 'uint256 tokenId', 'bytes data'],
    category: 'nft',
  },
  
  
  '0xa22cb465': {
    name: 'setApprovalForAll',
    params: ['address operator', 'bool approved'],
    category: 'approval',
  },
  '0x081812fc': {
    name: 'getApproved',
    params: ['uint256 tokenId'],
    category: 'other',
  },

  
  '0xf242432a': {
    name: 'safeTransferFrom',
    params: ['address from', 'address to', 'uint256 id', 'uint256 amount', 'bytes data'],
    category: 'nft',
  },
  '0x2eb2c2d6': {
    name: 'safeBatchTransferFrom',
    params: ['address from', 'address to', 'uint256[] ids', 'uint256[] amounts', 'bytes data'],
    category: 'nft',
  },

  
  '0xd505accf': {
    name: 'permit',
    params: [
      'address owner',
      'address spender',
      'uint256 value',
      'uint256 deadline',
      'uint8 v',
      'bytes32 r',
      'bytes32 s',
    ],
    category: 'approval',
  },

  
  '0x2b67b570': {
    name: 'permit',
    params: ['address owner', 'PermitSingle permitSingle', 'bytes signature'],
    category: 'permit2',
  },
  '0x2a2d80d1': {
    name: 'permitTransferFrom',
    params: ['PermitTransferFrom permit', 'SignatureTransferDetails transferDetails', 'address owner', 'bytes signature'],
    category: 'permit2',
  },
  '0x30f28b7a': {
    name: 'permitBatchTransferFrom',
    params: ['PermitBatchTransferFrom permit', 'SignatureTransferDetails[] transferDetails', 'address owner', 'bytes signature'],
    category: 'permit2',
  },
  '0x0d58b1db': {
    name: 'permitWitnessTransferFrom',
    category: 'permit2',
  },

  
  '0x3593564c': {
    name: 'execute',
    params: ['bytes commands', 'bytes[] inputs', 'uint256 deadline'],
    category: 'router',
  },
  '0x24856bc3': {
    name: 'execute',
    params: ['bytes commands', 'bytes[] inputs'],
    category: 'router',
  },
  '0x7ff36ab5': {
    name: 'swapExactETHForTokens',
    params: ['uint256 amountOutMin', 'address[] path', 'address to', 'uint256 deadline'],
    category: 'swap',
  },
  '0x18cbafe5': {
    name: 'swapExactTokensForETH',
    params: ['uint256 amountIn', 'uint256 amountOutMin', 'address[] path', 'address to', 'uint256 deadline'],
    category: 'swap',
  },
  '0x38ed1739': {
    name: 'swapExactTokensForTokens',
    params: ['uint256 amountIn', 'uint256 amountOutMin', 'address[] path', 'address to', 'uint256 deadline'],
    category: 'swap',
  },
  '0x8803dbee': {
    name: 'swapTokensForExactTokens',
    params: ['uint256 amountOut', 'uint256 amountInMax', 'address[] path', 'address to', 'uint256 deadline'],
    category: 'swap',
  },
  '0xfb3bdb41': {
    name: 'swapETHForExactTokens',
    params: ['uint256 amountOut', 'address[] path', 'address to', 'uint256 deadline'],
    category: 'swap',
  },
  '0x4a25d94a': {
    name: 'swapTokensForExactETH',
    params: ['uint256 amountOut', 'uint256 amountInMax', 'address[] path', 'address to', 'uint256 deadline'],
    category: 'swap',
  },

  
  '0xc04b8d59': {
    name: 'exactInput',
    params: ['ExactInputParams params'],
    category: 'swap',
  },
  '0x414bf389': {
    name: 'exactInputSingle',
    params: ['ExactInputSingleParams params'],
    category: 'swap',
  },
  '0xf28c0498': {
    name: 'exactOutput',
    params: ['ExactOutputParams params'],
    category: 'swap',
  },
  '0xdb3e2198': {
    name: 'exactOutputSingle',
    params: ['ExactOutputSingleParams params'],
    category: 'swap',
  },
  '0xac9650d8': {
    name: 'multicall',
    params: ['bytes[] data'],
    category: 'router',
  },

  
  '0xd0e30db0': {
    name: 'deposit',
    params: [],
    category: 'other',
  },
  '0x2e1a7d4d': {
    name: 'withdraw',
    params: ['uint256 wad'],
    category: 'other',
  },

  
  '0x1249c58b': {
    name: 'mint',
    params: [],
    category: 'other',
  },
  '0xa0712d68': {
    name: 'mint',
    params: ['uint256 amount'],
    category: 'other',
  },
  '0x42966c68': {
    name: 'burn',
    params: ['uint256 amount'],
    category: 'other',
  },
  '0x2e17de78': {
    name: 'unstake',
    params: ['uint256 amount'],
    category: 'other',
  },
  '0xa694fc3a': {
    name: 'stake',
    params: ['uint256 amount'],
    category: 'other',
  },
  '0x3ccfd60b': {
    name: 'withdraw',
    params: [],
    category: 'other',
  },
  '0xb6b55f25': {
    name: 'deposit',
    params: ['uint256 amount'],
    category: 'other',
  },
  '0xe2bbb158': {
    name: 'deposit',
    params: ['uint256 pid', 'uint256 amount'],
    category: 'other',
  },
};


export const KNOWN_CONTRACTS: KnownContracts = {
  
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': {
    name: 'Uniswap SwapRouter02',
    verified: true,
  },
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': {
    name: 'Uniswap Universal Router',
    verified: true,
  },
  '0x000000000022d473030f116ddee9f6b43ac78ba3': {
    name: 'Permit2',
    verified: true,
  },
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': {
    name: 'Uniswap V2 Router',
    verified: true,
  },
  '0xe592427a0aece92de3edee1f18e0157c05861564': {
    name: 'Uniswap V3 Router',
    verified: true,
  },

  
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': {
    name: 'Wrapped Ether (WETH)',
    verified: true,
  },

  
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    name: 'USD Coin (USDC)',
    verified: true,
  },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': {
    name: 'Tether USD (USDT)',
    verified: true,
  },
  '0x6b175474e89094c44da98b954eedeac495271d0f': {
    name: 'Dai Stablecoin (DAI)',
    verified: true,
  },

  
  '0x1111111254eeb25477b68fb85ed929f73a960582': {
    name: '1inch Router V5',
    verified: true,
  },

  
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': {
    name: '0x Exchange Proxy',
    verified: true,
  },

  
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': {
    name: 'OpenSea Seaport 1.5',
    verified: true,
  },
  '0x00000000000001ad428e4906ae43d8f9852d0dd6': {
    name: 'OpenSea Seaport 1.6',
    verified: true,
  },

  
  '0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5': {
    name: 'Blur Marketplace',
    verified: true,
  },

  
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': {
    name: 'Lido stETH',
    verified: true,
  },

  
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': {
    name: 'Aave V3 Pool',
    verified: true,
  },
};


const selectorCache = new Map<string, FunctionSignature | null>();


export function lookupSelector(selector: string): FunctionSignature | null {
  const normalized = selector.toLowerCase();
  
  
  if (selectorCache.has(normalized)) {
    return selectorCache.get(normalized)!;
  }
  
  
  const result = KNOWN_SELECTORS[normalized] || null;
  
  
  selectorCache.set(normalized, result);
  
  return result;
}


export function preloadCommonSelectors(): void {
  
  const commonSelectors = [
    '0xa9059cbb', 
    '0x095ea7b3', 
    '0x23b872dd', 
    '0xa22cb465', 
  ];
  
  for (const selector of commonSelectors) {
    lookupSelector(selector);
  }
}


const contractCache = new Map<string, KnownProtocol | null>();


export function lookupContract(address: string): KnownProtocol | null {
  const normalized = address.toLowerCase();
  
  
  if (contractCache.has(normalized)) {
    return contractCache.get(normalized)!;
  }
  
  
  const result = KNOWN_CONTRACTS[normalized] || null;
  
  
  contractCache.set(normalized, result);
  
  return result;
}


export function isVerifiedContract(address: string): boolean {
  const info = lookupContract(address);
  return info?.verified ?? false;
}


const displayNameCache = new Map<string, string>();


export function getContractDisplayName(address: string): string {
  
  if (displayNameCache.has(address)) {
    return displayNameCache.get(address)!;
  }
  
  const info = lookupContract(address);
  const displayName = info ? info.name : `${address.slice(0, 8)}...${address.slice(-6)}`;
  
  
  displayNameCache.set(address, displayName);
  
  return displayName;
}


export function clearSelectorCaches(): void {
  selectorCache.clear();
  contractCache.clear();
  displayNameCache.clear();
}
