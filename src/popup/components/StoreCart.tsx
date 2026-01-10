import React from 'react';
import { ChevronIcon, TrashIcon, PlusIcon, MinusIcon } from '../Icons';
import type { CartItem } from './StoreTab';

interface StoreCartProps {
  cart: CartItem[];
  onBack: () => void;
  onCheckout: () => void;
  onUpdateQuantity: (id: string, quantity: number, size?: string) => void;
  onRemove: (id: string, size?: string) => void;
  totalPrice: number;
}

const StoreCart: React.FC<StoreCartProps> = ({
  cart,
  onBack,
  onCheckout,
  onUpdateQuantity,
  onRemove,
  totalPrice,
}) => {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Format price from cents to dollars
  const formatPrice = (price: number) => `$${(price / 100).toFixed(2)}`;

  return (
    <div className="store-cart">
      <div className="store-cart-header">
        <button className="store-back-btn" onClick={onBack}>
          <ChevronIcon size={16} direction="left" />
          <span>Back to Store</span>
        </button>
        <h2 className="store-cart-title">My Cart ({totalItems})</h2>
      </div>

      <div className="store-cart-content">
        {cart.length === 0 ? (
          <div className="store-cart-empty">
            <span>Your cart is empty</span>
            <button className="store-continue-btn" onClick={onBack}>
              Continue Shopping
            </button>
          </div>
        ) : (
          <div className="store-cart-items">
            {cart.map((item) => {
              const uniqueKey = `${item.id}-${item.size || 'no-size'}`;
              return (
                <div key={uniqueKey} className="store-cart-item">
                  <div className="store-cart-item-image">
                    {item.image ? (
                      <img src={item.image} alt={item.name} />
                    ) : (
                      <div className="store-cart-item-placeholder">No Image</div>
                    )}
                  </div>
                  <div className="store-cart-item-details">
                    <div className="store-cart-item-name">{item.name}</div>
                    {item.size && (
                      <div className="store-cart-item-size">Size: {item.size}</div>
                    )}
                    <div className="store-cart-item-price">{formatPrice(item.price)}</div>
                  </div>
                  <div className="store-cart-item-actions">
                    <div className="store-quantity-controls">
                      <button
                        className="store-quantity-btn"
                        onClick={() => onUpdateQuantity(item.id, item.quantity - 1, item.size)}
                        disabled={item.quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        <MinusIcon size={12} />
                      </button>
                      <span className="store-quantity-value">{item.quantity}</span>
                      <button
                        className="store-quantity-btn"
                        onClick={() => onUpdateQuantity(item.id, item.quantity + 1, item.size)}
                        aria-label="Increase quantity"
                      >
                        <PlusIcon size={12} />
                      </button>
                    </div>
                    <button
                      className="store-remove-btn"
                      onClick={() => onRemove(item.id, item.size)}
                      aria-label="Remove item"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="store-cart-footer">
          <div className="store-cart-summary">
            <div className="store-cart-subtotal">
              <span>Subtotal:</span>
              <span className="store-cart-total-price">{formatPrice(totalPrice)}</span>
            </div>
            <div className="store-cart-shipping">
              <span>Shipping:</span>
              <span className="store-cart-shipping-free">Free</span>
            </div>
          </div>
          <button className="store-checkout-btn" onClick={onCheckout}>
            Proceed to Checkout
          </button>
        </div>
      )}
    </div>
  );
};

export default StoreCart;
