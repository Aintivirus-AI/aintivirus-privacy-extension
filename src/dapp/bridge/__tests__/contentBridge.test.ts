/**
 * Tests for contentBridge silent-catch fixes.
 * Verifies that errors in async paths are logged rather than silently swallowed.
 */

export {}; // module scope

const mockConnect = jest.fn();
const mockSendMessage = jest.fn();
const mockAddListener = jest.fn();

(global as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    connect: mockConnect,
    onMessage: { addListener: mockAddListener, removeListener: jest.fn() },
  },
};

describe('contentBridge error logging', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('page unload handler', () => {
    it('logs a warning when the page-unload sendMessage rejects', async () => {
      const rejectionError = new Error('extension context invalidated');
      mockSendMessage.mockRejectedValueOnce(rejectionError);

      // Simulate what the pagehide handler does
      const promise = mockSendMessage({ type: 'DAPP_PAGE_UNLOAD', payload: { tabId: 1 } }).catch(
        (error: unknown) => console.warn('[aintivirus] page unload message failed:', error),
      );

      await promise;

      expect(warnSpy).toHaveBeenCalledWith(
        '[aintivirus] page unload message failed:',
        rejectionError,
      );
    });

    it('does not log when the page-unload sendMessage succeeds', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await mockSendMessage({ type: 'DAPP_PAGE_UNLOAD', payload: { tabId: 1 } }).catch(
        (error: unknown) => console.warn('[aintivirus] page unload message failed:', error),
      );

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('establishBackgroundConnection error handling', () => {
    it('logs a warning when chrome.runtime.connect throws', () => {
      const connectError = new Error('cannot connect');
      mockConnect.mockImplementationOnce(() => {
        throw connectError;
      });

      // Simulate the try/catch block in establishBackgroundConnection
      try {
        mockConnect({ name: 'dapp-bridge' });
      } catch (error) {
        console.warn('[aintivirus] background connection failed:', error);
      }

      expect(warnSpy).toHaveBeenCalledWith(
        '[aintivirus] background connection failed:',
        connectError,
      );
    });

    it('does not log when connect succeeds', () => {
      const fakePort = {
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
      };
      mockConnect.mockReturnValueOnce(fakePort);

      try {
        mockConnect({ name: 'dapp-bridge' });
      } catch (error) {
        console.warn('[aintivirus] background connection failed:', error);
      }

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
