/**
 * AINTIVIRUS - Skeleton Loading Integration Examples
 *
 * This file demonstrates how to integrate skeleton loading states
 * into various components. These patterns can be copied and adapted.
 *
 * @usage Import and use in your components:
 *
 * import { Skeleton, SkeletonGroup, SkeletonTokenItem } from './components';
 */

import React, { useState, useEffect } from 'react';
import {
  Skeleton,
  SkeletonText,
  SkeletonGroup,
  SkeletonWalletBalance,
  SkeletonTokenItem,
  SkeletonTxItem,
  SkeletonStatCard,
  SkeletonSecurityStats,
  SkeletonWalletView,
  SkeletonAllowanceCard,
} from './Skeleton';

// ============================================
// EXAMPLE 1: Basic Loading State Pattern
// ============================================

interface DataItem {
  id: string;
  name: string;
  value: number;
}

/**
 * Example: Replace spinner with skeleton
 *
 * Before (with spinner):
 * ```
 * if (loading) {
 *   return <div className="spinner" />;
 * }
 * return <YourContent />;
 * ```
 *
 * After (with skeleton):
 * ```
 * if (loading) {
 *   return <SkeletonForYourContent />;
 * }
 * return <YourContent />;
 * ```
 */
export const BasicLoadingExample: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DataItem[]>([]);

  useEffect(() => {
    // Simulate API fetch
    const timer = setTimeout(() => {
      setData([
        { id: '1', name: 'Item 1', value: 100 },
        { id: '2', name: 'Item 2', value: 200 },
      ]);
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Pattern: Return skeleton when loading
  if (loading) {
    return (
      <div className="token-list">
        <SkeletonTokenItem />
        <SkeletonTokenItem />
        <SkeletonTokenItem />
      </div>
    );
  }

  // Actual content when loaded
  return (
    <div className="token-list">
      {data.map((item) => (
        <div key={item.id} className="token-item">
          <span>{item.name}</span>
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================
// EXAMPLE 2: SkeletonGroup with Fade Transition
// ============================================

/**
 * Example: Smooth transition from skeleton to content
 *
 * SkeletonGroup provides automatic fade-in animation when
 * transitioning from loading to loaded state.
 */
export const SmoothTransitionExample: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBalance(1234.56);
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SkeletonGroup
      loading={loading}
      fadeDuration={300}
      skeleton={<SkeletonWalletBalance />}
    >
      <div className="balance-card">
        <span className="balance-value">{balance?.toFixed(2)}</span>
        <span className="balance-symbol">SOL</span>
      </div>
    </SkeletonGroup>
  );
};

// ============================================
// EXAMPLE 3: Custom Skeleton Composition
// ============================================

/**
 * Example: Build custom skeleton layouts
 *
 * Use base Skeleton components to match your exact layout.
 */
export const CustomSkeletonExample: React.FC = () => {
  return (
    <div style={{ padding: 16 }}>
      {/* Custom card skeleton */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          background: 'var(--bg-secondary)',
          borderRadius: 12,
        }}
      >
        {/* Header with avatar and title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton variant="circle" size={48} />
          <div style={{ flex: 1 }}>
            <Skeleton variant="text" width={120} height={16} />
            <Skeleton variant="text" width={80} height={12} style={{ marginTop: 4 }} />
          </div>
        </div>

        {/* Content area */}
        <SkeletonText lines={2} gap={8} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton variant="rect" width={80} height={32} borderRadius={6} />
          <Skeleton variant="rect" width={80} height={32} borderRadius={6} />
        </div>
      </div>
    </div>
  );
};

// ============================================
// EXAMPLE 4: Wallet View Integration
// ============================================

/**
 * Example: Full wallet view with skeleton loading
 *
 * This pattern is useful for initial page load.
 */
interface WalletData {
  balance: number;
  address: string;
  tokens: Array<{ symbol: string; balance: number }>;
}

export const WalletViewExample: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWallet({
        balance: 10.5,
        address: '7nxQB7...9aH2',
        tokens: [
          { symbol: 'USDC', balance: 100 },
          { symbol: 'RAY', balance: 50.5 },
        ],
      });
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <SkeletonWalletView />;
  }

  return (
    <div className="wallet-container">
      <div className="balance-card">
        <span className="balance-value">{wallet?.balance} SOL</span>
        <span className="address-text">{wallet?.address}</span>
      </div>
      <div className="token-list">
        {wallet?.tokens.map((token) => (
          <div key={token.symbol} className="token-item">
            <span>{token.symbol}</span>
            <span>{token.balance}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// EXAMPLE 5: Security Stats with Skeleton
// ============================================

/**
 * Example: Stats grid skeleton
 */
interface Stats {
  blocked: number;
  cookies: number;
  rules: number;
}

export const SecurityStatsExample: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStats({ blocked: 1234, cookies: 567, rules: 890 });
      setLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <SkeletonSecurityStats />;
  }

  return (
    <section className="section">
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats?.blocked}</span>
          <span className="stat-label">Blocked</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats?.cookies}</span>
          <span className="stat-label">Cookies</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats?.rules}</span>
          <span className="stat-label">Rules</span>
        </div>
      </div>
    </section>
  );
};

// ============================================
// EXAMPLE 6: Allowances List with Skeleton
// ============================================

/**
 * Example: Replace loading spinner in AllowancesView
 *
 * Integration point in AllowancesView.tsx around line 700-710:
 *
 * Before:
 * ```
 * {loading ? (
 *   <div style={styles.loadingState}>
 *     <div style={styles.spinner} />
 *     <span>Scanning allowances...</span>
 *   </div>
 * ```
 *
 * After:
 * ```
 * {loading ? (
 *   <div style={{ padding: 12 }}>
 *     <SkeletonAllowanceCard />
 *     <div style={{ height: 8 }} />
 *     <SkeletonAllowanceCard />
 *     <div style={{ height: 8 }} />
 *     <SkeletonAllowanceCard />
 *   </div>
 * ```
 */
export const AllowancesListExample: React.FC = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
        <SkeletonAllowanceCard />
        <SkeletonAllowanceCard />
        <SkeletonAllowanceCard />
      </div>
    );
  }

  return <div>Allowances content loaded!</div>;
};

