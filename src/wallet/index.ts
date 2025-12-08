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
  WalletEntry,
  SignedTransaction,
  SolanaNetwork,
  WalletError,
  WalletErrorCode,
  SendTransactionResult,
  FeeEstimate,
  TransactionHistoryResult,
  SPLTokenBalance,
  // Multi-chain types
  ChainType,
  EVMChainId,
  EVMBalance,
  EVMTokenBalance,
  EVMFeeEstimate,
  EVMTransactionResult,
  EVMSendParams,
  EVMTokenSendParams,
  // EVM Pending Transaction types
  EVMPendingTxInfo,
  EVMGasPresets,
  EVMReplacementFeeEstimate,
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
  getUnlockedEVMKeypair,
  getEVMAddress,
  isWalletUnlocked,
  getPublicAddress,
  getWalletSettings,
  saveWalletSettings,
  resetAutoLockTimer,
  // Multi-wallet functions
  listWallets,
  addWallet,
  importAdditionalWallet,
  switchWallet,
  renameWallet,
  deleteOneWallet,
  exportWalletMnemonic,
  getActiveWallet,
  // Private key import/export
  importWalletFromPrivateKey,
  exportPrivateKey,
} from './storage';

// Multi-chain imports
import {
  getEVMAdapter,
  getEVMChainConfig,
  getEVMExplorerUrl,
  parseAmount,
  formatAmount,
} from './chains';

