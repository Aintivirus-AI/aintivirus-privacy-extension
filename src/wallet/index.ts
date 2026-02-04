// Wallet module message router handling Solana/EVM actions, storage, and swaps.
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
  ChainType,
  EVMChainId,
  EVMBalance,
  EVMTokenBalance,
  EVMFeeEstimate,
  EVMTransactionResult,
  EVMHistoryItemResponse,
  EVMSendParams,
  EVMTokenSendParams,
  EVMPendingTxInfo,
  EVMGasPresets,
  EVMReplacementFeeEstimate,
  BTCTransactionResult,
  BTCFeeEstimate,
  TRXTransactionResult,
  TRXFeeEstimate,
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
  getUnlockedMnemonic,
  getUnlockedBitcoinWIF,
  getEVMAddress,
  isWalletUnlocked,
  getPublicAddress,
  getWalletSettings,
  saveWalletSettings,
  resetAutoLockTimer,
  listWallets,
  addWallet,
  importAdditionalWallet,
  switchWallet,
  renameWallet,
  deleteOneWallet,
  exportWalletMnemonic,
  getActiveWallet,
  importWalletFromPrivateKey,
  exportPrivateKey,
} from './storage';

import {
  getEVMAdapter,
  getEVMChainConfig,
  getEVMExplorerUrl,
  getNumericChainId,
  parseAmount,
  formatAmount,
  getAdapterForChain,
} from './chains';
import { getChain, isEVMChain } from './chains/registry';

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
  createContractCall,
  type UnsignedEVMTransaction,
} from './chains/evm/transactions';
import { withFailover } from './chains/evm/client';
import {
  getBalance,
  getBalanceWithRetry,
  clearBalanceCache,
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

import { sendSol, sendSPLToken, processStorePayment, estimateTransactionFee } from './transactions';
import { getTransactionHistory, clearHistoryCache } from './history';
import {
  getTokenBalances,
  addCustomToken,
  removeCustomToken,
  fetchPopularTokens,
  fetchJupiterTokenMetadata,
  clearTokenCache,
  type PopularToken,
} from './tokens';

// Jupiter Swap imports (Solana)
import {
  getFormattedSwapQuote,
  performSwap,
  isSwapAvailable,
  getReferralStatus,
  type SwapQuote,
} from './jupiterSwap';

// Swap Token Discovery imports (for background-routed token fetching)
import {
  getPopularTokens,
  searchSwapTokens,
  fetchSolanaTokenByAddress,
} from './swapTokens';

// EVM Swap imports (ParaSwap - no API key required)
import {
  getFormattedEVMSwapQuote,
  performEVMSwap,
  isEVMSwapAvailable,
  type EVMSwapQuote,
} from './evmSwap';

import { balanceDedup } from './requestDedup';

// Balance deduplication keeps us from hammering the same RPC endpoint during
// rapid UI refreshes, while the handler below (and the RPC health helpers) keep
// the wallet responsive across Solana, EVM, and swap flows.
import {
  getRpcHealthSummary,
  addCustomRpcUrl,
  removeCustomRpcUrl,
  testRpcEndpoint,
  initializeRpcHealth,
} from './rpcHealth';

// Core RPC router that receives `WalletMessageType` commands from the UI,
// resets the auto-lock timer, and delegates to the specific helper below.
export async function handleWalletMessage(
  type: WalletMessageType,
  payload: unknown,
): Promise<unknown> {
  if (isWalletUnlocked()) {
    await resetAutoLockTimer();
  }

  switch (type) {
    // Account lifecycle controls: creation, import, unlocking, locking, deletion.

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

    // Helpers that enumerate or mutate the stored wallet entries visible in the UI.
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

    // Balance inquiries, send requests, and fee estimation for tokens/transactions.
    case 'WALLET_GET_BALANCE':
      return handleGetBalance(payload as { forceRefresh?: boolean } | undefined);

    case 'WALLET_GET_ADDRESS':
      return handleGetAddress();

    case 'WALLET_GET_ADDRESS_QR':
      return handleGetAddressQR(payload as WalletMessagePayloads['WALLET_GET_ADDRESS_QR']);

    case 'WALLET_SET_NETWORK':
      await handleSetNetwork(payload as WalletMessagePayloads['WALLET_SET_NETWORK']);
      return undefined;

    case 'WALLET_GET_NETWORK':
      return handleGetNetwork();

    case 'WALLET_GET_NETWORK_STATUS':
      return handleGetNetworkStatus();

    case 'WALLET_SIGN_TRANSACTION':
      return handleSignTransaction(payload as WalletMessagePayloads['WALLET_SIGN_TRANSACTION']);

    case 'WALLET_SIGN_MESSAGE':
      return handleSignMessage(payload as WalletMessagePayloads['WALLET_SIGN_MESSAGE']);

    case 'WALLET_GET_SETTINGS':
      return await getWalletSettings();

    case 'WALLET_SET_SETTINGS':
      await saveWalletSettings(payload as WalletMessagePayloads['WALLET_SET_SETTINGS']);
      return undefined;

    case 'WALLET_SEND_SOL':
      return handleSendSol(payload as WalletMessagePayloads['WALLET_SEND_SOL']);

    case 'WALLET_SEND_SPL_TOKEN':
      return handleSendSPLToken(payload as WalletMessagePayloads['WALLET_SEND_SPL_TOKEN']);

    case 'WALLET_PROCESS_STORE_PAYMENT':
      return handleProcessStorePayment(payload as WalletMessagePayloads['WALLET_PROCESS_STORE_PAYMENT']);

    case 'WALLET_ESTIMATE_FEE':
      return handleEstimateFee(payload as WalletMessagePayloads['WALLET_ESTIMATE_FEE']);

    case 'WALLET_GET_HISTORY':
      return handleGetHistory(payload as WalletMessagePayloads['WALLET_GET_HISTORY']);

    case 'WALLET_GET_TOKENS':
      return handleGetTokens(payload as { forceRefresh?: boolean } | undefined);

    case 'WALLET_ADD_TOKEN':
      return handleAddToken(payload as WalletMessagePayloads['WALLET_ADD_TOKEN']);

    case 'WALLET_REMOVE_TOKEN':
      return handleRemoveToken(payload as WalletMessagePayloads['WALLET_REMOVE_TOKEN']);

    case 'WALLET_GET_POPULAR_TOKENS':
      return handleGetPopularTokens(payload as WalletMessagePayloads['WALLET_GET_POPULAR_TOKENS']);

    case 'WALLET_GET_TOKEN_METADATA':
      return handleGetTokenMetadata(payload as WalletMessagePayloads['WALLET_GET_TOKEN_METADATA']);

    case 'WALLET_GET_RPC_HEALTH':
      return handleGetRpcHealth();

    case 'WALLET_ADD_RPC':
      return handleAddRpc(payload as WalletMessagePayloads['WALLET_ADD_RPC']);

    case 'WALLET_REMOVE_RPC':
      return handleRemoveRpc(payload as WalletMessagePayloads['WALLET_REMOVE_RPC']);

    case 'WALLET_TEST_RPC':
      return handleTestRpc(payload as WalletMessagePayloads['WALLET_TEST_RPC']);

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

    // Bitcoin-family chains
    case 'WALLET_SEND_BTC':
      return handleSendBTC(payload as WalletMessagePayloads['WALLET_SEND_BTC']);

    case 'WALLET_ESTIMATE_BTC_FEE':
      return handleEstimateBTCFee(payload as WalletMessagePayloads['WALLET_ESTIMATE_BTC_FEE']);

    // TRON
    case 'WALLET_SEND_TRX':
      return handleSendTRX(payload as WalletMessagePayloads['WALLET_SEND_TRX']);

    case 'WALLET_ESTIMATE_TRX_FEE':
      return handleEstimateTRXFee(payload as WalletMessagePayloads['WALLET_ESTIMATE_TRX_FEE']);

    case 'WALLET_GET_EVM_TOKENS':
      return handleGetEVMTokens(payload as WalletMessagePayloads['WALLET_GET_EVM_TOKENS']);

    case 'WALLET_GET_EVM_HISTORY':
      return handleGetEVMHistory(payload as WalletMessagePayloads['WALLET_GET_EVM_HISTORY']);

    case 'WALLET_ESTIMATE_EVM_FEE':
      return handleEstimateEVMFee(payload as WalletMessagePayloads['WALLET_ESTIMATE_EVM_FEE']);

    case 'WALLET_GET_EVM_ADDRESS':
      return handleGetEVMAddress();

    case 'WALLET_GET_CHAIN_ADDRESS':
      return handleGetChainAddress(payload as WalletMessagePayloads['WALLET_GET_CHAIN_ADDRESS']);

    case 'EVM_GET_PENDING_TXS':
      return handleGetPendingTxs(payload as WalletMessagePayloads['EVM_GET_PENDING_TXS']);

    case 'EVM_SPEED_UP_TX':
      return handleSpeedUpTx(payload as WalletMessagePayloads['EVM_SPEED_UP_TX']);

    case 'EVM_CANCEL_TX':
      return handleCancelTx(payload as WalletMessagePayloads['EVM_CANCEL_TX']);

    case 'EVM_GET_GAS_PRESETS':
      return handleGetGasPresets(payload as WalletMessagePayloads['EVM_GET_GAS_PRESETS']);

    case 'EVM_ESTIMATE_REPLACEMENT_FEE':
      return handleEstimateReplacementFee(
        payload as WalletMessagePayloads['EVM_ESTIMATE_REPLACEMENT_FEE'],
      );

    // Jupiter Swap
    case 'WALLET_SWAP_QUOTE':
      return handleSwapQuote(payload as WalletMessagePayloads['WALLET_SWAP_QUOTE']);

    case 'WALLET_SWAP_EXECUTE':
      return handleSwapExecute(payload as WalletMessagePayloads['WALLET_SWAP_EXECUTE']);

    case 'WALLET_SWAP_AVAILABLE':
      return handleSwapAvailable();

    case 'WALLET_SWAP_REFERRAL_STATUS':
      return handleSwapReferralStatus();

    // EVM Swap (ParaSwap)
    case 'EVM_SWAP_QUOTE':
      return handleEVMSwapQuote(payload as WalletMessagePayloads['EVM_SWAP_QUOTE']);

    case 'EVM_SWAP_EXECUTE':
      return handleEVMSwapExecute(payload as WalletMessagePayloads['EVM_SWAP_EXECUTE']);

    case 'EVM_SWAP_AVAILABLE':
      return handleEVMSwapAvailable(payload as WalletMessagePayloads['EVM_SWAP_AVAILABLE']);

    case 'EVM_RPC_REQUEST':
      return handleEVMRpcRequest(payload as WalletMessagePayloads['EVM_RPC_REQUEST']);

    // Swap Token Discovery (routes through background for CORS)
    case 'SWAP_GET_POPULAR_TOKENS':
      return handleSwapGetPopularTokens(payload as WalletMessagePayloads['SWAP_GET_POPULAR_TOKENS']);

    case 'SWAP_SEARCH_TOKENS':
      return handleSwapSearchTokens(payload as WalletMessagePayloads['SWAP_SEARCH_TOKENS']);

    case 'SWAP_GET_TOKEN_BY_ADDRESS':
      return handleSwapGetTokenByAddress(
        payload as WalletMessagePayloads['SWAP_GET_TOKEN_BY_ADDRESS'],
      );

    default:
      throw new WalletError(WalletErrorCode.NETWORK_ERROR, `Unknown wallet message type: ${type}`);
  }
}

async function handleCreateWallet(
  payload: WalletMessagePayloads['WALLET_CREATE'],
): Promise<WalletMessageResponses['WALLET_CREATE']> {
  const { password } = payload;

  if (!password) {
    throw new WalletError(WalletErrorCode.INVALID_PASSWORD, 'Password is required');
  }

  const result = await createWallet(password);

  return result;
}

async function handleImportWallet(
  payload: WalletMessagePayloads['WALLET_IMPORT'],
): Promise<WalletMessageResponses['WALLET_IMPORT']> {
  const { mnemonic, password } = payload;

  if (!mnemonic) {
    throw new WalletError(WalletErrorCode.INVALID_MNEMONIC, 'Mnemonic is required');
  }

  if (!password) {
    throw new WalletError(WalletErrorCode.INVALID_PASSWORD, 'Password is required');
  }

  const result = await importWallet(mnemonic, password);

  return result;
}

async function handleUnlockWallet(
  payload: WalletMessagePayloads['WALLET_UNLOCK'],
): Promise<WalletMessageResponses['WALLET_UNLOCK']> {
  const { password } = payload;

  if (!password) {
    throw new WalletError(WalletErrorCode.INVALID_PASSWORD, 'Password is required');
  }

  const result = await unlockWallet(password);

  return result;
}

function handleLockWallet(): void {
  lockWallet();
}

async function handleDeleteWallet(payload: WalletMessagePayloads['WALLET_DELETE']): Promise<void> {
  const { password } = payload;

  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to delete wallet',
    );
  }

  await deleteWallet(password);
}

