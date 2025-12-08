/**
 * AINTIVIRUS - Origin Formatting and IDN/Punycode Security
 * 
 * SECURITY: This module handles origin display to prevent homograph attacks.
 * 
 * IDN (Internationalized Domain Names) can contain characters from different
 * scripts that look similar to ASCII characters (confusables/homoglyphs).
 * Example: "аpple.com" (with Cyrillic 'а') looks like "apple.com" but isn't.
 * 
 * This module:
 * - Detects IDN/punycode domains
 * - Identifies potentially suspicious mixed-script domains
 * - Provides safe display values for approval UIs
 * - Extracts eTLD+1 for prominent display
 */

// ============================================
// TYPES
// ============================================

export interface FormattedOrigin {
  /** Safe display hostname (may be punycode for IDN) */
  displayHost: string;
  /** ASCII punycode representation */
  asciiHost: string;
  /** Effective TLD+1 (e.g., "example.com" from "sub.example.com") */
  etldPlusOne: string;
  /** Whether this is an internationalized domain name */
  isIDN: boolean;
  /** Whether the domain has suspicious characteristics (mixed scripts) */
  isSuspicious: boolean;
  /** Full origin URL */
  fullOrigin: string;
  /** Protocol (http/https) */
  protocol: string;
  /** Port if non-standard */
  port: string;
}

// ============================================
// UNICODE SCRIPT DETECTION
// ============================================

/**
 * Common Unicode script ranges for homograph detection
 */
const SCRIPT_RANGES = {
  // Basic Latin (a-z, A-Z)
  latin: /[a-zA-Z]/,
  // Cyrillic characters (many look like Latin)
  cyrillic: /[\u0400-\u04FF]/,
  // Greek characters
  greek: /[\u0370-\u03FF]/,
  // Hebrew characters
  hebrew: /[\u0590-\u05FF]/,
  // Arabic characters
  arabic: /[\u0600-\u06FF]/,
  // CJK (Chinese/Japanese/Korean)
  cjk: /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F]/,
};

/**
 * Characters that are commonly used in homograph attacks
 * Maps lookalike characters to their ASCII equivalents
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y',
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M',
  'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X',
  // Greek
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'ν': 'v', 'τ': 't',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M',
  'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'Ζ': 'Z',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a string contains non-ASCII characters
 */
function containsNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

/**
 * Check if a hostname is punycode-encoded
 */
function isPunycode(hostname: string): boolean {
  return hostname.toLowerCase().includes('xn--');
}

/**
 * Detect which scripts are present in a string
 */
function detectScripts(str: string): string[] {
  const detected: string[] = [];
  
  for (const [script, pattern] of Object.entries(SCRIPT_RANGES)) {
    if (pattern.test(str)) {
      detected.push(script);
    }
  }
  
  return detected;
}

/**
 * Check if a domain uses mixed scripts (potential homograph)
 */
function hasMixedScripts(hostname: string): boolean {
  const scripts = detectScripts(hostname);
  // Mixed scripts is suspicious if Latin is combined with Cyrillic or Greek
  // (the most common homograph vectors)
  const hasSuspiciousMix = 
    scripts.includes('latin') && 
    (scripts.includes('cyrillic') || scripts.includes('greek'));
  
  return hasSuspiciousMix;
}

/**
 * Check if domain contains known confusable characters
 */
function containsConfusables(hostname: string): boolean {
  for (const char of hostname) {
    if (char in CONFUSABLES) {
      return true;
    }
  }
  return false;
}

/**
 * Extract eTLD+1 from hostname
 * This is a simplified version - for production, consider using a proper PSL library
 */
function extractEtldPlusOne(hostname: string): string {
  const parts = hostname.split('.');
  
  if (parts.length <= 2) {
    return hostname;
  }
  
  // Handle common two-part TLDs
  const twoPartTlds = [
    'co.uk', 'com.au', 'co.nz', 'co.jp', 'or.jp', 'com.br', 
    'org.uk', 'gov.uk', 'ac.uk', 'net.au', 'org.au'
  ];
  
  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTlds.includes(lastTwo.toLowerCase())) {
    return parts.slice(-3).join('.');
  }
  
  return parts.slice(-2).join('.');
}

/**
 * Try to decode punycode to Unicode for display
 */
function tryDecodePunycode(hostname: string): string {
  try {
    // Use URL constructor to decode punycode
    const url = new URL(`https://${hostname}`);
    return url.hostname;
  } catch {
    return hostname;
  }
}

/**
 * Try to encode Unicode hostname to punycode
 */
function tryEncodePunycode(hostname: string): string {
  try {
    // Use URL constructor to encode to punycode
    const url = new URL(`https://${hostname}`);
    // The hostname property gives us the punycode version
    return url.hostname;
  } catch {
    return hostname;
  }
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Format an origin URL for safe display in approval UIs.
 * 
 * SECURITY: This function detects IDN/punycode domains and potential
 * homograph attacks. Always show the asciiHost if isIDN or isSuspicious.
 * 
 * @param origin - Full origin URL (e.g., "https://example.com:8080")
 * @returns Formatted origin with safety information
 */
export function formatOrigin(origin: string): FormattedOrigin {
  // Default values for error cases
  const defaultResult: FormattedOrigin = {
    displayHost: origin,
    asciiHost: origin,
    etldPlusOne: origin,
    isIDN: false,
    isSuspicious: false,
    fullOrigin: origin,
    protocol: '',
    port: '',
  };
  
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const protocol = url.protocol.replace(':', '');
    const port = url.port;
    
    // Check if it's an IDN
    const hasNonAscii = containsNonAscii(hostname);
    const hasPunycode = isPunycode(hostname);
    const isIDN = hasNonAscii || hasPunycode;
    
    // Get both representations
    let displayHost: string;
    let asciiHost: string;
    
    if (hasPunycode) {
      // Punycode input - decode for display, keep original as ASCII
      displayHost = tryDecodePunycode(hostname);
      asciiHost = hostname;
    } else if (hasNonAscii) {
      // Unicode input - keep as display, encode for ASCII
      displayHost = hostname;
      asciiHost = tryEncodePunycode(hostname);
    } else {
      // Pure ASCII
      displayHost = hostname;
      asciiHost = hostname;
    }
    
    // Check for suspicious characteristics
    const mixedScripts = hasMixedScripts(displayHost);
    const hasConfusables = containsConfusables(displayHost);
    const isSuspicious = isIDN && (mixedScripts || hasConfusables);
    
    // Extract eTLD+1 from ASCII version (more reliable)
    const etldPlusOne = extractEtldPlusOne(asciiHost);
    
    return {
      displayHost,
      asciiHost,
      etldPlusOne,
      isIDN,
      isSuspicious,
      fullOrigin: origin,
      protocol,
      port,
    };
  } catch {
    // If URL parsing fails, return the origin as-is
    return defaultResult;
  }
}

/**
 * Format origin for simple display (just the hostname)
 * Use this for non-critical display; use full formatOrigin for approvals
 */
export function formatOriginSimple(origin: string): string {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return origin;
  }
}

/**
 * Check if an origin should show an IDN warning
 */
export function shouldShowIdnWarning(origin: string): boolean {
  const formatted = formatOrigin(origin);
  return formatted.isIDN || formatted.isSuspicious;
}
