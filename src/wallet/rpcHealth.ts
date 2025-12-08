/**
 * AINTIVIRUS Wallet Module - RPC Health Manager
 * 
 * Provides health tracking and smart endpoint selection for Solana RPC:
 * - Latency tracking per endpoint
 * - Success/failure rate monitoring
 * - Health-aware rotation across fallback RPCs
 * - User-configurable custom endpoints
 * - Endpoint validation before adding
 * 
 * SECURITY: Only HTTPS endpoints are allowed for RPC connections.
 */

import { Connection } from '@solana/web3.js';
import {
  SolanaNetwork,
  NETWORK_CONFIGS,
  RpcEndpointHealth,
  DEFAULT_RPC_HEALTH,
} from './types';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEY_RPC_HEALTH = 'rpcHealth';
const STORAGE_KEY_CUSTOM_RPCS = 'customRpcUrls';

// ============================================
// MODULE STATE
// ============================================

/** In-memory cache of RPC health data */
let healthCache: Record<string, RpcEndpointHealth> = {};

/** Last time health was persisted to storage */
let lastPersist = 0;

/** Persist interval (every 30 seconds) */
const PERSIST_INTERVAL = 30 * 1000;

// ============================================
// HEALTH DATA MANAGEMENT
// ============================================

/**
 * Get all RPC health data from storage
 */
export async function getAllRpcHealth(): Promise<Record<string, RpcEndpointHealth>> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_RPC_HEALTH);
    const stored = result[STORAGE_KEY_RPC_HEALTH] || {};
    healthCache = { ...stored };
    return healthCache;
  } catch (error) {
    console.error('[RpcHealth] Failed to read health data:', error);
    return {};
  }
}

/**
 * Get health data for a specific RPC endpoint
 */
export async function getRpcHealth(url: string): Promise<RpcEndpointHealth> {
  const all = await getAllRpcHealth();
  return all[url] || createDefaultHealth(url);
}

/**
 * Create default health data for a new endpoint
 */
function createDefaultHealth(url: string): RpcEndpointHealth {
  return {
    url,
    latencyMs: -1,
    lastSuccess: 0,
    lastFailure: null,
    failureCount: 0,
    successCount: 0,
  };
}

/**
 * Persist health data to storage (debounced)
 */
async function persistHealthData(): Promise<void> {
  const now = Date.now();
  if (now - lastPersist < PERSIST_INTERVAL) {
    return; // Debounce
  }
  
  lastPersist = now;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_RPC_HEALTH]: healthCache });
  } catch (error) {
    console.error('[RpcHealth] Failed to persist health data:', error);
  }
}

/**
 * Record a successful RPC call
 */
export async function recordRpcSuccess(url: string, latencyMs: number): Promise<void> {
  const health = healthCache[url] || createDefaultHealth(url);
  
  // Exponential moving average for latency
  if (health.latencyMs < 0) {
    health.latencyMs = latencyMs;
  } else {
    health.latencyMs = Math.round(health.latencyMs * 0.7 + latencyMs * 0.3);
  }
  
  health.lastSuccess = Date.now();
  health.successCount++;
  health.failureCount = Math.max(0, health.failureCount - 1); // Decay failure count on success
  
  healthCache[url] = health;
  await persistHealthData();
}

/**
 * Record a failed RPC call
 */
export async function recordRpcFailure(url: string, error?: string): Promise<void> {
  const health = healthCache[url] || createDefaultHealth(url);
  
  health.lastFailure = Date.now();
  health.failureCount++;
  
  healthCache[url] = health;
  await persistHealthData();
  
  console.warn(`[RpcHealth] Failure recorded for ${url}: ${error || 'Unknown error'}`);
}

/**
 * Calculate health score for an endpoint (0-100)
 * Higher is better
 */
