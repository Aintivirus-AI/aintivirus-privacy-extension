/**
 * AINTIVIRUS Wallet Module - Main Entry Point
 * 
 * This module provides the public API for the wallet functionality.
 * It handles message routing from the background script and exposes
 * the necessary functions for wallet operations.
 * 
 * SECURITY ARCHITECTURE:
 * - All private key operations happen in the background script context
 * - UI components only receive public information
 * - Messages are validated before processing
 * - No sensitive data is logged or exposed
 */

import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  WalletMessageType,
  WalletMessagePayloads,
  WalletMessageResponses,
  WalletState,
  WalletBalance,
  WalletSettings,
  SignedTransaction,
  SolanaNetwork,
  WalletError,
  WalletErrorCode,
  SendTransactionResult,
  FeeEstimate,
  TransactionHistoryResult,
  SPLTokenBalance,
} from './types';
import {
  walletExists,
  getWalletState,
  createWallet,
  importWallet,
  unlockWallet,
  lockWallet,
  deleteWallet,
  getUnlockedKeypair,
  isWalletUnlocked,
  getPublicAddress,
  getWalletSettings,
  saveWalletSettings,
  resetAutoLockTimer,
} from './storage';
import {
  getBalance,
  getBalanceWithRetry,
  setNetwork,
  getCurrentNetwork,
  getNetworkStatus,
  deserializeTransaction,
  serializeTransaction,
  getRecentBlockhash,
} from './rpc';
import { generateAddressQR } from './qr';
import { validateMnemonic } from './keychain';
import bs58 from 'bs58';

// Phase 6 imports
import {
  sendSol,
  estimateTransactionFee,
} from './transactions';
import {
  getTransactionHistory,
} from './history';
import {
  getTokenBalances,
  addCustomToken,
  removeCustomToken,
} from './tokens';

// RPC Health imports
import {
  getRpcHealthSummary,
  addCustomRpcUrl,
  removeCustomRpcUrl,
  testRpcEndpoint,
  initializeRpcHealth,
} from './rpcHealth';

// ============================================
// MESSAGE HANDLER
// ============================================

/**
 * Handle incoming wallet messages from popup/settings UI
 * 
 * SECURITY: This is the single entry point for all wallet operations.
 * Each message type is validated and processed appropriately.
 * Sensitive data never leaves this module unencrypted.
 * 
 * @param type - Message type
 * @param payload - Message payload
 * @returns Response data
 */
