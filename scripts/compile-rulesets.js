#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG = {
  cacheDir: path.join(__dirname, '../.filter-cache'),
  rulesDir: path.join(__dirname, '../rules'),
  maxRulesPerRuleset: 30000,
  cacheTTL: 24 * 60 * 60 * 1000,
};

const FILTER_LISTS = {
  ads: [
    {
      name: 'EasyList',
      url: 'https://easylist.to/easylist/easylist.txt',
    },
    {
      name: 'Aintivirus Adblocker Filters',
      url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    },
  ],
  privacy: [
    {
      name: 'EasyPrivacy',
      url: 'https://easylist.to/easylist/easyprivacy.txt',
    },
    {
      name: 'Aintivirus Adblocker Privacy',
      url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    },
  ],
};

const RESOURCE_TYPE_MAP = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  css: 'stylesheet',
  object: 'object',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  subdocument: 'sub_frame',
  sub_frame: 'sub_frame',
  ping: 'ping',
  media: 'media',
  font: 'font',
  websocket: 'websocket',
  other: 'other',
};

const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'script',
  'image',
  'stylesheet',
  'object',
  'xmlhttprequest',
  'ping',
  'media',
  'font',
  'websocket',
  'other',
];

async function fetchWithCache(url, forceRefresh = false) {
  const cacheFile = path.join(
    CONFIG.cacheDir,
    Buffer.from(url).toString('base64').slice(0, 50) + '.txt',
  );

  if (!forceRefresh && fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    if (Date.now() - stats.mtimeMs < CONFIG.cacheTTL) {
      return fs.readFileSync(cacheFile, 'utf-8');
    }
  }
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Aintivirus-Ruleset-Compiler/1.0',
          Accept: 'text/plain',
        },
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          fetchWithCache(response.headers.location, forceRefresh).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
          fs.writeFileSync(cacheFile, data);
          resolve(data);
        });
      },
    );
    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function parseFilterRule(rule) {
  let trimmed = rule.trim();

  if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) return null;
  if (trimmed.startsWith('[Adblock')) return null;
  if (trimmed.includes('##') || trimmed.includes('#@#')) return null;
  if (trimmed.includes('#$#') || trimmed.includes('#@$#')) return null;
  if (trimmed.includes('##+js') || trimmed.includes('#@#+js')) return null;

  const isAllow = trimmed.startsWith('@@');
  if (isAllow) trimmed = trimmed.slice(2);

  const dollarIndex = trimmed.indexOf('$');
  let pattern = dollarIndex >= 0 ? trimmed.slice(0, dollarIndex) : trimmed;
  const modifiers = dollarIndex >= 0 ? trimmed.slice(dollarIndex + 1).split(',') : [];

  let resourceTypes = [];
  let domains = undefined;
  let excludedDomains = undefined;
  let isThirdParty = undefined;
  let hasUnsupportedModifier = false;

  for (const mod of modifiers) {
    const modLower = mod.toLowerCase().trim();

    if (RESOURCE_TYPE_MAP[modLower]) {
      resourceTypes.push(RESOURCE_TYPE_MAP[modLower]);
      continue;
    }

    if (modLower.startsWith('~') && RESOURCE_TYPE_MAP[modLower.slice(1)]) {
      if (resourceTypes.length === 0) resourceTypes = [...ALL_RESOURCE_TYPES];
      resourceTypes = resourceTypes.filter((t) => t !== RESOURCE_TYPE_MAP[modLower.slice(1)]);
      continue;
    }

    if (modLower === 'third-party' || modLower === '3p') {
      isThirdParty = true;
      continue;
    }
    if (
      modLower === '~third-party' ||
      modLower === '~3p' ||
      modLower === 'first-party' ||
      modLower === '1p'
    ) {
      isThirdParty = false;
      continue;
    }

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

    if (
      [
        'popup',
        'document',
        'csp',
        'redirect',
        'redirect-rule',
        'removeparam',
        'important',
        'badfilter',
        'match-case',
        'all',
        'frame',
      ].includes(modLower)
    ) {
      hasUnsupportedModifier = true;
    }
  }

  if (hasUnsupportedModifier) return null;

  if (resourceTypes.length === 0) resourceTypes = [...ALL_RESOURCE_TYPES];

  const isDomainAnchored = pattern.startsWith('||');
  if (isDomainAnchored) pattern = pattern.slice(2);

  if (pattern.startsWith('|')) pattern = pattern.slice(1);
  if (pattern.endsWith('|')) pattern = pattern.slice(0, -1);

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

