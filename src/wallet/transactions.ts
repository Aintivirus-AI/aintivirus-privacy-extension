

import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SendTransactionError,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
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


const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');


const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');


export interface SendSPLTokenParams {
  
  recipient: string;
  
  amount: number;
  
  mint: string;
  
  decimals: number;
  
  tokenAccount?: string;
}


function getAssociatedTokenAddressSync(
  mint: PublicKey,
  owner: PublicKey,
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}


function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0), 
  });
}


function createTransferInstruction(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
): TransactionInstruction {
  
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); 
  data.writeBigUInt64LE(amount, 1);

  return new TransactionInstruction({
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_PROGRAM_ID,
    data,
  });
}


const MIN_RENT_EXEMPT_BALANCE = 890880;


const DEFAULT_PRIORITY_FEE = 1000;


const CONFIRMATION_TIMEOUT = 60000;


const MAX_RETRIES = 3;


export function validateRecipient(recipient: string): boolean {
  if (!recipient || recipient.trim().length === 0) {
    return false;
  }
  return isValidSolanaAddress(recipient);
}


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

  
  if (remainingBalance < MIN_RENT_EXEMPT_BALANCE && remainingBalance > 0) {
    
    
  }

  return { valid: true };
}


export async function estimateTransactionFee(
  recipient: string,
  amountSol: number
): Promise<FeeEstimate> {
  try {
    const connection = await getCurrentConnection();
    
    
    const senderAddress = await getPublicAddress();
    if (!senderAddress) {
      throw new WalletError(
        WalletErrorCode.WALLET_NOT_INITIALIZED,
        'No wallet found'
      );
    }

    
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
    
    
    return {
      feeLamports: 5000,
      feeSol: 0.000005,
      priorityFee: DEFAULT_PRIORITY_FEE,
    };
  }
}


export async function createTransferTransaction(
  params: SendTransactionParams
): Promise<Transaction> {
  const { recipient, amountSol } = params;

  
  if (!validateRecipient(recipient)) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Invalid recipient address'
    );
  }

  
  const senderAddress = await getPublicAddress();
  if (!senderAddress) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }

  
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


export async function sendSol(
  params: SendTransactionParams
): Promise<SendTransactionResult> {
  const { recipient, amountSol } = params;

  
  const keypair = getUnlockedKeypair();
  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.'
    );
  }

  
  if (!validateRecipient(recipient)) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Invalid recipient address'
    );
  }

  
  const connection = await getCurrentConnection();
  const balance = await connection.getBalance(keypair.publicKey);

  
  const feeEstimate = await estimateTransactionFee(recipient, amountSol);
  
  
  const validation = validateAmount(amountSol, balance, feeEstimate.feeLamports);
  if (!validation.valid) {
    throw new WalletError(
      WalletErrorCode.INSUFFICIENT_FUNDS,
      validation.error || 'Insufficient funds'
    );
  }

  try {
    
    const transaction = await createTransferTransaction(params);

    
    const simulation = await simulateTransaction(transaction);
    if (!simulation.success) {
      throw new WalletError(
        WalletErrorCode.SIMULATION_FAILED,
        simulation.error || 'Transaction simulation failed'
      );
    }

    
    transaction.sign(keypair);

    
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
        
        
        if (error instanceof SendTransactionError) {
          const logs = error.logs;

        }
        
        
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

    
    const confirmResult = await confirmTransaction(signature);
    
    
    const explorerUrl = await getTransactionExplorerUrl(signature);

    if (!confirmResult.confirmed) {
      

    } else {

    }

    return {
      signature,
      explorerUrl,
    };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }

    
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


