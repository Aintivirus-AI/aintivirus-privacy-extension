import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  onBuyAinti?: () => void;
}

type ESimView = 'browse' | 'plans' | 'payment';

// Popular regions for quick access
const POPULAR_REGIONS = [
  'United States',
  'United Kingdom', 
  'Europe',
  'Japan',
  'South Korea',
  'Thailand',
  'Australia',
  'Canada',
  'Singapore',
  'Global',
];

// Region categories
const REGION_CATEGORIES: Record<string, string[]> = {
  'Americas': ['United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru'],
  'Europe': ['United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Switzerland', 'Europe'],
  'Asia Pacific': ['Japan', 'South Korea', 'China', 'Thailand', 'Singapore', 'Australia', 'Indonesia', 'Malaysia', 'Vietnam', 'Philippines', 'India'],
  'Middle East': ['UAE', 'Saudi Arabia', 'Turkey', 'Israel', 'Qatar'],
  'Africa': ['South Africa', 'Egypt', 'Morocco', 'Kenya', 'Nigeria'],
};

// ISO code to flag image URL (using flagcdn.com for reliable flag images)
const getFlagUrl = (isoCode: string): string => {
  if (!isoCode || isoCode.length !== 2) return '';
  return `https://flagcdn.com/w40/${isoCode.toLowerCase()}.png`;
};

