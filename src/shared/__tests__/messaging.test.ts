/**
 * Tests for messaging utilities
 */

import {
  sendToBackground,
  sendToTab,
  broadcastToAllTabs,
  createMessageListener,
} from '../messaging';

describe('Messaging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset chrome mock
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ success: true });
    (chrome.tabs.query as jest.Mock).mockResolvedValue([]);
    (chrome.tabs.sendMessage as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('sendToBackground', () => {
    it('should send message to background script', async () => {
      const message = { type: 'PING' as const, payload: undefined };
      
      await sendToBackground(message);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(message);
    });

    it('should return response from background', async () => {
      const expectedResponse = { success: true, data: { test: 'value' } };
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue(expectedResponse);

      const message = { type: 'PING' as const, payload: undefined };
      const response = await sendToBackground(message);

      expect(response).toEqual(expectedResponse);
    });

    it('should handle errors gracefully', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockRejectedValue(new Error('Connection error'));

      const message = { type: 'PING' as const, payload: undefined };
      const response = await sendToBackground(message);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Connection error');
    });

    it('should handle unknown errors', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockRejectedValue('Unknown');

      const message = { type: 'PING' as const, payload: undefined };
      const response = await sendToBackground(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Unknown error');
    });
  });

  describe('sendToTab', () => {
    it('should send message to specific tab', async () => {
      const tabId = 123;
      const message = { type: 'PING' as const, payload: undefined };
      
      await sendToTab(tabId, message);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(tabId, message);
    });

    it('should return response from tab', async () => {
      const expectedResponse = { success: true, data: 'tab response' };
      (chrome.tabs.sendMessage as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await sendToTab(456, { type: 'PING' as const, payload: undefined });

      expect(response).toEqual(expectedResponse);
    });

    it('should handle errors gracefully', async () => {
      (chrome.tabs.sendMessage as jest.Mock).mockRejectedValue(new Error('Tab not found'));

      const response = await sendToTab(999, { type: 'PING' as const, payload: undefined });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Tab not found');
    });
  });

  describe('broadcastToAllTabs', () => {
    it('should query all tabs and send message', async () => {
      const tabs = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ];
      (chrome.tabs.query as jest.Mock).mockResolvedValue(tabs);

      const message = { type: 'PRIVACY_STATE_CHANGED' as const, payload: { enabled: true } };
      await broadcastToAllTabs(message);

      expect(chrome.tabs.query).toHaveBeenCalledWith({});
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, message);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, message);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, message);
    });

    it('should skip tabs without id', async () => {
      const tabs = [
        { id: 1 },
        { id: undefined },
        { id: 3 },
      ];
      (chrome.tabs.query as jest.Mock).mockResolvedValue(tabs);

      const message = { type: 'PING' as const, payload: undefined };
      await broadcastToAllTabs(message);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should ignore errors from individual tabs', async () => {
      const tabs = [{ id: 1 }, { id: 2 }];
      (chrome.tabs.query as jest.Mock).mockResolvedValue(tabs);
      (chrome.tabs.sendMessage as jest.Mock)
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Tab closed'));

      const message = { type: 'PING' as const, payload: undefined };
      
      // Should not throw
      await expect(broadcastToAllTabs(message)).resolves.not.toThrow();
    });

    it('should handle empty tab list', async () => {
      (chrome.tabs.query as jest.Mock).mockResolvedValue([]);

      const message = { type: 'PING' as const, payload: undefined };
      await broadcastToAllTabs(message);

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('createMessageListener', () => {
    it('should add listener to runtime.onMessage', () => {
      const handler = jest.fn();
      
      createMessageListener(handler);

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should wrap handler correctly', () => {
      const handler = jest.fn();
      
      createMessageListener(handler);

      // Get the wrapped handler that was passed to addListener
      const wrappedHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
      
      const message = { type: 'PING', payload: undefined };
      const sender = { id: 'test' };
      const sendResponse = jest.fn();

      wrappedHandler(message, sender, sendResponse);

      expect(handler).toHaveBeenCalledWith(message, sender, sendResponse);
    });
  });
});


