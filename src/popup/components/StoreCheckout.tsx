import React, { useState, useEffect, useCallback } from 'react';
import { ChevronIcon, CheckIcon, AlertIcon, CopyIcon, ExternalLinkIcon, RefreshIcon } from '../Icons';
import type { WalletState, SendTransactionResult } from '@shared/types';
import { sendToBackground } from '@shared/messaging';
import type { CartItem } from './StoreTab';
import { getTreasuryAddress, getAintiTokenConfig, isPaymentProgramConfigured } from '../utils/solanaPayment';

// API URL
const API_URL = 'https://api.v2.aintivirus.ai';
const AINTIVIRUS_STORE_URL = 'https://aintivirus.ai/merch';

// AINTI Token configuration (loaded from solanaPayment utility)
const AINTI_CONFIG = getAintiTokenConfig();

// Fallback merchant address if on-chain lookup fails
const FALLBACK_MERCHANT_ADDRESS = process.env.MERCHANT_SOL_ADDRESS || '';

interface StoreCheckoutProps {
  cart: CartItem[];
  totalPrice: number;
  walletState: WalletState | null;
  onBack: () => void;
  onSuccess: () => void;
  onUnlockWallet?: () => void;
}

interface CheckoutFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  postalCode: string;
  homeAddress: string;
}

type CheckoutStep = 'form' | 'payment' | 'confirming' | 'success' | 'error';
type PaymentMethod = 'wallet' | 'manual';

