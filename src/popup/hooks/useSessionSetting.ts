import { useState, useEffect, useCallback } from 'react';

export const SESSION_KEYS = {
  HIDE_BALANCES: 'hideBalances',
  ACTIVE_TAB: 'activeTab',
} as const;

export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS];

export function useSessionSetting<T>(
  key: SessionKey,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => Promise<void>, boolean] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadValue = async () => {
      try {
        if (chrome?.storage?.session) {
          const result = await chrome.storage.session.get(key);
          if (result[key] !== undefined) {
            setValueState(result[key] as T);
          }
        }
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    loadValue();
  }, [key]);

  useEffect(() => {
    const handleChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
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

  const setValue = useCallback(
    async (newValue: T | ((prev: T) => T)) => {
      try {
        const valueToSet =
          typeof newValue === 'function' ? (newValue as (prev: T) => T)(value) : newValue;

        if (chrome?.storage?.session) {
          await chrome.storage.session.set({ [key]: valueToSet });
        }
        setValueState(valueToSet);
      } catch (error) {
        const valueToSet =
          typeof newValue === 'function' ? (newValue as (prev: T) => T)(value) : newValue;
        setValueState(valueToSet);
      }
    },
    [key, value],
  );

  return [value, setValue, isLoading];
}

export function useHideBalances(): [boolean, () => Promise<void>, boolean] {
  const [isHidden, setIsHidden, isLoading] = useSessionSetting(SESSION_KEYS.HIDE_BALANCES, false);

  const toggleHidden = useCallback(async () => {
    await setIsHidden(!isHidden);
  }, [isHidden, setIsHidden]);

  return [isHidden, toggleHidden, isLoading];
}
