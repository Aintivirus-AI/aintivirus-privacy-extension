/**
 * Tests for EIP-712 typed data parsing
 */

import { decodeTypedData, getChainName, formatDomain } from '../typedDataParser';
import { MOCK_TYPED_DATA } from '../../__tests__/utils/fixtures';

// Mock dependencies
jest.mock('../selectors', () => ({
  lookupContract: jest.fn(() => null),
  getContractDisplayName: jest.fn(
    (address: string) => address.slice(0, 6) + '...' + address.slice(-4),
  ),
}));

jest.mock('../warnings', () => ({
  isInfiniteApproval: jest.fn(
    (amount: bigint) =>
      amount >= BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') / 2n,
  ),
  isSuspiciousDeadline: jest.fn((deadline: bigint) => {
    const now = Math.floor(Date.now() / 1000);
    const deadlineNum = Number(deadline);
    if (deadlineNum < now) return 'expired';
    if (deadlineNum > now + 365 * 24 * 60 * 60) return 'long';
    return 'ok';
  }),
  formatAmount: jest.fn((amount: bigint) => {
    const eth = Number(amount) / 1e18;
    if (eth === 0) return '0';
    return eth.toFixed(4);
  }),
  formatDeadline: jest.fn((deadline: bigint) => {
    return new Date(Number(deadline) * 1000).toISOString();
  }),
  warnInfiniteApproval: jest.fn(() => ({
    level: 'critical',
    code: 'INFINITE_APPROVAL',
    title: 'Infinite Approval',
    description: 'Unlimited approval',
  })),
  warnDeadline: jest.fn((status: string) => ({
    level: 'warning',
    code: 'DEADLINE_WARNING',
    title: 'Deadline Warning',
    description: `Deadline: ${status}`,
  })),
  warnPermitSignature: jest.fn(() => ({
    level: 'info',
    code: 'PERMIT_SIGNATURE',
    title: 'Permit Signature',
    description: 'Permit signature detected',
  })),
  warnPermit2: jest.fn(() => ({
    level: 'warning',
    code: 'PERMIT2_SIGNATURE',
    title: 'Permit2 Signature',
    description: 'Permit2 signature detected',
  })),
  warnUnknownSpender: jest.fn((address: string) => ({
    level: 'warning',
    code: 'UNKNOWN_SPENDER',
    title: 'Unknown Spender',
    description: `Unknown spender: ${address}`,
  })),
  createWarning: jest.fn((level: string, message: string) => ({
    level,
    code: 'CUSTOM_WARNING',
    title: 'Warning',
    description: message,
  })),
  MAX_UINT256: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
}));