// EVM Pending Transaction imports
import {
  getAllPendingTxs,
  getPendingTxsForAccount,
  getPendingTxByHash,
  addPendingTx,
  createPendingTxRecord,
  parseHexBigInt,
} from './chains/evm/pendingTxStore';
import {
  createSpeedUpTx,
  createCancelTx,
  calculateSpeedUpFees,
  getReplacementGasPresets,
  estimateReplacementFees,
  calculateCostDifference,
  getMinimumReplacementFees,
  DEFAULT_BUMP_PERCENT,
} from './chains/evm/replacement';
import {
  signTransaction as signEVMTransaction,
  broadcastTransaction,
  type UnsignedEVMTransaction,
} from './chains/evm/transactions';
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
  sendSPLToken,
  estimateTransactionFee,
} from './transactions';
import {
  getTransactionHistory,
  clearHistoryCache,
} from './history';
import {
  getTokenBalances,
  addCustomToken,
  removeCustomToken,
  fetchPopularTokens,
  fetchJupiterTokenMetadata,
  type PopularToken,
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
    
    // ========== Multi-Wallet Management ==========
    
    case 'WALLET_LIST':
      return handleListWallets();
    
    case 'WALLET_ADD':
      return handleAddWallet(payload as WalletMessagePayloads['WALLET_ADD']);
    
    case 'WALLET_IMPORT_ADD':
      return handleImportAddWallet(payload as WalletMessagePayloads['WALLET_IMPORT_ADD']);
    
    case 'WALLET_SWITCH':
      return handleSwitchWallet(payload as WalletMessagePayloads['WALLET_SWITCH']);
    
    case 'WALLET_RENAME':
      await handleRenameWallet(payload as WalletMessagePayloads['WALLET_RENAME']);
      return undefined;
    
    case 'WALLET_DELETE_ONE':
      await handleDeleteOneWallet(payload as WalletMessagePayloads['WALLET_DELETE_ONE']);
      return undefined;
    
    case 'WALLET_EXPORT_ONE':
      return handleExportWallet(payload as WalletMessagePayloads['WALLET_EXPORT_ONE']);
    
    case 'WALLET_IMPORT_PRIVATE_KEY':
      return handleImportPrivateKey(payload as WalletMessagePayloads['WALLET_IMPORT_PRIVATE_KEY']);
    
    case 'WALLET_EXPORT_PRIVATE_KEY':
      return handleExportPrivateKey(payload as WalletMessagePayloads['WALLET_EXPORT_PRIVATE_KEY']);
    
    case 'WALLET_GET_ACTIVE':
      return handleGetActiveWallet();
    
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
    
    case 'WALLET_SEND_SPL_TOKEN':
      return handleSendSPLToken(payload as WalletMessagePayloads['WALLET_SEND_SPL_TOKEN']);
    
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
    
    case 'WALLET_GET_POPULAR_TOKENS':
      return handleGetPopularTokens(payload as WalletMessagePayloads['WALLET_GET_POPULAR_TOKENS']);
    
    case 'WALLET_GET_TOKEN_METADATA':
      return handleGetTokenMetadata(payload as WalletMessagePayloads['WALLET_GET_TOKEN_METADATA']);
    
    // ========== RPC Health & Configuration ==========
    
    case 'WALLET_GET_RPC_HEALTH':
      return handleGetRpcHealth();
    
    case 'WALLET_ADD_RPC':
      return handleAddRpc(payload as WalletMessagePayloads['WALLET_ADD_RPC']);
    
    case 'WALLET_REMOVE_RPC':
      return handleRemoveRpc(payload as WalletMessagePayloads['WALLET_REMOVE_RPC']);
    
    case 'WALLET_TEST_RPC':
      return handleTestRpc(payload as WalletMessagePayloads['WALLET_TEST_RPC']);
    
    // ========== Multi-Chain Support ==========
    
    case 'WALLET_SET_CHAIN':
      return handleSetChain(payload as WalletMessagePayloads['WALLET_SET_CHAIN']);
    
    case 'WALLET_SET_EVM_CHAIN':
      return handleSetEVMChain(payload as WalletMessagePayloads['WALLET_SET_EVM_CHAIN']);
    
    case 'WALLET_GET_EVM_BALANCE':
      return handleGetEVMBalance(payload as WalletMessagePayloads['WALLET_GET_EVM_BALANCE']);
    
    case 'WALLET_SEND_ETH':
      return handleSendETH(payload as WalletMessagePayloads['WALLET_SEND_ETH']);
    
    case 'WALLET_SEND_ERC20':
      return handleSendERC20(payload as WalletMessagePayloads['WALLET_SEND_ERC20']);
    
    case 'WALLET_GET_EVM_TOKENS':
      return handleGetEVMTokens(payload as WalletMessagePayloads['WALLET_GET_EVM_TOKENS']);
    
    case 'WALLET_GET_EVM_HISTORY':
      return handleGetEVMHistory(payload as WalletMessagePayloads['WALLET_GET_EVM_HISTORY']);
    
    case 'WALLET_ESTIMATE_EVM_FEE':
      return handleEstimateEVMFee(payload as WalletMessagePayloads['WALLET_ESTIMATE_EVM_FEE']);
    
    case 'WALLET_GET_EVM_ADDRESS':
      return handleGetEVMAddress();
    
    // ========== EVM Pending Transaction Controls ==========
    
    case 'EVM_GET_PENDING_TXS':
      return handleGetPendingTxs(payload as WalletMessagePayloads['EVM_GET_PENDING_TXS']);
    
    case 'EVM_SPEED_UP_TX':
      return handleSpeedUpTx(payload as WalletMessagePayloads['EVM_SPEED_UP_TX']);
    
    case 'EVM_CANCEL_TX':
      return handleCancelTx(payload as WalletMessagePayloads['EVM_CANCEL_TX']);
    
    case 'EVM_GET_GAS_PRESETS':
      return handleGetGasPresets(payload as WalletMessagePayloads['EVM_GET_GAS_PRESETS']);
    
    case 'EVM_ESTIMATE_REPLACEMENT_FEE':
      return handleEstimateReplacementFee(payload as WalletMessagePayloads['EVM_ESTIMATE_REPLACEMENT_FEE']);
    
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

// ============================================
// MULTI-WALLET HANDLERS
// ============================================

/**
 * Handle listing all wallets
 */
async function handleListWallets(): Promise<WalletEntry[]> {
  return await listWallets();
}

/**
 * Handle adding a new wallet (create)
 */
async function handleAddWallet(
  payload: WalletMessagePayloads['WALLET_ADD']
): Promise<WalletMessageResponses['WALLET_ADD']> {
  const { password, label } = payload;
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required'
    );
  }
  
  const result = await addWallet(password, label);
  
  console.log('[AINTIVIRUS Wallet] New wallet added:', result.walletId);
  
  return result;
}

/**
 * Handle importing an additional wallet
 */
async function handleImportAddWallet(
  payload: WalletMessagePayloads['WALLET_IMPORT_ADD']
): Promise<WalletMessageResponses['WALLET_IMPORT_ADD']> {
  const { mnemonic, password, label } = payload;
  
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
  
  const result = await importAdditionalWallet(mnemonic, password, label);
  
  console.log('[AINTIVIRUS Wallet] Wallet imported:', result.walletId);
  
  return result;
}

/**
 * Handle switching active wallet
 */
