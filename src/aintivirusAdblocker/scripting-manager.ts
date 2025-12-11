

interface RulesetDetails {
  id: string;
  name: string;
  enabled: boolean;
  rules?: {
    plain?: number;
    regex?: number;
    removeparam?: number;
    redirect?: number;
    modifyHeaders?: number;
    strictblock?: number;
  };
  css?: {
    generic?: number;
    generichigh?: number;
    specific?: number;
    procedural?: number;
  };
}

interface ScriptletDetails {
  [rulesetId: string]: {
    MAIN?: string[];
    ISOLATED?: string[];
  };
}

interface GenericDetails {
  [rulesetId: string]: {
    hide?: string[];
    unhide?: string[];
  };
}

interface FilteringModeDetails {
  none: Set<string>;
  basic: Set<string>;
  optimal: Set<string>;
  complete: Set<string>;
}


let rulesetDetailsCache: Map<string, RulesetDetails> | null = null;
let scriptletDetailsCache: Map<string, ScriptletDetails[string]> | null = null;
let genericDetailsCache: Map<string, GenericDetails[string]> | null = null;


let registrationBarrier = false;


function matchFromHostname(hn: string): string {
  return hn === '*' || hn === 'all-urls' ? '<all_urls>' : `*://*.${hn}/*`;
}

function matchesFromHostnames(hostnames: Iterable<string>): string[] {
  const out: string[] = [];
  for (const hn of hostnames) {
    out.push(matchFromHostname(hn));
  }
  return out;
}

function isDescendantHostnameOfIter(hna: string, iterb: Iterable<string>): boolean {
  const setb = iterb instanceof Set ? iterb : new Set(iterb);
  if (setb.has('all-urls') || setb.has('*')) return true;
  let hn = hna;
  while (hn) {
    const pos = hn.indexOf('.');
    if (pos === -1) break;
    hn = hn.slice(pos + 1);
    if (setb.has(hn)) return true;
  }
  return false;
}

function intersectHostnameIters(itera: Iterable<string>, iterb: Iterable<string>): string[] {
  const setb = iterb instanceof Set ? iterb : new Set(iterb);
  if (setb.has('all-urls') || setb.has('*')) return Array.from(itera);
  const out: string[] = [];
  for (const hna of itera) {
    if (setb.has(hna) || isDescendantHostnameOfIter(hna, setb)) {
      out.push(hna);
    }
  }
  return out;
}

function subtractHostnameIters(itera: Iterable<string>, iterb: Iterable<string>): string[] {
  const setb = iterb instanceof Set ? iterb : new Set(iterb);
  if (setb.has('all-urls') || setb.has('*')) return [];
  const out: string[] = [];
  for (const hna of itera) {
    if (setb.has(hna)) continue;
    if (isDescendantHostnameOfIter(hna, setb)) continue;
    out.push(hna);
  }
  return out;
}

function strArrayEq(a: string[] | undefined, b: string[] | undefined, ordered = true): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  if (ordered) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
  } else {
    const setA = new Set(a);
    for (const item of b) {
      if (!setA.has(item)) return false;
    }
  }
  return true;
}

function normalizeMatches(matches: string[]): void {
  if (matches.length <= 1) return;
  if (matches.includes('<all_urls>') || matches.includes('*://*/*')) {
    matches.length = 0;
    matches.push('<all_urls>');
  }
}


async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const url = chrome.runtime.getURL(path.startsWith('/') ? path : `/${path}`);
    const response = await fetch(url);
    if (!response.ok) {

      return null;
    }
    return await response.json();
  } catch (error) {

    return null;
  }
}

async function getRulesetDetails(): Promise<Map<string, RulesetDetails>> {
  if (rulesetDetailsCache) {
    return rulesetDetailsCache;
  }

  const entries = await fetchJSON<RulesetDetails[]>('/aintivirusAdblocker/rulesets/ruleset-details.json');
  if (entries) {
    rulesetDetailsCache = new Map(entries.map(entry => [entry.id, entry]));
  } else {
    rulesetDetailsCache = new Map();
  }
  return rulesetDetailsCache;
}

async function getScriptletDetails(): Promise<Map<string, ScriptletDetails[string]>> {
  if (scriptletDetailsCache) {
    return scriptletDetailsCache;
  }

  const entries = await fetchJSON<[string, ScriptletDetails[string]][]>('/aintivirusAdblocker/rulesets/scriptlet-details.json');
  if (entries) {
    scriptletDetailsCache = new Map(entries);
  } else {
    scriptletDetailsCache = new Map();
  }
  return scriptletDetailsCache;
}

