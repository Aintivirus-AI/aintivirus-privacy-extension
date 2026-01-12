import React, { useState, useEffect, useMemo } from 'react';
import type { WalletState } from '@shared/types';
import {
  getAllGiftCardTypes,
  getUniqueGiftCardNames,
  getMergedGiftCardData,
  type GiftCardType,
} from '../utils/storeApi';
import StorePayment from './StorePayment';

interface StoreGiftCardsProps {
  walletState: WalletState | null;
  onUnlockWallet?: () => void;
}

type GiftCardView = 'selection' | 'payment';

const StoreGiftCards: React.FC<StoreGiftCardsProps> = ({ walletState, onUnlockWallet }) => {
  const [view, setView] = useState<GiftCardView>('selection');
  const [giftCardTypes, setGiftCardTypes] = useState<GiftCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  // AINTI is on Solana - always use Solana for payments
  const [selectedCurrency] = useState<'sol'>('sol');

  // Fetch gift card types on mount
  useEffect(() => {
    fetchGiftCardTypes();
  }, []);

  const fetchGiftCardTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const types = await getAllGiftCardTypes();
      setGiftCardTypes(types);
    } catch (err) {
      console.error('Failed to fetch gift card types:', err);
      setError(err instanceof Error ? err.message : 'Failed to load gift cards');
    } finally {
      setLoading(false);
    }
  };

  // Get unique names
  const giftCardNames = useMemo(() => {
    return getUniqueGiftCardNames(giftCardTypes);
  }, [giftCardTypes]);

  // Get merged data for selected name
  const selectedGiftCard = useMemo(() => {
    if (!selectedName) return null;
    return getMergedGiftCardData(giftCardTypes, selectedName);
  }, [giftCardTypes, selectedName]);

  // Reset amount when gift card changes
  useEffect(() => {
    if (selectedGiftCard) {
      setAmount(String(selectedGiftCard.minAmount || 50));
    } else {
      setAmount('');
    }
  }, [selectedGiftCard]);

  const handleBuy = () => {
    if (!selectedName || !selectedGiftCard || !amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (amountNum < selectedGiftCard.minAmount || amountNum > selectedGiftCard.maxAmount) return;

    setView('payment');
  };

  const handlePaymentSuccess = () => {
    setView('selection');
    setSelectedName('');
    setAmount('');
  };

  // Render payment view
  if (view === 'payment' && selectedGiftCard) {
    return (
      <StorePayment
        type="giftcard"
        itemId={selectedGiftCard.id}
        itemName={selectedName}
        amount={parseFloat(amount)}
        currency={selectedCurrency}
        walletState={walletState}
        onUnlockWallet={onUnlockWallet}
        onBack={() => setView('selection')}
        onSuccess={handlePaymentSuccess}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="giftcard-container">
        <div className="store-loading">
          <div className="spinner" />
          <span>Loading gift cards...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="giftcard-container">
        <div className="store-error">
          <span>{error}</span>
          <button className="store-retry-btn" onClick={fetchGiftCardTypes}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const amountNum = parseFloat(amount) || 0;
  const isValidAmount = selectedGiftCard && 
    amountNum >= selectedGiftCard.minAmount && 
    amountNum <= selectedGiftCard.maxAmount;

  return (
    <div className="giftcard-container">
      <div className="giftcard-header">
        <h3 className="giftcard-title">Purchase Gift Cards</h3>
      </div>

      {/* Gift Card Selection */}
      <div className="giftcard-select-group">
        <label className="giftcard-label">Gift Card Brand</label>
        <select
          className="giftcard-select"
          value={selectedName}
          onChange={(e) => setSelectedName(e.target.value)}
        >
          <option value="">
            Select a gift card ({giftCardNames.length} available)
          </option>
          {giftCardNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Supported Countries */}
      {selectedGiftCard && selectedGiftCard.supportedCountries.length > 0 && (
        <div className="giftcard-select-group">
          <label className="giftcard-label">Supported Countries</label>
          <div className="giftcard-countries">
            {selectedGiftCard.supportedCountries.slice(0, 5).map((country) => (
              <span key={country} className="giftcard-country-tag">
                {country}
              </span>
            ))}
            {selectedGiftCard.supportedCountries.length > 5 && (
              <span className="giftcard-country-tag">
                +{selectedGiftCard.supportedCountries.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Amount Input */}
      <div className="giftcard-select-group">
        <label className="giftcard-label">Amount (USD)</label>
        <div className="giftcard-amount-wrapper">
          <input
            type="number"
            className="giftcard-amount-input"
            placeholder={
              selectedGiftCard
                ? `$${selectedGiftCard.minAmount} - $${selectedGiftCard.maxAmount}`
                : 'Select a gift card first'
            }
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!selectedGiftCard}
            min={selectedGiftCard?.minAmount || 0}
            max={selectedGiftCard?.maxAmount || 0}
          />
          <div className="giftcard-amount-buttons">
            <button
              type="button"
              className="giftcard-amount-btn"
              onClick={() => {
                const current = parseFloat(amount) || selectedGiftCard?.minAmount || 0;
                const max = selectedGiftCard?.maxAmount || 1000;
                const newVal = Math.min(current + 10, max);
                setAmount(String(newVal));
              }}
              disabled={!selectedGiftCard}
              aria-label="Increase amount"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              type="button"
              className="giftcard-amount-btn"
              onClick={() => {
                const current = parseFloat(amount) || selectedGiftCard?.minAmount || 0;
                const min = selectedGiftCard?.minAmount || 0;
                const newVal = Math.max(current - 10, min);
                setAmount(String(newVal));
              }}
              disabled={!selectedGiftCard}
              aria-label="Decrease amount"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>
        {selectedGiftCard && (
          <span className="giftcard-amount-range">
            Range: ${selectedGiftCard.minAmount} - ${selectedGiftCard.maxAmount}
          </span>
        )}
      </div>

      {/* Price Display */}
      {selectedGiftCard && amount && isValidAmount && (
        <div className="giftcard-price-box">
          <span className="giftcard-price-label">Total Cost</span>
          <span className="giftcard-price-value">${amountNum.toFixed(2)} USD</span>
        </div>
      )}

      {/* Wallet Status */}
      {!walletState && (
        <div className="store-wallet-locked">
          <div className="store-wallet-warning">
            <span>🔒</span>
            <span>Wallet is locked. Unlock to purchase.</span>
          </div>
          {onUnlockWallet && (
            <button className="store-unlock-btn" onClick={onUnlockWallet}>
              Unlock Wallet
            </button>
          )}
        </div>
      )}

      {/* Buy Button - AINTI is on Solana */}
      <div className="giftcard-btn-group">
        <button
          className="giftcard-buy-btn primary"
          onClick={handleBuy}
          disabled={!selectedName || !isValidAmount || !walletState}
        >
          Buy with AINTI (Solana)
        </button>
      </div>
    </div>
  );
};

export default StoreGiftCards;
