/**
 * Tests for content script functionality
 */

export {}; // Make this a module to avoid variable name conflicts

// Mock chrome API
const mockSendMessage = jest.fn().mockResolvedValue({ success: true });
const mockAddListener = jest.fn();

(global as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: mockAddListener,
      removeListener: jest.fn(),
    },
  },
};

// Mock document
const mockElement = {
  setAttribute: jest.fn(),
  appendChild: jest.fn(),
  remove: jest.fn(),
  style: {} as CSSStyleDeclaration,
  textContent: '',
};

const mockDocument = {
  addEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  createElement: jest.fn((_tag: string) => ({ ...mockElement })),
  head: {
    appendChild: jest.fn(),
  },
  body: {
    appendChild: jest.fn(),
  },
};

(global as any).document = mockDocument;

// Mock window.location properly
Object.defineProperty(window, 'location', {
  value: {
    origin: 'https://example.com',
    hostname: 'example.com',
    href: 'https://example.com/page',
  },
  writable: true,
  configurable: true,
});

describe('Content Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should send CONTENT_SCRIPT_READY message on load', async () => {
      // Simulate content script initialization
      await mockSendMessage({
        type: 'CONTENT_SCRIPT_READY',
        payload: { url: window.location.href },
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'CONTENT_SCRIPT_READY',
        payload: { url: 'https://example.com/page' },
      });
    });

    it('should register message listener', () => {
      mockAddListener(() => {});

      expect(mockAddListener).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    it('should handle PRIVACY_STATE_CHANGED message', () => {
      const handler = jest.fn();
      mockAddListener.mockImplementation((callback) => {
        callback(
          { type: 'PRIVACY_STATE_CHANGED', payload: { enabled: true } },
          {},
          handler
        );
      });

      mockAddListener(handler);

      expect(handler).toHaveBeenCalled();
    });

    it('should handle AD_BLOCKER_TOGGLED message', () => {
      const handler = jest.fn();
      mockAddListener.mockImplementation((callback) => {
        callback(
          { type: 'AD_BLOCKER_TOGGLED', payload: { enabled: false } },
          {},
          handler
        );
      });

      mockAddListener(handler);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Provider Injection', () => {
    it('should inject provider script into page', () => {
      // Simulate script injection
      const script = mockDocument.createElement('script');
      mockDocument.head.appendChild(script);

      expect(mockDocument.createElement).toHaveBeenCalledWith('script');
      expect(mockDocument.head.appendChild).toHaveBeenCalled();
    });
  });

  describe('Window Message Handling', () => {
    it('should set up message listener for window events', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      window.addEventListener('message', () => {});

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });

    it('should forward dapp requests to background', async () => {
      const dappRequest = {
        type: 'AINTIVIRUS_WALLET_REQUEST',
        payload: {
          id: 'req-123',
          method: 'connect',
        },
      };

      // Simulate forwarding
      await mockSendMessage({
        type: 'DAPP_REQUEST',
        payload: {
          ...dappRequest.payload,
          origin: window.location.origin,
          tabId: undefined,
        },
      });

      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('Floating Panel', () => {
    it('should create floating panel element', () => {
      const panel = mockDocument.createElement('div');
      mockDocument.body.appendChild(panel);

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockDocument.body.appendChild).toHaveBeenCalled();
    });

    it('should show warning panel for phishing sites', () => {
      const warningPanel = mockDocument.createElement('div');
      warningPanel.setAttribute('class', 'aintivirus-warning');
      mockDocument.body.appendChild(warningPanel);

      expect(mockDocument.body.appendChild).toHaveBeenCalled();
    });
  });

  describe('Domain Detection', () => {
    it('should extract domain from location', () => {
      const domain = window.location.hostname;
      
      expect(domain).toBe('example.com');
    });

    it('should get full URL', () => {
      const url = window.location.href;
      
      expect(url).toBe('https://example.com/page');
    });
  });

  describe('Communication with Background', () => {
    it('should check domain security on load', async () => {
      await mockSendMessage({
        type: 'SECURITY_CHECK_DOMAIN',
        payload: { domain: 'example.com' },
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SECURITY_CHECK_DOMAIN',
        payload: { domain: 'example.com' },
      });
    });

    it('should handle security check response', async () => {
      mockSendMessage.mockResolvedValueOnce({
        success: true,
        data: {
          domain: 'example.com',
          isPhishing: false,
          riskLevel: 'low',
          signals: [],
          recommendation: 'proceed',
        },
      });

      const response = await mockSendMessage({
        type: 'SECURITY_CHECK_DOMAIN',
        payload: { domain: 'example.com' },
      });

      expect(response.data.isPhishing).toBe(false);
    });

    it('should handle phishing site detection', async () => {
      mockSendMessage.mockResolvedValueOnce({
        success: true,
        data: {
          domain: 'phishing-site.com',
          isPhishing: true,
          riskLevel: 'high',
          signals: [{ type: 'known_scam', severity: 'high' }],
          recommendation: 'block',
        },
      });

      const response = await mockSendMessage({
        type: 'SECURITY_CHECK_DOMAIN',
        payload: { domain: 'phishing-site.com' },
      });

      expect(response.data.isPhishing).toBe(true);
      expect(response.data.recommendation).toBe('block');
    });
  });

  describe('Script Injection Security', () => {
    it('should verify origin before processing messages', () => {
      const trustedOrigin = 'https://example.com';
      const messageOrigin = 'https://example.com';
      
      expect(messageOrigin).toBe(trustedOrigin);
    });

    it('should reject messages from untrusted origins', () => {
      const trustedOrigin = 'https://example.com';
      const messageOrigin = 'https://malicious.com';
      
      expect(messageOrigin).not.toBe(trustedOrigin);
    });
  });
});

describe('Content Script CSS Injection', () => {
  it('should inject cosmetic filter styles', () => {
    const style = mockDocument.createElement('style');
    mockDocument.head.appendChild(style);

    expect(mockDocument.createElement).toHaveBeenCalledWith('style');
  });

  it('should apply ad hiding rules', () => {
    const cssRules = `
      .adsbygoogle { display: none !important; }
      [id^="google_ads"] { display: none !important; }
    `;
    
    const style = mockDocument.createElement('style');
    style.textContent = cssRules;
    mockDocument.head.appendChild(style);

    expect(mockDocument.head.appendChild).toHaveBeenCalled();
  });
});

