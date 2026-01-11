/**
 * Bitcoin API Client
 * Uses external APIs (Blockstream, Mempool.space, Blockchair) for blockchain data
 */

import type { BitcoinChainId, UTXO, BitcoinTransaction, BitcoinBalance, BitcoinFeeEstimate } from './types';
import { getBitcoinChainConfig } from './config';

const API_TIMEOUT = 30000;

interface BlockstreamAddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

interface BlockstreamUtxo {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  value: number;
}

interface BlockstreamTx {
  txid: string;
  version: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    prevout?: {
      scriptpubkey: string;
      scriptpubkey_asm: string;
      scriptpubkey_type: string;
      scriptpubkey_address?: string;
      value: number;
    };
    scriptsig: string;
    scriptsig_asm: string;
    sequence: number;
    is_coinbase?: boolean;
  }>;
  vout: Array<{
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address?: string;
    value: number;
  }>;
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

interface BlockchairAddressData {
  data: {
    [address: string]: {
      address: {
        type: string;
        balance: number;
        balance_usd: number;
        received: number;
        spent: number;
        output_count: number;
        unspent_output_count: number;
        first_seen_receiving?: string;
        last_seen_receiving?: string;
        first_seen_spending?: string;
        last_seen_spending?: string;
        transaction_count: number;
      };
      transactions?: string[];
      utxo?: Array<{
        block_id: number;
        transaction_hash: string;
        index: number;
        value: number;
      }>;
    };
  };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the appropriate API base URL for a chain
 */
function getApiBaseUrl(chainId: BitcoinChainId, testnet: boolean = false): string {
  switch (chainId) {
    case 'bitcoin':
      return testnet 
        ? 'https://blockstream.info/testnet/api'
        : 'https://blockstream.info/api';
    case 'bitcoincash':
      return 'https://api.blockchair.com/bitcoin-cash';
    case 'litecoin':
      return 'https://api.blockchair.com/litecoin';
    case 'zcash':
      return 'https://api.blockchair.com/zcash';
    default:
      return 'https://blockstream.info/api';
  }
}

/**
 * Get balance for a Bitcoin address using Blockstream API
 */
async function getBalanceBlockstream(
  address: string,
  testnet: boolean = false
): Promise<BitcoinBalance> {
  const baseUrl = testnet 
    ? 'https://blockstream.info/testnet/api'
    : 'https://blockstream.info/api';
  
  const response = await fetchWithTimeout(`${baseUrl}/address/${address}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get balance: ${response.status}`);
  }

  const data: BlockstreamAddressInfo = await response.json();
  
  const confirmed = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
  const unconfirmed = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;

  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  };
}

/**
 * Get balance using BlockCypher API (for LTC and as fallback)
 */
async function getBalanceBlockCypher(
  chainSymbol: 'ltc' | 'bcy', // ltc = litecoin mainnet
  address: string
): Promise<BitcoinBalance> {
  const response = await fetchWithTimeout(
    `https://api.blockcypher.com/v1/${chainSymbol}/main/addrs/${address}/balance`
  );
  
  if (!response.ok) {
    throw new Error(`BlockCypher API failed: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    confirmed: data.balance || 0,
    unconfirmed: data.unconfirmed_balance || 0,
    total: (data.balance || 0) + (data.unconfirmed_balance || 0),
  };
}

/**
 * Get balance using SoChain API (backup for multiple coins)
 */
async function getBalanceSoChain(
  network: 'BCH' | 'LTC' | 'ZEC',
  address: string
): Promise<BitcoinBalance> {
  const response = await fetchWithTimeout(
    `https://chain.so/api/v2/get_address_balance/${network}/${address}`
  );
  
  if (!response.ok) {
    throw new Error(`SoChain API failed: ${response.status}`);
  }
  
  const data = await response.json();
  if (data.status !== 'success') {
    throw new Error(`SoChain API returned error: ${data.status}`);
  }
  
  const confirmed = Math.round(parseFloat(data.data.confirmed_balance) * 1e8);
  const unconfirmed = Math.round(parseFloat(data.data.unconfirmed_balance) * 1e8);
  
  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  };
}

/**
 * Get balance using Blockchair API (for BCH, LTC, ZEC) with fallbacks
 */
