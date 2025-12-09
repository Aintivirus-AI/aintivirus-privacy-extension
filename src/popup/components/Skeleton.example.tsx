

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


interface DataItem {
  id: string;
  name: string;
  value: number;
}


export const BasicLoadingExample: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DataItem[]>([]);

  useEffect(() => {
    
    const timer = setTimeout(() => {
      setData([
        { id: '1', name: 'Item 1', value: 100 },
        { id: '2', name: 'Item 2', value: 200 },
      ]);
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  
  if (loading) {
    return (
      <div className="token-list">
        <SkeletonTokenItem />
        <SkeletonTokenItem />
        <SkeletonTokenItem />
      </div>
    );
  }

  
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


export const CustomSkeletonExample: React.FC = () => {
  return (
    <div style={{ padding: 16 }}>
      {}
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
        {}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton variant="circle" size={48} />
          <div style={{ flex: 1 }}>
            <Skeleton variant="text" width={120} height={16} />
            <Skeleton variant="text" width={80} height={12} style={{ marginTop: 4 }} />
          </div>
        </div>

        {}
        <SkeletonText lines={2} gap={8} />

        {}
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton variant="rect" width={80} height={32} borderRadius={6} />
          <Skeleton variant="rect" width={80} height={32} borderRadius={6} />
        </div>
      </div>
    </div>
  );
};


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


export default {
  BasicLoadingExample,
  SmoothTransitionExample,
  CustomSkeletonExample,
  WalletViewExample,
  SecurityStatsExample,
  AllowancesListExample,
  InlineSkeletonExample,
};
