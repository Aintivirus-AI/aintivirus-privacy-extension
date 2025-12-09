

import {
  Transaction,
  VersionedTransaction,
  TransactionInstruction,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SystemInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

import {
  TransactionSummary,
  TransactionVerificationRequest,
  InstructionSummary,
  TokenTransferSummary,
  AuthorityChange,
  RiskLevel,
  ProgramRiskLevel,
} from './types';
import {
  getProgramInfo,
  getProgramRiskLevel,
  isSystemProgram,
  isTokenProgram,
  isAssociatedTokenProgram,
  isComputeBudgetProgram,
  getRiskLevelDescription,
} from './programRegistry';
import {
  generateId,
  getSecuritySettings,
  addPendingVerification,
  removePendingVerification,
} from './storage';
import { getPublicAddress } from '../wallet/storage';


const TOKEN_INSTRUCTIONS = {
  TRANSFER: 3,
  APPROVE: 4,
  REVOKE: 5,
  SET_AUTHORITY: 6,
  MINT_TO: 7,
  BURN: 8,
  CLOSE_ACCOUNT: 9,
  TRANSFER_CHECKED: 12,
  APPROVE_CHECKED: 13,
};


const SYSTEM_INSTRUCTIONS = {
  CREATE_ACCOUNT: 0,
  ASSIGN: 1,
  TRANSFER: 2,
  CREATE_ACCOUNT_WITH_SEED: 3,
  ADVANCE_NONCE_ACCOUNT: 4,
  WITHDRAW_NONCE_ACCOUNT: 5,
  INITIALIZE_NONCE_ACCOUNT: 6,
  AUTHORIZE_NONCE_ACCOUNT: 7,
  ALLOCATE: 8,
  ALLOCATE_WITH_SEED: 9,
  ASSIGN_WITH_SEED: 10,
  TRANSFER_WITH_SEED: 11,
};


export function deserializeTransaction(
  serialized: string
): Transaction | VersionedTransaction {
  let bytes: Uint8Array;
  
  
  try {
    bytes = Uint8Array.from(atob(serialized), c => c.charCodeAt(0));
  } catch {
    
    try {
      bytes = bs58.decode(serialized);
    } catch {
      throw new Error('Invalid transaction encoding');
    }
  }
  
  
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    
    return Transaction.from(bytes);
  }
}


function getInstructions(
  transaction: Transaction | VersionedTransaction
): { programId: PublicKey; keys: PublicKey[]; data: Buffer }[] {
  if (transaction instanceof VersionedTransaction) {
    const message = transaction.message;
    const accountKeys = message.staticAccountKeys;
    
    return message.compiledInstructions.map(ix => ({
      programId: accountKeys[ix.programIdIndex],
      keys: ix.accountKeyIndexes.map(idx => accountKeys[idx]),
      data: Buffer.from(ix.data),
    }));
  } else {
    return transaction.instructions.map(ix => ({
      programId: ix.programId,
      keys: ix.keys.map(k => k.pubkey),
      data: ix.data,
    }));
  }
}