async function handleListWallets(): Promise<WalletEntry[]> {
  return await listWallets();
}

async function handleAddWallet(
  payload: WalletMessagePayloads['WALLET_ADD'],
): Promise<WalletMessageResponses['WALLET_ADD']> {
  const { password, label } = payload;

  const result = await addWallet(password, label);

  return result;
}

async function handleImportAddWallet(
  payload: WalletMessagePayloads['WALLET_IMPORT_ADD'],
): Promise<WalletMessageResponses['WALLET_IMPORT_ADD']> {
  const { mnemonic, password, label } = payload;

  if (!mnemonic) {
    throw new WalletError(WalletErrorCode.INVALID_MNEMONIC, 'Mnemonic is required');
  }

  const result = await importAdditionalWallet(mnemonic, password, label);

  return result;
}

async function handleSwitchWallet(
  payload: WalletMessagePayloads['WALLET_SWITCH'],
): Promise<WalletMessageResponses['WALLET_SWITCH']> {
  const { walletId, password } = payload;

  if (!walletId) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_FOUND, 'Wallet ID is required');
  }

  const result = await switchWallet(walletId, password);

  return result;
}

async function handleRenameWallet(payload: WalletMessagePayloads['WALLET_RENAME']): Promise<void> {
  const { walletId, label } = payload;

  if (!walletId) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_FOUND, 'Wallet ID is required');
  }

  if (!label) {
    throw new WalletError(WalletErrorCode.INVALID_WALLET_LABEL, 'New label is required');
  }

  await renameWallet(walletId, label);
}

async function handleDeleteOneWallet(
  payload: WalletMessagePayloads['WALLET_DELETE_ONE'],
): Promise<void> {
  const { walletId, password } = payload;

  if (!walletId) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_FOUND, 'Wallet ID is required');
  }

  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to delete wallet',
    );
  }

  await deleteOneWallet(walletId, password);
}

async function handleExportWallet(
  payload: WalletMessagePayloads['WALLET_EXPORT_ONE'],
): Promise<WalletMessageResponses['WALLET_EXPORT_ONE']> {
  const { walletId, password } = payload;

  if (!walletId) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_FOUND, 'Wallet ID is required');
  }

  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to export wallet',
    );
  }

  const result = await exportWalletMnemonic(walletId, password);

  return result;
}

async function handleImportPrivateKey(
  payload: WalletMessagePayloads['WALLET_IMPORT_PRIVATE_KEY'],
): Promise<WalletMessageResponses['WALLET_IMPORT_PRIVATE_KEY']> {
  const { privateKey, password, label } = payload;

  if (!privateKey) {
    throw new WalletError(WalletErrorCode.INVALID_MNEMONIC, 'Private key is required');
  }

  const result = await importWalletFromPrivateKey(privateKey, password, label);

  return result;
}

async function handleExportPrivateKey(
  payload: WalletMessagePayloads['WALLET_EXPORT_PRIVATE_KEY'],
): Promise<WalletMessageResponses['WALLET_EXPORT_PRIVATE_KEY']> {
  const { walletId, password, chain } = payload;

  if (!walletId) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_FOUND, 'Wallet ID is required');
  }

  if (!password) {
    throw new WalletError(
      WalletErrorCode.INVALID_PASSWORD,
      'Password is required to export private key',
    );
  }

  if (!chain || (chain !== 'solana' && chain !== 'evm' && chain !== 'bitcoin')) {
    throw new WalletError(WalletErrorCode.INVALID_MNEMONIC, 'Chain type must be "solana", "evm", or "bitcoin"');
  }

  const result = await exportPrivateKey(walletId, password, chain);

  return result;
}

async function handleGetActiveWallet(): Promise<WalletMessageResponses['WALLET_GET_ACTIVE']> {
  return await getActiveWallet();
}

async function handleGetBalance(payload?: { forceRefresh?: boolean }): Promise<WalletBalance> {
  const address = await getPublicAddress();

  if (!address) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_INITIALIZED, 'No wallet found');
  }

  // Check if this is a non-Solana wallet (Bitcoin or EVM-only)
  // These addresses are prefixed with 'btc:' or 'evm:'
  if (address.startsWith('btc:') || address.startsWith('evm:')) {
    // Return zero balance for non-Solana wallets
    // The UI should use WALLET_GET_EVM_BALANCE for these chains
    return {
      lamports: 0,
      sol: 0,
      lastUpdated: Date.now(),
    };
  }

  const forceRefresh = payload?.forceRefresh ?? false;

  if (forceRefresh) {
    clearBalanceCache();
    balanceDedup.invalidate(/^balance:solana:/);
  }

  return await getBalanceWithRetry(address);
}

async function handleGetAddress(): Promise<string> {
  const address = await getPublicAddress();

  if (!address) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_INITIALIZED, 'No wallet found');
  }

  return address;
}

async function handleGetAddressQR(
  payload: WalletMessagePayloads['WALLET_GET_ADDRESS_QR'],
): Promise<string> {
  const address = await getPublicAddress();

  if (!address) {
    throw new WalletError(WalletErrorCode.WALLET_NOT_INITIALIZED, 'No wallet found');
  }

  return await generateAddressQR(address, { size: payload?.size });
}

async function handleSetNetwork(
  payload: WalletMessagePayloads['WALLET_SET_NETWORK'],
): Promise<void> {
  await setNetwork(payload.network);
}

async function handleGetNetwork(): Promise<SolanaNetwork> {
  const config = await getCurrentNetwork();
  return config.name;
}

async function handleGetNetworkStatus(): Promise<{ connected: boolean; latency: number }> {
  const status = await getNetworkStatus();
  return {
    connected: status.connected,
    latency: status.latency,
  };
}

