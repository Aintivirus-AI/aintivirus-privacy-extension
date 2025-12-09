import { StorageSchema, DEFAULT_STORAGE } from './types';


export const storage = {
  async get<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K]> {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? DEFAULT_STORAGE[key];
  },

  async getAll(): Promise<StorageSchema> {
    const result = await chrome.storage.local.get(null);
    return {
      ...DEFAULT_STORAGE,
      ...result,
    } as StorageSchema;
  },

  async set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },

  async setMultiple(items: Partial<StorageSchema>): Promise<void> {
    await chrome.storage.local.set(items);
  },

  async remove<K extends keyof StorageSchema>(key: K): Promise<void> {
    await chrome.storage.local.remove(key);
  },

  async clear(): Promise<void> {
    await chrome.storage.local.clear();
  },

  
  onChange(callback: (changes: { [K in keyof StorageSchema]?: { oldValue?: StorageSchema[K]; newValue?: StorageSchema[K] } }) => void): () => void {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local') {
        callback(changes as Parameters<typeof callback>[0]);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  },
};


export async function initializeStorage(): Promise<void> {
  const current = await storage.get('initialized');
  
  if (!current) {
    await storage.setMultiple({
      ...DEFAULT_STORAGE,
      initialized: true,
    });
  }
}

