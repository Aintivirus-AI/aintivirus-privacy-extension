/**
 * AINTIVIRUS Decoding Module - Type Definitions
 *
 * Shared types for EVM and Solana transaction/message decoding.
 */

// ============================================
// COMMON TYPES
// ============================================

/** Warning severity levels */
export type WarningLevel = 'info' | 'caution' | 'danger';

/** Common warning structure */
export interface TxWarning {
  level: WarningLevel;
  code: string;
  title: string;
  description: string;
}

// ============================================
// EVM TRANSACTION DECODING
// ============================================

/** Function signature info for selector lookup */
export interface FunctionSignature {
  name: string;
  params?: string[];
  category: 'token' | 'approval' | 'nft' | 'swap' | 'permit2' | 'router' | 'other';
}

/** Decoded function call */
export interface DecodedFunctionCall {
  selector: string;
  name: string;
  category: string;
  params: DecodedParam[];
}

/** Decoded parameter */
export interface DecodedParam {
  name: string;
  type: string;
  value: string;
  displayValue: string;
  isAddress?: boolean;
  isAmount?: boolean;
}

/** Transaction kind for summary */
export type TxKind =
  | 'transfer'
  | 'approval'
  | 'swap'
  | 'nft'
  | 'contract_creation'
  | 'contract_call'
  | 'permit2'
  | 'unknown';

/** Transaction details */
export interface TxDetails {
  to?: string;
  value: string;
  valueEth: string;
  data: string;
  dataSize: number;
  selector?: string;
  chainId?: number;
  nonce?: number;
  gasLimit?: string;
  maxFee?: string;
  maxPriorityFee?: string;
}

/** Fully decoded EVM transaction */
export interface DecodedEvmTx {
  kind: TxKind;
  summary: string;
  warnings: TxWarning[];
  details: TxDetails;
  decodedCall?: DecodedFunctionCall;
}

// ============================================
// EIP-712 TYPED DATA
// ============================================

/** EIP-712 domain separator */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

/** EIP-712 type definition */
export interface TypedDataTypeEntry {
  name: string;
  type: string;
}

/** EIP-712 types map */
export type TypedDataTypes = Record<string, TypedDataTypeEntry[]>;

/** Full EIP-712 typed data structure */
export interface TypedDataV4 {
  types: TypedDataTypes;
  domain: TypedDataDomain;
  primaryType: string;
  message: Record<string, unknown>;
}

/** Highlighted field in display */
export interface HighlightedField {
  path: string;
  name: string;
  value: string;
  displayValue: string;
  type: string;
  highlight: 'spender' | 'amount' | 'deadline' | 'to' | 'from' | 'nonce' | 'operator' | 'normal';
}

/** Typed data display model */
export interface TypedDataDisplayModel {
  domain: TypedDataDomain;
  primaryType: string;
  messageFields: HighlightedField[];
  nestedStructs: Array<{
    name: string;
    fields: HighlightedField[];
  }>;
}

/** Detected typed data patterns */
export type TypedDataPattern =
  | 'permit'
  | 'permit2'
  | 'permit2_batch'
  | 'order'
  | 'vote'
  | 'delegation'
  | 'unknown';

/** Result of parsing typed data */
export interface TypedDataParseResult {
  isValid: boolean;
  error?: string;
  raw: TypedDataV4 | null;
  pattern: TypedDataPattern;
  displayModel: TypedDataDisplayModel | null;
  warnings: TxWarning[];
  highlightedFields: HighlightedField[];
}

// ============================================
// SOLANA DECODING
// ============================================

/** Account role in instruction */
export interface AccountRole {
  address: string;
  name?: string;
  role: 'signer' | 'writable' | 'readonly';
  isWallet?: boolean;
}

/** Decoded Solana instruction */
export interface SolanaInstructionSummary {
  programId: string;
  programName: string;
  action: string;
  accounts: AccountRole[];
  warnings: TxWarning[];
  data?: string;
}

/** Solana transaction decode result */
export interface DecodedSolanaTx {
  instructions: SolanaInstructionSummary[];
  totalSolTransfer: number;
  warnings: TxWarning[];
  riskLevel: 'low' | 'medium' | 'high';
}

// ============================================
// KNOWN CONTRACTS/PROTOCOLS
// ============================================

/** Known protocol info */
export interface KnownProtocol {
  name: string;
  icon?: string;
  url?: string;
  verified: boolean;
}

/** Map of known contract addresses to protocol info */
export type KnownContracts = Record<string, KnownProtocol>;