async function handleSwitchWallet(
  payload: WalletMessagePayloads['WALLET_SWITCH']
): Promise<WalletMessageResponses['WALLET_SWITCH']> {
  const { walletId, password } = payload;
  
  if (!walletId) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet ID is required'
    );
  }
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to switch wallets'
    );
  }
  
  const result = await switchWallet(walletId, password);
  
  console.log('[AINTIVIRUS Wallet] Switched to wallet:', walletId);
  
  return result;
}

/**
 * Handle renaming a wallet
 */
async function handleRenameWallet(
  payload: WalletMessagePayloads['WALLET_RENAME']
): Promise<void> {
  const { walletId, label } = payload;
  
  if (!walletId) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet ID is required'
    );
  }
  
  if (!label) {
    throw new WalletError(
      WalletErrorCode.INVALID_WALLET_LABEL,
      'New label is required'
    );
  }
  
  await renameWallet(walletId, label);
  
  console.log('[AINTIVIRUS Wallet] Wallet renamed:', walletId);
}

/**
 * Handle deleting a specific wallet
 */
async function handleDeleteOneWallet(
  payload: WalletMessagePayloads['WALLET_DELETE_ONE']
): Promise<void> {
  const { walletId, password } = payload;
  
  if (!walletId) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet ID is required'
    );
  }
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to delete wallet'
    );
  }
  
  await deleteOneWallet(walletId, password);
  
  console.log('[AINTIVIRUS Wallet] Wallet deleted:', walletId);
}

/**
 * Handle exporting wallet mnemonic
 * 
 * SECURITY: Returns mnemonic for backup purposes.
 * WARNING: This is extremely sensitive data.
 */
async function handleExportWallet(
  payload: WalletMessagePayloads['WALLET_EXPORT_ONE']
): Promise<WalletMessageResponses['WALLET_EXPORT_ONE']> {
  const { walletId, password } = payload;
  
  if (!walletId) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet ID is required'
    );
  }
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to export wallet'
    );
  }
  
  const result = await exportWalletMnemonic(walletId, password);
  
  // SECURITY: Do not log mnemonic-related operations
  // Export audit trail could be added to secure storage if needed
  
  return result;
}

/**
 * Handle importing wallet from private key
 * 
 * SECURITY: Imports a wallet from a raw private key.
 */
async function handleImportPrivateKey(
  payload: WalletMessagePayloads['WALLET_IMPORT_PRIVATE_KEY']
): Promise<WalletMessageResponses['WALLET_IMPORT_PRIVATE_KEY']> {
  const { privateKey, password, label } = payload;
  
  if (!privateKey) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Private key is required'
    );
  }
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required'
    );
  }
  
  const result = await importWalletFromPrivateKey(privateKey, password, label);
  
  return result;
}

/**
 * Handle exporting private key
 * 
 * SECURITY: Returns private key for export purposes.
 * WARNING: This is extremely sensitive data.
 */
async function handleExportPrivateKey(
  payload: WalletMessagePayloads['WALLET_EXPORT_PRIVATE_KEY']
): Promise<WalletMessageResponses['WALLET_EXPORT_PRIVATE_KEY']> {
  const { walletId, password, chain } = payload;
  
  if (!walletId) {
    throw new WalletError(
      WalletErrorCode.WALLET_NOT_FOUND,
      'Wallet ID is required'
    );
  }
  
  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to export private key'
    );
  }
  
  if (!chain || (chain !== 'solana' && chain !== 'evm')) {
    throw new WalletError(
      WalletErrorCode.INVALID_MNEMONIC,
      'Chain type must be "solana" or "evm"'
    );
  }
  
  const result = await exportPrivateKey(walletId, password, chain);
  
  return result;
}

/**
 * Handle getting active wallet info
 */
async function handleGetActiveWallet(): Promise<WalletMessageResponses['WALLET_GET_ACTIVE']> {
  return await getActiveWallet();
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
  
  // Clear history cache so new transaction appears immediately on refresh
  clearHistoryCache();
  
  console.log(`[AINTIVIRUS Wallet] Sent ${amountSol} SOL to ${recipient}`);
  console.log(`[AINTIVIRUS Wallet] Signature: ${result.signature}`);
  
  return result;
}

/**
 * Handle sending SPL tokens
 * 
 * SECURITY: Requires unlocked wallet. Creates, signs, and broadcasts token transfer.
 */
