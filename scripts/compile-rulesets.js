#!/usr/bin/env node
/**
 * AINTIVIRUS Ruleset Compiler
 * 
 * Compiles filter lists into Chrome MV3 declarativeNetRequest static rulesets.
 * Inspired by uBlock Origin Lite's approach.
 * 
 * Usage:
 *   node scripts/compile-rulesets.js
 *   node scripts/compile-rulesets.js --force  # Force re-download
 * 
 * Output:
 *   rules/static_ruleset_ads.json
 *   rules/static_ruleset_privacy.json
 *   rules/static_ruleset_custom.json
 *   rules/static_ruleset_fixes.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CONFIG = {
  cacheDir: path.join(__dirname, '../.filter-cache'),
  rulesDir: path.join(__dirname, '../rules'),
  maxRulesPerRuleset: 30000, // Chrome limit
  cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
};

// Filter list sources
const FILTER_LISTS = {
  ads: [
    {
      name: 'EasyList',
      url: 'https://easylist.to/easylist/easylist.txt',
    },
    {
      name: 'uBlock Filters',
      url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    },
  ],
  privacy: [
    {
      name: 'EasyPrivacy',
      url: 'https://easylist.to/easylist/easyprivacy.txt',
    },
    {
      name: 'uBlock Privacy',
      url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    },
  ],
};

// Resource type mapping from ABP to DNR
const RESOURCE_TYPE_MAP = {
  'script': 'script',
  'image': 'image',
  'stylesheet': 'stylesheet',
  'css': 'stylesheet',
  'object': 'object',
  'xmlhttprequest': 'xmlhttprequest',
  'xhr': 'xmlhttprequest',
  'subdocument': 'sub_frame',
  'sub_frame': 'sub_frame',
  'ping': 'ping',
  'media': 'media',
  'font': 'font',
  'websocket': 'websocket',
  'other': 'other',
};

const ALL_RESOURCE_TYPES = [
  'script', 'image', 'stylesheet', 'object', 'xmlhttprequest',
  'sub_frame', 'ping', 'media', 'font', 'websocket', 'other'
];

/**
 * Fetch a URL with caching
 */
async function fetchWithCache(url, forceRefresh = false) {
  const cacheFile = path.join(CONFIG.cacheDir, Buffer.from(url).toString('base64').slice(0, 50) + '.txt');
  
  // Check cache
  if (!forceRefresh && fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    if (Date.now() - stats.mtimeMs < CONFIG.cacheTTL) {
      console.log(`  Using cached: ${url.slice(0, 60)}...`);
      return fs.readFileSync(cacheFile, 'utf-8');
    }
  }
  
  console.log(`  Fetching: ${url.slice(0, 60)}...`);
  
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Aintivirus-Ruleset-Compiler/1.0',
        'Accept': 'text/plain',
      },
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchWithCache(response.headers.location, forceRefresh).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        // Save to cache
        fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
        fs.writeFileSync(cacheFile, data);
        resolve(data);
      });
    });
    
    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Parse ABP filter rule into structured format
 */