export async function analyzeTransaction(
  serializedTransaction: string,
  domain: string
): Promise<TransactionSummary> {
  const settings = await getSecuritySettings();
  const walletAddress = await getPublicAddress();
  
  
  let transaction: Transaction | VersionedTransaction;
  try {
    transaction = deserializeTransaction(serializedTransaction);
  } catch (error) {
    return createErrorSummary(serializedTransaction, domain, 'Failed to parse transaction');
  }
  
  
  const rawInstructions = getInstructions(transaction);
  const instructions: InstructionSummary[] = [];
  const tokenTransfers: TokenTransferSummary[] = [];
  const authorityChanges: AuthorityChange[] = [];
  const warnings: string[] = [];
  const unknownPrograms: string[] = [];
  let totalSolTransfer = 0;
  
  for (const ix of rawInstructions) {
    const programId = ix.programId.toBase58();
    const programInfo = await getProgramInfo(programId);
    const programRisk = programInfo?.riskLevel || ProgramRiskLevel.UNKNOWN;
    
    
    if (programRisk === ProgramRiskLevel.UNKNOWN) {
      if (!unknownPrograms.includes(programId)) {
        unknownPrograms.push(programId);
      }
    }
    
    
    let instructionSummary: InstructionSummary;
    
    if (isSystemProgram(programId)) {
      const { summary, solAmount } = analyzeSystemInstruction(ix, walletAddress);
      instructionSummary = summary;
      totalSolTransfer += solAmount;
    } else if (isTokenProgram(programId)) {
      const { summary, transfer, authority } = await analyzeTokenInstruction(ix, walletAddress);
      instructionSummary = summary;
      if (transfer) tokenTransfers.push(transfer);
      if (authority) authorityChanges.push(authority);
    } else if (isComputeBudgetProgram(programId)) {
      instructionSummary = {
        programId,
        programName: 'Compute Budget',
        programRisk,
        description: 'Sets compute budget for transaction',
        type: 'compute_budget',
        accounts: ix.keys.map(k => k.toBase58()),
        warnings: [],
      };
    } else if (isAssociatedTokenProgram(programId)) {
      instructionSummary = {
        programId,
        programName: 'Associated Token Account',
        programRisk,
        description: 'Creates or manages token account',
        type: 'ata',
        accounts: ix.keys.map(k => k.toBase58()),
        warnings: [],
      };
    } else {
      
      instructionSummary = {
        programId,
        programName: programInfo?.name || 'Unknown Program',
        programRisk,
        description: programInfo?.description || 'Interacts with an unknown program',
        type: 'unknown',
        accounts: ix.keys.map(k => k.toBase58()),
        warnings: [],
      };
      
      if (programRisk === ProgramRiskLevel.UNKNOWN && settings.warnOnUnknownPrograms) {
        instructionSummary.warnings.push('This program is not recognized');
      }
      if (programRisk === ProgramRiskLevel.MALICIOUS) {
        instructionSummary.warnings.push('WARNING: This program has been flagged as malicious');
      }
    }
    
    instructions.push(instructionSummary);
    warnings.push(...instructionSummary.warnings);
  }
  
  
  if (settings.warnOnLargeTransfers && totalSolTransfer >= settings.largeTransferThreshold) {
    warnings.push(`Large transfer: ${totalSolTransfer.toFixed(4)} SOL`);
  }
  
  if (settings.warnOnAuthorityChanges && authorityChanges.length > 0) {
    warnings.push(`Authority change detected: ${authorityChanges.length} change(s)`);
  }
  
  if (settings.warnOnUnlimitedApprovals) {
    const unlimitedApprovals = tokenTransfers.filter(t => t.isApproval && t.approvalAmount === null);
    if (unlimitedApprovals.length > 0) {
      warnings.push(`Unlimited token approval detected`);
    }
  }
  
  if (unknownPrograms.length > 0 && settings.warnOnUnknownPrograms) {
    warnings.push(`Transaction interacts with ${unknownPrograms.length} unknown program(s)`);
  }
  
  
  const riskLevel = calculateTransactionRisk(
    instructions,
    tokenTransfers,
    authorityChanges,
    totalSolTransfer,
    unknownPrograms,
    settings
  );
  
  
  const requiresConfirmation = riskLevel !== 'low' || warnings.length > 0;
  
  return {
    id: generateId(),
    analyzedAt: Date.now(),
    domain,
    instructions,
    totalSolTransfer,
    tokenTransfers,
    authorityChanges,
    riskLevel,
    warnings,
    unknownPrograms,
    requiresConfirmation,
    serializedTransaction,
  };
}


export async function analyzeTransactions(
  serializedTransactions: string[],
  domain: string
): Promise<TransactionSummary[]> {
  const summaries: TransactionSummary[] = [];
  
  for (const tx of serializedTransactions) {
    const summary = await analyzeTransaction(tx, domain);
    summaries.push(summary);
  }
  
  return summaries;
}


function analyzeSystemInstruction(
  ix: { programId: PublicKey; keys: PublicKey[]; data: Buffer },
  walletAddress: string | null
): { summary: InstructionSummary; solAmount: number } {
  const programId = ix.programId.toBase58();
  let description = 'System operation';
  let type = 'system';
  let solAmount = 0;
  const warnings: string[] = [];
  
  try {
    
    const instructionType = ix.data.readUInt32LE(0);
    
    switch (instructionType) {
      case SYSTEM_INSTRUCTIONS.TRANSFER:
        
        if (ix.data.length >= 12) {
          const lamports = ix.data.readBigUInt64LE(4);
          solAmount = Number(lamports) / LAMPORTS_PER_SOL;
          const destination = ix.keys[1]?.toBase58() || 'unknown';
          description = `Transfer ${solAmount.toFixed(6)} SOL to ${truncateAddress(destination)}`;
          type = 'transfer';
        }
        break;
        
      case SYSTEM_INSTRUCTIONS.CREATE_ACCOUNT:
        const rentLamports = ix.data.length >= 12 ? ix.data.readBigUInt64LE(4) : BigInt(0);
        const rentSol = Number(rentLamports) / LAMPORTS_PER_SOL;
        description = `Create account (rent: ${rentSol.toFixed(6)} SOL)`;
        type = 'create_account';
        solAmount = rentSol;
        break;
        
      case SYSTEM_INSTRUCTIONS.ASSIGN:
        description = 'Assign account to program';
        type = 'assign';
        break;
        
      default:
        description = 'System program operation';
    }
  } catch {
    description = 'System program operation (unable to decode)';
  }
  
  return {
    summary: {
      programId,
      programName: 'System Program',
      programRisk: ProgramRiskLevel.VERIFIED,
      description,
      type,
      accounts: ix.keys.map(k => k.toBase58()),
      warnings,
    },
    solAmount,
  };
}