async function getBalanceBlockchair(
  chainId: BitcoinChainId,
  address: string
): Promise<BitcoinBalance> {
  // Try Blockchair first
  try {
    const baseUrl = getApiBaseUrl(chainId);
    const response = await fetchWithTimeout(`${baseUrl}/dashboards/address/${address}`);
    
    if (response.ok) {
      const data: BlockchairAddressData = await response.json();
      const addressData = data.data[address];
      
      if (!addressData) {
        return { confirmed: 0, unconfirmed: 0, total: 0 };
      }

      const balance = addressData.address.balance;
      return {
        confirmed: balance,
        unconfirmed: 0,
        total: balance,
      };
    }
    // If Blockchair fails (e.g., 430), try fallbacks
  } catch {
    // Blockchair failed, try fallbacks
  }

  // Fallback APIs
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bitcoin/client.ts:getBalanceBlockchair:fallback',message:'Blockchair failed, trying fallback APIs',data:{chainId,address},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  
  if (chainId === 'litecoin') {
    try {
      return await getBalanceBlockCypher('ltc', address);
    } catch {
      // Try SoChain as final fallback
      return await getBalanceSoChain('LTC', address);
    }
  }
  
  if (chainId === 'bitcoincash') {
    // SoChain supports BCH
    return await getBalanceSoChain('BCH', address);
  }
  
  if (chainId === 'zcash') {
    // SoChain supports ZEC
    return await getBalanceSoChain('ZEC', address);
  }
  
  throw new Error(`No working API available for ${chainId}`);
}

/**
 * Get balance for any Bitcoin-family chain
 */
export async function getBalance(
  chainId: BitcoinChainId,
  address: string,
  testnet: boolean = false
): Promise<BitcoinBalance> {
  if (chainId === 'bitcoin') {
    return getBalanceBlockstream(address, testnet);
  }
  return getBalanceBlockchair(chainId, address);
}

/**
 * Get UTXOs for a Bitcoin address using Blockstream API
 */
async function getUtxosBlockstream(
  address: string,
  testnet: boolean = false
): Promise<UTXO[]> {
  const baseUrl = testnet 
    ? 'https://blockstream.info/testnet/api'
    : 'https://blockstream.info/api';
  
  const response = await fetchWithTimeout(`${baseUrl}/address/${address}/utxo`);
  
  if (!response.ok) {
    throw new Error(`Failed to get UTXOs: ${response.status}`);
  }

  const utxos: BlockstreamUtxo[] = await response.json();
  
  return utxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    script: '', // Will be filled when needed
    address,
    confirmations: utxo.status.confirmed ? 1 : 0,
  }));
}

/**
 * Get UTXOs using Blockchair API (for BCH, LTC, ZEC)
 */
async function getUtxosBlockchair(
  chainId: BitcoinChainId,
  address: string
): Promise<UTXO[]> {
  const baseUrl = getApiBaseUrl(chainId);
  const response = await fetchWithTimeout(`${baseUrl}/dashboards/address/${address}?limit=100`);
  
  if (!response.ok) {
    throw new Error(`Failed to get UTXOs: ${response.status}`);
  }

  const data: BlockchairAddressData = await response.json();
  const addressData = data.data[address];
  
  if (!addressData || !addressData.utxo) {
    return [];
  }

  return addressData.utxo.map(utxo => ({
    txid: utxo.transaction_hash,
    vout: utxo.index,
    value: utxo.value,
    script: '',
    address,
    confirmations: utxo.block_id > 0 ? 1 : 0,
  }));
}

/**
 * Get UTXOs for any Bitcoin-family chain
 */
export async function getUtxos(
  chainId: BitcoinChainId,
  address: string,
  testnet: boolean = false
): Promise<UTXO[]> {
  if (chainId === 'bitcoin') {
    return getUtxosBlockstream(address, testnet);
  }
  return getUtxosBlockchair(chainId, address);
}

/**
 * Get transaction history using Blockstream API
 */
