

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


const adapterCache: Map<string, ChainAdapter> = new Map();


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


export function getChainAdapter(
  chainType: ChainType,
  evmChainId?: EVMChainId,
  network: NetworkEnvironment = 'mainnet'
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
  
  
  adapterCache.set(cacheKey, adapter);
  
  return adapter;
}


export function getSolanaAdapter(network: NetworkEnvironment = 'mainnet'): SolanaAdapter {
  return getChainAdapter('solana', undefined, network) as SolanaAdapter;
}


export function getEVMAdapter(
  evmChainId: EVMChainId,
  network: NetworkEnvironment = 'mainnet'
): EVMAdapter {
  return getChainAdapter('evm', evmChainId, network) as EVMAdapter;
}


export function clearAdapterCache(): void {
  adapterCache.clear();
}


export function getSupportedChains(): {
  solana: true;
  evm: EVMChainId[];
} {
  return {
    solana: true,
    evm: getSupportedEVMChains(),
  };
}


export * from './types';


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