async function analyzeTokenInstruction(
  ix: { programId: PublicKey; keys: PublicKey[]; data: Buffer },
  walletAddress: string | null
): Promise<{
  summary: InstructionSummary;
  transfer: TokenTransferSummary | null;
  authority: AuthorityChange | null;
}> {
  const programId = ix.programId.toBase58();
  let description = 'Token operation';
  let type = 'token';
  const warnings: string[] = [];
  let transfer: TokenTransferSummary | null = null;
  let authority: AuthorityChange | null = null;
  
  try {
    const instructionType = ix.data[0];
    
    switch (instructionType) {
      case TOKEN_INSTRUCTIONS.TRANSFER:
      case TOKEN_INSTRUCTIONS.TRANSFER_CHECKED:
        const amount = ix.data.length >= 9 ? ix.data.readBigUInt64LE(1) : BigInt(0);
        const source = ix.keys[0]?.toBase58() || 'unknown';
        const destination = ix.keys[1]?.toBase58() || 'unknown';
        description = `Transfer tokens from ${truncateAddress(source)} to ${truncateAddress(destination)}`;
        type = 'token_transfer';
        
        transfer = {
          mint: ix.keys[2]?.toBase58() || 'unknown', 
          amount: Number(amount),
          rawAmount: amount.toString(),
          source,
          destination,
          isApproval: false,
        };
        break;
        
      case TOKEN_INSTRUCTIONS.APPROVE:
      case TOKEN_INSTRUCTIONS.APPROVE_CHECKED:
        const approveAmount = ix.data.length >= 9 ? ix.data.readBigUInt64LE(1) : null;
        const delegate = ix.keys[1]?.toBase58() || 'unknown';
        const isUnlimited = approveAmount === null || approveAmount === BigInt('18446744073709551615');
        
        description = isUnlimited
          ? `Approve UNLIMITED tokens to ${truncateAddress(delegate)}`
          : `Approve tokens to ${truncateAddress(delegate)}`;
        type = 'token_approve';
        
        if (isUnlimited) {
          warnings.push('UNLIMITED token approval - delegate can transfer all tokens');
        }
        
        transfer = {
          mint: 'unknown',
          amount: approveAmount ? Number(approveAmount) : 0,
          rawAmount: approveAmount?.toString() || 'unlimited',
          source: ix.keys[0]?.toBase58() || 'unknown',
          destination: delegate,
          isApproval: true,
          approvalAmount: isUnlimited ? null : Number(approveAmount),
        };
        break;
        
      case TOKEN_INSTRUCTIONS.REVOKE:
        description = 'Revoke token approval';
        type = 'token_revoke';
        break;
        
      case TOKEN_INSTRUCTIONS.SET_AUTHORITY:
        const authorityType = ix.data[1];
        const authorityTypeNames: Record<number, string> = {
          0: 'mint',
          1: 'freeze',
          2: 'owner',
          3: 'close',
        };
        const authName = authorityTypeNames[authorityType] || 'unknown';
        const newAuth = ix.keys[2]?.toBase58() || 'none';
        
        description = `Change ${authName} authority to ${newAuth === 'none' ? 'none' : truncateAddress(newAuth)}`;
        type = 'set_authority';
        warnings.push(`Authority change: ${authName}`);
        
        authority = {
          type: authName as AuthorityChange['type'],
          account: ix.keys[0]?.toBase58() || 'unknown',
          newAuthority: newAuth,
          isWalletAuthority: walletAddress ? newAuth === walletAddress : false,
        };
        break;
        
      case TOKEN_INSTRUCTIONS.CLOSE_ACCOUNT:
        description = 'Close token account';
        type = 'close_account';
        break;
        
      case TOKEN_INSTRUCTIONS.MINT_TO:
        description = 'Mint new tokens';
        type = 'mint_to';
        break;
        
      case TOKEN_INSTRUCTIONS.BURN:
        description = 'Burn tokens';
        type = 'burn';
        break;
        
      default:
        description = 'Token program operation';
    }
  } catch {
    description = 'Token program operation (unable to decode)';
  }
  
  return {
    summary: {
      programId,
      programName: 'SPL Token Program',
      programRisk: ProgramRiskLevel.VERIFIED,
      description,
      type,
      accounts: ix.keys.map(k => k.toBase58()),
      warnings,
    },
    transfer,
    authority,
  };
}