export function calculateHealthScore(health: RpcEndpointHealth): number {
  const now = Date.now();
  let score = 50; // Start at neutral
  
  // Recent success is good
  if (health.lastSuccess > 0) {
    const successAge = now - health.lastSuccess;
    if (successAge < 60000) { // Within last minute
      score += 20;
    } else if (successAge < 300000) { // Within last 5 minutes
      score += 10;
    }
  }
  
  // Recent failure is bad
  if (health.lastFailure) {
    const failureAge = now - health.lastFailure;
    if (failureAge < 60000) { // Within last minute
      score -= 30;
    } else if (failureAge < 300000) { // Within last 5 minutes
      score -= 15;
    }
  }
  
  // Failure count penalty
  score -= Math.min(health.failureCount * 5, 30);
  
  // Success count bonus (capped)
  score += Math.min(health.successCount, 10);
  
  // Low latency bonus
  if (health.latencyMs > 0) {
    if (health.latencyMs < 200) {
      score += 15;
    } else if (health.latencyMs < 500) {
      score += 5;
    } else if (health.latencyMs > 2000) {
      score -= 10;
    }
  }
  
  return Math.max(0, Math.min(100, score));
}

// ============================================
// ENDPOINT SELECTION
// ============================================

/**
 * Get the best RPC endpoint for a network based on health scores
 */
export async function getBestRpcEndpoint(
  network: SolanaNetwork,
  excludeUrls: string[] = []
): Promise<string> {
  const config = NETWORK_CONFIGS[network];
  const customRpcs = await getCustomRpcUrls(network);
  
  // Combine default and custom endpoints
  const allUrls = [
    config.rpcUrl,
    ...config.fallbackRpcUrls,
    ...customRpcs,
  ].filter(url => !excludeUrls.includes(url));
  
  if (allUrls.length === 0) {
    // All endpoints excluded, return primary as last resort
    return config.rpcUrl;
  }
  
  // Get health for all endpoints
  const healthData = await getAllRpcHealth();
  
  // Score and sort endpoints
  const scored = allUrls.map(url => ({
    url,
    score: calculateHealthScore(healthData[url] || createDefaultHealth(url)),
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  // Return best endpoint
  return scored[0].url;
}

/**
 * Get all available RPC endpoints for a network, sorted by health
 */
export async function getSortedRpcEndpoints(network: SolanaNetwork): Promise<string[]> {
  const config = NETWORK_CONFIGS[network];
  const customRpcs = await getCustomRpcUrls(network);
  
  const allUrls = [
    config.rpcUrl,
    ...config.fallbackRpcUrls,
    ...customRpcs,
  ];
  
  const healthData = await getAllRpcHealth();
  
  const scored = allUrls.map(url => ({
    url,
    score: calculateHealthScore(healthData[url] || createDefaultHealth(url)),
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  return scored.map(s => s.url);
}

// ============================================
// CUSTOM RPC MANAGEMENT
// ============================================

/**
 * Get user-configured custom RPC URLs
 */
export async function getCustomRpcUrls(network: SolanaNetwork): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_CUSTOM_RPCS);
    const allCustom = result[STORAGE_KEY_CUSTOM_RPCS] || {};
    return allCustom[network] || [];
  } catch (error) {
    console.error('[RpcHealth] Failed to read custom RPCs:', error);
    return [];
  }
}

/**
 * Add a custom RPC URL
 * Validates the URL and tests connectivity before adding
 */
export async function addCustomRpcUrl(
  network: SolanaNetwork,
  url: string
): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Require HTTPS
  if (!url.startsWith('https://')) {
    return { success: false, error: 'Only HTTPS URLs are allowed for security' };
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }
  
  // Test the endpoint
  const testResult = await testRpcEndpoint(url);
  if (!testResult.success) {
    return { success: false, error: testResult.error };
  }
  
  // Add to storage
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_CUSTOM_RPCS);
    const allCustom = result[STORAGE_KEY_CUSTOM_RPCS] || {};
    const networkRpcs = allCustom[network] || [];
    
    if (networkRpcs.includes(url)) {
      return { success: false, error: 'RPC URL already added' };
    }
    
    networkRpcs.push(url);
    allCustom[network] = networkRpcs;
    
    await chrome.storage.local.set({ [STORAGE_KEY_CUSTOM_RPCS]: allCustom });
    console.log(`[RpcHealth] Added custom RPC for ${network}: ${url}`);
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save' 
    };
  }
}

