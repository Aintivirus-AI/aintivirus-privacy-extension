import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { WalletState, SendTransactionResult } from '@shared/types';
import { sendToBackground } from '@shared/messaging';
import {
  generateOrderId,
  createGiftCardOrder,
  createESimOrder,
  confirmOrderPayment,
  getAintiTokenPrice,
  convertUsdToAintiTokens,
} from '../utils/storeApi';
import { getTreasuryAddress, getAintiTokenConfig } from '../utils/solanaPayment';
import StoreOrderModal from './StoreOrderModal';

// AINTI Token configuration (loaded from solanaPayment utility)
const AINTI_CONFIG = getAintiTokenConfig();

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
  const [treasuryAddress, setTreasuryAddress] = useState<string | null>(null);
  const [loadingTreasury, setLoadingTreasury] = useState(true);

  // Fetch treasury address from on-chain payment vault
  useEffect(() => {
    const fetchTreasury = async () => {
      setLoadingTreasury(true);
      try {
        const address = await getTreasuryAddress();
        setTreasuryAddress(address);
      } catch (err) {
        console.error('Failed to fetch treasury:', err);
      } finally {
        setLoadingTreasury(false);
      }
    };
    fetchTreasury();
  }, []);

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
    
    if (!treasuryAddress) {
      setError('Treasury address not loaded. Please try again.');
      setStep('error');
      return;
    }

    setStep('processing');
    setError(null);

    try {
      // Generate order ID
      const newOrderId = generateOrderId();
      setOrderId(newOrderId);

      // Create order in backend
      // AINTI is on Solana, so always use 'solana' network
      if (type === 'giftcard') {
        await createGiftCardOrder({
          orderId: newOrderId,
          giftCardTypeId: itemId,
          amount,
          network: 'solana',
        });
      } else {
        await createESimOrder({
          orderId: newOrderId,
          eSimPlanTypeId: itemId,
          network: 'solana',
        });
      }

      // Send actual payment via wallet (AINTI is on Solana)
      const result = await sendToBackground<SendTransactionResult>({
        type: 'WALLET_SEND_SPL_TOKEN',
        payload: {
          recipient: treasuryAddress,
          amount: tokenAmount,
          mint: AINTI_CONFIG.mint,
          decimals: AINTI_CONFIG.decimals,
        },
      });

      if (!result.success || !result.data?.signature) {
        throw new Error(result.error || 'Failed to send AINTI token. Please check your balance.');
      }
      
      const paymentTxHash = result.data.signature;
      setTxHash(paymentTxHash);

      // Confirm payment with backend
      try {
        await confirmOrderPayment(newOrderId, paymentTxHash);
      } catch (confirmErr) {
        // Payment was sent but confirmation failed - still show success
        console.warn('Payment sent but backend confirmation failed:', confirmErr);
      }

      setStep('success');
    } catch (err) {
      console.error('Payment failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      // Make error messages more user-friendly
      if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
        setError('Insufficient AINTI balance. Please ensure you have enough tokens.');
      } else if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        setError('Transaction was rejected. Please try again.');
      } else {
        setError(errorMessage);
      }
      setStep('error');
    }
  }, [walletState, tokenAmount, treasuryAddress, type, itemId, amount]);

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

      {/* Wallet Status - AINTI is on Solana, always show Solana address */}
      {walletState && (
        <div className="payment-wallet-status">
          <span className="payment-wallet-text">
            Wallet: {walletState.publicAddress?.slice(0, 6)}...
            {walletState.publicAddress?.slice(-4)}
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
          <span className="payment-detail-value">Solana (AINTI)</span>
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

      {/* Treasury Status */}
      {loadingTreasury && (
        <div className="payment-warning" style={{ marginBottom: '8px' }}>
          <span className="payment-warning-icon">⏳</span>
          <span className="payment-warning-text">
            Loading treasury address from chain...
          </span>
        </div>
      )}
      
      {!loadingTreasury && !treasuryAddress && (
        <div className="payment-warning" style={{ marginBottom: '8px', color: '#ff6b6b' }}>
          <span className="payment-warning-icon">⚠️</span>
          <span className="payment-warning-text">
            Treasury address not available. Payment program may not be configured.
          </span>
        </div>
      )}

      {/* Pay Button */}
      <button
        className="payment-btn"
        onClick={handlePayment}
        disabled={!walletState || loadingPrice || loadingTreasury || !treasuryAddress || tokenAmount === null}
      >
        {loadingPrice || loadingTreasury
          ? 'Loading...' 
          : `Pay ${tokenAmount?.toFixed(6) || ''} AINTI`
        }
      </button>
    </div>
  );
};

export default StorePayment;