// Generate a UUID v4 for order ID
const generateOrderId = (): string => {
  // Use native crypto.randomUUID if available (more secure)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: Generate UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Storage key for saved contact details
const CHECKOUT_STORAGE_KEY = 'storeCheckoutDetails';

const StoreCheckout: React.FC<StoreCheckoutProps> = ({
  cart,
  totalPrice,
  walletState,
  onBack,
  onSuccess,
  onUnlockWallet,
}) => {
  const [step, setStep] = useState<CheckoutStep>('form');
  const [formData, setFormData] = useState<CheckoutFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: '',
    state: '',
    postalCode: '',
    homeAddress: '',
  });
  const [errors, setErrors] = useState<Partial<CheckoutFormData>>({});
  const [orderId, setOrderId] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isWalletLockedError, setIsWalletLockedError] = useState(false);

  const isWalletConnected = walletState?.lockState === 'unlocked' && walletState?.publicAddress;
  // AINTI token is on Solana - always use Solana for payments
  const paymentNetwork = 'solana' as const;
  
  // Treasury address state (loaded from on-chain payment vault)
  const [treasuryAddress, setTreasuryAddress] = useState<string | null>(null);
  const [loadingTreasury, setLoadingTreasury] = useState(true);

  // Fetch treasury address from on-chain payment vault
  useEffect(() => {
    const fetchTreasury = async () => {
      setLoadingTreasury(true);
      try {
        const address = await getTreasuryAddress();
        setTreasuryAddress(address || FALLBACK_MERCHANT_ADDRESS || null);
      } catch (err) {
        console.error('Failed to fetch treasury:', err);
        setTreasuryAddress(FALLBACK_MERCHANT_ADDRESS || null);
      } finally {
        setLoadingTreasury(false);
      }
    };
    fetchTreasury();
  }, []);

  const merchantAddress = treasuryAddress || '';

  // Load saved contact details from storage on mount
  useEffect(() => {
    chrome.storage.local.get([CHECKOUT_STORAGE_KEY], (result) => {
      if (result[CHECKOUT_STORAGE_KEY]) {
        setFormData((prev) => ({
          ...prev,
          ...result[CHECKOUT_STORAGE_KEY],
        }));
      }
    });
  }, []);

  // Save contact details to storage when form data changes
  const saveContactDetails = (data: CheckoutFormData) => {
    chrome.storage.local.set({ [CHECKOUT_STORAGE_KEY]: data });
  };

  // Fetch token price from backend API (same as website)
  useEffect(() => {
    const fetchTokenPrice = async () => {
      setLoadingPrice(true);
      const networkParam = paymentNetwork === 'solana' ? 'sol' : 'eth';
      
        try {
        const response = await fetch(`${API_URL}/payment/token-price?network=${networkParam}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data?.priceUsd) {
              setTokenPrice(data.data.priceUsd);
              setLoadingPrice(false);
              return;
            }
          }
        } catch {
        // Fallback on error
      }
      
      // Fallback price if API call fails (matches backend fallback of $0.02)
      setTokenPrice(0.02);
      setLoadingPrice(false);
    };
    fetchTokenPrice();
  }, [paymentNetwork]);

  // Calculate token amount (price is in dollars)
  const tokenAmount = tokenPrice ? totalPrice / tokenPrice : null;

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const validateForm = (): boolean => {
    const newErrors: Partial<CheckoutFormData> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    if (!formData.homeAddress.trim()) newErrors.homeAddress = 'Address is required';
    if (!formData.country.trim()) newErrors.country = 'Country is required';
    if (!formData.postalCode.trim()) newErrors.postalCode = 'Postal code is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);
    // Save to storage for future use
    saveContactDetails(newFormData);
    // Clear error when user starts typing
    if (errors[name as keyof CheckoutFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmitForm = () => {
    if (validateForm()) {
      // Save contact details before proceeding
      saveContactDetails(formData);
      setOrderId(generateOrderId());
      setStep('payment');
    }
  };

  const placeOrder = async (): Promise<{ success: boolean; orderId?: string; message?: string }> => {
    // Build order payload matching website's useOrder hook format
    // Uses POST /public-orders/merch endpoint (same as website)
    const orderPayload = {
      orderId,
      network: paymentNetwork === 'solana' ? 'solana' : 'evm',
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        // Website uses variantSelection.Size format
        variantSelection: item.size ? { Size: item.size } : undefined,
      })),
      // Customer info fields at root level (matching website's CreateMerchOrderDto)
      firstName: formData.firstName,
      lastName: formData.lastName,
      phoneNumber: formData.phone,
      email: formData.email,
      country: formData.country,
      state: formData.state,
      postalCode: formData.postalCode,
      homeAddress: formData.homeAddress,
    };

      try {
      const response = await fetch(`${API_URL}/public-orders/merch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
            return { success: false, message: errorData.message || 'Failed to place order' };
        }

        const data = await response.json();
        return { success: true, orderId: data.orderId || orderId };
      } catch (err) {
      console.error('Failed to place order:', err);
      return { success: false, message: 'Unable to connect to order service. Please try again.' };
    }
  };

  // Send payment via extension wallet
  // Process payment through the AINTI Payment Program
  // This creates an on-chain PaymentRecord that the backend uses to verify payments
  const sendPayment = async (paymentOrderId: string): Promise<{ success: boolean; signature?: string; error?: string }> => {
    if (!tokenAmount) {
      return { success: false, error: 'Token amount not calculated' };
    }

    if (!paymentOrderId) {
      return { success: false, error: 'Order ID is required for payment' };
    }

    // Process payment through the AINTI Payment Program
    // This creates an on-chain PaymentRecord for order verification
    const result = await sendToBackground<SendTransactionResult>({
      type: 'WALLET_PROCESS_STORE_PAYMENT',
      payload: {
        orderId: paymentOrderId,
        amount: tokenAmount,
      },
    });

    if (result.success && result.data) {
      return { success: true, signature: result.data.signature };
    } else {
      return { success: false, error: result.error || 'Failed to process AINTI payment' };
    }
  };

  // Confirm payment with backend
  const confirmPayment = async (orderIdToConfirm: string, txHash: string): Promise<boolean> => {
      try {
      const response = await fetch(`${API_URL}/public-orders/${orderIdToConfirm}/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentTxHash: txHash }),
        });

      return response.ok;
      } catch (err) {
      console.error('Failed to confirm payment:', err);
      return false;
    }
  };

  const handlePlaceOrder = async () => {
    if (!isWalletConnected || !tokenAmount) {
      setPaymentError('Wallet not connected or price unavailable');
      return;
    }
    
    // Note: For wallet payments, we no longer need to check treasury address
    // as the payment program reads it from the on-chain vault

    setIsPlacingOrder(true);
    setPaymentError(null);

    try {
      // Step 1: Place order in database
      const orderResult = await placeOrder();
      if (!orderResult.success) {
        setPaymentError(orderResult.message || 'Failed to place order');
        setStep('error');
        return;
      }

      const finalOrderId = orderResult.orderId || orderId;
      setCreatedOrderId(finalOrderId);

      // Step 2: If wallet payment selected, send payment through the payment program
      if (paymentMethod === 'wallet') {
        setStep('confirming');
        setIsProcessingPayment(true);

        const paymentResult = await sendPayment(finalOrderId);
        
        if (!paymentResult.success) {
          // Make error messages more user-friendly
          let errorMsg = paymentResult.error || 'Payment failed';
          setIsWalletLockedError(false); // Reset locked state
          
          if (errorMsg.toLowerCase().includes('locked') || errorMsg.toLowerCase().includes('unlock')) {
            errorMsg = 'Wallet is locked. Please unlock your wallet to complete the payment.';
            setIsWalletLockedError(true);
          } else if (errorMsg.includes('Insufficient token balance') || errorMsg.includes('Custom":1')) {
            errorMsg = `Insufficient AINTI balance. You need at least ${tokenAmount?.toFixed(2)} AINTI to complete this purchase.`;
          } else if (errorMsg.includes('InsufficientFundsForRent') || errorMsg.includes('account rent')) {
            errorMsg = 'Insufficient SOL for account rent. You need approximately 0.002 SOL to create the payment record. Please add SOL to your wallet.';
          } else if (errorMsg.includes('Insufficient funds for fee') || errorMsg.includes('Insufficient SOL')) {
            errorMsg = 'Insufficient SOL for transaction fees. Please add SOL to your wallet.';
          }
          setPaymentError(errorMsg);
          setStep('error');
          return;
        }

        setTxSignature(paymentResult.signature || null);

        // Step 3: Confirm payment with backend
        if (paymentResult.signature) {
          const confirmed = await confirmPayment(finalOrderId, paymentResult.signature);
          if (!confirmed) {
            // Payment sent but confirmation failed - still show success with tx hash
            console.warn('Payment sent but backend confirmation failed');
          }
        }
      }

      setStep('success');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Failed to place order');
      setStep('error');
    } finally {
      setIsPlacingOrder(false);
      setIsProcessingPayment(false);
    }
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(merchantAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = merchantAddress;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleOpenWebsite = () => {
    chrome.tabs.create({ url: AINTIVIRUS_STORE_URL });
  };

  const renderFormStep = () => (
    <div className="store-checkout-form">
      <div className="store-checkout-section">
        <h3 className="store-checkout-section-title">Contact Information</h3>
        <div className="store-form-row">
          <div className="store-form-field">
            <label>First Name *</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              className={errors.firstName ? 'error' : ''}
            />
            {errors.firstName && <span className="store-form-error">{errors.firstName}</span>}
          </div>
          <div className="store-form-field">
            <label>Last Name *</label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              className={errors.lastName ? 'error' : ''}
            />
            {errors.lastName && <span className="store-form-error">{errors.lastName}</span>}
          </div>
        </div>
        <div className="store-form-field">
          <label>Email *</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            className={errors.email ? 'error' : ''}
          />
          {errors.email && <span className="store-form-error">{errors.email}</span>}
        </div>
        <div className="store-form-field">
          <label>Phone *</label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            className={errors.phone ? 'error' : ''}
          />
          {errors.phone && <span className="store-form-error">{errors.phone}</span>}
        </div>
      </div>

      <div className="store-checkout-section">
        <h3 className="store-checkout-section-title">Shipping Address</h3>
        <div className="store-form-field">
          <label>Address *</label>
          <input
            type="text"
            name="homeAddress"
            value={formData.homeAddress}
            onChange={handleInputChange}
            className={errors.homeAddress ? 'error' : ''}
          />
          {errors.homeAddress && <span className="store-form-error">{errors.homeAddress}</span>}
        </div>
        <div className="store-form-row">
          <div className="store-form-field">
            <label>Country *</label>
            <input
              type="text"
              name="country"
              value={formData.country}
              onChange={handleInputChange}
              className={errors.country ? 'error' : ''}
            />
            {errors.country && <span className="store-form-error">{errors.country}</span>}
          </div>
          <div className="store-form-field">
            <label>State/Province</label>
            <input
              type="text"
              name="state"
              value={formData.state}
              onChange={handleInputChange}
            />
          </div>
        </div>
        <div className="store-form-field">
          <label>Postal Code *</label>
          <input
            type="text"
            name="postalCode"
            value={formData.postalCode}
            onChange={handleInputChange}
            className={errors.postalCode ? 'error' : ''}
          />
          {errors.postalCode && <span className="store-form-error">{errors.postalCode}</span>}
        </div>
      </div>
    </div>
  );

  const renderPaymentStep = () => (
    <div className="store-checkout-payment">
      <div className="store-checkout-section">
        <h3 className="store-checkout-section-title">Order Summary</h3>
        <div className="store-order-summary">
          {cart.map((item) => (
            <div key={`${item.id}-${item.size || ''}`} className="store-order-item">
              <span className="store-order-item-name">
                {item.name} {item.size ? `(${item.size})` : ''} x{item.quantity}
              </span>
              <span className="store-order-item-price">
                {formatPrice(item.price * item.quantity)}
              </span>
            </div>
          ))}
          <div className="store-order-divider" />
          <div className="store-order-total">
            <span>Total (USD):</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          {tokenAmount && (
            <div className="store-order-token">
              <span>Total (AINTI):</span>
              <span>{tokenAmount.toFixed(2)} AINTI</span>
            </div>
          )}
        </div>
      </div>

      <div className="store-checkout-section">
        <h3 className="store-checkout-section-title">Payment Method</h3>
        {!isWalletConnected ? (
          <div className="store-wallet-locked">
            <div className="store-wallet-warning">
              <AlertIcon size={16} />
              <span>Please unlock your wallet to proceed with payment</span>
            </div>
            {onUnlockWallet && (
              <button className="store-unlock-btn" onClick={onUnlockWallet}>
                Unlock Wallet
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="store-wallet-info">
              <div className="store-wallet-connected">
                <CheckIcon size={14} />
                <span>Wallet: {walletState?.publicAddress?.slice(0, 6)}...{walletState?.publicAddress?.slice(-4)}</span>
              </div>
              <div className="store-payment-network">
                Network: Solana (AINTI)
              </div>
            </div>
            
            <div className="store-payment-methods">
              <label className={`store-payment-option ${paymentMethod === 'wallet' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="wallet"
                  checked={paymentMethod === 'wallet'}
                  onChange={() => setPaymentMethod('wallet')}
                />
                <div className="store-payment-option-content">
                  <span className="store-payment-option-title">Pay with Wallet</span>
                  <span className="store-payment-option-desc">Send AINTI directly from your extension wallet</span>
                </div>
              </label>
              
              <label className={`store-payment-option ${paymentMethod === 'manual' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="manual"
                  checked={paymentMethod === 'manual'}
                  onChange={() => setPaymentMethod('manual')}
                />
                <div className="store-payment-option-content">
                  <span className="store-payment-option-title">Pay Manually</span>
                  <span className="store-payment-option-desc">Copy address and pay from any wallet</span>
                </div>
              </label>
            </div>
          </>
        )}
      </div>

      {paymentMethod === 'manual' && (
        <div className="store-checkout-section">
          <h3 className="store-checkout-section-title">Payment Address (Treasury)</h3>
          <div className="store-payment-address">
            <div className="store-address-value">
              {merchantAddress.slice(0, 12)}...{merchantAddress.slice(-8)}
            </div>
            <button 
              className="store-copy-btn"
              onClick={handleCopyAddress}
              title="Copy address"
            >
              {copiedAddress ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
          <p className="store-payment-note">
            Send exactly {tokenAmount?.toFixed(2)} AINTI to this address after placing your order.
          </p>
        </div>
      )}

      <div className="store-website-cta">
        <p>Prefer the full website experience?</p>
        <button className="store-website-btn" onClick={handleOpenWebsite}>
          <ExternalLinkIcon size={14} />
          Open on Website
        </button>
      </div>
    </div>
  );

  const renderConfirmingStep = () => (
    <div className="store-checkout-confirming">
      <div className="store-spinner" />
      <h3>Processing Payment...</h3>
      <p>Please confirm the transaction in your wallet</p>
      <p className="store-confirming-amount">
        Sending {tokenAmount?.toFixed(2)} AINTI
      </p>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="store-checkout-success">
      <div className="store-success-icon">
        <CheckIcon size={32} />
      </div>
      <h3>{txSignature ? 'Payment Complete!' : 'Order Placed Successfully!'}</h3>
      <p>Your order ID: <strong>{createdOrderId || orderId}</strong></p>
      
      {txSignature ? (
        <div className="store-tx-info">
          <p className="store-tx-label">Transaction:</p>
          <div className="store-payment-address">
            <div className="store-address-value">
              {txSignature.slice(0, 16)}...{txSignature.slice(-8)}
            </div>
            <button 
              className="store-copy-btn"
              onClick={() => {
                navigator.clipboard.writeText(txSignature);
                setCopiedAddress(true);
                setTimeout(() => setCopiedAddress(false), 2000);
              }}
              title="Copy transaction hash"
            >
              {copiedAddress ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
          <p className="store-success-note">
            Your payment has been sent and is being confirmed. You'll receive an email once your order is processed.
          </p>
        </div>
      ) : (
        <div className="store-payment-instructions">
          <p>To complete your order, please send:</p>
          <div className="store-payment-amount">
            {tokenAmount?.toFixed(2)} AINTI
          </div>
          <p>to the treasury address:</p>
          <div className="store-payment-address">
            <div className="store-address-value">
              {merchantAddress}
            </div>
            <button 
              className="store-copy-btn"
              onClick={handleCopyAddress}
              title="Copy address"
            >
              {copiedAddress ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
        </div>
      )}

      <button className="store-done-btn" onClick={onSuccess}>
        Continue Shopping
      </button>
    </div>
  );

  // Handle unlock wallet from error screen
  const handleUnlockFromError = () => {
    if (onUnlockWallet) {
      onUnlockWallet();
      // Return to payment step so user can retry after unlocking
      setStep('payment');
      setPaymentError(null);
      setIsWalletLockedError(false);
    }
  };

  const renderErrorStep = () => (
    <div className="store-checkout-error">
      <div className="store-error-icon">
        {isWalletLockedError ? (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <AlertIcon size={32} />
        )}
      </div>
      <h3>{isWalletLockedError ? 'Wallet Locked' : 'Payment Failed'}</h3>
      <p>{paymentError || 'An error occurred during payment'}</p>
      <div className="store-error-actions">
        {isWalletLockedError && onUnlockWallet ? (
          <button className="store-retry-btn" onClick={handleUnlockFromError}>
            Unlock Wallet
          </button>
        ) : (
          <button className="store-retry-btn" onClick={() => setStep('payment')}>
            Try Again
          </button>
        )}
        <button className="store-cancel-btn" onClick={onBack}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="store-checkout">
      <div className="store-checkout-header">
        <button className="store-back-btn" onClick={onBack}>
          <ChevronIcon size={16} direction="left" />
          <span>Back</span>
        </button>
        <h2 className="store-checkout-title">
          {step === 'form' && 'Checkout'}
          {step === 'payment' && 'Payment'}
          {step === 'confirming' && 'Processing'}
          {step === 'success' && 'Order Complete'}
          {step === 'error' && 'Error'}
        </h2>
      </div>

      <div className="store-checkout-content">
        {step === 'form' && renderFormStep()}
        {step === 'payment' && renderPaymentStep()}
        {step === 'confirming' && renderConfirmingStep()}
        {step === 'success' && renderSuccessStep()}
        {step === 'error' && renderErrorStep()}
      </div>

      {(step === 'form' || step === 'payment') && (
        <div className="store-checkout-footer">
          {step === 'form' && (
            <button className="store-next-btn" onClick={handleSubmitForm}>
              Continue to Payment
            </button>
          )}
          {step === 'payment' && (
            <button
              className="store-pay-btn"
              onClick={handlePlaceOrder}
              disabled={
                !isWalletConnected || 
                loadingPrice || 
                !tokenAmount || 
                isPlacingOrder || 
                isProcessingPayment ||
                (paymentMethod === 'wallet' && (loadingTreasury || !treasuryAddress))
              }
            >
              {isProcessingPayment 
                ? 'Processing Payment...' 
                : isPlacingOrder 
                  ? 'Placing Order...' 
                  : loadingPrice || (paymentMethod === 'wallet' && loadingTreasury)
                    ? 'Loading...' 
                    : paymentMethod === 'wallet' 
                      ? `Pay ${tokenAmount?.toFixed(2)} AINTI` 
                      : 'Place Order'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default StoreCheckout;
