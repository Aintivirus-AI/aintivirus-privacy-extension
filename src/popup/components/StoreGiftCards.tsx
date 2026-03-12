import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { WalletState } from '@shared/types';
import {
  getAllGiftCardTypes,
  getUniqueGiftCardNames,
  getMergedGiftCardData,
  type GiftCardType,
} from '../utils/storeApi';
import StorePayment from './StorePayment';
import {
  getCountryByValue,
  getFlagUrl,
  POPULAR_COUNTRIES as POPULAR_COUNTRY_DATA,
  REGIONS,
  normalizeCountryName,
  countries as ALL_COUNTRIES_DATA,
} from '../data/countries';

interface StoreGiftCardsProps {
  walletState: WalletState | null;
  onUnlockWallet?: () => void;
  onBuyAinti?: () => void;
}

type GiftCardView = 'browse' | 'cards' | 'details' | 'payment';

// Popular country names for quick access
const POPULAR_COUNTRIES = POPULAR_COUNTRY_DATA.map(c => c.value);

// Region categories - use the centralized REGIONS from countries data
const REGION_CATEGORIES = REGIONS;

// Component to render flag using centralized country data
const CountryFlag: React.FC<{ name: string; size?: number }> = ({ name, size = 24 }) => {
  const [hasError, setHasError] = useState(false);
  const flagUrl = getFlagUrl(name, 'w40');
  
  // Reset error state when name changes
  useEffect(() => {
    setHasError(false);
  }, [name]);
  
  if (hasError || !flagUrl) {
    // Fallback to globe emoji for unknown countries
    return <span className="gc-flag-emoji" style={{ fontSize: size }}>🏳️</span>;
  }
  
  return (
    <img 
      src={flagUrl} 
      alt="" 
      className="gc-flag-img"
      style={{ width: size, height: Math.round(size * 0.75) }}
      onError={() => setHasError(true)}
    />
  );
};

// Popular gift card brands to feature at the top
const FEATURED_BRANDS = [
  'Amazon',
  'Apple',
  'Google Play',
  'Visa',
  'Mastercard',
  'Netflix',
  'Spotify',
  'PlayStation',
  'Xbox',
  'Steam',
  'Uber',
  'DoorDash',
];

// Brand to domain mapping for logo fetching
const BRAND_DOMAINS: Record<string, string> = {
  'amazon': 'amazon.com',
  'apple': 'apple.com',
  'google play': 'play.google.com',
  'google': 'google.com',
  'netflix': 'netflix.com',
  'spotify': 'spotify.com',
  'playstation': 'playstation.com',
  'xbox': 'xbox.com',
  'steam': 'steampowered.com',
  'visa': 'visa.com',
  'mastercard': 'mastercard.com',
  'uber': 'uber.com',
  'uber eats': 'ubereats.com',
  'doordash': 'doordash.com',
  'grubhub': 'grubhub.com',
  'instacart': 'instacart.com',
  'target': 'target.com',
  'walmart': 'walmart.com',
  'best buy': 'bestbuy.com',
  'home depot': 'homedepot.com',
  'lowes': 'lowes.com',
  'starbucks': 'starbucks.com',
  'dunkin': 'dunkindonuts.com',
  'chipotle': 'chipotle.com',
  'panera': 'panerabread.com',
  'subway': 'subway.com',
  'dominos': 'dominos.com',
  'pizza hut': 'pizzahut.com',
  'taco bell': 'tacobell.com',
  'mcdonalds': 'mcdonalds.com',
  'burger king': 'bk.com',
  'wendys': 'wendys.com',
  'chick-fil-a': 'chick-fil-a.com',
  'nike': 'nike.com',
  'adidas': 'adidas.com',
  'footlocker': 'footlocker.com',
  'nordstrom': 'nordstrom.com',
  'macys': 'macys.com',
  'kohls': 'kohls.com',
  'gap': 'gap.com',
  'old navy': 'oldnavy.com',
  'sephora': 'sephora.com',
  'ulta': 'ulta.com',
  'bath & body works': 'bathandbodyworks.com',
  'disney': 'disney.com',
  'disney+': 'disneyplus.com',
  'hulu': 'hulu.com',
  'hbo': 'hbo.com',
  'paramount': 'paramount.com',
  'peacock': 'peacocktv.com',
  'twitch': 'twitch.tv',
  'roblox': 'roblox.com',
  'fortnite': 'fortnite.com',
  'nintendo': 'nintendo.com',
  'gamestop': 'gamestop.com',
  'airbnb': 'airbnb.com',
  'hotels.com': 'hotels.com',
  'expedia': 'expedia.com',
  'southwest': 'southwest.com',
  'delta': 'delta.com',
  'american airlines': 'aa.com',
  'united': 'united.com',
  'lyft': 'lyft.com',
  'ebay': 'ebay.com',
  'etsy': 'etsy.com',
  'wayfair': 'wayfair.com',
  'ikea': 'ikea.com',
  'costco': 'costco.com',
  'sams club': 'samsclub.com',
  'cvs': 'cvs.com',
  'walgreens': 'walgreens.com',
  'whole foods': 'wholefoodsmarket.com',
  'kroger': 'kroger.com',
  'safeway': 'safeway.com',
  'publix': 'publix.com',
  'aldi': 'aldi.us',
  'trader joes': 'traderjoes.com',
  'american express': 'americanexpress.com',
  'amex': 'americanexpress.com',
  'paypal': 'paypal.com',
  'venmo': 'venmo.com',
  'cash app': 'cash.app',
};

