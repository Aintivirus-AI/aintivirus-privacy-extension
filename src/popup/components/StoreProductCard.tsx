import React, { useState } from 'react';
import { CartIcon, CheckIcon } from '../Icons';
import type { Product } from './StoreTab';

interface StoreProductCardProps {
  product: Product;
  onAddToCart: (product: Product, size?: string, quantity?: number) => void;
}

const StoreProductCard: React.FC<StoreProductCardProps> = ({ product, onAddToCart }) => {
  const [imageError, setImageError] = useState(false);
  const [showSizeSelector, setShowSizeSelector] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);

  const sizes = product.variants?.Size || [];
  const hasVariants = sizes.length > 0;

  const handleAddToCart = () => {
    if (hasVariants && !selectedSize) {
      setShowSizeSelector(true);
      return;
    }

    onAddToCart(product, selectedSize || undefined);
    setAddedToCart(true);
    setShowSizeSelector(false);
    setSelectedSize(null);

    // Reset the added state after animation
    setTimeout(() => setAddedToCart(false), 1500);
  };

  const handleSizeSelect = (size: string) => {
    setSelectedSize(size);
  };

  const handleConfirmSize = () => {
    if (selectedSize) {
      onAddToCart(product, selectedSize);
      setAddedToCart(true);
      setShowSizeSelector(false);
      setSelectedSize(null);
      setTimeout(() => setAddedToCart(false), 1500);
    }
  };

  // Format price (API returns price in dollars)
  const formattedPrice = typeof product.price === 'number' 
    ? `$${product.price.toFixed(2)}`
    : `$${product.price}`;

  return (
    <div className="store-product-card">
      <div className="store-product-image-wrapper">
        <div className="store-product-image">
          {product.image && !imageError ? (
            <img
              src={product.image}
              alt={product.name}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="store-product-image-placeholder">
              <span>No Image</span>
            </div>
          )}
        </div>
      </div>

      <a className="store-product-name" title={product.name}>
        {product.name}
      </a>

      <div className="store-product-footer">
        <div className="store-product-price-row">
          <span className="store-product-price">{formattedPrice}</span>
          <div className="store-product-stock">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <circle cx="4" cy="4" r="4" fill="currentColor"/>
            </svg>
            <span>IN STOCK</span>
          </div>
        </div>
      </div>

      {showSizeSelector && hasVariants ? (
        <div className="store-size-selector">
          <div className="store-size-header">
            <span className="store-size-label">Size</span>
            <span className="store-size-count">{sizes.length} options</span>
          </div>
          <div className="store-size-grid">
            {sizes.map((size) => (
              <button
                key={size}
                type="button"
                className={`store-size-btn ${selectedSize === size ? 'selected' : ''}`}
                onClick={() => handleSizeSelect(size)}
              >
                {size}
              </button>
            ))}
          </div>
          {!selectedSize && (
            <p className="store-size-warning">Please select a size</p>
          )}
          <div className="store-size-actions">
            <button
              className="store-size-cancel"
              onClick={() => {
                setShowSizeSelector(false);
                setSelectedSize(null);
              }}
            >
              Cancel
            </button>
            <button
              className="store-size-confirm"
              onClick={handleConfirmSize}
              disabled={!selectedSize}
            >
              <CartIcon size={12} />
              Add to Cart
            </button>
          </div>
        </div>
      ) : (
        <button
          className={`store-add-btn ${addedToCart ? 'added' : ''}`}
          onClick={handleAddToCart}
          disabled={addedToCart}
        >
          {addedToCart ? (
            <>
              <CheckIcon size={14} />
              <span>Added!</span>
            </>
          ) : (
            <>
              <CartIcon size={14} />
              <span>Add to Cart</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default StoreProductCard;
