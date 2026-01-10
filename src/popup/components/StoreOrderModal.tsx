import React from 'react';

interface StoreOrderModalProps {
  type: 'success' | 'error';
  orderId: string;
  txHash?: string | null;
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}

const StoreOrderModal: React.FC<StoreOrderModalProps> = ({
  type,
  orderId,
  txHash,
  error,
  onClose,
  onRetry,
}) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (type === 'error') {
    return (
      <div className="order-modal">
        <div className="order-modal-icon error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h3 className="order-modal-title">Payment Failed</h3>
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
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          {onRetry && (
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

      <button className="order-modal-btn" onClick={onClose}>
        Done
      </button>
    </div>
  );
};

export default StoreOrderModal;
