/**
 * AINTIVIRUS Wallet Module - Transaction Operations
 * 
 * This module handles SOL transfer operations including:
 * - Transaction creation and validation
 * - Fee estimation
 * - Transaction broadcasting and confirmation
 * 
 * SECURITY:
 * - All signing operations require an unlocked wallet
 * - Transactions are simulated before broadcast
 * - Proper error handling for all failure modes
 */

import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SendTransactionError,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  SendTransactionParams,
  SendTransactionResult,
  FeeEstimate,
  WalletError,
  WalletErrorCode,
} from './types';
import {
  getCurrentConnection,
  getRecentBlockhash,
  getTransactionExplorerUrl,
} from './rpc';
import { getUnlockedKeypair, getPublicAddress } from './storage';
import { isValidSolanaAddress } from './keychain';
import bs58 from 'bs58';

// ============================================
// CONSTANTS
// ============================================

/**
 * Minimum SOL amount to keep for rent exemption
 * Approx 0.00089 SOL for a basic account
 */
const MIN_RENT_EXEMPT_BALANCE = 890880;

/**
 * Default priority fee in micro-lamports per compute unit
 */
const DEFAULT_PRIORITY_FEE = 1000;

/**
 * Transaction confirmation timeout in milliseconds
 */
const CONFIRMATION_TIMEOUT = 60000;

/**
 * Maximum retries for transaction submission
 */
const MAX_RETRIES = 3;

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a recipient address
 * 
 * @param recipient - Base58-encoded public key
 * @returns True if valid
 */
export function validateRecipient(recipient: string): boolean {
  if (!recipient || recipient.trim().length === 0) {
    return false;
  }
  return isValidSolanaAddress(recipient);
}

/**
 * Validate transaction amount
 * 
 * @param amountSol - Amount in SOL
 * @param balanceLamports - Current balance in lamports
 * @param feeLamports - Estimated fee in lamports
 * @returns Validation result
 */
export function validateAmount(
  amountSol: number,
  balanceLamports: number,
  feeLamports: number
): { valid: boolean; error?: string } {
  if (amountSol <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (isNaN(amountSol) || !isFinite(amountSol)) {
    return { valid: false, error: 'Invalid amount' };
  }

  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  const totalRequired = amountLamports + feeLamports;
  const remainingBalance = balanceLamports - totalRequired;

  if (totalRequired > balanceLamports) {
    return { 
      valid: false, 
      error: `Insufficient balance. Need ${(totalRequired / LAMPORTS_PER_SOL).toFixed(6)} SOL` 
    };
  }

  // Warn if remaining balance would be below rent exempt minimum
  if (remainingBalance < MIN_RENT_EXEMPT_BALANCE && remainingBalance > 0) {
    // Still allow, but this is a warning condition
    // UI should show warning
  }

  return { valid: true };
}

// ============================================
// FEE ESTIMATION
// ============================================

/**
 * Estimate transaction fee for a SOL transfer
 * 
 * @param recipient - Recipient address
 * @param amountSol - Amount to send
 * @returns Fee estimate
 */
export async function estimateTransactionFee(
  recipient: string,
  amountSol: number
): Promise<FeeEstimate> {
  try {
    const connection = await getCurrentConnection();
    
    // Get sender address
    const senderAddress = await getPublicAddress();
    if (!senderAddress) {
      throw new WalletError(
        WalletErrorCode.WALLET_NOT_INITIALIZED,
        'No wallet found'
      );
    }

    // Create a dummy transaction to estimate fee
    const { blockhash } = await getRecentBlockhash();
    
    const senderPubkey = new PublicKey(senderAddress);
    const recipientPubkey = new PublicKey(recipient);
    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: recipientPubkey,
        lamports: amountLamports,
      })
    );

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    // Get fee for this message
    const message = transaction.compileMessage();
    const feeResult = await connection.getFeeForMessage(message);
    
    const baseFee = feeResult.value || 5000;
    const priorityFee = DEFAULT_PRIORITY_FEE;

    return {
      feeLamports: baseFee,
      feeSol: baseFee / LAMPORTS_PER_SOL,
      priorityFee,
    };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    
    // Return default estimate on error
    return {
      feeLamports: 5000,
      feeSol: 0.000005,
      priorityFee: DEFAULT_PRIORITY_FEE,
    };
  }
}

