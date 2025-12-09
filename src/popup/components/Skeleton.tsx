

import React from 'react';


export interface SkeletonProps {
  
  variant?: 'text' | 'circle' | 'rect';
  
  width?: number | string;
  
  height?: number | string;
  
  size?: number;
  
  borderRadius?: number | string;
  
  animation?: boolean;
  
  className?: string;
  
  style?: React.CSSProperties;
  
  'aria-label'?: string;
}

export interface SkeletonTextProps {
  
  lines?: number;
  
  lastLineWidth?: number | string;
  
  gap?: number;
  
  lineHeight?: number;
  
  animation?: boolean;
  
  className?: string;
}

export interface SkeletonGroupProps {
  
  loading: boolean;
  
  skeleton: React.ReactNode;
  
  children: React.ReactNode;
  
  fadeDuration?: number;
  
  className?: string;
}


export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  size,
  borderRadius,
  animation = true,
  className = '',
  style,
  'aria-label': ariaLabel,
}) => {
  
  let computedWidth: number | string | undefined = width;
  let computedHeight: number | string | undefined = height;
  let computedRadius: number | string | undefined = borderRadius;

  switch (variant) {
    case 'circle':
      computedWidth = size ?? width ?? 40;
      computedHeight = size ?? height ?? 40;
      computedRadius = '50%';
      break;
    case 'text':
      computedWidth = width ?? '100%';
      computedHeight = height ?? 14;
      computedRadius = borderRadius ?? 4;
      break;
    case 'rect':
      computedWidth = width ?? '100%';
      computedHeight = height ?? 40;
      computedRadius = borderRadius ?? 8;
      break;
  }

  const inlineStyle: React.CSSProperties = {
    width: typeof computedWidth === 'number' ? `${computedWidth}px` : computedWidth,
    height: typeof computedHeight === 'number' ? `${computedHeight}px` : computedHeight,
    borderRadius: typeof computedRadius === 'number' ? `${computedRadius}px` : computedRadius,
    ...style,
  };

  return (
    <span
      className={`skeleton ${animation ? 'skeleton-shimmer' : ''} ${className}`.trim()}
      style={inlineStyle}
      role="presentation"
      aria-label={ariaLabel}
      aria-busy="true"
    />
  );
};


export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lastLineWidth = '70%',
  gap = 8,
  lineHeight = 14,
  animation = true,
  className = '',
}) => {
  return (
    <div className={`skeleton-text ${className}`.trim()} style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          width={index === lines - 1 ? lastLineWidth : '100%'}
          height={lineHeight}
          animation={animation}
        />
      ))}
    </div>
  );
};


export const SkeletonGroup: React.FC<SkeletonGroupProps> = ({
  loading,
  skeleton,
  children,
  fadeDuration = 200,
  className = '',
}) => {
  return (
    <div
      className={`skeleton-group ${loading ? 'skeleton-loading' : 'skeleton-loaded'} ${className}`.trim()}
      style={{
        '--skeleton-fade-duration': `${fadeDuration}ms`,
      } as React.CSSProperties}
    >
      {loading ? skeleton : children}
    </div>
  );
};


export const SkeletonWalletBalance: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-wallet-balance ${className}`.trim()}>
    {}
    <Skeleton variant="rect" width={180} height={38} borderRadius={8} />
    {}
    <Skeleton variant="text" width={40} height={14} style={{ marginTop: 4 }} />
    {}
    <Skeleton variant="text" width={80} height={16} style={{ marginTop: 8 }} />
  </div>
);


export const SkeletonTokenItem: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-token-item ${className}`.trim()}>
    <Skeleton variant="circle" size={32} />
    <div className="skeleton-token-info">
      <Skeleton variant="text" width={60} height={13} />
      <Skeleton variant="text" width={100} height={11} />
    </div>
    <div className="skeleton-token-balance">
      <Skeleton variant="text" width={70} height={13} />
      <Skeleton variant="text" width={50} height={11} />
    </div>
  </div>
);


