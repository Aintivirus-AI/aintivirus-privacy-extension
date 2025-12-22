/**
 * Chain Utilities - Helper functions for working with the chain registry
 *
 * This module provides convenience wrappers around the registry for common operations.
 */

import {
  CHAIN_REGISTRY,
  getChainOrThrow,
  getChainsByFamily,
  isEVMChain,
  type ChainConfig,
  type ChainFamily,
  type ChainToken,
  type NetworkEnvironment,
} from './registry';

// ============================================================================
// Chain Display Helpers
// ============================================================================

/**
 * Display information for chain selector UI
 */
export interface ChainDisplayInfo {
  id: string;
  family: ChainFamily;
  name: string;
  symbol: string;
  iconId: string;
  color: string;
  isTestnet: boolean;
}

/**
 * Get all chains formatted for display in chain selector
 */
export function getChainsForSelector(includeTestnets = false): ChainDisplayInfo[] {
  const chains: ChainDisplayInfo[] = [];

  for (const chain of Object.values(CHAIN_REGISTRY)) {
    chains.push({
      id: chain.id,
      family: chain.family,
      name: chain.name,
      symbol: chain.symbol,
      iconId: chain.iconId,
      color: chain.color,
      isTestnet: false,
    });

    if (includeTestnets && chain.testnet) {
      chains.push({
        id: chain.id,
        family: chain.family,
        name: `${chain.name} Testnet`,
        symbol: chain.symbol,
        iconId: chain.iconId,
        color: chain.color,
        isTestnet: true,
      });
    }
  }

  return chains;
}

/**
 * Get chain display name (handles testnet suffix)
 */
export function getChainDisplayName(chainId: string, testnet = false): string {
  const chain = getChainOrThrow(chainId);
  return testnet ? `${chain.name} Testnet` : chain.name;
}

// ============================================================================
// Token Helpers
// ============================================================================

/**
 * Token formatted for swap UI
 */
export interface SwapToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
}

/**
 * Get tokens formatted for swap UI
 */
export function getSwapTokens(chainId: string): SwapToken[] {
  const chain = getChainOrThrow(chainId);
  return (chain.popularTokens ?? []).map((token) => ({
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    logoUri: token.logoUri,
  }));
}

/**
 * Get native token for swap UI
 */
export function getNativeSwapToken(chainId: string): SwapToken | undefined {
  const chain = getChainOrThrow(chainId);
  const native = chain.popularTokens?.find((t) => t.isNative);
  if (!native) return undefined;

  return {
    address: native.address,
    symbol: native.symbol,
    name: native.name,
    decimals: native.decimals,
    logoUri: native.logoUri,
  };
}

// ============================================================================
// Derivation Path Helpers
// ============================================================================

/**
 * Get all available derivation path types for a chain
 */
export function getDerivationPathTypes(chainId: string): string[] {
  const chain = getChainOrThrow(chainId);
  const types = ['standard'];
  if (chain.alternativeDerivationPaths) {
    types.push(...Object.keys(chain.alternativeDerivationPaths));
  }
  return types;
}

/**
 * Get derivation path with index substituted
 */
export function buildDerivationPath(
  chainId: string,
  index: number,
  pathType = 'standard'
): string {
  const chain = getChainOrThrow(chainId);

  let template: string;
  if (pathType === 'standard') {
    template = chain.derivationPath;
  } else if (chain.alternativeDerivationPaths?.[pathType]) {
    template = chain.alternativeDerivationPaths[pathType];
  } else {
    throw new Error(`Unknown derivation path type: ${pathType}`);
  }

  return template.replace('{index}', index.toString());
}

// ============================================================================
// Gas Helpers
// ============================================================================

/**
 * Get default gas limit for native transfers
 */
export function getDefaultGasLimit(chainId: string): bigint {
  const chain = getChainOrThrow(chainId);
  return chain.defaultGasLimit ?? BigInt(21000);
}

/**
 * Get default gas limit for token transfers
 */
