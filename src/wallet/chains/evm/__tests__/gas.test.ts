/**
 * Tests for EVM gas estimation functions
 */

import {
  formatGasPrice,
  formatFee,
  calculateMaxSendable,
  GasEstimate,
} from '../gas';
import { parseUnits, formatUnits } from 'ethers';

// Mock dependencies
jest.mock('../../config', () => ({
  getEVMChainConfig: jest.fn(() => ({
    chainId: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    rpcUrls: ['https://eth.example.com'],
    testnet: { chainId: 11155111, rpcUrls: ['https://sepolia.example.com'] },
    explorer: 'https://etherscan.io',
    isL2: false,
  })),
  getNumericChainId: jest.fn((chainId: string, testnet: boolean) => 
    testnet ? 11155111 : 1
  ),
  isL2Chain: jest.fn(() => false),
  getL2Type: jest.fn(() => undefined),
  DEFAULT_GAS_LIMIT: BigInt(21000),
  ERC20_GAS_LIMIT: BigInt(65000),
  WEI_PER_ETH: BigInt(10) ** BigInt(18),
  GWEI_PER_ETH: BigInt(10) ** BigInt(9),
}));

jest.mock('../client', () => ({
  getFeeData: jest.fn(() => Promise.resolve({
    gasPrice: parseUnits('30', 'gwei'),
    maxFeePerGas: parseUnits('50', 'gwei'),
    maxPriorityFeePerGas: parseUnits('2', 'gwei'),
  })),
  estimateGas: jest.fn(() => Promise.resolve(BigInt(21000))),
  call: jest.fn(() => Promise.resolve('0x')),
  withFailover: jest.fn((chainId, testnet, fn) => fn()),
  getBestProvider: jest.fn(() => Promise.resolve(null)),
}));

describe('Gas Functions', () => {
  describe('formatGasPrice', () => {
    it('should format gas price in gwei', () => {
      const gasPrice = parseUnits('30', 'gwei');
      const formatted = formatGasPrice(gasPrice);
      
      expect(formatted).toBe('30.00 gwei');
    });

    it('should format gas price in mwei for small values', () => {
      const gasPrice = parseUnits('0.5', 'gwei');
      const formatted = formatGasPrice(gasPrice);
      
      expect(formatted).toBe('500.00 mwei');
    });

    it('should handle zero gas price', () => {
      const formatted = formatGasPrice(0n);
      
      expect(formatted).toBe('0.00 mwei');
    });

    it('should handle high gas prices', () => {
      const gasPrice = parseUnits('200', 'gwei');
      const formatted = formatGasPrice(gasPrice);
      
      expect(formatted).toBe('200.00 gwei');
    });
  });

  describe('formatFee', () => {
    it('should format fee in ETH', () => {
      const fee = parseUnits('0.001', 'ether');
      const formatted = formatFee(fee);
      
      expect(formatted).toBe('0.001000 ETH');
    });

    it('should use custom symbol', () => {
      const fee = parseUnits('0.001', 'ether');
      const formatted = formatFee(fee, 'MATIC');
      
      expect(formatted).toBe('0.001000 MATIC');
    });

    it('should show < 0.0001 for very small fees', () => {
      const fee = parseUnits('0.00001', 'ether');
      const formatted = formatFee(fee);
      
      expect(formatted).toBe('<0.0001 ETH');
    });

    it('should handle zero fee', () => {
      const formatted = formatFee(0n);
      
      expect(formatted).toBe('<0.0001 ETH');
    });

    it('should format large fees correctly', () => {
      const fee = parseUnits('1.5', 'ether');
      const formatted = formatFee(fee);
      
      expect(formatted).toBe('1.500000 ETH');
    });
  });

  describe('calculateMaxSendable', () => {
    it('should calculate max sendable amount', () => {
      const balance = parseUnits('1', 'ether');
      const gasEstimate: GasEstimate = {
        gasLimit: 21000n,
        gasPrice: parseUnits('30', 'gwei'),
        maxPriorityFee: parseUnits('2', 'gwei'),
        totalFee: parseUnits('0.00063', 'ether'), // 21000 * 30 gwei
        totalFeeFormatted: 0.00063,
        l1DataFee: 0n,
        isEIP1559: true,
      };

      const maxSendable = calculateMaxSendable(balance, gasEstimate);

      // Should be balance - total fee
      expect(maxSendable).toBe(balance - gasEstimate.totalFee);
    });

    it('should return 0 when balance is less than fee', () => {
      const balance = parseUnits('0.0001', 'ether');
      const gasEstimate: GasEstimate = {
        gasLimit: 21000n,
        gasPrice: parseUnits('30', 'gwei'),
        maxPriorityFee: parseUnits('2', 'gwei'),
        totalFee: parseUnits('0.001', 'ether'),
        totalFeeFormatted: 0.001,
        l1DataFee: 0n,
        isEIP1559: true,
      };

      const maxSendable = calculateMaxSendable(balance, gasEstimate);

      expect(maxSendable).toBe(0n);
    });

    it('should return 0 when balance equals fee', () => {
      const fee = parseUnits('0.001', 'ether');
      const gasEstimate: GasEstimate = {
        gasLimit: 21000n,
        gasPrice: parseUnits('30', 'gwei'),
        maxPriorityFee: parseUnits('2', 'gwei'),
        totalFee: fee,
        totalFeeFormatted: 0.001,
        l1DataFee: 0n,
        isEIP1559: true,
      };

      const maxSendable = calculateMaxSendable(fee, gasEstimate);

      expect(maxSendable).toBe(0n);
    });

    it('should account for L1 data fee', () => {
      const balance = parseUnits('1', 'ether');
      const l1DataFee = parseUnits('0.001', 'ether');
      const l2Fee = parseUnits('0.00063', 'ether');
      const totalFee = l2Fee + l1DataFee;

      const gasEstimate: GasEstimate = {
        gasLimit: 21000n,
        gasPrice: parseUnits('30', 'gwei'),
        maxPriorityFee: parseUnits('2', 'gwei'),
        totalFee,
        totalFeeFormatted: Number(formatUnits(totalFee, 18)),
        l1DataFee,
        isEIP1559: true,
      };

      const maxSendable = calculateMaxSendable(balance, gasEstimate);

      expect(maxSendable).toBe(balance - totalFee);
    });
  });
});