async function getGenericDetails(): Promise<Map<string, GenericDetails[string]>> {
  if (genericDetailsCache) {
    return genericDetailsCache;
  }

  const entries = await fetchJSON<[string, GenericDetails[string]][]>('/aintivirusAdblocker/rulesets/generic-details.json');
  if (entries) {
    genericDetailsCache = new Map(entries);
  } else {
    genericDetailsCache = new Map();
  }
  return genericDetailsCache;
}

async function getFilteringModeDetailsFromIndex(): Promise<FilteringModeDetails> {
  try {
    const data = await chrome.storage.local.get('adblocker_filteringModeDetails');
    if (data.adblocker_filteringModeDetails) {
      const raw = data.adblocker_filteringModeDetails;
      return {
        none: new Set(raw.none || []),
        basic: new Set(raw.basic || []),
        optimal: new Set(raw.optimal || []),
        complete: new Set(raw.complete || []),
      };
    }
  } catch {
  }
  
  
  return {
    none: new Set(),
    basic: new Set(),
    optimal: new Set(),
    complete: new Set(['all-urls']),
  };
}

async function getEnabledRulesetsDetails(): Promise<RulesetDetails[]> {
  const [enabledIds, rulesetDetails] = await Promise.all([
    chrome.declarativeNetRequest.getEnabledRulesets(),
    getRulesetDetails(),
  ]);

  const out: RulesetDetails[] = [];
  for (const id of enabledIds) {
    const details = rulesetDetails.get(id);
    if (details) {
      out.push(details);
    }
  }
  return out;
}


function normalizeRegisteredContentScripts(
  registered: chrome.scripting.RegisteredContentScript[]
): chrome.scripting.RegisteredContentScript[] {
  for (const entry of registered) {
    const { css = [], js = [] } = entry;
    for (let i = 0; i < css.length; i++) {
      const path = css[i];
      if (!path.startsWith('/')) {
        css[i] = `/${path}`;
      }
    }
    for (let i = 0; i < js.length; i++) {
      const path = js[i];
      if (!path.startsWith('/')) {
        js[i] = `/${path}`;
      }
    }
  }
  return registered;
}


interface RegistrationContext {
  rulesetsDetails: RulesetDetails[];
  before: Map<string, chrome.scripting.RegisteredContentScript>;
  toAdd: chrome.scripting.RegisteredContentScript[];
  toRemove: string[];
}