// ============================================
// TRANSACTION CREATION
// ============================================

/**
 * Create a SOL transfer transaction
 * 
 * @param params - Transaction parameters
 * @returns Unsigned transaction
 */
export async function createTransferTransaction(
  params: SendTransactionParams
): Promise<Transaction> {
  const { recipient, amountSol } = params;

  // Validate recipient
  if (!validateRecipient(recipient)) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Invalid recipient address'
    );
  }

  // Get sender address
  const senderAddress = await getPublicAddress();
  if (!senderAddress) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }

  // Validate amount
  if (amountSol <= 0) {
    throw new WalletError(
      WalletErrorCode.INVALID_AMOUNT,
      'Amount must be greater than 0'
    );
  }

  try {
    const connection = await getCurrentConnection();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    const senderPubkey = new PublicKey(senderAddress);
    const recipientPubkey = new PublicKey(recipient);
    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Create transaction with transfer instruction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: recipientPubkey,
        lamports: amountLamports,
      })
    );

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    return transaction;
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================
// TRANSACTION SIMULATION
// ============================================

/**
 * Simulate a transaction to check for errors before broadcast
 * 
 * @param transaction - Transaction to simulate
 * @returns Simulation result
 */
export async function simulateTransaction(
  transaction: Transaction
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await getCurrentConnection();
    
    const simulation = await connection.simulateTransaction(transaction);
    
    if (simulation.value.err) {
      const errorMessage = typeof simulation.value.err === 'string'
        ? simulation.value.err
        : JSON.stringify(simulation.value.err);
      
      return {
        success: false,
        error: `Simulation failed: ${errorMessage}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Simulation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================
// TRANSACTION BROADCASTING
// ============================================

/**
 * Send SOL to a recipient
 * 
 * SECURITY: This requires an unlocked wallet.
 * The transaction is signed in memory and broadcast.
 * 
 * @param params - Transaction parameters
 * @returns Transaction result with signature
 */
export async function sendSol(
  params: SendTransactionParams
): Promise<SendTransactionResult> {
  const { recipient, amountSol } = params;

  // Get keypair (wallet must be unlocked)
  const keypair = getUnlockedKeypair();
  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.'
    );
  }

  // Validate recipient
  if (!validateRecipient(recipient)) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Invalid recipient address'
    );
  }

  // Get current balance
  const connection = await getCurrentConnection();
  const balance = await connection.getBalance(keypair.publicKey);

  // Estimate fee
  const feeEstimate = await estimateTransactionFee(recipient, amountSol);
  
  // Validate amount against balance
  const validation = validateAmount(amountSol, balance, feeEstimate.feeLamports);
  if (!validation.valid) {
    throw new WalletError(
      WalletErrorCode.INSUFFICIENT_FUNDS,
      validation.error || 'Insufficient funds'
    );
  }

  try {
    // Create transaction
    const transaction = await createTransferTransaction(params);

    // Simulate before sending
    const simulation = await simulateTransaction(transaction);
    if (!simulation.success) {
      throw new WalletError(
        WalletErrorCode.SIMULATION_FAILED,
        simulation.error || 'Transaction simulation failed'
      );
    }

    // Sign transaction
    transaction.sign(keypair);

    // Send with retry logic
    let signature: string | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        signature = await connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          }
        );
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Check if it's a retryable error
        if (error instanceof SendTransactionError) {
          const logs = error.logs;
          console.error('[AINTIVIRUS Wallet] Send transaction error:', logs);
        }
        
        // Wait before retry
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (!signature) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        `Failed to send transaction: ${lastError?.message || 'Unknown error'}`
      );
    }

    // Confirm transaction (non-blocking on soft failures)
    const confirmResult = await confirmTransaction(signature);
    
    // Get explorer URL
    const explorerUrl = await getTransactionExplorerUrl(signature);

    if (!confirmResult.confirmed) {
      // Log warning but don't throw - transaction was sent and may succeed
      console.warn(`[AINTIVIRUS Wallet] Confirmation uncertain: ${confirmResult.error}`);
      console.log(`[AINTIVIRUS Wallet] Transaction sent (unconfirmed): ${signature}`);
    } else {
      console.log(`[AINTIVIRUS Wallet] Transaction confirmed: ${signature}`);
    }

    return {
      signature,
      explorerUrl,
    };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }

    // Parse common errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('insufficient funds') || errorMessage.includes('Insufficient')) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        'Insufficient funds for transaction'
      );
    }

    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Transaction failed: ${errorMessage}`
    );
  }
}