// ============================================
// EXAMPLE 7: Inline Skeleton for Single Values
// ============================================

/**
 * Example: Inline skeleton for text values
 *
 * Use when loading individual values within existing content.
 */
export const InlineSkeletonExample: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPrice(142.50);
      setLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="token-item">
      <span>SOL Price:</span>
      {loading ? (
        <Skeleton variant="text" width={60} height={14} />
      ) : (
        <span className="mono">${price?.toFixed(2)}</span>
      )}
    </div>
  );
};

// ============================================
// INTEGRATION CHECKLIST
// ============================================

/**
 * ## How to Integrate Skeleton Loading
 *
 * 1. **Identify Loading States**
 *    - Find components that show spinners or "Loading..." text
 *    - Look for `loading` state variables
 *
 * 2. **Choose Skeleton Type**
 *    - Use preset components for common patterns (SkeletonTokenItem, etc.)
 *    - Build custom with base Skeleton for unique layouts
 *
 * 3. **Match Dimensions**
 *    - Skeleton dimensions should match loaded content
 *    - This prevents layout shift
 *
 * 4. **Replace Spinner**
 *    - Replace: `<div className="spinner" />` or loading text
 *    - With: Appropriate skeleton component(s)
 *
 * 5. **Test**
 *    - Verify no layout shift on load
 *    - Check reduced-motion preference support
 *    - Verify transition looks smooth
 *
 * ## Key Integration Points in AINTIVIRUS:
 *
 * - `AllowancesView.tsx` line ~700: Replace spinner with SkeletonAllowanceCard
 * - `PendingTxList.tsx` line ~109: Replace spinner with SkeletonPendingTx
 * - `App.tsx` wallet loading: Replace with SkeletonWalletView
 * - Token list loading: Replace with multiple SkeletonTokenItem
 * - Stats loading: Replace with SkeletonSecurityStats
 */

export default {
  BasicLoadingExample,
  SmoothTransitionExample,
  CustomSkeletonExample,
  WalletViewExample,
  SecurityStatsExample,
  AllowancesListExample,
  InlineSkeletonExample,
};