// Country/region name to ISO code mapping - comprehensive list
const NAME_TO_ISO: Record<string, string> = {
  // North America
  'united states': 'us', 'usa': 'us', 'us': 'us', 'america': 'us',
  'canada': 'ca',
  'mexico': 'mx',
  
  // Central America & Caribbean
  'guatemala': 'gt',
  'belize': 'bz',
  'honduras': 'hn',
  'el salvador': 'sv',
  'nicaragua': 'ni',
  'costa rica': 'cr',
  'panama': 'pa',
  'cuba': 'cu',
  'dominican republic': 'do',
  'haiti': 'ht',
  'puerto rico': 'pr',
  'jamaica': 'jm',
  'trinidad': 'tt', 'trinidad and tobago': 'tt',
  'bahamas': 'bs', 'the bahamas': 'bs',
  'barbados': 'bb',
  'guam': 'gu',
  'us virgin islands': 'vi', 'u.s. virgin islands': 'vi',
  'antigua': 'ag', 'antigua and barbuda': 'ag',
  'anguilla': 'ai',
  'aruba': 'aw',
  'bermuda': 'bm',
  'british virgin islands': 'vg',
  'cayman islands': 'ky',
  'curacao': 'cw', 'curaçao': 'cw',
  'dominica': 'dm',
  'grenada': 'gd',
  'guadeloupe': 'gp',
  'martinique': 'mq',
  'montserrat': 'ms',
  'saint kitts': 'kn', 'saint kitts and nevis': 'kn', 'st kitts': 'kn',
  'saint lucia': 'lc', 'st lucia': 'lc',
  'saint vincent': 'vc', 'saint vincent and the grenadines': 'vc', 'st vincent': 'vc',
  'sint maarten': 'sx',
  'turks and caicos': 'tc', 'turks and caicos islands': 'tc',
  
  // South America
  'brazil': 'br', 'brasil': 'br',
  'argentina': 'ar',
  'colombia': 'co',
  'chile': 'cl',
  'peru': 'pe',
  'ecuador': 'ec',
  'venezuela': 've',
  'uruguay': 'uy',
  'paraguay': 'py',
  'bolivia': 'bo',
  'guyana': 'gy',
  'suriname': 'sr',
  'french guiana': 'gf',
  
  // Europe - Western
  'united kingdom': 'gb', 'uk': 'gb', 'great britain': 'gb', 'england': 'gb', 'britain': 'gb',
  'germany': 'de', 'deutschland': 'de',
  'france': 'fr',
  'italy': 'it', 'italia': 'it',
  'spain': 'es', 'españa': 'es',
  'netherlands': 'nl', 'holland': 'nl',
  'belgium': 'be',
  'austria': 'at',
  'switzerland': 'ch',
  'ireland': 'ie',
  'portugal': 'pt',
  'luxembourg': 'lu',
  'monaco': 'mc',
  'andorra': 'ad',
  'liechtenstein': 'li',
  'san marino': 'sm',
  'vatican': 'va', 'vatican city': 'va',
  'gibraltar': 'gi',
  
  // Europe - Northern
  'sweden': 'se',
  'norway': 'no',
  'denmark': 'dk',
  'finland': 'fi',
  'iceland': 'is',
  'faroe islands': 'fo',
  'greenland': 'gl',
  'aland islands': 'ax', 'åland islands': 'ax',
  
  // Europe - Eastern
  'poland': 'pl',
  'czech republic': 'cz', 'czechia': 'cz',
  'romania': 'ro',
  'hungary': 'hu',
  'ukraine': 'ua',
  'russia': 'ru', 'russian federation': 'ru',
  'slovakia': 'sk',
  'slovenia': 'si',
  'croatia': 'hr',
  'bulgaria': 'bg',
  'serbia': 'rs',
  'lithuania': 'lt',
  'latvia': 'lv',
  'estonia': 'ee',
  'belarus': 'by',
  'moldova': 'md',
  'bosnia': 'ba', 'bosnia and herzegovina': 'ba',
  'north macedonia': 'mk', 'macedonia': 'mk',
  'albania': 'al',
  'montenegro': 'me',
  'kosovo': 'xk',
  
  // Europe - Southern
  'greece': 'gr',
  'malta': 'mt',
  'cyprus': 'cy',
  
  // Asia - East
  'japan': 'jp', 'nippon': 'jp',
  'south korea': 'kr', 'korea': 'kr',
  'china': 'cn', 'prc': 'cn',
  'taiwan': 'tw',
  'hong kong': 'hk',
  'macau': 'mo', 'macao': 'mo',
  'mongolia': 'mn',
  
  // Asia - Southeast
  'singapore': 'sg',
  'thailand': 'th',
  'indonesia': 'id',
  'malaysia': 'my',
  'vietnam': 'vn',
  'philippines': 'ph',
  'cambodia': 'kh',
  'myanmar': 'mm', 'burma': 'mm',
  'laos': 'la',
  'brunei': 'bn',
  'timor-leste': 'tl', 'east timor': 'tl',
  
  // Asia - South
  'india': 'in',
  'pakistan': 'pk',
  'bangladesh': 'bd',
  'sri lanka': 'lk',
  'nepal': 'np',
  'maldives': 'mv',
  'bhutan': 'bt',
  'afghanistan': 'af',
  
  // Asia - Central
  'kazakhstan': 'kz',
  'uzbekistan': 'uz',
  'turkmenistan': 'tm',
  'kyrgyzstan': 'kg',
  'tajikistan': 'tj',
  'azerbaijan': 'az',
  'georgia': 'ge',
  'armenia': 'am',
  
  // Oceania
  'australia': 'au',
  'new zealand': 'nz',
  'fiji': 'fj',
  'papua new guinea': 'pg',
  'new caledonia': 'nc',
  'french polynesia': 'pf',
  'samoa': 'ws',
  'tonga': 'to',
  'vanuatu': 'vu',
  'solomon islands': 'sb',
  'micronesia': 'fm',
  'palau': 'pw',
  'marshall islands': 'mh',
  'kiribati': 'ki',
  'nauru': 'nr',
  'tuvalu': 'tv',
  'cook islands': 'ck',
  'niue': 'nu',
  'american samoa': 'as',
  'northern mariana islands': 'mp',
  
  // Middle East
  'uae': 'ae', 'united arab emirates': 'ae',
  'saudi arabia': 'sa',
  'turkey': 'tr', 'türkiye': 'tr',
  'israel': 'il',
  'qatar': 'qa',
  'kuwait': 'kw',
  'bahrain': 'bh',
  'oman': 'om',
  'jordan': 'jo',
  'lebanon': 'lb',
  'iraq': 'iq',
  'iran': 'ir',
  'syria': 'sy',
  'yemen': 'ye',
  'palestine': 'ps', 'palestinian territory': 'ps',
  
  // Africa - North
  'egypt': 'eg',
  'morocco': 'ma',
  'algeria': 'dz',
  'tunisia': 'tn',
  'libya': 'ly',
  'sudan': 'sd',
  'south sudan': 'ss',
  
  // Africa - West
  'nigeria': 'ng',
  'ghana': 'gh',
  'senegal': 'sn',
  'ivory coast': 'ci', "cote d'ivoire": 'ci', 'côte d\'ivoire': 'ci',
  'cameroon': 'cm',
  'mali': 'ml',
  'burkina faso': 'bf',
  'niger': 'ne',
  'guinea': 'gn',
  'benin': 'bj',
  'togo': 'tg',
  'sierra leone': 'sl',
  'liberia': 'lr',
  'mauritania': 'mr',
  'gambia': 'gm', 'the gambia': 'gm',
  'guinea-bissau': 'gw',
  'cape verde': 'cv', 'cabo verde': 'cv',
  
  // Africa - East
  'kenya': 'ke',
  'ethiopia': 'et',
  'tanzania': 'tz',
  'uganda': 'ug',
  'rwanda': 'rw',
  'burundi': 'bi',
  'somalia': 'so',
  'eritrea': 'er',
  'djibouti': 'dj',
  'mauritius': 'mu',
  'seychelles': 'sc',
  'comoros': 'km',
  'madagascar': 'mg',
  'reunion': 're', 'réunion': 're',
  'mayotte': 'yt',
  
  // Africa - Central
  'democratic republic of the congo': 'cd', 'drc': 'cd', 'dr congo': 'cd',
  'republic of the congo': 'cg', 'congo': 'cg',
  'central african republic': 'cf',
  'chad': 'td',
  'gabon': 'ga',
  'equatorial guinea': 'gq',
  'sao tome and principe': 'st',
  
  // Africa - Southern
  'south africa': 'za',
  'namibia': 'na',
  'botswana': 'bw',
  'zimbabwe': 'zw',
  'zambia': 'zm',
  'malawi': 'mw',
  'mozambique': 'mz',
  'angola': 'ao',
  'lesotho': 'ls',
  'eswatini': 'sz', 'swaziland': 'sz',
  
  // ISO code shortcuts (for when API returns codes directly)
  'gb': 'gb', 'eu': 'eu', 'jp': 'jp', 'kr': 'kr', 'th': 'th',
  'sg': 'sg', 'au': 'au', 'ca': 'ca', 'de': 'de', 'fr': 'fr',
  'it': 'it', 'es': 'es', 'nl': 'nl', 'ch': 'ch', 'at': 'at',
  'be': 'be', 'pl': 'pl', 'pt': 'pt', 'se': 'se', 'no': 'no',
  'dk': 'dk', 'fi': 'fi', 'ie': 'ie', 'gr': 'gr', 'cz': 'cz',
  'ro': 'ro', 'hu': 'hu', 'nz': 'nz', 'mx': 'mx', 'br': 'br',
  'ar': 'ar', 'cl': 'cl', 'pe': 'pe', 'co': 'co', 'vn': 'vn',
  'my': 'my', 'id': 'id', 'ph': 'ph', 'tw': 'tw', 'hk': 'hk',
  'cn': 'cn', 'ae': 'ae', 'sa': 'sa', 'tr': 'tr', 'il': 'il',
  'qa': 'qa', 'za': 'za', 'eg': 'eg', 'ma': 'ma', 'ke': 'ke',
  'ng': 'ng', 'ru': 'ru', 'ua': 'ua', 'dz': 'dz', 'ad': 'ad',
  'ai': 'ai', 'ag': 'ag', 'bs': 'bs', 'bb': 'bb', 'by': 'by',
  'bh': 'bh', 'bd': 'bd', 'ec': 'ec', 've': 've', 'uy': 'uy',
  'py': 'py', 'bo': 'bo', 'gy': 'gy', 'sr': 'sr', 'gf': 'gf',
};

