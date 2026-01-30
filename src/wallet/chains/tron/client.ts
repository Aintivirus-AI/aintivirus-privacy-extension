/**
 * TRON API Client
 * Uses TronGrid API for blockchain data
 */

import type {
  TronAccountInfo,
  TronTransaction,
  TronTRC20Transfer,
  TronBalance,
  TronTRC20Balance,
  TronFeeEstimate,
  UnsignedTronTransaction,
  SignedTronTransaction,
} from './types';
import { TRON_NETWORKS, TRON_CONSTANTS, COMMON_TRC20_TOKENS, sunToTrx } from './config';

const API_TIMEOUT = 30000;
const MIN_REQUEST_INTERVAL = 400; // 400ms between requests to stay under TronGrid's ~3 RPS limit

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let lastRequestTime = 0;

/**
 * Fetch with timeout and rate limiting
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the API base URL for TRON
 */
function getApiBaseUrl(testnet: boolean = false): string {
  return testnet ? TRON_NETWORKS.testnet.fullNode : TRON_NETWORKS.mainnet.fullNode;
}

/**
 * Get account information
 */
export async function getAccount(
  address: string,
  testnet: boolean = false
): Promise<TronAccountInfo | null> {
  const baseUrl = getApiBaseUrl(testnet);
  
  const response = await fetchWithTimeout(`${baseUrl}/v1/accounts/${address}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      // Account doesn't exist yet (no transactions)
      return null;
    }
    throw new Error(`Failed to get account: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.data || data.data.length === 0) {
    return null;
  }

  const account = data.data[0];
  
  return {
    address: account.address,
    balance: account.balance || 0,
    bandwidth: {
      freeNetLimit: account.free_net_limit || TRON_CONSTANTS.FREE_BANDWIDTH_LIMIT,
      freeNetUsed: account.free_net_usage || 0,
      netLimit: account.net_limit || 0,
      netUsed: account.net_usage || 0,
    },
    energy: {
      energyLimit: account.energy_limit || 0,
      energyUsed: account.energy_usage || 0,
    },
    createTime: account.create_time || 0,
  };
}

/**
 * Get TRX balance
 */
export async function getBalance(
  address: string,
  testnet: boolean = false
): Promise<TronBalance> {
  const account = await getAccount(address, testnet);
  
  if (!account) {
    return { balance: 0, trxBalance: 0 };
  }

  return {
    balance: account.balance,
    trxBalance: sunToTrx(account.balance),
  };
}

/**
 * Get TRC20 token balances
 */
export async function getTRC20Balances(
  address: string,
  testnet: boolean = false
): Promise<TronTRC20Balance[]> {
  const baseUrl = getApiBaseUrl(testnet);
  
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/v1/accounts/${address}/tokens?limit=200`
    );
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return [];
    }

    const balances: TronTRC20Balance[] = [];
    
    for (const token of data.data) {
      // Skip TRX (native token)
      if (token.tokenId === '_') continue;
      
      const knownToken = COMMON_TRC20_TOKENS.find(
        t => t.address.toLowerCase() === (token.tokenId || '').toLowerCase()
      );
      
      const decimals = token.tokenDecimal || knownToken?.decimals || 6;
      const balance = token.balance || '0';
      const uiBalance = parseInt(balance) / Math.pow(10, decimals);
      
      balances.push({
        tokenAddress: token.tokenId || token.tokenAddress || '',
        tokenSymbol: token.tokenAbbr || knownToken?.symbol || 'UNKNOWN',
        tokenName: token.tokenName || knownToken?.name || 'Unknown Token',
        tokenDecimals: decimals,
        balance,
        uiBalance,
        logoUri: knownToken?.logoUri,
      });
    }

    return balances;
  } catch {
    return [];
  }
}

/**
 * Get transaction history
 */
export async function getTransactions(
  address: string,
  testnet: boolean = false,
  limit: number = 20
): Promise<TronTransaction[]> {
  const baseUrl = getApiBaseUrl(testnet);
  
  const response = await fetchWithTimeout(
    `${baseUrl}/v1/accounts/${address}/transactions?limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to get transactions: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.data || data.data.length === 0) {
    return [];
  }

  return data.data.map((tx: any) => {
    // Parse the transaction
    const contract = tx.raw_data?.contract?.[0];
    const contractType = contract?.type;
    const params = contract?.parameter?.value || {};
    
    return {
      txID: tx.txID,
      blockNumber: tx.blockNumber,
      blockTimestamp: tx.block_timestamp,
      contractType: getContractTypeNumber(contractType),
      confirmed: tx.ret?.[0]?.contractRet === 'SUCCESS',
      ownerAddress: params.owner_address || '',
      toAddress: params.to_address || params.receiver_address || '',
      amount: params.amount || 0,
      fee: tx.ret?.[0]?.fee || 0,
      contractRet: tx.ret?.[0]?.contractRet,
      timestamp: tx.block_timestamp || tx.raw_data?.timestamp || 0,
    };
  });
}

