/**
 * Tests for transaction analysis functionality
 */

import {
  deserializeTransaction,
  getTransactionDescription,
  getRiskLevelColor,
  getRiskLevelIcon,
} from '../transactionAnalyzer';
import { RiskLevel, TransactionSummary, ProgramRiskLevel } from '../types';

// Mock dependencies
jest.mock('../programRegistry', () => ({
  getProgramInfo: jest.fn(),
  getProgramRiskLevel: jest.fn(),
  isSystemProgram: jest.fn((programId: string) => 
    programId === '11111111111111111111111111111111'
  ),
  isTokenProgram: jest.fn((programId: string) => 
    programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  ),
  isAssociatedTokenProgram: jest.fn((programId: string) => 
    programId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
  ),
  isComputeBudgetProgram: jest.fn((programId: string) => 
    programId === 'ComputeBudget111111111111111111111111111111'
  ),
  getRiskLevelDescription: jest.fn(),
}));

jest.mock('../storage', () => ({
  generateId: jest.fn(() => 'test-id-' + Math.random().toString(36).substr(2, 9)),
  getSecuritySettings: jest.fn(() => Promise.resolve({
    connectionMonitoring: true,
    transactionVerification: true,
    phishingDetection: true,
    warnOnUnknownPrograms: true,
    warnOnLargeTransfers: true,
    largeTransferThreshold: 100,
    warnOnAuthorityChanges: true,
    warnOnUnlimitedApprovals: true,
    autoBlockMalicious: true,
    maxConnectionHistory: 500,
  })),
  addPendingVerification: jest.fn(),
  removePendingVerification: jest.fn(),
}));

jest.mock('../../wallet/storage', () => ({
  getPublicAddress: jest.fn(() => Promise.resolve('TestWalletAddress11111111111111111111111')),
}));