// Special region icons (non-country) - use 'iso' for flag images, 'icon' for emoji
type RegionInfo = { icon: string; isEmoji: true } | { iso: string; isEmoji: false };
const SPECIAL_REGIONS: Record<string, RegionInfo> = {
  'europe': { iso: 'eu', isEmoji: false },
  'european': { iso: 'eu', isEmoji: false },
  'eu': { iso: 'eu', isEmoji: false },
  'global': { icon: '🌍', isEmoji: true },
  'worldwide': { icon: '🌍', isEmoji: true },
  'world': { icon: '🌍', isEmoji: true },
  'asia': { icon: '🌏', isEmoji: true },
  'asia pacific': { icon: '🌏', isEmoji: true },
  'apac': { icon: '🌏', isEmoji: true },
  'americas': { icon: '🌎', isEmoji: true },
  'north america': { icon: '🌎', isEmoji: true },
  'south america': { icon: '🌎', isEmoji: true },
  'latin america': { icon: '🌎', isEmoji: true },
  'africa': { icon: '🌍', isEmoji: true },
  'middle east': { icon: '🌍', isEmoji: true },
  'caribbean': { icon: '🌴', isEmoji: true },
  'oceania': { icon: '🌏', isEmoji: true },
  'test': { icon: '🧪', isEmoji: true },
};