function parseFilterRule(rule) {
  let trimmed = rule.trim();
  
  // Skip empty, comments, cosmetic rules
  if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) return null;
  if (trimmed.startsWith('[Adblock')) return null;
  if (trimmed.includes('##') || trimmed.includes('#@#')) return null;
  if (trimmed.includes('#$#') || trimmed.includes('#@$#')) return null;
  if (trimmed.includes('##+js') || trimmed.includes('#@#+js')) return null;
  
  // Determine if allowlist
  const isAllow = trimmed.startsWith('@@');
  if (isAllow) trimmed = trimmed.slice(2);
  
  // Split modifiers
  const dollarIndex = trimmed.indexOf('$');
  let pattern = dollarIndex >= 0 ? trimmed.slice(0, dollarIndex) : trimmed;
  const modifiers = dollarIndex >= 0 ? trimmed.slice(dollarIndex + 1).split(',') : [];
  
  // Parse modifiers
  let resourceTypes = [];
  let domains = undefined;
  let excludedDomains = undefined;
  let isThirdParty = undefined;
  let hasUnsupportedModifier = false;
  
  for (const mod of modifiers) {
    const modLower = mod.toLowerCase().trim();
    
    // Resource types
    if (RESOURCE_TYPE_MAP[modLower]) {
      resourceTypes.push(RESOURCE_TYPE_MAP[modLower]);
      continue;
    }
    
    // Negated resource type
    if (modLower.startsWith('~') && RESOURCE_TYPE_MAP[modLower.slice(1)]) {
      if (resourceTypes.length === 0) resourceTypes = [...ALL_RESOURCE_TYPES];
      resourceTypes = resourceTypes.filter(t => t !== RESOURCE_TYPE_MAP[modLower.slice(1)]);
      continue;
    }
    
    // Third-party
    if (modLower === 'third-party' || modLower === '3p') {
      isThirdParty = true;
      continue;
    }
    if (modLower === '~third-party' || modLower === '~3p' || modLower === 'first-party' || modLower === '1p') {
      isThirdParty = false;
      continue;
    }
    
    // Domain modifier
    if (modLower.startsWith('domain=')) {
      const domainList = mod.slice(7).split('|');
      domains = [];
      excludedDomains = [];
      for (const d of domainList) {
        if (d.startsWith('~')) excludedDomains.push(d.slice(1));
        else domains.push(d);
      }
      if (domains.length === 0) domains = undefined;
      if (excludedDomains.length === 0) excludedDomains = undefined;
      continue;
    }
    
    // Skip unsupported modifiers (document, popup, etc.)
    if (['popup', 'document', 'csp', 'redirect', 'redirect-rule', 'removeparam', 
         'important', 'badfilter', 'match-case', 'all', 'frame'].includes(modLower)) {
      hasUnsupportedModifier = true;
    }
  }
  
  // Skip rules with unsupported modifiers
  if (hasUnsupportedModifier) return null;
  
  // Default resource types
  if (resourceTypes.length === 0) resourceTypes = [...ALL_RESOURCE_TYPES];
  
  // Check for domain anchor
  const isDomainAnchored = pattern.startsWith('||');
  if (isDomainAnchored) pattern = pattern.slice(2);
  
  // Remove anchors
  if (pattern.startsWith('|')) pattern = pattern.slice(1);
  if (pattern.endsWith('|')) pattern = pattern.slice(0, -1);
  
  // Skip overly broad patterns
  if (!pattern || pattern === '*' || pattern === '^') return null;
  
  return {
    raw: rule,
    type: isAllow ? 'allow' : 'block',
    pattern,
    isDomainAnchored,
    resourceTypes,
    domains,
    excludedDomains,
    isThirdParty,
  };
}

/**
 * Convert parsed rule to DNR format
 */
function convertToDNR(parsed, ruleId) {
  try {
    let urlFilter = parsed.pattern;
    if (parsed.isDomainAnchored) urlFilter = '||' + urlFilter;
    
    // Validate urlFilter
    if (urlFilter.length > 4096) return null; // Chrome limit
    
    const rule = {
      id: ruleId,
      priority: parsed.type === 'allow' ? 2 : 1,
      action: { type: parsed.type },
      condition: {
        urlFilter,
        resourceTypes: parsed.resourceTypes,
      },
    };
    
    // Add domain conditions
    if (parsed.domains?.length > 0) {
      rule.condition.initiatorDomains = parsed.domains;
    }
    if (parsed.excludedDomains?.length > 0) {
      rule.condition.excludedInitiatorDomains = parsed.excludedDomains;
    }
    
    // Add third-party condition
    if (parsed.isThirdParty === true) {
      rule.condition.domainType = 'thirdParty';
    } else if (parsed.isThirdParty === false) {
      rule.condition.domainType = 'firstParty';
    }
    
    return rule;
  } catch (error) {
    return null;
  }
}

/**
 * Compile a ruleset from filter lists
 */
async function compileRuleset(name, lists, startId, forceRefresh) {
  console.log(`\nCompiling ${name} ruleset...`);
  
  const allRules = [];
  const seenPatterns = new Set();
  let currentId = startId;
  
  for (const list of lists) {
    try {
      const text = await fetchWithCache(list.url, forceRefresh);
      const lines = text.split('\n');
      let listRules = 0;
      
      for (const line of lines) {
        if (currentId - startId >= CONFIG.maxRulesPerRuleset) break;
        
        const parsed = parseFilterRule(line);
        if (!parsed) continue;
        
        // Deduplicate
        const key = `${parsed.type}:${parsed.pattern}`;
        if (seenPatterns.has(key)) continue;
        seenPatterns.add(key);
        
        const dnrRule = convertToDNR(parsed, currentId);
        if (dnrRule) {
          allRules.push(dnrRule);
          currentId++;
          listRules++;
        }
      }
      
      console.log(`  ${list.name}: ${listRules} rules`);
    } catch (error) {
      console.error(`  Error loading ${list.name}:`, error.message);
    }
  }
  
  console.log(`  Total ${name}: ${allRules.length} rules`);
  return allRules;
}

