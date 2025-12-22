/**
 * Chain Display Utilities for UI Components
 *
 * These helpers provide chain display information derived from the registry.
 * When you add a new chain to the registry, it automatically works here.
 */

import {
  CHAIN_REGISTRY,
  getChainOrThrow,
  type ChainConfig,
  type ChainFamily,
} from '@wallet/chains/registry';
import type { ChainType, EVMChainId } from '@wallet/types';

// ============================================================================
// Chain Logo URLs
// ============================================================================

/**
 * Logo URL sources for chains (TrustWallet assets are reliable)
 */
const CHAIN_LOGO_URLS: Record<string, string> = {
  solana:
    'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  ethereum:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  polygon:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  arbitrum:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  optimism:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  base: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  // Add more chain logos here as you add chains to the registry
  // The pattern is: chainId: 'logo-url'
};

/**
 * Get logo URL for a chain
 */
export function getChainLogoUrl(chainId: string): string {
  return (
    CHAIN_LOGO_URLS[chainId] ??
    // Fallback to TrustWallet's generic pattern
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainId}/info/logo.png`
  );
}

/**
 * Get logo URL using legacy chain type format
 */
export function getChainLogoUrlLegacy(chainType: ChainType, evmChainId?: EVMChainId): string {
  if (chainType === 'solana') {
    return getChainLogoUrl('solana');
  }
  return getChainLogoUrl(evmChainId ?? 'ethereum');
}

// ============================================================================
// Chain Colors
// ============================================================================

/**
 * Get chain brand color
 */
export function getChainColor(chainId: string): string {
  const chain = CHAIN_REGISTRY[chainId];
  return chain?.color ?? '#627EEA'; // Default to Ethereum blue
}

/**
 * Get chain color using legacy chain type format
 */
export function getChainColorLegacy(chainType: ChainType, evmChainId?: EVMChainId): string {
  if (chainType === 'solana') {
    return getChainColor('solana');
  }
  return getChainColor(evmChainId ?? 'ethereum');
}

// ============================================================================
// Chain Display Info
// ============================================================================

/**
 * Get first letter of chain name for fallback icons
 */
export function getChainLetter(chainId: string): string {
  const chain = CHAIN_REGISTRY[chainId];
  return chain?.name.charAt(0).toUpperCase() ?? 'C';
}

/**
 * Get chain letter using legacy format
 */
export function getChainLetterLegacy(chainType: ChainType, evmChainId?: EVMChainId): string {
  if (chainType === 'solana') {
    return 'S';
  }
  return getChainLetter(evmChainId ?? 'ethereum');
}

/**
 * Get chain display name
 */
export function getChainName(chainId: string): string {
  const chain = CHAIN_REGISTRY[chainId];
  return chain?.name ?? chainId;
}

/**
 * Get chain name using legacy format
 */
export function getChainNameLegacy(chainType: ChainType, evmChainId?: EVMChainId | null): string {
  if (chainType === 'solana') {
    return 'Solana';
  }
  return getChainName(evmChainId ?? 'ethereum');
}

/**
 * Get chain native symbol
 */
export function getChainSymbol(chainId: string): string {
  const chain = CHAIN_REGISTRY[chainId];
  return chain?.symbol ?? 'ETH';
}

/**
 * Get chain symbol using legacy format
 */
export function getChainSymbolLegacy(chainType: ChainType, evmChainId?: EVMChainId): string {
  if (chainType === 'solana') {
    return 'SOL';
  }
  return getChainSymbol(evmChainId ?? 'ethereum');
}

// ============================================================================
// Chain List for Selectors
// ============================================================================

export interface ChainSelectorItem {
  /** Chain ID from registry */
  id: string;
  /** Legacy chain type */
  type: ChainType;
  /** Legacy EVM chain ID (for EVM chains) */
  evmChainId?: EVMChainId;
  /** Display name */
  name: string;
  /** Native token symbol */
  symbol: string;
  /** Logo URL */
  logoUrl: string;
  /** Brand color */
  color: string;
}

/**
 * Get all chains formatted for selector UI
 * This list is automatically updated when you add chains to CHAIN_REGISTRY
 */
export function getChainsForSelectorUI(): ChainSelectorItem[] {
  const chains: ChainSelectorItem[] = [];

  // Sort chains: Solana first, then EVM chains alphabetically
  const sortedChains = Object.values(CHAIN_REGISTRY).sort((a, b) => {
    if (a.family === 'solana' && b.family !== 'solana') return -1;
    if (b.family === 'solana' && a.family !== 'solana') return 1;
    return a.name.localeCompare(b.name);
  });

  for (const chain of sortedChains) {
    const type: ChainType = chain.family === 'solana' ? 'solana' : 'evm';
    chains.push({
      id: chain.id,
      type,
      evmChainId: chain.family === 'evm' ? (chain.id as EVMChainId) : undefined,
      name: chain.name,
      symbol: chain.symbol,
      logoUrl: getChainLogoUrl(chain.id),
      color: chain.color,
    });
  }

  return chains;
}

// ============================================================================
// Swap Token Helpers
// ============================================================================

export interface SwapTokenUI {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
}

/**
 * Get swap tokens for a chain from the registry
 */
export function getSwapTokensForChain(chainId: string): SwapTokenUI[] {
  const chain = CHAIN_REGISTRY[chainId];
  if (!chain?.popularTokens) return [];

  return chain.popularTokens.map((token) => ({
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    logoUri: token.logoUri,
  }));
}

/**
 * Get swap tokens using legacy chain type format
 */
export function getSwapTokensLegacy(
  chainType: ChainType,
  evmChainId?: EVMChainId | null
): SwapTokenUI[] {
  if (chainType === 'solana') {
    return getSwapTokensForChain('solana');
  }
  return getSwapTokensForChain(evmChainId ?? 'ethereum');
}

/**
 * Check if swap is available for a chain
 */
export function isSwapAvailableForChain(chainId: string): boolean {
  const chain = CHAIN_REGISTRY[chainId];
  return chain?.swapEnabled ?? false;
}

// ============================================================================
// Default Slippage by Chain
// ============================================================================

/**
 * Get default slippage for a chain (in basis points)
 */
export function getDefaultSlippage(chainId: string): number {
  const chain = CHAIN_REGISTRY[chainId];
  if (chain?.family === 'solana') {
    return 50; // 0.5% for Solana (faster finality)
  }
  return 100; // 1% for EVM chains
}

/**
 * Get default slippage using legacy format
 */
export function getDefaultSlippageLegacy(chainType: ChainType): number {
  return chainType === 'solana' ? 50 : 100;
}

