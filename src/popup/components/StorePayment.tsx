import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { WalletState } from '@shared/types';
import {
  generateOrderId,
  createGiftCardOrder,
  createESimOrder,
  confirmOrderPayment,
  getAintiTokenPrice,
  convertUsdToAintiTokens,
} from '../utils/storeApi';
import StoreOrderModal from './StoreOrderModal';

interface StorePaymentProps {
  type: 'giftcard' | 'esim';
  itemId: string;
  itemName: string;
  amount: number; // USD amount
  currency: 'eth' | 'sol';
  walletState: WalletState | null;
  onUnlockWallet?: () => void;
  onBack: () => void;
  onSuccess: () => void;
}

type PaymentStep = 'confirm' | 'processing' | 'success' | 'error';

const StorePayment: React.FC<StorePaymentProps> = ({
  type,
  itemId,
  itemName,
  amount,
  currency,
  walletState,
  onUnlockWallet,
  onBack,
  onSuccess,
}) => {
  const [step, setStep] = useState<PaymentStep>('confirm');
  const [orderId, setOrderId] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);

  // Fetch token price
  useEffect(() => {
    const fetchPrice = async () => {
      setLoadingPrice(true);
      const result = await getAintiTokenPrice(currency);
      setTokenPrice(result.price);
      setLoadingPrice(false);
    };
    fetchPrice();
  }, [currency]);

  // Calculate token amount
  const tokenAmount = useMemo(() => {
    if (!tokenPrice) return null;
    return convertUsdToAintiTokens(amount, tokenPrice);
  }, [amount, tokenPrice]);

  const handlePayment = useCallback(async () => {
    if (!walletState || tokenAmount === null) return;

    setStep('processing');
    setError(null);

    try {
      // Generate order ID
      const newOrderId = generateOrderId();
      setOrderId(newOrderId);

      // Create order in backend
      if (type === 'giftcard') {
        await createGiftCardOrder({
          orderId: newOrderId,
          giftCardTypeId: itemId,
          amount,
          network: currency === 'eth' ? 'evm' : 'solana',
        });
      } else {
        await createESimOrder({
          orderId: newOrderId,
          eSimPlanTypeId: itemId,
          network: currency === 'eth' ? 'evm' : 'solana',
        });
      }

      // In production, this would:
      // 1. Check/request token approval
      // 2. Call the payment contract
      // For now, we simulate the payment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Generate mock transaction hash
      const mockTxHash = '0x' + Array.from({ length: 64 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      setTxHash(mockTxHash);

      // Confirm payment with backend
      await confirmOrderPayment(newOrderId, mockTxHash);

      setStep('success');
    } catch (err) {
      console.error('Payment failed:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
      setStep('error');
    }
  }, [walletState, tokenAmount, type, itemId, amount, currency]);

  // Success modal
  if (step === 'success') {
    return (
      <StoreOrderModal
        type="success"
        orderId={orderId}
        txHash={txHash}
        onClose={onSuccess}
      />
    );
  }

  // Error modal
  if (step === 'error') {
    return (
      <StoreOrderModal
        type="error"
        orderId={orderId}
        error={error || 'Payment failed'}
        onClose={() => setStep('confirm')}
        onRetry={handlePayment}
      />
    );
  }

  // Processing view
  if (step === 'processing') {
    return (
      <div className="payment-modal">
        <div className="payment-processing">
          <div className="payment-processing-spinner" />
          <p className="payment-processing-text">
            Processing payment...
          </p>
          <p className="payment-processing-text" style={{ fontSize: '12px', marginTop: '8px' }}>
            Please wait while we confirm your transaction
          </p>
        </div>
      </div>
    );
  }

  // Confirm view
  return (
    <div className="payment-modal">
      <div className="payment-header">
        <button className="payment-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="payment-title">Confirm Payment</h3>
      </div>

      {/* Wallet Status */}
      {walletState && (
        <div className="payment-wallet-status">
          <span className="payment-wallet-text">
            Wallet: {(walletState.activeChain === 'solana' ? walletState.publicAddress : walletState.evmAddress)?.slice(0, 6)}...
            {(walletState.activeChain === 'solana' ? walletState.publicAddress : walletState.evmAddress)?.slice(-4)}
          </span>
        </div>
      )}

      {/* Payment Details */}
      <div className="payment-details">
        <div className="payment-detail-row">
          <span className="payment-detail-label">Item</span>
          <span className="payment-detail-value">{itemName}</span>
        </div>
        <div className="payment-detail-row">
          <span className="payment-detail-label">Type</span>
          <span className="payment-detail-value">
            {type === 'giftcard' ? 'Gift Card' : 'eSIM'}
          </span>
        </div>
        <div className="payment-detail-row">
          <span className="payment-detail-label">Network</span>
          <span className="payment-detail-value">
            {currency === 'eth' ? 'Ethereum' : 'Solana'}
          </span>
        </div>
      </div>

      {/* Price Box */}
      <div className="payment-info-box">
        <div className="payment-amount-row">
          <span className="payment-detail-label">Total Cost</span>
          <div style={{ textAlign: 'right' }}>
            {loadingPrice ? (
              <span className="payment-amount-value">Loading...</span>
            ) : tokenAmount !== null ? (
              <>
                <span className="payment-amount-value">
                  {tokenAmount.toFixed(6)} AINTI
                </span>
                <div className="payment-amount-usd">
                  ${amount.toFixed(2)} USD @ ${tokenPrice?.toFixed(6)} per AINTI
                </div>
              </>
            ) : (
              <span className="payment-amount-value">${amount.toFixed(2)} USD</span>
            )}
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="payment-warning">
        <span className="payment-warning-icon">⚠️</span>
        <span className="payment-warning-text">
          Please confirm the transaction in your wallet when prompted
        </span>
      </div>

      {/* Wallet Lock Warning */}
      {!walletState && (
        <div className="store-wallet-locked">
          <div className="store-wallet-warning">
            <span>🔒</span>
            <span>Wallet is locked. Unlock to continue.</span>
          </div>
          {onUnlockWallet && (
            <button className="store-unlock-btn" onClick={onUnlockWallet}>
              Unlock Wallet
            </button>
          )}
        </div>
      )}

      {/* Pay Button */}
      <button
        className="payment-btn"
        onClick={handlePayment}
        disabled={!walletState || loadingPrice || tokenAmount === null}
      >
        {loadingPrice 
          ? 'Loading price...' 
          : `Pay ${tokenAmount?.toFixed(6) || ''} AINTI`
        }
      </button>
    </div>
  );
};

export default StorePayment;