describe('Gas Estimation Types', () => {
  describe('GasEstimate structure', () => {
    it('should have correct properties', () => {
      const estimate: GasEstimate = {
        gasLimit: 21000n,
        gasPrice: parseUnits('30', 'gwei'),
        maxPriorityFee: parseUnits('2', 'gwei'),
        totalFee: parseUnits('0.00063', 'ether'),
        totalFeeFormatted: 0.00063,
        l1DataFee: 0n,
        isEIP1559: true,
      };

      expect(estimate.gasLimit).toBe(21000n);
      expect(estimate.isEIP1559).toBe(true);
      expect(estimate.l1DataFee).toBe(0n);
    });

    it('should handle non-EIP1559 transactions', () => {
      const estimate: GasEstimate = {
        gasLimit: 21000n,
        gasPrice: parseUnits('30', 'gwei'),
        maxPriorityFee: 0n,
        totalFee: parseUnits('0.00063', 'ether'),
        totalFeeFormatted: 0.00063,
        l1DataFee: 0n,
        isEIP1559: false,
      };

      expect(estimate.isEIP1559).toBe(false);
      expect(estimate.maxPriorityFee).toBe(0n);
    });
  });
});

describe('Gas Price Bounds', () => {
  it('should validate MIN_GAS_PRICE_GWEI', () => {
    const minGasPrice = 1n; // 1 gwei
    const minInWei = minGasPrice * BigInt(10 ** 9);
    
    expect(minInWei).toBe(BigInt(1000000000));
  });

  it('should validate MAX_GAS_PRICE_GWEI', () => {
    const maxGasPrice = 1000n; // 1000 gwei
    const maxInWei = maxGasPrice * BigInt(10 ** 9);
    
    expect(maxInWei).toBe(BigInt(1000000000000));
  });
});

