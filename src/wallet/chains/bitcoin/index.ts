/**
 * Bitcoin-family chain support
 * 
 * Supports Bitcoin, Bitcoin Cash, Litecoin, and Zcash (transparent addresses).
 */

// Types
export type {
  BitcoinChainId,
  BitcoinAddressType,
  BitcoinChainConfig,
  UTXO,
  BitcoinTransaction,
  BitcoinBalance,
  BitcoinFeeEstimate,
  UnsignedBitcoinTransaction,
  SignedBitcoinTransaction,
  BitcoinKeypair,
} from './types';

// Configuration
export {
  BITCOIN_CHAINS,
  getBitcoinChainConfig,
  getBitcoinDerivationPath,
  getBitcoinAddressExplorerUrl,
  getBitcoinTxExplorerUrl,
} from './config';

// Address utilities
export {
  deriveBitcoinKeypair,
  getBitcoinAddressFromMnemonic,
  isValidBitcoinAddress,
  getAllBitcoinAddresses,
} from './addresses';

// API client
export {
  getBalance,
  getUtxos,
  getTransactions,
  getFeeEstimate,
  broadcastTransaction,
  getBlockHeight,
} from './client';

// Transaction utilities
export {
  selectUtxos,
  createUnsignedTransaction,
  signTransaction,
  estimateTransactionFee,
  validateTransaction,
} from './transactions';

// Adapter
export { BitcoinAdapter, createBitcoinAdapter } from './adapter';
