import React, { useState, useEffect } from 'react';
import { ChevronIcon, CheckIcon, AlertIcon, CopyIcon, ExternalLinkIcon, RefreshIcon } from '../Icons';
import type { WalletState, SendTransactionResult, EVMTransactionResult } from '@shared/types';
import { sendToBackground } from '@shared/messaging';
import type { CartItem } from './StoreTab';

// API URLs - tries localhost first for development, then production
const API_URLS = [
  'http://localhost:3000',           // Local development
  'https://api.aintivirus.ai',       // Production
];
const AINTIVIRUS_STORE_URL = 'https://aintivirus.ai/merch';

// AINTI Token configuration
// Solana: SPL Token mint address
// EVM: ERC-20 token contract address
const AINTI_TOKEN = {
  solana: {
    mint: process.env.AINTI_TOKEN_SOL_ADDRESS || 'BAezfVmia8UYLt4rst6PCU4dvL2i2qHzqn4wGhytpNJW',
    decimals: 9,
  },
  evm: {
    address: process.env.AINTI_TOKEN_ETH_ADDRESS || '0x0000000000000000000000000000000000000000',
    decimals: 18,
  },
};

// Merchant/Treasury addresses for AINTI token payments
// These should match the backend's MERCHANT_SOL_ADDRESS and MERCHANT_ETH_ADDRESS
const MERCHANT_ADDRESSES = {
  solana: process.env.MERCHANT_SOL_ADDRESS || 'AintiMerchantSOLAddress', // Replace with actual treasury
  evm: process.env.MERCHANT_ETH_ADDRESS || '0xAintiMerchantEVMAddress', // Replace with actual treasury
};

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

// Generate a unique order ID
const generateOrderId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `ORD-${timestamp}-${randomPart}`.toUpperCase();
};

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

  const isWalletConnected = walletState?.lockState === 'unlocked' && walletState?.publicAddress;
  const paymentNetwork = walletState?.activeChain === 'solana' ? 'solana' : 'evm';
  const merchantAddress = MERCHANT_ADDRESSES[paymentNetwork];

  // Fetch token price from backend API (same as website)
  useEffect(() => {
    const fetchTokenPrice = async () => {
      setLoadingPrice(true);
      const networkParam = paymentNetwork === 'solana' ? 'sol' : 'eth';
      
      // Try each API URL
      for (const baseUrl of API_URLS) {
        try {
          const response = await fetch(`${baseUrl}/payment/token-price?network=${networkParam}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data?.priceUsd) {
              setTokenPrice(data.data.priceUsd);
              setLoadingPrice(false);
              return;
            }
          }
        } catch {
          // Continue to next URL
        }
      }
      
      // Fallback price if all API calls fail (matches backend fallback of $0.02)
      setTokenPrice(0.02);
      setLoadingPrice(false);
    };
    fetchTokenPrice();
  }, [paymentNetwork]);

  // Calculate token amount (price is in cents, convert to USD first)
  const priceInUsd = totalPrice / 100;
  const tokenAmount = tokenPrice ? priceInUsd / tokenPrice : null;

  const formatPrice = (price: number) => `$${(price / 100).toFixed(2)}`;

  const validateForm = (): boolean => {
    const newErrors: Partial<CheckoutFormData> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.homeAddress.trim()) newErrors.homeAddress = 'Address is required';
    if (!formData.country.trim()) newErrors.country = 'Country is required';
    if (!formData.postalCode.trim()) newErrors.postalCode = 'Postal code is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof CheckoutFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmitForm = () => {
    if (validateForm()) {
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

    // Try each API URL in order
    for (const baseUrl of API_URLS) {
      try {
        // Use the correct /public-orders/merch endpoint (same as website)
        const response = await fetch(`${baseUrl}/public-orders/merch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // If it's a client error (4xx), return the error, don't try next URL
          if (response.status >= 400 && response.status < 500) {
            return { success: false, message: errorData.message || 'Failed to place order' };
          }
          // Server error, try next URL
          continue;
        }

        const data = await response.json();
        return { success: true, orderId: data.orderId || orderId };
      } catch (err) {
        console.warn(`Failed to place order via ${baseUrl}:`, err);
        // Continue to next URL
      }
    }

    return { success: false, message: 'Unable to connect to order service. Please try again.' };
  };

  // Send payment via extension wallet
  const sendPayment = async (): Promise<{ success: boolean; signature?: string; error?: string }> => {
    if (!tokenAmount) {
      return { success: false, error: 'Token amount not calculated' };
    }

    const amountRaw = tokenAmount; // Amount in whole tokens

    if (paymentNetwork === 'solana') {
      // Send SPL Token (AINTI on Solana)
      const result = await sendToBackground<SendTransactionResult>({
        type: 'WALLET_SEND_SPL_TOKEN',
        payload: {
          recipient: MERCHANT_ADDRESSES.solana,
          amount: amountRaw,
          mint: AINTI_TOKEN.solana.mint,
          decimals: AINTI_TOKEN.solana.decimals,
        },
      });

      if (result.success && result.data) {
        return { success: true, signature: result.data.signature };
      } else {
        return { success: false, error: result.error || 'Failed to send SPL token' };
      }
    } else {
      // Send ERC-20 Token (AINTI on EVM)
      const result = await sendToBackground<EVMTransactionResult>({
        type: 'WALLET_SEND_ERC20',
        payload: {
          recipient: MERCHANT_ADDRESSES.evm,
          tokenAddress: AINTI_TOKEN.evm.address,
          amount: amountRaw.toString(),
          decimals: AINTI_TOKEN.evm.decimals,
        },
      });

      if (result.success && result.data) {
        return { success: true, signature: result.data.hash };
      } else {
        return { success: false, error: result.error || 'Failed to send ERC-20 token' };
      }
    }
  };

  // Confirm payment with backend
  const confirmPayment = async (orderIdToConfirm: string, txHash: string): Promise<boolean> => {
    for (const baseUrl of API_URLS) {
      try {
        const response = await fetch(`${baseUrl}/public-orders/${orderIdToConfirm}/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentTxHash: txHash }),
        });

        if (response.ok) {
          return true;
        }
      } catch (err) {
        console.warn(`Failed to confirm payment via ${baseUrl}:`, err);
      }
    }
    return false;
  };

  const handlePlaceOrder = async () => {
    if (!isWalletConnected || !tokenAmount) {
      setPaymentError('Wallet not connected or price unavailable');
      return;
    }

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

      // Step 2: If wallet payment selected, send payment
      if (paymentMethod === 'wallet') {
        setStep('confirming');
        setIsProcessingPayment(true);

        const paymentResult = await sendPayment();
        
        if (!paymentResult.success) {
          setPaymentError(paymentResult.error || 'Payment failed');
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
          <label>Phone</label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
          />
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
                Network: {paymentNetwork === 'solana' ? 'Solana' : 'Ethereum'}
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

  const renderErrorStep = () => (
    <div className="store-checkout-error">
      <div className="store-error-icon">
        <AlertIcon size={32} />
      </div>
      <h3>Payment Failed</h3>
      <p>{paymentError || 'An error occurred during payment'}</p>
      <div className="store-error-actions">
        <button className="store-retry-btn" onClick={() => setStep('payment')}>
          Try Again
        </button>
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
              disabled={!isWalletConnected || loadingPrice || !tokenAmount || isPlacingOrder || isProcessingPayment}
            >
              {isProcessingPayment 
                ? 'Processing Payment...' 
                : isPlacingOrder 
                  ? 'Placing Order...' 
                  : loadingPrice 
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
