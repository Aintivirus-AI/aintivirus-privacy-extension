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

export {
  deriveBitcoinKeypair,
  getBitcoinAddressFromMnemonic,
  isValidBitcoinAddress,
  getAllBitcoinAddresses,
} from './addresses';

export {
  getBalance,
  getUtxos,
  getTransactions,
  getFeeEstimate,
  broadcastTransaction,
  getBlockHeight,
  clearBitcoinCache,
} from './client';

// Transaction utilities
export {
  selectUtxos,
  createUnsignedTransaction,
  signTransaction,
  estimateTransactionFee,
  validateTransaction,
} from './transactions';

export { BitcoinAdapter, createBitcoinAdapter } from './adapter';
