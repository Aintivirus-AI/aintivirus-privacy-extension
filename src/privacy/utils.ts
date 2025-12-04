/**
 * AINTIVIRUS Privacy Utilities
 * 
 * Shared utility functions for the privacy module.
 * Kept separate to avoid circular dependencies between modules.
 */

/**
 * Extract the effective domain from a URL
 * Returns the registrable domain (e.g., "example.com" from "www.sub.example.com")
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    // Remove www prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    
    // For simple TLDs, get the last two parts
    // This is a simplified approach; a proper solution would use the Public Suffix List
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Handle common two-part TLDs like .co.uk, .com.au
      const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'or.jp', 'com.br', 'org.uk'];
      const lastTwo = parts.slice(-2).join('.');
      
      if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
        return parts.slice(-3).join('.');
      }
      
      return parts.slice(-2).join('.');
    }
    
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Check if two domains are the same (first-party)
 */
export function isSameDomain(domain1: string, domain2: string): boolean {
  return domain1.toLowerCase() === domain2.toLowerCase();
}

/**
 * Normalize a domain for comparison/storage
 * Strips www prefix and converts to lowercase
 */
export function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim();
  
  // Remove protocol if present
  if (normalized.includes('://')) {
    try {
      normalized = new URL(normalized).hostname;
    } catch {
      // Not a valid URL, continue with the string as-is
    }
  }
  
  // Remove www prefix
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }
  
  // Remove trailing dot (FQDN format)
  if (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

/**
 * Check if a URL matches a domain pattern
 */
export function matchesDomain(url: string, domainPattern: string): boolean {
  const urlDomain = extractDomain(url);
  if (!urlDomain) return false;
  
  const pattern = normalizeDomain(domainPattern);
  const normalized = normalizeDomain(urlDomain);
  
  // Exact match
  if (normalized === pattern) return true;
  
  // Subdomain match (url is a subdomain of pattern)
  if (normalized.endsWith('.' + pattern)) return true;
  
  return false;
}