/**
 * Map contract type string to number
 */
function getContractTypeNumber(type: string): number {
  const types: Record<string, number> = {
    'TransferContract': 1,
    'TransferAssetContract': 2,
    'TriggerSmartContract': 31,
    'CreateSmartContract': 30,
    'FreezeBalanceV2Contract': 54,
    'UnfreezeBalanceV2Contract': 55,
    'WithdrawExpireUnfreezeContract': 56,
  };
  return types[type] || 0;
}

/**
 * Get TRC20 transfer history
 */
export async function getTRC20Transfers(
  address: string,
  testnet: boolean = false,
  limit: number = 20
): Promise<TronTRC20Transfer[]> {
  const baseUrl = getApiBaseUrl(testnet);
  
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/v1/accounts/${address}/transactions/trc20?limit=${limit}`
    );
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return [];
    }

    return data.data;
  } catch {
    return [];
  }
}

/**
 * Check if an account exists on TRON using wallet/getaccount endpoint
 */
export async function accountExists(
  address: string,
  testnet: boolean = false
): Promise<boolean> {
  const baseUrl = getApiBaseUrl(testnet);
  
  try {
    // Use POST endpoint which is more reliable
    const response = await fetchWithTimeout(`${baseUrl}/wallet/getaccount`, {
      method: 'POST',
      body: JSON.stringify({
        address,
        visible: true,
      }),
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    // Account exists if it has an address field in response
    return !!(data && (data.address || data.account_name !== undefined || data.balance !== undefined));
  } catch {
    return false;
  }
}

/**
 * Create a TRX transfer transaction
 * For new accounts, TRON requires the transfer to include account creation
 */
export async function createTransferTransaction(
  fromAddress: string,
  toAddress: string,
  amount: number, // in SUN
  testnet: boolean = false
): Promise<UnsignedTronTransaction> {
  const baseUrl = getApiBaseUrl(testnet);
  
  const senderAccount = await getAccount(fromAddress, testnet);
  if (!senderAccount) {
    throw new Error('SENDER_NOT_FOUND: Your TRON account was not found. Please ensure your wallet is properly set up.');
  }
  
  // Verify sender has enough balance
  if (senderAccount.balance < amount) {
    throw new Error(`INSUFFICIENT_BALANCE: Your balance (${sunToTrx(senderAccount.balance)} TRX) is less than the amount you want to send.`);
  }
  
  const receiverExists = await accountExists(toAddress, testnet);
  
  // New accounts require at least 1 TRX to activate
  if (!receiverExists && amount < TRON_CONSTANTS.SUN_PER_TRX) {
    throw new Error('RECEIVER_NOT_ACTIVATED: To send to a new address, you must send at least 1 TRX to activate it.');
  }
  
  // Try creating the transfer transaction
  const response = await fetchWithTimeout(`${baseUrl}/wallet/createtransaction`, {
    method: 'POST',
    body: JSON.stringify({
      owner_address: fromAddress,
      to_address: toAddress,
      amount,
      visible: true,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create transaction: ${error}`);
  }

  const tx = await response.json();
  
  if (tx.Error) {
    throw new Error(tx.Error);
  }
  
  // Check for transaction creation errors - handle various error response formats
  if (tx.result && tx.result.result === false) {
    // Error in result object
    let errorMsg = 'Transaction creation failed';
    if (tx.result.message) {
      errorMsg = /^[0-9a-fA-F]+$/.test(tx.result.message) 
        ? decodeHexMessage(tx.result.message)
        : tx.result.message;
    }
    throw new Error(errorMsg);
  }
  
  if (!tx.txID || !tx.raw_data_hex) {
    // Missing required fields - check for error details
    if (tx.message) {
      const errorMsg = /^[0-9a-fA-F]+$/.test(tx.message)
        ? decodeHexMessage(tx.message)
        : tx.message;
      throw new Error(errorMsg);
    }
    throw new Error('Failed to create transaction - invalid response from TRON network.');
  }

  return tx;
}

/**
 * Decode hex-encoded error messages from TRON API
 */
function decodeHexMessage(hex: string): string {
  try {
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      return hex;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return hex;
  }
}

/**
 * Broadcast a signed transaction with retry logic for rate limits
 */
