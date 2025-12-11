/**
 * Enhanced Chrome API mocks for testing
 */

type StorageArea = {
  get: jest.Mock;
  set: jest.Mock;
  remove: jest.Mock;
  clear: jest.Mock;
};

type RuntimeAPI = {
  sendMessage: jest.Mock;
  onMessage: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
    hasListener: jest.Mock;
  };
  getURL: jest.Mock;
  openOptionsPage: jest.Mock;
  getManifest: jest.Mock;
  id: string;
  lastError: chrome.runtime.LastError | undefined;
};

type TabsAPI = {
  query: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
  sendMessage: jest.Mock;
  get: jest.Mock;
  getCurrent: jest.Mock;
  onUpdated: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
  onRemoved: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
};

type StorageAPI = {
  local: StorageArea;
  sync: StorageArea;
  session: StorageArea;
  onChanged: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
};

type AlarmAPI = {
  create: jest.Mock;
  clear: jest.Mock;
  get: jest.Mock;
  getAll: jest.Mock;
  onAlarm: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
};

type NotificationsAPI = {
  create: jest.Mock;
  clear: jest.Mock;
  update: jest.Mock;
  onClicked: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
  onClosed: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
};

type DeclarativeNetRequestAPI = {
  updateDynamicRules: jest.Mock;
  getDynamicRules: jest.Mock;
  updateSessionRules: jest.Mock;
  getSessionRules: jest.Mock;
  updateEnabledRulesets: jest.Mock;
  getEnabledRulesets: jest.Mock;
  getAvailableStaticRuleCount: jest.Mock;
  isRegexSupported: jest.Mock;
};

type ScriptingAPI = {
  executeScript: jest.Mock;
  insertCSS: jest.Mock;
  removeCSS: jest.Mock;
  registerContentScripts: jest.Mock;
  unregisterContentScripts: jest.Mock;
  getRegisteredContentScripts: jest.Mock;
};

type WindowsAPI = {
  create: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
  get: jest.Mock;
  getCurrent: jest.Mock;
  getAll: jest.Mock;
  onCreated: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
  onRemoved: {
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
};

// In-memory storage for mock
let mockStorageData: Record<string, unknown> = {};

/**
 * Create a mock storage area
 */
function createMockStorageArea(): StorageArea {
  return {
    get: jest.fn((keys) => {
      return new Promise((resolve) => {
        if (keys === null || keys === undefined) {
          resolve({ ...mockStorageData });
        } else if (typeof keys === 'string') {
          resolve({ [keys]: mockStorageData[keys] });
        } else if (Array.isArray(keys)) {
          const result: Record<string, unknown> = {};
          keys.forEach((key) => {
            if (key in mockStorageData) {
              result[key] = mockStorageData[key];
            }
          });
          resolve(result);
        } else {
          // Object with defaults
          const result: Record<string, unknown> = {};
          Object.keys(keys).forEach((key) => {
            result[key] =
              key in mockStorageData
                ? mockStorageData[key]
                : (keys as Record<string, unknown>)[key];
          });
          resolve(result);
        }
      });
    }),
    set: jest.fn((items) => {
      return new Promise<void>((resolve) => {
        Object.assign(mockStorageData, items);
        resolve();
      });
    }),
    remove: jest.fn((keys) => {
      return new Promise<void>((resolve) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach((key) => {
          delete mockStorageData[key];
        });
        resolve();
      });
    }),
    clear: jest.fn(() => {
      return new Promise<void>((resolve) => {
        mockStorageData = {};
        resolve();
      });
    }),
  };
}

/**
 * Create complete mock Chrome API
 */
