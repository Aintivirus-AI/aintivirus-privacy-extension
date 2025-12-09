# Testing EVM Performance Improvements

This guide will help you verify the EVM performance optimizations are working correctly.

## Quick Testing

### 1. Test in Browser Console

After building the extension:

```javascript
// Load the performance test
import { runPerformanceTest } from './src/decoding/performance-test.ts';

// Or if already loaded in window:
window.evmPerfTest.runPerformanceTest();
```

Expected results:
- **Cold decode**: 15-30ms average per transaction
- **Warm decode (cached)**: < 1ms average per transaction  
- **Preloaded selectors**: 5-10ms average per transaction
- **Cache speedup**: 50-100x faster

### 2. Test Transaction Approval UI

1. Install the extension
2. Navigate to a dApp (e.g., Uniswap, OpenSea)
3. Initiate a transaction (e.g., token approval, swap)
4. Observe the approval window:
   - ✅ Window should open instantly
   - ✅ Loading spinner should show briefly
   - ✅ Transaction details should appear within 50-100ms
   - ✅ UI should remain responsive during decode

### 3. Test with Different Transaction Types

Test these common transaction types to verify performance:

#### ERC-20 Token Transfer
```javascript
const transferTx = {
  to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  value: '0x0',
  data: '0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0615b0000000000000000000000000000000000000000000000000000000005f5e100',
  chainId: 1,
};
```

#### ERC-20 Unlimited Approval
```javascript
const approveTx = {
  to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  value: '0x0',
  data: '0x095ea7b30000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488dffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  chainId: 1,
};
```

#### NFT Approval for All
```javascript
const nftApproveTx = {
  to: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
  value: '0x0',
  data: '0xa22cb46500000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba30000000000000000000000000000000000000000000000000000000000000001',
  chainId: 1,
};
```

#### ETH Transfer (Simple)
```javascript
const ethTx = {
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0615b',
  value: '0xde0b6b3a7640000', // 1 ETH
  data: '0x',
  chainId: 1,
};
```

## Performance Benchmarks

### Target Performance Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Approval window open | < 50ms | Time from click to window visible |
| First decode (cold) | < 30ms | First transaction decode without cache |
| Cached decode | < 1ms | Same transaction decoded twice |
| Common ERC-20 ops | < 10ms | With preloaded selectors |
| UI responsiveness | No blocking | UI should remain interactive |

### Measuring Performance

#### Using Performance API

```javascript
// Measure decode time
performance.mark('decode-start');
const decoded = decodeEvmTx(transaction);
performance.mark('decode-end');
performance.measure('decode-duration', 'decode-start', 'decode-end');

const measurement = performance.getEntriesByName('decode-duration')[0];
console.log(`Decode took: ${measurement.duration.toFixed(2)}ms`);
```

#### Using Chrome DevTools

1. Open Chrome DevTools (F12)
2. Go to **Performance** tab
3. Click **Record**
4. Perform transaction approval
5. Stop recording
6. Look for:
   - **Long tasks** (should be < 50ms)
   - **Scripting time** in approval flow
   - **Total blocking time**

#### Expected Results

Before optimizations:
- Long tasks: 100-200ms
- UI blocked: Yes
- Multiple re-decodes: Common

After optimizations:
- Long tasks: < 50ms
- UI blocked: No
- Caching: Effective (< 1ms on repeat)

## Common Issues & Solutions

### Issue 1: Still Slow on First Load

**Symptoms**: First transaction approval takes > 100ms

**Solutions**:
1. Verify `preloadCommonSelectors()` is called on initialization
2. Check browser console for errors
3. Try clearing browser cache and reinstalling extension

```javascript
// Check if preloading worked
import { lookupSelector } from '@/decoding';

// Should be instant (< 0.1ms)
console.time('selector-lookup');
lookupSelector('0xa9059cbb');
console.timeEnd('selector-lookup');
```

### Issue 2: Cache Not Working

**Symptoms**: Repeated decodes still slow

**Solutions**:
1. Check if cache is being cleared unexpectedly
2. Verify cache key generation is consistent

