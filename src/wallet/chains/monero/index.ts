/**
 * Monero watch-only chain support
 * 
 * Provides watch-only wallet functionality for Monero.
 * Users can view balances and incoming transactions but cannot send.
 */

// Types
export type {
  MoneroWatchOnlyConfig,
  MoneroBalance,
  MoneroOutput,
  MoneroTransaction,
  MoneroNetworkInfo,
  MoneroNodeConfig,
} from './types';

// Configuration
export {
  MONERO_CONSTANTS,
  PUBLIC_MONERO_NODES,
  PUBLIC_MONERO_TESTNET_NODES,
  MONERO_EXPLORERS,
  getMoneroTxExplorerUrl,
  getMoneroAddressExplorerUrl,
  piconeroToXmr,
  xmrToPiconero,
  formatXmr,
  getRandomNode,
  getAvailableNodes,
} from './config';

// Validation
export {
  isValidMoneroAddress,
  isValidViewKey,
  validateWatchOnlyConfig,
  getAddressType,
  maskAddress,
  maskViewKey,
} from './validation';

// API client
export {
  getBalance,
  getTransactions,
  getNetworkInfo,
  getBlockHeight,
  getCurrentNode,
  switchToNextNode,
  checkNodeHealth,
  findBestNode,
} from './client';

// Adapter
export {
  MoneroAdapter,
  createMoneroAdapter,
  createMoneroWatchOnlyAdapter,
} from './adapter';
