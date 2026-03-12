import React, { useState, useEffect, useCallback } from 'react';
import type { WalletState } from '@shared/types';
import { sendToBackground } from '@shared/messaging';
import { SearchIcon, CartIcon, CloseIcon, RefreshIcon, EyeIcon, EyeOffIcon, LockIcon } from '../Icons';
import StoreProductCard from './StoreProductCard';
import StoreCart from './StoreCart';
import StoreCheckout from './StoreCheckout';
import StoreSubTabs, { type StoreSubTab } from './StoreSubTabs';
import StoreGiftCards from './StoreGiftCards';
import StoreESim from './StoreESim';

// API URL
const API_URL = 'https://api.v2.aintivirus.ai';

export interface ProductVariant {
  Size?: string[];
  [key: string]: string[] | undefined;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  image: string;
  variants?: ProductVariant;
}

export interface CartItem {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  size?: string;
}

interface StoreTabProps {
  walletState: WalletState | null;
  onWalletStateChange?: () => void;
  onBuyAinti?: () => void; // Navigate to swap to buy AINTI
}

type MerchView = 'products' | 'cart' | 'checkout';

const StoreTab: React.FC<StoreTabProps> = ({ walletState, onWalletStateChange, onBuyAinti }) => {
  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<StoreSubTab>('merch');
  
  // Merch state
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [merchView, setMerchView] = useState<MerchView>('products');

  // Unlock modal state
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  const handleUnlock = async () => {
    if (!unlockPassword) return;
    setUnlocking(true);
    setUnlockError('');

    try {
      const response = await sendToBackground({
        type: 'WALLET_UNLOCK',
        payload: { password: unlockPassword },
      });

      if (response.success) {
        setUnlockPassword('');
        setShowUnlockModal(false);
        onWalletStateChange?.();
      } else {
        setUnlockError(response.error || 'Failed to unlock');
      }
    } catch {
      setUnlockError('Failed to unlock wallet');
    } finally {
      setUnlocking(false);
    }
  };

  const handleShowUnlockModal = () => {
    setUnlockPassword('');
    setUnlockError('');
    setShowUnlockModal(true);
  };

  // Load cart from chrome storage on mount
  useEffect(() => {
    chrome.storage.local.get(['storeCart'], (result) => {
      if (result.storeCart) {
        setCart(result.storeCart);
      }
    });
  }, []);

  // Save cart to chrome storage whenever it changes
  useEffect(() => {
    chrome.storage.local.set({ storeCart: cart });
  }, [cart]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    
      try {
        const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/public-products`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No products available');
        }

      // Normalize products - API returns price in dollars
        const normalizedProducts = data.map((p: Product) => ({
          ...p,
          price: typeof p.price === 'number' ? p.price : 0,
        }));
        
        setProducts(normalizedProducts);
        setLoading(false);
      } catch (err) {
      console.error('Failed to fetch products:', err);
      setError('Unable to connect to store. Please try again later.');
    setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSubTab === 'merch') {
      fetchProducts();
    }
  }, [fetchProducts, activeSubTab]);

  const addToCart = (product: Product, size?: string, quantity: number = 1) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.id === product.id && item.size === size
      );

      if (existingIndex !== -1) {
        const newCart = [...prev];
        newCart[existingIndex] = {
          ...newCart[existingIndex],
          quantity: newCart[existingIndex].quantity + quantity,
        };
        return newCart;
      }

      return [
        ...prev,
        {
          id: product.id,
          slug: product.slug,
          name: product.name,
          price: product.price,
          image: product.image,
          quantity,
          size,
        },
      ];
    });
  };

  const removeFromCart = (id: string, size?: string) => {
    setCart((prev) => prev.filter((item) => !(item.id === id && item.size === size)));
  };

  const updateQuantity = (id: string, quantity: number, size?: string) => {
    if (quantity <= 0) {
      removeFromCart(id, size);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.id === id && item.size === size ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const filteredProducts = products.filter((product) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      product.name.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query)
    );
  });

  // Handle sub-tab change
  const handleSubTabChange = (tab: StoreSubTab) => {
    setActiveSubTab(tab);
    // Reset merch view when switching tabs
    if (tab === 'merch') {
      setMerchView('products');
    }
  };

  // Render Merch Cart view
  if (activeSubTab === 'merch' && merchView === 'cart') {
    return (
      <div className="store-tab">
        <StoreSubTabs activeTab={activeSubTab} onTabChange={handleSubTabChange} />
        <StoreCart
          cart={cart}
          onBack={() => setMerchView('products')}
          onCheckout={() => setMerchView('checkout')}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          totalPrice={totalPrice}
        />
      </div>
    );
  }

  // Render Merch Checkout view
  if (activeSubTab === 'merch' && merchView === 'checkout') {
    return (
      <div className="store-tab">
        <StoreSubTabs activeTab={activeSubTab} onTabChange={handleSubTabChange} />
        <StoreCheckout
          cart={cart}
          totalPrice={totalPrice}
          walletState={walletState}
          onBack={() => setMerchView('cart')}
          onSuccess={() => {
            clearCart();
            setMerchView('products');
          }}
          onUnlockWallet={handleShowUnlockModal}
        />
        {showUnlockModal && (
          <UnlockModal
            password={unlockPassword}
            showPassword={showPassword}
            unlocking={unlocking}
            error={unlockError}
            onPasswordChange={setUnlockPassword}
            onToggleShowPassword={() => setShowPassword(!showPassword)}
            onUnlock={handleUnlock}
            onClose={() => setShowUnlockModal(false)}
        />
        )}
      </div>
    );
  }

  // Render main content based on active sub-tab
  const renderContent = () => {
    switch (activeSubTab) {
      case 'merch':
        return (
          <>
            <div className="store-header">
              <h2 className="store-title">Featured Products</h2>
              <div className="store-header-actions">
                <div className="store-search">
                  <SearchIcon size={14} />
                  <input
                    type="text"
                    placeholder="Search Products"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="store-search-input"
                  />
                  {searchQuery && (
                    <button
                      className="store-search-clear"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      <CloseIcon size={12} />
                    </button>
                  )}
                </div>
                <button
                  className="store-cart-btn"
                  onClick={() => setMerchView('cart')}
                  aria-label="View cart"
                >
                  <CartIcon size={18} />
                  {totalItems > 0 && <span className="store-cart-badge">{totalItems}</span>}
                </button>
              </div>
            </div>

            <div className="store-content">
              {loading && (
                <div className="store-loading">
                  <div className="spinner" />
                  <span>Loading products...</span>
                </div>
              )}

              {error && (
                <div className="store-error">
                  <span>{error}</span>
                  <button className="store-retry-btn" onClick={fetchProducts}>
                    <RefreshIcon size={14} />
                    Retry
                  </button>
                </div>
              )}

              {!loading && !error && filteredProducts.length === 0 && (
                <div className="store-empty">
                  <span>No products found{searchQuery ? ` matching "${searchQuery}"` : '.'}</span>
                </div>
              )}

              {!loading && !error && filteredProducts.length > 0 && (
                <div className="store-grid">
                  {filteredProducts.map((product) => (
                    <StoreProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={addToCart}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        );

      case 'giftcards':
        return (
          <StoreGiftCards 
            walletState={walletState} 
            onUnlockWallet={handleShowUnlockModal}
            onBuyAinti={onBuyAinti}
          />
        );

      case 'esim':
        return (
          <StoreESim 
            walletState={walletState} 
            onUnlockWallet={handleShowUnlockModal}
            onBuyAinti={onBuyAinti}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="store-tab">
      <StoreSubTabs activeTab={activeSubTab} onTabChange={handleSubTabChange} />
      {renderContent()}
      {showUnlockModal && (
        <UnlockModal
          password={unlockPassword}
          showPassword={showPassword}
          unlocking={unlocking}
          error={unlockError}
          onPasswordChange={setUnlockPassword}
          onToggleShowPassword={() => setShowPassword(!showPassword)}
          onUnlock={handleUnlock}
          onClose={() => setShowUnlockModal(false)}
        />
      )}
    </div>
  );
};

// Unlock Modal Component
interface UnlockModalProps {
  password: string;
  showPassword: boolean;
  unlocking: boolean;
  error: string;
  onPasswordChange: (password: string) => void;
  onToggleShowPassword: () => void;
  onUnlock: () => void;
  onClose: () => void;
}

const UnlockModal: React.FC<UnlockModalProps> = ({
  password,
  showPassword,
  unlocking,
  error,
  onPasswordChange,
  onToggleShowPassword,
  onUnlock,
  onClose,
}) => {
  return (
    <div className="store-unlock-modal-overlay" onClick={onClose}>
      <div className="store-unlock-modal" onClick={(e) => e.stopPropagation()}>
        <div className="store-unlock-modal-header">
          <div className="store-unlock-icon">
            <LockIcon size={24} />
          </div>
          <h3 className="store-unlock-title">Unlock Wallet</h3>
          <p className="store-unlock-subtitle">Enter your password to continue</p>
        </div>
        <form
          className="store-unlock-form"
          onSubmit={(e) => {
            e.preventDefault();
            onUnlock();
          }}
        >
          <div className="store-unlock-input-group">
            <label className="store-unlock-label">Password</label>
            <div className="store-unlock-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className="store-unlock-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="store-unlock-toggle-btn"
                onClick={onToggleShowPassword}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>
          {error && (
            <div className="store-unlock-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
          <div className="store-unlock-actions">
            <button
              type="button"
              className="store-unlock-cancel-btn"
              onClick={onClose}
              disabled={unlocking}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="store-unlock-submit-btn"
              disabled={!password || unlocking}
            >
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StoreTab;