/**
 * Remove a custom RPC URL
 */
export async function removeCustomRpcUrl(
  network: SolanaNetwork,
  url: string
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_CUSTOM_RPCS);
    const allCustom = result[STORAGE_KEY_CUSTOM_RPCS] || {};
    const networkRpcs = allCustom[network] || [];
    
    allCustom[network] = networkRpcs.filter((u: string) => u !== url);
    
    await chrome.storage.local.set({ [STORAGE_KEY_CUSTOM_RPCS]: allCustom });
    
    // Also remove health data
    delete healthCache[url];
    await chrome.storage.local.set({ [STORAGE_KEY_RPC_HEALTH]: healthCache });
    
    console.log(`[RpcHealth] Removed custom RPC for ${network}: ${url}`);
  } catch (error) {
    console.error('[RpcHealth] Failed to remove custom RPC:', error);
    throw error;
  }
}

// ============================================
// ENDPOINT TESTING
// ============================================

/**
 * Test an RPC endpoint for connectivity and measure latency
 */
export async function testRpcEndpoint(url: string): Promise<{
  success: boolean;
  latencyMs?: number;
  blockHeight?: number;
  error?: string;
}> {
  // SECURITY: Require HTTPS
  if (!url.startsWith('https://')) {
    return { success: false, error: 'Only HTTPS URLs are allowed' };
  }
  
  try {
    const connection = new Connection(url, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 10000,
    });
    
    const startTime = performance.now();
    const blockHeight = await connection.getBlockHeight();
    const latencyMs = Math.round(performance.now() - startTime);
    
    // Record success
    await recordRpcSuccess(url, latencyMs);
    
    return {
      success: true,
      latencyMs,
      blockHeight,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Connection failed';
    await recordRpcFailure(url, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Test all endpoints for a network and update health data
 */
export async function testAllEndpoints(network: SolanaNetwork): Promise<{
  url: string;
  success: boolean;
  latencyMs?: number;
  error?: string;
}[]> {
  const endpoints = await getSortedRpcEndpoints(network);
  const results = [];
  
  for (const url of endpoints) {
    const result = await testRpcEndpoint(url);
    results.push({ url, ...result });
  }
  
  return results;
}

// ============================================
// HEALTH SUMMARY
// ============================================

/**
 * Get health summary for all endpoints on a network
 */
export async function getRpcHealthSummary(network: SolanaNetwork): Promise<{
  endpoints: (RpcEndpointHealth & { score: number; isCustom: boolean })[];
  bestEndpoint: string;
  healthyCount: number;
  unhealthyCount: number;
}> {
  const config = NETWORK_CONFIGS[network];
  const customRpcs = await getCustomRpcUrls(network);
  const healthData = await getAllRpcHealth();
  
  const allUrls = [
    config.rpcUrl,
    ...config.fallbackRpcUrls,
    ...customRpcs,
  ];
  
  const endpoints = allUrls.map(url => {
    const health = healthData[url] || createDefaultHealth(url);
    const score = calculateHealthScore(health);
    return {
      ...health,
      score,
      isCustom: customRpcs.includes(url),
    };
  });
  
  endpoints.sort((a, b) => b.score - a.score);
  
  const healthyCount = endpoints.filter(e => e.score >= 50).length;
  const unhealthyCount = endpoints.length - healthyCount;
  
  return {
    endpoints,
    bestEndpoint: endpoints[0]?.url || config.rpcUrl,
    healthyCount,
    unhealthyCount,
  };
}

/**
 * Clear all health data (for testing/reset)
 */
export async function clearAllRpcHealth(): Promise<void> {
  healthCache = {};
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_RPC_HEALTH]: {} });
  } catch (error) {
    console.error('[RpcHealth] Failed to clear health data:', error);
  }
}

/**
 * Initialize RPC health manager
 */
export async function initializeRpcHealth(): Promise<void> {
  await getAllRpcHealth();
  console.log('[RpcHealth] Initialized');
}