// Parse the eSIM name to extract country/region info
const parseEsimName = (name: string): { displayName: string; searchKey: string } => {
  // Remove common prefixes
  let cleaned = name
    .replace(/^esim\s*/i, '')
    .replace(/^e-sim\s*/i, '')
    .replace(/^data\s*/i, '')
    .trim();
  
  return {
    displayName: cleaned || name,
    searchKey: cleaned.toLowerCase(),
  };
};

// Get flag info for a region - returns either an image URL or emoji
const getRegionFlagInfo = (name: string): { type: 'image' | 'emoji'; value: string } => {
  const { searchKey } = parseEsimName(name);
  
  // Check special regions first
  for (const [key, info] of Object.entries(SPECIAL_REGIONS)) {
    if (searchKey === key || searchKey.includes(key)) {
      if (info.isEmoji) {
        return { type: 'emoji', value: info.icon };
      } else {
        return { type: 'image', value: getFlagUrl(info.iso) };
      }
    }
  }
  
  // Try to find ISO code
  // First check direct ISO code match (e.g., "GB", "US")
  const words = searchKey.split(/\s+/);
  for (const word of words) {
    if (word.length === 2 && NAME_TO_ISO[word]) {
      return { type: 'image', value: getFlagUrl(NAME_TO_ISO[word]) };
    }
  }
  
  // Check country name matches
  for (const [countryKey, iso] of Object.entries(NAME_TO_ISO)) {
    if (countryKey.length > 2 && (searchKey.includes(countryKey) || countryKey.includes(searchKey))) {
      return { type: 'image', value: getFlagUrl(iso) };
    }
  }
  
  // Default
  return { type: 'emoji', value: '📶' };
};

// Component to render flag
const RegionFlag: React.FC<{ name: string; size?: number }> = ({ name, size = 24 }) => {
  const flagInfo = getRegionFlagInfo(name);
  
  if (flagInfo.type === 'image') {
    return (
      <img 
        src={flagInfo.value} 
        alt="" 
        className="esim-flag-img"
        style={{ width: size, height: Math.round(size * 0.75) }}
        onError={(e) => {
          // Fallback to emoji on error
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          target.parentElement?.classList.add('esim-flag-fallback');
        }}
      />
    );
  }
  
  return <span className="esim-flag-emoji" style={{ fontSize: size }}>{flagInfo.value}</span>;
};

