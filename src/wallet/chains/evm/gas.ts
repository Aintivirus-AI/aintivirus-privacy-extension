import { Interface, parseUnits, formatUnits, Transaction } from 'ethers';
import type { EVMChainId } from '../types';
import {
  getEVMChainConfig,
  getNumericChainId,
  isL2Chain,
  getL2Type,
  DEFAULT_GAS_LIMIT,
  ERC20_GAS_LIMIT,
  GWEI_PER_ETH,
} from '../config';
import { getFeeData, estimateGas, call } from './client';

// Gas estimation helpers compute EVM/EIP-1559 fee components and L1 data fees.
export interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  maxPriorityFee: bigint;
  totalFee: bigint;
  totalFeeFormatted: number;
  l1DataFee: bigint;
  isEIP1559: boolean;
}

export interface GasEstimateParams {
  from: string;
  to: string;
  value?: bigint;
  data?: string;
}
const GAS_BUFFER_PERCENT = 10n;
const MIN_GAS_PRICE_GWEI = 1n;
const MAX_GAS_PRICE_GWEI = 1000n;
const OP_GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F';

const OP_GAS_ORACLE_ABI = [
  'function getL1Fee(bytes memory _data) external view returns (uint256)',
  'function l1BaseFee() external view returns (uint256)',
  'function overhead() external view returns (uint256)',
  'function scalar() external view returns (uint256)',
];

export async function estimateTransactionGas(
  chainId: EVMChainId,
  testnet: boolean,
  params: GasEstimateParams,
): Promise<GasEstimate> {
  const config = getEVMChainConfig(chainId);

  const feeData = await getFeeData(chainId, testnet);

  let gasLimit: bigint;
  try {
    gasLimit = await estimateGas(chainId, testnet, params);

    gasLimit = gasLimit + (gasLimit * GAS_BUFFER_PERCENT) / 100n;
  } catch (error) {
    gasLimit = params.data ? ERC20_GAS_LIMIT : DEFAULT_GAS_LIMIT;
  }

  let gasPrice: bigint;
  let maxPriorityFee: bigint;
  let isEIP1559 = false;

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    isEIP1559 = true;
    gasPrice = feeData.maxFeePerGas;
    maxPriorityFee = feeData.maxPriorityFeePerGas;
  } else {
    gasPrice = feeData.gasPrice || parseUnits('20', 'gwei');
    maxPriorityFee = 0n;
  }

  const gasPriceGwei = gasPrice / GWEI_PER_ETH;
  if (gasPriceGwei < MIN_GAS_PRICE_GWEI) {
    gasPrice = MIN_GAS_PRICE_GWEI * GWEI_PER_ETH;
  } else if (gasPriceGwei > MAX_GAS_PRICE_GWEI) {
  }

  let l1DataFee = 0n;
  if (isL2Chain(chainId)) {
    try {
      l1DataFee = await estimateL1DataFee(chainId, testnet, params);
    } catch (error) {}
  }

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

export async function estimateNativeTransferGas(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  to: string,
  amount: bigint,
): Promise<GasEstimate> {
  return estimateTransactionGas(chainId, testnet, {
    from,
    to,
    value: amount,
  });
}

export async function estimateTokenTransferGas(
  chainId: EVMChainId,
  testnet: boolean,
  from: string,
  to: string,
  tokenAddress: string,
  amount: bigint,
): Promise<GasEstimate> {
  const iface = new Interface(['function transfer(address to, uint256 amount)']);
  const data = iface.encodeFunctionData('transfer', [to, amount]);

  return estimateTransactionGas(chainId, testnet, {
    from,
    to: tokenAddress,
    data,
  });
}

async function estimateL1DataFee(
  chainId: EVMChainId,
  testnet: boolean,
  params: GasEstimateParams,
): Promise<bigint> {
  const l2Type = getL2Type(chainId);

  if (!l2Type) {
    return 0n;
  }

  if (l2Type === 'optimism') {
    return estimateOptimismL1Fee(chainId, testnet, params);
  } else if (l2Type === 'arbitrum') {
    return 0n;
  }

  return 0n;
}

async function estimateOptimismL1Fee(
  chainId: EVMChainId,
  testnet: boolean,
  params: GasEstimateParams,
): Promise<bigint> {
  try {
    const numericChainId = getNumericChainId(chainId, testnet);

    const tx = Transaction.from({
      type: 2,
      chainId: numericChainId,
      to: params.to,
      value: params.value || 0n,
      data: params.data || '0x',
      maxFeePerGas: parseUnits('1', 'gwei'),
      maxPriorityFeePerGas: parseUnits('1', 'gwei'),
      gasLimit: 21000n,
      nonce: 0,
    });

    const serialized = tx.unsignedSerialized;

    const iface = new Interface(OP_GAS_ORACLE_ABI);
    const calldata = iface.encodeFunctionData('getL1Fee', [serialized]);

    const result = await call(chainId, testnet, {
      to: OP_GAS_PRICE_ORACLE,
      data: calldata,
    });

    const [l1Fee] = iface.decodeFunctionResult('getL1Fee', result);

    return BigInt(l1Fee);
  } catch (error) {
    return parseUnits('0.0001', 'ether');
  }
}

export function formatGasPrice(gasPrice: bigint): string {
  const gwei = Number(gasPrice) / 1e9;
  if (gwei < 1) {
    return `${(gwei * 1000).toFixed(2)} mwei`;
  }
  return `${gwei.toFixed(2)} gwei`;
}

export function formatFee(fee: bigint, symbol: string = 'ETH'): string {
  const eth = Number(formatUnits(fee, 18));
  if (eth < 0.0001) {
    return `<0.0001 ${symbol}`;
  }
  return `${eth.toFixed(6)} ${symbol}`;
}

export async function getRecommendedGasSettings(
  chainId: EVMChainId,
  testnet: boolean,
): Promise<{
  slow: { gasPrice: bigint; waitTime: string };
  standard: { gasPrice: bigint; waitTime: string };
  fast: { gasPrice: bigint; waitTime: string };
}> {
  const feeData = await getFeeData(chainId, testnet);
  const baseGasPrice = feeData.gasPrice || parseUnits('20', 'gwei');

  return {
    slow: {
      gasPrice: (baseGasPrice * 80n) / 100n,
      waitTime: '~5 minutes',
    },
    standard: {
      gasPrice: baseGasPrice,
      waitTime: '~2 minutes',
    },
    fast: {
      gasPrice: (baseGasPrice * 120n) / 100n,
      waitTime: '~30 seconds',
    },
  };
}

export function calculateMaxSendable(balance: bigint, gasEstimate: GasEstimate): bigint {
  const maxAmount = balance - gasEstimate.totalFee;
  return maxAmount > 0n ? maxAmount : 0n;
}
