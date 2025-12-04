/**
 * AINTIVIRUS Threat Intelligence - Bootstrap Data & Sources
 * 
 * Contains static fallback data used when remote sources are unavailable.
 * This data is the last-resort fallback and should be periodically updated
 * during extension releases.
 * 
 * MAINTENANCE NOTE: Update this file with new threats during each release.
 * Remote sources will override this data when available.
 */

import { ThreatIntelData } from './types';

// ============================================
// BOOTSTRAP LEGITIMATE DOMAINS
// ============================================

/**
 * Known legitimate Solana ecosystem domains
 * 
 * NOTE: This list is not exhaustive. Absence from this list
 * does NOT indicate a domain is malicious.
 */
export const BOOTSTRAP_LEGITIMATE_DOMAINS: string[] = [
  // Official
  'solana.com',
  'solana.org',
  'solscan.io',
  'explorer.solana.com',
  'docs.solana.com',
  'spl.solana.com',
  
  // Wallets
  'phantom.app',
  'phantom.com',
  'solflare.com',
  'backpack.app',
  'glow.app',
  
  // DEXs and DeFi
  'jup.ag',
  'jupiter.ag',
  'raydium.io',
  'orca.so',
  'marinade.finance',
  'marginfi.com',
  'kamino.finance',
  'drift.trade',
  'mango.markets',
  'solend.fi',
  
  // NFT Marketplaces
  'magiceden.io',
  'tensor.trade',
  'hyperspace.xyz',
  'exchange.art',
  'formfunction.xyz',
  
  // Infrastructure
  'helius.dev',
  'quicknode.com',
  'alchemy.com',
  'triton.one',
  
  // Other
  'metaplex.com',
  'dialect.io',
  'squads.so',
  'realms.today',
];

// ============================================
// BOOTSTRAP SCAM DOMAINS
// ============================================

/**
 * Known phishing/scam domains
 * 
 * This list is maintained based on community reports.
 * Remote sources provide more comprehensive coverage.
 */
export const BOOTSTRAP_SCAM_DOMAINS: string[] = [
  // Add known scam domains here as they are identified
  // This is intentionally sparse as remote sources should provide coverage
];

// ============================================
// BOOTSTRAP SUSPICIOUS TLDS
// ============================================

/**
 * TLDs commonly used in phishing attempts
 * 
 * NOTE: Many legitimate sites also use these TLDs.
 * This is just one signal among many.
 */
export const BOOTSTRAP_SUSPICIOUS_TLDS: string[] = [
  '.xyz',
  '.top',
  '.click',
  '.link',
  '.info',
  '.site',
  '.online',
  '.live',
  '.club',
  '.work',
  '.win',
  '.vip',
  '.fun',
  '.buzz',
  '.space',
  '.tech',
  '.store',
  '.shop',
  '.pro',
  '.guru',
  '.zone',
  '.pw',
  '.cc',
  '.tk',
  '.ml',
  '.ga',
  '.cf',
  '.gq',
];

// ============================================
// BOOTSTRAP HOMOGLYPH MAP
// ============================================

/**
 * Characters that look similar and are commonly substituted in phishing
 * 
 * LIMITATION: This map only covers common Latin/Cyrillic substitutions.
 * Many more Unicode homoglyphs exist that we cannot detect.
 */
export const BOOTSTRAP_HOMOGLYPH_MAP: Record<string, string[]> = {
  'a': ['а', 'ạ', 'ą', 'à', 'á', 'â', 'ã', 'ä', 'å', 'ā', '@'],
  'b': ['ḅ', 'ḃ', 'ƀ'],
  'c': ['с', 'ç', 'ć', 'č', 'ĉ'],
  'd': ['ḋ', 'ḍ', 'đ', 'ɗ'],
  'e': ['е', 'ẹ', 'ę', 'è', 'é', 'ê', 'ë', 'ē', '3'],
  'g': ['ģ', 'ğ', 'ĝ', 'ġ', '9'],
  'h': ['һ', 'ḥ', 'ĥ'],
  'i': ['і', 'ị', 'ì', 'í', 'î', 'ï', 'ī', '1', 'l', '!', '|'],
  'j': ['ј', 'ĵ'],
  'k': ['κ', 'ķ', 'ḳ'],
  'l': ['1', 'ł', 'ļ', 'ḷ', 'ḹ', 'i', '|', 'I'],
  'm': ['ṃ', 'ḿ', 'rn'],
  'n': ['ń', 'ņ', 'ň', 'ṇ', 'ñ'],
  'o': ['о', 'ọ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ō', '0'],
  'p': ['р', 'ṗ', 'ρ'],
  'q': ['ԛ', 'ɋ'],
  'r': ['ŕ', 'ř', 'ṛ', 'ṟ'],
  's': ['ṣ', 'ś', 'š', 'ş', '$', '5'],
  't': ['ṭ', 'ť', 'ţ', '+'],
  'u': ['υ', 'ụ', 'ù', 'ú', 'û', 'ü', 'ū'],
  'v': ['ν', 'ṿ'],
  'w': ['ẁ', 'ẃ', 'ẅ', 'ŵ', 'ω', 'vv'],
  'x': ['х', 'ẋ', 'ẍ'],
  'y': ['у', 'ỳ', 'ý', 'ŷ', 'ÿ'],
  'z': ['ź', 'ż', 'ž', 'ẓ'],
};

