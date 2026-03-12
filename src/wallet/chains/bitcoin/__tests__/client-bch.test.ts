/**
 * Tests for Bitcoin Cash client functionality
 */

import { getBalance, getTransactions, clearBitcoinCache } from '../client';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Bitcoin Cash Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearBitcoinCache(); // Clear cache before each test
  });

  describe('getBalance', () => {
    it('should get balance using FullStack.cash API', async () => {
      const mockResponse = {
        success: true,
        balance: {
          confirmed: 1474992,
          unconfirmed: 0,
        },
      };

      // Mock Blockchair first (will fail or return no data)
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 430,
        })
      );

      // Then mock FullStack.cash API
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          json: async () => mockResponse,
        })
      );

      const balance = await getBalance('bitcoincash', '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q');

      expect(balance).toEqual({
        confirmed: 1474992,
        unconfirmed: 0,
        total: 1474992,
      });
    });

    it('should handle API errors gracefully', async () => {
      // Mock Blockchair first (will fail or return no data)
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 430,
        })
      );

      // Then mock FullStack.cash API error
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );

      await expect(
        getBalance('bitcoincash', '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q')
      ).rejects.toThrow('FullStack.cash API failed: 404');
    });

    it('should handle non-success responses', async () => {
      const mockResponse = {
        success: false,
      };

      // Mock Blockchair first (will fail or return no data)
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 430,
        })
      );

      // Then mock FullStack.cash API with non-success response
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          json: async () => mockResponse,
        })
      );

      await expect(
        getBalance('bitcoincash', '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q')
      ).rejects.toThrow('FullStack.cash API returned error');
    });
  });

  describe('getTransactions', () => {
    it('should get transactions using FullStack.cash API', async () => {
      const mockTxListResponse = {
        success: true,
        transactions: [
          {
            height: 933464,
            tx_hash: 'ee06a33da7221c05533dc77cf6c0295a0c7a909861642429b208ab1ce85db12b',
          },
        ],
      };

      const mockTxDetailResponse = {
        txid: 'ee06a33da7221c05533dc77cf6c0295a0c7a909861642429b208ab1ce85db12b',
        version: 1,
        locktime: 0,
        vin: [
          {
            txid: 'cf269baf15c3e2ed7e81a07253094330477d0151a0c3da737c8da03f5317518a',
            vout: 1,
            scriptSig: {
              hex: '4730440220414a2bd6f87228cfac9bc3c8eebdb3d62157c090fcdf441ddb41d81738c8277e0220555b61f536e2f3905eadab3cb552ff6e9f9b2aaaedde4f4535ae8f928b9107e4412103cd48bd70b39f15b8a724378f0902775d87f9ac39d182810e2a86683b14563f68',
            },
            sequence: 4294967295,
          },
        ],
        vout: [
          {
            value: 0.0005561,
            n: 0,
            scriptPubKey: {
              hex: '76a9147a2af8a2afc357d30b5c69680748bd1849b9652088ac',
              type: 'pubkeyhash',
              addresses: ['bitcoincash:qpaz479z4lp405ctt35ksp6gh5vynwt9yqh5uxkw64'],
            },
          },
          {
            value: 0.01474992,
            n: 1,
            scriptPubKey: {
              hex: '76a9147e3070604297ba120f1cbc536a50d141955aa8ab88ac',
              type: 'pubkeyhash',
              addresses: ['bitcoincash:qplrqurqg2tm5ys0rj79x6js69qe2k4g4v92qwg67x'],
            },
          },
        ],
        blockhash: '000000000000000000afd7e008dad6f24ee0c9cc3bb9e736ca0f47fad6b413e7',
        confirmations: 2,
        time: 1768165525,
        blocktime: 1768165525,
      };

      // Mock Blockchair API (primary for BCH transactions - has input addresses)
      const mockBlockchairResponse = {
        data: {
          '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q': {
            transactions: {
              'ee06a33da7221c05533dc77cf6c0295a0c7a909861642429b208ab1ce85db12b': {
                block_id: 933464,
                version: 1,
                lock_time: 0,
                fee: 1000,
                time: '2026-01-11T20:00:00Z',
                inputs: [
                  {
                    transaction_hash: 'prev_txid',
                    index: 0,
                    scriptsig_hex: '4730440220414a2bd6f87228cfac9bc3c8eebdb3d62157c090fcdf441ddb41d81738c8277e0220555b61f536e2f3905eadab3cb552ff6e9f9b2aaaedde4f4535ae8f928b9107e4412103cd48bd70b39f15b8a724378f0902775d87f9ac39d182810e2a86683b14563f68',
                    sequence: 4294967295,
                    recipient: 'bitcoincash:qplrqurqg2tm5ys0rj79x6js69qe2k4g4v92qwg67x',
                    value: 1530552,
                  },
                ],
                outputs: [
                  {
                    index: 0,
                    scriptpubkey_hex: '76a9147a2af8a2afc357d30b5c69680748bd1849b9652088ac',
                    type: 'pubkeyhash',
                    recipient: 'bitcoincash:qpaz479z4lp405ctt35ksp6gh5vynwt9yqh5uxkw64',
                    value: 55610,
                  },
                  {
                    index: 1,
                    scriptpubkey_hex: '76a9147e3070604297ba120f1cbc536a50d141955aa8ab88ac',
                    type: 'pubkeyhash',
                    recipient: 'bitcoincash:qplrqurqg2tm5ys0rj79x6js69qe2k4g4v92qwg67x',
                    value: 1474992,
                  },
                ],
              },
            },
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBlockchairResponse,
      });

      const transactions = await getTransactions('bitcoincash', '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q');

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        txid: 'ee06a33da7221c05533dc77cf6c0295a0c7a909861642429b208ab1ce85db12b',
        version: 1,
        locktime: 0,
        confirmations: 1, // Blockchair returns 1 for confirmed
        blockheight: 933464,
      });

      expect(transactions[0].vin).toHaveLength(1);
      expect(transactions[0].vin[0].addresses).toEqual(['bitcoincash:qplrqurqg2tm5ys0rj79x6js69qe2k4g4v92qwg67x']); // Input addresses from Blockchair
      expect(transactions[0].vout).toHaveLength(2);
      expect(transactions[0].vout[1].value).toBe(1474992); // 0.01474992 BCH in satoshis
    });

    it('should return empty array when no transactions found', async () => {
      const mockResponse = {
        data: {
          '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q': {
            transactions: {},
          },
        },
      };

      // Mock Blockchair with empty transactions
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // Mock FullStack.cash fallback with empty transactions
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, transactions: [] }),
      });

      const transactions = await getTransactions('bitcoincash', '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q');

      expect(transactions).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      // Mock Blockchair API error (rate limited)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 430,
      });

      // Mock FullStack.cash fallback error
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const transactions = await getTransactions('bitcoincash', '1CWEAmcYzBXiKG2kTt3iHZBBE3t58Jjx2Q');

      // Should return empty array when both APIs fail
      expect(transactions).toEqual([]);
    });
  });
});
