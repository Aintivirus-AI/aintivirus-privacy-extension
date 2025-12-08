/**
 * AINTIVIRUS Decoding Module - Solana Instruction Decoder
 *
 * Extends the existing transaction analyzer with improved instruction
 * summaries and warning detection.
 */

import { TxWarning, AccountRole, SolanaInstructionSummary, DecodedSolanaTx } from './types';
import { createWarning } from './warnings';

// ============================================
// KNOWN PROGRAM IDS
// ============================================

export const SOLANA_PROGRAMS: Record<string, string> = {
  // System programs
  '11111111111111111111111111111111': 'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'SPL Token',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Account',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo': 'Memo (Legacy)',

  // DEX & DeFi
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'Jupiter v4',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca Swap',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': 'Serum DEX',
  'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY': 'Phoenix',

  // NFT
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s': 'Token Metadata',
  'p1exdMJcjVao65QdewkaZRUnU6VPSXhus9n2GzWfh98': 'Metaplex Auction House',
  'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K': 'Magic Eden v2',
  'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN': 'Tensor Swap',
  'TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp': 'Tensor cNFT',

  // Staking & Governance
  'Stake11111111111111111111111111111111111111': 'Stake Program',
  'Vote111111111111111111111111111111111111111': 'Vote Program',
  'marinade finance': 'Marinade Finance',
  'CgntPoLka5pD5fesJYhGmUCF8KU1QS1ZmZiuAuMZr2az': 'Marinade',

  // Infrastructure
  'BPFLoaderUpgradeab1e11111111111111111111111': 'BPF Loader',
  'Config1111111111111111111111111111111111111': 'Config',
  'SysvarC1ock11111111111111111111111111111111': 'Clock Sysvar',
  'SysvarRent111111111111111111111111111111111': 'Rent Sysvar',
};

// ============================================
// TOKEN INSTRUCTION TYPES
// ============================================

export const TOKEN_INSTRUCTION_NAMES: Record<number, string> = {
  0: 'InitializeMint',
  1: 'InitializeAccount',
  2: 'InitializeMultisig',
  3: 'Transfer',
  4: 'Approve',
  5: 'Revoke',
  6: 'SetAuthority',
  7: 'MintTo',
  8: 'Burn',
  9: 'CloseAccount',
  10: 'FreezeAccount',
  11: 'ThawAccount',
  12: 'TransferChecked',
  13: 'ApproveChecked',
  14: 'MintToChecked',
  15: 'BurnChecked',
  16: 'InitializeAccount2',
  17: 'SyncNative',
  18: 'InitializeAccount3',
  19: 'InitializeMultisig2',
  20: 'InitializeMint2',
};

export const SYSTEM_INSTRUCTION_NAMES: Record<number, string> = {
  0: 'CreateAccount',
  1: 'Assign',
  2: 'Transfer',
  3: 'CreateAccountWithSeed',
  4: 'AdvanceNonceAccount',
  5: 'WithdrawNonceAccount',
  6: 'InitializeNonceAccount',
  7: 'AuthorizeNonceAccount',
  8: 'Allocate',
  9: 'AllocateWithSeed',
  10: 'AssignWithSeed',
  11: 'TransferWithSeed',
  12: 'UpgradeNonceAccount',
};

// ============================================
// MAIN DECODER
// ============================================

/**
 * Decode a Solana instruction for display
 */
export function decodeSolanaInstruction(
  programId: string,
  accounts: string[],
  data: Uint8Array | Buffer,
  walletAddress?: string
): SolanaInstructionSummary {
  const programName = SOLANA_PROGRAMS[programId] || 'Unknown Program';
  const warnings: TxWarning[] = [];

  // Parse based on program
  let action = 'Unknown action';
  const accountRoles: AccountRole[] = accounts.map((addr, idx) => ({
    address: addr,
    role: 'readonly' as const,
    isWallet: walletAddress ? addr === walletAddress : false,
  }));

  if (programId === '11111111111111111111111111111111') {
    // System Program
    const result = decodeSystemInstruction(data, accounts, walletAddress);
    action = result.action;
    warnings.push(...result.warnings);
  } else if (
    programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
    programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  ) {
    // SPL Token / Token-2022
    const result = decodeTokenInstruction(data, accounts, walletAddress);
    action = result.action;
    warnings.push(...result.warnings);
  } else if (programId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') {
    action = 'Create Associated Token Account';
  } else if (programId === 'ComputeBudget111111111111111111111111111111') {
    action = 'Set Compute Budget';
  } else if (programId.includes('Memo')) {
    action = 'Add Memo';
  } else {
    // Try to identify common DeFi actions
    action = identifyDeFiAction(programId, accounts.length, data);
  }

  // Add warning for unknown programs
  if (!SOLANA_PROGRAMS[programId]) {
    warnings.push(
      createWarning(
        'caution',
        'UNKNOWN_PROGRAM',
        'Unknown Program',
        `This instruction interacts with an unrecognized program (${programId.slice(0, 8)}...). Verify this is expected.`
      )
    );
  }

  return {
    programId,
    programName,
    action,
    accounts: accountRoles,
    warnings,
    data: Buffer.from(data).toString('hex'),
  };
}