// ============================================
// BOOTSTRAP SOLANA KEYWORDS
// ============================================

/**
 * Keywords that might indicate Solana-related phishing
 * Used to identify typosquatting attempts
 */
export const BOOTSTRAP_SOLANA_KEYWORDS: string[] = [
  'solana',
  'sol',
  'phantom',
  'jupiter',
  'jup',
  'raydium',
  'orca',
  'magic',
  'eden',
  'tensor',
  'marinade',
  'wallet',
  'swap',
  'dex',
  'airdrop',
  'claim',
  'nft',
  'token',
  'mint',
  'stake',
  'staking',
];

// ============================================
// COMBINED BOOTSTRAP DATA
// ============================================

/**
 * Complete bootstrap threat intel data
 * Used as fallback when remote sources are unavailable
 */
export const BOOTSTRAP_THREAT_INTEL: ThreatIntelData = {
  legitimateDomains: BOOTSTRAP_LEGITIMATE_DOMAINS,
  scamDomains: BOOTSTRAP_SCAM_DOMAINS,
  suspiciousTlds: BOOTSTRAP_SUSPICIOUS_TLDS,
  homoglyphMap: BOOTSTRAP_HOMOGLYPH_MAP,
  solanaKeywords: BOOTSTRAP_SOLANA_KEYWORDS,
  version: 'bootstrap-1.0.0',
  updatedAt: Date.now(),
};

/**
 * Validate remote threat intel data structure
 * Ensures data from remote sources is well-formed
 */
export function validateThreatIntelData(data: unknown): data is ThreatIntelData {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  const d = data as Record<string, unknown>;
  
  // Check required arrays
  if (!Array.isArray(d.legitimateDomains)) return false;
  if (!Array.isArray(d.scamDomains)) return false;
  if (!Array.isArray(d.suspiciousTlds)) return false;
  if (!Array.isArray(d.solanaKeywords)) return false;
  
  // Check homoglyph map structure
  if (!d.homoglyphMap || typeof d.homoglyphMap !== 'object') return false;
  
  // Validate homoglyph map entries
  for (const [key, value] of Object.entries(d.homoglyphMap)) {
    if (typeof key !== 'string' || !Array.isArray(value)) {
      return false;
    }
  }
  
  // Check version and timestamp
  if (typeof d.version !== 'string') return false;
  if (typeof d.updatedAt !== 'number') return false;
  
  return true;
}

/**
 * Merge remote data with bootstrap data
 * Remote data takes precedence but bootstrap fills gaps
 */
export function mergeThreatIntelData(
  remote: ThreatIntelData,
  bootstrap: ThreatIntelData = BOOTSTRAP_THREAT_INTEL
): ThreatIntelData {
  return {
    // Combine and deduplicate domain lists
    legitimateDomains: [...new Set([
      ...remote.legitimateDomains,
      ...bootstrap.legitimateDomains,
    ])],
    scamDomains: [...new Set([
      ...remote.scamDomains,
      ...bootstrap.scamDomains,
    ])],
    suspiciousTlds: [...new Set([
      ...remote.suspiciousTlds,
      ...bootstrap.suspiciousTlds,
    ])],
    solanaKeywords: [...new Set([
      ...remote.solanaKeywords,
      ...bootstrap.solanaKeywords,
    ])],
    // Merge homoglyph maps (remote overrides bootstrap for same keys)
    homoglyphMap: {
      ...bootstrap.homoglyphMap,
      ...remote.homoglyphMap,
    },
    // Use remote metadata
    version: remote.version,
    updatedAt: remote.updatedAt,
  };
}