async function handleSendSPLToken(
  payload: WalletMessagePayloads['WALLET_SEND_SPL_TOKEN']
): Promise<SendTransactionResult> {
  const { recipient, amount, mint, decimals, tokenAccount } = payload;
  
  if (!recipient) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Recipient address is required'
    );
  }
  
  if (!amount || amount <= 0) {
    throw new WalletError(
      WalletErrorCode.INVALID_AMOUNT,
      'Amount must be greater than 0'
    );
  }
  
  if (!mint) {
    throw new WalletError(
      WalletErrorCode.TOKEN_NOT_FOUND,
      'Token mint address is required'
    );
  }
  
  const result = await sendSPLToken({ recipient, amount, mint, decimals, tokenAccount });
  
  // Clear history cache so new transaction appears immediately on refresh
  clearHistoryCache();
  
  console.log(`[AINTIVIRUS Wallet] Sent ${amount} tokens (${mint}) to ${recipient}`);
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

/**
 * Handle getting popular/top tokens
 */
async function handleGetPopularTokens(
  payload?: WalletMessagePayloads['WALLET_GET_POPULAR_TOKENS']
): Promise<PopularToken[]> {
  const chainType = payload?.chainType || 'solana';
  return await fetchPopularTokens(chainType);
}

/**
 * Handle getting token metadata by mint address
 */
async function handleGetTokenMetadata(
  payload: WalletMessagePayloads['WALLET_GET_TOKEN_METADATA']
): Promise<{ symbol: string; name: string; logoUri?: string } | null> {
  const { mint } = payload;
  
  if (!mint) {
    return null;
  }
  
  const metadata = await fetchJupiterTokenMetadata(mint);
  if (metadata) {
    return {
      symbol: metadata.symbol,
      name: metadata.name,
      logoUri: metadata.logoUri,
    };
  }
  
  return null;
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
// MULTI-CHAIN HANDLERS
// ============================================

/**
 * Handle setting the active chain
 */
async function handleSetChain(
  payload: WalletMessagePayloads['WALLET_SET_CHAIN']
): Promise<void> {
  const { chain, evmChainId } = payload;
  
  console.log(`[handleSetChain] Received: chain=${chain}, evmChainId=${evmChainId}`);
  
  await saveWalletSettings({
    activeChain: chain,
    activeEVMChain: evmChainId,
  });
  
  // Verify settings were saved
  const settings = await getWalletSettings();
  console.log(`[handleSetChain] Saved settings: activeChain=${settings.activeChain}, activeEVMChain=${settings.activeEVMChain}`);
  
  console.log(`[AINTIVIRUS Wallet] Switched to ${chain}${evmChainId ? ` (${evmChainId})` : ''}`);
}

/**
 * Handle setting the active EVM chain
 */
async function handleSetEVMChain(
  payload: WalletMessagePayloads['WALLET_SET_EVM_CHAIN']
): Promise<void> {
  const { evmChainId } = payload;
  
  await saveWalletSettings({
    activeChain: 'evm',
    activeEVMChain: evmChainId,
  });
  
  console.log(`[AINTIVIRUS Wallet] Switched to EVM chain: ${evmChainId}`);
}

/**
 * Handle getting EVM balance
 */
async function handleGetEVMBalance(
  payload: WalletMessagePayloads['WALLET_GET_EVM_BALANCE']
): Promise<EVMBalance> {
  const evmAddress = getEVMAddress();
  
  if (!evmAddress) {
    // Return zero balance for wallets without EVM address (e.g., Solana-only imports)
    return {
      wei: '0',
      formatted: 0,
      symbol: 'ETH',
      lastUpdated: Date.now(),
    };
  }
  
  const settings = await getWalletSettings();
  const chainId = payload?.evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  
  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');
  const balance = await adapter.getBalance(evmAddress);
  
  return {
    wei: balance.raw.toString(),
    formatted: balance.formatted,
    symbol: balance.symbol,
    lastUpdated: balance.lastUpdated,
  };
}

/**
 * Handle sending ETH/native tokens
 */
async function handleSendETH(
  payload: WalletMessagePayloads['WALLET_SEND_ETH']
): Promise<EVMTransactionResult> {
  const { recipient, amount, evmChainId } = payload;
  
  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.'
    );
  }
  
  const settings = await getWalletSettings();
  const chainId = evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  const config = getEVMChainConfig(chainId);
  
  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');
  
  // Parse amount to wei
  const amountWei = parseAmount(amount, config.decimals);
  
  // Create and sign transaction
  const unsignedTx = await adapter.createTransfer(evmKeypair.address, recipient, amountWei);
  const signedTx = await adapter.signTransaction(unsignedTx, {
    chainType: 'evm',
    address: evmKeypair.address,
    privateKey: evmKeypair.privateKey,
    _raw: evmKeypair,
  });
  
  // Broadcast
  const result = await adapter.broadcastTransaction(signedTx);
  
  // Track pending transaction for speed up / cancel support
  if (!result.confirmed && !result.error) {
    try {
      const rawTx = unsignedTx._raw as UnsignedEVMTransaction | undefined;
      if (rawTx) {
        await addPendingTx(createPendingTxRecord({
          hash: result.hash,
          nonce: rawTx.nonce,
          chainId: chainId,
          from: evmKeypair.address,
          to: recipient,
          value: amountWei,
          data: '0x',
          gasLimit: rawTx.gasLimit,
          maxFeePerGas: rawTx.maxFeePerGas || rawTx.gasPrice || 0n,
          maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas || 0n,
          testnet: testnet,
        }));
      }
    } catch (err) {
      // Don't fail the transaction if tracking fails
      console.warn('[AINTIVIRUS Wallet] Failed to track pending tx:', err);
    }
  }
  
  console.log(`[AINTIVIRUS Wallet] Sent ${amount} ${config.symbol} to ${recipient}`);
  console.log(`[AINTIVIRUS Wallet] Hash: ${result.hash}`);
  
  return {
    hash: result.hash,
    explorerUrl: result.explorerUrl,
    confirmed: result.confirmed,
    error: result.error,
  };
}