// ============================================
// SYSTEM PROGRAM DECODER
// ============================================

function decodeSystemInstruction(
  data: Uint8Array | Buffer,
  accounts: string[],
  walletAddress?: string
): { action: string; warnings: TxWarning[] } {
  const warnings: TxWarning[] = [];

  if (data.length < 4) {
    return { action: 'System operation', warnings };
  }

  const instructionType = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true);
  const instructionName = SYSTEM_INSTRUCTION_NAMES[instructionType] || 'Unknown';

  let action = instructionName;

  switch (instructionType) {
    case 2: // Transfer
      if (data.length >= 12) {
        const lamports = new DataView(data.buffer, data.byteOffset + 4, 8).getBigUint64(0, true);
        const sol = Number(lamports) / 1e9;
        const destination = accounts[1] || 'unknown';
        action = `Transfer ${sol.toFixed(4)} SOL to ${truncateAddress(destination)}`;

        if (sol >= 10) {
          warnings.push(
            createWarning(
              'caution',
              'LARGE_SOL_TRANSFER',
              'Large SOL Transfer',
              `This transaction transfers ${sol.toFixed(4)} SOL. Please verify the amount.`
            )
          );
        }
      }
      break;

    case 0: // CreateAccount
      if (data.length >= 12) {
        const lamports = new DataView(data.buffer, data.byteOffset + 4, 8).getBigUint64(0, true);
        const sol = Number(lamports) / 1e9;
        action = `Create Account (rent: ${sol.toFixed(6)} SOL)`;
      }
      break;

    case 1: // Assign
      action = 'Assign Account Owner';
      warnings.push(
        createWarning(
          'caution',
          'ACCOUNT_OWNER_CHANGE',
          'Account Owner Change',
          'This changes the owner of an account. Verify this is expected.'
        )
      );
      break;
  }

  return { action, warnings };
}

// ============================================
// TOKEN PROGRAM DECODER
// ============================================

function decodeTokenInstruction(
  data: Uint8Array | Buffer,
  accounts: string[],
  walletAddress?: string
): { action: string; warnings: TxWarning[] } {
  const warnings: TxWarning[] = [];

  if (data.length < 1) {
    return { action: 'Token operation', warnings };
  }

  const instructionType = data[0];
  const instructionName = TOKEN_INSTRUCTION_NAMES[instructionType] || 'Unknown';

  let action = instructionName;

  switch (instructionType) {
    case 3: // Transfer
    case 12: // TransferChecked
      if (data.length >= 9) {
        const amount = new DataView(data.buffer, data.byteOffset + 1, 8).getBigUint64(0, true);
        action = `Transfer ${amount.toLocaleString()} tokens`;
      }
      break;

    case 4: // Approve
    case 13: // ApproveChecked
      if (data.length >= 9) {
        const amount = new DataView(data.buffer, data.byteOffset + 1, 8).getBigUint64(0, true);
        const delegate = accounts[1] || 'unknown';

        // Check for unlimited approval
        if (amount === BigInt('18446744073709551615')) {
          action = `Approve UNLIMITED tokens to ${truncateAddress(delegate)}`;
          warnings.push(
            createWarning(
              'danger',
              'UNLIMITED_TOKEN_APPROVAL',
              'Unlimited Token Approval',
              'This grants unlimited spending permission for your tokens.'
            )
          );
        } else {
          action = `Approve ${amount.toLocaleString()} tokens to ${truncateAddress(delegate)}`;
        }
      }
      break;

    case 5: // Revoke
      action = 'Revoke Token Approval';
      break;

    case 6: // SetAuthority
      if (data.length >= 2) {
        const authorityType = data[1];
        const authorityNames = ['Mint', 'Freeze', 'Owner', 'Close'];
        const authName = authorityNames[authorityType] || 'Unknown';
        action = `Set ${authName} Authority`;

        // Check if authority is being transferred to non-wallet
        const newAuthority = accounts[2];
        if (newAuthority && walletAddress && newAuthority !== walletAddress) {
          warnings.push(
            createWarning(
              'danger',
              'AUTHORITY_TRANSFER',
              'Authority Transfer',
              `${authName} authority is being transferred to another address. This may lock you out of the account.`
            )
          );
        }
      }
      break;

    case 9: // CloseAccount
      const rentReceiver = accounts[1];
      action = `Close Token Account`;

      if (rentReceiver && walletAddress && rentReceiver !== walletAddress) {
        warnings.push(
          createWarning(
            'caution',
            'RENT_TO_OTHER',
            'Rent Going Elsewhere',
            `Account rent will be sent to ${truncateAddress(rentReceiver)}, not your wallet.`
          )
        );
      }
      break;

    case 7: // MintTo
    case 14: // MintToChecked
      if (data.length >= 9) {
        const amount = new DataView(data.buffer, data.byteOffset + 1, 8).getBigUint64(0, true);
        action = `Mint ${amount.toLocaleString()} tokens`;
      }
      break;

    case 8: // Burn
    case 15: // BurnChecked
      if (data.length >= 9) {
        const amount = new DataView(data.buffer, data.byteOffset + 1, 8).getBigUint64(0, true);
        action = `Burn ${amount.toLocaleString()} tokens`;
      }
      break;
  }

  return { action, warnings };
}

