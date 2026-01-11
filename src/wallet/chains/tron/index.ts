/**
 * TRON chain support
 */

// Types
export type {
  TronAccountInfo,
  TronTransaction,
  TronTRC20Transfer,
  TronBalance,
  TronTRC20Balance,
  TronFeeEstimate,
  UnsignedTronTransaction,
  SignedTronTransaction,
  TronKeypair,
  TronNetworkConfig,
} from './types';

// Configuration
export {
  TRON_NETWORKS,
  TRON_CONSTANTS,
  COMMON_TRC20_TOKENS,
  getTronAddressExplorerUrl,
  getTronTxExplorerUrl,
  sunToTrx,
  trxToSun,
} from './config';

// Address utilities
export {
  deriveTronKeypair,
  getTronAddressFromMnemonic,
  isValidTronAddress,
  addressToHex,
  hexToAddress,
  signMessage,
  signTransaction as signTronTransaction,
} from './addresses';

// API client
export {
  getAccount,
  getBalance,
  getTRC20Balances,
  getTransactions,
  getTRC20Transfers,
  createTransferTransaction,
  broadcastTransaction,
  getNowBlock,
  estimateFee,
  getAccountResources,
} from './client';

// Adapter
export { TronAdapter, createTronAdapter } from './adapter';
