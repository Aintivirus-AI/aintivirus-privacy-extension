

export { EVMAdapter, createEVMAdapter } from './adapter';


export {
  getProvider,
  getBestProvider,
  withFailover,
  withRetry,
  clearProviderCache,
  clearChainCache,
  getBalance,
  getTransactionCount,
  getGasPrice,
  getFeeData,
  estimateGas,
  sendTransaction,
  waitForTransaction,
  getTransactionReceipt,
  getBlockNumber,
  getBlock,
  call,
  getCode,
} from './client';


export {
  estimateTransactionGas,
  estimateNativeTransferGas,
  estimateTokenTransferGas,
  formatGasPrice,
  formatFee,
  getRecommendedGasSettings,
  calculateMaxSendable,
  type GasEstimate,
  type GasEstimateParams,
} from './gas';


export {
  createNativeTransfer,
  createTokenTransfer,
  signTransaction,
  broadcastTransaction,
  confirmTransaction,
  sendNativeToken,
  sendToken,
  parseAmount,
  formatAmount,
  validateTransferParams,
  calculateMaxSend,
  type NativeTransferParams,
  type TokenTransferParams,
  type EVMTransactionResult,
  type UnsignedEVMTransaction,
} from './transactions';


export {
  getTokenBalance,
  getTokenMetadata,
  getTokenBalanceWithMetadata,
  getPopularTokenBalances,
  getMultipleTokenBalances,
  isERC20Token,
  getTokenLogoUri,
  toTokenBalance,
  POPULAR_TOKENS,
  type TokenMetadata,
  type ERC20Balance,
} from './tokens';


export {
  loadPendingTxStore,
  getPendingTxsForAccount,
  getAllPendingTxs,
  getPendingTxByHash,
  addPendingTx,
  updatePendingTx,
  setupTxPollingAlarm,
  handleTxPollAlarm,
  createPendingTxRecord,
  parseHexBigInt,
  TX_POLL_ALARM_NAME,
  type PendingEVMTransaction,
  type PendingTxStatus,
  type PendingTxStore,
  type TxStatusUpdate,
} from './pendingTxStore';


export {
  getOnChainNonce,
  getConfirmedNonce,
  getNextNonce,
  getReplacementNonce,
  getNonceStatus,
  detectNonceGap,
  validateNonce,
  canReplaceAtNonce,
  syncNonceState,
  type NonceGapResult,
  type NonceStatus,
} from './nonce';


export {
  calculateSpeedUpFees,
  getMinimumReplacementFees,
  validateReplacementFees,
  createSpeedUpTx,
  createCancelTx,
  estimateReplacementFees,
  calculateCostDifference,
  getReplacementGasPresets,
  formatGweiValue,
  MIN_FEE_BUMP_PERCENT,
  DEFAULT_BUMP_PERCENT,
  FEE_WARNING_THRESHOLD_GWEI,
  FEE_BLOCK_THRESHOLD_GWEI,
  type SpeedUpParams,
  type CancelParams,
  type ReplacementFees,
  type FeeValidation,
} from './replacement';


export {
  discoverAllowances,
  getTokenAllowance,
  createRevokeTransaction,
  createBulkRevokeTransactions,
  estimateRevokeFee,
  clearAllowanceCache,
  clearAllAllowanceCache,
  isInfiniteAllowance,
  formatAllowance,
  MAX_UINT256,
  INFINITE_THRESHOLD,
  type TokenAllowance,
  type AllowanceCache,
  type AllowanceDiscoveryResult,
  type UnsignedRevokeTransaction,
} from './allowances';


export {
  getKnownSpenders,
  getSpenderLabel,
  isVerifiedSpender,
  KNOWN_SPENDERS,
  type SpenderInfo,
} from './knownSpenders';