function convertToDNR(parsed, ruleId) {
  try {
    let urlFilter = parsed.pattern;
    if (parsed.isDomainAnchored) urlFilter = '||' + urlFilter;

    if (urlFilter.length > 4096) return null;

    const rule = {
      id: ruleId,
      priority: parsed.type === 'allow' ? 2 : 1,
      action: { type: parsed.type },
      condition: {
        urlFilter,
        resourceTypes: parsed.resourceTypes,
      },
    };

    if (parsed.domains?.length > 0) {
      rule.condition.initiatorDomains = parsed.domains;
    }
    if (parsed.excludedDomains?.length > 0) {
      rule.condition.excludedInitiatorDomains = parsed.excludedDomains;
    }

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

async function compileRuleset(name, lists, startId, forceRefresh) {
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
    } catch (error) {}
  }
  return allRules;
}

function generateCustomRuleset() {
  const rules = [];
  let id = 1;

  const trackerDomains = [
    'sentry.io',
    'browser.sentry-cdn.com',
    'sentry-cdn.com',
    'bugsnag.com',
    'd2wy8f7a9ursnm.cloudfront.net',
    'sessions.bugsnag.com',
    'notify.bugsnag.com',
    'app.bugsnag.com',
    'rollbar.com',
    'raygun.com',
    'trackjs.com',
    'logrocket.com',
    'logrocket.io',
    'lr-ingest.io',
    'google-analytics.com',
    'googleadservices.com',
    'googlesyndication.com',
    'doubleclick.net',
    'googletagmanager.com',
    'googletagservices.com',
    'taboola.com',
    'outbrain.com',
    'criteo.com',
    'criteo.net',
    'adroll.com',
    'adsrvr.org',
    'pubmatic.com',
    'hotjar.com',
    'mixpanel.com',
    'segment.io',
    'segment.com',
    'amplitude.com',
    'heapanalytics.com',
    'fullstory.com',
    'facebook.net',
    'connect.facebook.net',
    'analytics.twitter.com',
    'trackersimulator.org',
    'eviltracker.net',
    'do-not-tracker.org',
    // TurtleCute adblock test domains
    'analyticsengine.s3.amazonaws.com',
    'analytics.s3.amazonaws.com',
    'an.facebook.com',
    'ads-api.twitter.com',
    'ads-api.tiktok.com',
    'ads-sg.tiktok.com',
    'business-api.tiktok.com',
    'ads.tiktok.com',
    'log.byteoversea.com',
    'udcm.yahoo.com',
    'analytics.query.yahoo.com',
    'log.fc.yahoo.com',
    'gemini.yahoo.com',
    'adtech.yahooinc.com',
    'adfstat.yandex.ru',
    'appmetrica.yandex.ru',
    'metrika.yandex.ru',
    // Unity Ads
    'auction.unityads.unity3d.com',
    'webview.unityads.unity3d.com',
    'config.unityads.unity3d.com',
    'adserver.unityads.unity3d.com',
    // Realme telemetry
    'iot-eu-logser.realme.com',
    'iot-logser.realme.com',
    'bdapi-ads.realmemobile.com',
    'bdapi-in-ads.realmemobile.com',
    // Xiaomi telemetry
    'data.mistat.xiaomi.com',
    'data.mistat.india.xiaomi.com',
    'data.mistat.rus.xiaomi.com',
    'tracking.rus.miui.com',
    // Oppo ads
    'adsfs.oppomobile.com',
    'adx.ads.oppomobile.com',
    'ck.ads.oppomobile.com',
    'data.ads.oppomobile.com',
    // Huawei
    'grs.hicloud.com',
    // Apple ads/analytics
    'iadsdk.apple.com',
    'api-adservices.apple.com',
    'books-analytics-events.apple.com',
    'weather-analytics-events.apple.com',
    'notes-analytics-events.apple.com',
    'xp.apple.com',
    // Social media ads/tracking
    'graph.facebook.com',
    'tr.facebook.com',
    'graph.instagram.com',
    'i.instagram.com',
    'ads.snapchat.com',
    'ads-api.x.com',
    'ads.x.com',
    'snap.licdn.com',
    'd.reddit.com',
    'pixel.quora.com',
    'ads.vk.com',
    // Huawei
    'ads.huawei.com',
    // LG
    'ngfts.lge.com',
    // Microsoft telemetry
    'settings-win.data.microsoft.com',
    'vortex-win.data.microsoft.com',
    'watson.telemetry.microsoft.com',
    // Amazon ads/metrics
    'device-metrics-us.amazon.com',
    'device-metrics-us-2.amazon.com',
    'mads-eu.amazon.com',
    // Roku
    'ads.roku.com',
    // Consent/cookie management (often used for tracking)
    'cdn.cookielaw.org',
    'geolocation.onetrust.com',
    'consent.cookiebot.com',
    'consentcdn.cookiebot.com',
    'cookiebot.com',
    'consent.trustarc.com',
    'sdk.privacy-center.org',
    'cdn.privacy-mgmt.com',
    'app.usercentrics.eu',
    // A/B testing & personalization
    'cdn.optimizely.com',
    'api.optimizely.com',
    'cdn.dynamicyield.com',
    // Chat widgets (tracking)
    'widget.intercom.io',
    'js.driftt.com',
    // Video ads
    'dai.google.com',
    'g.jwpsrv.com',
    'ssl.p.jwpcdn.com',
    // AppLovin
    'applovin.com',
    'd.applovin.com',
    'rt.applovin.com',
    'ms.applovin.com',
    // Mobile ad networks
    'liftoff.io',
    'api.fyber.com',
    'inmobi.com',
    'ironsource.mobi',
    'pangleglobal.com',
    // Microsoft ads
    'bingads.microsoft.com',
    'ads.microsoft.com',
    // Unity ads (main domain)
    'unityads.unity3d.com',
    // YouTube/Google tracking
    's.youtube.com',
    'redirector.googlevideo.com',
    'youtubei.googleapis.com',
    'tagmanager.google.com',
    // Ad tech & fingerprinting
    'quantcast.com',
    'fingerprintjs.com',
    'thetradedesk.com',
    'smartclip.com',
    // Affiliate/attribution
    'bnc.lt',
    '2giga.link',
    'greatis.com',
    'impact.com',
    'api.impact.com',
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

  // Script blocking rules for TurtleCute adblock test
  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '/pagead.js',
      resourceTypes: ['script'],
    },
  });

  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '/widget/ads.',
      resourceTypes: ['script', 'xmlhttprequest', 'image', 'sub_frame', 'other'],
    },
  });

  // VK retargeting pixel (path-based)
  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||vk.com/rtrg',
      resourceTypes: ALL_RESOURCE_TYPES,
    },
  });

  return rules;
}

