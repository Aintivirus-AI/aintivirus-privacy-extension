

import type { ChainType, EVMChainId } from './types';


export type ExplorerType = 'tx' | 'address' | 'token';


export interface ExplorerUrlOptions {
  
  testnet?: boolean;
}


const EVM_EXPLORERS: Record<EVMChainId, { mainnet: string; testnet: string }> = {
  ethereum: {
    mainnet: 'https://etherscan.io',
    testnet: 'https://sepolia.etherscan.io',
  },
  polygon: {
    mainnet: 'https://polygonscan.com',
    testnet: 'https://amoy.polygonscan.com',
  },
  arbitrum: {
    mainnet: 'https://arbiscan.io',
    testnet: 'https://sepolia.arbiscan.io',
  },
  optimism: {
    mainnet: 'https://optimistic.etherscan.io',
    testnet: 'https://sepolia-optimism.etherscan.io',
  },
  base: {
    mainnet: 'https://basescan.org',
    testnet: 'https://sepolia.basescan.org',
  },
};


const SOLANA_EXPLORER = 'https://explorer.solana.com';


const DEXSCREENER_SOLANA = 'https://dexscreener.com/solana';


export function getExplorerUrl(
  type: ExplorerType,
  id: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): string {
  const isTestnet = options?.testnet ?? false;

  if (chain === 'solana') {
    return getSolanaExplorerUrl(type, id, isTestnet);
  }

  
  const chainId = evmChainId ?? 'ethereum';
  return getEVMExplorerUrl(type, id, chainId, isTestnet);
}


function getSolanaExplorerUrl(
  type: ExplorerType,
  id: string,
  isTestnet: boolean
): string {
  
  if (type === 'token' && !isTestnet) {
    return `${DEXSCREENER_SOLANA}/${id}`;
  }
  
  
  const clusterParam = isTestnet ? '?cluster=devnet' : '';
  return `${SOLANA_EXPLORER}/${type}/${id}${clusterParam}`;
}


function getEVMExplorerUrl(
  type: ExplorerType,
  id: string,
  chainId: EVMChainId,
  isTestnet: boolean
): string {
  const explorer = EVM_EXPLORERS[chainId];
  if (!explorer) {
    
    return `${EVM_EXPLORERS.ethereum.mainnet}/${type}/${id}`;
  }

  const baseUrl = isTestnet ? explorer.testnet : explorer.mainnet;
  return `${baseUrl}/${type}/${id}`;
}


export function getTxExplorerUrl(
  hash: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): string {
  return getExplorerUrl('tx', hash, chain, evmChainId, options);
}


export function getAddressExplorerUrl(
  address: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): string {
  return getExplorerUrl('address', address, chain, evmChainId, options);
}


export function getTokenExplorerUrl(
  tokenAddress: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): string {
  return getExplorerUrl('token', tokenAddress, chain, evmChainId, options);
}


export function openExplorerUrl(
  type: ExplorerType,
  id: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): void {
  const url = getExplorerUrl(type, id, chain, evmChainId, options);
  window.open(url, '_blank', 'noopener,noreferrer');
}
