import { ParsedFilterRule, PrivacyDNRRule, MAX_DYNAMIC_RULES } from './types';

type ResourceType = chrome.declarativeNetRequest.ResourceType;

const RESOURCE_TYPE_MAP: { [key: string]: string } = {
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

const ALL_RESOURCE_TYPES: string[] = [
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

export function parseFilterRule(rule: string): ParsedFilterRule | null {
  let trimmed = rule.trim();

  if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) {
    return null;
  }

  if (
    trimmed.includes('##') ||
    trimmed.includes('#@#') ||
    trimmed.includes('#$#') ||
    trimmed.includes('#@$#') ||
    trimmed.includes('##+js') ||
    trimmed.includes('#@#+js')
  ) {
    return null;
  }

  const isAllow = trimmed.startsWith('@@');
  if (isAllow) {
    trimmed = trimmed.slice(2);
  }

  if (trimmed.startsWith('*') && !trimmed.startsWith('||')) {
    return {
      raw: rule,
      type: isAllow ? 'allow' : 'block',
      pattern: trimmed,
      isDomainAnchored: false,
      resourceTypes: ALL_RESOURCE_TYPES as ResourceType[],
      domains: undefined,
      excludedDomains: undefined,
    };
  }

  const dollarIndex = trimmed.indexOf('$');
  let pattern = dollarIndex >= 0 ? trimmed.slice(0, dollarIndex) : trimmed;
  const modifiers = dollarIndex >= 0 ? trimmed.slice(dollarIndex + 1).split(',') : [];

  let resourceTypes: string[] = [];
  let domains: string[] | undefined;
  let excludedDomains: string[] | undefined;
  let isThirdParty: boolean | undefined;

  for (const mod of modifiers) {
    const modLower = mod.toLowerCase().trim();

    if (RESOURCE_TYPE_MAP[modLower]) {
      resourceTypes.push(RESOURCE_TYPE_MAP[modLower]);
      continue;
    }

    if (modLower.startsWith('~') && RESOURCE_TYPE_MAP[modLower.slice(1)]) {
      if (resourceTypes.length === 0) {
        resourceTypes = [...ALL_RESOURCE_TYPES];
      }
      const excludeType = RESOURCE_TYPE_MAP[modLower.slice(1)];
      resourceTypes = resourceTypes.filter((t) => t !== excludeType);
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
        if (d.startsWith('~')) {
          excludedDomains.push(d.slice(1));
        } else {
          domains.push(d);
        }
      }

      if (domains.length === 0) domains = undefined;
      if (excludedDomains.length === 0) excludedDomains = undefined;
      continue;
    }
  }

  if (resourceTypes.length === 0) {
    resourceTypes = [...ALL_RESOURCE_TYPES];
  }

  const isDomainAnchored = pattern.startsWith('||');
  if (isDomainAnchored) {
    pattern = pattern.slice(2);
  }

  if (pattern.startsWith('|')) {
    pattern = pattern.slice(1);
  }

  if (pattern.endsWith('|')) {
    pattern = pattern.slice(0, -1);
  }

  if (!pattern || pattern === '*' || pattern === '^') {
    return null;
  }

  return {
    raw: rule,
    type: isAllow ? 'allow' : 'block',
    pattern,
    isDomainAnchored,
    resourceTypes: resourceTypes as ResourceType[],
    domains,
    excludedDomains,
  };
}

export function convertToDNRRule(parsed: ParsedFilterRule, ruleId: number): PrivacyDNRRule | null {
  try {
    let urlFilter = parsed.pattern;

    if (parsed.isDomainAnchored) {
      urlFilter = '||' + urlFilter;
    }

    const rule: PrivacyDNRRule = {
      id: ruleId,
      priority: parsed.type === 'allow' ? 2 : 1,
      action: {
        type: (parsed.type === 'allow'
          ? 'allow'
          : 'block') as chrome.declarativeNetRequest.RuleActionType,
      },
      condition: {
        urlFilter,
        resourceTypes: parsed.resourceTypes,
      },
    };

    if (parsed.domains && parsed.domains.length > 0) {
      rule.condition.initiatorDomains = parsed.domains;
    }
    if (parsed.excludedDomains && parsed.excludedDomains.length > 0) {
      rule.condition.excludedInitiatorDomains = parsed.excludedDomains;
    }

    return rule;
  } catch (error) {
    return null;
  }
}

export function convertFilterRulesToDNR(filterRules: string[], startId = 1): PrivacyDNRRule[] {
  const dnrRules: PrivacyDNRRule[] = [];
  const seenPatterns = new Set<string>();
  let currentId = startId;

  for (const rule of filterRules) {
    if (dnrRules.length >= MAX_DYNAMIC_RULES) {
      break;
    }

    const parsed = parseFilterRule(rule);
    if (!parsed) continue;

    const key = `${parsed.type}:${parsed.pattern}`;
    if (seenPatterns.has(key)) continue;
    seenPatterns.add(key);

    const dnrRule = convertToDNRRule(parsed, currentId);
    if (dnrRule) {
      dnrRules.push(dnrRule);
      currentId++;
    }
  }

  return dnrRules;
}

export function createDomainBlockRule(domain: string, ruleId: number): PrivacyDNRRule {
  return {
    id: ruleId,
    priority: 1,
    action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ALL_RESOURCE_TYPES as ResourceType[],
    },
  };
}

export function createSiteExceptionRule(domain: string, ruleId: number): PrivacyDNRRule {
  return {
    id: ruleId,
    priority: 100,
    action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      initiatorDomains: [domain],
      resourceTypes: ALL_RESOURCE_TYPES as ResourceType[],
    },
  };
}

export function validateDNRRule(rule: PrivacyDNRRule): boolean {
  if (!rule.id || !rule.action || !rule.condition) {
    return false;
  }

  if (
    !['block', 'allow', 'redirect', 'modifyHeaders', 'upgradeScheme'].includes(rule.action.type)
  ) {
    return false;
  }

  if (
    !rule.condition.urlFilter &&
    !rule.condition.regexFilter &&
    !rule.condition.requestDomains &&
    !rule.condition.initiatorDomains
  ) {
    return false;
  }

  if (rule.condition.resourceTypes && rule.condition.resourceTypes.length === 0) {
    return false;
  }

  return true;
}

export function filterValidRules(rules: PrivacyDNRRule[]): PrivacyDNRRule[] {
  return rules.filter((rule) => {
    const isValid = validateDNRRule(rule);
    if (!isValid) {
    }
    return isValid;
  });
}

export function getRuleStats(rules: PrivacyDNRRule[]): {
  total: number;
  block: number;
  allow: number;
  byResourceType: { [type: string]: number };
} {
  const stats = {
    total: rules.length,
    block: 0,
    allow: 0,
    byResourceType: {} as { [type: string]: number },
  };

  for (const rule of rules) {
    if (rule.action.type === 'block') stats.block++;
    if (rule.action.type === 'allow') stats.allow++;

    for (const type of rule.condition.resourceTypes || []) {
      stats.byResourceType[type] = (stats.byResourceType[type] || 0) + 1;
    }
  }

  return stats;
}
