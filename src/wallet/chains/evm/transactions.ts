/**
 * AINTIVIRUS Wallet - EVM Transaction Operations
 * 
 * This module handles ETH and ERC-20 token transfers for all
 * supported EVM chains.
 * 
 * Features:
 * - Native ETH/token transfers
 * - ERC-20 token transfers
 * - EIP-1559 transaction support
 * - Nonce management
 * - Transaction confirmation polling
 * 
 * SECURITY:
 * - Chain ID is always verified in transactions (EIP-155)
 * - Transactions are signed locally, never sent unsigned
 * - Nonce is fetched fresh to prevent replay
 */

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
import {
  estimateNativeTransferGas,
  estimateTokenTransferGas,
  type GasEstimate,
} from './gas';
import { evmKeypairToWallet, isValidEVMAddress } from '../../keychain';

// ============================================
// TYPES
// ============================================

/**
 * Native transfer parameters
 */
export interface NativeTransferParams {
  from: string;
  to: string;
  amount: bigint;
  gasEstimate?: GasEstimate;
}

/**
 * ERC-20 transfer parameters
 */
export interface TokenTransferParams {
  from: string;
  to: string;
  tokenAddress: string;
  amount: bigint;
  gasEstimate?: GasEstimate;
}

/**
 * Transaction result
 */
export interface EVMTransactionResult {
  hash: string;
  explorerUrl: string;
  confirmed: boolean;
  receipt?: TransactionReceipt;
  error?: string;
}

/**
 * Unsigned transaction data
 */
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

// ============================================
// CONSTANTS
// ============================================

/**
 * ERC-20 transfer function signature
 */
const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

/**
 * ERC-20 interface for encoding
 */
const erc20Interface = new Interface(ERC20_TRANSFER_ABI);

// ============================================
// TRANSACTION CREATION
// ============================================

/**
 * Create an unsigned native token transfer transaction
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param params - Transfer parameters
 * @returns Unsigned transaction
 */
export async function createNativeTransfer(
  chainId: EVMChainId,
  testnet: boolean,
  params: NativeTransferParams
): Promise<UnsignedEVMTransaction> {
  const { from, to, amount } = params;
  
  // Validate addresses
  if (!isValidEVMAddress(from)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
  }
  if (!isValidEVMAddress(to)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
  }
  
  // Get gas estimate
  const gasEstimate = params.gasEstimate || 
    await estimateNativeTransferGas(chainId, testnet, from, to, amount);
  
  // Get nonce
  const nonce = await getTransactionCount(chainId, testnet, from, 'pending');
  
  // Get numeric chain ID
  const numericChainId = getNumericChainId(chainId, testnet);
  
  // Create transaction
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
      type: 2, // EIP-1559
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
      type: 0, // Legacy
    };
  }
}

/**
 * Create an unsigned ERC-20 token transfer transaction
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param params - Transfer parameters
 * @returns Unsigned transaction
 */
