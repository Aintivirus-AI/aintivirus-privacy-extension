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

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response;
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
 * Convert base58 address to hex format
 */
export function addressToHex(address: string): string {
  // TRON addresses start with 'T' and are base58check encoded
  // For API calls, we need the hex format (starting with 41)
  const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  let hex = BigInt(0);
  for (const char of address) {
    hex = hex * BigInt(58) + BigInt(base58Chars.indexOf(char));
  }
  
  const hexStr = hex.toString(16);
  // Remove checksum (last 8 hex chars)
  return hexStr.slice(0, -8);
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tron/client.ts:getBalance:entry',message:'Getting TRON balance',data:{address,testnet},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  const account = await getAccount(address, testnet);
  
  if (!account) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tron/client.ts:getBalance:noAccount',message:'TRON account not found',data:{address},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return { balance: 0, trxBalance: 0 };
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tron/client.ts:getBalance:success',message:'TRON balance fetched',data:{address,balance:account.balance,trxBalance:sunToTrx(account.balance)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
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
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tron/client.ts:getTransactions:entry',message:'Getting TRON transactions',data:{address,testnet,limit,baseUrl},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  
  const response = await fetchWithTimeout(
    `${baseUrl}/v1/accounts/${address}/transactions?limit=${limit}`
  );
  
  if (!response.ok) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tron/client.ts:getTransactions:error',message:'TRON transactions request failed',data:{address,status:response.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    throw new Error(`Failed to get transactions: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.data || data.data.length === 0) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tron/client.ts:getTransactions:empty',message:'No TRON transactions found',data:{address},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    return [];
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tron/client.ts:getTransactions:success',message:'TRON transactions fetched',data:{address,count:data.data.length,sampleTx:data.data[0]?{txID:data.data[0].txID,blockNumber:data.data[0].blockNumber}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

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
 * Create a TRX transfer transaction
 */
export async function createTransferTransaction(
  fromAddress: string,
  toAddress: string,
  amount: number, // in SUN
  testnet: boolean = false
): Promise<UnsignedTronTransaction> {
  const baseUrl = getApiBaseUrl(testnet);
  
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

  return tx;
}

/**
 * Broadcast a signed transaction
 */
export async function broadcastTransaction(
  signedTx: SignedTronTransaction,
  testnet: boolean = false
): Promise<string> {
  const baseUrl = getApiBaseUrl(testnet);
  
  const response = await fetchWithTimeout(`${baseUrl}/wallet/broadcasttransaction`, {
    method: 'POST',
    body: JSON.stringify(signedTx),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to broadcast transaction: ${error}`);
  }

  const result = await response.json();
  
  if (result.code && result.code !== 'SUCCESS') {
    throw new Error(result.message || `Broadcast failed: ${result.code}`);
  }

  return signedTx.txID;
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
  toAddress: string,
  amount: number,
  testnet: boolean = false
): Promise<TronFeeEstimate> {
  // Get account to check available bandwidth
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