function registerGeneric(
  context: RegistrationContext,
  genericDetails: Map<string, GenericDetails[string]>,
  filteringModeDetails: FilteringModeDetails
): void {
  const { rulesetsDetails, before, toAdd } = context;

  const excludedByFilter: string[] = [];
  const includedByFilter: string[] = [];
  const js: string[] = [];
  
  for (const details of rulesetsDetails) {
    const hostnames = genericDetails.get(details.id);
    if (hostnames) {
      if (hostnames.unhide) {
        excludedByFilter.push(...hostnames.unhide);
      }
      if (hostnames.hide) {
        includedByFilter.push(...hostnames.hide);
      }
    }
    const count = details.css?.generic || 0;
    if (count === 0) continue;
    js.push(`/aintivirusAdblocker/rulesets/scripting/generic/${details.id}.js`);
  }

  if (js.length === 0) return;

  js.unshift('/aintivirusAdblocker/js/scripting/css-api.js', '/aintivirusAdblocker/js/scripting/isolated-api.js');
  js.push('/aintivirusAdblocker/js/scripting/css-generic.js');

  const { none, basic, optimal, complete } = filteringModeDetails;
  const includedByMode = Array.from(complete);
  const excludedByMode = [...Array.from(none), ...Array.from(basic), ...Array.from(optimal)];

  if (!complete.has('all-urls')) {
    
    const matches = [
      ...matchesFromHostnames(subtractHostnameIters(includedByMode, excludedByFilter)),
      ...matchesFromHostnames(intersectHostnameIters(includedByMode, includedByFilter)),
    ];
    if (matches.length === 0) return;
    
    const id = 'adblocker-css-generic-some';
    const registered = before.get(id);
    before.delete(id);
    
    const directive: chrome.scripting.RegisteredContentScript = {
      id,
      js,
      allFrames: true,
      matches,
      runAt: 'document_idle',
    };
    
    if (!registered) {
      toAdd.push(directive);
    } else if (!strArrayEq(registered.js, js, false) || !strArrayEq(registered.matches, matches)) {
      context.toRemove.push(id);
      toAdd.push(directive);
    }
    return;
  }

  
  const excludeMatches = [
    ...matchesFromHostnames(excludedByMode),
    ...matchesFromHostnames(excludedByFilter),
  ];
  
  const idAll = 'adblocker-css-generic-all';
  const registeredAll = before.get(idAll);
  before.delete(idAll);
  
  const directiveAll: chrome.scripting.RegisteredContentScript = {
    id: idAll,
    js,
    allFrames: true,
    matches: ['<all_urls>'],
    runAt: 'document_idle',
  };
  if (excludeMatches.length !== 0) {
    directiveAll.excludeMatches = excludeMatches;
  }
  
  if (!registeredAll) {
    toAdd.push(directiveAll);
  } else if (!strArrayEq(registeredAll.js, js, false) || !strArrayEq(registeredAll.excludeMatches, excludeMatches)) {
    context.toRemove.push(idAll);
    toAdd.push(directiveAll);
  }

  
  const matchesSome = matchesFromHostnames(subtractHostnameIters(includedByFilter, excludedByMode));
  if (matchesSome.length === 0) return;
  
  const idSome = 'adblocker-css-generic-some';
  const registeredSome = before.get(idSome);
  before.delete(idSome);
  
  const directiveSome: chrome.scripting.RegisteredContentScript = {
    id: idSome,
    js,
    allFrames: true,
    matches: matchesSome,
    runAt: 'document_idle',
  };
  
  if (!registeredSome) {
    toAdd.push(directiveSome);
  } else if (!strArrayEq(registeredSome.js, js, false) || !strArrayEq(registeredSome.matches, matchesSome)) {
    context.toRemove.push(idSome);
    toAdd.push(directiveSome);
  }
}


function registerGenericHigh(
  context: RegistrationContext,
  genericDetails: Map<string, GenericDetails[string]>,
  filteringModeDetails: FilteringModeDetails
): void {
  const { rulesetsDetails, before, toAdd } = context;

  const excludeHostnames: string[] = [];
  const includeHostnames: string[] = [];
  const css: string[] = [];
  
  for (const details of rulesetsDetails) {
    const hostnames = genericDetails.get(details.id);
    if (hostnames) {
      if (hostnames.unhide) {
        excludeHostnames.push(...hostnames.unhide);
      }
      if (hostnames.hide) {
        includeHostnames.push(...hostnames.hide);
      }
    }
    const count = details.css?.generichigh || 0;
    if (count === 0) continue;
    css.push(`/aintivirusAdblocker/rulesets/scripting/generichigh/${details.id}.css`);
  }

  if (css.length === 0) return;

  const { none, basic, optimal, complete } = filteringModeDetails;
  const matches: string[] = [];
  const excludeMatches: string[] = [];

  if (complete.has('all-urls')) {
    excludeMatches.push(...matchesFromHostnames(none));
    excludeMatches.push(...matchesFromHostnames(basic));
    excludeMatches.push(...matchesFromHostnames(optimal));
    excludeMatches.push(...matchesFromHostnames(excludeHostnames));
    matches.push('<all_urls>');
  } else {
    matches.push(...matchesFromHostnames(subtractHostnameIters(Array.from(complete), excludeHostnames)));
  }

  if (matches.length === 0) return;

  const id = 'adblocker-css-generichigh';
  const registered = before.get(id);
  before.delete(id);

  const directive: chrome.scripting.RegisteredContentScript = {
    id,
    css,
    matches,
    allFrames: true,
    runAt: 'document_end',
  };
  if (excludeMatches.length !== 0) {
    directive.excludeMatches = excludeMatches;
  }

  if (!registered) {
    toAdd.push(directive);
  } else if (!strArrayEq(registered.css, css, false) || !strArrayEq(registered.matches, matches) || !strArrayEq(registered.excludeMatches, excludeMatches)) {
    context.toRemove.push(id);
    toAdd.push(directive);
  }
}


