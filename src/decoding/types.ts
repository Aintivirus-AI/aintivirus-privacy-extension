export type WarningLevel = 'info' | 'caution' | 'danger';

export interface TxWarning {
  level: WarningLevel;
  code: string;
  title: string;
  description: string;
}

export interface FunctionSignature {
  name: string;
  params?: string[];
  category: 'token' | 'approval' | 'nft' | 'swap' | 'permit2' | 'router' | 'other';
}

export interface DecodedFunctionCall {
  selector: string;
  name: string;
  category: string;
  params: DecodedParam[];
}

export interface DecodedParam {
  name: string;
  type: string;
  value: string;
  displayValue: string;
  isAddress?: boolean;
  isAmount?: boolean;
}

export type TxKind =
  | 'transfer'
  | 'approval'
  | 'swap'
  | 'nft'
  | 'contract_creation'
  | 'contract_call'
  | 'permit2'
  | 'unknown';

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

export interface DecodedEvmTx {
  kind: TxKind;
  summary: string;
  warnings: TxWarning[];
  details: TxDetails;
  decodedCall?: DecodedFunctionCall;
}

export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

export interface TypedDataTypeEntry {
  name: string;
  type: string;
}

export type TypedDataTypes = Record<string, TypedDataTypeEntry[]>;

export interface TypedDataV4 {
  types: TypedDataTypes;
  domain: TypedDataDomain;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface HighlightedField {
  path: string;
  name: string;
  value: string;
  displayValue: string;
  type: string;
  highlight: 'spender' | 'amount' | 'deadline' | 'to' | 'from' | 'nonce' | 'operator' | 'normal';
}

export interface TypedDataDisplayModel {
  domain: TypedDataDomain;
  primaryType: string;
  messageFields: HighlightedField[];
  nestedStructs: Array<{
    name: string;
    fields: HighlightedField[];
  }>;
}

export type TypedDataPattern =
  | 'permit'
  | 'permit2'
  | 'permit2_batch'
  | 'order'
  | 'vote'
  | 'delegation'
  | 'unknown';

export interface TypedDataParseResult {
  isValid: boolean;
  error?: string;
  raw: TypedDataV4 | null;
  pattern: TypedDataPattern;
  displayModel: TypedDataDisplayModel | null;
  warnings: TxWarning[];
  highlightedFields: HighlightedField[];
}

export interface AccountRole {
  address: string;
  name?: string;
  role: 'signer' | 'writable' | 'readonly';
  isWallet?: boolean;
}

export interface SolanaInstructionSummary {
  programId: string;
  programName: string;
  action: string;
  accounts: AccountRole[];
  warnings: TxWarning[];
  data?: string;
}

export interface DecodedSolanaTx {
  instructions: SolanaInstructionSummary[];
  totalSolTransfer: number;
  warnings: TxWarning[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface KnownProtocol {
  name: string;
  icon?: string;
  url?: string;
  verified: boolean;
}

export type KnownContracts = Record<string, KnownProtocol>;