function generateFixesRuleset() {
  const rules = [];
  let id = 1;

  rules.push({
    id: id++,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/noop-sentry.js' },
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
      redirect: { extensionPath: '/noop-sentry.js' },
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
      redirect: { extensionPath: '/noop-sentry.js' },
    },
    condition: {
      regexFilter: '.*\\.sentry-cdn\\.com.*bundle.*\\.js',
      resourceTypes: ['script'],
      isUrlFilterCaseSensitive: false,
    },
  });

  rules.push({
    id: id++,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/noop-bugsnag.js' },
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
      redirect: { extensionPath: '/noop-bugsnag.js' },
    },
    condition: {
      urlFilter: '||d2wy8f7a9ursnm.cloudfront.net^',
      resourceTypes: ['script'],
    },
  });

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

  const adImagePatterns = [
    '/ads/*',
    '/ad/*',
    '*_ad.*',
    '*-ad.*',
    '*/advertisement/*',
    '*/sponsor/*',
    '/flash/*',
  ];

  for (const pattern of adImagePatterns) {
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: pattern,
        resourceTypes: ['image'],
        isUrlFilterCaseSensitive: false,
      },
    });
  }

  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: {
      regexFilter: 'pixel\\.gif|.*/1x1\\.gif|.*/clear\\.gif|.*/spacer\\.gif',
      resourceTypes: ['image'],
      isUrlFilterCaseSensitive: false,
    },
  });

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
  return rules;
}

function writeRuleset(name, rules) {
  fs.mkdirSync(CONFIG.rulesDir, { recursive: true });
  const filePath = path.join(CONFIG.rulesDir, `static_ruleset_${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(rules, null, 2));
}

async function main() {
  const forceRefresh = process.argv.includes('--force');
  if (forceRefresh) {
  }

  try {
    const adsRules = await compileRuleset('ads', FILTER_LISTS.ads, 1, forceRefresh);
    writeRuleset('ads', adsRules);

    const privacyRules = await compileRuleset(
      'privacy',
      FILTER_LISTS.privacy,
      100001,
      forceRefresh,
    );
    writeRuleset('privacy', privacyRules);

    const customRules = generateCustomRuleset();
    writeRuleset('custom', customRules);

    const fixesRules = generateFixesRuleset();
    writeRuleset('fixes', fixesRules);
  } catch (error) {
    process.exit(1);
  }
}

main();