describe('TypedDataParser', () => {
  describe('decodeTypedData', () => {
    it('should parse valid typed data', () => {
      const rawData = JSON.stringify(MOCK_TYPED_DATA);
      const result = decodeTypedData(rawData);

      expect(result.isValid).toBe(true);
      expect(result.raw).toBeDefined();
      expect(result.pattern).toBe('permit');
    });

    it('should detect Permit pattern', () => {
      const permitData = {
        ...MOCK_TYPED_DATA,
        primaryType: 'Permit',
      };

      const result = decodeTypedData(JSON.stringify(permitData));

      expect(result.pattern).toBe('permit');
    });

    it('should detect Permit2 pattern', () => {
      const permit2Data = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          PermitSingle: [
            { name: 'details', type: 'PermitDetails' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' },
          ],
          PermitDetails: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' },
          ],
        },
        primaryType: 'PermitSingle',
        domain: {
          name: 'Permit2',
          chainId: 1,
          verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
        },
        message: {
          details: {
            token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            amount: '1000000000',
            expiration: Math.floor(Date.now() / 1000) + 3600,
            nonce: 0,
          },
          spender: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
          sigDeadline: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const result = decodeTypedData(JSON.stringify(permit2Data));

      expect(result.pattern).toBe('permit2');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should detect Order pattern', () => {
      const orderData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          Order: [
            { name: 'maker', type: 'address' },
            { name: 'taker', type: 'address' },
          ],
        },
        primaryType: 'Order',
        domain: {
          name: 'DEX',
          chainId: 1,
        },
        message: {
          maker: '0x1234567890123456789012345678901234567890',
          taker: '0x0987654321098765432109876543210987654321',
        },
      };

      const result = decodeTypedData(JSON.stringify(orderData));

      expect(result.pattern).toBe('order');
    });

    it('should detect Vote pattern', () => {
      const voteData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          Vote: [
            { name: 'proposalId', type: 'uint256' },
            { name: 'support', type: 'bool' },
          ],
        },
        primaryType: 'Vote',
        domain: {
          name: 'Governor',
          chainId: 1,
        },
        message: {
          proposalId: '1',
          support: true,
        },
      };

      const result = decodeTypedData(JSON.stringify(voteData));

      expect(result.pattern).toBe('vote');
    });

    it('should return unknown pattern for unrecognized types', () => {
      const unknownData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          CustomMessage: [{ name: 'data', type: 'string' }],
        },
        primaryType: 'CustomMessage',
        domain: {
          name: 'Custom',
          chainId: 1,
        },
        message: {
          data: 'hello',
        },
      };

      const result = decodeTypedData(JSON.stringify(unknownData));

      expect(result.pattern).toBe('unknown');
    });
  });

  describe('Validation', () => {
    it('should reject invalid JSON', () => {
      const result = decodeTypedData('not valid json {{{');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should reject missing types field', () => {
      const data = {
        domain: { name: 'Test' },
        primaryType: 'Test',
        message: {},
      };

      const result = decodeTypedData(JSON.stringify(data));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('types');
    });

    it('should reject missing domain field', () => {
      const data = {
        types: { Test: [] },
        primaryType: 'Test',
        message: {},
      };

      const result = decodeTypedData(JSON.stringify(data));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('domain');
    });

    it('should reject missing primaryType field', () => {
      const data = {
        types: { Test: [] },
        domain: { name: 'Test' },
        message: {},
      };

      const result = decodeTypedData(JSON.stringify(data));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('primaryType');
    });

    it('should reject missing message field', () => {
      const data = {
        types: { Test: [] },
        domain: { name: 'Test' },
        primaryType: 'Test',
      };

      const result = decodeTypedData(JSON.stringify(data));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('message');
    });

    it('should reject when primaryType not in types', () => {
      const data = {
        types: { Other: [] },
        domain: { name: 'Test' },
        primaryType: 'Test',
        message: {},
      };

      const result = decodeTypedData(JSON.stringify(data));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject domain without name or verifyingContract', () => {
      const data = {
        types: { Test: [] },
        domain: { chainId: 1 },
        primaryType: 'Test',
        message: {},
      };

      const result = decodeTypedData(JSON.stringify(data));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('name');
    });
  });

  describe('Display Model', () => {
    it('should build display model', () => {
      const result = decodeTypedData(JSON.stringify(MOCK_TYPED_DATA));

      expect(result.displayModel).toBeDefined();
      expect(result.displayModel?.domain).toEqual(MOCK_TYPED_DATA.domain);
      expect(result.displayModel?.primaryType).toBe('Permit');
      expect(result.displayModel?.messageFields).toBeDefined();
    });

    it('should extract highlighted fields', () => {
      const result = decodeTypedData(JSON.stringify(MOCK_TYPED_DATA));

      expect(result.highlightedFields).toBeDefined();
      expect(result.highlightedFields.length).toBeGreaterThan(0);

      // Should find spender field
      const spenderField = result.highlightedFields.find((f) => f.name.toLowerCase() === 'spender');
      expect(spenderField).toBeDefined();
    });

    it('should handle nested structs', () => {
      const nestedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          Outer: [
            { name: 'inner', type: 'Inner' },
            { name: 'value', type: 'uint256' },
          ],
          Inner: [
            { name: 'amount', type: 'uint256' },
            { name: 'spender', type: 'address' },
          ],
        },
        primaryType: 'Outer',
        domain: {
          name: 'Nested',
          chainId: 1,
        },
        message: {
          inner: {
            amount: '1000000000000000000',
            spender: '0x1234567890123456789012345678901234567890',
          },
          value: '100',
        },
      };

      const result = decodeTypedData(JSON.stringify(nestedData));

      expect(result.isValid).toBe(true);
      // Should find nested spender
      const spenderField = result.highlightedFields.find((f) => f.name === 'spender');
      expect(spenderField).toBeDefined();
    });
  });

  describe('Warnings', () => {
    it('should warn about infinite approval', () => {
      const data = {
        ...MOCK_TYPED_DATA,
        message: {
          ...MOCK_TYPED_DATA.message,
          value: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
        },
      };

      const result = decodeTypedData(JSON.stringify(data));

      // Should have at least permit warning + infinite approval warning
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('should warn about Permit signatures', () => {
      const result = decodeTypedData(JSON.stringify(MOCK_TYPED_DATA));

      const permitWarning = result.warnings.find(
        (w) =>
          w.description?.toLowerCase().includes('permit') ||
          w.title?.toLowerCase().includes('permit'),
      );
      expect(permitWarning).toBeDefined();
    });

    it('should warn about unknown spender', () => {
      const result = decodeTypedData(JSON.stringify(MOCK_TYPED_DATA));

      const spenderWarning = result.warnings.find(
        (w) =>
          w.description?.toLowerCase().includes('spender') ||
          w.title?.toLowerCase().includes('spender'),
      );
      expect(spenderWarning).toBeDefined();
    });
  });

  describe('getChainName', () => {
    it('should return Ethereum for chainId 1', () => {
      expect(getChainName(1)).toBe('Ethereum');
    });

    it('should return Polygon for chainId 137', () => {
      expect(getChainName(137)).toBe('Polygon');
    });

    it('should return Arbitrum for chainId 42161', () => {
      expect(getChainName(42161)).toBe('Arbitrum');
    });

    it('should return Base for chainId 8453', () => {
      expect(getChainName(8453)).toBe('Base');
    });

    it('should return Optimism for chainId 10', () => {
      expect(getChainName(10)).toBe('Optimism');
    });

    it('should return Unknown for undefined', () => {
      expect(getChainName(undefined)).toBe('Unknown');
    });

    it('should return Chain X for unknown chainId', () => {
      expect(getChainName(999999)).toBe('Chain 999999');
    });
  });

  describe('formatDomain', () => {
    it('should format domain with name, version, and chainId', () => {
      const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: 1,
        verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };

      const formatted = formatDomain(domain);

      expect(formatted).toContain('USD Coin');
      expect(formatted).toContain('v2');
      expect(formatted).toContain('Ethereum');
    });

    it('should format domain with only name', () => {
      const domain = {
        name: 'Test',
        verifyingContract: '0x1234567890123456789012345678901234567890',
      };

      const formatted = formatDomain(domain);

      expect(formatted).toBe('Test');
    });

    it('should return Unknown Domain for empty domain', () => {
      const domain = {
        verifyingContract: '0x1234567890123456789012345678901234567890',
      };

      const formatted = formatDomain(domain as any);

      expect(formatted).toBe('Unknown Domain');
    });
  });
});
