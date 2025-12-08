/**
 * AINTIVIRUS Wallet - EVM Gas Estimation
 * 
 * This module handles gas estimation for EVM transactions,
 * including special handling for L2 chains (Optimism, Arbitrum, Base).
 * 
 * L2 Fee Models:
 * - Optimism/Base (OP Stack): L2 execution fee + L1 data fee
 * - Arbitrum: L2 gas price includes L1 costs
 * 
 * SECURITY:
 * - Always estimate with buffer for safety
 * - Handle RPC failures gracefully
 */

import { Interface, parseUnits, formatUnits, Transaction } from 'ethers';
import type { EVMChainId, NetworkEnvironment } from '../types';
import { ChainError, ChainErrorCode } from '../types';
import {
  getEVMChainConfig,
  getNumericChainId,
  isL2Chain,
  getL2Type,
  DEFAULT_GAS_LIMIT,
  ERC20_GAS_LIMIT,
  WEI_PER_ETH,
  GWEI_PER_ETH,
} from '../config';
import {
  getFeeData,
  estimateGas,
  call,
  withFailover,
  getBestProvider,
} from './client';

// ============================================
// TYPES
// ============================================

/**
 * Gas estimation result
 */
export interface GasEstimate {
  /** Gas limit for the transaction */
  gasLimit: bigint;
  /** Gas price (legacy) or max fee per gas (EIP-1559) */
  gasPrice: bigint;
  /** Max priority fee (EIP-1559) */
  maxPriorityFee: bigint;
  /** Total estimated fee in wei */
  totalFee: bigint;
  /** Total fee formatted in ETH/native token */
  totalFeeFormatted: number;
  /** L1 data fee for L2 chains */
  l1DataFee: bigint;
  /** Whether EIP-1559 is supported */
  isEIP1559: boolean;
}

/**
 * Transaction parameters for gas estimation
 */
export interface GasEstimateParams {
  from: string;
  to: string;
  value?: bigint;
  data?: string;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Gas estimation buffer (10% extra for safety)
 */
const GAS_BUFFER_PERCENT = 10n;

/**
 * Minimum gas price in gwei (for sanity check)
 */
const MIN_GAS_PRICE_GWEI = 1n;

/**
 * Maximum gas price in gwei (for sanity check - 1000 gwei)
 */
const MAX_GAS_PRICE_GWEI = 1000n;

/**
 * Optimism L1 Gas Price Oracle address
 */
const OP_GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F';

/**
 * Optimism Gas Price Oracle ABI (partial)
 */
const OP_GAS_ORACLE_ABI = [
  'function getL1Fee(bytes memory _data) external view returns (uint256)',
  'function l1BaseFee() external view returns (uint256)',
  'function overhead() external view returns (uint256)',
  'function scalar() external view returns (uint256)',
];

// ============================================
// GAS ESTIMATION FUNCTIONS
// ============================================

/**
 * Estimate gas for a transaction
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param params - Transaction parameters
 * @returns Gas estimate
 */
export async function estimateTransactionGas(
  chainId: EVMChainId,
  testnet: boolean,
  params: GasEstimateParams
): Promise<GasEstimate> {
  const config = getEVMChainConfig(chainId);
  
  // Get fee data
  const feeData = await getFeeData(chainId, testnet);
  
  // Estimate gas limit
  let gasLimit: bigint;
  try {
    gasLimit = await estimateGas(chainId, testnet, params);
    // Add buffer
    gasLimit = gasLimit + (gasLimit * GAS_BUFFER_PERCENT / 100n);
  } catch (error) {
    // Fall back to default based on transaction type
    gasLimit = params.data ? ERC20_GAS_LIMIT : DEFAULT_GAS_LIMIT;
  }
  
  // Determine gas price
  let gasPrice: bigint;
  let maxPriorityFee: bigint;
  let isEIP1559 = false;
  
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    // EIP-1559 transaction
    isEIP1559 = true;
    gasPrice = feeData.maxFeePerGas;
    maxPriorityFee = feeData.maxPriorityFeePerGas;
  } else {
    // Legacy transaction
    gasPrice = feeData.gasPrice || parseUnits('20', 'gwei');
    maxPriorityFee = 0n;
  }
  
  // Sanity check gas price
  const gasPriceGwei = gasPrice / GWEI_PER_ETH;
  if (gasPriceGwei < MIN_GAS_PRICE_GWEI) {
    gasPrice = MIN_GAS_PRICE_GWEI * GWEI_PER_ETH;
  } else if (gasPriceGwei > MAX_GAS_PRICE_GWEI) {
    console.warn(`[EVM Gas] High gas price detected: ${gasPriceGwei} gwei`);
  }
  
  // Calculate L1 data fee for L2 chains
  let l1DataFee = 0n;
  if (isL2Chain(chainId)) {
    try {
      l1DataFee = await estimateL1DataFee(chainId, testnet, params);
    } catch (error) {
      console.warn('[EVM Gas] Failed to estimate L1 data fee:', error);
      // Continue without L1 fee - will be included in actual tx
    }
  }
  
  // Calculate total fee
  const l2Fee = gasLimit * gasPrice;
  const totalFee = l2Fee + l1DataFee;
  const totalFeeFormatted = Number(formatUnits(totalFee, config.decimals));
  
  return {
    gasLimit,
    gasPrice,
    maxPriorityFee,
    totalFee,
    totalFeeFormatted,
    l1DataFee,
    isEIP1559,
  };
}

/**
 * Estimate gas for a native token transfer
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param from - Sender address
 * @param to - Recipient address
 * @param amount - Amount in wei
 * @returns Gas estimate
 */