function registerSpecific(
  context: RegistrationContext,
  filteringModeDetails: FilteringModeDetails
): void {
  const { rulesetsDetails, before, toAdd } = context;
  const js: string[] = [];

  for (const details of rulesetsDetails) {
    const count = details.css?.specific || 0;
    if (count === 0) continue;
    js.push(`/aintivirusAdblocker/rulesets/scripting/specific/${details.id}.js`);
  }

  if (js.length === 0) return;

  const { none, basic, optimal, complete } = filteringModeDetails;
  const matches = [
    ...matchesFromHostnames(optimal),
    ...matchesFromHostnames(complete),
  ];
  if (matches.length === 0) return;

  normalizeMatches(matches);

  js.unshift('/aintivirusAdblocker/js/scripting/css-api.js', '/aintivirusAdblocker/js/scripting/isolated-api.js');
  js.push('/aintivirusAdblocker/js/scripting/css-specific.js');

  const excludeMatches: string[] = [];
  if (!none.has('all-urls')) {
    excludeMatches.push(...matchesFromHostnames(none));
  }
  if (!basic.has('all-urls')) {
    excludeMatches.push(...matchesFromHostnames(basic));
  }

  const id = 'adblocker-css-specific';
  const registered = before.get(id);
  before.delete(id);

  const directive: chrome.scripting.RegisteredContentScript = {
    id,
    js,
    matches,
    allFrames: true,
    runAt: 'document_start',
  };
  if (excludeMatches.length !== 0) {
    directive.excludeMatches = excludeMatches;
  }

  if (!registered) {
    toAdd.push(directive);
  } else if (!strArrayEq(registered.js, js, false) || !strArrayEq(registered.matches, matches) || !strArrayEq(registered.excludeMatches, excludeMatches)) {
    context.toRemove.push(id);
    toAdd.push(directive);
  }
}


function registerProcedural(
  context: RegistrationContext,
  filteringModeDetails: FilteringModeDetails
): void {
  const { rulesetsDetails, before, toAdd } = context;
  const js: string[] = [];

  for (const rulesetDetails of rulesetsDetails) {
    const count = rulesetDetails.css?.procedural || 0;
    if (count === 0) continue;
    js.push(`/aintivirusAdblocker/rulesets/scripting/procedural/${rulesetDetails.id}.js`);
  }
  if (js.length === 0) return;

  const { none, basic, optimal, complete } = filteringModeDetails;
  const matches = [
    ...matchesFromHostnames(optimal),
    ...matchesFromHostnames(complete),
  ];
  if (matches.length === 0) return;

  normalizeMatches(matches);

  js.unshift('/aintivirusAdblocker/js/scripting/css-api.js', '/aintivirusAdblocker/js/scripting/isolated-api.js', '/aintivirusAdblocker/js/scripting/css-procedural-api.js');
  js.push('/aintivirusAdblocker/js/scripting/css-procedural.js');

  const excludeMatches: string[] = [];
  if (!none.has('all-urls') && !basic.has('all-urls')) {
    const toExclude = [
      ...matchesFromHostnames(none),
      ...matchesFromHostnames(basic),
    ];
    excludeMatches.push(...toExclude);
  }

  const id = 'adblocker-css-procedural';
  const registered = before.get(id);
  before.delete(id);

  const directive: chrome.scripting.RegisteredContentScript = {
    id,
    js,
    matches,
    allFrames: true,
    runAt: 'document_start',
  };
  if (excludeMatches.length !== 0) {
    directive.excludeMatches = excludeMatches;
  }

  if (!registered) {
    toAdd.push(directive);
  } else if (!strArrayEq(registered.js, js, false) || !strArrayEq(registered.matches, matches) || !strArrayEq(registered.excludeMatches, excludeMatches)) {
    context.toRemove.push(id);
    toAdd.push(directive);
  }
}