export async function createTokenTransfer(
  chainId: EVMChainId,
  testnet: boolean,
  params: TokenTransferParams
): Promise<UnsignedEVMTransaction> {
  const { from, to, tokenAddress, amount } = params;
  
  // Validate addresses
  if (!isValidEVMAddress(from)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid sender address', 'evm');
  }
  if (!isValidEVMAddress(to)) {
    throw new ChainError(ChainErrorCode.INVALID_ADDRESS, 'Invalid recipient address', 'evm');
  }
  if (!isValidEVMAddress(tokenAddress)) {
    throw new ChainError(ChainErrorCode.INVALID_TOKEN, 'Invalid token address', 'evm');
  }
  
  // Encode transfer call
  const data = erc20Interface.encodeFunctionData('transfer', [to, amount]);
  
  // Get gas estimate
  const gasEstimate = params.gasEstimate ||
    await estimateTokenTransferGas(chainId, testnet, from, to, tokenAddress, amount);
  
  // Get nonce
  const nonce = await getTransactionCount(chainId, testnet, from, 'pending');
  
  // Get numeric chain ID
  const numericChainId = getNumericChainId(chainId, testnet);
  
  // Create transaction (to token contract, not recipient)
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

// ============================================
// TRANSACTION SIGNING
// ============================================

/**
 * Sign an unsigned transaction
 * 
 * SECURITY: 
 * - Verifies chain ID matches expected chain
 * - Signs locally, private key never leaves memory
 * 
 * @param tx - Unsigned transaction
 * @param keypair - EVM keypair
 * @param expectedChainId - Expected chain ID for verification
 * @returns Signed transaction hex string
 */
export function signTransaction(
  tx: UnsignedEVMTransaction,
  keypair: EVMKeypair,
  expectedChainId: number
): string {
  // SECURITY: Verify chain ID matches
  if (tx.chainId !== expectedChainId) {
    throw new ChainError(
      ChainErrorCode.CHAIN_MISMATCH,
      `Transaction chain ID (${tx.chainId}) does not match expected (${expectedChainId})`,
      'evm'
    );
  }
  
  // Create wallet from keypair
  const wallet = evmKeypairToWallet(keypair);
  
  // Create Transaction object
  const transaction = Transaction.from({
    chainId: tx.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gasLimit: tx.gasLimit,
    nonce: tx.nonce,
    type: tx.type,
    ...(tx.type === 2 ? {
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    } : {
      gasPrice: tx.gasPrice,
    }),
  });
  
  // Sign and serialize
  const signedTx = wallet.signingKey.sign(transaction.unsignedHash);
  transaction.signature = signedTx;
  
  return transaction.serialized;
}

// ============================================
// TRANSACTION BROADCASTING
// ============================================

/**
 * Broadcast a signed transaction
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param signedTx - Signed transaction hex
 * @returns Transaction response
 */
export async function broadcastTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  signedTx: string
): Promise<TransactionResponse> {
  try {
    return await sendTransaction(chainId, testnet, signedTx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Parse common errors
    if (message.includes('insufficient funds')) {
      throw new ChainError(ChainErrorCode.INSUFFICIENT_FUNDS, 'Insufficient funds for gas', 'evm');
    }
    if (message.includes('nonce')) {
      throw new ChainError(ChainErrorCode.TRANSACTION_FAILED, 'Nonce error - please try again', 'evm');
    }
    if (message.includes('gas')) {
      throw new ChainError(ChainErrorCode.INSUFFICIENT_GAS, message, 'evm');
    }
    
    throw new ChainError(ChainErrorCode.BROADCAST_FAILED, message, 'evm');
  }
}

/**
 * Wait for transaction confirmation
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param txHash - Transaction hash
 * @param confirmations - Required confirmations (default 1)
 * @returns Transaction receipt or null if timeout
 */
export async function confirmTransaction(
  chainId: EVMChainId,
  testnet: boolean,
  txHash: string,
  confirmations: number = 1
): Promise<TransactionReceipt | null> {
  try {
    return await waitForTransaction(
      chainId,
      testnet,
      txHash,
      confirmations,
      TX_CONFIRMATION_TIMEOUT
    );
  } catch (error) {
    // Timeout - transaction may still succeed
    console.warn('[EVM Tx] Confirmation timeout for:', txHash);
    
    // Try to get receipt one more time
    try {
      return await getTransactionReceipt(chainId, testnet, txHash);
    } catch {
      return null;
    }
  }
}

// ============================================
// HIGH-LEVEL TRANSFER FUNCTIONS
// ============================================

/**
 * Send native tokens (ETH, MATIC, etc.)
 * 
 * Full send flow: create -> sign -> broadcast -> confirm
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param keypair - Sender's keypair
 * @param to - Recipient address
 * @param amount - Amount in wei
 * @returns Transaction result
 */
export async function sendNativeToken(
  chainId: EVMChainId,
  testnet: boolean,
  keypair: EVMKeypair,
  to: string,
  amount: bigint
): Promise<EVMTransactionResult> {
  const config = getEVMChainConfig(chainId);
  const numericChainId = getNumericChainId(chainId, testnet);
  const explorerBase = getEVMExplorerUrl(chainId, testnet);
  
  // Create unsigned transaction
  const unsignedTx = await createNativeTransfer(chainId, testnet, {
    from: keypair.address,
    to,
    amount,
  });
  
  // Sign transaction
  const signedTx = signTransaction(unsignedTx, keypair, numericChainId);
  
  // Broadcast
  const txResponse = await broadcastTransaction(chainId, testnet, signedTx);
  const hash = txResponse.hash;
  const explorerUrl = `${explorerBase}/tx/${hash}`;
  
  console.log(`[EVM Tx] Sent ${formatUnits(amount, config.decimals)} ${config.symbol} to ${to}`);
  console.log(`[EVM Tx] Hash: ${hash}`);
  
  // Wait for confirmation
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

/**
 * Send ERC-20 tokens
 * 
 * @param chainId - EVM chain identifier
 * @param testnet - Whether testnet
 * @param keypair - Sender's keypair
 * @param to - Recipient address
 * @param tokenAddress - Token contract address
 * @param amount - Amount in smallest units
 * @returns Transaction result
 */
export async function sendToken(
  chainId: EVMChainId,
  testnet: boolean,
  keypair: EVMKeypair,
  to: string,
  tokenAddress: string,
  amount: bigint
): Promise<EVMTransactionResult> {
  const numericChainId = getNumericChainId(chainId, testnet);
  const explorerBase = getEVMExplorerUrl(chainId, testnet);
  
  // Create unsigned transaction
  const unsignedTx = await createTokenTransfer(chainId, testnet, {
    from: keypair.address,
    to,
    tokenAddress,
    amount,
  });
  
  // Sign transaction
  const signedTx = signTransaction(unsignedTx, keypair, numericChainId);
  
  // Broadcast
  const txResponse = await broadcastTransaction(chainId, testnet, signedTx);
  const hash = txResponse.hash;
  const explorerUrl = `${explorerBase}/tx/${hash}`;
  
  console.log(`[EVM Tx] Sent token ${tokenAddress} to ${to}`);
  console.log(`[EVM Tx] Hash: ${hash}`);
  
  // Wait for confirmation
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

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse amount from user input to wei
 * 
 * @param input - User input string (e.g., "1.5")
 * @param decimals - Token decimals (default 18)
 * @returns Amount in smallest units
 */
export function parseAmount(input: string, decimals: number = 18): bigint {
  const cleaned = input.trim().replace(/,/g, '');
  return parseUnits(cleaned, decimals);
}

/**
 * Format amount from wei to display string
 * 
 * @param amount - Amount in smallest units
 * @param decimals - Token decimals (default 18)
 * @param maxDecimals - Maximum display decimals (default 6)
 * @returns Formatted amount string
 */
export function formatAmount(
  amount: bigint,
  decimals: number = 18,
  maxDecimals: number = 6
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

/**
 * Validate transaction parameters
 * 
 * @param params - Transaction parameters to validate
 * @returns Validation result
 */
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

/**
 * Calculate maximum sendable amount
 * 
 * @param balance - Current balance
 * @param estimatedFee - Estimated transaction fee
 * @returns Maximum sendable amount
 */
export function calculateMaxSend(balance: bigint, estimatedFee: bigint): bigint {
  const max = balance - estimatedFee;
  return max > 0n ? max : 0n;
}



