import React, { useState } from 'react';

interface StoreOrderModalProps {
  type: 'success' | 'error';
  orderId: string;
  txHash?: string | null;
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
  onUnlockWallet?: () => void;
  isWalletLocked?: boolean;
}

const StoreOrderModal: React.FC<StoreOrderModalProps> = ({
  type,
  orderId,
  txHash,
  error,
  onClose,
  onRetry,
  onUnlockWallet,
  isWalletLocked,
}) => {
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (type === 'error') {
    return (
      <div className="order-modal">
        <div className="order-modal-icon error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isWalletLocked ? (
              // Lock icon for wallet locked state
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </>
            ) : (
              // X icon for other errors
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </>
            )}
          </svg>
        </div>
        <h3 className="order-modal-title">
          {isWalletLocked ? 'Wallet Locked' : 'Payment Failed'}
        </h3>
        <p className="order-modal-message">
          {error || 'Something went wrong. Please try again.'}
        </p>
        {orderId && (
          <div 
            className="order-modal-id" 
            onClick={() => copyToClipboard(orderId)}
            style={{ cursor: 'pointer' }}
            title="Click to copy"
          >
            Order: {orderId.slice(0, 8)}...
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', width: '100%', flexDirection: 'column' }}>
          {isWalletLocked && onUnlockWallet && (
            <button 
              className="order-modal-btn" 
              onClick={onUnlockWallet}
              style={{ width: '100%' }}
            >
              Unlock Wallet
            </button>
          )}
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            {onRetry && !isWalletLocked && (
              <button 
                className="order-modal-btn" 
                onClick={onRetry}
                style={{ flex: 1 }}
              >
                Try Again
              </button>
            )}
            <button 
              className="order-modal-btn" 
              onClick={onClose}
              style={{ 
                flex: 1, 
                background: 'transparent', 
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)'
              }}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation dialog for closing success screen
  if (showConfirmClose) {
    return (
      <div className="order-modal">
        <div className="order-modal-icon" style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 className="order-modal-title">Leave This Screen?</h3>
        <p className="order-modal-message" style={{ marginBottom: '8px' }}>
          You won't be able to return to this screen. Make sure you've saved your order details.
        </p>
        <div 
          className="order-modal-id" 
          onClick={() => copyToClipboard(orderId)}
          style={{ cursor: 'pointer', marginBottom: '16px' }}
          title="Click to copy order ID"
        >
          Order ID: {orderId}
        </div>
        <p className="order-modal-message" style={{ fontSize: '12px', opacity: 0.8 }}>
          You can always track your order at aintivirus.ai/track
        </p>

        <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '8px' }}>
          <button 
            className="order-modal-btn" 
            onClick={() => setShowConfirmClose(false)}
            style={{ 
              flex: 1,
              background: 'transparent', 
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)'
            }}
          >
            Go Back
          </button>
          <button 
            className="order-modal-btn" 
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Yes, I'm Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="order-modal">
      <div className="order-modal-icon success">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20,6 9,17 4,12" />
        </svg>
      </div>
      <h3 className="order-modal-title">Order Placed Successfully!</h3>
      <p className="order-modal-message">
        Your order has been confirmed. You'll receive your purchase details shortly.
      </p>
      
      {/* Order ID */}
      <div 
        className="order-modal-id" 
        onClick={() => copyToClipboard(orderId)}
        style={{ cursor: 'pointer' }}
        title="Click to copy order ID"
      >
        Order ID: {orderId}
      </div>

      {/* Transaction Hash */}
      {txHash && (
        <div 
          className="order-modal-id" 
          onClick={() => copyToClipboard(txHash)}
          style={{ cursor: 'pointer', fontSize: '11px' }}
          title="Click to copy transaction hash"
        >
          Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
        </div>
      )}

      {/* Track Order Button */}
      <button 
        className="order-modal-btn track-order-btn"
        onClick={() => {
          chrome.tabs.create({ url: `https://aintivirus.ai/track/${orderId}` });
        }}
        style={{ marginBottom: '8px' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        Track Your Order
      </button>

      <button 
        className="order-modal-btn" 
        onClick={() => setShowConfirmClose(true)}
        style={{ 
          background: 'transparent', 
          border: '1px solid var(--border-primary)',
          color: 'var(--text-primary)'
        }}
      >
        Done
      </button>
    </div>
  );
};

export default StoreOrderModal;
