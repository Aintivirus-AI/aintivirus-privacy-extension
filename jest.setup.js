// Jest setup file
require('@testing-library/jest-dom');

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
    openOptionsPage: jest.fn(),
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
    sendMessage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
    session: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock crypto.subtle for encryption tests
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.subtle) {
  // Storage for encrypted data to enable proper decryption
  const encryptionCache = new Map();

  // Helper to create a simple hash of data for deterministic key generation
  const simpleHash = (data) => {
    const bytes = new Uint8Array(data);
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
      hash = ((hash << 5) - hash + bytes[i]) | 0;
    }
    return hash;
  };

  // Create mock CryptoKey with a deterministic identifier based on inputs
  const createMockCryptoKey = (algorithm, usages, seed = 0) => {
    return {
      type: 'secret',
      extractable: false,
      algorithm: algorithm,
      usages: usages,
      _mockKeyId: seed, // Deterministic identifier
    };
  };

  global.crypto.subtle = {
    importKey: jest.fn().mockImplementation((format, keyData, algorithm, extractable, usages) => {
      // Create deterministic key based on input data
      const keyId = simpleHash(keyData);
      return Promise.resolve(createMockCryptoKey(algorithm, usages, keyId));
    }),
    deriveKey: jest
      .fn()
      .mockImplementation((algorithm, baseKey, derivedKeyAlgorithm, extractable, usages) => {
        // Create deterministic key based on base key and salt
        const baseKeyId = baseKey._mockKeyId || 0;
        const saltHash = algorithm.salt ? simpleHash(algorithm.salt) : 0;
        const keyId = baseKeyId ^ saltHash ^ (algorithm.iterations || 0);
        return Promise.resolve(createMockCryptoKey(derivedKeyAlgorithm, usages, keyId));
      }),
    encrypt: jest.fn().mockImplementation((algorithm, key, data) => {
      // Generate different output based on the key's ID, IV, and data
      const keyId = key._mockKeyId || 0;
      const ivHash = algorithm.iv ? simpleHash(algorithm.iv) : 0;
      const dataView = new Uint8Array(data);
      const result = new Uint8Array(32);

      // Create deterministic but different output for different keys/IVs
      for (let i = 0; i < result.length; i++) {
        result[i] = (keyId * 7 + ivHash * 11 + i * 13 + (dataView[i % dataView.length] || 0)) % 256;
      }

      // Store the mapping for decryption
      const cacheKey = Array.from(result).join(',') + '|' + keyId + '|' + ivHash;
      encryptionCache.set(cacheKey, new Uint8Array(data));

      return Promise.resolve(result.buffer);
    }),
    decrypt: jest.fn().mockImplementation((algorithm, key, data) => {
      // Try to retrieve the original data from cache
      const keyId = key._mockKeyId || 0;
      const ivHash = algorithm.iv ? simpleHash(algorithm.iv) : 0;
      const dataView = new Uint8Array(data);
      const cacheKey = Array.from(dataView).join(',') + '|' + keyId + '|' + ivHash;

      const originalData = encryptionCache.get(cacheKey);
      if (originalData) {
        return Promise.resolve(originalData.buffer);
      }

      // If not found in cache, it means wrong key/IV was used - throw error
      return Promise.reject(new Error('Failed to decrypt'));
    }),
    digest: jest.fn().mockImplementation((algorithm, data) => {
      // Generate deterministic hash based on input data
      const dataView = new Uint8Array(data);
      const result = new Uint8Array(32);

      for (let i = 0; i < result.length; i++) {
        result[i] = (dataView[i % dataView.length] || 0) ^ (i * 17);
      }

      return Promise.resolve(result.buffer);
    }),
  };
}
if (!global.crypto.getRandomValues) {
  let randomCounter = 0;
  global.crypto.getRandomValues = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      // Use counter to ensure different values each time
      arr[i] = (randomCounter++ * 31 + Math.floor(Math.random() * 256)) % 256;
    }
    return arr;
  };
}

// Mock TextEncoder/TextDecoder if not available
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}
if (typeof TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
}

// Mock navigator.clipboard for copy functionality
// Always override to ensure we have a Jest mock, regardless of jsdom's navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue(''),
  },
  writable: true,
  configurable: true,
});