export async function handleWalletMessage(
  type: WalletMessageType,
  payload: unknown
): Promise<unknown> {
  // Reset auto-lock timer on any activity
  if (isWalletUnlocked()) {
    await resetAutoLockTimer();
  }

  switch (type) {
    // ========== Wallet Lifecycle ==========
    
    case 'WALLET_CREATE':
      return handleCreateWallet(payload as WalletMessagePayloads['WALLET_CREATE']);
    
    case 'WALLET_IMPORT':
      return handleImportWallet(payload as WalletMessagePayloads['WALLET_IMPORT']);
    
    case 'WALLET_UNLOCK':
      return handleUnlockWallet(payload as WalletMessagePayloads['WALLET_UNLOCK']);
    
    case 'WALLET_LOCK':
      handleLockWallet();
      return undefined;
    
    case 'WALLET_EXISTS':
      return await walletExists();
    
    case 'WALLET_GET_STATE':
      return await getWalletState();
    
    case 'WALLET_DELETE':
      await handleDeleteWallet(payload as WalletMessagePayloads['WALLET_DELETE']);
      return undefined;
    
    // ========== Balance and Account ==========
    
    case 'WALLET_GET_BALANCE':
      return handleGetBalance();
    
    case 'WALLET_GET_ADDRESS':
      return handleGetAddress();
    
    case 'WALLET_GET_ADDRESS_QR':
      return handleGetAddressQR(payload as WalletMessagePayloads['WALLET_GET_ADDRESS_QR']);
    
    // ========== Network ==========
    
    case 'WALLET_SET_NETWORK':
      await handleSetNetwork(payload as WalletMessagePayloads['WALLET_SET_NETWORK']);
      return undefined;
    
    case 'WALLET_GET_NETWORK':
      return handleGetNetwork();
    
    case 'WALLET_GET_NETWORK_STATUS':
      return handleGetNetworkStatus();
    
    // ========== Transaction Signing ==========
    
    case 'WALLET_SIGN_TRANSACTION':
      return handleSignTransaction(payload as WalletMessagePayloads['WALLET_SIGN_TRANSACTION']);
    
    case 'WALLET_SIGN_MESSAGE':
      return handleSignMessage(payload as WalletMessagePayloads['WALLET_SIGN_MESSAGE']);
    
    // ========== Settings ==========
    
    case 'WALLET_GET_SETTINGS':
      return await getWalletSettings();
    
    case 'WALLET_SET_SETTINGS':
      await saveWalletSettings(payload as WalletMessagePayloads['WALLET_SET_SETTINGS']);
      return undefined;
    
    // ========== Phase 6: Transactions ==========
    
    case 'WALLET_SEND_SOL':
      return handleSendSol(payload as WalletMessagePayloads['WALLET_SEND_SOL']);
    
    case 'WALLET_ESTIMATE_FEE':
      return handleEstimateFee(payload as WalletMessagePayloads['WALLET_ESTIMATE_FEE']);
    
    // ========== Phase 6: History ==========
    
    case 'WALLET_GET_HISTORY':
      return handleGetHistory(payload as WalletMessagePayloads['WALLET_GET_HISTORY']);
    
    // ========== Phase 6: Tokens ==========
    
    case 'WALLET_GET_TOKENS':
      return handleGetTokens();
    
    case 'WALLET_ADD_TOKEN':
      return handleAddToken(payload as WalletMessagePayloads['WALLET_ADD_TOKEN']);
    
    case 'WALLET_REMOVE_TOKEN':
      return handleRemoveToken(payload as WalletMessagePayloads['WALLET_REMOVE_TOKEN']);
    
    // ========== RPC Health & Configuration ==========
    
    case 'WALLET_GET_RPC_HEALTH':
      return handleGetRpcHealth();
    
    case 'WALLET_ADD_RPC':
      return handleAddRpc(payload as WalletMessagePayloads['WALLET_ADD_RPC']);
    
    case 'WALLET_REMOVE_RPC':
      return handleRemoveRpc(payload as WalletMessagePayloads['WALLET_REMOVE_RPC']);
    
    case 'WALLET_TEST_RPC':
      return handleTestRpc(payload as WalletMessagePayloads['WALLET_TEST_RPC']);
    
    default:
      throw new WalletError(
        WalletErrorCode.NETWORK_ERROR,
        `Unknown wallet message type: ${type}`
      );
  }
}

// ============================================
// HANDLER IMPLEMENTATIONS
// ============================================

/**
 * Handle wallet creation
 * 
 * SECURITY: Returns mnemonic ONCE for user backup.
 * This is the only time the mnemonic should be displayed.
 */
async function handleCreateWallet(
  payload: WalletMessagePayloads['WALLET_CREATE']
): Promise<WalletMessageResponses['WALLET_CREATE']> {
  const { password } = payload;
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required'
    );
  }
  
  const result = await createWallet(password);
  
  console.log('[AINTIVIRUS Wallet] Wallet created successfully');
  
  return result;
}

/**
 * Handle wallet import from mnemonic
 */
async function handleImportWallet(
  payload: WalletMessagePayloads['WALLET_IMPORT']
): Promise<WalletMessageResponses['WALLET_IMPORT']> {
  const { mnemonic, password } = payload;
  
  if (!mnemonic) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Mnemonic is required'
    );
  }
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required'
    );
  }
  
  const result = await importWallet(mnemonic, password);
  
  console.log('[AINTIVIRUS Wallet] Wallet imported successfully');
  
  return result;
}