// ============================================
// DEFI ACTION IDENTIFICATION
// ============================================

function identifyDeFiAction(programId: string, accountCount: number, data: Uint8Array | Buffer): string {
  const programName = SOLANA_PROGRAMS[programId];

  if (!programName) {
    return 'Interact with program';
  }

  // Jupiter
  if (programName.includes('Jupiter')) {
    return 'Swap tokens via Jupiter';
  }

  // Orca
  if (programName.includes('Orca')) {
    return 'Swap tokens via Orca';
  }

  // Raydium
  if (programName.includes('Raydium')) {
    if (accountCount > 10) {
      return 'Swap tokens via Raydium';
    }
    return 'Raydium pool operation';
  }

  // NFT marketplaces
  if (programName.includes('Magic Eden') || programName.includes('Tensor')) {
    return 'NFT marketplace operation';
  }

  // Metaplex
  if (programName.includes('Metadata')) {
    return 'Update NFT metadata';
  }

  // Staking
  if (programName.includes('Stake')) {
    return 'Staking operation';
  }

  return `${programName} operation`;
}

// ============================================
// TRANSACTION DECODER
// ============================================

/**
 * Decode multiple instructions into a transaction summary
 */
export function decodeSolanaTransaction(
  instructions: Array<{
    programId: string;
    accounts: string[];
    data: Uint8Array | Buffer;
  }>,
  walletAddress?: string
): DecodedSolanaTx {
  const decodedInstructions: SolanaInstructionSummary[] = [];
  const allWarnings: TxWarning[] = [];
  let totalSolTransfer = 0;
  let hasMultipleAuthorityChanges = false;
  let authorityChangeCount = 0;

  for (const ix of instructions) {
    const decoded = decodeSolanaInstruction(
      ix.programId,
      ix.accounts,
      ix.data,
      walletAddress
    );

    decodedInstructions.push(decoded);
    allWarnings.push(...decoded.warnings);

    // Track SOL transfers
    if (decoded.action.includes('Transfer') && decoded.action.includes('SOL')) {
      const match = decoded.action.match(/([\d.]+)\s*SOL/);
      if (match) {
        totalSolTransfer += parseFloat(match[1]);
      }
    }

    // Track authority changes
    if (decoded.action.includes('Authority')) {
      authorityChangeCount++;
    }
  }

  // Add warning for multiple authority changes
  if (authorityChangeCount > 1) {
    allWarnings.push(
      createWarning(
        'danger',
        'MULTIPLE_AUTHORITY_CHANGES',
        'Multiple Authority Changes',
        `This transaction includes ${authorityChangeCount} authority changes. This is unusual and may indicate a malicious transaction.`
      )
    );
  }

  // Calculate risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  if (allWarnings.some(w => w.level === 'danger')) {
    riskLevel = 'high';
  } else if (allWarnings.some(w => w.level === 'caution') || totalSolTransfer >= 10) {
    riskLevel = 'medium';
  }

  return {
    instructions: decodedInstructions,
    totalSolTransfer,
    warnings: allWarnings,
    riskLevel,
  };
}

// ============================================
// HELPERS
// ============================================

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Get program name for display
 */
export function getProgramDisplayName(programId: string): string {
  return SOLANA_PROGRAMS[programId] || `${programId.slice(0, 8)}...${programId.slice(-4)}`;
}

/**
 * Check if program is known and safe
 */
export function isKnownProgram(programId: string): boolean {
  return programId in SOLANA_PROGRAMS;
}
