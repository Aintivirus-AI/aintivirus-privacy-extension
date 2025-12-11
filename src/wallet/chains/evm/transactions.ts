import {
  Wallet,
  Transaction,
  Interface,
  formatUnits,
  parseUnits,
  type TransactionRequest,
  type TransactionResponse,
  type TransactionReceipt,
} from 'ethers';
import type { EVMChainId, NetworkEnvironment } from '../types';
import { ChainError, ChainErrorCode } from '../types';
import type { EVMKeypair } from '../../keychain';
import {
  getNumericChainId,
  getEVMChainConfig,
  getEVMExplorerUrl,
  TX_CONFIRMATION_TIMEOUT,
  WEI_PER_ETH,
} from '../config';
import {
  getTransactionCount,
  sendTransaction,
  waitForTransaction,
  getTransactionReceipt,
  withFailover,
  getBestProvider,
} from './client';
import { estimateNativeTransferGas, estimateTokenTransferGas, type GasEstimate } from './gas';
import { evmKeypairToWallet, isValidEVMAddress } from '../../keychain';

// Transaction builders, signing, and broadcasting helpers for EVM networks.
export interface NativeTransferParams {
  from: string;
  to: string;
  amount: bigint;
  gasEstimate?: GasEstimate;
}

export interface TokenTransferParams {
  from: string;
  to: string;
  tokenAddress: string;
  amount: bigint;
  gasEstimate?: GasEstimate;
}

export interface EVMTransactionResult {
  hash: string;
  explorerUrl: string;
  confirmed: boolean;
  receipt?: TransactionReceipt;
  error?: string;
}

export interface UnsignedEVMTransaction {
  chainId: number;
  to: string;
  value: bigint;
  data: string;
  gasLimit: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  nonce: number;
  type: number;
}

const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

const erc20Interface = new Interface(ERC20_TRANSFER_ABI);

export async function createNativeTransfer(
  chainId: EVMChainId,
  testnet: boolean,
  params: NativeTransferParams,
): Promise<UnsignedEVMTransaction> {
  const { from, to, amount } = params;

  if (!isValidEVMAddress(from)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
  }
  if (!isValidEVMAddress(to)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
  }

  const gasEstimate =
    params.gasEstimate || (await estimateNativeTransferGas(chainId, testnet, from, to, amount));

  const nonce = await getTransactionCount(chainId, testnet, from, 'pending');

  const numericChainId = getNumericChainId(chainId, testnet);

  if (gasEstimate.isEIP1559) {
    return {
      chainId: numericChainId,
      to,
      value: amount,
      data: '0x',
      gasLimit: gasEstimate.gasLimit,
      maxFeePerGas: gasEstimate.gasPrice,
      maxPriorityFeePerGas: gasEstimate.maxPriorityFee,
      nonce,
      type: 2,
    };
  } else {
    return {
      chainId: numericChainId,
      to,
      value: amount,
      data: '0x',
      gasLimit: gasEstimate.gasLimit,
      gasPrice: gasEstimate.gasPrice,
      nonce,
      type: 0,
    };
  }
}

export async function createTokenTransfer(
  chainId: EVMChainId,
  testnet: boolean,
  params: TokenTransferParams,
): Promise<UnsignedEVMTransaction> {
  const { from, to, tokenAddress, amount } = params;

  if (!isValidEVMAddress(from)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
  }
  if (!isValidEVMAddress(to)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
  }
  if (!isValidEVMAddress(tokenAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
  }

  const data = erc20Interface.encodeFunctionData('transfer', [to, amount]);

  const gasEstimate =
    params.gasEstimate ||
    (await estimateTokenTransferGas(chainId, testnet, from, to, tokenAddress, amount));

  const nonce = await getTransactionCount(chainId, testnet, from, 'pending');

  const numericChainId = getNumericChainId(chainId, testnet);

  if (gasEstimate.isEIP1559) {
    return {
      chainId: numericChainId,
      to: tokenAddress,
      value: 0n,
      data,
      gasLimit: gasEstimate.gasLimit,
      maxFeePerGas: gasEstimate.gasPrice,
      maxPriorityFeePerGas: gasEstimate.maxPriorityFee,
      nonce,
      type: 2,
    };
  } else {
    return {
      chainId: numericChainId,
      to: tokenAddress,
      value: 0n,
      data,
      gasLimit: gasEstimate.gasLimit,
      gasPrice: gasEstimate.gasPrice,
      nonce,
      type: 0,
    };
  }
}

export function signTransaction(
  tx: UnsignedEVMTransaction,
  keypair: EVMKeypair,
  expectedChainId: number,
): string {
  if (tx.chainId !== expectedChainId) {
    throw new ChainError(
      ChainErrorCode.CHAIN_MISMATCH,
      `Transaction chain ID (${tx.chainId}) does not match expected (${expectedChainId})`,
      'evm',
    );
  }

  const wallet = evmKeypairToWallet(keypair);

  const transaction = Transaction.from({
    chainId: tx.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gasLimit: tx.gasLimit,
    nonce: tx.nonce,
    type: tx.type,
    ...(tx.type === 2
      ? {
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        }
      : {
          gasPrice: tx.gasPrice,
        }),
  });

  const signedTx = wallet.signingKey.sign(transaction.unsignedHash);
  transaction.signature = signedTx;

  return transaction.serialized;
}

export async function broadcastTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  signedTx: string,
): Promise<TransactionResponse> {
  try {
    return await sendTransaction(chainId, testnet, signedTx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('insufficient funds')) {
      throw new ChainError(ChainErrorCode.INSUFFICIENT_FUNDS, 'Insufficient funds for gas', 'evm');
    }
    if (message.includes('nonce')) {
      throw new ChainError(
        ChainErrorCode.TRANSACTION_FAILED,
        'Nonce error - please try again',
        'evm',
      );
    }
    if (message.includes('gas')) {
      throw new ChainError(ChainErrorCode.INSUFFICIENT_GAS, message, 'evm');
    }

    throw new ChainError(ChainErrorCode.BROADCAST_FAILED, message, 'evm');
  }
}