/**
 * Handle wallet unlock
 */
async function handleUnlockWallet(
  payload: WalletMessagePayloads['WALLET_UNLOCK']
): Promise<WalletMessageResponses['WALLET_UNLOCK']> {
  const { password } = payload;
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required'
    );
  }
  
  const result = await unlockWallet(password);
  
  console.log('[AINTIVIRUS Wallet] Wallet unlocked');
  
  return result;
}

/**
 * Handle wallet lock
 */
function handleLockWallet(): void {
  lockWallet();
  console.log('[AINTIVIRUS Wallet] Wallet locked');
}

/**
 * Handle wallet deletion
 */
async function handleDeleteWallet(
  payload: WalletMessagePayloads['WALLET_DELETE']
): Promise<void> {
  const { password } = payload;
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to delete wallet'
    );
  }
  
  await deleteWallet(password);
  
  console.log('[AINTIVIRUS Wallet] Wallet deleted');
}

/**
 * Handle balance retrieval
 */
async function handleGetBalance(): Promise<WalletBalance> {
  const address = await getPublicAddress();
  
  if (!address) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }
  
  return await getBalanceWithRetry(address);
}

/**
 * Handle address retrieval
 */
async function handleGetAddress(): Promise<string> {
  const address = await getPublicAddress();
  
  if (!address) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }
  
  return address;
}

/**
 * Handle QR code generation
 */
async function handleGetAddressQR(
  payload: WalletMessagePayloads['WALLET_GET_ADDRESS_QR']
): Promise<string> {
  const address = await getPublicAddress();
  
  if (!address) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_INITIALIZED,
      'No wallet found'
    );
  }
  
  return await generateAddressQR(address, { size: payload?.size });
}

/**
 * Handle network switch
 */
async function handleSetNetwork(
  payload: WalletMessagePayloads['WALLET_SET_NETWORK']
): Promise<void> {
  await setNetwork(payload.network);
  console.log(`[AINTIVIRUS Wallet] Switched to ${payload.network}`);
}

/**
 * Handle network retrieval
 */
async function handleGetNetwork(): Promise<SolanaNetwork> {
  const config = await getCurrentNetwork();
  return config.name;
}

/**
 * Handle network status check
 */
async function handleGetNetworkStatus(): Promise<{ connected: boolean; latency: number }> {
  const status = await getNetworkStatus();
  return {
    connected: status.connected,
    latency: status.latency,
  };
}

/**
 * Handle transaction signing
 * 
 * SECURITY: This is where the private key is used.
 * The keypair must be unlocked and only exists in memory.
 * The signed transaction is returned, but the private key never leaves.
 */