// ============================================
// TRANSACTION CONFIRMATION
// ============================================

/**
 * Wait for transaction confirmation using signature status polling
 * 
 * This approach is more reliable than blockhash-based confirmation
 * as it doesn't depend on block height expiration.
 * 
 * @param signature - Transaction signature
 * @returns Confirmation result
 */
export async function confirmTransaction(
  signature: string
): Promise<{ confirmed: boolean; error?: string }> {
  try {
    const connection = await getCurrentConnection();
    const startTime = Date.now();
    
    // Poll for transaction status instead of using blockhash-based confirmation
    // This avoids "block height exceeded" errors
    while (Date.now() - startTime < CONFIRMATION_TIMEOUT) {
      try {
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });
        
        if (status?.value) {
          // Check for errors
          if (status.value.err) {
            return {
              confirmed: false,
              error: `Transaction failed: ${JSON.stringify(status.value.err)}`,
            };
          }
          
          // Check confirmation level
          if (status.value.confirmationStatus === 'confirmed' || 
              status.value.confirmationStatus === 'finalized') {
            return { confirmed: true };
          }
        }
      } catch (pollError) {
        // Ignore polling errors, continue trying
        console.warn('[AINTIVIRUS Wallet] Poll error:', pollError);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Timeout reached - but transaction may still have succeeded
    // Do one final check
    try {
      const finalStatus = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      
      if (finalStatus?.value && !finalStatus.value.err) {
        if (finalStatus.value.confirmationStatus === 'confirmed' || 
            finalStatus.value.confirmationStatus === 'finalized') {
          return { confirmed: true };
        }
      }
    } catch {
      // Ignore final check errors
    }

    return {
      confirmed: false,
      error: 'Transaction confirmation timeout. The transaction may still succeed - check your wallet balance.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Don't fail hard on "block height exceeded" - the tx likely went through
    if (errorMessage.includes('block height exceeded')) {
      console.warn('[AINTIVIRUS Wallet] Block height exceeded during confirmation, checking status...');
      
      // Try to get the actual status
      try {
        const connection = await getCurrentConnection();
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });
        
        if (status?.value && !status.value.err) {
          return { confirmed: true };
        }
      } catch {
        // Ignore status check error
      }
      
      return {
        confirmed: false,
        error: 'Could not confirm transaction, but it may have succeeded. Check your wallet balance.',
      };
    }

    return {
      confirmed: false,
      error: errorMessage,
    };
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert SOL to lamports
 * 
 * @param sol - Amount in SOL
 * @returns Amount in lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Convert lamports to SOL
 * 
 * @param lamports - Amount in lamports
 * @returns Amount in SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Format SOL amount for display
 * 
 * @param sol - Amount in SOL
 * @param decimals - Decimal places (default 6)
 * @returns Formatted string
 */
export function formatSolAmount(sol: number, decimals: number = 6): string {
  return sol.toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * Parse SOL amount from user input
 * 
 * @param input - User input string
 * @returns Parsed SOL amount or null if invalid
 */
export function parseSolInput(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
    return null;
  }
  
  return parsed;
}

/**
 * Check if an amount would leave dust (unusably small balance)
 * 
 * @param currentBalance - Current balance in lamports
 * @param sendAmount - Amount to send in lamports
 * @param fee - Fee in lamports
 * @returns True if remaining balance would be dust
 */
export function wouldLeaveDust(
  currentBalance: number,
  sendAmount: number,
  fee: number
): boolean {
  const remaining = currentBalance - sendAmount - fee;
  return remaining > 0 && remaining < MIN_RENT_EXEMPT_BALANCE;
}

/**
 * Calculate maximum sendable amount
 * 
 * @param balance - Current balance in lamports
 * @param fee - Estimated fee in lamports
 * @returns Maximum SOL that can be sent
 */
export function calculateMaxSendable(balance: number, fee: number): number {
  const maxLamports = Math.max(0, balance - fee);
  return lamportsToSol(maxLamports);
}


