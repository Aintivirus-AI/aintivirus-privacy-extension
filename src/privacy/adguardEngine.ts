import type { CachedCosmeticRules } from './types';

export const PROTECTED_SITES = [
  // Social Media
  'twitter.com',
  'x.com',
  'youtube.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'reddit.com',
  'tiktok.com',
  
  // Development & Productivity Tools
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'stackexchange.com',
  'cursor.sh',
  'cursor.com',
  'notion.so',
  'notion.com',
  'slack.com',
  'trello.com',
  'asana.com',
  'figma.com',
  'vercel.com',
  'netlify.com',
  'heroku.com',
  
  // Error Tracking (NEVER block - breaks authentication flows)
  'sentry.io',
  'bugsnag.com',
  'rollbar.com',
  
  // Google Services & Domains
  'google.com',
  'google.co.uk',
  'google.ca',
  'google.com.au',
  'google.de',
  'google.fr',
  'google.it',
  'google.es',
  'google.nl',
  'google.be',
  'google.ch',
  'google.at',
  'google.pl',
  'google.ru',
  'google.co.in',
  'google.co.jp',
  'google.co.kr',
  'google.com.br',
  'google.com.mx',
  'google.com.ar',
  'google.com.sg',
  'google.com.hk',
  'google.com.tw',
  'accounts.google.com',
  'myaccount.google.com',
  'login.google.com',
  'mail.google.com',
  'drive.google.com',
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
  'calendar.google.com',
  'meet.google.com',
  'gstatic.com',
  'googleusercontent.com',
  'googleapis.com',
  
  // Microsoft Services
  'microsoft.com',
  'live.com',
  'outlook.com',
  'office.com',
  'office365.com',
  'microsoftonline.com',
  'login.microsoftonline.com',
  'account.microsoft.com',
  'onedrive.live.com',
  'teams.microsoft.com',
  
  // Apple Services
  'apple.com',
  'icloud.com',
  'appleid.apple.com',
  
  // E-commerce
  'amazon.com',
  'amazon.co.uk',
  'amazon.ca',
  'amazon.de',
  'amazon.fr',
  'ebay.com',
  'paypal.com',
  'stripe.com',
  
  // Entertainment
  'netflix.com',
  'hulu.com',
  'disneyplus.com',
  'spotify.com',
  'twitch.tv',
  'discord.com',
  
  // Banking & Finance (commonly used for OAuth)
  'plaid.com',
  
  // Other OAuth/Auth Providers
  'auth0.com',
  'okta.com',
  'onelogin.com',
];

export function isProtectedSite(domain: string): boolean {
  const normalizedDomain = domain.toLowerCase();
  return PROTECTED_SITES.some(
    (protectedDomain) =>
      normalizedDomain === protectedDomain || normalizedDomain.endsWith(`.${protectedDomain}`),
  );
}

export const YOUTUBE_SCRIPTLETS: string[] = [
  'set, yt.config_.openPopupConfig.supportedPopups.adBlockMessageViewModel, false',

  'abort-on-property-read, ytInitialPlayerResponse.adPlacements',

  'no-xhr-if, googlevideo.com/initplayback',

  'set, ytInitialPlayerResponse.playerAds, undefined',
  'set, ytInitialPlayerResponse.adSlots, undefined',
];

export const ANTI_ADBLOCK_SCRIPTLETS: string[] = [
  'abort-on-property-read, FuckAdBlock',
  'abort-on-property-read, BlockAdBlock',
  'abort-on-property-read, fuckAdBlock',
  'abort-on-property-read, blockAdBlock',
  'set-constant, adBlockEnabled, false',
  'set-constant, adblockEnabled, false',
  'set-constant, isAdBlockActive, false',
];

export function getScriptletsForDomain(domain: string): string[] {
  const scriptlets: string[] = [];

  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    scriptlets.push(...YOUTUBE_SCRIPTLETS);
  }

  scriptlets.push(...ANTI_ADBLOCK_SCRIPTLETS);

  return scriptlets;
}

export function buildCosmeticRulesCache(allRules: string[]): CachedCosmeticRules {
  const cache: CachedCosmeticRules = {
    generic: [],
    domainSpecific: {},
    exceptions: {},
    updatedAt: Date.now(),
  };

  for (const rule of allRules) {
    const trimmed = rule.trim();

    if (!trimmed.includes('##') && !trimmed.includes('#@#')) {
      continue;
    }

    if (
      trimmed.includes(':has(') ||
      trimmed.includes(':has-text(') ||
      trimmed.includes(':xpath(') ||
      trimmed.includes(':style(') ||
      trimmed.includes('#$#') ||
      trimmed.includes('##+js') ||
      trimmed.includes(':matches-css(') ||
      trimmed.includes(':upward(') ||
      trimmed.includes(':remove(') ||
      trimmed.includes(':min-text-length(')
    ) {
      continue;
    }

    const exceptionMatch = trimmed.match(/^([^#]*?)#@#(.+)$/);
    if (exceptionMatch) {
      const [, domainsStr, selector] = exceptionMatch;
      if (domainsStr) {
        const domains = domainsStr
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);
        for (const domain of domains) {
          if (domain.startsWith('~')) continue;
          if (!cache.exceptions[domain]) {
            cache.exceptions[domain] = [];
          }
          cache.exceptions[domain].push(selector.trim());
        }
      }
      continue;
    }

    const cosmeticMatch = trimmed.match(/^([^#]*?)##(.+)$/);
    if (cosmeticMatch) {
      const [, domainsStr, selector] = cosmeticMatch;
      const selectorTrimmed = selector.trim();

      if (
        selectorTrimmed === '*' ||
        selectorTrimmed === 'body' ||
        selectorTrimmed === 'html' ||
        selectorTrimmed.length < 3
      ) {
        continue;
      }

      if (
        selectorTrimmed.includes('[class*="ad-"]') ||
        selectorTrimmed.includes('[class*="ad_"]') ||
        selectorTrimmed.includes('[id*="ad-"]') ||
        selectorTrimmed.includes('[id*="ad_"]')
      ) {
        continue;
      }

      if (!domainsStr || domainsStr.trim() === '') {
        cache.generic.push(selectorTrimmed);
      } else {
        const domains = domainsStr
          .split(',')
          .map((d) => d.trim())
          .filter((d) => d && !d.startsWith('~'));

        for (const domain of domains) {
          if (!cache.domainSpecific[domain]) {
            cache.domainSpecific[domain] = [];
          }
          cache.domainSpecific[domain].push(selectorTrimmed);
        }
      }
    }
  }

  cache.generic = [...new Set(cache.generic)];

  for (const domain of Object.keys(cache.domainSpecific)) {
    cache.domainSpecific[domain] = [...new Set(cache.domainSpecific[domain])];
  }

  for (const domain of Object.keys(cache.exceptions)) {
    cache.exceptions[domain] = [...new Set(cache.exceptions[domain])];
  }
  return cache;
}

export function preprocessFilterList(text: string): string[] {
  const lines = text.split('\n');
  const rules: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith('!') || trimmed.startsWith('[Adblock')) continue;

    if (trimmed.startsWith('#') && !trimmed.includes('##') && !trimmed.includes('#@#')) continue;

    rules.push(trimmed);
  }

  return rules;
}