function registerScriptlets(
  context: RegistrationContext,
  scriptletDetails: Map<string, ScriptletDetails[string]>,
  filteringModeDetails: FilteringModeDetails
): void {
  const { rulesetsDetails, before, toAdd } = context;

  const hasBroadHostPermission =
    filteringModeDetails.optimal.has('all-urls') ||
    filteringModeDetails.complete.has('all-urls');

  const permissionRevokedMatches = [
    ...matchesFromHostnames(filteringModeDetails.none),
    ...matchesFromHostnames(filteringModeDetails.basic),
  ];
  const permissionGrantedHostnames = [
    ...Array.from(filteringModeDetails.optimal),
    ...Array.from(filteringModeDetails.complete),
  ];

  for (const rulesetId of rulesetsDetails.map(v => v.id)) {
    const worlds = scriptletDetails.get(rulesetId);
    if (!worlds) continue;
    
    for (const world of Object.keys(worlds)) {
      const id = `adblocker-scriptlet-${rulesetId}-${world.toLowerCase()}`;

      const matches: string[] = [];
      const excludeMatches: string[] = [];
      const hostnames = worlds[world as keyof typeof worlds];
      let targetHostnames: string[] = [];
      
      if (hasBroadHostPermission) {
        excludeMatches.push(...permissionRevokedMatches);
        targetHostnames = hostnames || [];
      } else if (permissionGrantedHostnames.length !== 0) {
        if (hostnames && hostnames.includes('*')) {
          targetHostnames = permissionGrantedHostnames;
        } else {
          targetHostnames = intersectHostnameIters(hostnames || [], permissionGrantedHostnames);
        }
      }
      if (targetHostnames.length === 0) continue;
      
      matches.push(...matchesFromHostnames(targetHostnames));
      normalizeMatches(matches);

      const registered = before.get(id);
      before.delete(id);

      const directive: chrome.scripting.RegisteredContentScript = {
        id,
        js: [`/aintivirusAdblocker/rulesets/scripting/scriptlet/${world.toLowerCase()}/${rulesetId}.js`],
        matches,
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: 'document_start',
        world: world as 'MAIN' | 'ISOLATED',
      };
      if (excludeMatches.length !== 0) {
        directive.excludeMatches = excludeMatches;
      }

      if (!registered) {
        toAdd.push(directive);
      } else if (!strArrayEq(registered.matches, matches) || !strArrayEq(registered.excludeMatches, excludeMatches)) {
        context.toRemove.push(id);
        toAdd.push(directive);
      }
    }
  }
}


export async function registerInjectables(): Promise<boolean> {
  if (typeof chrome.scripting === 'undefined') {
    return false;
  }

  if (registrationBarrier) {
    return true;
  }
  registrationBarrier = true;

  try {
    const [
      filteringModeDetails,
      rulesetsDetails,
      scriptletDetails,
      genericDetails,
      registered,
    ] = await Promise.all([
      getFilteringModeDetailsFromIndex(),
      getEnabledRulesetsDetails(),
      getScriptletDetails(),
      getGenericDetails(),
      chrome.scripting.getRegisteredContentScripts(),
    ]);

    const before = new Map(
      normalizeRegisteredContentScripts(registered)
        .filter(r => r.id.startsWith('adblocker-'))
        .map(entry => [entry.id, entry])
    );

    if (rulesetsDetails.length === 0) {
      if (before.size > 0) {
        await chrome.scripting.unregisterContentScripts({
          ids: Array.from(before.keys()),
        });
      }
      registrationBarrier = false;
      return true;
    }

    const context: RegistrationContext = {
      rulesetsDetails,
      before,
      toAdd: [],
      toRemove: [],
    };

    
    registerProcedural(context, filteringModeDetails);
    registerScriptlets(context, scriptletDetails, filteringModeDetails);
    registerSpecific(context, filteringModeDetails);
    registerGeneric(context, genericDetails, filteringModeDetails);
    registerGenericHigh(context, genericDetails, filteringModeDetails);

    
    context.toRemove.push(...Array.from(before.keys()));

    if (context.toRemove.length > 0) {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: context.toRemove });
      } catch (error) {
      }
    }

    if (context.toAdd.length > 0) {
      try {
        await chrome.scripting.registerContentScripts(context.toAdd);
      } catch (error) {
      }
    }

    registrationBarrier = false;
    return true;
  } catch (error) {
    registrationBarrier = false;
    return false;
  }
}


export async function unregisterAllInjectables(): Promise<void> {
  if (typeof chrome.scripting === 'undefined') {
    return;
  }

  try {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const adblockerScripts = registered.filter(r => r.id.startsWith('adblocker-'));

    if (adblockerScripts.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: adblockerScripts.map(s => s.id),
      });

    }
  } catch (error) {

  }
}


export const registerCosmeticFiltering = registerInjectables;
export const unregisterCosmeticFiltering = unregisterAllInjectables;