async function handleSignTransaction(
  payload: WalletMessagePayloads['WALLET_SIGN_TRANSACTION'],
): Promise<SignedTransaction> {
  const keypair = getUnlockedKeypair();

  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to sign transactions.',
    );
  }

  try {
    const transaction = deserializeTransaction(payload.serializedTransaction);

    if (transaction instanceof VersionedTransaction) {
      transaction.sign([keypair]);

      const signature = bs58.encode(transaction.signatures[0]);

      return {
        signedTransaction: serializeTransaction(transaction),
        signature,
      };
    } else {
      const { blockhash } = await getRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      transaction.sign(keypair);

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
      `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

async function handleSignMessage(
  payload: WalletMessagePayloads['WALLET_SIGN_MESSAGE'],
): Promise<{ signature: string }> {
  const keypair = getUnlockedKeypair();

  if (!keypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to sign messages.',
    );
  }

  try {
    const messageBytes = new TextEncoder().encode(payload.message);

    const nacl = await import('tweetnacl');
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

    return {
      signature: bs58.encode(signature),
    };
  } catch (error) {
    throw new WalletError(WalletErrorCode.SIGNING_FAILED, 'Failed to sign message');
  }
}

async function handleSendSol(
  payload: WalletMessagePayloads['WALLET_SEND_SOL'],
): Promise<SendTransactionResult> {
  const { recipient, amountSol, memo } = payload;

  if (!recipient) {
    throw new WalletError(WalletErrorCode.INVALID_RECIPIENT, 'Recipient address is required');
  }

  if (!amountSol || amountSol <= 0) {
    throw new WalletError(WalletErrorCode.INVALID_AMOUNT, 'Amount must be greater than 0');
  }

  const result = await sendSol({ recipient, amountSol, memo });

  clearHistoryCache();
  clearTokenCache();

  balanceDedup.invalidate(/^balance:solana:/);

  return result;
}

async function handleSendSPLToken(
  payload: WalletMessagePayloads['WALLET_SEND_SPL_TOKEN'],
): Promise<SendTransactionResult> {
  const { recipient, amount, mint, decimals, tokenAccount } = payload;

  if (!recipient) {
    throw new WalletError(WalletErrorCode.INVALID_RECIPIENT, 'Recipient address is required');
  }

  if (!amount || amount <= 0) {
    throw new WalletError(WalletErrorCode.INVALID_AMOUNT, 'Amount must be greater than 0');
  }

  if (!mint) {
    throw new WalletError(WalletErrorCode.TOKEN_NOT_FOUND, 'Token mint address is required');
  }

  const result = await sendSPLToken({ recipient, amount, mint, decimals, tokenAccount });

  clearHistoryCache();
  clearTokenCache();

  balanceDedup.invalidate(/^balance:solana:/);

  return result;
}

/**
 * Handle store payment through the AINTI Payment Program
 * This creates an on-chain PaymentRecord for order verification
 */
async function handleProcessStorePayment(
  payload: WalletMessagePayloads['WALLET_PROCESS_STORE_PAYMENT'],
): Promise<SendTransactionResult> {
  const { orderId, amount } = payload;

  if (!orderId) {
    throw new WalletError(WalletErrorCode.INVALID_AMOUNT, 'Order ID is required');
  }

  if (!amount || amount <= 0) {
    throw new WalletError(WalletErrorCode.INVALID_AMOUNT, 'Amount must be greater than 0');
  }

  const result = await processStorePayment({ orderId, amount });

  // Clear caches since balance changed
  clearHistoryCache();
  clearTokenCache();
  balanceDedup.invalidate(/^balance:solana:/);

  return result;
}

async function handleEstimateFee(
  payload: WalletMessagePayloads['WALLET_ESTIMATE_FEE'],
): Promise<FeeEstimate> {
  const { recipient, amountSol } = payload;

  if (!recipient) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      'Recipient address is required for fee estimation',
    );
  }

  return await estimateTransactionFee(recipient, amountSol);
}

async function handleGetHistory(
  payload: WalletMessagePayloads['WALLET_GET_HISTORY'],
): Promise<TransactionHistoryResult> {
  const { limit, before, forceRefresh } = payload || {};
  return await getTransactionHistory({ limit, before, forceRefresh });
}

async function handleGetTokens(payload?: { forceRefresh?: boolean }): Promise<SPLTokenBalance[]> {
  const forceRefresh = payload?.forceRefresh ?? false;

  if (forceRefresh) {
    clearTokenCache();
  }

  return await getTokenBalances(forceRefresh);
}

async function handleAddToken(payload: WalletMessagePayloads['WALLET_ADD_TOKEN']): Promise<void> {
  const { mint, symbol, name, logoUri } = payload;

  if (!mint) {
    throw new WalletError(WalletErrorCode.TOKEN_NOT_FOUND, 'Token mint address is required');
  }

  await addCustomToken(mint, symbol, name, logoUri);
}

async function handleRemoveToken(
  payload: WalletMessagePayloads['WALLET_REMOVE_TOKEN'],
): Promise<void> {
  const { mint } = payload;

  if (!mint) {
    throw new WalletError(WalletErrorCode.TOKEN_NOT_FOUND, 'Token mint address is required');
  }

  await removeCustomToken(mint);
}

async function handleGetPopularTokens(
  payload?: WalletMessagePayloads['WALLET_GET_POPULAR_TOKENS'],
): Promise<PopularToken[]> {
  const chainType = payload?.chainType || 'solana';
  return await fetchPopularTokens(chainType);
}

async function handleGetTokenMetadata(
  payload: WalletMessagePayloads['WALLET_GET_TOKEN_METADATA'],
): Promise<{ symbol: string; name: string; logoUri?: string } | null> {
  const { mint } = payload;

  if (!mint) {
    return null;
  }

  const isEVMAddress = mint.startsWith('0x') && mint.length === 42;

  if (isEVMAddress) {
    try {
      const settings = await getWalletSettings();
      const chainId = settings.activeEVMChain || 'ethereum';
      const testnet = settings.networkEnvironment === 'testnet';

      const { getTokenMetadata: getEVMTokenMetadata } = await import('./chains/evm/tokens');
      const { getAddress } = await import('ethers');
      const metadata = await getEVMTokenMetadata(chainId, testnet, mint);

      if (metadata) {
        const chainSlug = chainId === 'ethereum' ? 'ethereum' : chainId;
        // TrustWallet requires checksummed addresses
        let checksumAddress: string;
        try {
          checksumAddress = getAddress(mint);
        } catch {
          checksumAddress = mint;
        }
        // Use jsDelivr CDN for better reliability
        const logoUri = `https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/${chainSlug}/assets/${checksumAddress}/logo.png`;

        return {
          symbol: metadata.symbol,
          name: metadata.name,
          logoUri: logoUri,
        };
      }
    } catch {
      // Token metadata lookup is non-critical; fall through to other sources
    }
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

async function handleGetRpcHealth(): Promise<WalletMessageResponses['WALLET_GET_RPC_HEALTH']> {
  const settings = await getWalletSettings();
  return await getRpcHealthSummary(settings.network);
}

async function handleAddRpc(
  payload: WalletMessagePayloads['WALLET_ADD_RPC'],
): Promise<WalletMessageResponses['WALLET_ADD_RPC']> {
  const { network, url } = payload;

  if (!url) {
    return { success: false, error: 'RPC URL is required' };
  }

  const result = await addCustomRpcUrl(network, url);

  return result;
}

async function handleRemoveRpc(payload: WalletMessagePayloads['WALLET_REMOVE_RPC']): Promise<void> {
  const { network, url } = payload;

  if (!url) {
    throw new WalletError(WalletErrorCode.NETWORK_ERROR, 'RPC URL is required');
  }

  await removeCustomRpcUrl(network, url);
}

async function handleTestRpc(
  payload: WalletMessagePayloads['WALLET_TEST_RPC'],
): Promise<WalletMessageResponses['WALLET_TEST_RPC']> {
  const { url } = payload;

  if (!url) {
    return { success: false, error: 'RPC URL is required' };
  }

  return await testRpcEndpoint(url);
}

async function handleSetChain(payload: WalletMessagePayloads['WALLET_SET_CHAIN']): Promise<void> {
  const { chain, evmChainId, chainId } = payload;

  await saveWalletSettings({
    activeChain: chain,
    activeEVMChain: evmChainId,
    activeChainId: chainId,
  });
}

async function handleSetEVMChain(
  payload: WalletMessagePayloads['WALLET_SET_EVM_CHAIN'],
): Promise<void> {
  const { evmChainId } = payload;

  await saveWalletSettings({
    activeChain: 'evm',
    activeEVMChain: evmChainId,
  });
}

async function handleGetEVMBalance(
  payload: WalletMessagePayloads['WALLET_GET_EVM_BALANCE'],
): Promise<EVMBalance> {
  const settings = await getWalletSettings();
  const chainId = payload?.evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  const network = testnet ? 'testnet' : 'mainnet';
  
  // Check if this is actually an EVM chain or a different chain family
  const chainConfig = getChain(chainId);
  
  if (chainConfig && !isEVMChain(chainId)) {
    // Non-EVM chain (Bitcoin, TRON, Monero, etc.) - use the appropriate adapter
    try {
      const adapter = getAdapterForChain(chainId, network);
      
      // Try to get address from mnemonic first, then fall back to stored address for private key imports
      const mnemonic = getUnlockedMnemonic();
      let address: string;
      
      if (mnemonic) {
        // Mnemonic wallet - derive address
        address = await adapter.deriveAddress(mnemonic, 0);
      } else {
        // Private key import - get address from stored wallet data
        const publicAddress = await getPublicAddress();
        if (!publicAddress) {
          return {
            wei: '0',
            formatted: 0,
            symbol: chainConfig.symbol,
            lastUpdated: Date.now(),
          };
        }
        
        // Check if the stored address matches the chain we're querying
        // Bitcoin addresses are stored as btc:address, check chain family
        const chainFamily = chainConfig.family;
        const addressPrefix = publicAddress.split(':')[0];
        const rawAddress = publicAddress.includes(':') ? publicAddress.split(':')[1] : publicAddress;
        
        // For Bitcoin-family chains, verify the prefix matches
        if (chainFamily === 'bitcoin' && addressPrefix === 'btc') {
          address = rawAddress;
        } else if (chainFamily === 'tron' && addressPrefix === 'tron') {
          address = rawAddress;
        } else {
          // Chain doesn't match stored address type
          return {
            wei: '0',
            formatted: 0,
            symbol: chainConfig.symbol,
            lastUpdated: Date.now(),
          };
        }
      }
      
      const balance = await adapter.getBalance(address);
      
      return {
        wei: balance.raw.toString(),
        formatted: balance.formatted,
        symbol: balance.symbol,
        lastUpdated: balance.lastUpdated,
      };
    } catch (error) {
      // Always log balance fetch errors for debugging
      console.warn(`[Wallet] Failed to get balance for ${chainId}:`, error instanceof Error ? error.message : String(error));
      return {
        wei: '0',
        formatted: 0,
        symbol: chainConfig?.symbol || 'UNKNOWN',
        lastUpdated: Date.now(),
      };
    }
  }
  
  // Standard EVM chain handling - chainId is verified as EVM at this point
  const evmChainId = chainId as EVMChainId;
  const evmAddress = getEVMAddress();

  if (!evmAddress) {
    // Use chain-specific symbol from the config
    const evmChainConfig = getEVMChainConfig(evmChainId);
    return {
      wei: '0',
      formatted: 0,
      symbol: evmChainConfig.symbol,
      lastUpdated: Date.now(),
    };
  }

  const adapter = getEVMAdapter(evmChainId, network);
  const balance = await adapter.getBalance(evmAddress);

  return {
    wei: balance.raw.toString(),
    formatted: balance.formatted,
    symbol: balance.symbol,
    lastUpdated: balance.lastUpdated,
  };
}

async function handleSendETH(
  payload: WalletMessagePayloads['WALLET_SEND_ETH'],
): Promise<EVMTransactionResult> {
  const {
    recipient,
    amount,
    evmChainId,
    data,
    valueHex,
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } = payload;

  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.',
    );
  }

  const settings = await getWalletSettings();
  const chainId = evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  const config = getEVMChainConfig(chainId);
  const numericChainId = getNumericChainId(chainId, testnet);

  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');

  // For contract calls, use valueHex if available (preserves precision)
  // Otherwise fall back to parsing the decimal amount
  const amountWei =
    valueHex && data && data !== '0x' ? BigInt(valueHex) : parseAmount(amount, config.decimals);

  let unsignedTx;
  let txData = data || '0x';

  // Helper to safely parse hex values to BigInt
  const parseHexToBigInt = (hex: string | undefined): bigint | undefined => {
    if (!hex) return undefined;
    try {
      return BigInt(hex.startsWith('0x') ? hex : `0x${hex}`);
    } catch {
      return undefined;
    }
  };

  // If data is provided, this is a contract call (e.g., Uniswap swap)
  if (data && data !== '0x') {
    unsignedTx = await createContractCall(chainId, testnet, {
      from: evmKeypair.address,
      to: recipient,
      value: amountWei,
      data: data,
      gasLimit: parseHexToBigInt(gas),
      gasPrice: parseHexToBigInt(gasPrice),
      maxFeePerGas: parseHexToBigInt(maxFeePerGas),
      maxPriorityFeePerGas: parseHexToBigInt(maxPriorityFeePerGas),
    });

    // Sign and broadcast directly for contract calls
    const signedTx = signEVMTransaction(unsignedTx, evmKeypair, numericChainId);
    const txResponse = await broadcastTransaction(chainId, testnet, signedTx);

    const explorerBase = getEVMExplorerUrl(chainId, testnet);

    // Track pending transaction
    try {
      await addPendingTx(
        createPendingTxRecord({
          hash: txResponse.hash,
          nonce: unsignedTx.nonce,
          chainId: chainId,
          from: evmKeypair.address,
          to: recipient,
          value: amountWei,
          data: txData,
          gasLimit: unsignedTx.gasLimit,
          maxFeePerGas: unsignedTx.maxFeePerGas || unsignedTx.gasPrice || 0n,
          maxPriorityFeePerGas: unsignedTx.maxPriorityFeePerGas || 0n,
          testnet: testnet,
        }),
      );
    } catch {
      // Pending tx tracking is non-critical; transaction was still successful
    }

    return {
      hash: txResponse.hash,
      explorerUrl: `${explorerBase}/tx/${txResponse.hash}`,
      confirmed: false,
      error: undefined,
    };
  }

  // Simple ETH transfer (no data)
  const createdTx = await adapter.createTransfer(evmKeypair.address, recipient, amountWei);
  const signedTx = await adapter.signTransaction(createdTx, {
    chainType: 'evm',
    address: evmKeypair.address,
    privateKey: evmKeypair.privateKey,
    _raw: evmKeypair,
  });

  const result = await adapter.broadcastTransaction(signedTx);

  if (!result.confirmed && !result.error) {
    try {
      const rawTx = createdTx._raw as UnsignedEVMTransaction | undefined;
      if (rawTx) {
        await addPendingTx(
          createPendingTxRecord({
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
          }),
        );
      }
    } catch {
      // Pending tx tracking is non-critical; transaction was still successful
    }
  }

  return {
    hash: result.hash,
    explorerUrl: result.explorerUrl,
    confirmed: result.confirmed,
    error: result.error,
  };
}

async function handleSendERC20(
  payload: WalletMessagePayloads['WALLET_SEND_ERC20'],
): Promise<EVMTransactionResult> {
  const { recipient, tokenAddress, amount, decimals, evmChainId } = payload;

  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.',
    );
  }

  const settings = await getWalletSettings();
  const chainId = evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';

  const adapter = getEVMAdapter(chainId, testnet ? 'testnet' : 'mainnet');

  const amountSmallest = parseAmount(amount, decimals);

  const unsignedTx = await adapter.createTokenTransfer(
    evmKeypair.address,
    recipient,
    tokenAddress,
    amountSmallest,
  );
  const signedTx = await adapter.signTransaction(unsignedTx, {
    chainType: 'evm',
    address: evmKeypair.address,
    privateKey: evmKeypair.privateKey,
    _raw: evmKeypair,
  });

  const result = await adapter.broadcastTransaction(signedTx);

  if (!result.confirmed && !result.error) {
    try {
      const rawTx = unsignedTx._raw as UnsignedEVMTransaction | undefined;
      if (rawTx) {
        await addPendingTx(
          createPendingTxRecord({
            hash: result.hash,
            nonce: rawTx.nonce,
            chainId: chainId,
            from: evmKeypair.address,
            to: tokenAddress,
            value: 0n,
            data: rawTx.data,
            gasLimit: rawTx.gasLimit,
            maxFeePerGas: rawTx.maxFeePerGas || rawTx.gasPrice || 0n,
            maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas || 0n,
            testnet: testnet,
          }),
        );
      }
    } catch {
      // Pending tx tracking is non-critical; transaction was still successful
    }
  }

  return {
    hash: result.hash,
    explorerUrl: result.explorerUrl,
    confirmed: result.confirmed,
    error: result.error,
  };
}

async function handleGetEVMTokens(
  payload: WalletMessagePayloads['WALLET_GET_EVM_TOKENS'],
): Promise<EVMTokenBalance[]> {
  const { invalidateSettingsCache } = await import('./storage');
  invalidateSettingsCache();

  const settings = await getWalletSettings();
  const chainId = payload?.evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  const network = testnet ? 'testnet' : 'mainnet';

  // Check if this is actually an EVM chain
  const chainConfig = getChain(chainId);
  if (chainConfig && !isEVMChain(chainId)) {
    // Non-EVM chains: try to get token balances using the chain's adapter
    try {
      const adapter = getAdapterForChain(chainId, network);
      
      // Get the mnemonic to derive address for this chain
      const mnemonic = getUnlockedMnemonic();
      if (!mnemonic) {
        return [];
      }
      
      const address = await adapter.deriveAddress(mnemonic, 0);
      const tokens = await adapter.getTokenBalances(address);
      
      // Map to EVMTokenBalance format for UI compatibility
      return tokens.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name || t.symbol,
        decimals: t.decimals,
        rawBalance: t.rawBalance,
        uiBalance: t.uiBalance,
        logoUri: t.logoUri,
        isCustom: false,
      }));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Failed to get tokens for ${chainId}:`, error);
      }
      return [];
    }
  }

  // Standard EVM chain handling - chainId is verified as EVM at this point
  const evmChainId = chainId as EVMChainId;
  const evmAddress = getEVMAddress();

  if (!evmAddress) {
    return [];
  }

  const adapter = getEVMAdapter(evmChainId, network);

  const customTokens = settings.customTokens || [];
  const hiddenTokens = new Set((settings.hiddenTokens || []).map((t) => t.toLowerCase()));
  const customTokenMints = new Set(
    customTokens.filter((t) => t.mint.startsWith('0x')).map((t) => t.mint.toLowerCase()),
  );
  const customTokenMap = new Map<string, { symbol?: string; name?: string; logoUri?: string }>();

  for (const token of customTokens) {
    if (token.mint.startsWith('0x')) {
      // Pass pre-known metadata to skip slow RPC calls (like Solana does)
      adapter.addCustomToken(token.mint, {
        symbol: token.symbol,
        name: token.name,
        logoUri: token.logoUri,
      });
      customTokenMap.set(token.mint.toLowerCase(), {
        symbol: token.symbol,
        name: token.name,
        logoUri: token.logoUri,
      });
    }
  }

  const tokens = await adapter.getTokenBalances(evmAddress);

  const tokensToUnhide = new Set<string>();
  for (const token of tokens) {
    const normalizedAddress = token.address.toLowerCase();

    if (
      hiddenTokens.has(normalizedAddress) &&
      !customTokenMints.has(normalizedAddress) &&
      token.uiBalance > 0
    ) {
      tokensToUnhide.add(normalizedAddress);
      hiddenTokens.delete(normalizedAddress);
    }
  }

  if (tokensToUnhide.size > 0) {
    const newHiddenTokens = Array.from(hiddenTokens);
    const { saveWalletSettings } = await import('./storage');
    await saveWalletSettings({ hiddenTokens: newHiddenTokens });
  }

  // Map tokens (no spam filtering)
  const mappedTokens: EVMTokenBalance[] = tokens
    .filter(
      (t) =>
        !hiddenTokens.has(t.address.toLowerCase()) || customTokenMints.has(t.address.toLowerCase()),
    )
    .map((t) => {
      const normalizedAddress = t.address.toLowerCase();
      const customMeta = customTokenMap.get(normalizedAddress);
      const isCustom = customTokenMints.has(normalizedAddress);

      return {
        address: t.address,
        symbol: customMeta?.symbol || t.symbol,
        name: customMeta?.name || t.name,
        decimals: t.decimals,
        rawBalance: t.rawBalance,
        uiBalance: t.uiBalance,
        logoUri: customMeta?.logoUri || t.logoUri,
        isCustom,
      };
    });

  // Sort by balance (highest first)
  mappedTokens.sort((a, b) => {
    if (a.uiBalance > 0 && b.uiBalance === 0) return -1;
    if (a.uiBalance === 0 && b.uiBalance > 0) return 1;
    return b.uiBalance - a.uiBalance;
  });

  return mappedTokens;
}

