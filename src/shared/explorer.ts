/**
 * AINTIVIRUS Wallet - Explorer URL Utilities
 * 
 * Centralized utility for generating blockchain explorer URLs
 * for transactions, addresses, and tokens across all supported chains.
 */

import type { ChainType, EVMChainId } from './types';

// ============================================
// TYPES
// ============================================

/**
 * Types of explorer pages
 */
export type ExplorerType = 'tx' | 'address' | 'token';

/**
 * Options for explorer URL generation
 */
export interface ExplorerUrlOptions {
  /** Whether this is a testnet network */
  testnet?: boolean;
}

// ============================================
// EXPLORER CONFIGURATION
// ============================================

/**
 * EVM explorer base URLs by chain
 */
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

/**
 * Solana explorer base URL
 */
const SOLANA_EXPLORER = 'https://explorer.solana.com';

/**
 * DexScreener URL for token lookups (better for meme coins)
 */
const DEXSCREENER_SOLANA = 'https://dexscreener.com/solana';

// ============================================
// MAIN UTILITY FUNCTION
// ============================================

/**
 * Get explorer URL for a transaction, address, or token
 * 
 * @param type - Type of explorer page ('tx', 'address', or 'token')
 * @param id - The transaction hash, address, or token address
 * @param chain - Chain type ('solana' or 'evm')
 * @param evmChainId - For EVM chains, the specific chain ID
 * @param options - Additional options like testnet flag
 * @returns Full explorer URL
 * 
 * @example
 * // Solana mainnet transaction
 * getExplorerUrl('tx', '5abc...', 'solana')
 * // => 'https://explorer.solana.com/tx/5abc...'
 * 
 * @example
 * // Solana devnet address
 * getExplorerUrl('address', 'Abc...', 'solana', undefined, { testnet: true })
 * // => 'https://explorer.solana.com/address/Abc...?cluster=devnet'
 * 
 * @example
 * // Ethereum mainnet token
 * getExplorerUrl('token', '0x...', 'evm', 'ethereum')
 * // => 'https://etherscan.io/token/0x...'
 */
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

  // EVM chain
  const chainId = evmChainId ?? 'ethereum';
  return getEVMExplorerUrl(type, id, chainId, isTestnet);
}

/**
 * Get Solana explorer URL
 * Uses DexScreener for token lookups (better meme coin coverage)
 */
function getSolanaExplorerUrl(
  type: ExplorerType,
  id: string,
  isTestnet: boolean
): string {
  // Use DexScreener for token lookups (better for meme coins)
  if (type === 'token' && !isTestnet) {
    return `${DEXSCREENER_SOLANA}/${id}`;
  }
  
  // Use Solana Explorer for transactions and addresses
  const clusterParam = isTestnet ? '?cluster=devnet' : '';
  return `${SOLANA_EXPLORER}/${type}/${id}${clusterParam}`;
}

/**
 * Get EVM explorer URL
 */
function getEVMExplorerUrl(
  type: ExplorerType,
  id: string,
  chainId: EVMChainId,
  isTestnet: boolean
): string {
  const explorer = EVM_EXPLORERS[chainId];
  if (!explorer) {
    // Fallback to Ethereum if unknown chain
    return `${EVM_EXPLORERS.ethereum.mainnet}/${type}/${id}`;
  }

  const baseUrl = isTestnet ? explorer.testnet : explorer.mainnet;
  return `${baseUrl}/${type}/${id}`;
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Get transaction explorer URL
 */
export function getTxExplorerUrl(
  hash: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): string {
  return getExplorerUrl('tx', hash, chain, evmChainId, options);
}

/**
 * Get address explorer URL
 */
export function getAddressExplorerUrl(
  address: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): string {
  return getExplorerUrl('address', address, chain, evmChainId, options);
}

/**
 * Get token explorer URL
 */
export function getTokenExplorerUrl(
  tokenAddress: string,
  chain: ChainType,
  evmChainId?: EVMChainId,
  options?: ExplorerUrlOptions
): string {
  return getExplorerUrl('token', tokenAddress, chain, evmChainId, options);
}

/**
 * Open explorer URL in a new tab
 * Uses secure window.open with noopener,noreferrer
 */
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
