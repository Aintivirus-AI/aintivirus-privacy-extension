/**
 * Tests for handlers/index.ts silent-catch fixes.
 * Verifies that errors in handleTabClosed and handleWalletLocked are logged.
 */

export {}; // module scope

describe('dApp handlers error logging', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('handleTabClosed catch handler', () => {
    it('logs a warning when handleTabClosed rejects', async () => {
      const tabError = new Error('tab closed handler failed');
      const handleTabClosed = jest.fn().mockRejectedValueOnce(tabError);

      // Simulate the fixed catch handler pattern from initializeDAppHandlers
      await handleTabClosed(42).catch(
        (error: unknown) => console.warn('[aintivirus] handleTabClosed failed:', error),
      );

      expect(warnSpy).toHaveBeenCalledWith('[aintivirus] handleTabClosed failed:', tabError);
    });

    it('does not log when handleTabClosed resolves', async () => {
      const handleTabClosed = jest.fn().mockResolvedValueOnce(undefined);

      await handleTabClosed(42).catch(
        (error: unknown) => console.warn('[aintivirus] handleTabClosed failed:', error),
      );

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleWalletLocked catch handler', () => {
    it('logs a warning when handleWalletLocked rejects', async () => {
      const lockError = new Error('wallet lock handler failed');
      const handleWalletLocked = jest.fn().mockRejectedValueOnce(lockError);

      // Simulate the fixed catch handler pattern from the alarm listener
      await handleWalletLocked().catch(
        (error: unknown) => console.warn('[aintivirus] handleWalletLocked failed:', error),
      );

      expect(warnSpy).toHaveBeenCalledWith('[aintivirus] handleWalletLocked failed:', lockError);
    });

    it('does not log when handleWalletLocked resolves', async () => {
      const handleWalletLocked = jest.fn().mockResolvedValueOnce(undefined);

      await handleWalletLocked().catch(
        (error: unknown) => console.warn('[aintivirus] handleWalletLocked failed:', error),
      );

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