// Get logo URL for a brand using Google Favicons (reliable, not blocked by ad blockers)
const getBrandLogoUrl = (brandName: string): string | null => {
  const searchKey = brandName.toLowerCase().trim();
  let domain: string | null = null;
  
  // Direct match
  if (BRAND_DOMAINS[searchKey]) {
    domain = BRAND_DOMAINS[searchKey];
  } else {
    // Partial match
    for (const [brand, d] of Object.entries(BRAND_DOMAINS)) {
      if (searchKey.includes(brand) || brand.includes(searchKey)) {
        domain = d;
        break;
      }
    }
  }
  
  // Try to construct domain from brand name (fallback)
  if (!domain) {
    domain = searchKey.replace(/[^a-z0-9]/g, '') + '.com';
  }
  
  // Use Google's favicon service - sz=128 for high quality
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
};

// Brand colors as fallback
const BRAND_COLORS: Record<string, { bg: string; accent: string }> = {
  'Amazon': { bg: 'linear-gradient(135deg, #232f3e 0%, #37475a 100%)', accent: '#ff9900' },
  'Apple': { bg: 'linear-gradient(135deg, #1d1d1f 0%, #424245 100%)', accent: '#ffffff' },
  'Google Play': { bg: 'linear-gradient(135deg, #01875f 0%, #34a853 100%)', accent: '#ffffff' },
  'Netflix': { bg: 'linear-gradient(135deg, #221f1f 0%, #2d2a2a 100%)', accent: '#e50914' },
  'Spotify': { bg: 'linear-gradient(135deg, #121212 0%, #282828 100%)', accent: '#1db954' },
  'PlayStation': { bg: 'linear-gradient(135deg, #003087 0%, #0070d1 100%)', accent: '#ffffff' },
  'Xbox': { bg: 'linear-gradient(135deg, #107c10 0%, #2b9229 100%)', accent: '#ffffff' },
  'Steam': { bg: 'linear-gradient(135deg, #171a21 0%, #1b2838 100%)', accent: '#66c0f4' },
  'Visa': { bg: 'linear-gradient(135deg, #1a1f71 0%, #2f348b 100%)', accent: '#f7b600' },
  'Mastercard': { bg: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)', accent: '#ff5f00' },
  'Uber': { bg: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', accent: '#ffffff' },
  'DoorDash': { bg: 'linear-gradient(135deg, #ff3008 0%, #ff5733 100%)', accent: '#ffffff' },
};

// Quick amount presets
const QUICK_AMOUNTS = [25, 50, 100, 200];

// Brand Logo component with fallback
const BrandLogo: React.FC<{ name: string; size?: number }> = ({ name, size = 32 }) => {
  const [hasError, setHasError] = useState(false);
  const logoUrl = getBrandLogoUrl(name);
  
  if (hasError || !logoUrl) {
    // Fallback to initial letter with brand color
    const style = getBrandStyle(name);
    return (
      <div 
        className="gc-brand-fallback"
        style={{ 
          background: style.bg,
          width: size,
          height: size,
        }}
      >
        <span style={{ color: style.accent }}>{name.charAt(0).toUpperCase()}</span>
      </div>
    );
  }
  
  return (
    <img
      src={logoUrl}
      alt={name}
      className="gc-brand-logo"
      style={{ width: size, height: size }}
      onError={() => setHasError(true)}
    />
  );
};

// Get brand style
const getBrandStyle = (name: string): { bg: string; accent: string } => {
  // Check for exact match first
  if (BRAND_COLORS[name]) return BRAND_COLORS[name];
  
  // Check for partial match
  for (const [brand, colors] of Object.entries(BRAND_COLORS)) {
    if (name.toLowerCase().includes(brand.toLowerCase())) {
      return colors;
    }
  }
  
  // Default gradient based on first letter
  const hue = (name.charCodeAt(0) * 15) % 360;
  return {
    bg: `linear-gradient(135deg, hsl(${hue}, 60%, 25%) 0%, hsl(${hue}, 50%, 35%) 100%)`,
    accent: `hsl(${hue}, 70%, 60%)`,
  };
};

const StoreGiftCards: React.FC<StoreGiftCardsProps> = ({ walletState, onUnlockWallet, onBuyAinti }) => {
  const [view, setView] = useState<GiftCardView>('browse');
  const [giftCardTypes, setGiftCardTypes] = useState<GiftCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedName, setSelectedName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [selectedCurrency] = useState<'sol'>('sol');
  const [activeCategory, setActiveCategory] = useState<string | null>('Americas');

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

  // Global country names that should apply to ALL countries
  const GLOBAL_COUNTRY_NAMES = ['global', 'worldwide', 'international', 'world'];
  
  // Check if a country string is a "global" type
  const isGlobalCountry = useCallback((country: string): boolean => {
    const lower = country.toLowerCase().trim();
    return GLOBAL_COUNTRY_NAMES.includes(lower);
  }, []);

  // Get count of "Global" gift cards (cards that work everywhere)
  const globalGiftCardCount = useMemo(() => {
    const uniqueNames = getUniqueGiftCardNames(giftCardTypes);
    let count = 0;
    
    uniqueNames.forEach(name => {
      const cardData = getMergedGiftCardData(giftCardTypes, name);
      if (cardData) {
        const hasGlobal = cardData.supportedCountries.some(c => isGlobalCountry(c));
        if (hasGlobal) count++;
      }
    });
    
    return count;
  }, [giftCardTypes, isGlobalCountry]);

  // Use ALL countries from our database (excluding special entries like Global, Worldwide, Europe)
  const allCountries = useMemo(() => {
    const excludedValues = ['Global', 'Worldwide', 'Europe', 'European Union'];
    
    return ALL_COUNTRIES_DATA
      .filter(c => !excludedValues.includes(c.value))
      .map(c => ({ value: c.value, label: c.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  // Get just the country values for filtering
  const allCountryValues = useMemo(() => allCountries.map(c => c.value), [allCountries]);

  // Get gift card count per country (includes Global cards in every country)
  const giftCardCountByCountry = useMemo(() => {
    const countMap = new Map<string, number>();
    const uniqueNames = getUniqueGiftCardNames(giftCardTypes);
    
    allCountries.forEach(country => {
      const normalizedCountry = normalizeCountryName(country.value).toLowerCase();
      let count = 0;
      
      uniqueNames.forEach(name => {
        const cardData = getMergedGiftCardData(giftCardTypes, name);
        if (cardData) {
          // Check if this card is for this specific country OR is a Global card
          const hasCountry = cardData.supportedCountries.some(c => {
            const normalized = normalizeCountryName(c).toLowerCase();
            const isMatch = normalized === normalizedCountry || c.toLowerCase() === country.value.toLowerCase();
            const isGlobal = isGlobalCountry(c);
            return isMatch || isGlobal;
          });
          if (hasCountry) count++;
        }
      });
      
      countMap.set(country.value, count);
    });
    
    return countMap;
  }, [giftCardTypes, allCountries, isGlobalCountry]);

  // Helper to get count for a country
  const getCountryGiftCardCount = useCallback((countryValue: string): number => {
    return giftCardCountByCountry.get(countryValue) || 0;
  }, [giftCardCountByCountry]);

  // Separate popular and categorized countries
  const { popularCountries, categorizedCountries, otherCountries } = useMemo(() => {
    const popular: Array<{ value: string; label: string }> = [];
    const categorized: Record<string, Array<{ value: string; label: string }>> = {};
    const other: Array<{ value: string; label: string }> = [];
    const usedValues = new Set<string>();
    
    // Find popular countries that exist in our data
    POPULAR_COUNTRIES.forEach(countryName => {
      const normalized = normalizeCountryName(countryName);
      const match = allCountries.find(c => 
        c.value.toLowerCase() === normalized.toLowerCase() ||
        c.label.toLowerCase() === normalized.toLowerCase()
      );
      if (match && !usedValues.has(match.value)) {
        popular.push(match);
        usedValues.add(match.value);
      }
    });
    
    // Categorize remaining countries by region
    Object.entries(REGION_CATEGORIES).forEach(([category, regionCountries]) => {
      categorized[category] = [];
      
      regionCountries.forEach(regionCountry => {
        const normalized = normalizeCountryName(regionCountry);
        const match = allCountries.find(c => 
          (c.value.toLowerCase() === normalized.toLowerCase() ||
           c.label.toLowerCase() === normalized.toLowerCase()) &&
          !usedValues.has(c.value)
        );
        if (match) {
          categorized[category].push(match);
          usedValues.add(match.value);
        }
      });
    });
    
    // Everything else
    allCountries.forEach(country => {
      if (!usedValues.has(country.value)) {
        other.push(country);
      }
    });
    
    return { popularCountries: popular, categorizedCountries: categorized, otherCountries: other };
  }, [allCountries]);

  // Filter countries based on search
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) {
      return allCountries;
    }
    const query = searchQuery.toLowerCase();
    return allCountries.filter(country => 
      country.value.toLowerCase().includes(query) ||
      country.label.toLowerCase().includes(query)
    );
  }, [allCountries, searchQuery]);

  // Get gift cards available for the selected country (includes Global cards)
  const giftCardsForCountry = useMemo(() => {
    if (!selectedCountry) return [];
    
    const uniqueNames = getUniqueGiftCardNames(giftCardTypes);
    const selectedNormalized = normalizeCountryName(selectedCountry).toLowerCase();
    
    return uniqueNames
      .map(name => getMergedGiftCardData(giftCardTypes, name))
      .filter((card): card is NonNullable<typeof card> => {
        if (!card || !card.id) return false;
        // Include cards that are for this specific country OR are Global cards
        return card.supportedCountries.some(c => {
          const normalized = normalizeCountryName(c).toLowerCase();
          const isMatch = normalized === selectedNormalized || c.toLowerCase() === selectedCountry.toLowerCase();
          const isGlobal = isGlobalCountry(c);
          return isMatch || isGlobal;
        });
      });
  }, [giftCardTypes, selectedCountry, isGlobalCountry]);

  // Separate featured and regular cards for the selected country
  const { featuredCards, regularCards } = useMemo(() => {
    const featured: typeof giftCardsForCountry = [];
    const regular: typeof giftCardsForCountry = [];
    
    giftCardsForCountry.forEach(card => {
      const isFeatured = FEATURED_BRANDS.some(
        brand => card.name.toLowerCase().includes(brand.toLowerCase())
      );
      if (isFeatured) {
        featured.push(card);
      } else {
        regular.push(card);
      }
    });
    
    // Sort featured by the order in FEATURED_BRANDS
    featured.sort((a, b) => {
      const aIndex = FEATURED_BRANDS.findIndex(brand => 
        a.name.toLowerCase().includes(brand.toLowerCase())
      );
      const bIndex = FEATURED_BRANDS.findIndex(brand => 
        b.name.toLowerCase().includes(brand.toLowerCase())
      );
      return aIndex - bIndex;
    });
    
    return { featuredCards: featured, regularCards: regular };
  }, [giftCardsForCountry]);

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

  const handleSelectCountry = useCallback((countryValue: string) => {
    setSelectedCountry(countryValue);
    setSearchQuery('');
    setActiveCategory(null);
    setView('cards');
  }, []);
  
  // Get display label for selected country
  const selectedCountryLabel = useMemo(() => {
    if (!selectedCountry) return '';
    const country = allCountries.find(c => c.value === selectedCountry);
    return country?.label || selectedCountry;
  }, [selectedCountry, allCountries]);

  const handleSelectCard = useCallback((name: string) => {
    setSelectedName(name);
    setView('details');
  }, []);

  const handleBackToCountries = useCallback(() => {
    setView('browse');
    setSelectedCountry('');
    setSelectedName('');
    setAmount('');
  }, []);

  const handleBackToCards = useCallback(() => {
    setView('cards');
    setSelectedName('');
    setAmount('');
  }, []);

  const handleBuy = () => {
    if (!selectedName || !selectedGiftCard || !amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (amountNum < selectedGiftCard.minAmount || amountNum > selectedGiftCard.maxAmount) return;

    setView('payment');
  };

  const handlePaymentSuccess = () => {
    setView('browse');
    setSelectedCountry('');
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
        onBack={() => setView('details')}
        onSuccess={handlePaymentSuccess}
        onBuyAinti={onBuyAinti}
      />
    );
  }

  // Render details view
  if (view === 'details' && selectedGiftCard) {
    const amountNum = parseFloat(amount) || 0;
    const isValidAmount = amountNum >= selectedGiftCard.minAmount && 
                          amountNum <= selectedGiftCard.maxAmount;
    const brandStyle = getBrandStyle(selectedName);

    return (
      <div className="gc-details">
        {/* Header with back button */}
        <div className="gc-details-header">
          <button className="gc-back-btn" onClick={handleBackToCards} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h3 className="gc-details-title">Purchase Gift Card</h3>
          <div style={{ width: 32 }} />
        </div>

        {/* Card Preview */}
        <div 
          className="gc-card-preview"
          style={{ background: brandStyle.bg }}
        >
          <div className="gc-card-preview-content">
            <div className="gc-card-preview-brand" style={{ color: brandStyle.accent }}>
              {selectedName}
            </div>
            <div className="gc-card-preview-amount">
              ${amountNum.toFixed(0)}
            </div>
            <div className="gc-card-preview-label">GIFT CARD</div>
          </div>
        </div>

        {/* Quick Amount Buttons */}
        <div className="gc-quick-amounts">
          <label className="gc-label">Quick Select</label>
          <div className="gc-quick-amount-grid">
            {QUICK_AMOUNTS.filter(
              amt => amt >= selectedGiftCard.minAmount && amt <= selectedGiftCard.maxAmount
            ).map(amt => (
              <button
                key={amt}
                type="button"
                className={`gc-quick-amount-btn ${parseFloat(amount) === amt ? 'active' : ''}`}
                onClick={() => setAmount(String(amt))}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount Input */}
        <div className="gc-amount-section">
          <label className="gc-label">Custom Amount</label>
          <div className="gc-amount-input-wrapper">
            <span className="gc-amount-prefix">$</span>
            <input
              type="number"
              className="gc-amount-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={selectedGiftCard.minAmount}
              max={selectedGiftCard.maxAmount}
              placeholder="Enter amount"
            />
            <div className="gc-amount-controls">
              <button
                type="button"
                className="gc-amount-ctrl-btn"
                onClick={() => {
                  const current = parseFloat(amount) || selectedGiftCard.minAmount;
                  const newVal = Math.min(current + 10, selectedGiftCard.maxAmount);
                  setAmount(String(newVal));
                }}
                aria-label="Increase"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                type="button"
                className="gc-amount-ctrl-btn"
                onClick={() => {
                  const current = parseFloat(amount) || selectedGiftCard.minAmount;
                  const newVal = Math.max(current - 10, selectedGiftCard.minAmount);
                  setAmount(String(newVal));
                }}
                aria-label="Decrease"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>
          <span className="gc-amount-hint">
            ${selectedGiftCard.minAmount} – ${selectedGiftCard.maxAmount} USD
          </span>
        </div>

        {/* Selected Country Info */}
        {selectedCountry && (
          <div className="gc-countries-section">
            <label className="gc-label">Purchasing for</label>
            <div className="gc-selected-country">
              <CountryFlag name={selectedCountry} size={20} />
              <span>{selectedCountryLabel}</span>
            </div>
          </div>
        )}

        {/* Wallet Status */}
        {!walletState && (
          <div className="gc-wallet-locked">
            <div className="gc-wallet-locked-icon">🔒</div>
            <div className="gc-wallet-locked-text">
              <strong>Wallet Locked</strong>
              <span>Unlock your wallet to purchase</span>
            </div>
            {onUnlockWallet && (
              <button className="gc-unlock-btn" onClick={onUnlockWallet} type="button">
                Unlock
              </button>
            )}
          </div>
        )}

        {/* Buy Button */}
        <button
          className="gc-buy-btn"
          onClick={handleBuy}
          disabled={!isValidAmount || !walletState}
          type="button"
        >
          <span className="gc-buy-btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </span>
          Pay ${amountNum.toFixed(2)} with AINTI (Solana)
        </button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="gc-container">
        <div className="gc-loading">
          <div className="gc-loading-spinner" />
          <span>Loading gift cards...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="gc-container">
        <div className="gc-error">
          <div className="gc-error-icon">⚠️</div>
          <span>{error}</span>
          <button className="gc-retry-btn" onClick={fetchGiftCardTypes} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Cards view - show gift cards available for selected country
  if (view === 'cards' && selectedCountry) {
    return (
      <div className="gc-container">
        {/* Hero Banner with selected country */}
        <div className="gc-hero-compact">
          <button className="gc-hero-back-btn" onClick={handleBackToCountries} type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <CountryFlag name={selectedCountry} size={22} />
          <span className="gc-hero-compact-text">
            {selectedCountryLabel} • {giftCardsForCountry.length} gift cards
          </span>
        </div>

        {/* No Cards Available */}
        {giftCardsForCountry.length === 0 && (
          <div className="gc-no-results">
            <div className="gc-no-results-icon">🎁</div>
            <span>No gift cards available for {selectedCountryLabel}</span>
            <button 
              className="gc-clear-search-btn" 
              onClick={handleBackToCountries}
              type="button"
            >
              Browse other countries
            </button>
          </div>
        )}

        {/* Featured Section */}
        {featuredCards.length > 0 && (
          <div className="gc-section">
            <h4 className="gc-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Popular Brands
            </h4>
            <div className="gc-cards-grid gc-featured-grid">
              {featuredCards.slice(0, 6).map((card) => (
                <button
                  key={card.name}
                  className="gc-card gc-card-featured"
                  onClick={() => handleSelectCard(card.name)}
                  type="button"
                >
                  <div className="gc-card-logo-wrapper">
                    <BrandLogo name={card.name} size={40} />
                  </div>
                  <div className="gc-card-info">
                    <span className="gc-card-name">{card.name}</span>
                    <span className="gc-card-range">
                      ${card.minAmount} – ${card.maxAmount}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All Cards Section */}
        {regularCards.length > 0 && (
          <div className="gc-section">
            <h4 className="gc-section-title">All Gift Cards</h4>
            <div className="gc-cards-list">
              {regularCards.map((card) => (
                <button
                  key={card.name}
                  className="gc-card gc-card-list"
                  onClick={() => handleSelectCard(card.name)}
                  type="button"
                >
                  <div className="gc-card-list-logo">
                    <BrandLogo name={card.name} size={32} />
                  </div>
                  <div className="gc-card-list-info">
                    <span className="gc-card-name">{card.name}</span>
                    <span className="gc-card-range">
                      ${card.minAmount} – ${card.maxAmount}
                    </span>
                  </div>
                  <div className="gc-card-list-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Browse view - select country first
  return (
    <div className="gc-container">
      {/* Hero Banner */}
      <div className="gc-hero">
        <div className="gc-hero-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <path d="M12 8v12" />
            <path d="M3 12h18" />
            <path d="M7 8c0-2 1-4 5-4s5 2 5 4" />
          </svg>
        </div>
        <div className="gc-hero-text">
          <h3>Shop Anywhere with Crypto</h3>
          <p>Instant delivery • {getUniqueGiftCardNames(giftCardTypes).length}+ brands • {allCountries.length} countries</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="gc-search-wrapper">
        <svg className="gc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="gc-search-input"
          placeholder="Search countries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button 
            className="gc-search-clear" 
            onClick={() => setSearchQuery('')}
            type="button"
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="gc-section">
          <h4 className="gc-section-title">
            {filteredCountries.length} result{filteredCountries.length !== 1 ? 's' : ''}
          </h4>
          <div className="gc-countries-browse-list">
            {filteredCountries.map((country) => {
              const count = getCountryGiftCardCount(country.value);
              return (
                <button
                  key={country.value}
                  className="gc-country-item"
                  onClick={() => handleSelectCountry(country.value)}
                  type="button"
                >
                  <span className="gc-country-flag"><CountryFlag name={country.value} size={24} /></span>
                  <span className="gc-country-name">{country.label}</span>
                  <span className="gc-country-count">{count} cards</span>
                  <svg className="gc-country-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              );
            })}
          </div>
          {filteredCountries.length === 0 && (
            <div className="gc-no-results">
              <span>No countries found for "{searchQuery}"</span>
              <button onClick={() => setSearchQuery('')} type="button">
                Clear Search
              </button>
            </div>
          )}
        </div>
      )}

      {/* Popular Countries */}
      {!searchQuery && popularCountries.length > 0 && (
        <div className="gc-section">
          <h4 className="gc-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Popular Countries
          </h4>
          <div className="gc-popular-grid">
            {popularCountries.slice(0, 8).map((country) => {
              const count = getCountryGiftCardCount(country.value);
              return (
                <button
                  key={country.value}
                  className="gc-popular-card"
                  onClick={() => handleSelectCountry(country.value)}
                  type="button"
                >
                  <span className="gc-popular-flag"><CountryFlag name={country.value} size={28} /></span>
                  <span className="gc-popular-name">{country.label}</span>
                  <span className="gc-popular-count">{count} cards</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Pills */}
      {!searchQuery && (
        <div className="gc-categories">
          {Object.keys(categorizedCountries).map((category) => (
            categorizedCountries[category].length > 0 && (
              <button
                key={category}
                className={`gc-category-pill ${activeCategory === category ? 'active' : ''}`}
                onClick={() => setActiveCategory(activeCategory === category ? null : category)}
                type="button"
              >
                {category}
                <span className="gc-category-count">{categorizedCountries[category].length}</span>
              </button>
            )
          ))}
        </div>
      )}

      {/* Categorized Countries */}
      {!searchQuery && activeCategory && categorizedCountries[activeCategory] && (
        <div className="gc-section">
          <h4 className="gc-section-title">{activeCategory}</h4>
          <div className="gc-countries-browse-list">
            {categorizedCountries[activeCategory].map((country) => {
              const count = getCountryGiftCardCount(country.value);
              return (
                <button
                  key={country.value}
                  className="gc-country-item"
                  onClick={() => handleSelectCountry(country.value)}
                  type="button"
                >
                  <span className="gc-country-flag"><CountryFlag name={country.value} size={24} /></span>
                  <span className="gc-country-name">{country.label}</span>
                  <span className="gc-country-count">{count} cards</span>
                  <svg className="gc-country-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* All Countries Badge */}
      {!searchQuery && (() => {
        // Exclude non-country entries like Global, Worldwide, Europe, etc.
        const nonCountries = ['global', 'worldwide', 'international', 'world', 'europe', 'european union'];
        const realCountryCount = allCountries.filter(
          c => !nonCountries.includes(c.value.toLowerCase())
        ).length;
        return (
          <div className="gc-all-countries-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>{realCountryCount} countries available</span>
          </div>
        );
      })()}

      {/* Other Countries */}
      {!searchQuery && !activeCategory && otherCountries.length > 0 && (
        <div className="gc-section">
          <h4 className="gc-section-title">More Countries</h4>
          <div className="gc-countries-browse-list">
            {otherCountries.slice(0, 20).map((country) => {
              const count = getCountryGiftCardCount(country.value);
              return (
                <button
                  key={country.value}
                  className="gc-country-item"
                  onClick={() => handleSelectCountry(country.value)}
                  type="button"
                >
                  <span className="gc-country-flag"><CountryFlag name={country.value} size={24} /></span>
                  <span className="gc-country-name">{country.label}</span>
                  <span className="gc-country-count">{count} cards</span>
                  <svg className="gc-country-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              );
            })}
            {otherCountries.length > 20 && (
              <div className="gc-more-hint">
                Use search to find more countries...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreGiftCards;