/**
 * Handle sending ERC-20 tokens
 */
async function handleSendERC20(
  payload: WalletMessagePayloads['WALLET_SEND_ERC20']
): Promise<EVMTransactionResult> {
  const { recipient, tokenAddress, amount, decimals, evmChainId } = payload;
  
  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.'
    );
  }
  
  const settings = await getWalletSettings();
  const chainId = evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  
  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');
  
  // Parse amount
  const amountSmallest = parseAmount(amount, decimals);
  
  // Create and sign transaction
  const unsignedTx = await adapter.createTokenTransfer(
    evmKeypair.address,
    recipient,
    tokenAddress,
    amountSmallest
  );
  const signedTx = await adapter.signTransaction(unsignedTx, {
    chainType: 'evm',
    address: evmKeypair.address,
    privateKey: evmKeypair.privateKey,
    _raw: evmKeypair,
  });
  
  // Broadcast
  const result = await adapter.broadcastTransaction(signedTx);
  
  // Track pending transaction for speed up / cancel support
  if (!result.confirmed && !result.error) {
    try {
      const rawTx = unsignedTx._raw as UnsignedEVMTransaction | undefined;
      if (rawTx) {
        await addPendingTx(createPendingTxRecord({
          hash: result.hash,
          nonce: rawTx.nonce,
          chainId: chainId,
          from: evmKeypair.address,
          to: tokenAddress, // For ERC20, 'to' is the token contract
          value: 0n, // ERC20 transfers have 0 ETH value
          data: rawTx.data,
          gasLimit: rawTx.gasLimit,
          maxFeePerGas: rawTx.maxFeePerGas || rawTx.gasPrice || 0n,
          maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas || 0n,
          testnet: testnet,
        }));
      }
    } catch (err) {
      // Don't fail the transaction if tracking fails
      console.warn('[AINTIVIRUS Wallet] Failed to track pending tx:', err);
    }
  }
  
  console.log(`[AINTIVIRUS Wallet] Sent ${amount} tokens to ${recipient}`);
  console.log(`[AINTIVIRUS Wallet] Hash: ${result.hash}`);
  
  return {
    hash: result.hash,
    explorerUrl: result.explorerUrl,
    confirmed: result.confirmed,
    error: result.error,
  };
}

/**
 * Handle getting EVM token balances
 */
async function handleGetEVMTokens(
  payload: WalletMessagePayloads['WALLET_GET_EVM_TOKENS']
): Promise<EVMTokenBalance[]> {
  const evmAddress = getEVMAddress();
  
  if (!evmAddress) {
    // Return empty array for wallets without EVM address
    return [];
  }
  
  const settings = await getWalletSettings();
  const chainId = payload?.evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  
  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');
  const tokens = await adapter.getTokenBalances(evmAddress);
  
  return tokens.map(t => ({
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    rawBalance: t.rawBalance,
    uiBalance: t.uiBalance,
    logoUri: t.logoUri,
  }));
}

