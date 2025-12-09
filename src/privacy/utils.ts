

export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    
    
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      
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


export function isSameDomain(domain1: string, domain2: string): boolean {
  return domain1.toLowerCase() === domain2.toLowerCase();
}


export function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim();
  
  
  if (normalized.includes('://')) {
    try {
      normalized = new URL(normalized).hostname;
    } catch {
      
    }
  }
  
  
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }
  
  
  if (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}


export function matchesDomain(url: string, domainPattern: string): boolean {
  const urlDomain = extractDomain(url);
  if (!urlDomain) return false;
  
  const pattern = normalizeDomain(domainPattern);
  const normalized = normalizeDomain(urlDomain);
  
  
  if (normalized === pattern) return true;
  
  
  if (normalized.endsWith('.' + pattern)) return true;
  
  return false;
}