export function getTokenGasLimit(chainId: string): bigint {
  const chain = getChainOrThrow(chainId);
  return chain.tokenGasLimit ?? BigInt(65000);
}

// ============================================================================
// Chain Family Helpers
// ============================================================================

/**
 * Get chain family display name
 */
export function getFamilyDisplayName(family: ChainFamily): string {
  const names: Record<ChainFamily, string> = {
    evm: 'EVM Compatible',
    solana: 'Solana',
    bitcoin: 'Bitcoin',
    cosmos: 'Cosmos',
    sui: 'Sui',
    aptos: 'Aptos',
  };
  return names[family] ?? family;
}

/**
 * Check if two chains share the same address format
 * (useful for determining if addresses can be shared)
 */
export function chainsShareAddressFormat(chainId1: string, chainId2: string): boolean {
  const chain1 = getChainOrThrow(chainId1);
  const chain2 = getChainOrThrow(chainId2);

  // EVM chains share address format
  if (chain1.family === 'evm' && chain2.family === 'evm') {
    return true;
  }

  // Same family and coin type means same address derivation
  return chain1.family === chain2.family && chain1.coinType === chain2.coinType;
}

// ============================================================================
// Network Constants
// ============================================================================

/**
 * Wei per ETH (for EVM chains)
 */
export const WEI_PER_ETH = BigInt(10) ** BigInt(18);

/**
 * Gwei per ETH
 */
export const GWEI_PER_ETH = BigInt(10) ** BigInt(9);

/**
 * Lamports per SOL
 */
export const LAMPORTS_PER_SOL = BigInt(10) ** BigInt(9);

/**
 * Get the conversion factor for a chain's native token
 */
export function getNativeTokenMultiplier(chainId: string): bigint {
  const chain = getChainOrThrow(chainId);
  return BigInt(10) ** BigInt(chain.decimals);
}

/**
 * Format raw amount to human-readable string
 */
export function formatAmount(chainId: string, rawAmount: bigint, maxDecimals = 6): string {
  const chain = getChainOrThrow(chainId);
  const divisor = BigInt(10) ** BigInt(chain.decimals);
  const whole = rawAmount / divisor;
  const remainder = rawAmount % divisor;

  if (remainder === BigInt(0)) {
    return whole.toString();
  }

  const decimalStr = remainder.toString().padStart(chain.decimals, '0');
  const trimmed = decimalStr.slice(0, maxDecimals).replace(/0+$/, '');

  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

/**
 * Parse human-readable amount to raw amount
 */
export function parseAmount(chainId: string, amount: string): bigint {
  const chain = getChainOrThrow(chainId);
  const [whole, decimal = ''] = amount.split('.');

  const paddedDecimal = decimal.padEnd(chain.decimals, '0').slice(0, chain.decimals);
  const combined = `${whole}${paddedDecimal}`;

  return BigInt(combined);
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate address format for a specific chain
 * Note: This is a basic format check, not cryptographic validation
 */
export function isValidAddressFormat(chainId: string, address: string): boolean {
  const chain = getChainOrThrow(chainId);

  if (chain.family === 'evm') {
    // Basic EVM address check (0x + 40 hex chars)
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  if (chain.family === 'solana') {
    // Basic Solana address check (base58, 32-44 chars)
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  // For other chains, return true (validation should be done by specific adapter)
  return true;
}

// ============================================================================
// Chain Comparison
// ============================================================================

/**
 * Compare chains for sorting (Solana first, then EVM chains alphabetically)
 */
export function compareChains(a: ChainConfig, b: ChainConfig): number {
  // Solana always first
  if (a.family === 'solana' && b.family !== 'solana') return -1;
  if (b.family === 'solana' && a.family !== 'solana') return 1;

  // Then by name
  return a.name.localeCompare(b.name);
}

/**
 * Get chains sorted for display
 */
export function getSortedChains(): ChainConfig[] {
  return Object.values(CHAIN_REGISTRY).sort(compareChains);
}

