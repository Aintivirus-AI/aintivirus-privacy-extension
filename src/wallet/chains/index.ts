import type { ChainAdapter, ChainType, EVMChainId, NetworkEnvironment } from './types';
import { ChainError, ChainErrorCode } from './types';
import { createSolanaAdapter, SolanaAdapter } from './solana';
import { createEVMAdapter, EVMAdapter } from './evm';

// Import from registry for the new dynamic chain support
import {
  CHAIN_REGISTRY,
  getChain,
  getChainOrThrow,
  getChainsByFamily,
  isValidChainId,
  isEVMChain,
  isSolanaChain,
  legacyToChainId,
  chainIdToLegacy,
  type ChainConfig,
  type ChainFamily,
} from './registry';

// Chain selector layer that caches adapters and exposes Solana/EVM helpers.

const adapterCache: Map<string, ChainAdapter> = new Map();

function getAdapterCacheKey(
  chainType: ChainType,
  evmChainId?: EVMChainId,
  network?: NetworkEnvironment,
): string {
  if (chainType === 'solana') {
    return `solana-${network || 'mainnet'}`;
  }
  return `evm-${evmChainId}-${network || 'mainnet'}`;
}

/**
 * Get supported EVM chain IDs from the registry
 */
export function getSupportedEVMChains(): EVMChainId[] {
  return getChainsByFamily('evm').map((chain) => chain.id as EVMChainId);
}

/**
 * Get a chain adapter by chain type (legacy interface)
 * @deprecated Use getAdapterForChain() with chain ID instead
 */
export function getChainAdapter(
  chainType: ChainType,
  evmChainId?: EVMChainId,
  network: NetworkEnvironment = 'mainnet',
): ChainAdapter {
  const cacheKey = getAdapterCacheKey(chainType, evmChainId, network);

  const cached = adapterCache.get(cacheKey);
  if (cached) {
    if (cached.network !== network) {
      cached.setNetwork(network);
    }
    return cached;
  }

  let adapter: ChainAdapter;

  if (chainType === 'solana') {
    adapter = createSolanaAdapter(network);
  } else if (chainType === 'evm') {
    if (!evmChainId) {
      throw new ChainError(
        ChainErrorCode.INVALID_CHAIN,
        'EVM chain ID is required for EVM adapters',
        'evm',
      );
    }

    if (!getSupportedEVMChains().includes(evmChainId)) {
      throw new ChainError(
        ChainErrorCode.UNSUPPORTED_CHAIN,
        `Unsupported EVM chain: ${evmChainId}`,
        'evm',
      );
    }

    adapter = createEVMAdapter(evmChainId, network);
  } else {
    throw new ChainError(ChainErrorCode.UNSUPPORTED_CHAIN, `Unsupported chain type: ${chainType}`);
  }

  adapterCache.set(cacheKey, adapter);

  return adapter;
}

/**
 * Get an adapter for a chain by its registry ID (new interface)
 * This is the preferred way to get adapters - just use the chain ID from the registry
 */
export function getAdapterForChain(
  chainId: string,
  network: NetworkEnvironment = 'mainnet',
): ChainAdapter {
  const chain = getChainOrThrow(chainId);
  const { chainType, evmChainId } = chainIdToLegacy(chainId);
  return getChainAdapter(chainType, evmChainId, network);
}

export function getSolanaAdapter(network: NetworkEnvironment = 'mainnet'): SolanaAdapter {
  return getChainAdapter('solana', undefined, network) as SolanaAdapter;
}

export function getEVMAdapter(
  evmChainId: EVMChainId,
  network: NetworkEnvironment = 'mainnet',
): EVMAdapter {
  return getChainAdapter('evm', evmChainId, network) as EVMAdapter;
}

export function clearAdapterCache(): void {
  adapterCache.clear();
}

/**
 * Get supported chains (legacy interface)
 * @deprecated Use getAllChainIds() or getChainsByFamily() from registry instead
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

/**
 * Get all chain IDs from the registry
 */
export function getAllChainIds(): string[] {
  return Object.keys(CHAIN_REGISTRY);
}

/**
 * Get chain config by ID
 */
export { getChain, getChainOrThrow };

export * from './types';

// ============================================================================
// Registry Exports (New Dynamic Chain Support)
// ============================================================================
export {
  // Registry and config
  CHAIN_REGISTRY,
  getChainByNumericId,
  getChainsByFamily,
  isValidChainId,
  isEVMChain,
  isSolanaChain,
  legacyToChainId,
  chainIdToLegacy,
  // Explorer URLs (from registry)
  getExplorerUrl,
  getExplorerApiUrl,
  getAddressExplorerUrl,
  getTxExplorerUrl,
  // RPC
  getRpcUrls,
  getNumericChainId as getChainNumericId,
  // L2 helpers
  isL2Chain as isL2,
  getL2Type as getChainL2Type,
  // Derivation
  getDerivationPath,
  // Tokens
  getPopularTokens,
  getNativeToken,
  isSwapEnabled,
  getSwapProvider,
  // Chain keys
  buildChainKey,
  // Constants
  EVM_NATIVE_TOKEN_ADDRESS,
  WRAPPED_SOL_ADDRESS,
  // Types
  type ChainConfig,
  type ChainFamily,
  type ChainToken,
  type TestnetConfig,
  type L2Type,
} from './registry';

// Chain utilities
export {
  getChainsForSelector,
  getChainDisplayName,
  getSwapTokens,
  getNativeSwapToken,
  getDerivationPathTypes,
  buildDerivationPath,
  getDefaultGasLimit,
  getTokenGasLimit,
  getFamilyDisplayName,
  chainsShareAddressFormat,
  WEI_PER_ETH,
  GWEI_PER_ETH,
  LAMPORTS_PER_SOL,
  getNativeTokenMultiplier,
  formatAmount as formatChainAmount,
  parseAmount as parseChainAmount,
  isValidAddressFormat,
  compareChains,
  getSortedChains,
  type ChainDisplayInfo,
  type SwapToken,
} from './utils';

// ============================================================================
// Legacy Exports (Backward Compatibility)
// ============================================================================
export {
  EVM_CHAINS,
  SOLANA_CHAINS,
  DERIVATION_PATHS,
  getEVMChainConfig,
  getSolanaChainConfig,
  getNumericChainId,
  getEVMRpcUrls,
  getEVMExplorerUrl,
  isL2Chain,
  getL2Type,
  DEFAULT_EVM_CHAIN,
  DEFAULT_GAS_LIMIT,
  ERC20_GAS_LIMIT,
} from './config';

export { SolanaAdapter, createSolanaAdapter } from './solana';

export {
  EVMAdapter,
  createEVMAdapter,
  getProvider,
  getBestProvider,
  withFailover,
  clearProviderCache,
  getTransactionCount,
  sendTransaction,
  waitForTransaction,
  estimateTransactionGas,
  estimateNativeTransferGas,
  estimateTokenTransferGas,
  formatGasPrice,
  formatFee,
  sendNativeToken,
  sendToken,
  parseAmount,
  formatAmount,
  signTransaction,
  broadcastTransaction,
  confirmTransaction,
  getTokenBalance,
  getTokenMetadata,
  getPopularTokenBalances,
  POPULAR_TOKENS,
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