/**
 * Handle getting EVM transaction history
 */
async function handleGetEVMHistory(
  payload: WalletMessagePayloads['WALLET_GET_EVM_HISTORY']
): Promise<{ transactions: any[]; hasMore: boolean }> {
  const evmAddress = getEVMAddress();
  
  if (!evmAddress) {
    // Return empty history for wallets without EVM address
    return { transactions: [], hasMore: false };
  }
  
  const settings = await getWalletSettings();
  const chainId = payload?.evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  
  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');
  
  // Note: Transaction history requires indexer API (Etherscan, etc.)
  // For now, return empty and show "View on Explorer" link in UI
  const result = await adapter.getTransactionHistory(evmAddress, payload?.limit || 20);
  
  return {
    transactions: result.transactions,
    hasMore: result.hasMore,
  };
}

/**
 * Handle estimating EVM transaction fee
 */
async function handleEstimateEVMFee(
  payload: WalletMessagePayloads['WALLET_ESTIMATE_EVM_FEE']
): Promise<EVMFeeEstimate> {
  const evmAddress = getEVMAddress();
  
  if (!evmAddress) {
    // Return zero fee estimate for wallets without EVM address
    return {
      gasLimit: '21000',
      gasPriceGwei: 0,
      totalFeeEth: 0,
      totalFeeWei: '0',
      isEIP1559: false,
    };
  }
  
  const settings = await getWalletSettings();
  const chainId = payload?.evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  const config = getEVMChainConfig(chainId);
  
  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');
  
  // Parse amount
  const amount = parseAmount(payload.amount, config.decimals);
  
  // Create transaction to estimate
  let tx;
  if (payload.tokenAddress) {
    tx = await adapter.createTokenTransfer(evmAddress, payload.recipient, payload.tokenAddress, amount);
  } else {
    tx = await adapter.createTransfer(evmAddress, payload.recipient, amount);
  }
  
  const feeEstimate = await adapter.estimateFee(tx);
  
  return {
    gasLimit: feeEstimate.gasLimit?.toString() || '21000',
    gasPriceGwei: feeEstimate.gasPrice ? Number(feeEstimate.gasPrice) / 1e9 : 0,
    totalFeeEth: feeEstimate.feeFormatted,
    totalFeeWei: feeEstimate.fee.toString(),
    l1DataFee: feeEstimate.l1DataFee?.toString(),
    isEIP1559: !!feeEstimate.priorityFee,
  };
}

/**
 * Handle getting EVM address
 */
async function handleGetEVMAddress(): Promise<string> {
  const evmAddress = getEVMAddress();
  
  // Return empty string if no EVM address (e.g., Solana-only private key import)
  return evmAddress || '';
}

// ============================================
// EVM PENDING TRANSACTION HANDLERS
// ============================================

/**
 * Handle getting pending EVM transactions
 */
async function handleGetPendingTxs(
  payload: WalletMessagePayloads['EVM_GET_PENDING_TXS']
): Promise<EVMPendingTxInfo[]> {
  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';
  
  let txs;
  if (payload?.address && payload?.evmChainId) {
    txs = await getPendingTxsForAccount(payload.evmChainId, payload.address);
  } else {
    txs = await getAllPendingTxs();
  }
  
  // Convert to EVMPendingTxInfo format
  return txs
    .filter(tx => tx.testnet === testnet)
    .map(tx => {
      const valueWei = parseHexBigInt(tx.value);
      const maxFeeWei = parseHexBigInt(tx.maxFeePerGas);
      const maxPriorityFeeWei = parseHexBigInt(tx.maxPriorityFeePerGas);
      
      return {
        hash: tx.hash,
        nonce: tx.nonce,
        chainId: tx.chainId,
        from: tx.from,
        to: tx.to,
        valueFormatted: formatAmount(valueWei, 18, 6),
        maxFeeGwei: Number(maxFeeWei / BigInt(1e9)),
        maxPriorityFeeGwei: Number(maxPriorityFeeWei / BigInt(1e9)),
        submittedAt: tx.submittedAt,
        status: tx.status,
        testnet: tx.testnet,
        explorerUrl: `${getEVMExplorerUrl(tx.chainId, tx.testnet)}/tx/${tx.hash}`,
        replacedBy: tx.replacedBy,
        errorReason: tx.errorReason,
      };
    });
}

/**
 * Handle speeding up a pending transaction
 */
