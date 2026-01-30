/**
 * Comprehensive countries data file matching the website's structure
 * Used for gift card country selection with ISO codes for flag display
 */

export interface Country {
  value: string;      // Country name (used as key)
  label: string;      // Display name
  code: string;       // ISO 3166-1 alpha-2 code
}

// Full list of 226 countries - matches website data
export const countries: Country[] = [
  { value: 'Afghanistan', label: 'Afghanistan', code: 'AF' },
  { value: 'Albania', label: 'Albania', code: 'AL' },
  { value: 'Algeria', label: 'Algeria', code: 'DZ' },
  { value: 'Andorra', label: 'Andorra', code: 'AD' },
  { value: 'Angola', label: 'Angola', code: 'AO' },
  { value: 'Antigua and Barbuda', label: 'Antigua and Barbuda', code: 'AG' },
  { value: 'Argentina', label: 'Argentina', code: 'AR' },
  { value: 'Armenia', label: 'Armenia', code: 'AM' },
  { value: 'Australia', label: 'Australia', code: 'AU' },
  { value: 'Austria', label: 'Austria', code: 'AT' },
  { value: 'Azerbaijan', label: 'Azerbaijan', code: 'AZ' },
  { value: 'Bahamas', label: 'Bahamas', code: 'BS' },
  { value: 'Bahrain', label: 'Bahrain', code: 'BH' },
  { value: 'Bangladesh', label: 'Bangladesh', code: 'BD' },
  { value: 'Barbados', label: 'Barbados', code: 'BB' },
  { value: 'Belarus', label: 'Belarus', code: 'BY' },
  { value: 'Belgium', label: 'Belgium', code: 'BE' },
  { value: 'Belize', label: 'Belize', code: 'BZ' },
  { value: 'Benin', label: 'Benin', code: 'BJ' },
  { value: 'Bhutan', label: 'Bhutan', code: 'BT' },
  { value: 'Bolivia', label: 'Bolivia', code: 'BO' },
  { value: 'Bosnia and Herzegovina', label: 'Bosnia and Herzegovina', code: 'BA' },
  { value: 'Botswana', label: 'Botswana', code: 'BW' },
  { value: 'Brazil', label: 'Brazil', code: 'BR' },
  { value: 'Brunei', label: 'Brunei', code: 'BN' },
  { value: 'Bulgaria', label: 'Bulgaria', code: 'BG' },
  { value: 'Burkina Faso', label: 'Burkina Faso', code: 'BF' },
  { value: 'Burundi', label: 'Burundi', code: 'BI' },
  { value: 'Cabo Verde', label: 'Cabo Verde', code: 'CV' },
  { value: 'Cambodia', label: 'Cambodia', code: 'KH' },
  { value: 'Cameroon', label: 'Cameroon', code: 'CM' },
  { value: 'Canada', label: 'Canada', code: 'CA' },
  { value: 'Central African Republic', label: 'Central African Republic', code: 'CF' },
  { value: 'Chad', label: 'Chad', code: 'TD' },
  { value: 'Chile', label: 'Chile', code: 'CL' },
  { value: 'China', label: 'China', code: 'CN' },
  { value: 'Colombia', label: 'Colombia', code: 'CO' },
  { value: 'Comoros', label: 'Comoros', code: 'KM' },
  { value: 'Congo, Democratic Republic of the', label: 'DR Congo', code: 'CD' },
  { value: 'Congo, Republic of the', label: 'Republic of Congo', code: 'CG' },
  { value: 'Costa Rica', label: 'Costa Rica', code: 'CR' },
  { value: "Côte d'Ivoire", label: "Côte d'Ivoire", code: 'CI' },
  { value: 'Croatia', label: 'Croatia', code: 'HR' },
  { value: 'Cuba', label: 'Cuba', code: 'CU' },
  { value: 'Cyprus', label: 'Cyprus', code: 'CY' },
  { value: 'Czech Republic', label: 'Czech Republic', code: 'CZ' },
  { value: 'Denmark', label: 'Denmark', code: 'DK' },
  { value: 'Djibouti', label: 'Djibouti', code: 'DJ' },
  { value: 'Dominica', label: 'Dominica', code: 'DM' },
  { value: 'Dominican Republic', label: 'Dominican Republic', code: 'DO' },
  { value: 'East Timor', label: 'East Timor', code: 'TL' },
  { value: 'Ecuador', label: 'Ecuador', code: 'EC' },
  { value: 'Egypt', label: 'Egypt', code: 'EG' },
  { value: 'El Salvador', label: 'El Salvador', code: 'SV' },
  { value: 'Equatorial Guinea', label: 'Equatorial Guinea', code: 'GQ' },
  { value: 'Eritrea', label: 'Eritrea', code: 'ER' },
  { value: 'Estonia', label: 'Estonia', code: 'EE' },
  { value: 'Eswatini', label: 'Eswatini', code: 'SZ' },
  { value: 'Ethiopia', label: 'Ethiopia', code: 'ET' },
  { value: 'Fiji', label: 'Fiji', code: 'FJ' },
  { value: 'Finland', label: 'Finland', code: 'FI' },
  { value: 'France', label: 'France', code: 'FR' },
  { value: 'Gabon', label: 'Gabon', code: 'GA' },
  { value: 'Gambia', label: 'Gambia', code: 'GM' },
  { value: 'Georgia', label: 'Georgia', code: 'GE' },
  { value: 'Germany', label: 'Germany', code: 'DE' },
  { value: 'Ghana', label: 'Ghana', code: 'GH' },
  { value: 'Greece', label: 'Greece', code: 'GR' },
  { value: 'Grenada', label: 'Grenada', code: 'GD' },
  { value: 'Guatemala', label: 'Guatemala', code: 'GT' },
  { value: 'Guinea', label: 'Guinea', code: 'GN' },
  { value: 'Guinea-Bissau', label: 'Guinea-Bissau', code: 'GW' },
  { value: 'Guyana', label: 'Guyana', code: 'GY' },
  { value: 'Haiti', label: 'Haiti', code: 'HT' },
  { value: 'Honduras', label: 'Honduras', code: 'HN' },
  { value: 'Hong Kong', label: 'Hong Kong', code: 'HK' },
  { value: 'Hungary', label: 'Hungary', code: 'HU' },
  { value: 'Iceland', label: 'Iceland', code: 'IS' },
  { value: 'India', label: 'India', code: 'IN' },
  { value: 'Indonesia', label: 'Indonesia', code: 'ID' },
  { value: 'Iran', label: 'Iran', code: 'IR' },
  { value: 'Iraq', label: 'Iraq', code: 'IQ' },
  { value: 'Ireland', label: 'Ireland', code: 'IE' },
  { value: 'Israel', label: 'Israel', code: 'IL' },
  { value: 'Italy', label: 'Italy', code: 'IT' },
  { value: 'Jamaica', label: 'Jamaica', code: 'JM' },
  { value: 'Japan', label: 'Japan', code: 'JP' },
  { value: 'Jordan', label: 'Jordan', code: 'JO' },
  { value: 'Kazakhstan', label: 'Kazakhstan', code: 'KZ' },
  { value: 'Kenya', label: 'Kenya', code: 'KE' },
  { value: 'Kiribati', label: 'Kiribati', code: 'KI' },
  { value: 'Korea, North', label: 'North Korea', code: 'KP' },
  { value: 'Korea, South', label: 'South Korea', code: 'KR' },
  { value: 'Kosovo', label: 'Kosovo', code: 'XK' },
  { value: 'Kuwait', label: 'Kuwait', code: 'KW' },
  { value: 'Kyrgyzstan', label: 'Kyrgyzstan', code: 'KG' },
  { value: 'Laos', label: 'Laos', code: 'LA' },
  { value: 'Latvia', label: 'Latvia', code: 'LV' },
  { value: 'Lebanon', label: 'Lebanon', code: 'LB' },
  { value: 'Lesotho', label: 'Lesotho', code: 'LS' },
  { value: 'Liberia', label: 'Liberia', code: 'LR' },
  { value: 'Libya', label: 'Libya', code: 'LY' },
  { value: 'Liechtenstein', label: 'Liechtenstein', code: 'LI' },
  { value: 'Lithuania', label: 'Lithuania', code: 'LT' },
  { value: 'Luxembourg', label: 'Luxembourg', code: 'LU' },
  { value: 'Macau', label: 'Macau', code: 'MO' },
  { value: 'Madagascar', label: 'Madagascar', code: 'MG' },
  { value: 'Malawi', label: 'Malawi', code: 'MW' },
  { value: 'Malaysia', label: 'Malaysia', code: 'MY' },
  { value: 'Maldives', label: 'Maldives', code: 'MV' },
  { value: 'Mali', label: 'Mali', code: 'ML' },
  { value: 'Malta', label: 'Malta', code: 'MT' },
  { value: 'Marshall Islands', label: 'Marshall Islands', code: 'MH' },
  { value: 'Mauritania', label: 'Mauritania', code: 'MR' },
  { value: 'Mauritius', label: 'Mauritius', code: 'MU' },
  { value: 'Mexico', label: 'Mexico', code: 'MX' },
  { value: 'Micronesia', label: 'Micronesia', code: 'FM' },
  { value: 'Moldova', label: 'Moldova', code: 'MD' },
  { value: 'Monaco', label: 'Monaco', code: 'MC' },
  { value: 'Mongolia', label: 'Mongolia', code: 'MN' },
  { value: 'Montenegro', label: 'Montenegro', code: 'ME' },
  { value: 'Morocco', label: 'Morocco', code: 'MA' },
  { value: 'Mozambique', label: 'Mozambique', code: 'MZ' },
  { value: 'Myanmar', label: 'Myanmar', code: 'MM' },
  { value: 'Namibia', label: 'Namibia', code: 'NA' },
  { value: 'Nauru', label: 'Nauru', code: 'NR' },
  { value: 'Nepal', label: 'Nepal', code: 'NP' },
  { value: 'Netherlands', label: 'Netherlands', code: 'NL' },
  { value: 'New Zealand', label: 'New Zealand', code: 'NZ' },
  { value: 'Nicaragua', label: 'Nicaragua', code: 'NI' },
  { value: 'Niger', label: 'Niger', code: 'NE' },
  { value: 'Nigeria', label: 'Nigeria', code: 'NG' },
  { value: 'North Macedonia', label: 'North Macedonia', code: 'MK' },
  { value: 'Norway', label: 'Norway', code: 'NO' },
  { value: 'Oman', label: 'Oman', code: 'OM' },
  { value: 'Pakistan', label: 'Pakistan', code: 'PK' },
  { value: 'Palau', label: 'Palau', code: 'PW' },
  { value: 'Palestine', label: 'Palestine', code: 'PS' },
  { value: 'Panama', label: 'Panama', code: 'PA' },
  { value: 'Papua New Guinea', label: 'Papua New Guinea', code: 'PG' },
  { value: 'Paraguay', label: 'Paraguay', code: 'PY' },
  { value: 'Peru', label: 'Peru', code: 'PE' },
  { value: 'Philippines', label: 'Philippines', code: 'PH' },
  { value: 'Poland', label: 'Poland', code: 'PL' },
  { value: 'Portugal', label: 'Portugal', code: 'PT' },
  { value: 'Puerto Rico', label: 'Puerto Rico', code: 'PR' },
  { value: 'Qatar', label: 'Qatar', code: 'QA' },
  { value: 'Romania', label: 'Romania', code: 'RO' },
  { value: 'Russia', label: 'Russia', code: 'RU' },
  { value: 'Rwanda', label: 'Rwanda', code: 'RW' },
  { value: 'Saint Kitts and Nevis', label: 'Saint Kitts and Nevis', code: 'KN' },
  { value: 'Saint Lucia', label: 'Saint Lucia', code: 'LC' },
  { value: 'Saint Vincent and the Grenadines', label: 'Saint Vincent', code: 'VC' },
  { value: 'Samoa', label: 'Samoa', code: 'WS' },
  { value: 'San Marino', label: 'San Marino', code: 'SM' },
  { value: 'Sao Tome and Principe', label: 'São Tomé and Príncipe', code: 'ST' },
  { value: 'Saudi Arabia', label: 'Saudi Arabia', code: 'SA' },
  { value: 'Senegal', label: 'Senegal', code: 'SN' },
  { value: 'Serbia', label: 'Serbia', code: 'RS' },
  { value: 'Seychelles', label: 'Seychelles', code: 'SC' },
  { value: 'Sierra Leone', label: 'Sierra Leone', code: 'SL' },
  { value: 'Singapore', label: 'Singapore', code: 'SG' },
  { value: 'Slovakia', label: 'Slovakia', code: 'SK' },
  { value: 'Slovenia', label: 'Slovenia', code: 'SI' },
  { value: 'Solomon Islands', label: 'Solomon Islands', code: 'SB' },
  { value: 'Somalia', label: 'Somalia', code: 'SO' },
  { value: 'South Africa', label: 'South Africa', code: 'ZA' },
  { value: 'South Sudan', label: 'South Sudan', code: 'SS' },
  { value: 'Spain', label: 'Spain', code: 'ES' },
  { value: 'Sri Lanka', label: 'Sri Lanka', code: 'LK' },
  { value: 'Sudan', label: 'Sudan', code: 'SD' },
  { value: 'Suriname', label: 'Suriname', code: 'SR' },
  { value: 'Sweden', label: 'Sweden', code: 'SE' },
  { value: 'Switzerland', label: 'Switzerland', code: 'CH' },
  { value: 'Syria', label: 'Syria', code: 'SY' },
  { value: 'Taiwan', label: 'Taiwan', code: 'TW' },
  { value: 'Tajikistan', label: 'Tajikistan', code: 'TJ' },
  { value: 'Tanzania', label: 'Tanzania', code: 'TZ' },
  { value: 'Thailand', label: 'Thailand', code: 'TH' },
  { value: 'Togo', label: 'Togo', code: 'TG' },
  { value: 'Tonga', label: 'Tonga', code: 'TO' },
  { value: 'Trinidad and Tobago', label: 'Trinidad and Tobago', code: 'TT' },
  { value: 'Tunisia', label: 'Tunisia', code: 'TN' },
  { value: 'Turkey', label: 'Turkey', code: 'TR' },
  { value: 'Turkmenistan', label: 'Turkmenistan', code: 'TM' },
  { value: 'Tuvalu', label: 'Tuvalu', code: 'TV' },
  { value: 'Uganda', label: 'Uganda', code: 'UG' },
  { value: 'Ukraine', label: 'Ukraine', code: 'UA' },
  { value: 'United Arab Emirates', label: 'UAE', code: 'AE' },
  { value: 'United Kingdom', label: 'United Kingdom', code: 'GB' },
  { value: 'United States', label: 'United States', code: 'US' },
  { value: 'Uruguay', label: 'Uruguay', code: 'UY' },
  { value: 'Uzbekistan', label: 'Uzbekistan', code: 'UZ' },
  { value: 'Vanuatu', label: 'Vanuatu', code: 'VU' },
  { value: 'Vatican City', label: 'Vatican City', code: 'VA' },
  { value: 'Venezuela', label: 'Venezuela', code: 'VE' },
  { value: 'Vietnam', label: 'Vietnam', code: 'VN' },
  { value: 'Yemen', label: 'Yemen', code: 'YE' },
  { value: 'Zambia', label: 'Zambia', code: 'ZM' },
  { value: 'Zimbabwe', label: 'Zimbabwe', code: 'ZW' },
  // Special entries
  { value: 'Global', label: 'Global', code: 'UN' },
  { value: 'Worldwide', label: 'Worldwide', code: 'UN' },
  { value: 'Europe', label: 'Europe', code: 'EU' },
  { value: 'European Union', label: 'European Union', code: 'EU' },
];

