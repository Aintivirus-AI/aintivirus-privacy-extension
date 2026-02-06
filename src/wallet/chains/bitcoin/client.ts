import type { BitcoinChainId, UTXO, BitcoinTransaction, BitcoinBalance, BitcoinFeeEstimate } from './types';
import { getBitcoinChainConfig } from './config';
import { legacyToCashAddr } from './addresses';

const API_TIMEOUT = 30000;

// NOWNodes API configuration for Zcash
// Provides 15 RPS and 100,000 requests/month
const NOWNODES_API_KEY = process.env.AINTIVIRUS_NOWNODES_API_KEY || '';
const NOWNODES_ZEC_BASE_URL = 'https://zecbook.nownodes.io/api/v2';

// Simple in-memory cache for balance and transactions to reduce API calls
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const balanceCache = new Map<string, CacheEntry<BitcoinBalance>>();
const transactionCache = new Map<string, CacheEntry<BitcoinTransaction[]>>();
const CACHE_TTL_MS = 30000;

function getCacheKey(chainId: string, address: string, extra?: string): string {
  return `${chainId}:${address}${extra ? `:${extra}` : ''}`;
}

function getCachedBalance(chainId: string, address: string): BitcoinBalance | null {
  const key = getCacheKey(chainId, address);
  const entry = balanceCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  balanceCache.delete(key);
  return null;
}

function setCachedBalance(chainId: string, address: string, data: BitcoinBalance): void {
  const key = getCacheKey(chainId, address);
  balanceCache.set(key, { data, timestamp: Date.now() });
}

function getCachedTransactions(chainId: string, address: string): BitcoinTransaction[] | null {
  const key = getCacheKey(chainId, address);
  const entry = transactionCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  transactionCache.delete(key);
  return null;
}

function setCachedTransactions(chainId: string, address: string, data: BitcoinTransaction[]): void {
  const key = getCacheKey(chainId, address);
  transactionCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Retry a function with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500, maxDelayMs = 5000 } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      if (lastError.message.includes('Invalid address') || 
          lastError.message.includes('not supported')) {
        throw lastError;
      }
      
      if (attempt < maxRetries - 1) {
        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 200,
          maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All retries failed');
}

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
 * Get balance using Litecoinspace API (mempool.space for Litecoin)
 * Supports all address formats including bech32 (ltc1...)
 */