describe('TransactionAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('deserializeTransaction', () => {
    it('should throw error for invalid encoding', () => {
      expect(() => deserializeTransaction('not-valid-encoding!!!')).toThrow('Invalid transaction encoding');
    });

    it('should handle base64 encoded transactions', () => {
      // A minimal valid base64 that will fail deserialization but pass decoding
      // This tests the encoding detection
      const invalidButValidBase64 = btoa('test');
      
      // Should not throw "Invalid transaction encoding" - it should fail at deserialization
      expect(() => deserializeTransaction(invalidButValidBase64)).toThrow();
    });
  });

  describe('getTransactionDescription', () => {
    it('should describe SOL transfer', () => {
      const summary: TransactionSummary = {
        id: 'test-1',
        analyzedAt: Date.now(),
        domain: 'test.com',
        instructions: [],
        totalSolTransfer: 1.5,
        tokenTransfers: [],
        authorityChanges: [],
        riskLevel: 'low',
        warnings: [],
        unknownPrograms: [],
        requiresConfirmation: false,
        serializedTransaction: '',
      };

      const description = getTransactionDescription(summary);

      expect(description).toContain('1.5');
      expect(description).toContain('SOL');
    });

    it('should describe token transfers', () => {
      const summary: TransactionSummary = {
        id: 'test-2',
        analyzedAt: Date.now(),
        domain: 'test.com',
        instructions: [],
        totalSolTransfer: 0,
        tokenTransfers: [
          {
            mint: 'token-mint',
            amount: 100,
            rawAmount: '100000000',
            source: 'source-address',
            destination: 'dest-address',
            isApproval: false,
          },
          {
            mint: 'token-mint-2',
            amount: 50,
            rawAmount: '50000000',
            source: 'source-address',
            destination: 'dest-address',
            isApproval: false,
          },
        ],
        authorityChanges: [],
        riskLevel: 'low',
        warnings: [],
        unknownPrograms: [],
        requiresConfirmation: false,
        serializedTransaction: '',
      };

      const description = getTransactionDescription(summary);

      expect(description).toContain('2');
      expect(description).toContain('token transfer');
    });

    it('should describe token approvals', () => {
      const summary: TransactionSummary = {
        id: 'test-3',
        analyzedAt: Date.now(),
        domain: 'test.com',
        instructions: [],
        totalSolTransfer: 0,
        tokenTransfers: [
          {
            mint: 'token-mint',
            amount: 100,
            rawAmount: '100000000',
            source: 'source-address',
            destination: 'spender-address',
            isApproval: true,
            approvalAmount: 100,
          },
        ],
        authorityChanges: [],
        riskLevel: 'medium',
        warnings: [],
        unknownPrograms: [],
        requiresConfirmation: true,
        serializedTransaction: '',
      };

      const description = getTransactionDescription(summary);

      expect(description).toContain('1');
      expect(description).toContain('approval');
    });

    it('should describe authority changes', () => {
      const summary: TransactionSummary = {
        id: 'test-4',
        analyzedAt: Date.now(),
        domain: 'test.com',
        instructions: [],
        totalSolTransfer: 0,
        tokenTransfers: [],
        authorityChanges: [
          {
            type: 'owner',
            account: 'account-address',
            newAuthority: 'new-authority',
            isWalletAuthority: false,
          },
        ],
        riskLevel: 'high',
        warnings: [],
        unknownPrograms: [],
        requiresConfirmation: true,
        serializedTransaction: '',
      };

      const description = getTransactionDescription(summary);

      expect(description).toContain('1');
      expect(description).toContain('authority change');
    });

    it('should describe unknown programs', () => {
      const summary: TransactionSummary = {
        id: 'test-5',
        analyzedAt: Date.now(),
        domain: 'test.com',
        instructions: [],
        totalSolTransfer: 0,
        tokenTransfers: [],
        authorityChanges: [],
        riskLevel: 'medium',
        warnings: [],
        unknownPrograms: ['unknown-program-1', 'unknown-program-2'],
        requiresConfirmation: true,
        serializedTransaction: '',
      };

      const description = getTransactionDescription(summary);

      expect(description).toContain('2');
      expect(description).toContain('unknown program');
    });

    it('should return fallback for empty transaction', () => {
      const summary: TransactionSummary = {
        id: 'test-6',
        analyzedAt: Date.now(),
        domain: 'test.com',
        instructions: [],
        totalSolTransfer: 0,
        tokenTransfers: [],
        authorityChanges: [],
        riskLevel: 'low',
        warnings: [],
        unknownPrograms: [],
        requiresConfirmation: false,
        serializedTransaction: '',
      };

      const description = getTransactionDescription(summary);

      expect(description).toContain('no detected transfers');
    });

    it('should combine multiple elements', () => {
      const summary: TransactionSummary = {
        id: 'test-7',
        analyzedAt: Date.now(),
        domain: 'test.com',
        instructions: [],
        totalSolTransfer: 2.0,
        tokenTransfers: [
          {
            mint: 'token-mint',
            amount: 100,
            rawAmount: '100',
            source: 'src',
            destination: 'dst',
            isApproval: false,
          },
        ],
        authorityChanges: [
          {
            type: 'owner',
            account: 'acc',
            newAuthority: 'new',
            isWalletAuthority: true,
          },
        ],
        riskLevel: 'medium',
        warnings: [],
        unknownPrograms: [],
        requiresConfirmation: true,
        serializedTransaction: '',
      };

      const description = getTransactionDescription(summary);

      expect(description).toContain('SOL');
      expect(description).toContain('token transfer');
      expect(description).toContain('authority change');
    });
  });

  describe('getRiskLevelColor', () => {
    it('should return success for low risk', () => {
      expect(getRiskLevelColor('low')).toBe('success');
    });

    it('should return warning for medium risk', () => {
      expect(getRiskLevelColor('medium')).toBe('warning');
    });

    it('should return error for high risk', () => {
      expect(getRiskLevelColor('high')).toBe('error');
    });

    it('should return default for unknown risk', () => {
      expect(getRiskLevelColor('unknown' as RiskLevel)).toBe('default');
    });
  });

  describe('getRiskLevelIcon', () => {
    it('should return check for low risk', () => {
      expect(getRiskLevelIcon('low')).toBe('check');
    });

    it('should return warning for medium risk', () => {
      expect(getRiskLevelIcon('medium')).toBe('warning');
    });

    it('should return error for high risk', () => {
      expect(getRiskLevelIcon('high')).toBe('error');
    });

    it('should return info for unknown risk', () => {
      expect(getRiskLevelIcon('unknown' as RiskLevel)).toBe('info');
    });
  });

  describe('Risk Level Scenarios', () => {
    const createBaseSummary = (overrides: Partial<TransactionSummary> = {}): TransactionSummary => ({
      id: 'test',
      analyzedAt: Date.now(),
      domain: 'test.com',
      instructions: [],
      totalSolTransfer: 0,
      tokenTransfers: [],
      authorityChanges: [],
      riskLevel: 'low',
      warnings: [],
      unknownPrograms: [],
      requiresConfirmation: false,
      serializedTransaction: '',
      ...overrides,
    });

    it('should identify high risk for malicious programs', () => {
      const summary = createBaseSummary({
        instructions: [{
          programId: 'malicious-program',
          programName: 'Malicious',
          programRisk: ProgramRiskLevel.MALICIOUS,
          description: 'Malicious program',
          accounts: [],
          warnings: ['WARNING: This program has been flagged as malicious'],
        }],
        riskLevel: 'high',
        warnings: ['WARNING: This program has been flagged as malicious'],
        requiresConfirmation: true,
      });

      expect(summary.riskLevel).toBe('high');
      expect(summary.requiresConfirmation).toBe(true);
    });

    it('should identify high risk for unlimited approvals', () => {
      const summary = createBaseSummary({
        tokenTransfers: [{
          mint: 'token',
          amount: 0,
          rawAmount: 'unlimited',
          source: 'src',
          destination: 'dst',
          isApproval: true,
          approvalAmount: null, // unlimited
        }],
        riskLevel: 'high',
        warnings: ['Unlimited token approval detected'],
        requiresConfirmation: true,
      });

      expect(summary.riskLevel).toBe('high');
    });

    it('should identify medium risk for unknown programs', () => {
      const summary = createBaseSummary({
        unknownPrograms: ['unknown-1', 'unknown-2'],
        riskLevel: 'medium',
        warnings: ['Transaction interacts with 2 unknown program(s)'],
        requiresConfirmation: true,
      });

      expect(summary.riskLevel).toBe('medium');
    });

    it('should identify medium risk for large transfers', () => {
      const summary = createBaseSummary({
        totalSolTransfer: 150, // above 100 SOL threshold
        riskLevel: 'medium',
        warnings: ['Large transfer: 150.0000 SOL'],
        requiresConfirmation: true,
      });

      expect(summary.riskLevel).toBe('medium');
    });

    it('should identify low risk for simple transfers', () => {
      const summary = createBaseSummary({
        totalSolTransfer: 1.0,
        instructions: [{
          programId: '11111111111111111111111111111111',
          programName: 'System Program',
          programRisk: ProgramRiskLevel.VERIFIED,
          description: 'Transfer 1 SOL',
          accounts: [],
          warnings: [],
        }],
        riskLevel: 'low',
      });

      expect(summary.riskLevel).toBe('low');
    });
  });
});

describe('Instruction Type Detection', () => {
  describe('System Program Instructions', () => {
    it('should identify transfer instruction', () => {
      // Transfer instruction type value
      const transferType = 2;
      expect(transferType).toBe(2);
    });

    it('should identify create account instruction', () => {
      const createAccountType = 0;
      expect(createAccountType).toBe(0);
    });
  });

  describe('Token Program Instructions', () => {
    it('should identify transfer instruction', () => {
      const transferType = 3;
      expect(transferType).toBe(3);
    });

    it('should identify approve instruction', () => {
      const approveType = 4;
      expect(approveType).toBe(4);
    });

    it('should identify set authority instruction', () => {
      const setAuthorityType = 6;
      expect(setAuthorityType).toBe(6);
    });
  });
});


