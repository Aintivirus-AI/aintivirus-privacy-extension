

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


let rulesetDetailsCache: Map<string, RulesetDetails> | null = null;
let scriptletDetailsCache: Map<string, ScriptletDetails[string]> | null = null;
let genericDetailsCache: Map<string, GenericDetails[string]> | null = null;


let registrationBarrier = false;


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

  const entries = await fetchJSON<RulesetDetails[]>('/ubol/rulesets/ruleset-details.json');
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

  const entries = await fetchJSON<[string, ScriptletDetails[string]][]>('/ubol/rulesets/scriptlet-details.json');
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

  const entries = await fetchJSON<[string, GenericDetails[string]][]>('/ubol/rulesets/generic-details.json');
  if (entries) {
    genericDetailsCache = new Map(entries);
  } else {
    genericDetailsCache = new Map();
  }
  return genericDetailsCache;
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
  genericDetails: Map<string, GenericDetails[string]>
): void {
  const { rulesetsDetails, before, toAdd } = context;
  const js: string[] = [];

  for (const details of rulesetsDetails) {
    const count = details.css?.generic || 0;
    if (count === 0) continue;
    js.push(`/ubol/rulesets/scripting/generic/${details.id}.js`);
  }

  if (js.length === 0) return;

  
  js.unshift('/ubol/js/scripting/css-api.js', '/ubol/js/scripting/isolated-api.js');
  js.push('/ubol/js/scripting/css-generic.js');

  const id = 'ubol-css-generic';
  const registered = before.get(id);
  before.delete(id);

  const directive: chrome.scripting.RegisteredContentScript = {
    id,
    js,
    matches: ['<all_urls>'],
    allFrames: true,
    runAt: 'document_idle',
  };

  if (!registered) {
    toAdd.push(directive);
  } else if (!arraysEqual(registered.js || [], js)) {
    context.toRemove.push(id);
    toAdd.push(directive);
  }
}


function registerGenericHigh(
  context: RegistrationContext,
  genericDetails: Map<string, GenericDetails[string]>
): void {
  const { rulesetsDetails, before, toAdd } = context;
  const css: string[] = [];

  for (const details of rulesetsDetails) {
    const count = details.css?.generichigh || 0;
    if (count === 0) continue;
    css.push(`/ubol/rulesets/scripting/generichigh/${details.id}.css`);
  }

  if (css.length === 0) return;

  const id = 'ubol-css-generichigh';
  const registered = before.get(id);
  before.delete(id);

  const directive: chrome.scripting.RegisteredContentScript = {
    id,
    css,
    matches: ['<all_urls>'],
    allFrames: true,
    runAt: 'document_end',
  };

  if (!registered) {
    toAdd.push(directive);
  } else if (!arraysEqual(registered.css || [], css)) {
    context.toRemove.push(id);
    toAdd.push(directive);
  }
}


function registerSpecific(context: RegistrationContext): void {
  const { rulesetsDetails, before, toAdd } = context;
  const js: string[] = [];

  for (const details of rulesetsDetails) {
    const count = details.css?.specific || 0;
    if (count === 0) continue;
    js.push(`/ubol/rulesets/scripting/specific/${details.id}.js`);
  }

  if (js.length === 0) return;

  js.unshift('/ubol/js/scripting/css-api.js', '/ubol/js/scripting/isolated-api.js');
  js.push('/ubol/js/scripting/css-specific.js');

  const id = 'ubol-css-specific';
  const registered = before.get(id);
  before.delete(id);

  const directive: chrome.scripting.RegisteredContentScript = {
    id,
    js,
    matches: ['<all_urls>'],
    allFrames: true,
    runAt: 'document_start',
  };

  if (!registered) {
    toAdd.push(directive);
  } else if (!arraysEqual(registered.js || [], js)) {
    context.toRemove.push(id);
    toAdd.push(directive);
  }
}


function registerProcedural(context: RegistrationContext): void {
  const { rulesetsDetails, before, toAdd } = context;
  const js: string[] = [];

  for (const details of rulesetsDetails) {
    const count = details.css?.procedural || 0;
    if (count === 0) continue;
    js.push(`/ubol/rulesets/scripting/procedural/${details.id}.js`);
  }

  if (js.length === 0) return;

  
  js.unshift(
    '/ubol/js/scripting/css-api.js',
    '/ubol/js/scripting/isolated-api.js',
    '/ubol/js/scripting/css-procedural-api.js'
  );
  js.push('/ubol/js/scripting/css-procedural.js');

  const id = 'ubol-css-procedural';
  const registered = before.get(id);
  before.delete(id);

  const directive: chrome.scripting.RegisteredContentScript = {
    id,
    js,
    matches: ['<all_urls>'],
    allFrames: true,
    runAt: 'document_start',
  };

  if (!registered) {
    toAdd.push(directive);
  } else if (!arraysEqual(registered.js || [], js)) {
    context.toRemove.push(id);
    toAdd.push(directive);
  }
}


function registerScriptlets(
  context: RegistrationContext,
  scriptletDetails: Map<string, ScriptletDetails[string]>
): void {
  const { rulesetsDetails, before, toAdd } = context;

  for (const details of rulesetsDetails) {
    const worlds = scriptletDetails.get(details.id);
    if (!worlds) continue;

    for (const [world, hostnames] of Object.entries(worlds)) {
      if (!hostnames || hostnames.length === 0) continue;

      const id = `ubol-scriptlet-${details.id}-${world.toLowerCase()}`;
      const registered = before.get(id);
      before.delete(id);

      const directive: chrome.scripting.RegisteredContentScript = {
        id,
        js: [`/ubol/rulesets/scripting/scriptlet/${world.toLowerCase()}/${details.id}.js`],
        matches: ['<all_urls>'],
        allFrames: true,
        runAt: 'document_start',
        world: world as 'MAIN' | 'ISOLATED',
        matchOriginAsFallback: true,
      };

      if (!registered) {
        toAdd.push(directive);
      }
    }
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
      rulesetsDetails,
      scriptletDetails,
      genericDetails,
      registered,
    ] = await Promise.all([
      getEnabledRulesetsDetails(),
      getScriptletDetails(),
      getGenericDetails(),
      chrome.scripting.getRegisteredContentScripts(),
    ]);

    
    const before = new Map(
      normalizeRegisteredContentScripts(registered)
        .filter(r => r.id.startsWith('ubol-'))
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

    
    registerGeneric(context, genericDetails);
    registerGenericHigh(context, genericDetails);
    registerSpecific(context);
    registerProcedural(context);
    registerScriptlets(context, scriptletDetails);

    
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
    const ubolScripts = registered.filter(r => r.id.startsWith('ubol-'));

    if (ubolScripts.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: ubolScripts.map(s => s.id),
      });

    }
  } catch (error) {

  }
}


export const registerCosmeticFiltering = registerInjectables;
export const unregisterCosmeticFiltering = unregisterAllInjectables;
