import React, { useState, useEffect, useMemo } from 'react';
import type { WalletState } from '@shared/types';
import {
  getUniqueESimNames,
  getPlanTypesByName,
  type PlanType,
} from '../utils/storeApi';
import StorePayment from './StorePayment';

interface StoreESimProps {
  walletState: WalletState | null;
  onUnlockWallet?: () => void;
}

type ESimView = 'selection' | 'payment';

const StoreESim: React.FC<StoreESimProps> = ({ walletState, onUnlockWallet }) => {
  const [view, setView] = useState<ESimView>('selection');
  const [esimNames, setEsimNames] = useState<string[]>([]);
  const [planTypes, setPlanTypes] = useState<PlanType[]>([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<'eth' | 'sol'>('eth');

  // Fetch eSIM names on mount
  useEffect(() => {
    fetchESimNames();
  }, []);

  // Fetch plan types when name is selected
  useEffect(() => {
    if (selectedName) {
      fetchPlanTypes(selectedName);
    } else {
      setPlanTypes([]);
      setSelectedPlanId('');
    }
  }, [selectedName]);

  const fetchESimNames = async () => {
    setLoadingNames(true);
    setError(null);
    try {
      const response = await getUniqueESimNames();
      setEsimNames(response.names);
    } catch (err) {
      console.error('Failed to fetch eSIM names:', err);
      setError(err instanceof Error ? err.message : 'Failed to load eSIMs');
    } finally {
      setLoadingNames(false);
    }
  };

  const fetchPlanTypes = async (name: string) => {
    setLoadingPlans(true);
    setError(null);
    try {
      const response = await getPlanTypesByName(name);
      setPlanTypes(response.planTypes);
      if (response.planTypes.length > 0) {
        setSelectedPlanId(response.planTypes[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch plan types:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plan types');
      setPlanTypes([]);
    } finally {
      setLoadingPlans(false);
    }
  };

  // Get selected plan details
  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) return null;
    return planTypes.find((p) => p.id === selectedPlanId) || null;
  }, [planTypes, selectedPlanId]);

  const handleBuy = (currency: 'eth' | 'sol') => {
    if (!selectedName || !selectedPlan) return;
    setSelectedCurrency(currency);
    setView('payment');
  };

  const handlePaymentSuccess = () => {
    setView('selection');
    setSelectedName('');
    setSelectedPlanId('');
    setPlanTypes([]);
  };

  // Render payment view
  if (view === 'payment' && selectedPlan) {
    return (
      <StorePayment
        type="esim"
        itemId={selectedPlanId}
        itemName={`${selectedName} - ${selectedPlan.type}`}
        amount={selectedPlan.price}
        currency={selectedCurrency}
        walletState={walletState}
        onUnlockWallet={onUnlockWallet}
        onBack={() => setView('selection')}
        onSuccess={handlePaymentSuccess}
      />
    );
  }

  // Loading state
  if (loadingNames) {
    return (
      <div className="esim-container">
        <div className="store-loading">
          <div className="spinner" />
          <span>Loading eSIMs...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !loadingPlans) {
    return (
      <div className="esim-container">
        <div className="store-error">
          <span>{error}</span>
          <button className="store-retry-btn" onClick={fetchESimNames}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="esim-container">
      <div className="esim-header">
        <h3 className="esim-title">Purchase eSIMs</h3>
      </div>

      {/* eSIM Selection */}
      <div className="esim-select-group">
        <label className="esim-label">eSIM Country/Region</label>
        <select
          className="esim-select"
          value={selectedName}
          onChange={(e) => {
            setSelectedName(e.target.value);
            setSelectedPlanId('');
          }}
        >
          <option value="">
            Select an eSIM ({esimNames.length}+ options available)
          </option>
          {esimNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Plan Type Selection */}
      <div className="esim-select-group">
        <label className="esim-label">Plan Type</label>
        <select
          className="esim-select"
          value={selectedPlanId}
          onChange={(e) => setSelectedPlanId(e.target.value)}
          disabled={!selectedName || loadingPlans || planTypes.length === 0}
        >
          {!selectedName ? (
            <option value="">Select an eSIM first</option>
          ) : loadingPlans ? (
            <option value="">Loading plans...</option>
          ) : planTypes.length === 0 ? (
            <option value="">No plans available</option>
          ) : (
            <>
              <option value="">Select a plan</option>
              {planTypes.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.type} - ${plan.price.toFixed(2)}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Plan warning for no plans */}
      {selectedName && !loadingPlans && planTypes.length === 0 && (
        <div className="mixer-warning">
          <span className="mixer-warning-icon">⚠️</span>
          <span className="mixer-warning-text">
            No plan types found for this eSIM. Please try another one.
          </span>
        </div>
      )}

      {/* Price Display */}
      {selectedPlan && (
        <div className="esim-price-box">
          <div className="esim-price-header">
            <div>
              <span className="esim-price-label">Total Cost</span>
            </div>
            <span className="esim-price-value">${selectedPlan.price.toFixed(2)} USD</span>
          </div>
          <div className="esim-plan-details">
            <strong>Plan:</strong> {selectedPlan.type}
          </div>
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

      {/* Buy Buttons */}
      <div className="esim-btn-group">
        <button
          className="esim-buy-btn secondary"
          onClick={() => handleBuy('eth')}
          disabled={!selectedName || !selectedPlan || !walletState}
        >
          Buy with ETH-AINTI
        </button>
        <button
          className="esim-buy-btn primary"
          onClick={() => handleBuy('sol')}
          disabled={!selectedName || !selectedPlan || !walletState}
        >
          Buy with SOL-AINTI
        </button>
      </div>
    </div>
  );
};

export default StoreESim;
