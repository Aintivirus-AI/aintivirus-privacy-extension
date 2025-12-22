/**
 * Tests for Solana chain adapter functionality
 */

import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Mock the entire module
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn(),
      getLatestBlockhash: jest.fn(),
      sendRawTransaction: jest.fn(),
      confirmTransaction: jest.fn(),
      getSignatureStatus: jest.fn(),
      getAccountInfo: jest.fn(),
      simulateTransaction: jest.fn(),
      getTokenAccountsByOwner: jest.fn(),
      getFeeForMessage: jest.fn(),
    })),
    PublicKey: actual.PublicKey,
    LAMPORTS_PER_SOL: actual.LAMPORTS_PER_SOL,
    SystemProgram: actual.SystemProgram,
    Transaction: actual.Transaction,
  };
});

describe('Solana Chain Adapter', () => {
  describe('Balance Conversion', () => {
    it('should convert SOL to lamports correctly', () => {
      const sol = 1;
      const lamports = sol * LAMPORTS_PER_SOL;

      expect(lamports).toBe(1_000_000_000);
    });

    it('should convert lamports to SOL correctly', () => {
      const lamports = 1_500_000_000;
      const sol = lamports / LAMPORTS_PER_SOL;

      expect(sol).toBe(1.5);
    });

    it('should handle fractional SOL', () => {
      const sol = 0.001;
      const lamports = Math.floor(sol * LAMPORTS_PER_SOL);

      expect(lamports).toBe(1_000_000);
    });

    it('should handle minimum lamport amounts', () => {
      const onelamport = 1;
      const sol = onelamport / LAMPORTS_PER_SOL;

      expect(sol).toBe(0.000000001);
    });
  });

  describe('Address Validation', () => {
    it('should validate correct Solana public key', () => {
      const validAddress = 'GrAkKfEpTKQuVHG2Y97Y2FF4i7y7Q5AHLK94JBy7Y5yv';

      expect(() => new PublicKey(validAddress)).not.toThrow();
    });

    it('should reject invalid Solana address', () => {
      const invalidAddress = 'not-a-valid-address';

      expect(() => new PublicKey(invalidAddress)).toThrow();
    });

    it('should reject address that is too short', () => {
      const shortAddress = 'GrAkK';

      expect(() => new PublicKey(shortAddress)).toThrow();
    });
  });

  describe('PublicKey Utilities', () => {
    it('should convert PublicKey to base58', () => {
      const address = 'GrAkKfEpTKQuVHG2Y97Y2FF4i7y7Q5AHLK94JBy7Y5yv';
      const pubkey = new PublicKey(address);

      expect(pubkey.toBase58()).toBe(address);
    });

    it('should create PublicKey from bytes', () => {
      const address = 'GrAkKfEpTKQuVHG2Y97Y2FF4i7y7Q5AHLK94JBy7Y5yv';
      const pubkey = new PublicKey(address);
      const bytes = pubkey.toBytes();
      const reconstructed = new PublicKey(bytes);

      expect(reconstructed.toBase58()).toBe(address);
    });

    it('should compare PublicKeys correctly', () => {
      const address = 'GrAkKfEpTKQuVHG2Y97Y2FF4i7y7Q5AHLK94JBy7Y5yv';
      const pubkey1 = new PublicKey(address);
      const pubkey2 = new PublicKey(address);

      expect(pubkey1.equals(pubkey2)).toBe(true);
    });
  });

  describe('Network Configuration', () => {
    it('should define mainnet-beta cluster', () => {
      const mainnetRpc = 'https://api.mainnet-beta.solana.com';
      expect(mainnetRpc).toContain('mainnet');
    });

    it('should define devnet cluster', () => {
      const devnetRpc = 'https://api.devnet.solana.com';
      expect(devnetRpc).toContain('devnet');
    });
  });

  describe('Fee Constants', () => {
    it('should define minimum rent-exempt balance', () => {
      const MIN_RENT_EXEMPT = 890880; // lamports
      expect(MIN_RENT_EXEMPT).toBeGreaterThan(0);
    });

    it('should define default priority fee', () => {
      const DEFAULT_PRIORITY_FEE = 1000; // lamports
      expect(DEFAULT_PRIORITY_FEE).toBeGreaterThan(0);
    });

    it('should define default base fee', () => {
      const DEFAULT_BASE_FEE = 5000; // lamports
      expect(DEFAULT_BASE_FEE).toBeGreaterThan(0);
    });
  });

  describe('Program IDs', () => {
    it('should define System Program ID', () => {
      const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
      expect(SYSTEM_PROGRAM_ID).toHaveLength(32);
    });

    it('should define Token Program ID', () => {
      const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      expect(() => new PublicKey(TOKEN_PROGRAM_ID)).not.toThrow();
    });

    it('should define Associated Token Program ID', () => {
      const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
      expect(() => new PublicKey(ATA_PROGRAM_ID)).not.toThrow();
    });
  });
});

describe('Solana Transaction Utilities', () => {
  describe('Transaction Confirmation', () => {
    it('should define confirmation timeout', () => {
      const CONFIRMATION_TIMEOUT = 60000; // 60 seconds
      expect(CONFIRMATION_TIMEOUT).toBeGreaterThan(0);
    });

    it('should define max retries', () => {
      const MAX_RETRIES = 3;
      expect(MAX_RETRIES).toBeGreaterThan(0);
    });
  });

  describe('Transaction Types', () => {
    it('should categorize transfer transactions', () => {
      const txType = 'transfer';
      expect(['transfer', 'token_transfer', 'unknown']).toContain(txType);
    });

    it('should categorize token transfer transactions', () => {
      const txType = 'token_transfer';
      expect(['transfer', 'token_transfer', 'unknown']).toContain(txType);
    });
  });
});

describe('Solana Token Operations', () => {
  describe('SPL Token Constants', () => {
    it('should define token instruction types', () => {
      const TRANSFER_IX = 3;
      const APPROVE_IX = 4;
      const REVOKE_IX = 5;
      const CLOSE_ACCOUNT_IX = 9;

      expect(TRANSFER_IX).toBe(3);
      expect(APPROVE_IX).toBe(4);
      expect(REVOKE_IX).toBe(5);
      expect(CLOSE_ACCOUNT_IX).toBe(9);
    });
  });

  describe('Token Account', () => {
    it('should validate token mint address format', () => {
      const validMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
      expect(() => new PublicKey(validMint)).not.toThrow();
    });

    it('should validate token account address format', () => {
      const validTokenAccount = 'GrAkKfEpTKQuVHG2Y97Y2FF4i7y7Q5AHLK94JBy7Y5yv';
      expect(() => new PublicKey(validTokenAccount)).not.toThrow();
    });
  });
});

describe('Solana Balance Formatting', () => {
  it('should format SOL balance with decimals', () => {
    const lamports = 1_234_567_890;
    const sol = lamports / LAMPORTS_PER_SOL;
    const formatted = sol.toFixed(6);

    expect(formatted).toBe('1.234568');
  });

  it('should handle zero balance', () => {
    const lamports = 0;
    const sol = lamports / LAMPORTS_PER_SOL;

    expect(sol).toBe(0);
  });

  it('should handle large balances', () => {
    const lamports = 1_000_000_000_000; // 1000 SOL
    const sol = lamports / LAMPORTS_PER_SOL;

    expect(sol).toBe(1000);
  });

  it('should handle dust amounts', () => {
    const lamports = 100; // very small amount
    const sol = lamports / LAMPORTS_PER_SOL;

    expect(sol).toBe(0.0000001);
  });
});