async function handleGetEVMHistory(
  payload: WalletMessagePayloads['WALLET_GET_EVM_HISTORY'],
): Promise<{ transactions: EVMHistoryItemResponse[]; hasMore: boolean }> {
  const settings = await getWalletSettings();
  const chainId = payload?.evmChainId || settings.activeEVMChain || 'ethereum';
  const testnet = settings.networkEnvironment === 'testnet';
  const network = testnet ? 'testnet' : 'mainnet';

  // Check if this is actually an EVM chain
  const chainConfig = getChain(chainId);
  if (chainConfig && !isEVMChain(chainId)) {
    // Non-EVM chains: get history using the chain's adapter
    try {
      const adapter = getAdapterForChain(chainId, network);
      
      // Try to get address from mnemonic first, then fall back to stored address for private key imports
      const mnemonic = getUnlockedMnemonic();
      let address: string;
      
      if (mnemonic) {
        // Mnemonic wallet - derive address
        address = await adapter.deriveAddress(mnemonic, 0);
      } else {
        // Private key import - get address from stored wallet data
        const publicAddress = await getPublicAddress();
        if (!publicAddress) {
          return { transactions: [], hasMore: false };
        }
        
        // Check if the stored address matches the chain we're querying
        const chainFamily = chainConfig.family;
        const addressPrefix = publicAddress.split(':')[0];
        const rawAddress = publicAddress.includes(':') ? publicAddress.split(':')[1] : publicAddress;
        
        // For Bitcoin-family chains, verify the prefix matches
        if (chainFamily === 'bitcoin' && addressPrefix === 'btc') {
          address = rawAddress;
        } else if (chainFamily === 'tron' && addressPrefix === 'tron') {
          address = rawAddress;
        } else {
          // Chain doesn't match stored address type
          return { transactions: [], hasMore: false };
        }
      }
      
      const result = await adapter.getTransactionHistory(address, payload?.limit || 20);
      
      // Map to serializable format for the UI
      const serializableTransactions = result.transactions.map((tx) => ({
        hash: tx.hash,
        timestamp: tx.timestamp,
        direction: tx.direction,
        type: tx.type,
        amount: tx.amountFormatted,
        symbol: tx.symbol,
        counterparty: tx.counterparty,
        fee: typeof tx.fee === 'bigint' ? Number(tx.fee) / Math.pow(10, chainConfig.decimals) : tx.fee,
        status: tx.status,
        explorerUrl: tx.explorerUrl || adapter.getTxExplorerUrl(tx.hash),
        tokenAddress: tx.tokenAddress,
        logoUri: tx.logoUri,
        swapInfo: tx.swapInfo,
      }));
      
      return {
        transactions: serializableTransactions,
        hasMore: result.hasMore,
      };
    } catch (error) {
      // Always log history fetch errors for debugging
      console.warn(`[Wallet] Failed to get history for ${chainId}:`, error instanceof Error ? error.message : String(error));
      return { transactions: [], hasMore: false };
    }
  }

  const evmAddress = getEVMAddress();

  if (!evmAddress) {
    return { transactions: [], hasMore: false };
  }

  try {
    // chainId is already validated as EVM chain at this point
    const adapter = getEVMAdapter(chainId as EVMChainId, network);
    const result = await adapter.getTransactionHistory(evmAddress, payload?.limit || 20);

    // BigInt cannot be serialized through Chrome's message passing
    // Convert to serializable format for the UI
    const explorerBase = getEVMExplorerUrl(chainId as EVMChainId, testnet);
    const serializableTransactions = result.transactions.map((tx) => ({
      hash: tx.hash,
      timestamp: tx.timestamp,
      direction: tx.direction,
      type: tx.type,
      amount: tx.amountFormatted,
      symbol: tx.symbol,
      counterparty: tx.counterparty,
      fee: Number(tx.fee) / 1e18,
      status: tx.status,
      explorerUrl: tx.explorerUrl || `${explorerBase}/tx/${tx.hash}`,
      tokenAddress: tx.tokenAddress,
      logoUri: tx.logoUri,
      // Include swap info for swap transactions
      swapInfo: tx.swapInfo,
    }));

    return {
      transactions: serializableTransactions,
      hasMore: result.hasMore,
    };
  } catch {
    return { transactions: [], hasMore: false };
  }
}

