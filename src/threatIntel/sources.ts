import { ThreatIntelData } from './types';

export const BOOTSTRAP_LEGITIMATE_DOMAINS: string[] = [
  'google.com',
  'microsoft.com',
  'github.com',
  'apple.com',
  'amazon.com',
  'paypal.com',

  'solana.com',
  'solana.org',
  'solscan.io',
  'explorer.solana.com',
  'docs.solana.com',
  'spl.solana.com',

  'phantom.app',
  'phantom.com',
  'solflare.com',
  'backpack.app',
  'glow.app',

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

  'magiceden.io',
  'tensor.trade',
  'hyperspace.xyz',
  'exchange.art',
  'formfunction.xyz',

  'helius.dev',
  'quicknode.com',
  'alchemy.com',
  'triton.one',

  'metaplex.com',
  'dialect.io',
  'squads.so',
  'realms.today',
];

export const BOOTSTRAP_SCAM_DOMAINS: string[] = [];

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

export const BOOTSTRAP_HOMOGLYPH_MAP: Record<string, string[]> = {
  a: ['а', 'ạ', 'ą', 'à', 'á', 'â', 'ã', 'ä', 'å', 'ā', '@'],
  b: ['ḅ', 'ḃ', 'ƀ'],
  c: ['с', 'ç', 'ć', 'č', 'ĉ'],
  d: ['ḋ', 'ḍ', 'đ', 'ɗ'],
  e: ['е', 'ẹ', 'ę', 'è', 'é', 'ê', 'ë', 'ē', '3'],
  g: ['ģ', 'ğ', 'ĝ', 'ġ', '9'],
  h: ['һ', 'ḥ', 'ĥ'],
  i: ['і', 'ị', 'ì', 'í', 'î', 'ï', 'ī', '1', 'l', '!', '|'],
  j: ['ј', 'ĵ'],
  k: ['κ', 'ķ', 'ḳ'],
  l: ['1', 'ł', 'ļ', 'ḷ', 'ḹ', 'i', '|', 'I'],
  m: ['ṃ', 'ḿ', 'rn'],
  n: ['ń', 'ņ', 'ň', 'ṇ', 'ñ'],
  o: ['о', 'ọ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ō', '0'],
  p: ['р', 'ṗ', 'ρ'],
  q: ['ԛ', 'ɋ'],
  r: ['ŕ', 'ř', 'ṛ', 'ṟ'],
  s: ['ṣ', 'ś', 'š', 'ş', '$', '5'],
  t: ['ṭ', 'ť', 'ţ', '+'],
  u: ['υ', 'ụ', 'ù', 'ú', 'û', 'ü', 'ū'],
  v: ['ν', 'ṿ'],
  w: ['ẁ', 'ẃ', 'ẅ', 'ŵ', 'ω', 'vv'],
  x: ['х', 'ẋ', 'ẍ'],
  y: ['у', 'ỳ', 'ý', 'ŷ', 'ÿ'],
  z: ['ź', 'ż', 'ž', 'ẓ'],
};

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

export const BOOTSTRAP_THREAT_INTEL: ThreatIntelData = {
  legitimateDomains: BOOTSTRAP_LEGITIMATE_DOMAINS,
  scamDomains: BOOTSTRAP_SCAM_DOMAINS,
  suspiciousTlds: BOOTSTRAP_SUSPICIOUS_TLDS,
  homoglyphMap: BOOTSTRAP_HOMOGLYPH_MAP,
  solanaKeywords: BOOTSTRAP_SOLANA_KEYWORDS,
  version: 'bootstrap-1.0.0',
  updatedAt: Date.now(),
};

export function validateThreatIntelData(data: unknown): data is ThreatIntelData {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.legitimateDomains)) return false;
  if (!Array.isArray(d.scamDomains)) return false;
  if (!Array.isArray(d.suspiciousTlds)) return false;
  if (!Array.isArray(d.solanaKeywords)) return false;

  if (!d.homoglyphMap || typeof d.homoglyphMap !== 'object') return false;

  for (const [key, value] of Object.entries(d.homoglyphMap)) {
    if (typeof key !== 'string' || !Array.isArray(value)) {
      return false;
    }
  }

  if (typeof d.version !== 'string') return false;
  if (typeof d.updatedAt !== 'number') return false;

  return true;
}

export function mergeThreatIntelData(
  remote: ThreatIntelData,
  bootstrap: ThreatIntelData = BOOTSTRAP_THREAT_INTEL,
): ThreatIntelData {
  return {
    legitimateDomains: [...new Set([...remote.legitimateDomains, ...bootstrap.legitimateDomains])],
    scamDomains: [...new Set([...remote.scamDomains, ...bootstrap.scamDomains])],
    suspiciousTlds: [...new Set([...remote.suspiciousTlds, ...bootstrap.suspiciousTlds])],
    solanaKeywords: [...new Set([...remote.solanaKeywords, ...bootstrap.solanaKeywords])],

    homoglyphMap: {
      ...bootstrap.homoglyphMap,
      ...remote.homoglyphMap,
    },

    version: remote.version,
    updatedAt: remote.updatedAt,
  };
}
