/**
 * useRecentRecipients Hook
 * 
 * Manages recent transaction recipients per chain with:
 * - Last 10 recipients stored per chain
 * - Deduplication and timestamp updates on reuse
 * - Fuzzy search/filtering capability
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { sendToBackground } from '@shared/messaging';
import type { 
  RecentRecipient, 
  RecentRecipientsMap, 
  WalletSettings,
  ChainType,
  EVMChainId,
  SolanaNetwork,
} from '@shared/types';
import { MAX_RECENT_RECIPIENTS } from '@shared/types';

/**
 * Chain configurations for deriving chain IDs
 */
const EVM_CHAIN_IDS: Record<EVMChainId, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
};

/**
 * Build a chain identifier string for storage key
 */
export function buildChainId(
  chainType: ChainType,
  solanaNetwork?: SolanaNetwork,
  evmChainId?: EVMChainId | null
): string {
  if (chainType === 'solana') {
    return `solana:${solanaNetwork || 'mainnet-beta'}`;
  }
  const numericChainId = evmChainId ? EVM_CHAIN_IDS[evmChainId] : 1;
  return `evm:${numericChainId}`;
}

/**
 * Simple fuzzy match for recipient search
 * Matches if all characters in the query appear in order in the target
 */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < lowerTarget.length && queryIndex < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
}

/**
 * Score a recipient for fuzzy matching (higher = better match)
 */
export function fuzzyScore(query: string, recipient: RecentRecipient): number {
  if (!query) return recipient.lastUsedAt; // Sort by recency when no query
  
  const lowerQuery = query.toLowerCase();
  let score = 0;
  
  // Check address match
  const lowerAddress = recipient.address.toLowerCase();
  if (lowerAddress.startsWith(lowerQuery)) {
    score += 1000; // Prefix match bonus
  } else if (lowerAddress.includes(lowerQuery)) {
    score += 500; // Substring match
  } else if (fuzzyMatch(query, recipient.address)) {
    score += 100; // Fuzzy match
  }
  
  // Check label match (if exists)
  if (recipient.label) {
    const lowerLabel = recipient.label.toLowerCase();
    if (lowerLabel.startsWith(lowerQuery)) {
      score += 2000; // Label prefix match (highest priority)
    } else if (lowerLabel.includes(lowerQuery)) {
      score += 1500; // Label substring match
    } else if (fuzzyMatch(query, recipient.label)) {
      score += 200; // Label fuzzy match
    }
  }
  
  // Add recency bonus (more recent = higher score)
  score += recipient.lastUsedAt / 1e12; // Normalize timestamp contribution
  
  // Add use count bonus
  score += recipient.useCount * 10;
  
  return score;
}

/**
 * Add or update a recipient in the list
 * Handles deduplication and cap at MAX_RECENT_RECIPIENTS
 */
export function upsertRecipient(
  recipients: RecentRecipient[],
  address: string,
  label?: string
): RecentRecipient[] {
  const normalizedAddress = address.toLowerCase();
  const now = Date.now();
  
  // Find existing recipient (case-insensitive)
  const existingIndex = recipients.findIndex(
    r => r.address.toLowerCase() === normalizedAddress
  );
  
  let updated: RecentRecipient[];
  
  if (existingIndex >= 0) {
    // Update existing recipient
    const existing = recipients[existingIndex];
    const updatedRecipient: RecentRecipient = {
      ...existing,
      address: address, // Preserve original casing from latest use
      label: label || existing.label, // Keep existing label if no new one provided
      lastUsedAt: now,
      useCount: existing.useCount + 1,
    };
    
    // Remove from current position and add to front
    updated = [
      updatedRecipient,
      ...recipients.slice(0, existingIndex),
      ...recipients.slice(existingIndex + 1),
    ];
  } else {
    // Add new recipient at the front
    const newRecipient: RecentRecipient = {
      address,
      label,
      lastUsedAt: now,
      useCount: 1,
    };
    updated = [newRecipient, ...recipients];
  }
  
  // Cap at MAX_RECENT_RECIPIENTS
  return updated.slice(0, MAX_RECENT_RECIPIENTS);
}

/**
 * Filter recipients by query (fuzzy search after 2+ chars)
 */
export function filterRecipients(
  recipients: RecentRecipient[],
  query: string
): RecentRecipient[] {
  // If query is less than 2 chars, return as-is (sorted by recency)
  if (query.length < 2) {
    return [...recipients].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }
  
  // Filter and sort by fuzzy score
  return recipients
    .filter(r => {
      const matchesAddress = fuzzyMatch(query, r.address);
      const matchesLabel = r.label ? fuzzyMatch(query, r.label) : false;
      return matchesAddress || matchesLabel;
    })
    .sort((a, b) => fuzzyScore(query, b) - fuzzyScore(query, a));
}

