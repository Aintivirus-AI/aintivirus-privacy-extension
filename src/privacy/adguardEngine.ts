/**
 * AINTIVIRUS AdGuard Engine Wrapper
 * 
 * Provides enhanced ad blocking functionality:
 * - Protected sites list to prevent false positives (Twitter, YouTube, etc.)
 * - YouTube anti-adblock scriptlets
 * - Safe cosmetic rule filtering
 * 
 * Note: The complex @adguard/tsurlfilter integration is reserved for future
 * when the API stabilizes. For now, we use enhanced custom logic with
 * the core improvements (protected sites, scriptlets).
 */

import type { CachedCosmeticRules } from './types';

/**
 * Protected sites where generic cosmetic filters are disabled
 * to prevent breaking UI elements (like Twitter's post button)
 */
export const PROTECTED_SITES = [
  'twitter.com',
  'x.com',
  'youtube.com',
  'github.com',
  'google.com',
  'google.co.uk',
  'google.ca',
  'google.com.au',
  'mail.google.com',
  'drive.google.com',
  'docs.google.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'reddit.com',
  'amazon.com',
  'amazon.co.uk',
  'ebay.com',
  'netflix.com',
  'twitch.tv',
  'discord.com',
];

/**
 * Check if a domain should have generic cosmetic filters disabled
 */
export function isProtectedSite(domain: string): boolean {
  const normalizedDomain = domain.toLowerCase();
  return PROTECTED_SITES.some(protectedDomain => 
    normalizedDomain === protectedDomain || 
    normalizedDomain.endsWith(`.${protectedDomain}`)
  );
}

/**
 * YouTube-specific scriptlets for bypassing anti-adblock detection
 * These are injected via content script to prevent YouTube's ad-blocker popup
 */
export const YOUTUBE_SCRIPTLETS: string[] = [
  // Disable YouTube's ad-block detection popup
  "set, yt.config_.openPopupConfig.supportedPopups.adBlockMessageViewModel, false",
  // Prevent adblock detection via property read
  "abort-on-property-read, ytInitialPlayerResponse.adPlacements",
  // Block adblock recovery script
  "no-xhr-if, googlevideo.com/initplayback",
  // Disable ad reinsertion
  "set, ytInitialPlayerResponse.playerAds, undefined",
  "set, ytInitialPlayerResponse.adSlots, undefined",
];

/**
 * Anti-adblock scriptlets for common detection methods
 */
export const ANTI_ADBLOCK_SCRIPTLETS: string[] = [
  // Common anti-adblock detection bypass
  "abort-on-property-read, FuckAdBlock",
  "abort-on-property-read, BlockAdBlock",
  "abort-on-property-read, fuckAdBlock",
  "abort-on-property-read, blockAdBlock",
  "set-constant, adBlockEnabled, false",
  "set-constant, adblockEnabled, false",
  "set-constant, isAdBlockActive, false",
];

/**
 * Get scriptlets for a domain (for injection via content script)
 */
export function getScriptletsForDomain(domain: string): string[] {
  const scriptlets: string[] = [];

  // YouTube-specific scriptlets
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    scriptlets.push(...YOUTUBE_SCRIPTLETS);
  }

  // Generic anti-adblock scriptlets for all sites
  scriptlets.push(...ANTI_ADBLOCK_SCRIPTLETS);

  return scriptlets;
}

/**
 * Build cached cosmetic rules structure for storage
 * This is a simplified version that parses rules without the full AdGuard engine
 */
export function buildCosmeticRulesCache(allRules: string[]): CachedCosmeticRules {
  const cache: CachedCosmeticRules = {
    generic: [],
    domainSpecific: {},
    exceptions: {},
    updatedAt: Date.now(),
  };

  // Parse cosmetic rules manually
  for (const rule of allRules) {
    const trimmed = rule.trim();

    // Skip non-cosmetic rules
    if (!trimmed.includes('##') && !trimmed.includes('#@#')) {
      continue;
    }

    // Skip procedural/extended filters (not supported in CSS-only injection)
    if (trimmed.includes(':has(') || trimmed.includes(':has-text(') ||
        trimmed.includes(':xpath(') || trimmed.includes(':style(') ||
        trimmed.includes('#$#') || trimmed.includes('##+js') ||
        trimmed.includes(':matches-css(') || trimmed.includes(':upward(') ||
        trimmed.includes(':remove(') || trimmed.includes(':min-text-length(')) {
      continue;
    }

    // Parse exception rules (#@#)
    const exceptionMatch = trimmed.match(/^([^#]*?)#@#(.+)$/);
    if (exceptionMatch) {
      const [, domainsStr, selector] = exceptionMatch;
      if (domainsStr) {
        const domains = domainsStr.split(',').map(d => d.trim()).filter(Boolean);
        for (const domain of domains) {
          if (domain.startsWith('~')) continue; // Skip negated domains in exceptions
          if (!cache.exceptions[domain]) {
            cache.exceptions[domain] = [];
          }
          cache.exceptions[domain].push(selector.trim());
        }
      }
      continue;
    }

    // Parse standard cosmetic rules (##)
    const cosmeticMatch = trimmed.match(/^([^#]*?)##(.+)$/);
    if (cosmeticMatch) {
      const [, domainsStr, selector] = cosmeticMatch;
      const selectorTrimmed = selector.trim();

      // Skip overly broad selectors that cause false positives
      if (selectorTrimmed === '*' || selectorTrimmed === 'body' || 
          selectorTrimmed === 'html' || selectorTrimmed.length < 3) {
        continue;
      }

      // Skip selectors with wildcards in class/id that are too broad
      if (selectorTrimmed.includes('[class*="ad-"]') ||
          selectorTrimmed.includes('[class*="ad_"]') ||
          selectorTrimmed.includes('[id*="ad-"]') ||
          selectorTrimmed.includes('[id*="ad_"]')) {
        continue;
      }

      if (!domainsStr || domainsStr.trim() === '') {
        // Generic rule - applies to all sites
        cache.generic.push(selectorTrimmed);
      } else {
        // Domain-specific rule
        const domains = domainsStr.split(',')
          .map(d => d.trim())
          .filter(d => d && !d.startsWith('~')); // Skip negated domains
        
        for (const domain of domains) {
          if (!cache.domainSpecific[domain]) {
            cache.domainSpecific[domain] = [];
          }
          cache.domainSpecific[domain].push(selectorTrimmed);
        }
      }
    }
  }

  // Deduplicate generic rules
  cache.generic = [...new Set(cache.generic)];

  // Deduplicate domain-specific rules
  for (const domain of Object.keys(cache.domainSpecific)) {
    cache.domainSpecific[domain] = [...new Set(cache.domainSpecific[domain])];
  }

  // Deduplicate exception rules
  for (const domain of Object.keys(cache.exceptions)) {
    cache.exceptions[domain] = [...new Set(cache.exceptions[domain])];
  }

  console.log(`[AdGuard] Built cosmetic cache: ${cache.generic.length} generic, ${Object.keys(cache.domainSpecific).length} domain-specific`);
  return cache;
}

/**
 * Preprocess filter list text (remove comments, invalid rules, etc.)
 */
export function preprocessFilterList(text: string): string[] {
  const lines = text.split('\n');
  const rules: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip comments
    if (trimmed.startsWith('!') || trimmed.startsWith('[Adblock')) continue;

    // Skip pure comment lines starting with #
    if (trimmed.startsWith('#') && !trimmed.includes('##') && !trimmed.includes('#@#')) continue;

    rules.push(trimmed);
  }

  return rules;
}