export function createMockChromeAPI(): {
  runtime: RuntimeAPI;
  tabs: TabsAPI;
  storage: StorageAPI;
  alarms: AlarmAPI;
  notifications: NotificationsAPI;
  declarativeNetRequest: DeclarativeNetRequestAPI;
  scripting: ScriptingAPI;
  windows: WindowsAPI;
} {
  const runtime: RuntimeAPI = {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn().mockReturnValue(false),
    },
    getURL: jest.fn((path: string) => `chrome-extension://mock-extension-id/${path}`),
    openOptionsPage: jest.fn().mockResolvedValue(undefined),
    getManifest: jest.fn().mockReturnValue({
      manifest_version: 3,
      name: 'AINTIVIRUS',
      version: '0.2.0',
    }),
    id: 'mock-extension-id',
    lastError: undefined,
  };

  const tabs: TabsAPI = {
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
    getCurrent: jest.fn().mockResolvedValue({ id: 1 }),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  };

  const storage: StorageAPI = {
    local: createMockStorageArea(),
    sync: createMockStorageArea(),
    session: createMockStorageArea(),
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  };

  const alarms: AlarmAPI = {
    create: jest.fn(),
    clear: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    getAll: jest.fn().mockResolvedValue([]),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  };

  const notifications: NotificationsAPI = {
    create: jest.fn().mockResolvedValue('notification-id'),
    clear: jest.fn().mockResolvedValue(true),
    update: jest.fn().mockResolvedValue(true),
    onClicked: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onClosed: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  };

  const declarativeNetRequest: DeclarativeNetRequestAPI = {
    updateDynamicRules: jest.fn().mockResolvedValue(undefined),
    getDynamicRules: jest.fn().mockResolvedValue([]),
    updateSessionRules: jest.fn().mockResolvedValue(undefined),
    getSessionRules: jest.fn().mockResolvedValue([]),
    updateEnabledRulesets: jest.fn().mockResolvedValue(undefined),
    getEnabledRulesets: jest.fn().mockResolvedValue([]),
    getAvailableStaticRuleCount: jest.fn().mockResolvedValue(30000),
    isRegexSupported: jest.fn().mockResolvedValue({ isSupported: true }),
  };

  const scripting: ScriptingAPI = {
    executeScript: jest.fn().mockResolvedValue([{ result: undefined }]),
    insertCSS: jest.fn().mockResolvedValue(undefined),
    removeCSS: jest.fn().mockResolvedValue(undefined),
    registerContentScripts: jest.fn().mockResolvedValue(undefined),
    unregisterContentScripts: jest.fn().mockResolvedValue(undefined),
    getRegisteredContentScripts: jest.fn().mockResolvedValue([]),
  };

  const windows: WindowsAPI = {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ id: 1 }),
    getCurrent: jest.fn().mockResolvedValue({ id: 1 }),
    getAll: jest.fn().mockResolvedValue([]),
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  };

  return {
    runtime,
    tabs,
    storage,
    alarms,
    notifications,
    declarativeNetRequest,
    scripting,
    windows,
  };
}

/**
 * Reset mock storage data
 */
export function resetMockStorage(): void {
  mockStorageData = {};
}

/**
 * Set mock storage data
 */
export function setMockStorageData(data: Record<string, unknown>): void {
  mockStorageData = { ...data };
}

/**
 * Get current mock storage data
 */
export function getMockStorageData(): Record<string, unknown> {
  return { ...mockStorageData };
}

/**
 * Setup global chrome mock
 */
export function setupGlobalChromeMock(): void {
  const mockChrome = createMockChromeAPI();
  (global as any).chrome = mockChrome;
}

/**
 * Create a mock MessageSender
 */
export function createMockSender(
  overrides?: Partial<chrome.runtime.MessageSender>,
): chrome.runtime.MessageSender {
  return {
    id: 'mock-extension-id',
    url: 'https://example.com',
    tab: {
      id: 1,
      index: 0,
      windowId: 1,
      highlighted: true,
      active: true,
      pinned: false,
      incognito: false,
      url: 'https://example.com',
    } as chrome.tabs.Tab,
    ...overrides,
  };
}

/**
 * Create a mock Tab object
 */
export function createMockTab(overrides?: Partial<chrome.tabs.Tab>): chrome.tabs.Tab {
  return {
    id: 1,
    index: 0,
    windowId: 1,
    highlighted: true,
    active: true,
    pinned: false,
    incognito: false,
    url: 'https://example.com',
    title: 'Example',
    favIconUrl: 'https://example.com/favicon.ico',
    ...overrides,
  } as chrome.tabs.Tab;
}

/**
 * Mock a successful response callback
 */
export function mockSendResponse<T>(data: T): jest.Mock {
  return jest.fn().mockImplementation((response) => response);
}