/**
 * Generate custom bootstrap ruleset
 */
function generateCustomRuleset() {
  console.log('\nGenerating custom ruleset...');
  
  const rules = [];
  let id = 1;
  
  // High-priority tracker domains
  const trackerDomains = [
    // Error monitoring
    'sentry.io', 'browser.sentry-cdn.com', 'sentry-cdn.com',
    'bugsnag.com', 'd2wy8f7a9ursnm.cloudfront.net', 'sessions.bugsnag.com',
    'notify.bugsnag.com', 'app.bugsnag.com',
    'rollbar.com', 'raygun.com', 'trackjs.com',
    'logrocket.com', 'logrocket.io', 'lr-ingest.io',
    // Analytics
    'google-analytics.com', 'googleadservices.com', 'googlesyndication.com',
    'doubleclick.net', 'googletagmanager.com', 'googletagservices.com',
    // Ad networks
    'taboola.com', 'outbrain.com', 'criteo.com', 'criteo.net',
    'adroll.com', 'adsrvr.org', 'pubmatic.com',
    // Tracking
    'hotjar.com', 'mixpanel.com', 'segment.io', 'segment.com',
    'amplitude.com', 'heapanalytics.com', 'fullstory.com',
    // Social
    'facebook.net', 'connect.facebook.net', 'analytics.twitter.com',
    // Ad test domains
    'trackersimulator.org', 'eviltracker.net', 'do-not-tracker.org',
  ];
  
  for (const domain of trackerDomains) {
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ALL_RESOURCE_TYPES,
      },
    });
  }
  
  console.log(`  Custom ruleset: ${rules.length} rules`);
  return rules;
}

/**
 * Generate site-specific fixes ruleset
 */