async function getTransactionsBlockstream(
  address: string,
  testnet: boolean = false,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  const baseUrl = testnet 
    ? 'https://blockstream.info/testnet/api'
    : 'https://blockstream.info/api';
  
  const response = await fetchWithTimeout(`${baseUrl}/address/${address}/txs`);
  
  if (!response.ok) {
    throw new Error(`Failed to get transactions: ${response.status}`);
  }

  const txs: BlockstreamTx[] = await response.json();
  
  return txs.slice(0, limit).map(tx => ({
    txid: tx.txid,
    version: tx.version,
    locktime: tx.locktime,
    vin: tx.vin.map(input => ({
      txid: input.txid,
      vout: input.vout,
      scriptSig: input.scriptsig,
      sequence: input.sequence,
      addresses: input.prevout?.scriptpubkey_address ? [input.prevout.scriptpubkey_address] : undefined,
      value: input.prevout?.value,
    })),
    vout: tx.vout.map((output, index) => ({
      value: output.value,
      n: index,
      scriptPubKey: {
        hex: output.scriptpubkey,
        addresses: output.scriptpubkey_address ? [output.scriptpubkey_address] : undefined,
        type: output.scriptpubkey_type,
      },
    })),
    blockhash: tx.status.block_hash,
    blockheight: tx.status.block_height,
    confirmations: tx.status.confirmed ? 1 : 0, // Simplified
    time: tx.status.block_time,
    blocktime: tx.status.block_time,
    fees: tx.fee,
  }));
}

/**
 * Get transactions using BlockCypher API (for LTC)
 */
async function getTransactionsBlockCypher(
  chainSymbol: 'ltc',
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  const response = await fetchWithTimeout(
    `https://api.blockcypher.com/v1/${chainSymbol}/main/addrs/${address}?limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`BlockCypher API failed: ${response.status}`);
  }
  
  const data = await response.json();
  const txrefs = data.txrefs || [];
  
  return txrefs.slice(0, limit).map((tx: { tx_hash: string; value: number; spent: boolean; confirmed: string; block_height: number }) => ({
    txid: tx.tx_hash,
    version: 1,
    locktime: 0,
    vin: [],
    vout: [{
      value: tx.value,
      n: 0,
      scriptPubKey: { addresses: [address], type: 'pubkeyhash', hex: '' },
    }],
    confirmations: tx.block_height > 0 ? 1 : 0,
    time: tx.confirmed ? Math.floor(new Date(tx.confirmed).getTime() / 1000) : undefined,
    blockheight: tx.block_height,
  }));
}

/**
 * Get transactions using SoChain API (for BCH, LTC, ZEC)
 */
async function getTransactionsSoChain(
  network: 'BCH' | 'LTC' | 'ZEC',
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  const response = await fetchWithTimeout(
    `https://chain.so/api/v2/get_tx_received/${network}/${address}`
  );
  
  if (!response.ok) {
    throw new Error(`SoChain API failed: ${response.status}`);
  }
  
  const data = await response.json();
  if (data.status !== 'success') {
    throw new Error(`SoChain API returned error: ${data.status}`);
  }
  
  const txs = data.data.txs || [];
  return txs.slice(0, limit).map((tx: { txid: string; value: string; time: number; confirmations: number }) => ({
    txid: tx.txid,
    version: 1,
    locktime: 0,
    vin: [],
    vout: [{
      value: Math.round(parseFloat(tx.value) * 1e8),
      n: 0,
      scriptPubKey: { addresses: [address], type: 'pubkeyhash', hex: '' },
    }],
    confirmations: tx.confirmations,
    time: tx.time,
  }));
}

/**
 * Get transactions using Blockchair API (for BCH, LTC, ZEC) with fallbacks
 */
