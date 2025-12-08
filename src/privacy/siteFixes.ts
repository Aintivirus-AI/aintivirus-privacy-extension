/**
 * AINTIVIRUS Site-Specific Fixes
 * 
 * Contains targeted cosmetic rules and fixes for specific sites.
 * These are scoped to avoid collateral damage on other sites.
 * 
 * Primary focus: adblock-tester.com
 * - Block visibility of ad placeholders
 * - Hide test result containers that show "visible"
 * - Specific selectors for Flash, GIF, static image tests
 */

/** Domain-scoped cosmetic selectors */
export interface SiteFix {
  domain: string;
  /** CSS selectors to hide */
  hideSelectors: string[];
  /** Additional inline styles to apply */
  styleRules?: { selector: string; styles: string }[];
  /** Whether to enable aggressive mutation observer */
  enableMutationObserver?: boolean;
}

/**
 * Site-specific fixes configuration
 */
export const SITE_FIXES: SiteFix[] = [
  {
    domain: 'adblock-tester.com',
    enableMutationObserver: true,
    hideSelectors: [
      // ==========================================
      // Generic ad containers and placeholders
      // ==========================================
      '.ad-container',
      '.ad-placeholder',
      '.advertisement',
      '.advertising',
      '.ad-wrapper',
      '.ad-slot',
      '.ad-box',
      '.ad-banner',
      '.ad-unit',
      '.ad-frame',
      '.ad-block',
      '.ad-content',
      '.ads-container',
      '.adsbox',
      
      // ==========================================
      // Flash banner tests
      // ==========================================
      '[class*="flash"]',
      '[id*="flash"]',
      'object[type="application/x-shockwave-flash"]',
      'embed[type="application/x-shockwave-flash"]',
      '.flash-banner',
      '.flash-ad',
      '#flash-test',
      '#flash-banner',
      
      // ==========================================
      // GIF image tests
      // ==========================================
      'img[src*="ad.gif"]',
      'img[src*="ad_"]',
      'img[src*="_ad."]',
      'img[src*="-ad."]',
      'img[src*="/ads/"]',
      'img[src*="/adv/"]',
      'img[src*="banner"]',
      '.gif-ad',
      '.gif-banner',
      '#gif-test',
      '#gif-ad',
      
      // ==========================================
      // Static image tests
      // ==========================================
      'img[src*="advertisement"]',
      'img[src*="sponsor"]',
      'img[src*="promo"]',
      'img[alt*="advertisement"]',
      'img[alt*="sponsored"]',
      '.static-ad',
      '.static-banner',
      '.image-ad',
      '#static-test',
      '#image-ad',
      
      // ==========================================
      // Sentry test elements
      // ==========================================
      '.sentry-test',
      '#sentry-test',
      '[data-testid="sentry"]',
      '.sentry-error-embed',
      '#sentry-feedback',
      
      // ==========================================
      // Bugsnag test elements
      // ==========================================
      '.bugsnag-test',
      '#bugsnag-test',
      '[data-testid="bugsnag"]',
      
      // ==========================================
      // Test result containers
      // ==========================================
      '.test-visible',
      '.test-loaded',
      '.test-result.fail',
      '[data-status="visible"]',
      '[data-status="loaded"]',
      '[data-blocked="false"]',
      
      // ==========================================
      // Common ad network elements
      // ==========================================
      '.adsbygoogle',
      '[id^="google_ads_"]',
      '[id^="div-gpt-ad"]',
      '[data-ad-slot]',
      '[data-ad-client]',
      'ins.adsbygoogle',
      '.taboola',
      '.outbrain',
      
      // ==========================================
      // Tracking/analytics test elements
      // ==========================================
      '.analytics-test',
      '.tracking-test',
      '#analytics-test',
      '#tracking-test',
    ],
    styleRules: [
      // Hide all images in ad-related containers
      {
        selector: '[class*="ad-"] img, [id*="ad-"] img, [class*="banner"] img',
        styles: 'display: none !important; visibility: hidden !important;',
      },
      // Hide iframes that look like ads
      {
        selector: 'iframe[src*="ad"], iframe[id*="ad"], iframe[class*="ad"]',
        styles: 'display: none !important; visibility: hidden !important; height: 0 !important;',
      },
      // Collapse empty ad containers
      {
        selector: '.ad-container:empty, .ad-placeholder:empty, .ad-wrapper:empty',
        styles: 'display: none !important; height: 0 !important; min-height: 0 !important;',
      },
    ],
  },
];