function generateFixesRuleset() {
  console.log('\nGenerating site fixes ruleset...');
  
  const rules = [];
  let id = 1;
  
  // ==========================================
  // adblock-tester.com specific rules
  // ==========================================
  
  // Sentry - Redirect to noop stub instead of blocking
  rules.push({
    id: id++,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/noop-sentry.js' }
    },
    condition: {
      urlFilter: '||browser.sentry-cdn.com^',
      resourceTypes: ['script'],
    },
  });
  
  rules.push({
    id: id++,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/noop-sentry.js' }
    },
    condition: {
      urlFilter: '||sentry.io^',
      resourceTypes: ['script'],
    },
  });
  
  rules.push({
    id: id++,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/noop-sentry.js' }
    },
    condition: {
      regexFilter: '.*\\.sentry-cdn\\.com.*bundle.*\\.js',
      resourceTypes: ['script'],
      isUrlFilterCaseSensitive: false,
    },
  });
  
  // Bugsnag - Redirect to noop stub
  rules.push({
    id: id++,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/noop-bugsnag.js' }
    },
    condition: {
      urlFilter: '||bugsnag.com^',
      resourceTypes: ['script'],
    },
  });
  
  rules.push({
    id: id++,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/noop-bugsnag.js' }
    },
    condition: {
      urlFilter: '||d2wy8f7a9ursnm.cloudfront.net^',
      resourceTypes: ['script'],
    },
  });
  
  // Block Sentry/Bugsnag API endpoints (not just scripts)
  rules.push({
    id: id++,
    priority: 5,
    action: { type: 'block' },
    condition: {
      urlFilter: '||sentry.io/api/',
      resourceTypes: ['xmlhttprequest', 'ping', 'other'],
    },
  });
  
  rules.push({
    id: id++,
    priority: 5,
    action: { type: 'block' },
    condition: {
      urlFilter: '||sessions.bugsnag.com^',
      resourceTypes: ['xmlhttprequest', 'ping', 'other'],
    },
  });
  
  rules.push({
    id: id++,
    priority: 5,
    action: { type: 'block' },
    condition: {
      urlFilter: '||notify.bugsnag.com^',
      resourceTypes: ['xmlhttprequest', 'ping', 'other'],
    },
  });
  
  // ==========================================
  // adblock-tester.com image/banner blocking
  // ==========================================
  
  // Block common test ad images on adblock-tester.com
  const adImagePatterns = [
    '/ads/*',
    '/adv/*',
    '/banner*',
    '*/ad/*',
    '*_ad.*',
    '*-ad.*',
    '*/advertisement/*',
    '*/sponsor/*',
    '/flash/*',
  ];
  
  for (const pattern of adImagePatterns) {
    rules.push({
      id: id++,
      priority: 3,
      action: { type: 'block' },
      condition: {
        urlFilter: pattern,
        resourceTypes: ['image', 'media', 'object'],
        initiatorDomains: ['adblock-tester.com', 'www.adblock-tester.com'],
      },
    });
  }
  
  // Block flash/swf content
  rules.push({
    id: id++,
    priority: 3,
    action: { type: 'block' },
    condition: {
      urlFilter: '*.swf',
      resourceTypes: ['object', 'other', 'media'],
    },
  });
  
  // Block GIF test images
  rules.push({
    id: id++,
    priority: 3,
    action: { type: 'block' },
    condition: {
      regexFilter: '.*ad.*\\.gif$',
      resourceTypes: ['image'],
      isUrlFilterCaseSensitive: false,
    },
  });
  
  // Block common ad CDNs used by testers
  rules.push({
    id: id++,
    priority: 3,
    action: { type: 'block' },
    condition: {
      urlFilter: '||d3pkae9owd2lcf.cloudfront.net^',
      resourceTypes: ALL_RESOURCE_TYPES,
    },
  });
  
  // ==========================================
  // Generic ad/tracker blocking improvements
  // ==========================================
  
  // Block common tracking pixels
  rules.push({
    id: id++,
    priority: 2,
    action: { type: 'block' },
    condition: {
      regexFilter: '.*/pixel\\.gif|.*/1x1\\.gif|.*/clear\\.gif|.*/spacer\\.gif',
      resourceTypes: ['image'],
      isUrlFilterCaseSensitive: false,
    },
  });
  
  // Block common analytics scripts
  const analyticsPatterns = [
    '||google-analytics.com/analytics.js',
    '||google-analytics.com/ga.js',
    '||googletagmanager.com/gtag/js',
    '||googletagmanager.com/gtm.js',
  ];
  
  for (const pattern of analyticsPatterns) {
    rules.push({
      id: id++,
      priority: 2,
      action: { type: 'block' },
      condition: {
        urlFilter: pattern,
        resourceTypes: ['script'],
      },
    });
  }
  
  console.log(`  Site fixes ruleset: ${rules.length} rules`);
  return rules;
}

/**
 * Write ruleset to file
 */
function writeRuleset(name, rules) {
  fs.mkdirSync(CONFIG.rulesDir, { recursive: true });
  const filePath = path.join(CONFIG.rulesDir, `static_ruleset_${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(rules, null, 2));
  console.log(`  Written: ${filePath}`);
}

/**
 * Main compilation function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('AINTIVIRUS Ruleset Compiler');
  console.log('='.repeat(60));
  
  const forceRefresh = process.argv.includes('--force');
  if (forceRefresh) {
    console.log('Force refresh enabled - will re-download all lists');
  }
  
  try {
    // Compile ads ruleset
    const adsRules = await compileRuleset('ads', FILTER_LISTS.ads, 1, forceRefresh);
    writeRuleset('ads', adsRules);
    
    // Compile privacy ruleset
    const privacyRules = await compileRuleset('privacy', FILTER_LISTS.privacy, 100001, forceRefresh);
    writeRuleset('privacy', privacyRules);
    
    // Generate custom ruleset
    const customRules = generateCustomRuleset();
    writeRuleset('custom', customRules);
    
    // Generate site fixes ruleset
    const fixesRules = generateFixesRuleset();
    writeRuleset('fixes', fixesRules);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Compilation Complete');
    console.log('='.repeat(60));
    console.log(`  Ads ruleset:     ${adsRules.length} rules`);
    console.log(`  Privacy ruleset: ${privacyRules.length} rules`);
    console.log(`  Custom ruleset:  ${customRules.length} rules`);
    console.log(`  Fixes ruleset:   ${fixesRules.length} rules`);
    console.log(`  TOTAL:           ${adsRules.length + privacyRules.length + customRules.length + fixesRules.length} rules`);
    console.log('\nNext steps:');
    console.log('  1. Run: npm run build');
    console.log('  2. Load extension in Chrome');
    
  } catch (error) {
    console.error('\nCompilation failed:', error);
    process.exit(1);
  }
}

main();
