/**
 * Tests for EVM transaction decoding
 */

import {
  decodeEvmTx,
  clearDecodingCache,
  decodeAddress,
  decodeUint256,
  parseHexBigInt,
  EvmTxInput,
} from '../evmDecoder';
import {
  TEST_RECIPIENT_EVM,
  TEST_EVM_ADDRESS,
  EVM_FUNCTION_SELECTORS,
} from '../../__tests__/utils/fixtures';

// Mock dependencies
jest.mock('../selectors', () => ({
  lookupSelector: jest.fn((selector: string) => {
    const selectors: Record<string, { name: string; category: string }> = {
      '0xa9059cbb': { name: 'transfer', category: 'token' },
      '0x095ea7b3': { name: 'approve', category: 'approval' },
      '0x23b872dd': { name: 'transferFrom', category: 'token' },
      '0xa22cb465': { name: 'setApprovalForAll', category: 'approval' },
      '0x42842e0e': { name: 'safeTransferFrom', category: 'nft' },
    };
    return selectors[selector.toLowerCase()] || null;
  }),
  lookupContract: jest.fn(() => null),
  getContractDisplayName: jest.fn((address: string) => 
    address.slice(0, 6) + '...' + address.slice(-4)
  ),
}));

jest.mock('../warnings', () => ({
  analyzeApprovalAmount: jest.fn(() => []),
  analyzeEthValue: jest.fn(() => []),
  formatAmount: jest.fn((amount: bigint) => {
    // Format as token amount (assuming 18 decimals)
    const eth = Number(amount) / 1e18;
    if (eth === 0) return '0';
    if (eth < 0.001) return '< 0.001';
    return eth.toFixed(4);
  }),
  formatEthValue: jest.fn((value: bigint) => {
    const eth = Number(value) / 1e18;
    if (eth === 0) return '0 ETH';
    return eth.toFixed(6) + ' ETH';
  }),
  isInfiniteApproval: jest.fn((amount: bigint) => 
    amount >= BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') / 2n
  ),
  warnContractCreation: jest.fn(() => ({ level: 'warning', message: 'Contract creation' })),
  warnNftApprovalForAll: jest.fn(() => ({ level: 'high', message: 'NFT approval for all' })),
  warnPermit2: jest.fn(() => ({ level: 'warning', message: 'Permit2' })),
  warnUnverifiedContract: jest.fn(() => ({ level: 'warning', message: 'Unverified contract' })),
}));