/**
 * Hook return type
 */
export interface UseRecentRecipientsResult {
  /** Recent recipients for current chain (filtered if query provided) */
  recipients: RecentRecipient[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Add or update a recipient after successful send */
  addRecipient: (address: string, label?: string) => Promise<void>;
  /** Update the label for an existing recipient */
  updateLabel: (address: string, label: string) => Promise<void>;
  /** Remove a recipient from history */
  removeRecipient: (address: string) => Promise<void>;
  /** Refresh recipients from storage */
  refresh: () => Promise<void>;
}

/**
 * Hook to manage recent recipients for the current chain
 */
export function useRecentRecipients(
  chainType: ChainType,
  solanaNetwork?: SolanaNetwork,
  evmChainId?: EVMChainId | null,
  filterQuery?: string
): UseRecentRecipientsResult {
  const [allRecipients, setAllRecipients] = useState<RecentRecipientsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Build chain identifier
  const chainIdKey = useMemo(
    () => buildChainId(chainType, solanaNetwork, evmChainId),
    [chainType, solanaNetwork, evmChainId]
  );
  
  // Get recipients for current chain
  const chainRecipients = useMemo(
    () => allRecipients[chainIdKey] || [],
    [allRecipients, chainIdKey]
  );
  
  // Filter recipients based on query
  const filteredRecipients = useMemo(
    () => filterRecipients(chainRecipients, filterQuery || ''),
    [chainRecipients, filterQuery]
  );
  
  // Fetch recipients from storage
  const fetchRecipients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await sendToBackground({
        type: 'WALLET_GET_SETTINGS',
        payload: undefined,
      });
      
      if (response.success && response.data) {
        const settings = response.data as WalletSettings;
        setAllRecipients(settings.recentRecipients || {});
      } else {
        setError(response.error || 'Failed to load recent recipients');
      }
    } catch (err) {
      setError('Failed to load recent recipients');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Save recipients to storage
  const saveRecipients = useCallback(async (updated: RecentRecipientsMap) => {
    try {
      const response = await sendToBackground({
        type: 'WALLET_SET_SETTINGS',
        payload: { recentRecipients: updated },
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to save recipients');
      }
      
      setAllRecipients(updated);
    } catch (err) {
      setError('Failed to save recipient');
      throw err;
    }
  }, []);
  
  // Add or update a recipient
  const addRecipient = useCallback(async (address: string, label?: string) => {
    const currentChainRecipients = allRecipients[chainIdKey] || [];
    const updatedChainRecipients = upsertRecipient(currentChainRecipients, address, label);
    
    const updatedAll: RecentRecipientsMap = {
      ...allRecipients,
      [chainIdKey]: updatedChainRecipients,
    };
    
    await saveRecipients(updatedAll);
  }, [allRecipients, chainIdKey, saveRecipients]);
  
  // Update label for an existing recipient
  const updateLabel = useCallback(async (address: string, label: string) => {
    const currentChainRecipients = allRecipients[chainIdKey] || [];
    const normalizedAddress = address.toLowerCase();
    
    const updatedChainRecipients = currentChainRecipients.map(r => 
      r.address.toLowerCase() === normalizedAddress
        ? { ...r, label }
        : r
    );
    
    const updatedAll: RecentRecipientsMap = {
      ...allRecipients,
      [chainIdKey]: updatedChainRecipients,
    };
    
    await saveRecipients(updatedAll);
  }, [allRecipients, chainIdKey, saveRecipients]);
  
  // Remove a recipient
  const removeRecipient = useCallback(async (address: string) => {
    const currentChainRecipients = allRecipients[chainIdKey] || [];
    const normalizedAddress = address.toLowerCase();
    
    const updatedChainRecipients = currentChainRecipients.filter(
      r => r.address.toLowerCase() !== normalizedAddress
    );
    
    const updatedAll: RecentRecipientsMap = {
      ...allRecipients,
      [chainIdKey]: updatedChainRecipients,
    };
    
    await saveRecipients(updatedAll);
  }, [allRecipients, chainIdKey, saveRecipients]);
  
  // Initial fetch
  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);
  
  return {
    recipients: filteredRecipients,
    loading,
    error,
    addRecipient,
    updateLabel,
    removeRecipient,
    refresh: fetchRecipients,
  };
}

export default useRecentRecipients;
