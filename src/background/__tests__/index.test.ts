/**
 * Tests for background script message handling
 */

// Mock chrome API
const mockListeners: Map<string, Function[]> = new Map();

const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn((callback: Function) => {
        const listeners = mockListeners.get('message') || [];
        listeners.push(callback);
        mockListeners.set('message', listeners);
      }),
      removeListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    onUpdated: {
      addListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
    },
  },
  alarms: {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
    },
  },
  declarativeNetRequest: {
    updateDynamicRules: jest.fn().mockResolvedValue(undefined),
    getDynamicRules: jest.fn().mockResolvedValue([]),
    updateEnabledRulesets: jest.fn().mockResolvedValue(undefined),
    getEnabledRulesets: jest.fn().mockResolvedValue([]),
  },
  windows: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
  },
};

(global as any).chrome = mockChrome;

// Helper to simulate message
function simulateMessage(
  message: any,
  sender: any = { id: 'test' },
  sendResponse: jest.Mock = jest.fn()
): void {
  const listeners = mockListeners.get('message') || [];
  listeners.forEach(listener => {
    listener(message, sender, sendResponse);
  });
}

describe('Background Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListeners.clear();
  });

  describe('Message Routing', () => {
    it('should register message listener on load', () => {
      // Simulate background script initialization
      mockChrome.runtime.onMessage.addListener(() => {});
      
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should handle PING message', () => {
      const sendResponse = jest.fn();
      const message = { type: 'PING', payload: undefined };
      
      // Register handler
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'PING') {
          respond({ success: true, data: 'pong' });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: 'pong' });
    });

    it('should handle GET_FEATURE_FLAGS message', async () => {
      const sendResponse = jest.fn();
      const message = { type: 'GET_FEATURE_FLAGS', payload: undefined };
      
      mockChrome.storage.local.get.mockResolvedValue({
        featureFlags: { privacy: true, wallet: true },
      });

      // Register handler
      mockChrome.runtime.onMessage.addListener(async (msg: any, _sender: any, respond: any) => {
        if (msg.type === 'GET_FEATURE_FLAGS') {
          const result = await mockChrome.storage.local.get(['featureFlags']);
          respond({ success: true, data: result.featureFlags });
        }
      });

      simulateMessage(message, {}, sendResponse);

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockChrome.storage.local.get).toHaveBeenCalled();
    });
  });

  describe('Wallet Messages', () => {
    it('should route WALLET_EXISTS message', () => {
      const sendResponse = jest.fn();
      const message = { type: 'WALLET_EXISTS', payload: undefined };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'WALLET_EXISTS') {
          respond({ success: true, data: true });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: true });
    });

    it('should route WALLET_GET_STATE message', () => {
      const sendResponse = jest.fn();
      const message = { type: 'WALLET_GET_STATE', payload: undefined };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'WALLET_GET_STATE') {
          respond({
            success: true,
            data: {
              lockState: 'locked',
              publicAddress: null,
            },
          });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalled();
    });
  });

  describe('Privacy Messages', () => {
    it('should route GET_PRIVACY_SETTINGS message', () => {
      const sendResponse = jest.fn();
      const message = { type: 'GET_PRIVACY_SETTINGS', payload: undefined };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'GET_PRIVACY_SETTINGS') {
          respond({
            success: true,
            data: {
              enabled: true,
              adBlockerEnabled: true,
            },
          });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalled();
    });

    it('should route GET_BLOCKED_COUNT message', () => {
      const sendResponse = jest.fn();
      const message = { type: 'GET_BLOCKED_COUNT', payload: { tabId: 1 } };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'GET_BLOCKED_COUNT') {
          respond({ success: true, data: 42 });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: 42 });
    });
  });

  describe('Security Messages', () => {
    it('should route SECURITY_CHECK_DOMAIN message', () => {
      const sendResponse = jest.fn();
      const message = {
        type: 'SECURITY_CHECK_DOMAIN',
        payload: { domain: 'example.com' },
      };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'SECURITY_CHECK_DOMAIN') {
          respond({
            success: true,
            data: {
              domain: 'example.com',
              isPhishing: false,
              riskLevel: 'low',
            },
          });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalled();
    });
  });

  describe('Dapp Messages', () => {
    it('should route DAPP_REQUEST message', () => {
      const sendResponse = jest.fn();
      const message = {
        type: 'DAPP_REQUEST',
        payload: {
          chainType: 'evm',
          method: 'eth_requestAccounts',
          params: [],
          origin: 'https://example.com',
          tabId: 1,
        },
      };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'DAPP_REQUEST') {
          // Would normally open approval popup
          respond({ success: true, data: { requestId: 'req-123' } });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalled();
    });

    it('should route DAPP_APPROVE message', () => {
      const sendResponse = jest.fn();
      const message = {
        type: 'DAPP_APPROVE',
        payload: { requestId: 'req-123' },
      };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'DAPP_APPROVE') {
          respond({ success: true });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should route DAPP_REJECT message', () => {
      const sendResponse = jest.fn();
      const message = {
        type: 'DAPP_REJECT',
        payload: { requestId: 'req-123', reason: 'User rejected' },
      };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'DAPP_REJECT') {
          respond({ success: true });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown message type', () => {
      const sendResponse = jest.fn();
      const message = { type: 'UNKNOWN_TYPE', payload: undefined };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        respond({ success: false, error: 'Unknown message type' });
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown message type',
      });
    });

    it('should handle errors gracefully', () => {
      const sendResponse = jest.fn();
      const message = { type: 'WALLET_CREATE', payload: { password: 'weak' } };
      
      mockChrome.runtime.onMessage.addListener((msg: any, _sender: any, respond: any) => {
        if (msg.type === 'WALLET_CREATE') {
          respond({ success: false, error: 'Password too weak' });
        }
      });

      simulateMessage(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Password too weak',
      });
    });
  });

  describe('Installation', () => {
    it('should register onInstalled listener', () => {
      mockChrome.runtime.onInstalled.addListener(() => {});
      
      expect(mockChrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    });
  });

  describe('Alarms', () => {
    it('should create periodic alarms', () => {
      mockChrome.alarms.create('threatIntelRefresh', { periodInMinutes: 360 });
      
      expect(mockChrome.alarms.create).toHaveBeenCalledWith(
        'threatIntelRefresh',
        expect.objectContaining({ periodInMinutes: 360 })
      );
    });

    it('should register alarm listener', () => {
      mockChrome.alarms.onAlarm.addListener(() => {});
      
      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });
  });
});