async function handleEstimateEVMFee(
  payload: WalletMessagePayloads['WALLET_ESTIMATE_EVM_FEE'],
): Promise<EVMFeeEstimate> {
  const evmAddress = getEVMAddress();

  if (!evmAddress) {
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

  const amount = parseAmount(payload.amount, config.decimals);

  let tx;
  if (payload.tokenAddress) {
    tx = await adapter.createTokenTransfer(
      evmAddress,
      payload.recipient,
      payload.tokenAddress,
      amount,
    );
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

async function handleGetEVMAddress(): Promise<string> {
  const evmAddress = getEVMAddress();

  return evmAddress || '';
}

async function handleGetChainAddress(
  payload: WalletMessagePayloads['WALLET_GET_CHAIN_ADDRESS'],
): Promise<WalletMessageResponses['WALLET_GET_CHAIN_ADDRESS']> {
  const { chainId } = payload;
  
  // Get chain config from registry
  const chainConfig = getChain(chainId);
  
  if (!chainConfig) {
    throw new WalletError(WalletErrorCode.NETWORK_ERROR, `Unknown chain: ${chainId}`);
  }
  
  // For Solana, return the public address
  if (chainConfig.family === 'solana') {
    const publicAddress = await getPublicAddress();
    return {
      address: publicAddress || '',
      chainId,
      chainFamily: chainConfig.family,
      symbol: chainConfig.symbol,
    };
  }
  
  // For EVM chains, return the EVM address
  if (chainConfig.family === 'evm') {
    const evmAddress = getEVMAddress();
    return {
      address: evmAddress || '',
      chainId,
      chainFamily: chainConfig.family,
      symbol: chainConfig.symbol,
    };
  }
  
  // For Monero, return the stored watch-only address (not derived from mnemonic)
  if (chainConfig.family === 'monero') {
    const settings = await getWalletSettings();
    const moneroAddress = settings.moneroWatchOnly?.address || '';
    return {
      address: moneroAddress,
      chainId,
      chainFamily: chainConfig.family,
      symbol: chainConfig.symbol,
    };
  }
  
  // For other chains (Bitcoin, TRON), derive the address from mnemonic or cached WIF
  const mnemonic = getUnlockedMnemonic();
  const bitcoinWIF = getUnlockedBitcoinWIF();
  
  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';
  const network = testnet ? 'testnet' : 'mainnet';
  
  // If we have a mnemonic, derive from that
  if (mnemonic) {
    try {
      const adapter = getAdapterForChain(chainId, network);
      const address = await adapter.deriveAddress(mnemonic, 0);
      
      return {
        address,
        chainId,
        chainFamily: chainConfig.family,
        symbol: chainConfig.symbol,
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Failed to derive address for ${chainId}:`, error);
      }
      return {
        address: '',
        chainId,
        chainFamily: chainConfig.family,
        symbol: chainConfig.symbol,
      };
    }
  }
  
  // If we have a Bitcoin WIF and this is a Bitcoin-family chain, derive from WIF
  if (bitcoinWIF && chainConfig.family === 'bitcoin') {
    try {
      const { getBitcoinFamilyAddressFromWIF } = await import('./chains/bitcoin/addresses');
      type BitcoinChainIdType = import('./chains/bitcoin/types').BitcoinChainId;
      const address = getBitcoinFamilyAddressFromWIF(bitcoinWIF, chainId as BitcoinChainIdType, 'native-segwit', testnet);
      
      return {
        address,
        chainId,
        chainFamily: chainConfig.family,
        symbol: chainConfig.symbol,
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Failed to derive ${chainId} address from WIF:`, error);
      }
      return {
        address: '',
        chainId,
        chainFamily: chainConfig.family,
        symbol: chainConfig.symbol,
      };
    }
  }
  
  // No mnemonic or applicable WIF available
  return {
    address: '',
    chainId,
    chainFamily: chainConfig.family,
    symbol: chainConfig.symbol,
  };
}

async function handleGetPendingTxs(
  payload: WalletMessagePayloads['EVM_GET_PENDING_TXS'],
): Promise<EVMPendingTxInfo[]> {
  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';

  let txs;
  if (payload?.address && payload?.evmChainId) {
    txs = await getPendingTxsForAccount(payload.evmChainId, payload.address);
  } else {
    txs = await getAllPendingTxs();
  }

  return txs
    .filter((tx) => tx.testnet === testnet)
    .map((tx) => {
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

async function handleSpeedUpTx(
  payload: WalletMessagePayloads['EVM_SPEED_UP_TX'],
): Promise<EVMTransactionResult> {
  const { txHash, bumpPercent, customMaxFeePerGas, customMaxPriorityFeePerGas } = payload;

  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to speed up transactions.',
    );
  }

  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(WalletErrorCode.TRANSACTION_FAILED, 'Original transaction not found');
  }

  if (originalTx.status !== 'pending') {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Cannot speed up transaction with status: ${originalTx.status}`,
    );
  }

  const speedUpTx = createSpeedUpTx({
    originalTx,
    bumpPercent,
    customMaxFeePerGas: customMaxFeePerGas ? BigInt(customMaxFeePerGas) : undefined,
    customMaxPriorityFeePerGas: customMaxPriorityFeePerGas
      ? BigInt(customMaxPriorityFeePerGas)
      : undefined,
  });

  const signedTx = signEVMTransaction(speedUpTx, evmKeypair, speedUpTx.chainId);

  const txResponse = await broadcastTransaction(originalTx.chainId, originalTx.testnet, signedTx);

  await addPendingTx(
    createPendingTxRecord({
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
    }),
  );

  return {
    hash: txResponse.hash,
    explorerUrl: `${getEVMExplorerUrl(originalTx.chainId, originalTx.testnet)}/tx/${txResponse.hash}`,
    confirmed: false,
  };
}

async function handleCancelTx(
  payload: WalletMessagePayloads['EVM_CANCEL_TX'],
): Promise<EVMTransactionResult> {
  const { txHash, bumpPercent } = payload;

  const evmKeypair = getUnlockedEVMKeypair();
  if (!evmKeypair) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to cancel transactions.',
    );
  }

  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(WalletErrorCode.TRANSACTION_FAILED, 'Original transaction not found');
  }

  if (originalTx.status !== 'pending') {
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      `Cannot cancel transaction with status: ${originalTx.status}`,
    );
  }

  const cancelTx = createCancelTx({
    originalTx,
    bumpPercent,
  });

  const signedTx = signEVMTransaction(cancelTx, evmKeypair, cancelTx.chainId);

  const txResponse = await broadcastTransaction(originalTx.chainId, originalTx.testnet, signedTx);

  await addPendingTx(
    createPendingTxRecord({
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
    }),
  );

  return {
    hash: txResponse.hash,
    explorerUrl: `${getEVMExplorerUrl(originalTx.chainId, originalTx.testnet)}/tx/${txResponse.hash}`,
    confirmed: false,
  };
}

async function handleGetGasPresets(
  payload: WalletMessagePayloads['EVM_GET_GAS_PRESETS'],
): Promise<EVMGasPresets> {
  const { evmChainId, txHash } = payload;

  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(WalletErrorCode.TRANSACTION_FAILED, 'Original transaction not found');
  }

  const presets = await getReplacementGasPresets(evmChainId, originalTx.testnet, originalTx);

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

async function handleEstimateReplacementFee(
  payload: WalletMessagePayloads['EVM_ESTIMATE_REPLACEMENT_FEE'],
): Promise<EVMReplacementFeeEstimate> {
  const { txHash, bumpPercent } = payload;

  const originalTx = await getPendingTxByHash(txHash);
  if (!originalTx) {
    throw new WalletError(WalletErrorCode.TRANSACTION_FAILED, 'Original transaction not found');
  }

  const settings = await getWalletSettings();
  const effectiveBumpPercent = bumpPercent || DEFAULT_BUMP_PERCENT;

  const fees = await estimateReplacementFees(
    originalTx.chainId,
    originalTx.testnet,
    originalTx,
    effectiveBumpPercent,
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
    warning: fees.exceedsWarning
      ? 'Gas fee is higher than normal. Consider waiting for lower fees.'
      : undefined,
  };
}

// ============================================================================
// Bitcoin Handlers
// ============================================================================

/**
 * Send Bitcoin (or other Bitcoin-family coin)
 */
async function handleSendBTC(
  payload: WalletMessagePayloads['WALLET_SEND_BTC'],
): Promise<BTCTransactionResult> {
  const { chainId, recipient, amountSatoshis } = payload;

  // Validate chain is a Bitcoin-family chain
  const chainConfig = getChain(chainId);
  if (!chainConfig || chainConfig.family !== 'bitcoin') {
    throw new WalletError(
      WalletErrorCode.NETWORK_ERROR,
      `Chain ${chainId} is not a Bitcoin-family chain`,
    );
  }

  // Get mnemonic to derive Bitcoin keypair
  const mnemonic = getUnlockedMnemonic();
  if (!mnemonic) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.',
    );
  }

  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';

  // Import Bitcoin functions dynamically
  const { deriveBitcoinKeypair, isValidBitcoinAddress } = await import('./chains/bitcoin/addresses');
  const { createUnsignedTransaction, signTransaction } = await import('./chains/bitcoin/transactions');
  const { broadcastTransaction: broadcastBtcTx, getBitcoinTxExplorerUrl } = await import('./chains/bitcoin');
  type BitcoinChainId = import('./chains/bitcoin/types').BitcoinChainId;

  // Derive keypair - cast chainId to BitcoinChainId type
  const bitcoinChainId = chainId as BitcoinChainId;
  const keypair = deriveBitcoinKeypair(mnemonic, bitcoinChainId, 0, undefined, testnet);

  // Validate recipient address
  if (!isValidBitcoinAddress(recipient, bitcoinChainId, testnet)) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      `Invalid ${chainConfig.name} address: ${recipient}`,
    );
  }

  // Create unsigned transaction
  const { tx: unsignedTx, fee } = await createUnsignedTransaction(
    bitcoinChainId,
    keypair.address,
    recipient,
    amountSatoshis,
    testnet,
  );

  // Sign transaction
  const signedTx = await signTransaction(unsignedTx, keypair, bitcoinChainId, testnet);

  // Broadcast transaction
  const txid = await broadcastBtcTx(bitcoinChainId, signedTx.hex, testnet);

  // Clear cache for this address so balance updates immediately
  const { clearBitcoinCache } = await import('./chains/bitcoin');
  clearBitcoinCache(bitcoinChainId, keypair.address);

  // Get explorer URL
  const explorerUrl = getBitcoinTxExplorerUrl(bitcoinChainId, txid, testnet);

  return {
    txid,
    explorerUrl,
    confirmed: false, // Bitcoin transactions need confirmations
  };
}

/**
 * Estimate fee for a Bitcoin transaction
 */
async function handleEstimateBTCFee(
  payload: WalletMessagePayloads['WALLET_ESTIMATE_BTC_FEE'],
): Promise<BTCFeeEstimate> {
  const { chainId, recipient, amountSatoshis } = payload;

  // Validate chain is a Bitcoin-family chain
  const chainConfig = getChain(chainId);
  if (!chainConfig || chainConfig.family !== 'bitcoin') {
    throw new WalletError(
      WalletErrorCode.NETWORK_ERROR,
      `Chain ${chainId} is not a Bitcoin-family chain`,
    );
  }

  // Get mnemonic to derive Bitcoin address
  const mnemonic = getUnlockedMnemonic();
  if (!mnemonic) {
    // Return a default estimate if wallet is locked
    return {
      feeRate: 10,
      totalFeeSatoshis: 1500, // Approximate for a typical tx
      totalFeeBTC: 0.000015,
      estimatedBlocks: 6,
    };
  }

  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';

  // Import Bitcoin functions dynamically
  const { deriveBitcoinKeypair } = await import('./chains/bitcoin/addresses');
  const { estimateTransactionFee } = await import('./chains/bitcoin/transactions');
  type BitcoinChainIdType = import('./chains/bitcoin/types').BitcoinChainId;

  const bitcoinChainId = chainId as BitcoinChainIdType;
  const keypair = deriveBitcoinKeypair(mnemonic, bitcoinChainId, 0, undefined, testnet);

  const feeEstimate = await estimateTransactionFee(
    bitcoinChainId,
    keypair.address,
    recipient,
    amountSatoshis,
    testnet,
  );

  return {
    feeRate: feeEstimate.feeRate,
    totalFeeSatoshis: feeEstimate.totalFee,
    totalFeeBTC: feeEstimate.totalFee / 100000000, // Convert satoshis to BTC
    estimatedBlocks: feeEstimate.estimatedBlocks,
  };
}

// ============================================================================
// TRON Handlers
// ============================================================================

/**
 * Send TRX on TRON network
 */
async function handleSendTRX(
  payload: WalletMessagePayloads['WALLET_SEND_TRX'],
): Promise<TRXTransactionResult> {
  const { recipient, amountSun } = payload;

  // Get mnemonic to derive TRON keypair
  const mnemonic = getUnlockedMnemonic();
  if (!mnemonic) {
    throw new WalletError(
      WalletErrorCode.WALLET_LOCKED,
      'Wallet is locked. Please unlock to send transactions.',
    );
  }

  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';

  // Import TRON functions dynamically
  const { deriveTronKeypair, isValidTronAddress } = await import('./chains/tron/addresses');
  const { createTransferTransaction, broadcastTransaction } = await import('./chains/tron/client');
  const { getTronTxExplorerUrl } = await import('./chains/tron/config');

  // Derive keypair
  const keypair = deriveTronKeypair(mnemonic, 0);

  // Validate recipient address
  if (!isValidTronAddress(recipient)) {
    throw new WalletError(
      WalletErrorCode.INVALID_RECIPIENT,
      `Invalid TRON address: ${recipient}`,
    );
  }

  // Helper to decode hex error messages from TRON API
  const decodeHexError = (hex: string): string => {
    try {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      }
      return new TextDecoder().decode(bytes);
    } catch {
      return hex;
    }
  };

  try {
    // Create unsigned transaction
    const unsignedTx = await createTransferTransaction(
      keypair.address,
      recipient,
      amountSun,
      testnet,
    );

    // Sign transaction
    const { signTransaction } = await import('./chains/tron/addresses');
    const signature = signTransaction(unsignedTx.raw_data_hex, keypair.privateKey);

    // Create signed transaction object
    // IMPORTANT: Must include visible field to match the format used during creation
    const signedTx = {
      txID: unsignedTx.txID,
      raw_data: unsignedTx.raw_data,
      raw_data_hex: unsignedTx.raw_data_hex,
      signature: [signature],
      visible: unsignedTx.visible ?? true, // Must match the format used when creating transaction
    };

    // Broadcast transaction
    const txid = await broadcastTransaction(signedTx, testnet);

    // Get explorer URL
    const explorerUrl = getTronTxExplorerUrl(txid, testnet);

    return {
      txid,
      explorerUrl,
      confirmed: true, // TRON confirms quickly
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log for debugging
    console.error('[TRON] Send error:', errorMessage);
    
    // Check if it's a hex-encoded error message
    let decodedMessage = errorMessage;
    if (/^[0-9a-fA-F]+$/.test(errorMessage)) {
      decodedMessage = decodeHexError(errorMessage);
    }
    
    // Check for our custom receiver not activated error
    if (decodedMessage.includes('RECEIVER_NOT_ACTIVATED')) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        'This receiving address has not been activated on TRON. To activate a new address, you need to send at least 1 TRX.',
      );
    }
    
    // Check for sender not found error
    if (decodedMessage.includes('SENDER_NOT_FOUND')) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        'Your TRON account was not found on the network. Please ensure you have received TRX before.',
      );
    }
    
    // Check for our custom insufficient balance error
    if (decodedMessage.includes('INSUFFICIENT_BALANCE')) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        decodedMessage.replace('INSUFFICIENT_BALANCE: ', ''),
      );
    }
    
    // Check for insufficient balance error from network
    if (decodedMessage.includes('balance is not sufficient') || decodedMessage.includes('not sufficient')) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        'Insufficient balance. TRON requires keeping a reserve in your account. Try sending a smaller amount.',
      );
    }
    
    // Check for bandwidth/resource errors
    if (decodedMessage.includes('bandwidth') || decodedMessage.includes('AccountResourceInsufficient')) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        'Insufficient bandwidth or energy. You may need to wait for bandwidth to regenerate or have more TRX for fees.',
      );
    }
    
    // "No contract" or "Account not exist" for the RECEIVER usually means new address
    // But this should still work for transfers >= 1 TRX
    // Only show this error if the amount was too small
    if ((decodedMessage.includes('No contract') || decodedMessage.includes('Account not exist')) 
        && amountSun < 1000000) { // Less than 1 TRX
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        'This receiving address has not been activated on TRON. To activate a new address, you need to send at least 1 TRX.',
      );
    }
    
    // For other "No contract" errors, provide more context
    if (decodedMessage.includes('No contract')) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_FAILED,
        `Transaction failed: ${decodedMessage}. This may be a network issue - please try again.`,
      );
    }
    
    throw new WalletError(
      WalletErrorCode.TRANSACTION_FAILED,
      decodedMessage,
    );
  }
}

/**
 * Estimate fee for a TRON transaction
 */
async function handleEstimateTRXFee(
  payload: WalletMessagePayloads['WALLET_ESTIMATE_TRX_FEE'],
): Promise<TRXFeeEstimate> {
  const { recipient, amountSun } = payload;

  // Get mnemonic to derive TRON address
  const mnemonic = getUnlockedMnemonic();
  if (!mnemonic) {
    // Return a default estimate if wallet is locked
    return {
      bandwidth: 270,
      energy: 0,
      feeSun: 0, // Most TRX transfers are free with bandwidth
      feeTRX: 0,
    };
  }

  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';

  // Import TRON functions dynamically
  const { deriveTronKeypair } = await import('./chains/tron/addresses');
  const { estimateFee } = await import('./chains/tron/client');

  const keypair = deriveTronKeypair(mnemonic, 0);

  const feeEstimate = await estimateFee(
    keypair.address,
    recipient,
    amountSun,
    testnet,
  );

  return {
    bandwidth: feeEstimate.bandwidth,
    energy: feeEstimate.energy,
    feeSun: feeEstimate.trxFee,
    feeTRX: feeEstimate.trxFeeFormatted,
  };
}

// ============================================================================
// Jupiter Swap Handlers
// ============================================================================

/**
 * Get a swap quote from Jupiter
 */
async function handleSwapQuote(
  payload: WalletMessagePayloads['WALLET_SWAP_QUOTE'],
): Promise<WalletMessageResponses['WALLET_SWAP_QUOTE']> {
  const { inputMint, outputMint, inputAmount, inputDecimals, outputDecimals, slippageBps } =
    payload;

  const result = await getFormattedSwapQuote(
    inputMint,
    outputMint,
    inputAmount,
    inputDecimals,
    outputDecimals,
    slippageBps,
  );

  return {
    inputMint: result.quote.inputMint,
    outputMint: result.quote.outputMint,
    inputAmount: result.quote.inputAmount,
    outputAmount: result.quote.outputAmount,
    inputAmountFormatted: result.inputAmountFormatted,
    outputAmountFormatted: result.outputAmountFormatted,
    minimumReceivedFormatted: result.minimumReceivedFormatted,
    priceImpact: result.priceImpact,
    platformFeeFormatted: result.platformFeeFormatted,
    route: result.route,
    rawQuote: result.quote.rawQuote,
  };
}

/**
 * Execute a swap via Jupiter
 */
async function handleSwapExecute(
  payload: WalletMessagePayloads['WALLET_SWAP_EXECUTE'],
): Promise<WalletMessageResponses['WALLET_SWAP_EXECUTE']> {
  const { inputMint, outputMint, inputAmount, inputDecimals, slippageBps } = payload;

  return performSwap(inputMint, outputMint, inputAmount, inputDecimals, slippageBps);
}

/**
 * Check if Jupiter swap is available (mainnet only)
 */
async function handleSwapAvailable(): Promise<boolean> {
  return isSwapAvailable();
}

/**
 * Get the current referral program status
 */
function handleSwapReferralStatus(): WalletMessageResponses['WALLET_SWAP_REFERRAL_STATUS'] {
  return getReferralStatus();
}

// ============================================================================
// Swap Token Discovery Handlers (routes through background for CORS)
// ============================================================================

/**
 * Get popular/default tokens for a chain
 * Routes through background script to avoid CORS issues in popup
 */
async function handleSwapGetPopularTokens(
  payload: WalletMessagePayloads['SWAP_GET_POPULAR_TOKENS'],
): Promise<WalletMessageResponses['SWAP_GET_POPULAR_TOKENS']> {
  const { chainType, evmChainId, limit } = payload;
  return getPopularTokens(chainType, evmChainId, limit);
}

/**
 * Search tokens by symbol, name, or address
 * Routes through background script to avoid CORS issues in popup
 */
async function handleSwapSearchTokens(
  payload: WalletMessagePayloads['SWAP_SEARCH_TOKENS'],
): Promise<WalletMessageResponses['SWAP_SEARCH_TOKENS']> {
  const { query, chainType, evmChainId } = payload;
  return searchSwapTokens(query, chainType, evmChainId);
}

/**
 * Get token info by address (for custom token input)
 * Routes through background script to avoid CORS issues in popup
 */
async function handleSwapGetTokenByAddress(
  payload: WalletMessagePayloads['SWAP_GET_TOKEN_BY_ADDRESS'],
): Promise<WalletMessageResponses['SWAP_GET_TOKEN_BY_ADDRESS']> {
  const { address, chainType } = payload;
  if (chainType === 'solana') {
    return fetchSolanaTokenByAddress(address);
  }
  // EVM token lookup not implemented yet - return null
  return null;
}

// ============================================================================
// EVM Swap Handlers (ParaSwap - no API key required)
// ============================================================================

/**
 * Get a swap quote from ParaSwap for EVM chains
 */
async function handleEVMSwapQuote(
  payload: WalletMessagePayloads['EVM_SWAP_QUOTE'],
): Promise<WalletMessageResponses['EVM_SWAP_QUOTE']> {
  const { evmChainId, srcToken, destToken, srcAmount, srcDecimals, destDecimals, slippageBps } =
    payload;

  // Get the user's EVM address
  const evmAddress = getEVMAddress();
  if (!evmAddress) {
    throw new WalletError(WalletErrorCode.WALLET_LOCKED, 'Wallet is locked or EVM address not available');
  }

  const result = await getFormattedEVMSwapQuote(
    evmChainId,
    srcToken,
    destToken,
    srcAmount,
    srcDecimals,
    destDecimals,
    evmAddress,
    slippageBps,
  );

  return {
    chainId: result.quote.chainId,
    srcToken: result.quote.srcToken,
    destToken: result.quote.destToken,
    srcAmount: result.quote.srcAmount,
    destAmount: result.quote.destAmount,
    srcAmountFormatted: result.srcAmountFormatted,
    destAmountFormatted: result.destAmountFormatted,
    minimumReceivedFormatted: result.minimumReceivedFormatted,
    exchangeRate: result.exchangeRate,
    gasCostUSD: result.gasCostUSD,
    route: result.route,
    rawQuote: result.quote,
  };
}

/**
 * Execute a swap via ParaSwap on EVM chains
 */
async function handleEVMSwapExecute(
  payload: WalletMessagePayloads['EVM_SWAP_EXECUTE'],
): Promise<WalletMessageResponses['EVM_SWAP_EXECUTE']> {
  const { evmChainId, srcToken, destToken, srcAmount, srcDecimals, slippageBps } = payload;

  // Get the user's EVM address
  const evmAddress = getEVMAddress();
  if (!evmAddress) {
    throw new WalletError(WalletErrorCode.WALLET_LOCKED, 'Wallet is locked or EVM address not available');
  }

  // Get current network settings to determine if testnet
  const settings = await getWalletSettings();
  const testnet = settings.networkEnvironment === 'testnet';

  return performEVMSwap(
    evmChainId,
    srcToken,
    destToken,
    srcAmount,
    srcDecimals,
    evmAddress,
    slippageBps,
    testnet,
  );
}

/**
 * Check if EVM swap is available for a chain (mainnet only)
 */
function handleEVMSwapAvailable(
  payload: WalletMessagePayloads['EVM_SWAP_AVAILABLE'],
): boolean {
  const { evmChainId } = payload;
  // ParaSwap only works on mainnet
  return isEVMSwapAvailable(evmChainId, false);
}

// ============================================================================
// EVM RPC Forwarding Handler
// ============================================================================

/**
 * Forward arbitrary EVM RPC requests to the blockchain.
 * This enables dApps to make read-only calls like eth_call, eth_estimateGas, etc.
 */
async function handleEVMRpcRequest(
  payload: WalletMessagePayloads['EVM_RPC_REQUEST'],
): Promise<unknown> {
  const { method, params, chainId, testnet } = payload;
  const paramsArray = Array.isArray(params) ? params : params ? [params] : [];

  return withFailover(chainId, testnet, async (provider) => {
    switch (method) {
      case 'eth_chainId': {
        const network = await provider.getNetwork();
        return '0x' + network.chainId.toString(16);
      }

      case 'net_version': {
        const network = await provider.getNetwork();
        return network.chainId.toString();
      }

      case 'eth_blockNumber': {
        const blockNumber = await provider.getBlockNumber();
        return '0x' + blockNumber.toString(16);
      }

      case 'eth_getBalance': {
        const [address, blockTag] = paramsArray as [string, string?];
        const balance = await provider.getBalance(address, blockTag || 'latest');
        return '0x' + balance.toString(16);
      }

      case 'eth_getCode': {
        const [address, blockTag] = paramsArray as [string, string?];
        return await provider.getCode(address, blockTag || 'latest');
      }

      case 'eth_getStorageAt': {
        const [address, position, blockTag] = paramsArray as [string, string, string?];
        return await provider.getStorage(address, position, blockTag || 'latest');
      }

      case 'eth_call': {
        const [txObject, blockTag] = paramsArray as [
          { to: string; data?: string; from?: string; value?: string; gas?: string },
          string?,
        ];
        return await provider.call({
          to: txObject.to,
          data: txObject.data,
          from: txObject.from,
          value: txObject.value ? BigInt(txObject.value) : undefined,
          gasLimit: txObject.gas ? BigInt(txObject.gas) : undefined,
          blockTag: blockTag || 'latest',
        });
      }

      case 'eth_estimateGas': {
        const [txObject] = paramsArray as [
          { to?: string; data?: string; from?: string; value?: string },
        ];
        const estimate = await provider.estimateGas({
          to: txObject.to,
          data: txObject.data,
          from: txObject.from,
          value: txObject.value ? BigInt(txObject.value) : undefined,
        });
        return '0x' + estimate.toString(16);
      }

      case 'eth_gasPrice': {
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 0n;
        return '0x' + gasPrice.toString(16);
      }

      case 'eth_maxPriorityFeePerGas': {
        const feeData = await provider.getFeeData();
        const priorityFee = feeData.maxPriorityFeePerGas || 0n;
        return '0x' + priorityFee.toString(16);
      }

      case 'eth_feeHistory': {
        const [blockCount, newestBlock, rewardPercentiles] = paramsArray as [
          string | number,
          string,
          number[]?,
        ];
        // ethers v6 uses getFeeData instead of feeHistory, return approximation
        const feeData = await provider.getFeeData();
        const baseFee = feeData.maxFeePerGas || 0n;
        return {
          oldestBlock: '0x' + (await provider.getBlockNumber()).toString(16),
          baseFeePerGas: ['0x' + baseFee.toString(16)],
          gasUsedRatio: [0.5],
          reward: rewardPercentiles ? [rewardPercentiles.map(() => '0x0')] : undefined,
        };
      }

      case 'eth_getBlockByNumber': {
        const [blockTag, includeTransactions] = paramsArray as [string, boolean?];
        const block = await provider.getBlock(blockTag, !!includeTransactions);
        if (!block) return null;
        return formatBlockResponse(block, !!includeTransactions);
      }

      case 'eth_getBlockByHash': {
        const [blockHash, includeTransactions] = paramsArray as [string, boolean?];
        const block = await provider.getBlock(blockHash, !!includeTransactions);
        if (!block) return null;
        return formatBlockResponse(block, !!includeTransactions);
      }

      case 'eth_getTransactionByHash': {
        const [txHash] = paramsArray as [string];
        const tx = await provider.getTransaction(txHash);
        if (!tx) return null;
        return formatTransactionResponse(tx);
      }

      case 'eth_getTransactionReceipt': {
        const [txHash] = paramsArray as [string];
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) return null;
        return formatReceiptResponse(receipt);
      }

      case 'eth_getTransactionCount': {
        const [address, blockTag] = paramsArray as [string, string?];
        const count = await provider.getTransactionCount(address, blockTag || 'latest');
        return '0x' + count.toString(16);
      }

      case 'eth_getLogs': {
        const [filter] = paramsArray as [
          {
            fromBlock?: string;
            toBlock?: string;
            address?: string | string[];
            topics?: (string | string[] | null)[];
          },
        ];
        const logs = await provider.getLogs({
          fromBlock: filter.fromBlock || 'latest',
          toBlock: filter.toBlock || 'latest',
          address: filter.address,
          topics: filter.topics,
        });
        return logs.map((log) => ({
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: '0x' + log.blockNumber.toString(16),
          transactionHash: log.transactionHash,
          transactionIndex: '0x' + log.transactionIndex.toString(16),
          blockHash: log.blockHash,
          logIndex: '0x' + log.index.toString(16),
          removed: log.removed,
        }));
      }

      case 'eth_accounts': {
        // Return connected account if wallet is unlocked
        const evmAddress = getEVMAddress();
        return evmAddress ? [evmAddress] : [];
      }

      default:
        // For unsupported methods, try raw RPC call
        try {
          return await provider.send(method, paramsArray);
        } catch (error) {
          throw new WalletError(
            WalletErrorCode.NETWORK_ERROR,
            `RPC method ${method} not supported: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
    }
  });
}