function calculateTransactionRisk(
  instructions: InstructionSummary[],
  tokenTransfers: TokenTransferSummary[],
  authorityChanges: AuthorityChange[],
  totalSolTransfer: number,
  unknownPrograms: string[],
  settings: Awaited<ReturnType<typeof getSecuritySettings>>
): RiskLevel {
  
  if (instructions.some(i => i.programRisk === ProgramRiskLevel.MALICIOUS)) {
    return 'high';
  }
  
  if (authorityChanges.some(a => !a.isWalletAuthority)) {
    return 'high';
  }
  
  if (tokenTransfers.some(t => t.isApproval && t.approvalAmount === null)) {
    return 'high';
  }
  
  if (totalSolTransfer >= settings.largeTransferThreshold * 10) {
    return 'high';
  }
  
  
  if (unknownPrograms.length > 0) {
    return 'medium';
  }
  
  if (instructions.some(i => i.programRisk === ProgramRiskLevel.FLAGGED)) {
    return 'medium';
  }
  
  if (totalSolTransfer >= settings.largeTransferThreshold) {
    return 'medium';
  }
  
  if (authorityChanges.length > 0) {
    return 'medium';
  }
  
  
  return 'low';
}


function createErrorSummary(
  serializedTransaction: string,
  domain: string,
  error: string
): TransactionSummary {
  return {
    id: generateId(),
    analyzedAt: Date.now(),
    domain,
    instructions: [],
    totalSolTransfer: 0,
    tokenTransfers: [],
    authorityChanges: [],
    riskLevel: 'high',
    warnings: [error, 'Unable to analyze transaction - proceed with extreme caution'],
    unknownPrograms: [],
    requiresConfirmation: true,
    serializedTransaction,
  };
}


export async function createVerificationRequest(
  domain: string,
  serializedTransactions: string[],
  tabId?: number
): Promise<TransactionVerificationRequest> {
  const request: TransactionVerificationRequest = {
    requestId: generateId(),
    domain,
    transactions: serializedTransactions,
    tabId,
    timestamp: Date.now(),
  };
  
  await addPendingVerification(request);
  
  return request;
}


export async function completeVerificationRequest(
  requestId: string,
  approved: boolean
): Promise<void> {
  await removePendingVerification(requestId);
}


function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}


export function getTransactionDescription(summary: TransactionSummary): string {
  const parts: string[] = [];
  
  if (summary.totalSolTransfer > 0) {
    parts.push(`Send ${summary.totalSolTransfer.toFixed(4)} SOL`);
  }
  
  if (summary.tokenTransfers.length > 0) {
    const transfers = summary.tokenTransfers.filter(t => !t.isApproval);
    const approvals = summary.tokenTransfers.filter(t => t.isApproval);
    
    if (transfers.length > 0) {
      parts.push(`${transfers.length} token transfer(s)`);
    }
    if (approvals.length > 0) {
      parts.push(`${approvals.length} token approval(s)`);
    }
  }
  
  if (summary.authorityChanges.length > 0) {
    parts.push(`${summary.authorityChanges.length} authority change(s)`);
  }
  
  if (summary.unknownPrograms.length > 0) {
    parts.push(`Interacts with ${summary.unknownPrograms.length} unknown program(s)`);
  }
  
  if (parts.length === 0) {
    return 'Transaction with no detected transfers';
  }
  
  return parts.join(', ');
}


export function getRiskLevelColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'low':
      return 'success';
    case 'medium':
      return 'warning';
    case 'high':
      return 'error';
    default:
      return 'default';
  }
}


export function getRiskLevelIcon(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'low':
      return 'check';
    case 'medium':
      return 'warning';
    case 'high':
      return 'error';
    default:
      return 'info';
  }
}