async function getBalanceLitecoinspace(address: string): Promise<BitcoinBalance> {
  const response = await fetchWithTimeout(
    `https://litecoinspace.org/api/address/${address}`
  );
  
  if (!response.ok) {
    throw new Error(`Litecoinspace API failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  const confirmed = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0);
  const unconfirmed = (data.mempool_stats?.funded_txo_sum || 0) - (data.mempool_stats?.spent_txo_sum || 0);
  
  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  };
}

/**
 * Get balance using FullStack.cash API (for BCH only)
 * FullStack.cash provides a free Electrumx API for Bitcoin Cash
 */
async function getBalanceFullStack(
  address: string
): Promise<BitcoinBalance> {
  const response = await fetchWithTimeout(
    `https://api.fullstack.cash/v5/electrumx/balance/${address}`
  );
  
  if (!response.ok) {
    throw new Error(`FullStack.cash API failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(`FullStack.cash API returned error`);
  }
  
  const confirmed = data.balance.confirmed || 0;
  const unconfirmed = data.balance.unconfirmed || 0;
  
  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  };
}

/**
 * Get balance using NOWNodes API for Zcash
 * Primary API for Zcash - reliable Blockbook-style API with API key
 */
async function getBalanceNowNodes(address: string): Promise<BitcoinBalance> {
  if (!NOWNODES_API_KEY) {
    throw new Error('NOWNodes API key not configured');
  }
  
  const response = await fetchWithTimeout(
    `${NOWNODES_ZEC_BASE_URL}/address/${address}`,
    {
      headers: {
        'api-key': NOWNODES_API_KEY,
      },
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NOWNodes API failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // NOWNodes returns balance in zatoshis as a string
  const balance = parseInt(data.balance || '0', 10);
  const unconfirmedBalance = parseInt(data.unconfirmedBalance || '0', 10);
  
  return {
    confirmed: balance,
    unconfirmed: unconfirmedBalance,
    total: balance + unconfirmedBalance,
  };
}

/**
 * Get balance using Blockchair API (for BCH, LTC, ZEC) with fallbacks
 * For Litecoin, we use multiple APIs with retry logic for reliability
 */
async function getBalanceBlockchair(
  chainId: BitcoinChainId,
  address: string
): Promise<BitcoinBalance> {
  const errors: string[] = [];
  
  // For Litecoin, try multiple APIs in sequence with retry
  // Order: Litecoinspace (best for bech32) -> BlockCypher -> Blockchair
  if (chainId === 'litecoin') {
    // Try Litecoinspace first - best support for bech32 (ltc1...) addresses
    try {
      const result = await withRetry(
        () => getBalanceLitecoinspace(address),
        { maxRetries: 2, baseDelayMs: 300 }
      );
      return result;
    } catch (e) {
      errors.push(`Litecoinspace: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Try BlockCypher as fallback
    try {
      const result = await withRetry(
        () => getBalanceBlockCypher('ltc', address),
        { maxRetries: 2, baseDelayMs: 300 }
      );
      return result;
    } catch (e) {
      errors.push(`BlockCypher: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Try Blockchair as last resort
    try {
      const baseUrl = getApiBaseUrl(chainId);
      const response = await fetchWithTimeout(`${baseUrl}/dashboards/address/${address}`);
      
      if (response.ok) {
        const data: BlockchairAddressData = await response.json();
        
        // Blockchair may return the address key in different case
        let addressData = data.data[address];
        if (!addressData) {
          const keys = Object.keys(data.data || {});
          const matchingKey = keys.find(k => k.toLowerCase() === address.toLowerCase());
          if (matchingKey) {
            addressData = data.data[matchingKey];
          }
        }
        
        if (!addressData) {
          // No data for this address - might be new/empty wallet
          return { confirmed: 0, unconfirmed: 0, total: 0 };
        }

        const balance = addressData.address?.balance || 0;
        return {
          confirmed: balance,
          unconfirmed: 0,
          total: balance,
        };
      }
      errors.push(`Blockchair: HTTP ${response.status}`);
    } catch (e) {
      errors.push(`Blockchair: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // All APIs failed - log and throw
    console.error(`[LTC Balance] All APIs failed for ${address}:`, errors.join('; '));
    throw new Error(`No working API available for litecoin: ${errors.join('; ')}`);
  }
  
  // Try Blockchair for other chains
  let blockchairBalance: BitcoinBalance | null = null;
  try {
    const baseUrl = getApiBaseUrl(chainId);
    const response = await fetchWithTimeout(`${baseUrl}/dashboards/address/${address}`);
    
    if (response.ok) {
      const data: BlockchairAddressData = await response.json();
      
      // Blockchair may return the address key in different case, so check all keys
      let addressData = data.data[address];
      if (!addressData) {
        // Try to find the address key case-insensitively
        const keys = Object.keys(data.data || {});
        const matchingKey = keys.find(k => k.toLowerCase() === address.toLowerCase());
        if (matchingKey) {
          addressData = data.data[matchingKey];
        }
      }
      
      if (addressData && addressData.address?.balance !== undefined && addressData.address.balance > 0) {
        // Only trust Blockchair data if we have a positive balance
        // For zero balances, we should verify with fallback APIs
        return {
          confirmed: addressData.address.balance,
          unconfirmed: 0,
          total: addressData.address.balance,
        };
      }
      
      // Store Blockchair result for fallback comparison
      if (addressData) {
        blockchairBalance = {
          confirmed: addressData.address?.balance || 0,
          unconfirmed: 0,
          total: addressData.address?.balance || 0,
        };
      }
      // Fall through to try fallback APIs for zero balance or missing data
      // (Blockchair may not fully index all addresses, especially for Zcash)
    }
    // If Blockchair fails (e.g., 430), try fallbacks
  } catch {
    // Blockchair failed, try fallbacks
  }
  
  // Try FullStack.cash as primary fallback for BCH
  if (chainId === 'bitcoincash') {
    try {
      return await getBalanceFullStack(address);
    } catch (e) {
      console.error(`[BCH Balance] FullStack.cash failed:`, e);
      // If FullStack.cash also fails and we have Blockchair data, return that
      if (blockchairBalance) return blockchairBalance;
      throw e;
    }
  }
  
  // For Zcash, try NOWNodes first (reliable API with key), then Blockchair as fallback
  if (chainId === 'zcash') {
    const zcashErrors: string[] = [];
    
    // Try NOWNodes first - reliable Blockbook API with API key
    try {
      return await getBalanceNowNodes(address);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      zcashErrors.push(`NOWNodes: ${errorMsg}`);
    }
    
    // If NOWNodes fails and we have Blockchair data, return that
    if (blockchairBalance) {
      return blockchairBalance;
    }
    
    // All APIs failed
    throw new Error(`All Zcash balance APIs failed: ${zcashErrors.join('; ')}`);
  }
  
  // Return Blockchair data if available
  if (blockchairBalance) return blockchairBalance;
  
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
  // Check cache first
  const cached = getCachedBalance(chainId, address);
  if (cached) {
    return cached;
  }
  
  let result: BitcoinBalance;
  
  if (chainId === 'bitcoin') {
    result = await getBalanceBlockstream(address, testnet);
  } else {
    result = await getBalanceBlockchair(chainId, address);
  }
  
  // Cache the result
  setCachedBalance(chainId, address, result);
  
  return result;
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
 * Get UTXOs using NOWNodes API for Zcash
 * Primary API for Zcash UTXOs - reliable Blockbook-style API with API key
 */
async function getUtxosNOWNodes(address: string): Promise<UTXO[]> {
  if (!NOWNODES_API_KEY) {
    throw new Error('NOWNodes API key not configured');
  }
  
  const response = await fetchWithTimeout(
    `${NOWNODES_ZEC_BASE_URL}/utxo/${address}`,
    {
      headers: {
        'api-key': NOWNODES_API_KEY,
      },
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NOWNodes UTXO API failed: ${response.status} - ${errorText}`);
  }
  
  const data: Array<{
    txid: string;
    vout: number;
    value: string;
    height?: number;
    confirmations?: number;
  }> = await response.json();
  
  return data.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: parseInt(utxo.value, 10),
    script: '',
    address,
    confirmations: utxo.confirmations ?? (utxo.height && utxo.height > 0 ? 1 : 0),
  }));
}

/**
 * Get UTXOs using FullStack.cash API (for BCH only)
 * FullStack.cash provides a free Electrumx API for Bitcoin Cash
 */
async function getUtxosFullStack(address: string): Promise<UTXO[]> {
  const response = await fetchWithTimeout(
    `https://api.fullstack.cash/v5/electrumx/utxos/${address}`
  );
  
  if (!response.ok) {
    throw new Error(`FullStack.cash UTXO API failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success || !data.utxos) {
    return [];
  }
  
  return data.utxos.map((utxo: {
    tx_hash: string;
    tx_pos: number;
    value: number;
    height?: number;
  }) => ({
    txid: utxo.tx_hash,
    vout: utxo.tx_pos,
    value: utxo.value,
    script: '',
    address,
    confirmations: utxo.height && utxo.height > 0 ? 1 : 0,
  }));
}

/**
 * Get UTXOs using Blockchair API (for BCH, ZEC)
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
 * Get UTXOs using Litecoinspace API
 * Supports all address formats including bech32 (ltc1...)
 */
async function getUtxosLitecoinspace(address: string): Promise<UTXO[]> {
  const response = await fetchWithTimeout(
    `https://litecoinspace.org/api/address/${address}/utxo`
  );
  
  if (!response.ok) {
    throw new Error(`Litecoinspace UTXO API failed: ${response.status}`);
  }

  const utxos: Array<{
    txid: string;
    vout: number;
    status: {
      confirmed: boolean;
      block_height?: number;
      block_hash?: string;
      block_time?: number;
    };
    value: number;
  }> = await response.json();
  
  return utxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    script: '',
    address,
    confirmations: utxo.status.confirmed ? 1 : 0,
  }));
}

/**
 * Get UTXOs using BlockCypher API (for LTC)
 */
async function getUtxosBlockCypher(
  chainSymbol: 'ltc',
  address: string
): Promise<UTXO[]> {
  const response = await fetchWithTimeout(
    `https://api.blockcypher.com/v1/${chainSymbol}/main/addrs/${address}?unspentOnly=true&includeScript=true`
  );
  
  if (!response.ok) {
    throw new Error(`BlockCypher UTXO API failed: ${response.status}`);
  }
  
  const data = await response.json();
  const txrefs = data.txrefs || [];
  
  return txrefs.map((utxo: {
    tx_hash: string;
    tx_output_n: number;
    value: number;
    script?: string;
    confirmations?: number;
  }) => ({
    txid: utxo.tx_hash,
    vout: utxo.tx_output_n,
    value: utxo.value,
    script: utxo.script || '',
    address,
    confirmations: utxo.confirmations || 0,
  }));
}

/**
 * Get UTXOs using SoChain API (backup for LTC)
 * https://sochain.com/api#get-unspent-tx
 */
async function getUtxosSoChain(
  network: 'LTC',
  address: string
): Promise<UTXO[]> {
  const response = await fetchWithTimeout(
    `https://sochain.com/api/v2/get_tx_unspent/${network}/${address}`
  );
  
  if (!response.ok) {
    throw new Error(`SoChain UTXO API failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.status !== 'success' || !data.data?.txs) {
    return [];
  }
  
  return data.data.txs.map((utxo: {
    txid: string;
    output_no: number;
    value: string;
    script_hex?: string;
    confirmations?: number;
  }) => ({
    txid: utxo.txid,
    vout: utxo.output_no,
    value: Math.round(parseFloat(utxo.value) * 1e8), // Convert LTC to litoshis
    script: utxo.script_hex || '',
    address,
    confirmations: utxo.confirmations || 0,
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
  
  // For Litecoin, use multiple fallback APIs for reliability
  if (chainId === 'litecoin') {
    const errors: string[] = [];
    
    // Try Litecoinspace first - best support for bech32 (ltc1...) addresses
    try {
      return await withRetry(
        () => getUtxosLitecoinspace(address),
        { maxRetries: 2, baseDelayMs: 300 }
      );
    } catch (e) {
      errors.push(`Litecoinspace: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Try BlockCypher as second fallback
    try {
      return await withRetry(
        () => getUtxosBlockCypher('ltc', address),
        { maxRetries: 2, baseDelayMs: 300 }
      );
    } catch (e) {
      errors.push(`BlockCypher: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Try SoChain as third fallback
    try {
      return await withRetry(
        () => getUtxosSoChain('LTC', address),
        { maxRetries: 2, baseDelayMs: 300 }
      );
    } catch (e) {
      errors.push(`SoChain: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Try Blockchair as last resort
    try {
      return await getUtxosBlockchair(chainId, address);
    } catch (e) {
      errors.push(`Blockchair: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    console.error(`[LTC UTXOs] All APIs failed for ${address}:`, errors.join('; '));
    throw new Error(`Failed to get UTXOs: ${errors.join('; ')}`);
  }
  
  // For Zcash, try NOWNodes first (reliable API with key), then Blockchair as fallback
  if (chainId === 'zcash') {
    const errors: string[] = [];
    
    // Try NOWNodes first - reliable Blockbook API with API key
    try {
      return await getUtxosNOWNodes(address);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`NOWNodes: ${errorMsg}`);
    }
    
    // Try Blockchair as fallback
    try {
      return await getUtxosBlockchair(chainId, address);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Blockchair: ${errorMsg}`);
    }
    
    throw new Error(`Failed to get UTXOs: ${errors.join('; ')}`);
  }
  
  // For Bitcoin Cash, use FullStack.cash as primary (Blockchair is often rate-limited)
  if (chainId === 'bitcoincash') {
    const errors: string[] = [];
    
    // Try FullStack.cash first - free Electrumx API for BCH
    try {
      return await withRetry(
        () => getUtxosFullStack(address),
        { maxRetries: 2, baseDelayMs: 300 }
      );
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`FullStack.cash: ${errorMsg}`);
    }
    
    // Try Blockchair as fallback
    try {
      return await getUtxosBlockchair(chainId, address);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Blockchair: ${errorMsg}`);
    }
    
    console.error(`[BCH UTXOs] All APIs failed for ${address}:`, errors.join('; '));
    throw new Error(`Failed to get UTXOs: ${errors.join('; ')}`);
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
 * Uses the /full endpoint to get complete transaction data with inputs and outputs
 */
async function getTransactionsBlockCypher(
  chainSymbol: 'ltc',
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  // Use the /full endpoint to get complete transaction data
  const response = await fetchWithTimeout(
    `https://api.blockcypher.com/v1/${chainSymbol}/main/addrs/${address}/full?limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`BlockCypher API failed: ${response.status}`);
  }
  
  const data = await response.json();
  const txs = data.txs || [];
  
  return txs.slice(0, limit).map((tx: {
    hash: string;
    ver: number;
    lock_time: number;
    block_height: number;
    confirmed?: string;
    received?: string;
    fees: number;
    inputs: Array<{
      prev_hash: string;
      output_index: number;
      output_value: number;
      addresses?: string[];
      script?: string;
      sequence: number;
    }>;
    outputs: Array<{
      value: number;
      script: string;
      addresses?: string[];
      script_type: string;
    }>;
  }) => ({
    txid: tx.hash,
    version: tx.ver || 1,
    locktime: tx.lock_time || 0,
    vin: tx.inputs.map((input, index) => ({
      txid: input.prev_hash,
      vout: input.output_index,
      scriptSig: input.script || '',
      sequence: input.sequence,
      addresses: input.addresses,
      value: input.output_value,
    })),
    vout: tx.outputs.map((output, index) => ({
      value: output.value,
      n: index,
      scriptPubKey: {
        hex: output.script || '',
        addresses: output.addresses,
        type: output.script_type || 'pubkeyhash',
      },
    })),
    confirmations: tx.block_height > 0 ? 1 : 0,
    time: tx.confirmed ? Math.floor(new Date(tx.confirmed).getTime() / 1000) 
        : tx.received ? Math.floor(new Date(tx.received).getTime() / 1000) 
        : undefined,
    blockheight: tx.block_height > 0 ? tx.block_height : undefined,
    fees: tx.fees,
  }));
}

/**
 * Get transactions using Litecoinspace API (mempool.space for Litecoin)
 * Supports all address formats including bech32 (ltc1...)
 */
async function getTransactionsLitecoinspace(
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  const response = await fetchWithTimeout(
    `https://litecoinspace.org/api/address/${address}/txs`
  );
  
  if (!response.ok) {
    throw new Error(`Litecoinspace API failed: ${response.status}`);
  }
  
  const txs = await response.json();
  
  return txs.slice(0, limit).map((tx: {
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
  }) => ({
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
    confirmations: tx.status.confirmed ? 1 : 0,
    time: tx.status.block_time,
    blocktime: tx.status.block_time,
    fees: tx.fee,
  }));
}

/**
 * Get transactions using NOWNodes API for Zcash
 * Primary API for Zcash transactions - reliable Blockbook-style API with API key
 */
async function getTransactionsNowNodes(
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  if (!NOWNODES_API_KEY) {
    throw new Error('NOWNodes API key not configured');
  }
  
  // Use details=txs to get full transaction data in one request
  const response = await fetchWithTimeout(
    `${NOWNODES_ZEC_BASE_URL}/address/${address}?details=txs&pageSize=${limit}`,
    {
      headers: {
        'api-key': NOWNODES_API_KEY,
      },
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NOWNodes API failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.transactions || !Array.isArray(data.transactions)) {
    return [];
  }
  
  // Map NOWNodes Blockbook format to our BitcoinTransaction format
  return data.transactions.slice(0, limit).map((tx: {
    txid: string;
    version?: number;
    vin: Array<{
      txid: string;
      vout?: number;
      sequence?: number;
      n?: number;
      addresses?: string[];
      value?: string;
      hex?: string;
    }>;
    vout: Array<{
      value: string;
      n: number;
      hex?: string;
      addresses?: string[];
    }>;
    blockHash?: string;
    blockHeight?: number;
    confirmations?: number;
    blockTime?: number;
    fees?: string;
  }) => ({
    txid: tx.txid,
    version: tx.version || 1,
    locktime: 0,
    vin: tx.vin.map(input => ({
      txid: input.txid || '',
      vout: input.vout || input.n || 0,
      scriptSig: input.hex || '',
      sequence: input.sequence || 0xffffffff,
      addresses: input.addresses,
      value: input.value ? parseInt(input.value, 10) : undefined,
    })),
    vout: tx.vout.map(output => ({
      value: parseInt(output.value || '0', 10),
      n: output.n,
      scriptPubKey: {
        hex: output.hex || '',
        addresses: output.addresses,
        type: 'pubkeyhash',
      },
    })),
    blockhash: tx.blockHash,
    blockheight: tx.blockHeight,
    confirmations: tx.confirmations || 0,
    time: tx.blockTime,
    blocktime: tx.blockTime,
    fees: tx.fees ? parseInt(tx.fees, 10) : undefined,
  }));
}

// Cache for previous transaction outputs to avoid repeated lookups
const prevTxOutputCache = new Map<string, { addresses: string[]; timestamp: number }>();
const PREV_TX_CACHE_TTL_MS = 300000; // 5 minutes cache for previous tx data

/**
 * Small delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Look up input addresses for a transaction by fetching the previous outputs
 * This is needed because raw transaction format doesn't include input addresses
 */
async function lookupInputAddresses(
  inputs: Array<{ txid: string; vout: number }>
): Promise<Map<string, string[]>> {
  const addressMap = new Map<string, string[]>();
  const now = Date.now();
  
  // First, check cache and collect what needs to be fetched
  const txidsToFetch: string[] = [];
  const inputsByTxid = new Map<string, number[]>();
  
  for (const input of inputs) {
    if (!input.txid) continue;
    
    const cacheKey = `${input.txid}:${input.vout}`;
    const cached = prevTxOutputCache.get(cacheKey);
    
    if (cached && now - cached.timestamp < PREV_TX_CACHE_TTL_MS) {
      // Use cached data
      addressMap.set(cacheKey, cached.addresses);
    } else {
      // Need to fetch this transaction
      if (!inputsByTxid.has(input.txid)) {
        inputsByTxid.set(input.txid, []);
        txidsToFetch.push(input.txid);
      }
      inputsByTxid.get(input.txid)!.push(input.vout);
    }
  }
  
  if (txidsToFetch.length === 0) {
    return addressMap;
  }
  
  // Limit the number of lookups to avoid rate limiting
  // Only fetch the first 10 unique transactions max
  const limitedTxids = txidsToFetch.slice(0, 10);
  
  // Fetch previous transactions sequentially with delays to avoid rate limits
  for (const txid of limitedTxids) {
    try {
      const response = await fetchWithTimeout(
        `https://api.fullstack.cash/v5/rawtransactions/getRawTransaction/${txid}?verbose=true`
      );
      
      if (response.ok) {
        const tx = await response.json();
        
        if (tx && tx.vout) {
          // Store all output addresses from this transaction
          for (const output of tx.vout) {
            const key = `${txid}:${output.n}`;
            const addresses = output.scriptPubKey?.addresses;
            if (addresses && addresses.length > 0) {
              addressMap.set(key, addresses);
              // Cache the result
              prevTxOutputCache.set(key, { addresses, timestamp: now });
            }
          }
        }
      } else if (response.status === 429) {
        // Rate limited - stop making more requests
        console.warn('[BCH] Rate limited during input address lookup, stopping');
        break;
      }
      
      // Add a small delay between requests to avoid rate limiting
      await delay(100);
    } catch {
      // Ignore errors for individual lookups
    }
  }
  
  return addressMap;
}

// Cache for BCH transaction details to reduce API calls
const bchTxDetailCache = new Map<string, { tx: BitcoinTransaction; timestamp: number }>();
const BCH_TX_CACHE_TTL_MS = 60000; // 1 minute cache for tx details

/**
 * Get transactions using FullStack.cash API (for BCH only)
 * FullStack.cash provides a free Electrumx API for Bitcoin Cash
 */
async function getTransactionsFullStack(
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  // Get transaction hashes and heights
  const txListResponse = await fetchWithTimeout(
    `https://api.fullstack.cash/v5/electrumx/transactions/${address}`
  );
  
  if (!txListResponse.ok) {
    throw new Error(`FullStack.cash API failed: ${txListResponse.status}`);
  }
  
  const txListData = await txListResponse.json();
  
  if (!txListData.success || !txListData.transactions) {
    return [];
  }
  
  const transactions = txListData.transactions.slice(0, limit);
  const now = Date.now();
  
  // Fetch full details for each transaction
  const detailedTxs: BitcoinTransaction[] = [];
  const allInputs: Array<{ txid: string; vout: number; txIndex: number; inputIndex: number }> = [];
  
  for (let txIndex = 0; txIndex < transactions.length; txIndex++) {
    const tx = transactions[txIndex];
    
    // Check cache first
    const cached = bchTxDetailCache.get(tx.tx_hash);
    if (cached && now - cached.timestamp < BCH_TX_CACHE_TTL_MS) {
      // Use cached transaction, but still collect inputs for address lookup
      const cachedTx = cached.tx;
      cachedTx.vin.forEach((input, inputIndex) => {
        if (input.txid) {
          allInputs.push({
            txid: input.txid,
            vout: input.vout || 0,
            txIndex: detailedTxs.length,
            inputIndex,
          });
        }
      });
      detailedTxs.push(cachedTx);
      continue;
    }
    
    try {
      const detailResponse = await fetchWithTimeout(
        `https://api.fullstack.cash/v5/rawtransactions/getRawTransaction/${tx.tx_hash}?verbose=true`
      );
      
      if (!detailResponse.ok) {
        if (detailResponse.status === 429) {
          // Rate limited - add delay and continue with cached data if available
          console.warn('[BCH] Rate limited fetching tx details, using partial results');
          await delay(500);
        }
        continue;
      }
      
      const detail = await detailResponse.json();
      
      // Collect all inputs for batch lookup
      detail.vin.forEach((input: any, inputIndex: number) => {
        if (input.txid) {
          allInputs.push({
            txid: input.txid,
            vout: input.vout || 0,
            txIndex: detailedTxs.length,
            inputIndex,
          });
        }
      });
      
      // Map to our BitcoinTransaction format (addresses will be filled in later)
      const bitcoinTx: BitcoinTransaction = {
        txid: detail.txid,
        version: detail.version || 1,
        locktime: detail.locktime || 0,
        vin: detail.vin.map((input: any) => ({
          txid: input.txid || '',
          vout: input.vout || 0,
          scriptSig: input.scriptSig?.hex || '',
          sequence: input.sequence || 0xffffffff,
          addresses: undefined, // Will be filled in after batch lookup
          value: undefined, // Will be filled in after batch lookup
        })),
        vout: detail.vout.map((output: any) => ({
          value: Math.round(output.value * 1e8), // Convert BCH to satoshis
          n: output.n,
          scriptPubKey: {
            hex: output.scriptPubKey?.hex || '',
            addresses: output.scriptPubKey?.addresses || undefined,
            type: output.scriptPubKey?.type || 'pubkeyhash',
          },
        })),
        blockhash: detail.blockhash,
        blockheight: tx.height,
        confirmations: detail.confirmations || 0,
        time: detail.blocktime || detail.time,
        blocktime: detail.blocktime || detail.time,
        fees: undefined, // Not directly available
      };
      
      // Cache the transaction
      bchTxDetailCache.set(tx.tx_hash, { tx: bitcoinTx, timestamp: now });
      detailedTxs.push(bitcoinTx);
      
      // Small delay between requests to be nice to the API
      await delay(50);
    } catch {
      // Skip transactions that fail to fetch
    }
  }
  
  // Look up input addresses from previous transactions
  if (allInputs.length > 0) {
    try {
      const addressMap = await lookupInputAddresses(allInputs);
      
      // Fill in the input addresses
      for (const input of allInputs) {
        const key = `${input.txid}:${input.vout}`;
        const addresses = addressMap.get(key);
        if (addresses && detailedTxs[input.txIndex]) {
          const vin = detailedTxs[input.txIndex].vin[input.inputIndex];
          if (vin) {
            vin.addresses = addresses;
          }
        }
      }
    } catch (e) {
      // Log but don't fail - we can still show transactions without direction
      console.warn('[BCH] Failed to look up input addresses:', e);
    }
  }
  
  return detailedTxs;
}

/**
 * Get transactions using Blockchair API (for BCH, LTC, ZEC) with fallbacks
 * Note: Blockchair often returns only transaction IDs without full details,
 * so we prefer the fallback APIs which return complete transaction data.
 */
async function getTransactionsBlockchair(
  chainId: BitcoinChainId,
  address: string,
  limit: number = 20
): Promise<BitcoinTransaction[]> {
  const errors: string[] = [];
  
  // For Litecoin, try multiple APIs in sequence with retry
  // Order: Litecoinspace (best for bech32) -> BlockCypher -> Blockchair
  if (chainId === 'litecoin') {
    // Try Litecoinspace first - best support for bech32 (ltc1...) addresses
    try {
      const result = await withRetry(
        () => getTransactionsLitecoinspace(address, limit),
        { maxRetries: 2, baseDelayMs: 300 }
      );
      return result;
    } catch (e) {
      errors.push(`Litecoinspace: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Try BlockCypher as fallback
    try {
      const result = await withRetry(
        () => getTransactionsBlockCypher('ltc', address, limit),
        { maxRetries: 2, baseDelayMs: 300 }
      );
      return result;
    } catch (e) {
      errors.push(`BlockCypher: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Try Blockchair as last resort
    try {
      const baseUrl = getApiBaseUrl(chainId);
      const response = await fetchWithTimeout(
        `${baseUrl}/dashboards/address/${address}?limit=${limit}&transaction_details=true`
      );
      
      if (response.ok) {
        const data = await response.json();
        const addressData = data.data?.[address];
        
        if (!addressData) {
          // No data for this address, might be new/empty wallet
          return [];
        }

        const txDetails = addressData.transactions;
        
        if (!txDetails || (Array.isArray(txDetails) && txDetails.length === 0)) {
          return [];
        }
        
        // If transactions is an object with txid keys, we have full details
        if (typeof txDetails === 'object' && !Array.isArray(txDetails)) {
          const txids = Object.keys(txDetails).slice(0, limit);
          return txids.map((txid: string) => {
            const tx = txDetails[txid];
            return {
              txid,
              version: tx.version || 1,
              locktime: tx.lock_time || 0,
              vin: (tx.inputs || []).map((input: any) => ({
                txid: input.transaction_hash || '',
                vout: input.index || 0,
                scriptSig: input.scriptsig_hex || '',
                sequence: input.sequence || 0xffffffff,
                addresses: input.recipient ? [input.recipient] : undefined,
                value: input.value,
              })),
              vout: (tx.outputs || []).map((output: any, idx: number) => ({
                value: output.value,
                n: output.index || idx,
                scriptPubKey: {
                  hex: output.scriptpubkey_hex || '',
                  addresses: output.recipient ? [output.recipient] : undefined,
                  type: output.type || 'pubkeyhash',
                },
              })),
              confirmations: tx.block_id > 0 ? 1 : 0,
              time: tx.time ? Math.floor(new Date(tx.time).getTime() / 1000) : undefined,
              blockheight: tx.block_id > 0 ? tx.block_id : undefined,
              fees: tx.fee,
            };
          });
        }
      }
      errors.push(`Blockchair: HTTP ${response.status}`);
    } catch (e) {
      errors.push(`Blockchair: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // All APIs failed - log and throw
    console.error(`[LTC Transactions] All APIs failed for ${address}:`, errors.join('; '));
    throw new Error(`No working API available for litecoin: ${errors.join('; ')}`);
  }
  
  // For BCH, try Blockchair first for transaction history (has input addresses)
  // Fall back to FullStack.cash if Blockchair is rate-limited
  if (chainId === 'bitcoincash') {
    const errors: string[] = [];
    
    // Try Blockchair first - it has complete transaction data with input addresses
    try {
      const baseUrl = getApiBaseUrl(chainId);
      const response = await fetchWithTimeout(
        `${baseUrl}/dashboards/address/${address}?limit=${limit}&transaction_details=true`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        // Blockchair may return the address key in CashAddr format with prefix
        // Try multiple formats to find the address data
        let addressData = data.data?.[address];
        if (!addressData) {
          // Try without prefix if address has one
          const addressWithoutPrefix = address.replace('bitcoincash:', '');
          addressData = data.data?.[addressWithoutPrefix];
        }
        if (!addressData) {
          // Try to find any key that looks like an address (there should be only one)
          const keys = Object.keys(data.data || {});
          if (keys.length > 0) {
            addressData = data.data[keys[0]];
          }
        }
        
        if (addressData?.transactions) {
          const txDetails = addressData.transactions;
          
          if (typeof txDetails === 'object' && !Array.isArray(txDetails) && Object.keys(txDetails).length > 0) {
            const txids = Object.keys(txDetails).slice(0, limit);
            return txids.map((txid: string) => {
              const tx = txDetails[txid];
              return {
                txid,
                version: tx.version || 1,
                locktime: tx.lock_time || 0,
                vin: (tx.inputs || []).map((input: any) => ({
                  txid: input.transaction_hash || '',
                  vout: input.index || 0,
                  scriptSig: input.scriptsig_hex || '',
                  sequence: input.sequence || 0xffffffff,
                  addresses: input.recipient ? [input.recipient] : undefined,
                  value: input.value,
                })),
                vout: (tx.outputs || []).map((output: any, idx: number) => ({
                  value: output.value,
                  n: output.index || idx,
                  scriptPubKey: {
                    hex: output.scriptpubkey_hex || '',
                    addresses: output.recipient ? [output.recipient] : undefined,
                    type: output.type || 'pubkeyhash',
                  },
                })),
                confirmations: tx.block_id > 0 ? 1 : 0,
                time: tx.time ? Math.floor(new Date(tx.time).getTime() / 1000) : undefined,
                blockheight: tx.block_id > 0 ? tx.block_id : undefined,
                fees: tx.fee,
              };
            });
          }
        }
      } else {
        errors.push(`Blockchair: HTTP ${response.status}`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Blockchair: ${errorMsg}`);
    }
    
    // Try FullStack.cash as fallback
    // FullStack.cash requires additional lookups for input addresses but now handles them
    try {
      console.warn(`[BCH Transactions] Falling back to FullStack.cash:`, errors.join('; '));
      const fullStackTxs = await getTransactionsFullStack(address, limit);
      if (fullStackTxs.length > 0) {
        return fullStackTxs;
      }
      // If FullStack.cash returned empty, continue to cached data check
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`FullStack.cash: ${errorMsg}`);
    }
    
    // Check if we have cached transactions we can return
    const cachedKey = getCacheKey('bitcoincash', address);
    const cachedEntry = transactionCache.get(cachedKey);
    if (cachedEntry && cachedEntry.data.length > 0) {
      console.warn(`[BCH Transactions] All APIs failed, using stale cache:`, errors.join('; '));
      return cachedEntry.data.slice(0, limit);
    }
    
    console.error(`[BCH Transactions] All APIs failed:`, errors.join('; '));
    return [];
  }
  
  // Try Blockchair for other chains (not BCH)
  let blockchairTransactions: BitcoinTransaction[] | null = null;
  try {
    const baseUrl = getApiBaseUrl(chainId);
    const response = await fetchWithTimeout(
      `${baseUrl}/dashboards/address/${address}?limit=${limit}&transaction_details=true`
    );
    
    if (response.ok) {
      const data = await response.json();
      const addressData = data.data?.[address];
      
      if (addressData) {
        // Check if we have full transaction details in the response
        // Blockchair returns transaction details in data.data[address].transactions as an object
        // when transaction_details=true, but only txids as an array otherwise
        const txDetails = addressData.transactions;
        
        // If transactions is an object with txid keys, we have full details
        if (typeof txDetails === 'object' && !Array.isArray(txDetails) && Object.keys(txDetails).length > 0) {
          const txids = Object.keys(txDetails).slice(0, limit);
          const transactions = txids.map((txid: string) => {
            const tx = txDetails[txid];
            return {
              txid,
              version: tx.version || 1,
              locktime: tx.lock_time || 0,
              vin: (tx.inputs || []).map((input: any) => ({
                txid: input.transaction_hash || '',
                vout: input.index || 0,
                scriptSig: input.scriptsig_hex || '',
                sequence: input.sequence || 0xffffffff,
                addresses: input.recipient ? [input.recipient] : undefined,
                value: input.value,
              })),
              vout: (tx.outputs || []).map((output: any, idx: number) => ({
                value: output.value,
                n: output.index || idx,
                scriptPubKey: {
                  hex: output.scriptpubkey_hex || '',
                  addresses: output.recipient ? [output.recipient] : undefined,
                  type: output.type || 'pubkeyhash',
                },
              })),
              confirmations: tx.block_id > 0 ? 1 : 0,
              time: tx.time ? Math.floor(new Date(tx.time).getTime() / 1000) : undefined,
              blockheight: tx.block_id > 0 ? tx.block_id : undefined,
              fees: tx.fee,
            };
          });
          
          // Only return Blockchair data if we got actual transactions
          if (transactions.length > 0) {
            return transactions;
          }
        }
        
        // Store empty result for fallback comparison
        blockchairTransactions = [];
        // Fall through to try fallback APIs - Blockchair may have incomplete data
        // especially for Zcash transparent addresses
      }
      // If no address data, fall through to try fallback APIs
      // (Blockchair may not index all addresses, especially for Zcash)
    }
    // Blockchair failed or returned incomplete data, try fallbacks
  } catch {
    // Blockchair failed, try fallbacks
  }
  
  // For Zcash, try NOWNodes first (reliable API with key), then Blockchair as fallback
  if (chainId === 'zcash') {
    // Try NOWNodes first - reliable Blockbook API with API key
    try {
      const nowNodesTxs = await getTransactionsNowNodes(address, limit);
      if (nowNodesTxs.length > 0) {
        return nowNodesTxs;
      }
    } catch (e) {
      // NOWNodes failed, continue to fallback
    }
    
    // Return Blockchair data if available (might be empty but at least it's something)
    if (blockchairTransactions !== null) {
      return blockchairTransactions;
    }
    
    return [];
  }
  
  // Return Blockchair data if available
  if (blockchairTransactions) return blockchairTransactions;
  
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
  // Check cache first
  const cached = getCachedTransactions(chainId, address);
  if (cached) {
    return cached.slice(0, limit);
  }
  
  let result: BitcoinTransaction[];
  
  if (chainId === 'bitcoin') {
    result = await getTransactionsBlockstream(address, testnet, limit);
  } else {
    result = await getTransactionsBlockchair(chainId, address, limit);
  }
  
  // Cache the result
  setCachedTransactions(chainId, address, result);
  
  return result;
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
 * Minimum fee rate for Litecoin transactions (sat/vB)
 * Using 2 sat/vB as minimum to ensure reliable relay across all nodes
 */
const LTC_MIN_FEE_RATE = 2;

/**
 * Get fee estimate using Litecoinspace
 */
async function getFeeEstimateLitecoinspace(targetBlocks: number = 6): Promise<BitcoinFeeEstimate> {
  const response = await fetchWithTimeout('https://litecoinspace.org/api/v1/fees/recommended');
  
  if (!response.ok) {
    throw new Error(`Litecoinspace fee API failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Litecoinspace returns { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }
  // All values should be numbers representing sat/vB
  let feeRate: number;
  let estimatedBlocks: number;
  
  // Parse fee rate as number and use appropriate priority level
  if (targetBlocks <= 2) {
    feeRate = Number(data.fastestFee) || 10;
    estimatedBlocks = 1;
  } else if (targetBlocks <= 6) {
    feeRate = Number(data.halfHourFee) || 5;
    estimatedBlocks = 3;
  } else if (targetBlocks <= 12) {
    feeRate = Number(data.hourFee) || 3;
    estimatedBlocks = 6;
  } else {
    feeRate = Number(data.economyFee) || Number(data.minimumFee) || 2;
    estimatedBlocks = 12;
  }
  
  // Ensure minimum fee rate for reliable transaction relay
  // Some nodes may reject transactions with very low fee rates
  feeRate = Math.max(Math.ceil(feeRate), LTC_MIN_FEE_RATE);
  
  return {
    feeRate,
    totalFee: 0, // Will be calculated based on tx size
    estimatedBlocks,
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
  
  // For Litecoin, use Litecoinspace API
  if (chainId === 'litecoin') {
    try {
      return await getFeeEstimateLitecoinspace(targetBlocks);
    } catch (e) {
      // Fall back to conservative default for Litecoin
      // Using higher default to ensure transaction relay
      console.warn('[LTC Fee] Litecoinspace fee API failed, using default:', e);
      return {
        feeRate: 10, // Use 10 sat/vB as safe default
        totalFee: 1000, // Minimum 1000 litoshis total fee
        estimatedBlocks: targetBlocks,
      };
    }
  }
  
  // For other chains, use a sensible default
  const config = getBitcoinChainConfig(chainId);
  return {
    feeRate: Math.max(config.minRelayFee * 10, 5), // At least 5 sat/vB
    totalFee: 0,
    estimatedBlocks: targetBlocks,
  };
}

/**
 * Clear cached balance and transactions for a specific address or all addresses
 */
export function clearBitcoinCache(chainId?: BitcoinChainId, address?: string): void {
  if (chainId && address) {
    const key = getCacheKey(chainId, address);
    balanceCache.delete(key);
    transactionCache.delete(key);
  } else {
    balanceCache.clear();
    transactionCache.clear();
  }
}

/**
 * Broadcast transaction using NOWNodes API for Zcash
 * Primary API for Zcash transaction broadcast - reliable Blockbook-style API with API key
 */
async function broadcastNOWNodes(txHex: string): Promise<string> {
  if (!NOWNODES_API_KEY) {
    throw new Error('NOWNodes API key not configured');
  }
  
  // Blockbook API expects POST to /sendtx/ with hex in body as plain text
  const response = await fetchWithTimeout(
    `${NOWNODES_ZEC_BASE_URL}/sendtx/`,
    {
      method: 'POST',
      headers: {
        'api-key': NOWNODES_API_KEY,
        'Content-Type': 'text/plain',
      },
      body: txHex,
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NOWNodes broadcast failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // Blockbook returns { result: "txid" } on success
  if (data.result) {
    return data.result;
  }
  
  // Some APIs return the txid directly as a string
  if (typeof data === 'string') {
    return data;
  }
  
  throw new Error('Unexpected broadcast response format');
}

/**
 * Broadcast a signed transaction using Litecoinspace
 */
async function broadcastLitecoinspace(txHex: string): Promise<string> {
  const response = await fetchWithTimeout('https://litecoinspace.org/api/tx', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: txHex,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Litecoinspace broadcast failed: ${error}`);
  }
  
  return await response.text(); // Returns txid
}

/**
 * Broadcast a signed transaction using FullStack.cash API (for BCH only)
 * FullStack.cash provides a free Electrumx API for Bitcoin Cash
 */
async function broadcastFullStack(txHex: string): Promise<string> {
  const response = await fetchWithTimeout(
    'https://api.fullstack.cash/v5/rawtransactions/sendRawTransaction',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hexes: [txHex] }),
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FullStack.cash broadcast failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // FullStack.cash returns an array of txids
  if (Array.isArray(data) && data.length > 0) {
    // Check if it's an error message
    if (typeof data[0] === 'string' && data[0].includes('error')) {
      throw new Error(`FullStack.cash broadcast rejected: ${data[0]}`);
    }
    return data[0];
  }
  
  // Handle alternate response format
  if (data.txid) {
    return data.txid;
  }
  
  if (data.success === false) {
    throw new Error(`FullStack.cash broadcast failed: ${data.error || 'Unknown error'}`);
  }
  
  throw new Error('FullStack.cash returned unexpected response format');
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
  
  // For Litecoin, use Litecoinspace with Blockchair fallback
  if (chainId === 'litecoin') {
    const errors: string[] = [];
    
    // Try Litecoinspace first
    try {
      return await broadcastLitecoinspace(txHex);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    
    // Try Blockchair as fallback
    try {
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
        throw new Error(`Blockchair: ${error}`);
      }
      
      const result = await response.json();
      return result.data.transaction_hash;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    
    throw new Error(`Failed to broadcast transaction: ${errors.join('; ')}`);
  }
  
  // For Zcash, use NOWNodes with Blockchair fallback
  if (chainId === 'zcash') {
    const errors: string[] = [];
    
    // Try NOWNodes first - reliable API with key
    try {
      return await broadcastNOWNodes(txHex);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`NOWNodes: ${errorMsg}`);
    }
    
    // Try Blockchair as fallback
    try {
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
        throw new Error(`Blockchair: ${error}`);
      }
      
      const result = await response.json();
      return result.data.transaction_hash;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Blockchair: ${errorMsg}`);
    }
    
    throw new Error(`Failed to broadcast transaction: ${errors.join('; ')}`);
  }
  
  // For Bitcoin Cash, use FullStack.cash as primary (Blockchair is often rate-limited)
  if (chainId === 'bitcoincash') {
    const errors: string[] = [];
    
    // Try FullStack.cash first - free API for BCH
    try {
      return await broadcastFullStack(txHex);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`FullStack.cash: ${errorMsg}`);
    }
    
    // Try Blockchair as fallback
    try {
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
        throw new Error(`Blockchair: ${error}`);
      }
      
      const result = await response.json();
      return result.data.transaction_hash;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Blockchair: ${errorMsg}`);
    }
    
    console.error(`[BCH Broadcast] All APIs failed:`, errors.join('; '));
    throw new Error(`Failed to broadcast transaction: ${errors.join('; ')}`);
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
  
  // For Zcash, try NOWNodes first to avoid Blockchair rate limits
  if (chainId === 'zcash') {
    const errors: string[] = [];
    
    // Try NOWNodes first
    try {
      if (NOWNODES_API_KEY) {
        const response = await fetchWithTimeout(`${NOWNODES_ZEC_BASE_URL}/api/v2`, {
          headers: { 'api-key': NOWNODES_API_KEY }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.blockbook?.bestHeight) {
            return data.blockbook.bestHeight;
          }
        }
      }
    } catch (e) {
      errors.push(`NOWNodes: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Fallback to Blockchair
    try {
      const baseUrl = getApiBaseUrl(chainId);
      const response = await fetchWithTimeout(`${baseUrl}/stats`);
      
      if (response.ok) {
        const data = await response.json();
        return data.data.blocks;
      }
    } catch (e) {
      errors.push(`Blockchair: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    throw new Error(`Failed to get block height: ${errors.join('; ')}`);
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