```javascript
// Test cache
import { decodeEvmTx } from '@/decoding';

const tx = { /* ... */ };

console.time('first-decode');
decodeEvmTx(tx);
console.timeEnd('first-decode'); // Should be 10-30ms

console.time('second-decode');
decodeEvmTx(tx);
console.timeEnd('second-decode'); // Should be < 1ms
```

### Issue 3: Memory Issues

**Symptoms**: Browser becomes slow over time

**Solutions**:
1. Check cache sizes are within limits
2. Clear caches periodically

```javascript
import { clearDecodingCache, clearSelectorCaches } from '@/decoding';

// Clear all caches
clearDecodingCache();
clearSelectorCaches();
```

## Regression Testing

Run these tests to ensure optimizations don't break functionality:

### Test 1: Decode Accuracy

Verify decoded output is identical before/after optimizations:

```javascript
// Test that caching doesn't change results
const tx = { /* sample transaction */ };

const result1 = decodeEvmTx(tx);
const result2 = decodeEvmTx(tx); // From cache

// Should be deep equal
JSON.stringify(result1) === JSON.stringify(result2); // true
```

### Test 2: Warning Detection

Ensure warnings are still detected:

```javascript
// Test infinite approval warning
const infiniteApproval = {
  to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  data: '0x095ea7b3...ffffffff', // max uint256
  chainId: 1,
};

const decoded = decodeEvmTx(infiniteApproval);
console.assert(decoded.warnings.length > 0, 'Should have warnings');
console.assert(
  decoded.warnings.some(w => w.code === 'INFINITE_APPROVAL'),
  'Should detect infinite approval'
);
```

### Test 3: Unknown Selectors

Verify unknown selectors are handled gracefully:

```javascript
const unknownTx = {
  to: '0x1234567890123456789012345678901234567890',
  data: '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001',
  chainId: 1,
};

const decoded = decodeEvmTx(unknownTx);
console.assert(decoded.kind === 'contract_call', 'Should be contract call');
console.assert(!decoded.decodedCall, 'Should not have decoded call');
```

## Automated Testing

Add these tests to your test suite:

```typescript
// tests/decoding-performance.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { decodeEvmTx, clearDecodingCache } from '@/decoding';

describe('EVM Decoding Performance', () => {
  beforeEach(() => {
    clearDecodingCache();
  });

  it('should decode ERC-20 transfer under 30ms', () => {
    const tx = { /* ERC-20 transfer */ };
    
    const start = performance.now();
    decodeEvmTx(tx);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(30);
  });

  it('should cache decoded transactions', () => {
    const tx = { /* sample tx */ };
    
    // First decode
    const start1 = performance.now();
    const result1 = decodeEvmTx(tx);
    const duration1 = performance.now() - start1;
    
    // Second decode (from cache)
    const start2 = performance.now();
    const result2 = decodeEvmTx(tx);
    const duration2 = performance.now() - start2;
    
    expect(duration2).toBeLessThan(duration1 / 10); // 10x faster
    expect(result2).toEqual(result1); // Same result
  });
});
```

## Monitoring in Production

Add performance monitoring:

```typescript
// Monitor decode performance
function monitorDecodePerformance(tx: EvmTxInput): DecodedEvmTx {
  const start = performance.now();
  const result = decodeEvmTx(tx);
  const duration = performance.now() - start;
  
  // Log slow decodes
  if (duration > 50) {
    console.warn('[Performance] Slow decode:', {
      duration,
      txTo: tx.to,
      dataSize: tx.data?.length || 0,
    });
  }
  
  // Track metrics (optional)
  if (typeof analytics !== 'undefined') {
    analytics.track('decode_performance', {
      duration,
      cached: duration < 1,
    });
  }
  
  return result;
}
```

## Success Criteria

✅ Performance improvements verified if:

1. **Approval window opens instantly** (< 50ms)
2. **First decode completes quickly** (< 30ms)
3. **Cached decodes are near-instant** (< 1ms)
4. **UI remains responsive** (no blocking)
5. **No functional regressions** (all tests pass)
6. **Memory usage acceptable** (< 150KB overhead)

---

**Questions or Issues?**

If you encounter any problems or have questions about the performance optimizations, please check:
1. Browser console for errors
2. Chrome DevTools Performance tab
3. docs/EVM_PERFORMANCE_OPTIMIZATIONS.md for implementation details

