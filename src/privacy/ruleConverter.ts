/**
 * AINTIVIRUS Rule Converter
 * 
 * Converts ABP/uBlock Origin filter syntax to Chrome Declarative Net Request (DNR) rules.
 * 
 * Supported filter syntax:
 * - ||domain.com^ (domain anchor block)
 * - ||domain.com/path (URL pattern block)
 * - @@||domain.com^ (allowlist exception)
 * - Modifiers: $script, $image, $xhr, $third-party, $domain=
 * 
 * Chrome DNR has a limit of 5000 dynamic rules, so we prioritize and deduplicate.
 */

import { 
  ParsedFilterRule, 
  PrivacyDNRRule, 
  MAX_DYNAMIC_RULES 
} from './types';

// Type alias for resource types to avoid overly strict type checking
type ResourceType = chrome.declarativeNetRequest.ResourceType;

/**
 * Resource type mapping from ABP syntax to Chrome DNR
 * Using string type and casting at usage to avoid TypeScript strictness issues
 */
const RESOURCE_TYPE_MAP: { [key: string]: string } = {
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

/**
 * All resource types for rules without type modifiers
 */
const ALL_RESOURCE_TYPES: string[] = [
  'script',
  'image',
  'stylesheet',
  'object',
  'xmlhttprequest',
  'sub_frame',
  'ping',
  'media',
  'font',
  'websocket',
  'other',
];

/**
 * Parse a single ABP/uBlock filter rule
 */
export function parseFilterRule(rule: string): ParsedFilterRule | null {
  let trimmed = rule.trim();
  
  // Skip empty or comment rules
  if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) {
    return null;
  }
  
  // Skip cosmetic/element hiding rules - these are handled separately
  if (trimmed.includes('##') || trimmed.includes('#@#') ||
      trimmed.includes('#$#') || trimmed.includes('#@$#') ||
      trimmed.includes('##+js') || trimmed.includes('#@#+js')) {
    return null;
  }
  
  // Determine if it's an allowlist rule
  const isAllow = trimmed.startsWith('@@');
  if (isAllow) {
    trimmed = trimmed.slice(2);
  }
  
  // Handle wildcard URL patterns (e.g., */ads/*, *banner.gif)
  // These are simpler patterns that work on any domain
  if (trimmed.startsWith('*') && !trimmed.startsWith('||')) {
    // This is a wildcard pattern, convert to DNR urlFilter format
    return {
      raw: rule,
      type: isAllow ? 'allow' : 'block',
      pattern: trimmed, // Keep the pattern with wildcards
      isDomainAnchored: false,
      resourceTypes: ALL_RESOURCE_TYPES as ResourceType[],
      domains: undefined,
      excludedDomains: undefined,
    };
  }
  
  // Split rule and modifiers
  const dollarIndex = trimmed.indexOf('$');
  let pattern = dollarIndex >= 0 ? trimmed.slice(0, dollarIndex) : trimmed;
  const modifiers = dollarIndex >= 0 ? trimmed.slice(dollarIndex + 1).split(',') : [];
  
  // Parse modifiers
  let resourceTypes: string[] = [];
  let domains: string[] | undefined;
  let excludedDomains: string[] | undefined;
  let isThirdParty: boolean | undefined;
  
  for (const mod of modifiers) {
    const modLower = mod.toLowerCase().trim();
    
    // Resource type modifiers
    if (RESOURCE_TYPE_MAP[modLower]) {
      resourceTypes.push(RESOURCE_TYPE_MAP[modLower]);
      continue;
    }
    
    // Negated resource type (e.g., ~script)
    if (modLower.startsWith('~') && RESOURCE_TYPE_MAP[modLower.slice(1)]) {
      // For negated types, start with all and exclude
      if (resourceTypes.length === 0) {
        resourceTypes = [...ALL_RESOURCE_TYPES];
      }
      const excludeType = RESOURCE_TYPE_MAP[modLower.slice(1)];
      resourceTypes = resourceTypes.filter(t => t !== excludeType);
      continue;
    }
    
    // Third-party modifier
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
    
    // Skip unsupported modifiers (popup, document, etc.)
    // These are either handled differently or not applicable to DNR
  }
  
  // Default to all resource types if none specified
  if (resourceTypes.length === 0) {
    resourceTypes = [...ALL_RESOURCE_TYPES];
  }
  
  // Check for domain anchor
  const isDomainAnchored = pattern.startsWith('||');
  if (isDomainAnchored) {
    pattern = pattern.slice(2);
  }
  
  // Remove leading | (address anchor)
  if (pattern.startsWith('|')) {
    pattern = pattern.slice(1);
  }
  
  // Remove trailing | (end anchor)
  if (pattern.endsWith('|')) {
    pattern = pattern.slice(0, -1);
  }
  
  // Skip overly broad patterns that would block too much
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

/**
 * Convert a parsed filter rule to a Chrome DNR rule
 */
export function convertToDNRRule(
  parsed: ParsedFilterRule,
  ruleId: number
): PrivacyDNRRule | null {
  try {
    // Build URL filter pattern
    let urlFilter = parsed.pattern;
    
    // Handle domain anchor - DNR uses || prefix
    if (parsed.isDomainAnchored) {
      urlFilter = '||' + urlFilter;
    }
    
    // For wildcard patterns, Chrome DNR expects * as the wildcard
    // Our patterns already use *, so they should work directly
    // But we need to handle some edge cases
    
    // If pattern starts with *, it matches any URL containing the rest
    // Chrome DNR supports * as a wildcard that matches any string
    
    // Ensure pattern ends with proper separator if it ends with ^
    // The ^ in ABP means "separator character" (/, :, ?, etc.)
    // In DNR, we can approximate this with the pattern as-is
    
    // Build the DNR rule
    const rule: PrivacyDNRRule = {
      id: ruleId,
      priority: parsed.type === 'allow' ? 2 : 1, // Allow rules have higher priority
      action: {
        type: (parsed.type === 'allow' ? 'allow' : 'block') as chrome.declarativeNetRequest.RuleActionType,
      },
      condition: {
        urlFilter,
        resourceTypes: parsed.resourceTypes,
      },
    };
    
    // Add domain conditions if specified
    if (parsed.domains && parsed.domains.length > 0) {
      rule.condition.initiatorDomains = parsed.domains;
    }
    if (parsed.excludedDomains && parsed.excludedDomains.length > 0) {
      rule.condition.excludedInitiatorDomains = parsed.excludedDomains;
    }
    
    return rule;
  } catch (error) {
    console.warn('[Privacy] Failed to convert rule:', parsed.raw, error);
    return null;
  }
}

/**
 * Convert an array of filter rules to DNR rules
 * Handles deduplication and respects Chrome's rule limit
 */
export function convertFilterRulesToDNR(
  filterRules: string[],
  startId = 1
): PrivacyDNRRule[] {
  const dnrRules: PrivacyDNRRule[] = [];
  const seenPatterns = new Set<string>();
  let currentId = startId;
  
  for (const rule of filterRules) {
    // Stop if we've hit the rule limit
    if (dnrRules.length >= MAX_DYNAMIC_RULES) {
      console.warn(`[Privacy] Hit DNR rule limit (${MAX_DYNAMIC_RULES}), stopping conversion`);
      break;
    }
    
    // Parse the filter rule
    const parsed = parseFilterRule(rule);
    if (!parsed) continue;
    
    // Deduplicate by pattern + type
    const key = `${parsed.type}:${parsed.pattern}`;
    if (seenPatterns.has(key)) continue;
    seenPatterns.add(key);
    
    // Convert to DNR rule
    const dnrRule = convertToDNRRule(parsed, currentId);
    if (dnrRule) {
      dnrRules.push(dnrRule);
      currentId++;
    }
  }
  
  console.log(`[Privacy] Converted ${dnrRules.length} DNR rules from ${filterRules.length} filter rules`);
  return dnrRules;
}

/**
 * Create a simple domain block rule
 * Used for bootstrap tracker list
 */
export function createDomainBlockRule(
  domain: string,
  ruleId: number
): PrivacyDNRRule {
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

/**
 * Create a site exception rule (allowlist a domain)
 */
export function createSiteExceptionRule(
  domain: string,
  ruleId: number
): PrivacyDNRRule {
  return {
    id: ruleId,
    priority: 100, // High priority to override block rules
    action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      initiatorDomains: [domain],
      resourceTypes: ALL_RESOURCE_TYPES as ResourceType[],
    },
  };
}

/**
 * Validate a DNR rule before applying
 * Chrome will reject invalid rules, so we pre-validate
 */
export function validateDNRRule(rule: PrivacyDNRRule): boolean {
  // Check required fields
  if (!rule.id || !rule.action || !rule.condition) {
    return false;
  }
  
  // Check action type
  if (!['block', 'allow', 'redirect', 'modifyHeaders', 'upgradeScheme'].includes(rule.action.type)) {
    return false;
  }
  
  // Check condition has a URL filter or request domains
  if (!rule.condition.urlFilter && !rule.condition.regexFilter && 
      !rule.condition.requestDomains && !rule.condition.initiatorDomains) {
    return false;
  }
  
  // Check resource types if specified
  if (rule.condition.resourceTypes && rule.condition.resourceTypes.length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Filter out invalid rules
 */
export function filterValidRules(rules: PrivacyDNRRule[]): PrivacyDNRRule[] {
  return rules.filter(rule => {
    const isValid = validateDNRRule(rule);
    if (!isValid) {
      console.warn('[Privacy] Invalid DNR rule filtered out:', rule);
    }
    return isValid;
  });
}

/**
 * Get rule statistics
 */
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
