

import { Connection } from '@solana/web3.js';
import {
  SolanaNetwork,
  NETWORK_CONFIGS,
  RpcEndpointHealth,
  DEFAULT_RPC_HEALTH,
} from './types';


const STORAGE_KEY_RPC_HEALTH = 'rpcHealth';
const STORAGE_KEY_CUSTOM_RPCS = 'customRpcUrls';


let healthCache: Record<string, RpcEndpointHealth> = {};


let lastPersist = 0;


const PERSIST_INTERVAL = 30 * 1000;


let lastStorageRead = 0;


const STORAGE_READ_INTERVAL = 10 * 1000;


export async function getAllRpcHealth(): Promise<Record<string, RpcEndpointHealth>> {
  const now = Date.now();
  
  
  if (Object.keys(healthCache).length > 0 && now - lastStorageRead < STORAGE_READ_INTERVAL) {
    return healthCache;
  }
  
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_RPC_HEALTH);
    const stored = result[STORAGE_KEY_RPC_HEALTH] || {};
    healthCache = { ...stored };
    lastStorageRead = now;
    return healthCache;
  } catch (error) {

    return healthCache; 
  }
}


export async function getRpcHealth(url: string): Promise<RpcEndpointHealth> {
  const all = await getAllRpcHealth();
  return all[url] || createDefaultHealth(url);
}


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


async function persistHealthData(): Promise<void> {
  const now = Date.now();
  if (now - lastPersist < PERSIST_INTERVAL) {
    return; 
  }
  
  lastPersist = now;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_RPC_HEALTH]: healthCache });
  } catch (error) {

  }
}


export async function recordRpcSuccess(url: string, latencyMs: number): Promise<void> {
  const health = healthCache[url] || createDefaultHealth(url);
  
  
  if (health.latencyMs < 0) {
    health.latencyMs = latencyMs;
  } else {
    health.latencyMs = Math.round(health.latencyMs * 0.7 + latencyMs * 0.3);
  }
  
  health.lastSuccess = Date.now();
  health.successCount++;
  health.failureCount = Math.max(0, health.failureCount - 1); 
  
  healthCache[url] = health;
  await persistHealthData();
}


function isHardFailure(error?: string): boolean {
  if (!error) return false;
  
  return error.includes('403') || 
         error.includes('401') || 
         error.includes('forbidden') || 
         error.includes('Access denied') ||
         error.includes('API key') ||
         error.includes('-32052'); 
}


export async function recordRpcFailure(url: string, error?: string): Promise<void> {
  const health = healthCache[url] || createDefaultHealth(url);
  
  health.lastFailure = Date.now();
  
  
  if (isHardFailure(error)) {
    health.failureCount += 10; 

  } else {
    health.failureCount++;

  }
  
  healthCache[url] = health;
  await persistHealthData();
}


export function calculateHealthScore(health: RpcEndpointHealth): number {
  const now = Date.now();
  let score = 50; 
  
  
  if (health.lastFailure) {
    const failureAge = now - health.lastFailure;
    if (failureAge < 10000) { 
      score -= 50; 
    } else if (failureAge < 60000) { 
      score -= 30;
    } else if (failureAge < 300000) { 
      score -= 15;
    }
  }
  
  
  if (health.lastSuccess > 0) {
    const successAge = now - health.lastSuccess;
    if (successAge < 60000) { 
      score += 20;
    } else if (successAge < 300000) { 
      score += 10;
    }
  }
  
  
  if (health.failureCount >= 10) {
    score -= 50; 
  } else {
    score -= Math.min(health.failureCount * 5, 30);
  }
  
  
  score += Math.min(health.successCount, 10);
  
  
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


export async function getBestRpcEndpoint(
  network: SolanaNetwork,
  excludeUrls: string[] = []
): Promise<string> {
  const config = NETWORK_CONFIGS[network];
  const customRpcs = await getCustomRpcUrls(network);
  
  
  const allUrls = [
    config.rpcUrl,
    ...config.fallbackRpcUrls,
    ...customRpcs,
  ].filter(url => !excludeUrls.includes(url));
  
  if (allUrls.length === 0) {
    
    return config.rpcUrl;
  }
  
  
  const healthData = await getAllRpcHealth();
  
  
  const scored = allUrls.map(url => ({
    url,
    score: calculateHealthScore(healthData[url] || createDefaultHealth(url)),
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  
  return scored[0].url;
}


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


export async function getCustomRpcUrls(network: SolanaNetwork): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_CUSTOM_RPCS);
    const allCustom = result[STORAGE_KEY_CUSTOM_RPCS] || {};
    return allCustom[network] || [];
  } catch (error) {

    return [];
  }
}


export async function addCustomRpcUrl(
  network: SolanaNetwork,
  url: string
): Promise<{ success: boolean; error?: string }> {
  
  if (!url.startsWith('https://')) {
    return { success: false, error: 'Only HTTPS URLs are allowed for security' };
  }
  
  
  try {
    new URL(url);
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }
  
  
  const testResult = await testRpcEndpoint(url);
  if (!testResult.success) {
    return { success: false, error: testResult.error };
  }
  
  
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

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save' 
    };
  }
}


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
    
    
    delete healthCache[url];
    await chrome.storage.local.set({ [STORAGE_KEY_RPC_HEALTH]: healthCache });

  } catch (error) {

    throw error;
  }
}


export async function testRpcEndpoint(url: string): Promise<{
  success: boolean;
  latencyMs?: number;
  blockHeight?: number;
  error?: string;
}> {
  
  if (!url.startsWith('https://')) {
    return { success: false, error: 'Only HTTPS URLs are allowed' };
  }
  
  try {
    const connection = new Connection(url, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 10000,
      disableRetryOnRateLimit: true,
    });
    
    const startTime = performance.now();
    const blockHeight = await connection.getBlockHeight();
    const latencyMs = Math.round(performance.now() - startTime);
    
    
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


export async function clearAllRpcHealth(): Promise<void> {
  healthCache = {};
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_RPC_HEALTH]: {} });

  } catch (error) {

  }
}


function decayHealthMetrics(health: RpcEndpointHealth): RpcEndpointHealth {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  
  
  if (health.lastFailure && now - health.lastFailure > ONE_HOUR) {
    const hoursAgo = Math.floor((now - health.lastFailure) / ONE_HOUR);
    const decayedFailures = Math.max(0, health.failureCount - hoursAgo);
    return { ...health, failureCount: decayedFailures };
  }
  
  return health;
}


export async function initializeRpcHealth(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_RPC_HEALTH);
    const stored = result[STORAGE_KEY_RPC_HEALTH] || {};
    
    
    healthCache = {};
    for (const [url, health] of Object.entries(stored)) {
      healthCache[url] = decayHealthMetrics(health as RpcEndpointHealth);
    }

  } catch (error) {

    healthCache = {};
  }
}