async function handleSignTransaction(
  payload: WalletMessagePayloads['WALLET_SIGN_TRANSACTION']
): Promise<SignedTransaction> {
  const keypair = getUnlockedKeypair();
  
  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to sign transactions.'
    );
  }
  
  try {
    const transaction = deserializeTransaction(payload.serializedTransaction);
    
    // Sign based on transaction type
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([keypair]);
      
      // Get signature
      const signature = bs58.encode(transaction.signatures[0]);
      
      return {
        signedTransaction: serializeTransaction(transaction),
        signature,
      };
    } else {
      // Legacy transaction
      const { blockhash } = await getRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      transaction.sign(keypair);
      
      // Get signature
      const signature = transaction.signature ? bs58.encode(transaction.signature) : '';
      
      return {
        signedTransaction: serializeTransaction(transaction),
        signature,
      };
    }
  } catch (error) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError(
      WalletErrorCode.SIGNING_FAILED,
      `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Handle message signing
 * 
 * SECURITY: Signs an arbitrary message with the private key.
 * Used for authentication/verification purposes.
 */
async function handleSignMessage(
  payload: WalletMessagePayloads['WALLET_SIGN_MESSAGE']
): Promise<{ signature: string }> {
  const keypair = getUnlockedKeypair();
  
  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to sign messages.'
    );
  }
  
  try {
    // Convert message to bytes
    const messageBytes = new TextEncoder().encode(payload.message);
    
    // Sign using nacl (tweetnacl is bundled with @solana/web3.js)
    const nacl = await import('tweetnacl');
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    
    return {
      signature: bs58.encode(signature),
    };
  } catch (error) {
    throw new WalletError(
      WalletErrorCode.SIGNING_FAILED,
      'Failed to sign message'
    );
  }
}

// ============================================
// PHASE 6: TRANSACTION HANDLERS
// ============================================

/**
 * Handle sending SOL
 * 
 * SECURITY: Requires unlocked wallet. Creates, signs, and broadcasts transaction.
 */
async function handleSendSol(
  payload: WalletMessagePayloads['WALLET_SEND_SOL']
): Promise<SendTransactionResult> {
  const { recipient, amountSol, memo } = payload;
  
  if (!recipient) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Recipient address is required'
    );
  }
  
  if (!amountSol || amountSol <= 0) {
    throw new WalletError(
      WalletErrorCode.INVALID_AMOUNT,
      'Amount must be greater than 0'
    );
  }
  
  const result = await sendSol({ recipient, amountSol, memo });
  
  console.log(`[AINTIVIRUS Wallet] Sent ${amountSol} SOL to ${recipient}`);
  console.log(`[AINTIVIRUS Wallet] Signature: ${result.signature}`);
  
  return result;
}

/**
 * Handle fee estimation
 */
async function handleEstimateFee(
  payload: WalletMessagePayloads['WALLET_ESTIMATE_FEE']
): Promise<FeeEstimate> {
  const { recipient, amountSol } = payload;
  
  if (!recipient) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Recipient address is required for fee estimation'
    );
  }
  
  return await estimateTransactionFee(recipient, amountSol);
}

// ============================================
// PHASE 6: HISTORY HANDLERS
// ============================================

/**
 * Handle transaction history retrieval
 */
async function handleGetHistory(
  payload: WalletMessagePayloads['WALLET_GET_HISTORY']
): Promise<TransactionHistoryResult> {
  const { limit, before } = payload || {};
  return await getTransactionHistory({ limit, before });
}

// ============================================
// PHASE 6: TOKEN HANDLERS
// ============================================

/**
 * Handle token balance retrieval
 */
async function handleGetTokens(): Promise<SPLTokenBalance[]> {
  return await getTokenBalances();
}

/**
 * Handle adding a custom token
 */
async function handleAddToken(
  payload: WalletMessagePayloads['WALLET_ADD_TOKEN']
): Promise<void> {
  const { mint, symbol, name } = payload;
  
  if (!mint) {
    throw new WalletError(
      WalletErrorCode.TOKEN_NOT_FOUND,
      'Token mint address is required'
    );
  }
  
  await addCustomToken(mint, symbol, name);
  console.log(`[AINTIVIRUS Wallet] Added custom token: ${mint}`);
}

/**
 * Handle removing a custom token
 */
async function handleRemoveToken(
  payload: WalletMessagePayloads['WALLET_REMOVE_TOKEN']
): Promise<void> {
  const { mint } = payload;
  
  if (!mint) {
    throw new WalletError(
      WalletErrorCode.TOKEN_NOT_FOUND,
      'Token mint address is required'
    );
  }
  
  await removeCustomToken(mint);
  console.log(`[AINTIVIRUS Wallet] Removed custom token: ${mint}`);
}

// ============================================
// RPC HEALTH HANDLERS
// ============================================

/**
 * Handle RPC health retrieval
 */
async function handleGetRpcHealth(): Promise<WalletMessageResponses['WALLET_GET_RPC_HEALTH']> {
  const settings = await getWalletSettings();
  return await getRpcHealthSummary(settings.network);
}

/**
 * Handle adding a custom RPC endpoint
 */
async function handleAddRpc(
  payload: WalletMessagePayloads['WALLET_ADD_RPC']
): Promise<WalletMessageResponses['WALLET_ADD_RPC']> {
  const { network, url } = payload;
  
  if (!url) {
    return { success: false, error: 'RPC URL is required' };
  }
  
  const result = await addCustomRpcUrl(network, url);
  
  if (result.success) {
    console.log(`[AINTIVIRUS Wallet] Added custom RPC for ${network}: ${url}`);
  }
  
  return result;
}

/**
 * Handle removing a custom RPC endpoint
 */
async function handleRemoveRpc(
  payload: WalletMessagePayloads['WALLET_REMOVE_RPC']
): Promise<void> {
  const { network, url } = payload;
  
  if (!url) {
    throw new WalletError(
      WalletErrorCode.NETWORK_ERROR,
      'RPC URL is required'
    );
  }
  
  await removeCustomRpcUrl(network, url);
  console.log(`[AINTIVIRUS Wallet] Removed custom RPC for ${network}: ${url}`);
}

/**
 * Handle testing an RPC endpoint
 */
async function handleTestRpc(
  payload: WalletMessagePayloads['WALLET_TEST_RPC']
): Promise<WalletMessageResponses['WALLET_TEST_RPC']> {
  const { url } = payload;
  
  if (!url) {
    return { success: false, error: 'RPC URL is required' };
  }
  
  return await testRpcEndpoint(url);
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the wallet module
 * 
 * Called when the background script starts.
 * Restores any necessary state.
 */
export async function initializeWalletModule(): Promise<void> {
  console.log('[AINTIVIRUS Wallet] Initializing wallet module...');
  
  const exists = await walletExists();
  const settings = await getWalletSettings();
  
  console.log(`[AINTIVIRUS Wallet] Wallet exists: ${exists}`);
  console.log(`[AINTIVIRUS Wallet] Current network: ${settings.network}`);
  
  // Initialize RPC health tracking
  await initializeRpcHealth();
  
  // Wallet starts locked on initialization
  // User must explicitly unlock with password
}

// ============================================
// EXPORTS
// ============================================

// Re-export types for external use
export * from './types';

// Re-export specific functions that might be needed
export { validateMnemonic } from './keychain';
export { validatePasswordStrength, getPasswordStrengthFeedback } from './crypto';
export { getAddressExplorerUrl, getTransactionExplorerUrl } from './rpc';

// Phase 6 exports
export {
  sendSol,
  estimateTransactionFee,
  validateRecipient,
  validateAmount,
  formatSolAmount,
  parseSolInput,
  calculateMaxSendable,
} from './transactions';

export {
  getTransactionHistory,
  formatTransactionTime,
  truncateAddress,
  getDirectionIcon,
  clearHistoryCache,
} from './history';

export {
  getTokenBalances,
  addCustomToken,
  removeCustomToken,
  getTokenMetadata,
  formatTokenBalance,
  getTokenLogo,
  clearTokenCache,
} from './tokens';

export {
  getUserFriendlyMessage,
  getErrorCategory,
  isRetryableError,
  withRetry,
  logError,
  wrapError,
  validationError,
  assert,
  assertDefined,
  ok,
  err,
  tryAsync,
} from './errors';

export type {
  ErrorCategory,
  RetryOptions,
  Result,
} from './errors';

// RPC Health exports
export {
  getRpcHealthSummary,
  addCustomRpcUrl,
  removeCustomRpcUrl,
  testRpcEndpoint,
  getAllRpcHealth,
  getBestRpcEndpoint,
  getSortedRpcEndpoints,
  calculateHealthScore,
} from './rpcHealth';

// Solana Client exports
export {
  executeWithFailover,
  getConnection,
  getBalance as getBalanceFromClient,
  getNetworkStatus as getNetworkStatusFromClient,
  getRecentBlockhash as getRecentBlockhashFromClient,
  getRpcHealth,
} from './solanaClient';

