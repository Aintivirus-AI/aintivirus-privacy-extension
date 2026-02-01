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

// Rate lock duration in seconds (10 minutes)
const RATE_LOCK_DURATION = 10 * 60;

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
  onBuyAinti?: () => void; // Navigate to swap to buy AINTI
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
  onBuyAinti,
}) => {
  const [step, setStep] = useState<PaymentStep>('confirm');
  const [orderId, setOrderId] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWalletLockedError, setIsWalletLockedError] = useState(false);
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [treasuryAddress, setTreasuryAddress] = useState<string | null>(null);
  const [loadingTreasury, setLoadingTreasury] = useState(true);
  const [aintiBalance, setAintiBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [rateExpiresAt, setRateExpiresAt] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(RATE_LOCK_DURATION);
  const [rateExpired, setRateExpired] = useState(false);

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

  // Fetch AINTI token balance
  useEffect(() => {
    const fetchAintiBalance = async () => {
      if (!walletState) {
        setAintiBalance(null);
        setLoadingBalance(false);
        return;
      }
      
      setLoadingBalance(true);
      try {
        const result = await sendToBackground<{ mint: string; balance: number; uiBalance: number }[]>({
          type: 'WALLET_GET_TOKENS',
          payload: { forceRefresh: false },
        });
        
        if (result.success && result.data) {
          const aintiToken = result.data.find(
            (token: { mint: string }) => token.mint === AINTI_CONFIG.mint
          );
          setAintiBalance(aintiToken?.uiBalance ?? 0);
        } else {
          setAintiBalance(0);
        }
      } catch (err) {
        console.error('Failed to fetch AINTI balance:', err);
        setAintiBalance(0);
      } finally {
        setLoadingBalance(false);
      }
    };
    fetchAintiBalance();
  }, [walletState]);

  // Fetch token price and set rate lock timer
  const fetchPrice = useCallback(async () => {
    setLoadingPrice(true);
    setRateExpired(false);
    const result = await getAintiTokenPrice(currency);
    setTokenPrice(result.price);
    // Set rate expiry time
    const expiresAt = Date.now() + RATE_LOCK_DURATION * 1000;
    setRateExpiresAt(expiresAt);
    setTimeRemaining(RATE_LOCK_DURATION);
    setLoadingPrice(false);
  }, [currency]);

  // Initial price fetch
  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  // Countdown timer for rate lock
  useEffect(() => {
    if (!rateExpiresAt || loadingPrice || step !== 'confirm') return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((rateExpiresAt - now) / 1000));
      setTimeRemaining(remaining);
      
      if (remaining === 0) {
        setRateExpired(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rateExpiresAt, loadingPrice, step]);

  // Calculate token amount
  const tokenAmount = useMemo(() => {
    if (!tokenPrice) return null;
    return convertUsdToAintiTokens(amount, tokenPrice);
  }, [amount, tokenPrice]);

  // Check if user has sufficient AINTI balance
  const hasInsufficientBalance = useMemo(() => {
    if (tokenAmount === null || aintiBalance === null) return false;
    return aintiBalance < tokenAmount;
  }, [tokenAmount, aintiBalance]);

  // Format time remaining as mm:ss
  const formattedTimeRemaining = useMemo(() => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timeRemaining]);

  // Check if time is running low (less than 2 minutes)
  const isTimeLow = timeRemaining > 0 && timeRemaining < 120;

  const handlePayment = useCallback(async () => {
    if (!walletState || tokenAmount === null) return;
    
    // Check if rate has expired
    if (rateExpired) {
      setError('Rate has expired. Please refresh to get a new quote.');
      setStep('error');
      return;
    }
    
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

      // Process payment through the AINTI Payment Program
      // This creates an on-chain PaymentRecord that the backend uses to verify payments
      const result = await sendToBackground<SendTransactionResult>({
        type: 'WALLET_PROCESS_STORE_PAYMENT',
        payload: {
          orderId: newOrderId,
          amount: tokenAmount,
        },
      });

      if (!result.success || !result.data?.signature) {
        throw new Error(result.error || 'Failed to send AINTI token. Please check your balance.');
      }
      
      const paymentTxHash = result.data.signature;
      setTxHash(paymentTxHash);

      // Confirm payment with backend (non-blocking - payment already sent on-chain)
      // The backend will verify the payment from the blockchain even if this call fails
      await confirmOrderPayment(newOrderId, paymentTxHash);

      setStep('success');
    } catch (err) {
      console.error('Payment failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      // Make error messages more user-friendly
      setIsWalletLockedError(false); // Reset locked state
      
      if (errorMessage.toLowerCase().includes('locked') || errorMessage.toLowerCase().includes('unlock')) {
        setError('Wallet is locked. Please unlock your wallet to complete the payment.');
        setIsWalletLockedError(true);
      } else if (errorMessage.includes('Insufficient token balance') || errorMessage.includes('Custom":1')) {
        setError(`Insufficient AINTI balance. You need at least ${tokenAmount?.toFixed(6)} AINTI to complete this purchase.`);
      } else if (errorMessage.includes('InsufficientFundsForRent') || errorMessage.includes('account rent')) {
        setError('Insufficient SOL for account rent. You need approximately 0.002 SOL to create the payment record. Please add SOL to your wallet.');
      } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
        setError('Insufficient AINTI balance. Please ensure you have enough tokens.');
      } else if (errorMessage.includes('Insufficient funds for fee') || errorMessage.includes('Insufficient SOL')) {
        setError('Insufficient SOL for transaction fees. Please add SOL to your wallet.');
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

  // Handle unlock wallet from error screen
  const handleUnlockFromError = () => {
    if (onUnlockWallet) {
      onUnlockWallet();
      // Return to confirm step so user can retry after unlocking
      setStep('confirm');
      setError(null);
      setIsWalletLockedError(false);
    }
  };

  // Error modal
  if (step === 'error') {
    return (
      <StoreOrderModal
        type="error"
        orderId={orderId}
        error={error || 'Payment failed'}
        onClose={() => setStep('confirm')}
        onRetry={handlePayment}
        onUnlockWallet={handleUnlockFromError}
        isWalletLocked={isWalletLockedError}
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
          <span className="payment-detail-label">Payment Token</span>
          <span className="payment-detail-value">AINTI (Solana SPL Token)</span>
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

      {/* Rate Lock Timer */}
      {!loadingPrice && tokenAmount !== null && (
        <div className={`payment-rate-timer ${rateExpired ? 'expired' : ''} ${isTimeLow ? 'low' : ''}`}>
          <div className="payment-rate-timer-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="payment-rate-timer-text">
              {rateExpired ? (
                <>
                  <strong>Rate Expired</strong>
                  <span>Please refresh to get a new quote</span>
                </>
              ) : (
                <>
                  <strong>Rate locked for {formattedTimeRemaining}</strong>
                  <span>Complete payment before the rate expires</span>
                </>
              )}
            </div>
          </div>
          {rateExpired && (
            <button className="payment-refresh-rate-btn" onClick={fetchPrice} type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh Rate
            </button>
          )}
        </div>
      )}

      {/* AINTI Balance Info */}
      {walletState && !loadingBalance && (
        <div className="payment-balance-info">
          <span className="payment-balance-label">Your AINTI Balance:</span>
          <span className={`payment-balance-value ${hasInsufficientBalance ? 'insufficient' : ''}`}>
            {aintiBalance?.toFixed(6) ?? '0'} AINTI
          </span>
        </div>
      )}

      {/* Insufficient Balance Warning */}
      {hasInsufficientBalance && !loadingBalance && (
        <div className="payment-insufficient-warning">
          <div className="payment-insufficient-content">
            <span className="payment-insufficient-icon">⚠️</span>
            <div className="payment-insufficient-text">
              <strong>Insufficient AINTI Balance</strong>
              <span>
                You need {tokenAmount?.toFixed(6)} AINTI but only have {aintiBalance?.toFixed(6)} AINTI.
              </span>
            </div>
          </div>
          {onBuyAinti && (
            <button className="payment-buy-ainti-btn" onClick={onBuyAinti} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Buy AINTI
            </button>
          )}
        </div>
      )}

      {/* Warning */}
      {!hasInsufficientBalance && (
        <div className="payment-warning">
          <span className="payment-warning-icon">⚠️</span>
          <span className="payment-warning-text">
            Please confirm the transaction in your wallet when prompted
          </span>
        </div>
      )}

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
        disabled={!walletState || loadingPrice || loadingTreasury || loadingBalance || !treasuryAddress || tokenAmount === null || hasInsufficientBalance || rateExpired}
      >
        {loadingPrice || loadingTreasury || loadingBalance
          ? 'Loading...' 
          : rateExpired
          ? 'Rate Expired - Refresh Above'
          : hasInsufficientBalance
          ? 'Insufficient AINTI'
          : `Pay ${tokenAmount?.toFixed(6) || ''} AINTI`
        }
      </button>
    </div>
  );
};

export default StorePayment;
