/**
 * Tests for useSessionSetting hook
 */

import { renderHook, act } from '@testing-library/react';
import { useSessionSetting } from '../useSessionSetting';

// Mock chrome session storage
const mockSessionStorage: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockSessionStorage).forEach((key) => delete mockSessionStorage[key]);

  (chrome.storage.session.get as jest.Mock).mockImplementation((keys) => {
    if (typeof keys === 'string') {
      return Promise.resolve({ [keys]: mockSessionStorage[keys] });
    }
    return Promise.resolve(mockSessionStorage);
  });

  (chrome.storage.session.set as jest.Mock).mockImplementation((items) => {
    Object.assign(mockSessionStorage, items);
    return Promise.resolve();
  });
});

describe('useSessionSetting', () => {
  it('should return default value initially', () => {
    const { result } = renderHook(() => useSessionSetting('testKey' as any, 'default'));

    expect(result.current[0]).toBe('default');
  });

  it('should load stored value', async () => {
    mockSessionStorage['testKey'] = 'stored value';

    const { result } = renderHook(() => useSessionSetting('testKey' as any, 'default'));

    // Wait for async load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current[0]).toBe('stored value');
  });

  it('should update value and persist to storage', async () => {
    const { result } = renderHook(() => useSessionSetting('testKey' as any, 'default'));

    await act(async () => {
      result.current[1]('new value');
    });

    expect(result.current[0]).toBe('new value');
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ testKey: 'new value' });
  });

  it('should handle boolean values', async () => {
    const { result } = renderHook(() => useSessionSetting('boolKey' as any, false));

    expect(result.current[0]).toBe(false);

    await act(async () => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
  });

  it('should handle object values', async () => {
    const defaultObj = { count: 0, name: 'test' };
    const { result } = renderHook(() => useSessionSetting('objKey' as any, defaultObj));

    expect(result.current[0]).toEqual(defaultObj);

    const newObj = { count: 5, name: 'updated' };
    await act(async () => {
      result.current[1](newObj);
    });

    expect(result.current[0]).toEqual(newObj);
  });

  it('should handle number values', async () => {
    const { result } = renderHook(() => useSessionSetting('numKey' as any, 0));

    await act(async () => {
      result.current[1](42);
    });

    expect(result.current[0]).toBe(42);
  });

  it('should use default when storage returns undefined', async () => {
    mockSessionStorage['testKey'] = undefined;

    const { result } = renderHook(() => useSessionSetting('testKey' as any, 'default'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current[0]).toBe('default');
  });

  it('should handle function updates', async () => {
    const { result } = renderHook(() => useSessionSetting<number>('countKey' as any, 0));

    await act(async () => {
      result.current[1]((prev: number) => prev + 1);
    });

    expect(result.current[0]).toBe(1);

    await act(async () => {
      result.current[1]((prev: number) => prev + 10);
    });

    expect(result.current[0]).toBe(11);
  });

  it('should handle multiple keys independently', async () => {
    const { result: result1 } = renderHook(() => useSessionSetting('key1' as any, 'value1'));
    const { result: result2 } = renderHook(() => useSessionSetting('key2' as any, 'value2'));

    expect(result1.current[0]).toBe('value1');
    expect(result2.current[0]).toBe('value2');

    await act(async () => {
      result1.current[1]('updated1');
    });

    expect(result1.current[0]).toBe('updated1');
    expect(result2.current[0]).toBe('value2');
  });
});
