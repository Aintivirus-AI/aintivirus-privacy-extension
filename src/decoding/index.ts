/**
 * AINTIVIRUS Decoding Module
 *
 * Re-exports all public APIs for EVM and Solana transaction/message decoding.
 */

// ============================================
// TYPES
// ============================================

export type {
  // Common
  WarningLevel,
  TxWarning,
  // EVM Transaction
  FunctionSignature,
  DecodedFunctionCall,
  DecodedParam,
  TxKind,
  TxDetails,
  DecodedEvmTx,
  // EIP-712 Typed Data
  TypedDataDomain,
  TypedDataTypes,
  TypedDataTypeEntry,
  TypedDataV4,
  TypedDataPattern,
  TypedDataParseResult,
  TypedDataDisplayModel,
  HighlightedField,
  // Solana
  AccountRole,
  SolanaInstructionSummary,
  DecodedSolanaTx,
  // Protocols
  KnownProtocol,
  KnownContracts,
} from './types';

// ============================================
// EVM DECODER
// ============================================

export {
  decodeEvmTx,
  decodeAddress,
  decodeUint256,
  decodeBytes,
  parseHexBigInt,
} from './evmDecoder';

export type { EvmTxInput } from './evmDecoder';

// ============================================
// TYPED DATA PARSER
// ============================================

export {
  decodeTypedData,
  getChainName,
  formatDomain,
} from './typedDataParser';

// ============================================
// SOLANA DECODER
// ============================================

export {
  decodeSolanaInstruction,
  decodeSolanaTransaction,
  getProgramDisplayName,
  isKnownProgram,
  SOLANA_PROGRAMS,
  TOKEN_INSTRUCTION_NAMES,
  SYSTEM_INSTRUCTION_NAMES,
} from './solanaDecoder';

// ============================================
// SELECTORS & CONTRACTS
// ============================================

export {
  KNOWN_SELECTORS,
  KNOWN_CONTRACTS,
  lookupSelector,
  lookupContract,
  isVerifiedContract,
  getContractDisplayName,
} from './selectors';

// ============================================
// WARNINGS
// ============================================

export {
  // Thresholds
  MAX_UINT256,
  HALF_MAX_UINT256,
  WARNING_THRESHOLDS,
  WARNING_CODES,
  // Warning generators
  createWarning,
  isInfiniteApproval,
  isSuspiciousDeadline,
  formatDeadline,
  warnInfiniteApproval,
  warnUnknownSpender,
  warnContractCreation,
  warnValueWithCall,
  warnUnverifiedContract,
  warnLargeValue,
  warnDeadline,
  warnPermitSignature,
  warnPermit2,
  warnNftApprovalForAll,
  // Analysis helpers
  analyzeApprovalAmount,
  analyzeEthValue,
  formatAmount,
  formatEthValue,
} from './warnings';