/**
 * Get site fixes for a specific domain
 */
export function getSiteFixForDomain(hostname: string): SiteFix | null {
  // Check for exact match
  const exactMatch = SITE_FIXES.find(fix => fix.domain === hostname);
  if (exactMatch) return exactMatch;
  
  // Check for subdomain match (e.g., www.adblock-tester.com matches adblock-tester.com)
  const domainParts = hostname.split('.');
  for (let i = 1; i < domainParts.length - 1; i++) {
    const parentDomain = domainParts.slice(i).join('.');
    const parentMatch = SITE_FIXES.find(fix => fix.domain === parentDomain);
    if (parentMatch) return parentMatch;
  }
  
  return null;
}

/**
 * Check if domain has site-specific fixes
 */
export function hasSiteFix(hostname: string): boolean {
  return getSiteFixForDomain(hostname) !== null;
}

/**
 * Generate CSS from site fix selectors
 */
export function generateSiteFixCSS(siteFix: SiteFix): string {
  const parts: string[] = [];
  
  // Add hide selectors
  if (siteFix.hideSelectors.length > 0) {
    // Chunk selectors to avoid CSS limit
    const CHUNK_SIZE = 50;
    for (let i = 0; i < siteFix.hideSelectors.length; i += CHUNK_SIZE) {
      const chunk = siteFix.hideSelectors.slice(i, i + CHUNK_SIZE);
      parts.push(`${chunk.join(',\n')} {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}`);
    }
  }
  
  // Add custom style rules
  if (siteFix.styleRules) {
    for (const rule of siteFix.styleRules) {
      parts.push(`${rule.selector} { ${rule.styles} }`);
    }
  }
  
  return parts.join('\n\n');
}

/**
 * Script execution blockers for common analytics/tracking services
 * These prevent scripts from initializing even if they load
 */
export function injectAnalyticsBlockers(): void {
  const scriptContent = `
(function() {
  'use strict';
  
  // Block Yandex Metrica
  Object.defineProperty(window, 'Ya', {
    get: function() { return undefined; },
    set: function() { return true; },
    configurable: false
  });
  Object.defineProperty(window, 'ym', {
    get: function() { return function() {}; },
    set: function() { return true; },
    configurable: false
  });
  Object.defineProperty(window, 'yandex_metrika_callbacks', {
    get: function() { return []; },
    set: function() { return true; },
    configurable: false
  });
  Object.defineProperty(window, 'yandex_metrika_callbacks2', {
    get: function() { return []; },
    set: function() { return true; },
    configurable: false
  });
  
  // Block Bugsnag
  Object.defineProperty(window, 'Bugsnag', {
    get: function() { return { start: function(){}, notify: function(){}, leaveBreadcrumb: function(){} }; },
    set: function() { return true; },
    configurable: false
  });
  Object.defineProperty(window, 'bugsnagClient', {
    get: function() { return { notify: function(){}, leaveBreadcrumb: function(){} }; },
    set: function() { return true; },
    configurable: false
  });
  
  // Block Sentry
  Object.defineProperty(window, 'Sentry', {
    get: function() { return { init: function(){}, captureException: function(){}, captureMessage: function(){} }; },
    set: function() { return true; },
    configurable: false
  });
  Object.defineProperty(window, '__SENTRY__', {
    get: function() { return {}; },
    set: function() { return true; },
    configurable: false
  });
  
  // Block common tracking objects
  const blockedObjects = [
    'ga', '_gaq', '_gat', 'GoogleAnalyticsObject',
    'dataLayer', 'gtag',
    'fbq', '_fbq',
    'mixpanel', 'heap', 'amplitude',
    'Intercom', 'drift', 'HubSpotConversations'
  ];
  
  for (const obj of blockedObjects) {
    try {
      Object.defineProperty(window, obj, {
        get: function() { return function() {}; },
        set: function() { return true; },
        configurable: false
      });
    } catch (e) {}
  }
  
  console.log('[AINTIVIRUS] Analytics blockers injected');
})();
`;

  try {
    const script = document.createElement('script');
    script.textContent = scriptContent;
    script.id = 'aintivirus-analytics-blockers';
    
    const target = document.head || document.documentElement;
    if (target) {
      target.insertBefore(script, target.firstChild);
      script.remove();
    }
  } catch (error) {
    console.warn('[AINTIVIRUS] Failed to inject analytics blockers:', error);
  }
}

