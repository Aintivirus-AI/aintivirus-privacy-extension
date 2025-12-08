import { useState, useEffect, useCallback } from 'react';

/**
 * Session storage keys for privacy-related settings
 * These are stored in chrome.storage.session which clears on browser restart
 */
export const SESSION_KEYS = {
  HIDE_BALANCES: 'hideBalances',
  ACTIVE_TAB: 'activeTab',
} as const;

export type SessionKey = typeof SESSION_KEYS[keyof typeof SESSION_KEYS];

/**
 * Hook for reading and writing to chrome.storage.session
 * Session storage is cleared when the browser closes, making it ideal for
 * privacy-sensitive settings that shouldn't persist across sessions.
 * 
 * @param key - The session storage key
 * @param defaultValue - Default value if the key doesn't exist
 * @returns [value, setValue, isLoading] tuple
 */
export function useSessionSetting<T>(
  key: SessionKey,
  defaultValue: T
): [T, (value: T) => Promise<void>, boolean] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial value from session storage
  useEffect(() => {
    const loadValue = async () => {
      try {
        // Check if session storage is available (requires Manifest V3)
        if (chrome?.storage?.session) {
          const result = await chrome.storage.session.get(key);
          if (result[key] !== undefined) {
            setValueState(result[key] as T);
          }
        }
      } catch (error) {
        console.warn(`[useSessionSetting] Failed to load ${key}:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    loadValue();
  }, [key]);

  // Listen for changes from other popup instances
  useEffect(() => {
    const handleChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'session' && changes[key]) {
        setValueState(changes[key].newValue as T);
      }
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleChange);
    };
  }, [key]);

  // Setter function that persists to session storage
  const setValue = useCallback(
    async (newValue: T) => {
      try {
        if (chrome?.storage?.session) {
          await chrome.storage.session.set({ [key]: newValue });
        }
        setValueState(newValue);
      } catch (error) {
        console.error(`[useSessionSetting] Failed to save ${key}:`, error);
        // Still update local state even if storage fails
        setValueState(newValue);
      }
    },
    [key]
  );

  return [value, setValue, isLoading];
}

/**
 * Convenience hook specifically for the hide balances toggle
 * Returns [isHidden, toggleHidden, isLoading]
 */
export function useHideBalances(): [boolean, () => Promise<void>, boolean] {
  const [isHidden, setIsHidden, isLoading] = useSessionSetting(
    SESSION_KEYS.HIDE_BALANCES,
    false
  );

  const toggleHidden = useCallback(async () => {
    await setIsHidden(!isHidden);
  }, [isHidden, setIsHidden]);

  return [isHidden, toggleHidden, isLoading];
}