async function handleSpeedUpTx(
  payload: WalletMessagePayloads['EVM_SPEED_UP_TX']
): Promise<EVMTransactionResult> {
  const { txHash, bumpPercent, customMaxFeePerGas, customMaxPriorityFeePerGas } = payload;
  
  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to speed up transactions.'
    );
  }
  
  // Find the original transaction
  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      'Original transaction not found'
    );
  }
  
  if (originalTx.status !== 'pending') {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Cannot speed up transaction with status: ${originalTx.status}`
    );
  }
  
  // Create speed up transaction
  const speedUpTx = createSpeedUpTx({
    originalTx,
    bumpPercent,
    customMaxFeePerGas: customMaxFeePerGas ? BigInt(customMaxFeePerGas) : undefined,
    customMaxPriorityFeePerGas: customMaxPriorityFeePerGas ? BigInt(customMaxPriorityFeePerGas) : undefined,
  });
  
  // Sign the transaction
  const signedTx = signEVMTransaction(
    speedUpTx,
    evmKeypair,
    speedUpTx.chainId
  );
  
  // Broadcast
  const txResponse = await broadcastTransaction(
    originalTx.chainId,
    originalTx.testnet,
    signedTx
  );
  
  // Add new tx to pending store
  await addPendingTx(createPendingTxRecord({
    hash: txResponse.hash,
    nonce: speedUpTx.nonce,
    chainId: originalTx.chainId,
    from: evmKeypair.address,
    to: speedUpTx.to,
    value: speedUpTx.value,
    data: speedUpTx.data,
    gasLimit: speedUpTx.gasLimit,
    maxFeePerGas: speedUpTx.maxFeePerGas!,
    maxPriorityFeePerGas: speedUpTx.maxPriorityFeePerGas!,
    testnet: originalTx.testnet,
  }));
  
  console.log(`[AINTIVIRUS Wallet] Speed up tx ${txHash} -> ${txResponse.hash}`);
  
  return {
    hash: txResponse.hash,
    explorerUrl: `${getEVMExplorerUrl(originalTx.chainId, originalTx.testnet)}/tx/${txResponse.hash}`,
    confirmed: false,
  };
}

/**
 * Handle canceling a pending transaction
 */
async function handleCancelTx(
  payload: WalletMessagePayloads['EVM_CANCEL_TX']
): Promise<EVMTransactionResult> {
  const { txHash, bumpPercent } = payload;
  
  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to cancel transactions.'
    );
  }
  
  // Find the original transaction
  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      'Original transaction not found'
    );
  }
  
  if (originalTx.status !== 'pending') {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Cannot cancel transaction with status: ${originalTx.status}`
    );
  }
  
  // Create cancel transaction (0-value self-send)
  const cancelTx = createCancelTx({
    originalTx,
    bumpPercent,
  });
  
  // Sign the transaction
  const signedTx = signEVMTransaction(
    cancelTx,
    evmKeypair,
    cancelTx.chainId
  );
  
  // Broadcast
  const txResponse = await broadcastTransaction(
    originalTx.chainId,
    originalTx.testnet,
    signedTx
  );
  
  // Add cancel tx to pending store
  await addPendingTx(createPendingTxRecord({
    hash: txResponse.hash,
    nonce: cancelTx.nonce,
    chainId: originalTx.chainId,
    from: evmKeypair.address,
    to: cancelTx.to,
    value: cancelTx.value,
    data: cancelTx.data,
    gasLimit: cancelTx.gasLimit,
    maxFeePerGas: cancelTx.maxFeePerGas!,
    maxPriorityFeePerGas: cancelTx.maxPriorityFeePerGas!,
    testnet: originalTx.testnet,
  }));
  
  console.log(`[AINTIVIRUS Wallet] Cancel tx ${txHash} -> ${txResponse.hash}`);
  
  return {
    hash: txResponse.hash,
    explorerUrl: `${getEVMExplorerUrl(originalTx.chainId, originalTx.testnet)}/tx/${txResponse.hash}`,
    confirmed: false,
  };
}

/**
 * Handle getting gas presets for replacement
 */