// Create lookup maps for quick access
const countryByValue = new Map<string, Country>();
const countryByCode = new Map<string, Country>();
const countryByLowerValue = new Map<string, Country>();

countries.forEach((country) => {
  countryByValue.set(country.value, country);
  countryByCode.set(country.code, country);
  countryByLowerValue.set(country.value.toLowerCase(), country);
});

// Common aliases for country names (maps alternative names to standard value)
const COUNTRY_ALIASES: Record<string, string> = {
  // US variants
  'usa': 'United States',
  'us': 'United States',
  'america': 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  
  // UK variants
  'uk': 'United Kingdom',
  'great britain': 'United Kingdom',
  'england': 'United Kingdom',
  'britain': 'United Kingdom',
  
  // UAE variants
  'uae': 'United Arab Emirates',
  'emirates': 'United Arab Emirates',
  
  // Korea variants
  'south korea': 'Korea, South',
  'korea': 'Korea, South',
  'north korea': 'Korea, North',
  
  // Other common aliases
  'holland': 'Netherlands',
  'czechia': 'Czech Republic',
  'burma': 'Myanmar',
  'ivory coast': "Côte d'Ivoire",
  'cote d\'ivoire': "Côte d'Ivoire",
  'east timor': 'East Timor',
  'timor-leste': 'East Timor',
  'swaziland': 'Eswatini',
  'cape verde': 'Cabo Verde',
  'dr congo': 'Congo, Democratic Republic of the',
  'drc': 'Congo, Democratic Republic of the',
  'democratic republic of congo': 'Congo, Democratic Republic of the',
  'republic of congo': 'Congo, Republic of the',
  'congo': 'Congo, Republic of the',
  'russia': 'Russia',
  'russian federation': 'Russia',
  'macedonia': 'North Macedonia',
  'macao': 'Macau',
  'taiwan': 'Taiwan',
  'republic of china': 'Taiwan',
  'trinidad': 'Trinidad and Tobago',
  'gambia': 'Gambia',
  'the gambia': 'Gambia',
  'bahamas': 'Bahamas',
  'the bahamas': 'Bahamas',
  'international': 'Global',
  'world': 'Global',
  'worldwide': 'Worldwide',
};