// Helper to format block response for EIP-1474 compliance
function formatBlockResponse(block: any, includeTransactions: boolean): object {
  return {
    number: '0x' + block.number.toString(16),
    hash: block.hash,
    parentHash: block.parentHash,
    nonce: block.nonce || '0x0000000000000000',
    sha3Uncles: '0x0000000000000000000000000000000000000000000000000000000000000000',
    logsBloom: block.logsBloom || '0x' + '0'.repeat(512),
    transactionsRoot: block.transactionsRoot || '0x' + '0'.repeat(64),
    stateRoot: block.stateRoot || '0x' + '0'.repeat(64),
    receiptsRoot: block.receiptsRoot || '0x' + '0'.repeat(64),
    miner: block.miner,
    difficulty: '0x0',
    totalDifficulty: '0x0',
    extraData: block.extraData || '0x',
    size: '0x0',
    gasLimit: '0x' + (block.gasLimit?.toString(16) || '0'),
    gasUsed: '0x' + (block.gasUsed?.toString(16) || '0'),
    timestamp: '0x' + block.timestamp.toString(16),
    transactions: includeTransactions
      ? (block.prefetchedTransactions || []).map(formatTransactionResponse)
      : block.transactions || [],
    uncles: [],
    baseFeePerGas: block.baseFeePerGas ? '0x' + block.baseFeePerGas.toString(16) : undefined,
  };
}