export async function estimateNativeTransferGas(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  to: string,
  amount: bigint
): Promise<GasEstimate> {
  return estimateTransactionGas(chainId, testnet, {
    from,
    to,
    value: amount,
  });
}

/**
 * Estimate gas for an ERC-20 token transfer
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param from - Sender address
 * @param to - Recipient address
 * @param tokenAddress - Token contract address
 * @param amount - Amount in smallest units
 * @returns Gas estimate
 */
export async function estimateTokenTransferGas(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  to: string,
  tokenAddress: string,
  amount: bigint
): Promise<GasEstimate> {
  // Encode transfer function call
  const iface = new Interface(['function transfer(address to, uint256 amount)']);
  const data = iface.encodeFunctionData('transfer', [to, amount]);
  
  return estimateTransactionGas(chainId, testnet, {
    from,
    to: tokenAddress,
    data,
  });
}

// ============================================
// L2 FEE ESTIMATION
// ============================================

/**
 * Estimate L1 data fee for L2 transactions
 * 
 * This is the cost of posting transaction data to L1.
 * Only applies to Optimism-style L2s (OP, Base) and Arbitrum.
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param params - Transaction parameters
 * @returns L1 data fee in wei
 */
async function estimateL1DataFee(
  chainId: EVMChainId,
  testnet: boolean,
  params: GasEstimateParams
): Promise<bigint> {
  const l2Type = getL2Type(chainId);
  
  if (!l2Type) {
    return 0n;
  }
  
  if (l2Type === 'optimism') {
    return estimateOptimismL1Fee(chainId, testnet, params);
  } else if (l2Type === 'arbitrum') {
    // Arbitrum includes L1 costs in the gas price
    // No separate L1 fee calculation needed
    return 0n;
  }
  
  return 0n;
}

/**
 * Estimate L1 fee for Optimism-style L2s (OP, Base)
 * 
 * Uses the GasPriceOracle contract to calculate L1 data fee.
 */
async function estimateOptimismL1Fee(
  chainId: EVMChainId,
  testnet: boolean,
  params: GasEstimateParams
): Promise<bigint> {
  try {
    // Encode a sample transaction to estimate L1 fee
    const numericChainId = getNumericChainId(chainId, testnet);
    
    // Create a minimal transaction for fee estimation
    const tx = Transaction.from({
      type: 2, // EIP-1559
      chainId: numericChainId,
      to: params.to,
      value: params.value || 0n,
      data: params.data || '0x',
      maxFeePerGas: parseUnits('1', 'gwei'),
      maxPriorityFeePerGas: parseUnits('1', 'gwei'),
      gasLimit: 21000n,
      nonce: 0,
    });
    
    // RLP encode the transaction (unsigned)
    const serialized = tx.unsignedSerialized;
    
    // Call the L1 gas price oracle
    const iface = new Interface(OP_GAS_ORACLE_ABI);
    const calldata = iface.encodeFunctionData('getL1Fee', [serialized]);
    
    const result = await call(chainId, testnet, {
      to: OP_GAS_PRICE_ORACLE,
      data: calldata,
    });
    
    // Decode the result
    const [l1Fee] = iface.decodeFunctionResult('getL1Fee', result);
    
    return BigInt(l1Fee);
  } catch (error) {
    console.warn('[EVM Gas] Failed to get Optimism L1 fee:', error);
    // Return a rough estimate based on typical L1 fees
    // ~0.0001 ETH for simple transfers
    return parseUnits('0.0001', 'ether');
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format gas price for display
 * 
 * @param gasPrice - Gas price in wei
 * @returns Formatted string (e.g., "20 gwei")
 */
export function formatGasPrice(gasPrice: bigint): string {
  const gwei = Number(gasPrice) / 1e9;
  if (gwei < 1) {
    return `${(gwei * 1000).toFixed(2)} mwei`;
  }
  return `${gwei.toFixed(2)} gwei`;
}

/**
 * Format fee for display
 * 
 * @param fee - Fee in wei
 * @param symbol - Token symbol
 * @returns Formatted string
 */
export function formatFee(fee: bigint, symbol: string = 'ETH'): string {
  const eth = Number(formatUnits(fee, 18));
  if (eth < 0.0001) {
    return `<0.0001 ${symbol}`;
  }
  return `${eth.toFixed(6)} ${symbol}`;
}

/**
 * Get recommended gas settings for a chain
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @returns Recommended gas settings
 */
export async function getRecommendedGasSettings(
  chainId: EVMChainId,
  testnet: boolean
): Promise<{
  slow: { gasPrice: bigint; waitTime: string };
  standard: { gasPrice: bigint; waitTime: string };
  fast: { gasPrice: bigint; waitTime: string };
}> {
  const feeData = await getFeeData(chainId, testnet);
  const baseGasPrice = feeData.gasPrice || parseUnits('20', 'gwei');
  
  return {
    slow: {
      gasPrice: baseGasPrice * 80n / 100n,
      waitTime: '~5 minutes',
    },
    standard: {
      gasPrice: baseGasPrice,
      waitTime: '~2 minutes',
    },
    fast: {
      gasPrice: baseGasPrice * 120n / 100n,
      waitTime: '~30 seconds',
    },
  };
}

/**
 * Calculate maximum sendable amount considering gas
 * 
 * @param balance - Current balance in wei
 * @param gasEstimate - Gas estimate
 * @returns Maximum sendable amount in wei
 */
export function calculateMaxSendable(balance: bigint, gasEstimate: GasEstimate): bigint {
  const maxAmount = balance - gasEstimate.totalFee;
  return maxAmount > 0n ? maxAmount : 0n;
}