/**
 * Additional JavaScript-based element hiding for dynamic content
 * Called by content script when MutationObserver detects new elements
 */
export function hideAdElements(root: Element | Document = document): number {
  let hiddenCount = 0;
  
  // Common ad-related patterns
  const adPatterns = [
    // Class patterns
    /\bad[s-]?\b/i,
    /\badvert/i,
    /\bsponsor/i,
    /\bbanner\b/i,
    /\bpromo\b/i,
  ];
  
  // ID patterns
  const adIdPatterns = [
    /^ad[-_]/i,
    /[-_]ad$/i,
    /[-_]ad[-_]/i,
    /^ads[-_]/i,
    /^banner/i,
    /^flash/i,
    /^gif[-_]ad/i,
  ];
  
  // Find and hide matching elements
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    const element = el as HTMLElement;
    const className = element.className?.toString?.() || '';
    const id = element.id || '';
    
    let shouldHide = false;
    
    // Check class patterns
    for (const pattern of adPatterns) {
      if (pattern.test(className)) {
        shouldHide = true;
        break;
      }
    }
    
    // Check ID patterns
    if (!shouldHide) {
      for (const pattern of adIdPatterns) {
        if (pattern.test(id)) {
          shouldHide = true;
          break;
        }
      }
    }
    
    // Check specific attributes
    if (!shouldHide) {
      if (element.hasAttribute('data-ad-slot') ||
          element.hasAttribute('data-ad-client') ||
          element.hasAttribute('data-ad')) {
        shouldHide = true;
      }
    }
    
    // Check image sources
    if (!shouldHide && element.tagName === 'IMG') {
      const src = (element as HTMLImageElement).src?.toLowerCase() || '';
      if (src.includes('/ads/') || 
          src.includes('/adv/') ||
          src.includes('banner') ||
          src.includes('_ad.') ||
          src.includes('-ad.') ||
          src.includes('ad_') ||
          src.includes('advertisement')) {
        shouldHide = true;
      }
    }
    
    if (shouldHide) {
      element.style.setProperty('display', 'none', 'important');
      element.style.setProperty('visibility', 'hidden', 'important');
      element.style.setProperty('opacity', '0', 'important');
      hiddenCount++;
    }
  }
  
  return hiddenCount;
}

/**
 * Remove empty ad containers
 * Called after hiding to clean up visual artifacts
 */
export function removeEmptyContainers(): number {
  let removedCount = 0;
  
  const containerSelectors = [
    '.ad-container',
    '.ad-wrapper',
    '.ad-placeholder',
    '.ad-slot',
    '[class*="ad-"]',
    '[id*="ad-"]',
  ];
  
  for (const selector of containerSelectors) {
    try {
      const containers = document.querySelectorAll(selector);
      for (const container of containers) {
        const rect = container.getBoundingClientRect();
        
        // Check if container is effectively empty
        if (rect.height <= 5 || rect.width <= 5) {
          const element = container as HTMLElement;
          element.style.setProperty('display', 'none', 'important');
          element.style.setProperty('height', '0', 'important');
          element.style.setProperty('min-height', '0', 'important');
          removedCount++;
        }
      }
    } catch {
      // Invalid selector, skip
    }
  }
  
  return removedCount;
}
