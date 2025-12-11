

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


const EVM_CHAIN_IDS: Record<EVMChainId, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
};


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


export function fuzzyScore(query: string, recipient: RecentRecipient): number {
  if (!query) return recipient.lastUsedAt; 
  
  const lowerQuery = query.toLowerCase();
  let score = 0;
  
  
  const lowerAddress = recipient.address.toLowerCase();
  if (lowerAddress.startsWith(lowerQuery)) {
    score += 1000; 
  } else if (lowerAddress.includes(lowerQuery)) {
    score += 500; 
  } else if (fuzzyMatch(query, recipient.address)) {
    score += 100; 
  }
  
  
  if (recipient.label) {
    const lowerLabel = recipient.label.toLowerCase();
    if (lowerLabel.startsWith(lowerQuery)) {
      score += 2000; 
    } else if (lowerLabel.includes(lowerQuery)) {
      score += 1500; 
    } else if (fuzzyMatch(query, recipient.label)) {
      score += 200; 
    }
  }
  
  
  score += recipient.lastUsedAt / 1e12; 
  
  
  score += recipient.useCount * 10;
  
  return score;
}


export function upsertRecipient(
  recipients: RecentRecipient[],
  address: string,
  label?: string
): RecentRecipient[] {
  const normalizedAddress = address.toLowerCase();
  const now = Date.now();
  
  
  const existingIndex = recipients.findIndex(
    r => r.address.toLowerCase() === normalizedAddress
  );
  
  let updated: RecentRecipient[];
  
  if (existingIndex >= 0) {
    
    const existing = recipients[existingIndex];
    const updatedRecipient: RecentRecipient = {
      ...existing,
      address: address, 
      label: label || existing.label, 
      lastUsedAt: now,
      useCount: existing.useCount + 1,
    };
    
    
    updated = [
      updatedRecipient,
      ...recipients.slice(0, existingIndex),
      ...recipients.slice(existingIndex + 1),
    ];
  } else {
    
    const newRecipient: RecentRecipient = {
      address,
      label,
      lastUsedAt: now,
      useCount: 1,
    };
    updated = [newRecipient, ...recipients];
  }
  
  
  return updated.slice(0, MAX_RECENT_RECIPIENTS);
}


export function filterRecipients(
  recipients: RecentRecipient[],
  query: string
): RecentRecipient[] {
  
  if (query.length < 2) {
    return [...recipients].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }
  
  
  return recipients
    .filter(r => {
      const matchesAddress = fuzzyMatch(query, r.address);
      const matchesLabel = r.label ? fuzzyMatch(query, r.label) : false;
      return matchesAddress || matchesLabel;
    })
    .sort((a, b) => fuzzyScore(query, b) - fuzzyScore(query, a));
}


export interface UseRecentRecipientsResult {
  
  recipients: RecentRecipient[];
  
  loading: boolean;
  
  error: string | null;
  
  addRecipient: (address: string, label?: string) => Promise<void>;
  
  updateLabel: (address: string, label: string) => Promise<void>;
  
  removeRecipient: (address: string) => Promise<void>;
  
  refresh: () => Promise<void>;
}


export function useRecentRecipients(
  chainType: ChainType,
  solanaNetwork?: SolanaNetwork,
  evmChainId?: EVMChainId | null,
  filterQuery?: string
): UseRecentRecipientsResult {
  const [allRecipients, setAllRecipients] = useState<RecentRecipientsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  
  const chainIdKey = useMemo(
    () => buildChainId(chainType, solanaNetwork, evmChainId),
    [chainType, solanaNetwork, evmChainId]
  );
  
  
  const chainRecipients = useMemo(
    () => allRecipients[chainIdKey] || [],
    [allRecipients, chainIdKey]
  );
  
  
  const filteredRecipients = useMemo(
    () => filterRecipients(chainRecipients, filterQuery || ''),
    [chainRecipients, filterQuery]
  );
  
  
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
  
  
  const addRecipient = useCallback(async (address: string, label?: string) => {
    const currentChainRecipients = allRecipients[chainIdKey] || [];
    const updatedChainRecipients = upsertRecipient(currentChainRecipients, address, label);
    
    const updatedAll: RecentRecipientsMap = {
      ...allRecipients,
      [chainIdKey]: updatedChainRecipients,
    };
    
    await saveRecipients(updatedAll);
  }, [allRecipients, chainIdKey, saveRecipients]);
  
  
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