// Parse plan details from type string
const parsePlanDetails = (planType: string): { data: string; duration: string; raw: string } => {
  const lower = planType.toLowerCase();
  
  // Common patterns: "7GB 30 Days", "Unlimited 7 Days", "3GB 15 Days"
  const dataMatch = planType.match(/(\d+\s*(?:GB|MB|TB)|Unlimited)/i);
  const durationMatch = planType.match(/(\d+)\s*(?:Days?|day)/i);
  
  return {
    data: dataMatch ? dataMatch[1].toUpperCase() : 'Data',
    duration: durationMatch ? `${durationMatch[1]} Days` : 'Flexible',
    raw: planType,
  };
};

// Get color based on data amount
const getPlanColor = (planType: string): string => {
  const lower = planType.toLowerCase();
  if (lower.includes('unlimited')) return '#22c55e';
  const gbMatch = lower.match(/(\d+)\s*gb/i);
  if (gbMatch) {
    const gb = parseInt(gbMatch[1]);
    if (gb >= 20) return '#22c55e';
    if (gb >= 10) return '#3b82f6';
    if (gb >= 5) return '#8b5cf6';
    return '#f59e0b';
  }
  return '#6b7280';
};

const StoreESim: React.FC<StoreESimProps> = ({ walletState, onUnlockWallet, onBuyAinti }) => {
  const [view, setView] = useState<ESimView>('browse');
  const [esimNames, setEsimNames] = useState<string[]>([]);
  const [planTypes, setPlanTypes] = useState<PlanType[]>([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedCurrency] = useState<'sol'>('sol');
  const [activeCategory, setActiveCategory] = useState<string | null>('Americas');

  // Fetch eSIM names on mount
  useEffect(() => {
    fetchESimNames();
  }, []);

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

  // Separate popular and other regions
  const { popularRegions, otherRegions, categorizedRegions } = useMemo(() => {
    const popular: string[] = [];
    const other: string[] = [];
    const categorized: Record<string, string[]> = {};
    
    POPULAR_REGIONS.forEach(region => {
      if (esimNames.some(name => name.toLowerCase().includes(region.toLowerCase()))) {
        const match = esimNames.find(name => name.toLowerCase().includes(region.toLowerCase()));
        if (match && !popular.includes(match)) {
          popular.push(match);
        }
      }
    });
    
    // Categorize remaining regions
    Object.entries(REGION_CATEGORIES).forEach(([category, regions]) => {
      categorized[category] = esimNames.filter(name => 
        regions.some(r => name.toLowerCase().includes(r.toLowerCase())) &&
        !popular.includes(name)
      );
    });
    
    // Everything else
    esimNames.forEach(name => {
      if (!popular.includes(name) && !Object.values(categorized).flat().includes(name)) {
        other.push(name);
      }
    });
    
    return { popularRegions: popular, otherRegions: other, categorizedRegions: categorized };
  }, [esimNames]);

  // Filter regions based on search
  const filteredRegions = useMemo(() => {
    if (!searchQuery.trim()) {
      return esimNames;
    }
    const query = searchQuery.toLowerCase();
    return esimNames.filter(name => name.toLowerCase().includes(query));
  }, [esimNames, searchQuery]);

  // Get selected plan details
  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) return null;
    return planTypes.find((p) => p.id === selectedPlanId) || null;
  }, [planTypes, selectedPlanId]);

  const handleSelectRegion = useCallback((name: string) => {
    setSelectedName(name);
    setSelectedPlanId('');
    setPlanTypes([]);
    setView('plans');
    fetchPlanTypes(name);
  }, []);

  const handleBack = useCallback(() => {
    if (view === 'plans') {
      setView('browse');
      setSelectedName('');
      setSelectedPlanId('');
      setPlanTypes([]);
    }
  }, [view]);

  const handleBuy = () => {
    if (!selectedName || !selectedPlan) return;
    setView('payment');
  };

  const handlePaymentSuccess = () => {
    setView('browse');
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
        onBack={() => setView('plans')}
        onSuccess={handlePaymentSuccess}
        onBuyAinti={onBuyAinti}
      />
    );
  }

  // Render plans view
  if (view === 'plans') {
    return (
      <div className="esim-plans">
        {/* Header with back button */}
        <div className="esim-plans-header">
          <button className="esim-back-btn" onClick={handleBack} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="esim-plans-title-group">
            <span className="esim-plans-flag"><RegionFlag name={selectedName} size={24} /></span>
            <h3 className="esim-plans-title">{parseEsimName(selectedName).displayName}</h3>
          </div>
          <div style={{ width: 32 }} />
        </div>

        {/* Loading state */}
        {loadingPlans && (
          <div className="esim-plans-loading">
            <div className="esim-loading-spinner" />
            <span>Loading plans...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loadingPlans && (
          <div className="esim-plans-error">
            <span>⚠️ {error}</span>
            <button onClick={() => fetchPlanTypes(selectedName)} type="button">
              Retry
            </button>
          </div>
        )}

        {/* No plans */}
        {!loadingPlans && !error && planTypes.length === 0 && (
          <div className="esim-no-plans">
            <div className="esim-no-plans-icon">📵</div>
            <span>No plans available for this region</span>
            <button className="esim-back-link" onClick={handleBack} type="button">
              Browse other regions
            </button>
          </div>
        )}

        {/* Plans grid */}
        {!loadingPlans && planTypes.length > 0 && (
          <>
            <div className="esim-plans-grid">
              {planTypes.map((plan) => {
                const details = parsePlanDetails(plan.type);
                const isSelected = plan.id === selectedPlanId;
                const color = getPlanColor(plan.type);
                
                return (
                  <button
                    key={plan.id}
                    className={`esim-plan-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    type="button"
                  >
                    <div className="esim-plan-data" style={{ color }}>
                      {details.data}
                    </div>
                    <div className="esim-plan-duration">
                      {details.duration}
                    </div>
                    <div className="esim-plan-type">
                      {details.raw}
                    </div>
                    <div className="esim-plan-price">
                      ${plan.price.toFixed(2)}
                    </div>
                    {isSelected && (
                      <div className="esim-plan-check">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected plan summary */}
            {selectedPlan && (
              <div className="esim-plan-summary">
                <div className="esim-summary-row">
                  <span className="esim-summary-label">Region</span>
                  <span className="esim-summary-value esim-summary-region">
                    <RegionFlag name={selectedName} size={16} /> {parseEsimName(selectedName).displayName}
                  </span>
                </div>
                <div className="esim-summary-row">
                  <span className="esim-summary-label">Plan</span>
                  <span className="esim-summary-value">{selectedPlan.type}</span>
                </div>
                <div className="esim-summary-row esim-summary-total">
                  <span className="esim-summary-label">Total</span>
                  <span className="esim-summary-value">${selectedPlan.price.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Wallet Status */}
            {!walletState && (
              <div className="esim-wallet-locked">
                <div className="esim-wallet-locked-icon">🔒</div>
                <div className="esim-wallet-locked-text">
                  <strong>Wallet Locked</strong>
                  <span>Unlock your wallet to purchase</span>
                </div>
                {onUnlockWallet && (
                  <button className="esim-unlock-btn" onClick={onUnlockWallet} type="button">
                    Unlock
                  </button>
                )}
              </div>
            )}

            {/* Buy Button */}
            <button
              className="esim-buy-btn"
              onClick={handleBuy}
              disabled={!selectedPlan || !walletState}
              type="button"
            >
              <span className="esim-buy-btn-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </span>
              Pay ${selectedPlan?.price.toFixed(2) || '0.00'} with AINTI (Solana)
            </button>
          </>
        )}
      </div>
    );
  }

  // Loading state
  if (loadingNames) {
    return (
      <div className="esim-container">
        <div className="esim-loading">
          <div className="esim-loading-spinner" />
          <span>Loading destinations...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="esim-container">
        <div className="esim-error">
          <div className="esim-error-icon">⚠️</div>
          <span>{error}</span>
          <button className="esim-retry-btn" onClick={fetchESimNames} type="button">
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

  // Browse view
  return (
    <div className="esim-container">
      {/* Hero Banner */}
      <div className="esim-hero">
        <div className="esim-hero-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <div className="esim-hero-text">
          <h3>Stay Connected Worldwide</h3>
          <p>Instant eSIM delivery • {esimNames.length}+ destinations</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="esim-search-wrapper">
        <svg className="esim-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="esim-search-input"
          placeholder="Search countries or regions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button 
            className="esim-search-clear" 
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
        <div className="esim-section">
          <h4 className="esim-section-title">
            {filteredRegions.length} result{filteredRegions.length !== 1 ? 's' : ''}
          </h4>
          <div className="esim-regions-list">
            {filteredRegions.map((name) => (
              <button
                key={name}
                className="esim-region-item"
                onClick={() => handleSelectRegion(name)}
                type="button"
              >
                <span className="esim-region-flag"><RegionFlag name={name} size={24} /></span>
                <span className="esim-region-name">{parseEsimName(name).displayName}</span>
                <svg className="esim-region-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
          {filteredRegions.length === 0 && (
            <div className="esim-no-results">
              <span>No destinations found for "{searchQuery}"</span>
              <button onClick={() => setSearchQuery('')} type="button">
                Clear Search
              </button>
            </div>
          )}
        </div>
      )}

      {/* Popular Destinations */}
      {!searchQuery && popularRegions.length > 0 && (
        <div className="esim-section">
          <h4 className="esim-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Popular Destinations
          </h4>
          <div className="esim-popular-grid">
            {popularRegions.slice(0, 8).map((name) => (
              <button
                key={name}
                className="esim-popular-card"
                onClick={() => handleSelectRegion(name)}
                type="button"
              >
                <span className="esim-popular-flag"><RegionFlag name={name} size={28} /></span>
                <span className="esim-popular-name">{parseEsimName(name).displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category Pills */}
      {!searchQuery && (
        <div className="esim-categories">
          {Object.keys(categorizedRegions).map((category) => (
            categorizedRegions[category].length > 0 && (
              <button
                key={category}
                className={`esim-category-pill ${activeCategory === category ? 'active' : ''}`}
                onClick={() => setActiveCategory(category)}
                type="button"
              >
                {category}
                <span className="esim-category-count">{categorizedRegions[category].length}</span>
              </button>
            )
          ))}
          {otherRegions.length > 0 && (
            <button
              className={`esim-category-pill ${activeCategory === 'Other' ? 'active' : ''}`}
              onClick={() => setActiveCategory('Other')}
              type="button"
            >
              Other
              <span className="esim-category-count">{otherRegions.length}</span>
            </button>
          )}
        </div>
      )}

      {/* Categorized Regions */}
      {!searchQuery && activeCategory && categorizedRegions[activeCategory] && (
        <div className="esim-section">
          <h4 className="esim-section-title">{activeCategory}</h4>
          <div className="esim-regions-list">
            {categorizedRegions[activeCategory].map((name) => (
              <button
                key={name}
                className="esim-region-item"
                onClick={() => handleSelectRegion(name)}
                type="button"
              >
                <span className="esim-region-flag"><RegionFlag name={name} size={24} /></span>
                <span className="esim-region-name">{parseEsimName(name).displayName}</span>
                <svg className="esim-region-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Other Regions (countries not in any category) */}
      {!searchQuery && activeCategory === 'Other' && otherRegions.length > 0 && (
        <div className="esim-section">
          <h4 className="esim-section-title">Other Destinations</h4>
          <div className="esim-regions-list">
            {otherRegions.map((name) => (
              <button
                key={name}
                className="esim-region-item"
                onClick={() => handleSelectRegion(name)}
                type="button"
              >
                <span className="esim-region-flag"><RegionFlag name={name} size={24} /></span>
                <span className="esim-region-name">{parseEsimName(name).displayName}</span>
                <svg className="esim-region-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreESim;