export async function confirmTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  txHash: string,
  confirmations: number = 1,
): Promise<TransactionReceipt | null> {
  try {
    return await waitForTransaction(
      chainId,
      testnet,
      txHash,
      confirmations,
      TX_CONFIRMATION_TIMEOUT,
    );
  } catch (error) {
    try {
      return await getTransactionReceipt(chainId, testnet, txHash);
    } catch {
      return null;
    }
  }
}

export async function sendNativeToken(
  chainId: EVMChainId,
  testnet: boolean,
  keypair: EVMKeypair,
  to: string,
  amount: bigint,
): Promise<EVMTransactionResult> {
  const config = getEVMChainConfig(chainId);
  const numericChainId = getNumericChainId(chainId, testnet);
  const explorerBase = getEVMExplorerUrl(chainId, testnet);

  const unsignedTx = await createNativeTransfer(chainId, testnet, {
    from: keypair.address,
    to,
    amount,
  });

  const signedTx = signTransaction(unsignedTx, keypair, numericChainId);

  const txResponse = await broadcastTransaction(chainId, testnet, signedTx);
  const hash = txResponse.hash;
  const explorerUrl = `${explorerBase}/tx/${hash}`;

  const receipt = await confirmTransaction(chainId, testnet, hash);

  if (receipt) {
    const success = receipt.status === 1;
    return {
      hash,
      explorerUrl,
      confirmed: success,
      receipt,
      error: success ? undefined : 'Transaction reverted',
    };
  }

  return {
    hash,
    explorerUrl,
    confirmed: false,
    error: 'Confirmation timeout - check explorer for status',
  };
}

export async function sendToken(
  chainId: EVMChainId,
  testnet: boolean,
  keypair: EVMKeypair,
  to: string,
  tokenAddress: string,
  amount: bigint,
): Promise<EVMTransactionResult> {
  const numericChainId = getNumericChainId(chainId, testnet);
  const explorerBase = getEVMExplorerUrl(chainId, testnet);

  const unsignedTx = await createTokenTransfer(chainId, testnet, {
    from: keypair.address,
    to,
    tokenAddress,
    amount,
  });

  const signedTx = signTransaction(unsignedTx, keypair, numericChainId);

  const txResponse = await broadcastTransaction(chainId, testnet, signedTx);
  const hash = txResponse.hash;
  const explorerUrl = `${explorerBase}/tx/${hash}`;

  const receipt = await confirmTransaction(chainId, testnet, hash);

  if (receipt) {
    const success = receipt.status === 1;
    return {
      hash,
      explorerUrl,
      confirmed: success,
      receipt,
      error: success ? undefined : 'Transaction reverted',
    };
  }

  return {
    hash,
    explorerUrl,
    confirmed: false,
    error: 'Confirmation timeout - check explorer for status',
  };
}

export function parseAmount(input: string, decimals: number = 18): bigint {
  const cleaned = input.trim().replace(/,/g, '');
  return parseUnits(cleaned, decimals);
}

export function formatAmount(
  amount: bigint,
  decimals: number = 18,
  maxDecimals: number = 6,
): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);

  if (num === 0) return '0';
  if (num < 0.000001) return num.toExponential(2);

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

export function validateTransferParams(params: {
  to: string;
  amount: bigint;
  balance: bigint;
  estimatedFee: bigint;
}): { valid: boolean; error?: string } {
  const { to, amount, balance, estimatedFee } = params;

  if (!isValidEVMAddress(to)) {
    return { valid: false, error: 'Invalid recipient address' };
  }

  if (amount <= 0n) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  const totalRequired = amount + estimatedFee;
  if (totalRequired > balance) {
    const shortfall = totalRequired - balance;
    return {
      valid: false,
      error: `Insufficient balance. Need ${formatUnits(shortfall, 18)} more ETH`,
    };
  }

  return { valid: true };
}

export function calculateMaxSend(balance: bigint, estimatedFee: bigint): bigint {
  const max = balance - estimatedFee;
  return max > 0n ? max : 0n;
}
