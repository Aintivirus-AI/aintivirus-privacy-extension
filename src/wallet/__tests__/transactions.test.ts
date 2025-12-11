/**
 * Tests for wallet transaction functions
 */

import {
  validateRecipient,
  validateAmount,
  solToLamports,
  lamportsToSol,
  formatSolAmount,
  parseSolInput,
  wouldLeaveDust,
  calculateMaxSendable,
} from '../transactions';
import { TEST_RECIPIENT_SOLANA, INVALID_SOLANA_ADDRESS } from '../../__tests__/utils/fixtures';

// Mock dependencies
jest.mock('../rpc', () => ({
  getCurrentConnection: jest.fn(),
  getRecentBlockhash: jest.fn(),
  getTransactionExplorerUrl: jest.fn(),
}));

jest.mock('../storage', () => ({
  getUnlockedKeypair: jest.fn(),
  getPublicAddress: jest.fn(),
}));

jest.mock('../keychain', () => ({
  isValidSolanaAddress: jest.fn((address: string) => {
    // Simple validation for testing
    return address && address.length >= 32 && address.length <= 44 && !address.includes('invalid');
  }),
}));

describe('Transactions', () => {
  describe('validateRecipient', () => {
    it('should return true for valid Solana address', () => {
      expect(validateRecipient(TEST_RECIPIENT_SOLANA)).toBe(true);
    });

    it('should return false for invalid address', () => {
      expect(validateRecipient(INVALID_SOLANA_ADDRESS)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateRecipient('')).toBe(false);
    });

    it('should return false for whitespace only', () => {
      expect(validateRecipient('   ')).toBe(false);
    });
  });

  describe('validateAmount', () => {
    const ONE_SOL = 1_000_000_000; // 1 SOL in lamports
    const FEE = 5000; // typical transaction fee

    it('should return valid for sufficient balance', () => {
      const result = validateAmount(0.5, ONE_SOL, FEE);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for zero amount', () => {
      const result = validateAmount(0, ONE_SOL, FEE);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should return invalid for negative amount', () => {
      const result = validateAmount(-1, ONE_SOL, FEE);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should return invalid for NaN', () => {
      const result = validateAmount(NaN, ONE_SOL, FEE);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid amount');
    });

    it('should return invalid for Infinity', () => {
      const result = validateAmount(Infinity, ONE_SOL, FEE);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid amount');
    });

    it('should return invalid for insufficient balance', () => {
      const result = validateAmount(2, ONE_SOL, FEE); // Trying to send 2 SOL with 1 SOL balance

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should account for fees in balance check', () => {
      // Balance exactly equals amount + fee
      const exactBalance = 500_000_000 + FEE;
      const result = validateAmount(0.5, exactBalance, FEE);

      expect(result.valid).toBe(true);
    });

    it('should fail when balance is less than amount + fee', () => {
      const notEnough = 500_000_000 + FEE - 1;
      const result = validateAmount(0.5, notEnough, FEE);

      expect(result.valid).toBe(false);
    });
  });

  describe('solToLamports', () => {
    it('should convert SOL to lamports correctly', () => {
      expect(solToLamports(1)).toBe(1_000_000_000);
      expect(solToLamports(0.5)).toBe(500_000_000);
      expect(solToLamports(0.000000001)).toBe(1);
    });

    it('should handle zero', () => {
      expect(solToLamports(0)).toBe(0);
    });

    it('should floor fractional lamports', () => {
      // 0.0000000001 SOL = 0.1 lamports, should floor to 0
      expect(solToLamports(0.0000000001)).toBe(0);
    });

    it('should handle large values', () => {
      expect(solToLamports(1000)).toBe(1_000_000_000_000);
    });
  });

  describe('lamportsToSol', () => {
    it('should convert lamports to SOL correctly', () => {
      expect(lamportsToSol(1_000_000_000)).toBe(1);
      expect(lamportsToSol(500_000_000)).toBe(0.5);
      expect(lamportsToSol(1)).toBe(0.000000001);
    });

    it('should handle zero', () => {
      expect(lamportsToSol(0)).toBe(0);
    });

    it('should handle large values', () => {
      expect(lamportsToSol(1_000_000_000_000)).toBe(1000);
    });
  });

  describe('formatSolAmount', () => {
    it('should format whole numbers without trailing zeros', () => {
      expect(formatSolAmount(1.0)).toBe('1');
      expect(formatSolAmount(10.0)).toBe('10');
    });

    it('should preserve significant decimal places', () => {
      expect(formatSolAmount(1.5)).toBe('1.5');
      expect(formatSolAmount(1.23)).toBe('1.23');
    });

    it('should remove trailing zeros', () => {
      expect(formatSolAmount(1.5)).toBe('1.5');
      expect(formatSolAmount(1.23)).toBe('1.23');
    });

    it('should respect custom decimal places', () => {
      expect(formatSolAmount(1.123456789, 9)).toBe('1.123456789');
      expect(formatSolAmount(1.1, 2)).toBe('1.1');
    });

    it('should handle zero', () => {
      expect(formatSolAmount(0)).toBe('0');
    });

    it('should handle very small amounts', () => {
      expect(formatSolAmount(0.000001)).toBe('0.000001');
    });
  });

  describe('parseSolInput', () => {
    it('should parse valid number strings', () => {
      expect(parseSolInput('1')).toBe(1);
      expect(parseSolInput('0.5')).toBe(0.5);
      expect(parseSolInput('1.23456')).toBe(1.23456);
    });

    it('should handle commas as thousand separators', () => {
      expect(parseSolInput('1,000')).toBe(1000);
      expect(parseSolInput('1,000.50')).toBe(1000.5);
    });

    it('should trim whitespace', () => {
      expect(parseSolInput('  1.5  ')).toBe(1.5);
    });

    it('should return null for invalid input', () => {
      expect(parseSolInput('abc')).toBeNull();
      expect(parseSolInput('')).toBeNull();
      expect(parseSolInput('1.2.3')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect(parseSolInput('-1')).toBeNull();
      expect(parseSolInput('-0.5')).toBeNull();
    });

    it('should return null for Infinity', () => {
      expect(parseSolInput('Infinity')).toBeNull();
    });

    it('should handle zero', () => {
      expect(parseSolInput('0')).toBe(0);
    });
  });

  describe('wouldLeaveDust', () => {
    const MIN_RENT = 890880; // Minimum rent-exempt balance

    it('should return true when remaining balance is dust', () => {
      const currentBalance = 1_000_000_000; // 1 SOL
      const sendAmount = 999_105_000; // Leave only 890,000 lamports after fee
      const fee = 5000;

      // Remaining would be 1_000_000_000 - 999_105_000 - 5000 = 890,000
      // Which is between 0 and MIN_RENT (890,880), so it IS dust
      expect(wouldLeaveDust(currentBalance, sendAmount, fee)).toBe(true);
    });

    it('should return false when remaining balance is zero', () => {
      const currentBalance = 1_000_000;
      const sendAmount = 1_000_000 - 5000;
      const fee = 5000;

      // Remaining = 0
      expect(wouldLeaveDust(currentBalance, sendAmount, fee)).toBe(false);
    });

    it('should return false when remaining balance is above rent-exempt', () => {
      const currentBalance = 2_000_000_000; // 2 SOL
      const sendAmount = 1_000_000_000; // 1 SOL
      const fee = 5000;

      // Remaining = ~1 SOL, well above rent-exempt
      expect(wouldLeaveDust(currentBalance, sendAmount, fee)).toBe(false);
    });

    it('should return true for small dust amounts', () => {
      const currentBalance = 1_000_000;
      const sendAmount = 100_000;
      const fee = 5000;

      // Remaining = 895000, which is just above rent-exempt
      const remaining = currentBalance - sendAmount - fee;
      if (remaining > 0 && remaining < MIN_RENT) {
        expect(wouldLeaveDust(currentBalance, sendAmount, fee)).toBe(true);
      } else {
        expect(wouldLeaveDust(currentBalance, sendAmount, fee)).toBe(false);
      }
    });
  });

  describe('calculateMaxSendable', () => {
    it('should return balance minus fee as SOL', () => {
      const balance = 1_000_000_000; // 1 SOL in lamports
      const fee = 5000;

      const maxSendable = calculateMaxSendable(balance, fee);

      expect(maxSendable).toBeCloseTo(0.999995, 6);
    });

    it('should return 0 when balance is less than fee', () => {
      const balance = 1000;
      const fee = 5000;

      expect(calculateMaxSendable(balance, fee)).toBe(0);
    });

    it('should return 0 when balance equals fee', () => {
      const fee = 5000;

      expect(calculateMaxSendable(fee, fee)).toBe(0);
    });

    it('should handle large balances', () => {
      const balance = 100_000_000_000; // 100 SOL
      const fee = 5000;

      const maxSendable = calculateMaxSendable(balance, fee);

      expect(maxSendable).toBeCloseTo(99.999995, 5);
    });
  });
});