// Helper to format transaction response
function formatTransactionResponse(tx: any): object {
  return {
    hash: tx.hash,
    nonce: '0x' + tx.nonce.toString(16),
    blockHash: tx.blockHash,
    blockNumber: tx.blockNumber !== null ? '0x' + tx.blockNumber.toString(16) : null,
    transactionIndex:
      tx.transactionIndex !== null ? '0x' + tx.transactionIndex.toString(16) : null,
    from: tx.from,
    to: tx.to,
    value: '0x' + (tx.value?.toString(16) || '0'),
    gasPrice: tx.gasPrice ? '0x' + tx.gasPrice.toString(16) : undefined,
    gas: '0x' + (tx.gasLimit?.toString(16) || tx.gas?.toString(16) || '0'),
    input: tx.data || '0x',
    v: tx.signature?.v !== undefined ? '0x' + tx.signature.v.toString(16) : undefined,
    r: tx.signature?.r,
    s: tx.signature?.s,
    type: tx.type !== undefined ? '0x' + tx.type.toString(16) : '0x0',
    maxFeePerGas: tx.maxFeePerGas ? '0x' + tx.maxFeePerGas.toString(16) : undefined,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? '0x' + tx.maxPriorityFeePerGas.toString(16)
      : undefined,
    chainId: tx.chainId ? '0x' + tx.chainId.toString(16) : undefined,
  };
}

