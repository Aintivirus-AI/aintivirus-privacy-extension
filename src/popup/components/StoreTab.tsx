import React, { useState, useEffect, useCallback } from 'react';
import type { WalletState } from '@shared/types';
import { SearchIcon, CartIcon, CloseIcon, RefreshIcon } from '../Icons';
import StoreProductCard from './StoreProductCard';
import StoreCart from './StoreCart';
import StoreCheckout from './StoreCheckout';

// API URLs - tries localhost first for development, then production
const API_URLS = [
  'http://localhost:3000',           // Local development
  'https://api.aintivirus.ai',       // Production
];

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
  onUnlockWallet?: () => void;
}

type StoreView = 'products' | 'cart' | 'checkout';

const StoreTab: React.FC<StoreTabProps> = ({ walletState, onUnlockWallet }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [view, setView] = useState<StoreView>('products');

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
    
    // Try each API URL in order until one works
    for (const baseUrl of API_URLS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per URL

        const response = await fetch(`${baseUrl}/public-products`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`API ${baseUrl} returned ${response.status}, trying next...`);
          continue;
        }

        const data = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          console.warn(`API ${baseUrl} returned empty/invalid data, trying next...`);
          continue;
        }

        // Normalize products - API returns price in cents
        const normalizedProducts = data.map((p: Product) => ({
          ...p,
          price: typeof p.price === 'number' ? p.price : 0,
        }));
        
        setProducts(normalizedProducts);
        console.log(`Successfully fetched ${normalizedProducts.length} products from ${baseUrl}`);
        setLoading(false);
        return; // Success! Exit the function
      } catch (err) {
        console.warn(`Failed to fetch from ${baseUrl}:`, err);
        // Continue to next URL
      }
    }

    // All URLs failed
    setError('Unable to connect to store. Please ensure the API is running.');
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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

  if (view === 'cart') {
    return (
      <StoreCart
        cart={cart}
        onBack={() => setView('products')}
        onCheckout={() => setView('checkout')}
        onUpdateQuantity={updateQuantity}
        onRemove={removeFromCart}
        totalPrice={totalPrice}
      />
    );
  }

  if (view === 'checkout') {
    return (
      <StoreCheckout
        cart={cart}
        totalPrice={totalPrice}
        walletState={walletState}
        onBack={() => setView('cart')}
        onSuccess={() => {
          clearCart();
          setView('products');
        }}
        onUnlockWallet={onUnlockWallet}
      />
    );
  }

  return (
    <div className="store-tab">
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
            onClick={() => setView('cart')}
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
    </div>
  );
};

export default StoreTab;
