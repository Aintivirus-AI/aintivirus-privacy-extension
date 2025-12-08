/**
 * AINTIVIRUS Wallet - Chain Adapter Factory
 * 
 * This module provides the entry point for multi-chain support.
 * Use the factory functions to create adapters for specific chains.
 * 
 * Supported chains:
 * - Solana (mainnet-beta, devnet)
 * - Ethereum (mainnet, sepolia)
 * - Polygon (mainnet, amoy)
 * - Arbitrum (one, sepolia)
 * - Optimism (mainnet, sepolia)
 * - Base (mainnet, sepolia)
 */

import type {
  ChainAdapter,
  ChainType,
  EVMChainId,
  NetworkEnvironment,
} from './types';
import { ChainError, ChainErrorCode } from './types';
import { createSolanaAdapter, SolanaAdapter } from './solana';
import { createEVMAdapter, EVMAdapter } from './evm';
import { getSupportedEVMChains } from './config';

// ============================================
// ADAPTER FACTORY
// ============================================

/**
 * Chain adapter cache
 * Reuses adapter instances to maintain state
 */
const adapterCache: Map<string, ChainAdapter> = new Map();

/**
 * Get cache key for adapter
 */
function getAdapterCacheKey(
  chainType: ChainType,
  evmChainId?: EVMChainId,
  network?: NetworkEnvironment
): string {
  if (chainType === 'solana') {
    return `solana-${network || 'mainnet'}`;
  }
  return `evm-${evmChainId}-${network || 'mainnet'}`;
}

/**
 * Create or get a chain adapter
 * 
 * @param chainType - Chain type ('solana' or 'evm')
 * @param evmChainId - EVM chain ID (required for EVM)
 * @param network - Network environment
 * @returns Chain adapter instance
 */
export function getChainAdapter(
  chainType: ChainType,
  evmChainId?: EVMChainId,
  network: NetworkEnvironment = 'mainnet'
): ChainAdapter {
  const cacheKey = getAdapterCacheKey(chainType, evmChainId, network);
  
  // Check cache
  const cached = adapterCache.get(cacheKey);
  if (cached) {
    // Update network if changed
    if (cached.network !== network) {
      cached.setNetwork(network);
    }
    return cached;
  }
  
  // Create new adapter
  let adapter: ChainAdapter;
  
  if (chainType === 'solana') {
    adapter = createSolanaAdapter(network);
  } else if (chainType === 'evm') {
    if (!evmChainId) {
      throw new ChainError(
        ChainErrorCode.INVALID_CHAIN,
        'EVM chain ID is required for EVM adapters',
        'evm'
      );
    }
    
    if (!getSupportedEVMChains().includes(evmChainId)) {
      throw new ChainError(
        ChainErrorCode.UNSUPPORTED_CHAIN,
        `Unsupported EVM chain: ${evmChainId}`,
        'evm'
      );
    }
    
    adapter = createEVMAdapter(evmChainId, network);
  } else {
    throw new ChainError(
      ChainErrorCode.UNSUPPORTED_CHAIN,
      `Unsupported chain type: ${chainType}`
    );
  }
  
  // Cache it
  adapterCache.set(cacheKey, adapter);
  
  return adapter;
}

/**
 * Get Solana adapter
 * 
 * Convenience function for Solana-specific access.
 * 
 * @param network - Network environment
 * @returns Solana adapter
 */
export function getSolanaAdapter(network: NetworkEnvironment = 'mainnet'): SolanaAdapter {
  return getChainAdapter('solana', undefined, network) as SolanaAdapter;
}

/**
 * Get EVM adapter for a specific chain
 * 
 * Convenience function for EVM-specific access.
 * 
 * @param evmChainId - EVM chain identifier
 * @param network - Network environment
 * @returns EVM adapter
 */
export function getEVMAdapter(
  evmChainId: EVMChainId,
  network: NetworkEnvironment = 'mainnet'
): EVMAdapter {
  return getChainAdapter('evm', evmChainId, network) as EVMAdapter;
}

/**
 * Clear adapter cache
 * 
 * Useful when switching accounts or resetting state.
 */
export function clearAdapterCache(): void {
  adapterCache.clear();
}

/**
 * Get all supported chain identifiers
 */
export function getSupportedChains(): {
  solana: true;
  evm: EVMChainId[];
} {
  return {
    solana: true,
    evm: getSupportedEVMChains(),
  };
}

// ============================================
// RE-EXPORTS
// ============================================

// Types
export * from './types';

// Config
export {
  EVM_CHAINS,
  SOLANA_CHAINS,
  DERIVATION_PATHS,
  getEVMChainConfig,
  getSolanaChainConfig,
  getNumericChainId,
  getEVMRpcUrls,
  getEVMExplorerUrl,
  getSupportedEVMChains,
  isL2Chain,
  getL2Type,
  DEFAULT_EVM_CHAIN,
  WEI_PER_ETH,
  GWEI_PER_ETH,
  DEFAULT_GAS_LIMIT,
  ERC20_GAS_LIMIT,
} from './config';

// Solana adapter
export { SolanaAdapter, createSolanaAdapter } from './solana';

// EVM adapter and utilities
export {
  EVMAdapter,
  createEVMAdapter,
  // Client
  getProvider,
  getBestProvider,
  withFailover,
  clearProviderCache,
  getTransactionCount,
  sendTransaction,
  waitForTransaction,
  // Gas
  estimateTransactionGas,
  estimateNativeTransferGas,
  estimateTokenTransferGas,
  formatGasPrice,
  formatFee,
  // Transactions
  sendNativeToken,
  sendToken,
  parseAmount,
  formatAmount,
  signTransaction,
  broadcastTransaction,
  confirmTransaction,
  // Tokens
  getTokenBalance,
  getTokenMetadata,
  getPopularTokenBalances,
  POPULAR_TOKENS,
  // Allowances
  discoverAllowances,
  getTokenAllowance,
  createRevokeTransaction,
  createBulkRevokeTransactions,
  estimateRevokeFee,
  clearAllowanceCache,
  clearAllAllowanceCache,
  isInfiniteAllowance,
  formatAllowance,
  MAX_UINT256,
  INFINITE_THRESHOLD,
  // Known Spenders
  getKnownSpenders,
  getSpenderLabel,
  isVerifiedSpender,
  KNOWN_SPENDERS,
  type TokenAllowance,
  type AllowanceCache,
  type AllowanceDiscoveryResult,
  type UnsignedRevokeTransaction,
  type SpenderInfo,
} from './evm';