// Helper to format receipt response
function formatReceiptResponse(receipt: any): object {
  return {
    transactionHash: receipt.hash,
    transactionIndex: '0x' + receipt.index.toString(16),
    blockHash: receipt.blockHash,
    blockNumber: '0x' + receipt.blockNumber.toString(16),
    from: receipt.from,
    to: receipt.to,
    cumulativeGasUsed: '0x' + receipt.cumulativeGasUsed.toString(16),
    gasUsed: '0x' + receipt.gasUsed.toString(16),
    contractAddress: receipt.contractAddress,
    logs: receipt.logs.map((log: any) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber: '0x' + log.blockNumber.toString(16),
      transactionHash: log.transactionHash,
      transactionIndex: '0x' + log.transactionIndex.toString(16),
      blockHash: log.blockHash,
      logIndex: '0x' + log.index.toString(16),
      removed: log.removed,
    })),
    logsBloom: receipt.logsBloom,
    status: receipt.status !== undefined ? '0x' + receipt.status.toString(16) : undefined,
    effectiveGasPrice: receipt.gasPrice ? '0x' + receipt.gasPrice.toString(16) : undefined,
    type: receipt.type !== undefined ? '0x' + receipt.type.toString(16) : '0x0',
  };
}

export async function initializeWalletModule(): Promise<void> {
  await walletExists();
  await getWalletSettings();
  await initializeRpcHealth();
}

export * from './types';

export { validateMnemonic } from './keychain';
export { validatePasswordStrength, getPasswordStrengthFeedback } from './crypto';
export { getAddressExplorerUrl, getTransactionExplorerUrl } from './rpc';

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

export { detectVaultVersion, checkMigrationStatus } from './migration';

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
  getSolPrice,
  getEthPrice,
  getTokenPrices,
  getTokenPrice,
  formatUsd,
  calculatePortfolioValue,
  clearPriceCache,
} from './prices';

// Jupiter Swap exports
export {
  getSwapQuote,
  getFormattedSwapQuote,
  performSwap,
  executeSwap,
  isSwapAvailable,
  getReferralStatus,
  formatTokenAmount,
  parseInputAmount,
  JUPITER_REFERRAL_CONFIG,
  COMMON_TOKEN_MINTS,
} from './jupiterSwap';

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

export type { ErrorCategory, RetryOptions, Result } from './errors';

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

export {
  executeWithFailover,
  getConnection,
  getBalance as getBalanceFromClient,
  getNetworkStatus as getNetworkStatusFromClient,
  getRecentBlockhash as getRecentBlockhashFromClient,
  getRpcHealth,
} from './solanaClient';

export {
  type TxDisplayStatus,
  type SolanaCommitment,
  type TxConfirmationProgress,
  type SolanaConfirmationProgress,
  type EVMConfirmationProgress,
  type TxStatusBadgeConfig,
  mapSolanaStatus,
  getSolanaProgress,
  getSolanaCommitmentDescription,
  mapEVMStatus,
  getEVMProgress,
  getEVMConfirmationTarget,
  calculateEVMConfirmations,
  getStatusBadgeConfig,
  STATUS_BADGE_CONFIGS,
  isInProgress,
  isTerminal,
  mightBeStuck,
  getEstimatedTimeRemaining,
  getStatusActionSuggestion,
  EVM_CONFIRMATION_TARGETS,
  DEFAULT_EVM_CONFIRMATIONS,
  STUCK_THRESHOLD_MS,
  SOLANA_COMMITMENT_ORDER,
} from './txStatus';

// Spam Detection exports
export {
  detectSpamToken,
  detectSpamEVMToken,
  detectSpamTokensBatch,
  detectSpamEVMTokensBatch,
  filterSpamTokens,
  getSpamReasonSummary,
  shouldFlagToken,
  getSpamWarningLevel,
  DEFAULT_SPAM_CONFIG,
  type SpamDetectionConfig,
  type SpamDetectionResult,
  type SpamSignal,
  type SpamSignalType,
} from './spamDetection';