/**
 * Get country by value (exact or alias match)
 */
export function getCountryByValue(value: string): Country | undefined {
  const normalized = value.toLowerCase().trim();
  
  // Check direct match
  const direct = countryByLowerValue.get(normalized);
  if (direct) return direct;
  
  // Check aliases
  const aliasValue = COUNTRY_ALIASES[normalized];
  if (aliasValue) {
    return countryByLowerValue.get(aliasValue.toLowerCase());
  }
  
  // Partial match (for cases like "United States of America")
  for (const [key, country] of countryByLowerValue) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return country;
    }
  }
  
  return undefined;
}

/**
 * Get country by ISO code
 */
export function getCountryByCode(code: string): Country | undefined {
  return countryByCode.get(code.toUpperCase());
}

/**
 * Get ISO code for a country name (handles aliases)
 */
export function getCountryCode(countryName: string): string | undefined {
  const country = getCountryByValue(countryName);
  return country?.code;
}

/**
 * Get flag URL for a country
 */
export function getFlagUrl(countryOrCode: string, size: 'w20' | 'w40' | 'w80' | 'w160' = 'w40'): string {
  // Check if it's already an ISO code (2 letters)
  let code: string | undefined;
  
  if (countryOrCode.length === 2) {
    code = countryOrCode;
  } else {
    code = getCountryCode(countryOrCode);
  }
  
  if (!code) return '';
  
  // Handle special codes
  if (code === 'UN') {
    // Use UN flag for global
    return `https://flagcdn.com/${size}/un.png`;
  }
  if (code === 'EU') {
    // Use EU flag for Europe
    return `https://flagcdn.com/${size}/eu.png`;
  }
  
  return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`;
}

/**
 * Popular countries for quick access (ordered by usage)
 */
export const POPULAR_COUNTRIES: Country[] = [
  countries.find(c => c.value === 'United States')!,
  countries.find(c => c.value === 'United Kingdom')!,
  countries.find(c => c.value === 'Canada')!,
  countries.find(c => c.value === 'Australia')!,
  countries.find(c => c.value === 'Germany')!,
  countries.find(c => c.value === 'France')!,
  countries.find(c => c.value === 'Japan')!,
  countries.find(c => c.value === 'Global')!,
].filter(Boolean);

/**
 * Region groupings for country organization
 */
export const REGIONS: Record<string, string[]> = {
  'Americas': [
    'United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Colombia',
    'Chile', 'Peru', 'Ecuador', 'Venezuela', 'Uruguay', 'Paraguay', 'Bolivia',
    'Costa Rica', 'Panama', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua',
    'Cuba', 'Dominican Republic', 'Puerto Rico', 'Jamaica', 'Trinidad and Tobago',
    'Bahamas', 'Barbados', 'Haiti', 'Guyana', 'Suriname', 'Belize',
  ],
  'Europe': [
    'United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands',
    'Switzerland', 'Poland', 'Sweden', 'Belgium', 'Austria', 'Ireland',
    'Portugal', 'Denmark', 'Norway', 'Finland', 'Czech Republic', 'Romania',
    'Hungary', 'Greece', 'Ukraine', 'Croatia', 'Slovakia', 'Slovenia',
    'Bulgaria', 'Serbia', 'Lithuania', 'Latvia', 'Estonia', 'Luxembourg',
    'Malta', 'Cyprus', 'Iceland', 'Montenegro', 'North Macedonia', 'Albania',
    'Bosnia and Herzegovina', 'Moldova', 'Belarus',
  ],
  'Asia Pacific': [
    'Japan', 'Korea, South', 'China', 'Australia', 'Singapore', 'Hong Kong',
    'Thailand', 'Indonesia', 'Malaysia', 'Philippines', 'Vietnam', 'India',
    'New Zealand', 'Taiwan', 'Bangladesh', 'Pakistan', 'Sri Lanka', 'Nepal',
    'Cambodia', 'Myanmar', 'Laos', 'Mongolia', 'Fiji', 'Maldives', 'Brunei',
    'Macau',
  ],
  'Middle East': [
    'United Arab Emirates', 'Saudi Arabia', 'Turkey', 'Israel', 'Qatar',
    'Kuwait', 'Bahrain', 'Oman', 'Jordan', 'Lebanon', 'Iraq', 'Iran',
    'Palestine', 'Syria', 'Yemen',
  ],
  'Africa': [
    'South Africa', 'Egypt', 'Morocco', 'Kenya', 'Nigeria', 'Ghana',
    'Tanzania', 'Ethiopia', 'Uganda', 'Rwanda', 'Senegal', "Côte d'Ivoire",
    'Cameroon', 'Algeria', 'Tunisia', 'Libya', 'Sudan', 'Angola', 'Mozambique',
    'Zimbabwe', 'Zambia', 'Botswana', 'Namibia', 'Mauritius', 'Madagascar',
  ],
};

/**
 * Get countries in a region that exist in our country list
 */
export function getCountriesInRegion(region: keyof typeof REGIONS): Country[] {
  const regionCountries = REGIONS[region];
  if (!regionCountries) return [];
  
  return regionCountries
    .map(name => getCountryByValue(name))
    .filter((c): c is Country => c !== undefined);
}

/**
 * Normalize a country name to our standard format
 * Returns the standardized country value or the original if no match
 */
export function normalizeCountryName(name: string): string {
  const country = getCountryByValue(name);
  return country?.value || name;
}

/**
 * Check if a country name matches another (handles aliases)
 */
export function countriesMatch(name1: string, name2: string): boolean {
  const country1 = getCountryByValue(name1);
  const country2 = getCountryByValue(name2);
  
  if (!country1 || !country2) return false;
  return country1.value === country2.value;
}