export async function confirmTransaction(
  signature: string
): Promise<{ confirmed: boolean; error?: string }> {
  try {
    const connection = await getCurrentConnection();
    const startTime = Date.now();
    
    
    while (Date.now() - startTime < CONFIRMATION_TIMEOUT) {
      try {
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });
        
        if (status?.value) {
          
          if (status.value.err) {
            return {
              confirmed: false,
              error: `Transaction failed: ${JSON.stringify(status.value.err)}`,
            };
          }
          
          
          if (status.value.confirmationStatus === 'confirmed' || 
              status.value.confirmationStatus === 'finalized') {
            return { confirmed: true };
          }
        }
      } catch (pollError) {
        

      }
      
      
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    
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
      
    }

    return {
      confirmed: false,
      error: 'Transaction confirmation timeout. The transaction may still succeed - check your wallet balance.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    
    if (errorMessage.includes('block height exceeded')) {

      
      try {
        const connection = await getCurrentConnection();
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });
        
        if (status?.value && !status.value.err) {
          return { confirmed: true };
        }
      } catch {
        
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


export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}


export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}


export function formatSolAmount(sol: number, decimals: number = 6): string {
  return sol.toFixed(decimals).replace(/\.?0+$/, '');
}


export function parseSolInput(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
    return null;
  }
  
  return parsed;
}


export function wouldLeaveDust(
  currentBalance: number,
  sendAmount: number,
  fee: number
): boolean {
  const remaining = currentBalance - sendAmount - fee;
  return remaining > 0 && remaining < MIN_RENT_EXEMPT_BALANCE;
}


export function calculateMaxSendable(balance: number, fee: number): number {
  const maxLamports = Math.max(0, balance - fee);
  return lamportsToSol(maxLamports);
}


export async function sendSPLToken(
  params: SendSPLTokenParams
): Promise<SendTransactionResult> {
  const { recipient, amount, mint, decimals, tokenAccount: senderTokenAccount } = params;

  
  const keypair = getUnlockedKeypair();
  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.'
    );
  }

  
  if (!validateRecipient(recipient)) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Invalid recipient address'
    );
  }

  
  if (amount <= 0) {
    throw new WalletError(
      WalletErrorCode.INVALID_AMOUNT,
      'Amount must be greater than 0'
    );
  }

  try {
    const connection = await getCurrentConnection();
    const mintPubkey = new PublicKey(mint);
    const recipientPubkey = new PublicKey(recipient);

    
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

    
    let senderATA: PublicKey;
    if (senderTokenAccount) {
      senderATA = new PublicKey(senderTokenAccount);
    } else {
      senderATA = getAssociatedTokenAddressSync(mintPubkey, keypair.publicKey);
    }

    
    const recipientATA = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey);

    
    let recipientAccountExists = false;
    try {
      const accountInfo = await connection.getAccountInfo(recipientATA);
      recipientAccountExists = accountInfo !== null;
    } catch {
      
      recipientAccountExists = false;
    }

    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const transaction = new Transaction();

    
    if (!recipientAccountExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey, 
          recipientATA, 
          recipientPubkey, 
          mintPubkey 
        )
      );
    }

    
    transaction.add(
      createTransferInstruction(
        senderATA, 
        recipientATA, 
        keypair.publicKey, 
        rawAmount 
      )
    );

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    
    const simulation = await simulateTransaction(transaction);
    if (!simulation.success) {
      throw new WalletError(
        WalletErrorCode.SIMULATION_FAILED,
        simulation.error || 'Transaction simulation failed'
      );
    }

    
    transaction.sign(keypair);

    
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
        
        if (error instanceof SendTransactionError) {
          const logs = error.logs;

        }
        
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (!signature) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        `Failed to send token: ${lastError?.message || 'Unknown error'}`
      );
    }

    
    const confirmResult = await confirmTransaction(signature);
    
    
    const explorerUrl = await getTransactionExplorerUrl(signature);

    if (!confirmResult.confirmed) {

    } else {

    }

    return {
      signature,
      explorerUrl,
    };
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('insufficient funds') || errorMessage.includes('Insufficient')) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        'Insufficient token balance or SOL for fees'
      );
    }

    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Token transfer failed: ${errorMessage}`
    );
  }
}