export const SkeletonTxItem: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-tx-item ${className}`.trim()}>
    <Skeleton variant="circle" size={32} />
    <div className="skeleton-tx-details">
      <Skeleton variant="text" width={80} height={13} />
      <Skeleton variant="text" width={60} height={11} />
    </div>
    <div className="skeleton-tx-amount">
      <Skeleton variant="text" width={65} height={13} />
      <Skeleton variant="text" width={45} height={11} />
    </div>
  </div>
);


export const SkeletonStatCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-stat-card ${className}`.trim()}>
    <Skeleton variant="text" width={50} height={28} borderRadius={6} />
    <Skeleton variant="text" width={60} height={10} style={{ marginTop: 6 }} />
  </div>
);


export const SkeletonFeatureItem: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-feature-item ${className}`.trim()}>
    <Skeleton variant="rect" width={32} height={32} borderRadius={8} />
    <div className="skeleton-feature-text">
      <Skeleton variant="text" width={100} height={13} />
      <Skeleton variant="text" width={150} height={11} />
    </div>
    <Skeleton variant="rect" width={40} height={22} borderRadius={11} />
  </div>
);


export const SkeletonConnectedSite: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-connected-site ${className}`.trim()}>
    <Skeleton variant="circle" size={24} />
    <Skeleton variant="text" width={120} height={12} />
    <Skeleton variant="rect" width={60} height={24} borderRadius={4} />
  </div>
);


export const SkeletonAllowanceCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-allowance-card ${className}`.trim()}>
    <div className="skeleton-allowance-header">
      <Skeleton variant="circle" size={32} />
      <div className="skeleton-allowance-token">
        <Skeleton variant="text" width={60} height={14} />
        <Skeleton variant="text" width={100} height={11} />
      </div>
    </div>
    <div className="skeleton-allowance-details">
      <div className="skeleton-spender-info">
        <Skeleton variant="text" width={100} height={12} />
        <Skeleton variant="text" width={80} height={10} />
      </div>
      <div className="skeleton-allowance-amount">
        <Skeleton variant="text" width={60} height={12} />
        <Skeleton variant="text" width={50} height={10} />
      </div>
    </div>
    <Skeleton variant="rect" width="100%" height={32} borderRadius={6} />
  </div>
);


export const SkeletonPendingTx: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-pending-tx ${className}`.trim()}>
    <div className="skeleton-tx-main">
      <div className="skeleton-tx-hash-row">
        <Skeleton variant="text" width={100} height={13} />
        <Skeleton variant="rect" width={30} height={16} borderRadius={3} />
        <Skeleton variant="circle" size={16} />
      </div>
      <div className="skeleton-tx-info">
        <Skeleton variant="text" width={70} height={12} />
        <Skeleton variant="text" width={60} height={12} />
      </div>
      <div className="skeleton-tx-meta">
        <Skeleton variant="text" width={50} height={11} />
        <Skeleton variant="text" width={60} height={11} />
      </div>
    </div>
    <Skeleton variant="circle" size={14} />
  </div>
);


export const SkeletonAddress: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-address ${className}`.trim()}>
    <Skeleton variant="text" width={120} height={12} />
    <Skeleton variant="circle" size={14} />
  </div>
);


export const SkeletonWalletView: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-wallet-view ${className}`.trim()}>
    {}
    <div className="skeleton-balance-card">
      <SkeletonWalletBalance />
      <SkeletonAddress />
    </div>

    {}
    <div className="skeleton-wallet-actions">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-action-btn">
          <Skeleton variant="circle" size={20} />
          <Skeleton variant="text" width={40} height={12} />
        </div>
      ))}
    </div>

    {}
    <div className="skeleton-token-list">
      {[1, 2, 3].map((i) => (
        <SkeletonTokenItem key={i} />
      ))}
    </div>
  </div>
);


export const SkeletonSecurityStats: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-security-stats ${className}`.trim()}>
    <div className="skeleton-stats-grid">
      {[1, 2, 3].map((i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
    <div className="skeleton-stats-footer">
      <Skeleton variant="circle" size={6} />
      <Skeleton variant="text" width={120} height={11} />
    </div>
  </div>
);


export default Skeleton;