async function handleGetGasPresets(
  payload: WalletMessagePayloads['EVM_GET_GAS_PRESETS']
): Promise<EVMGasPresets> {
  const { evmChainId, txHash } = payload;
  
  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      'Original transaction not found'
    );
  }
  
  const presets = await getReplacementGasPresets(
    evmChainId,
    originalTx.testnet,
    originalTx
  );
  
  const originalMaxFee = parseHexBigInt(originalTx.maxFeePerGas);
  const originalPriorityFee = parseHexBigInt(originalTx.maxPriorityFeePerGas);
  
  return {
    slow: {
      maxFeeGwei: Number(presets.slow.maxFeePerGas / BigInt(1e9)),
      maxPriorityFeeGwei: Number(presets.slow.maxPriorityFeePerGas / BigInt(1e9)),
      estimatedWaitTime: '~5 minutes',
    },
    market: {
      maxFeeGwei: Number(presets.market.maxFeePerGas / BigInt(1e9)),
      maxPriorityFeeGwei: Number(presets.market.maxPriorityFeePerGas / BigInt(1e9)),
      estimatedWaitTime: '~2 minutes',
    },
    fast: {
      maxFeeGwei: Number(presets.fast.maxFeePerGas / BigInt(1e9)),
      maxPriorityFeeGwei: Number(presets.fast.maxPriorityFeePerGas / BigInt(1e9)),
      estimatedWaitTime: '~30 seconds',
    },
    original: {
      maxFeeGwei: Number(originalMaxFee / BigInt(1e9)),
      maxPriorityFeeGwei: Number(originalPriorityFee / BigInt(1e9)),
    },
  };
}

/**
 * Handle estimating replacement fee
 */
async function handleEstimateReplacementFee(
  payload: WalletMessagePayloads['EVM_ESTIMATE_REPLACEMENT_FEE']
): Promise<EVMReplacementFeeEstimate> {
  const { txHash, bumpPercent } = payload;
  
  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      'Original transaction not found'
    );
  }
  
  const settings = await getWalletSettings();
  const effectiveBumpPercent = bumpPercent || DEFAULT_BUMP_PERCENT;
  
  const fees = await estimateReplacementFees(
    originalTx.chainId,
    originalTx.testnet,
    originalTx,
    effectiveBumpPercent
  );
  
  const { minMaxFee } = getMinimumReplacementFees(originalTx);
  const costDiff = calculateCostDifference(originalTx, fees.maxFeePerGas);
  
  return {
    maxFeeGwei: Number(fees.maxFeePerGas / BigInt(1e9)),
    maxPriorityFeeGwei: Number(fees.maxPriorityFeePerGas / BigInt(1e9)),
    minimumMaxFeeGwei: Number(minMaxFee / BigInt(1e9)),
    networkMaxFeeGwei: Number(fees.networkFees.maxFeePerGas / BigInt(1e9)),
    costDifferenceEth: Number(costDiff.difference) / 1e18,
    percentIncrease: costDiff.percentIncrease,
    exceedsWarning: fees.exceedsWarning,
    warning: fees.exceedsWarning ? 'Gas fee is higher than normal. Consider waiting for lower fees.' : undefined,
  };
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

// Multi-wallet exports
export {
  listWallets,
  addWallet,
  importAdditionalWallet,
  switchWallet,
  renameWallet,
  deleteOneWallet,
  exportWalletMnemonic,
  getActiveWallet,
} from './storage';

// Migration exports
export {
  detectVaultVersion,
  checkMigrationStatus,
} from './migration';

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

// Price service exports
export {
  getSolPrice,
  getEthPrice,
  getTokenPrices,
  getTokenPrice,
  formatUsd,
  calculatePortfolioValue,
  clearPriceCache,
} from './prices';

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

// Transaction Status exports
export {
  // Types
  type TxDisplayStatus,
  type SolanaCommitment,
  type TxConfirmationProgress,
  type SolanaConfirmationProgress,
  type EVMConfirmationProgress,
  type TxStatusBadgeConfig,
  // Solana mapping
  mapSolanaStatus,
  getSolanaProgress,
  getSolanaCommitmentDescription,
  // EVM mapping
  mapEVMStatus,
  getEVMProgress,
  getEVMConfirmationTarget,
  calculateEVMConfirmations,
  // Badge config
  getStatusBadgeConfig,
  STATUS_BADGE_CONFIGS,
  // Utilities
  isInProgress,
  isTerminal,
  mightBeStuck,
  getEstimatedTimeRemaining,
  getStatusActionSuggestion,
  // Constants
  EVM_CONFIRMATION_TARGETS,
  DEFAULT_EVM_CONFIRMATIONS,
  STUCK_THRESHOLD_MS,
  SOLANA_COMMITMENT_ORDER,
} from './txStatus';