describe('EVM Decoder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDecodingCache();
  });

  describe('decodeEvmTx', () => {
    describe('Simple ETH Transfer', () => {
      it('should decode simple ETH transfer', () => {
        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          value: '0xDE0B6B3A7640000', // 1 ETH
          data: '0x',
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('transfer');
        expect(result.summary).toContain('Transfer');
        expect(result.summary).toContain('ETH');
        expect(result.details.to).toBe(TEST_RECIPIENT_EVM);
      });

      it('should handle zero value transfer', () => {
        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          value: '0x0',
          data: '0x',
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('transfer');
        expect(result.details.valueEth).toContain('0');
      });

      it('should handle missing value', () => {
        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          data: '0x',
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('transfer');
      });
    });

    describe('Contract Creation', () => {
      it('should detect contract creation when to is missing', () => {
        const tx: EvmTxInput = {
          value: '0x0',
          data: '0x608060405234801561001057600080fd5b50', // Simplified bytecode
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('contract_creation');
        expect(result.summary).toContain('Deploy');
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    describe('ERC20 Transfer', () => {
      it('should decode ERC20 transfer', () => {
        // transfer(address to, uint256 amount)
        const data = EVM_FUNCTION_SELECTORS.transfer +
          '000000000000000000000000' + TEST_RECIPIENT_EVM.slice(2) + // to address
          '0000000000000000000000000000000000000000000000000de0b6b3a7640000'; // 1 token

        const tx: EvmTxInput = {
          to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
          value: '0x0',
          data,
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('transfer');
        expect(result.decodedCall).toBeDefined();
        expect(result.decodedCall?.name).toBe('transfer');
        expect(result.decodedCall?.params.length).toBe(2);
      });
    });

    describe('ERC20 Approve', () => {
      it('should decode ERC20 approve', () => {
        // approve(address spender, uint256 amount)
        const spender = TEST_RECIPIENT_EVM;
        const data = EVM_FUNCTION_SELECTORS.approve +
          '000000000000000000000000' + spender.slice(2) +
          '0000000000000000000000000000000000000000000000000de0b6b3a7640000'; // amount

        const tx: EvmTxInput = {
          to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          value: '0x0',
          data,
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('approval');
        expect(result.decodedCall?.name).toBe('approve');
        expect(result.summary).toContain('Approve');
      });

      it('should detect unlimited approval', () => {
        // Max uint256 approval
        const data = EVM_FUNCTION_SELECTORS.approve +
          '000000000000000000000000' + TEST_RECIPIENT_EVM.slice(2) +
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'; // MAX_UINT256

        const tx: EvmTxInput = {
          to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          value: '0x0',
          data,
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('approval');
        expect(result.summary).toContain('UNLIMITED');
      });
    });

    describe('NFT Operations', () => {
      it('should decode setApprovalForAll', () => {
        // setApprovalForAll(address operator, bool approved)
        const data = '0xa22cb465' +
          '000000000000000000000000' + TEST_RECIPIENT_EVM.slice(2) +
          '0000000000000000000000000000000000000000000000000000000000000001'; // true

        const tx: EvmTxInput = {
          to: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
          value: '0x0',
          data,
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('approval');
        expect(result.decodedCall?.name).toBe('setApprovalForAll');
      });

      it('should decode NFT safeTransferFrom', () => {
        // safeTransferFrom(address from, address to, uint256 tokenId)
        const data = '0x42842e0e' +
          '000000000000000000000000' + TEST_EVM_ADDRESS.slice(2) + // from
          '000000000000000000000000' + TEST_RECIPIENT_EVM.slice(2) + // to
          '0000000000000000000000000000000000000000000000000000000000000001'; // tokenId 1

        const tx: EvmTxInput = {
          to: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
          value: '0x0',
          data,
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('nft');
        expect(result.decodedCall?.name).toBe('safeTransferFrom');
        expect(result.summary).toContain('NFT');
      });
    });

    describe('Unknown Functions', () => {
      it('should handle unknown function selectors', () => {
        const data = '0xdeadbeef' + // Unknown selector
          '0000000000000000000000000000000000000000000000000000000000000000';

        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          value: '0x0',
          data,
        };

        const result = decodeEvmTx(tx);

        expect(result.kind).toBe('contract_call');
        expect(result.summary).toContain('unknown');
      });
    });

    describe('Caching', () => {
      it('should cache decoded transactions', () => {
        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          value: '0xDE0B6B3A7640000',
          data: '0x',
        };

        const result1 = decodeEvmTx(tx);
        const result2 = decodeEvmTx(tx);

        expect(result1).toBe(result2); // Same reference = from cache
      });

      it('should clear cache correctly', () => {
        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          value: '0xDE0B6B3A7640000',
          data: '0x',
        };

        const result1 = decodeEvmTx(tx);
        clearDecodingCache();
        const result2 = decodeEvmTx(tx);

        expect(result1).not.toBe(result2); // Different references after cache clear
        expect(result1).toEqual(result2); // But same content
      });
    });

    describe('Transaction Details', () => {
      it('should include all transaction details', () => {
        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          value: '0xDE0B6B3A7640000',
          data: '0x',
          chainId: 1,
          nonce: 5,
          gasLimit: '21000',
          maxFeePerGas: '50000000000',
          maxPriorityFeePerGas: '2000000000',
        };

        const result = decodeEvmTx(tx);

        expect(result.details.to).toBe(TEST_RECIPIENT_EVM);
        expect(result.details.chainId).toBe(1);
        expect(result.details.nonce).toBe(5);
        expect(result.details.gasLimit).toBe('21000');
        expect(result.details.maxFee).toBe('50000000000');
        expect(result.details.maxPriorityFee).toBe('2000000000');
      });

      it('should calculate data size', () => {
        const data = '0xa9059cbb' +
          '000000000000000000000000' + TEST_RECIPIENT_EVM.slice(2) +
          '0000000000000000000000000000000000000000000000000de0b6b3a7640000';

        const tx: EvmTxInput = {
          to: TEST_RECIPIENT_EVM,
          data,
        };

        const result = decodeEvmTx(tx);

        expect(result.details.dataSize).toBe(68); // 4 bytes selector + 32 + 32
      });
    });
  });

  describe('Helper Functions', () => {
    describe('decodeAddress', () => {
      it('should decode address from correct position', () => {
        const data = '0xa9059cbb' +
          '000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7ce51' +
          '0000000000000000000000000000000000000000000000000000000000000001';

        const address = decodeAddress(data, 0);
        
        expect(address.toLowerCase()).toBe('0x742d35cc6634c0532925a3b844bc9e7595f7ce51');
      });

      it('should decode second parameter address', () => {
        const data = '0x23b872dd' + // transferFrom
          '0000000000000000000000001111111111111111111111111111111111111111' + // from
          '0000000000000000000000002222222222222222222222222222222222222222' + // to
          '0000000000000000000000000000000000000000000000000000000000000001';   // amount

        const toAddress = decodeAddress(data, 1);
        
        expect(toAddress.toLowerCase()).toBe('0x2222222222222222222222222222222222222222');
      });
    });

    describe('decodeUint256', () => {
      it('should decode uint256 from correct position', () => {
        const data = '0xa9059cbb' +
          '000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7ce51' +
          '0000000000000000000000000000000000000000000000000de0b6b3a7640000'; // 1e18

        const amount = decodeUint256(data, 1);
        
        expect(amount).toBe(BigInt('1000000000000000000'));
      });

      it('should handle zero value', () => {
        const data = '0xa9059cbb' +
          '000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7ce51' +
          '0000000000000000000000000000000000000000000000000000000000000000';

        const amount = decodeUint256(data, 1);
        
        expect(amount).toBe(0n);
      });

      it('should handle max uint256', () => {
        const data = '0xa9059cbb' +
          '000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f7ce51' +
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

        const amount = decodeUint256(data, 1);
        
        expect(amount).toBe(BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'));
      });

      it('should return 0 for out of bounds', () => {
        const data = '0xa9059cbb';

        const amount = decodeUint256(data, 5);
        
        expect(amount).toBe(0n);
      });
    });

    describe('parseHexBigInt', () => {
      it('should parse hex string to bigint', () => {
        expect(parseHexBigInt('0xDE0B6B3A7640000')).toBe(BigInt('1000000000000000000'));
      });

      it('should handle empty or null values', () => {
        expect(parseHexBigInt('')).toBe(0n);
        expect(parseHexBigInt('0x')).toBe(0n);
        expect(parseHexBigInt('0x0')).toBe(0n);
        expect(parseHexBigInt(undefined)).toBe(0n);
      });

      it('should handle small values', () => {
        expect(parseHexBigInt('0x1')).toBe(1n);
        expect(parseHexBigInt('0xa')).toBe(10n);
        expect(parseHexBigInt('0xff')).toBe(255n);
      });
    });
  });
});