export async function broadcastTransaction(
  signedTx: SignedTronTransaction,
  testnet: boolean = false
): Promise<string> {
  const baseUrl = getApiBaseUrl(testnet);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds between retries
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_DELAY * attempt); // Exponential backoff
    }
    
    try {
      const response = await fetchWithTimeout(`${baseUrl}/wallet/broadcasttransaction`, {
        method: 'POST',
        body: JSON.stringify(signedTx),
      });
      
      if (!response.ok) {
        const error = await response.text();
        // Check for rate limit error
        if (error.includes('rate exceeded') || error.includes('suspended')) {
          lastError = new Error(`Rate limited: ${error}`);
          continue; // Retry
        }
        throw new Error(`Failed to broadcast transaction: ${error}`);
      }

      const result = await response.json();
  
      if (result.code && result.code !== 'SUCCESS') {
        // Decode hex message if present
        let errorMsg = result.message || `Broadcast failed: ${result.code}`;
        if (result.message && /^[0-9a-fA-F]+$/.test(result.message)) {
          errorMsg = decodeHexMessage(result.message);
        }
        // Check for rate limit in response
        if (errorMsg.includes('rate exceeded') || errorMsg.includes('suspended')) {
          lastError = new Error(errorMsg);
          continue; // Retry
        }
        throw new Error(errorMsg);
      }
      
      // Also check for result.result === false with a message
      if (result.result === false && result.message) {
        let errorMsg = result.message;
        if (/^[0-9a-fA-F]+$/.test(result.message)) {
          errorMsg = decodeHexMessage(result.message);
        }
        throw new Error(errorMsg);
      }

      return signedTx.txID;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('rate exceeded') || errorMsg.includes('suspended') || errorMsg.includes('Rate limited')) {
        lastError = error instanceof Error ? error : new Error(errorMsg);
        continue; // Retry
      }
      throw error; // Re-throw non-rate-limit errors
    }
  }
  
  // All retries exhausted
  throw lastError || new Error('Failed to broadcast transaction after multiple retries');
}

/**
 * Get the current block for reference
 */
export async function getNowBlock(testnet: boolean = false): Promise<{
  blockNumber: number;
  timestamp: number;
}> {
  const baseUrl = getApiBaseUrl(testnet);
  
  const response = await fetchWithTimeout(`${baseUrl}/wallet/getnowblock`);
  
  if (!response.ok) {
    throw new Error(`Failed to get current block: ${response.status}`);
  }

  const block = await response.json();
  
  return {
    blockNumber: block.block_header?.raw_data?.number || 0,
    timestamp: block.block_header?.raw_data?.timestamp || Date.now(),
  };
}

/**
 * Estimate fee for a transfer
 */
export async function estimateFee(
  fromAddress: string,
  _toAddress: string,
  _amount: number,
  testnet: boolean = false
): Promise<TronFeeEstimate> {
  // Note: toAddress and amount could be used for more accurate estimates
  // (e.g., new account activation costs) but aren't currently needed
  const account = await getAccount(fromAddress, testnet);
  
  // Basic TRX transfer uses ~270 bytes of bandwidth
  const estimatedBandwidth = 270;
  
  // Check if free bandwidth is available
  const freeBandwidthAvailable = account 
    ? account.bandwidth.freeNetLimit - account.bandwidth.freeNetUsed
    : TRON_CONSTANTS.FREE_BANDWIDTH_LIMIT;
  
  let trxFee = 0;
  
  // If not enough free bandwidth, fee is required
  if (freeBandwidthAvailable < estimatedBandwidth) {
    // 1000 SUN per bandwidth unit
    trxFee = estimatedBandwidth * 1000;
  }

  return {
    bandwidth: estimatedBandwidth,
    energy: 0, // TRX transfers don't use energy
    trxFee,
    trxFeeFormatted: sunToTrx(trxFee),
  };
}

/**
 * Get account resources (bandwidth & energy)
 */
export async function getAccountResources(
  address: string,
  testnet: boolean = false
): Promise<{ bandwidth: number; energy: number }> {
  const baseUrl = getApiBaseUrl(testnet);
  
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/wallet/getaccountresource`,
      {
        method: 'POST',
        body: JSON.stringify({
          address,
          visible: true,
        }),
      }
    );
    
    if (!response.ok) {
      return { bandwidth: 0, energy: 0 };
    }

    const data = await response.json();
    
    return {
      bandwidth: (data.freeNetLimit || 0) - (data.freeNetUsed || 0),
      energy: (data.EnergyLimit || 0) - (data.EnergyUsed || 0),
    };
  } catch {
    return { bandwidth: 0, energy: 0 };
  }
}