async function getTransactionsBlockchair(
  chainId: BitcoinChainId,
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  // Try Blockchair first
  try {
    const baseUrl = getApiBaseUrl(chainId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bitcoin/client.ts:getTransactionsBlockchair:entry',message:'Fetching Blockchair transactions',data:{chainId,address,limit,baseUrl},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    const response = await fetchWithTimeout(
      `${baseUrl}/dashboards/address/${address}?limit=${limit}&transaction_details=true`
    );
    
    if (response.ok) {
      const data = await response.json();
      const addressData = data.data[address];
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bitcoin/client.ts:getTransactionsBlockchair:response',message:'Blockchair response received',data:{chainId,hasAddressData:!!addressData,hasTransactions:!!addressData?.transactions,transactionCount:addressData?.transactions?.length||0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      
      if (!addressData || !addressData.transactions) {
        return [];
      }

      return addressData.transactions.slice(0, limit).map((txid: string) => ({
        txid,
        version: 1,
        locktime: 0,
        vin: [],
        vout: [],
        confirmations: 1,
      }));
    }
    // If Blockchair fails, try fallbacks
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bitcoin/client.ts:getTransactionsBlockchair:blockchairFailed',message:'Blockchair failed, trying fallback',data:{chainId,status:response.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
  } catch {
    // Blockchair failed, try fallbacks
  }

  // Fallback APIs
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a703f37f-90e8-40d1-9473-330bf66f7908',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bitcoin/client.ts:getTransactionsBlockchair:usingFallback',message:'Using fallback API for transactions',data:{chainId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  
  if (chainId === 'litecoin') {
    try {
      return await getTransactionsBlockCypher('ltc', address, limit);
    } catch {
      return await getTransactionsSoChain('LTC', address, limit);
    }
  }
  
  if (chainId === 'bitcoincash') {
    return await getTransactionsSoChain('BCH', address, limit);
  }
  
  if (chainId === 'zcash') {
    return await getTransactionsSoChain('ZEC', address, limit);
  }
  
  throw new Error(`No working API available for ${chainId}`);
}

/**
 * Get transaction history for any Bitcoin-family chain
 */
export async function getTransactions(
  chainId: BitcoinChainId,
  address: string,
  testnet: boolean = false,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  if (chainId === 'bitcoin') {
    return getTransactionsBlockstream(address, testnet, limit);
  }
  return getTransactionsBlockchair(chainId, address, limit);
}

/**
 * Get fee estimate using Blockstream API
 */
async function getFeeEstimateBlockstream(
  testnet: boolean = false,
  targetBlocks: number = 6
): Promise<BitcoinFeeEstimate> {
  const baseUrl = testnet 
    ? 'https://blockstream.info/testnet/api'
    : 'https://blockstream.info/api';
  
  const response = await fetchWithTimeout(`${baseUrl}/fee-estimates`);
  
  if (!response.ok) {
    // Return default fee if API fails
    return {
      feeRate: 10,
      totalFee: 0,
      estimatedBlocks: targetBlocks,
    };
  }

  const estimates: Record<string, number> = await response.json();
  
  // Find the closest target
  const blocks = Object.keys(estimates).map(Number).sort((a, b) => a - b);
  const closest = blocks.find(b => b >= targetBlocks) || blocks[blocks.length - 1];
  
  return {
    feeRate: Math.ceil(estimates[closest.toString()] || 10),
    totalFee: 0, // Will be calculated based on tx size
    estimatedBlocks: closest,
  };
}

/**
 * Get fee estimate for any Bitcoin-family chain
 */
export async function getFeeEstimate(
  chainId: BitcoinChainId,
  testnet: boolean = false,
  targetBlocks: number = 6
): Promise<BitcoinFeeEstimate> {
  if (chainId === 'bitcoin') {
    return getFeeEstimateBlockstream(testnet, targetBlocks);
  }
  
  // For other chains, use a sensible default
  // These chains typically have lower fees
  const config = getBitcoinChainConfig(chainId);
  return {
    feeRate: config.minRelayFee * 2,
    totalFee: 0,
    estimatedBlocks: targetBlocks,
  };
}

/**
 * Broadcast a signed transaction
 */
export async function broadcastTransaction(
  chainId: BitcoinChainId,
  txHex: string,
  testnet: boolean = false
): Promise<string> {
  if (chainId === 'bitcoin') {
    const baseUrl = testnet 
      ? 'https://blockstream.info/testnet/api'
      : 'https://blockstream.info/api';
    
    const response = await fetchWithTimeout(`${baseUrl}/tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: txHex,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to broadcast transaction: ${error}`);
    }
    
    return await response.text(); // Returns txid
  }
  
  // For other chains, use Blockchair
  const baseUrl = getApiBaseUrl(chainId);
  const response = await fetchWithTimeout(`${baseUrl}/push/transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: txHex }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to broadcast transaction: ${error}`);
  }
  
  const result = await response.json();
  return result.data.transaction_hash;
}

/**
 * Get current block height
 */
export async function getBlockHeight(
  chainId: BitcoinChainId,
  testnet: boolean = false
): Promise<number> {
  if (chainId === 'bitcoin') {
    const baseUrl = testnet 
      ? 'https://blockstream.info/testnet/api'
      : 'https://blockstream.info/api';
    
    const response = await fetchWithTimeout(`${baseUrl}/blocks/tip/height`);
    
    if (!response.ok) {
      throw new Error(`Failed to get block height: ${response.status}`);
    }
    
    return parseInt(await response.text(), 10);
  }
  
  // For other chains, use Blockchair
  const baseUrl = getApiBaseUrl(chainId);
  const response = await fetchWithTimeout(`${baseUrl}/stats`);
  
  if (!response.ok) {
    throw new Error(`Failed to get block height: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data.blocks;
}
