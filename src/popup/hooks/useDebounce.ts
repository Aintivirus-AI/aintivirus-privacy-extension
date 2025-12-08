/**
 * Debounce Hook
 * 
 * Delays updating a value until a specified time has passed
 * without any new updates. Useful for search inputs to avoid
 * excessive filtering on every keystroke.
 */

import { useState, useEffect } from 'react';

/**
 * Returns a debounced version of the provided value.
 * The debounced value will only update after the specified
 * delay has passed without any new value changes.
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 * 
 * // Filter using debouncedSearch, which updates 300ms after typing stops
 * const filtered = items.filter(item => item.name.includes(debouncedSearch));
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up a timer to update the debounced value
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timer if value changes before delay completes
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
