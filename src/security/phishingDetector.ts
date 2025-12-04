/**
 * AINTIVIRUS Security Module - Phishing Detection
 * 
 * Provides heuristic-based detection of potentially malicious domains.
 * Uses multiple signals to assess domain trustworthiness.
 * 
 * CRITICAL LIMITATIONS:
 * - Heuristic detection CANNOT catch all phishing attempts
 * - Homoglyph detection is limited to common substitutions
 * - Typosquat detection may produce false positives
 * - This is NOT a substitute for user vigilance
 * - A "safe" rating does NOT guarantee the domain is legitimate
 * - Client-side only; no real-time threat intelligence
 * 
 * ARCHITECTURE:
 * - Uses dynamic threat intel data from remote sources
 * - Falls back to bootstrap data when offline
 * - Refreshes threat data periodically via alarms
 */

import {
  PhishingAnalysis,
  PhishingSignal,
  PhishingSignalType,
  RiskLevel,
} from './types';
import {
  getDomainSettings,
  isWarningDismissed,
} from './storage';
import {
  getThreatIntelData,
  isKnownLegitimateDomain,
  isKnownScamDomain,
  isSuspiciousTld,
  getHomoglyphMap,
  getSolanaKeywords,
} from '../threatIntel';
import type { ThreatIntelData } from '../threatIntel/types';

// ============================================
// PHISHING ANALYSIS
// ============================================

/**
 * Analyze a domain for phishing indicators
 * 
 * @param domain - Domain to analyze
 * @returns Analysis results with all detected signals
 */
export async function analyzeDomain(domain: string): Promise<PhishingAnalysis> {
  const normalizedDomain = normalizeDomain(domain);
  const signals: PhishingSignal[] = [];
  
  // Get threat intel data (uses cache with automatic refresh)
  const threatData = await getThreatIntelData();
  
  // Check if user has already dismissed warnings
  const previouslyDismissed = await isWarningDismissed(normalizedDomain);
  
  // Check user's trust settings
  const domainSettings = await getDomainSettings(normalizedDomain);
  if (domainSettings?.trustStatus === 'blocked') {
    signals.push({
      type: 'user_flagged',
      severity: 'high',
      description: 'You have marked this domain as blocked',
    });
  } else if (domainSettings?.trustStatus === 'trusted') {
    // User has trusted this domain, return clean analysis
    return {
      domain: normalizedDomain,
      isPhishing: false,
      riskLevel: 'low',
      signals: [],
      recommendation: 'proceed',
      previouslyDismissed,
    };
  }
  
  // 1. Check known scam domains (from threat intel)
  if (await isKnownScamDomain(normalizedDomain)) {
    signals.push({
      type: 'known_scam',
      severity: 'high',
      description: 'This domain has been reported as a scam',
    });
  }
  
  // 2. Check for homoglyphs against known domains
  const homoglyphResult = await checkHomoglyphs(normalizedDomain, threatData);
  if (homoglyphResult) {
    signals.push({
      type: 'homoglyph',
      severity: 'high',
      description: `This domain uses characters that look similar to "${homoglyphResult.target}"`,
      relatedDomain: homoglyphResult.target,
    });
  }
  
  // 3. Check for typosquatting
  const typosquatResult = checkTyposquatting(normalizedDomain, threatData.legitimateDomains);
  if (typosquatResult) {
    signals.push({
      type: 'typosquat',
      severity: 'medium',
      description: `This domain is very similar to "${typosquatResult}"`,
      relatedDomain: typosquatResult,
    });
  }
  
  // 4. Check suspicious TLD
  if (await isSuspiciousTld(normalizedDomain)) {
    // Only flag if domain also looks like it's trying to impersonate
    const baseName = normalizedDomain.split('.')[0];
    if (containsSolanaKeywords(baseName, threatData.solanaKeywords)) {
      signals.push({
        type: 'suspicious_tld',
        severity: 'medium',
        description: 'This domain uses a TLD commonly associated with phishing',
      });
    }
  }
  
  // 5. Check if similar to known legitimate domain
  const similarDomain = findSimilarKnownDomain(normalizedDomain, threatData.legitimateDomains);
  if (similarDomain && similarDomain !== normalizedDomain) {
    signals.push({
      type: 'similar_to_known',
      severity: 'low',
      description: `This domain is similar to the legitimate "${similarDomain}"`,
      relatedDomain: similarDomain,
    });
  }
  
  // 6. Check if this is a first-time domain
  if (!domainSettings) {
    signals.push({
      type: 'new_domain',
      severity: 'low',
      description: 'You have not connected to this domain before',
    });
  }
  
  // Calculate overall risk level and recommendation
  const riskLevel = calculateRiskLevel(signals);
  const isPhishing = signals.some(s => 
    s.type === 'known_scam' || 
    (s.type === 'homoglyph' && s.severity === 'high')
  );
  
  return {
    domain: normalizedDomain,
    isPhishing,
    riskLevel,
    signals,
    recommendation: getRecommendation(riskLevel, signals),
    previouslyDismissed,
  };
}

/**
 * Quick check if a domain should show a warning
 * Used for content script before full analysis
 */
export async function shouldShowWarning(domain: string): Promise<boolean> {
  const normalized = normalizeDomain(domain);
  const threatData = await getThreatIntelData();
  
  // Always warn for known scams
  if (await isKnownScamDomain(normalized)) {
    return true;
  }
  
  // Check homoglyphs
  if (await checkHomoglyphs(normalized, threatData)) {
    return true;
  }
  
  // Don't warn for known legitimate domains
  if (await isKnownLegitimateDomain(normalized)) {
    return false;
  }
  
  // Check suspicious patterns
  const baseName = normalized.split('.')[0];
  if (await isSuspiciousTld(normalized) && containsSolanaKeywords(baseName, threatData.solanaKeywords)) {
    return true;
  }
  
  return false;
}

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Check for homoglyph attacks against known domains
 */
async function checkHomoglyphs(
  domain: string,
  threatData: ThreatIntelData
): Promise<{ target: string } | null> {
  const baseDomain = domain.split('.').slice(0, -1).join('.');
  const homoglyphMap = threatData.homoglyphMap;
  
  for (const knownDomain of threatData.legitimateDomains) {
    const knownBase = knownDomain.split('.').slice(0, -1).join('.');
    
    if (containsHomoglyphs(baseDomain, knownBase, homoglyphMap)) {
      return { target: knownDomain };
    }
  }
  
  return null;
}

/**
 * Check if string contains homoglyph substitutions for target
 */
function containsHomoglyphs(
  input: string,
  target: string,
  homoglyphMap: Record<string, string[]>
): boolean {
  if (input === target) return false; // Exact match, not homoglyph
  if (input.length !== target.length) return false; // Different lengths
  
  let homoglyphCount = 0;
  
  for (let i = 0; i < target.length; i++) {
    const targetChar = target[i].toLowerCase();
    const inputChar = input[i].toLowerCase();
    
    if (inputChar === targetChar) continue;
    
    // Check if input char is a homoglyph of target char
    const homoglyphs = homoglyphMap[targetChar] || [];
    if (homoglyphs.includes(inputChar)) {
      homoglyphCount++;
    } else {
      // Character doesn't match and isn't a homoglyph
      return false;
    }
  }
  
  return homoglyphCount > 0;
}

/**
 * Check for typosquatting using Levenshtein distance
 */
function checkTyposquatting(
  domain: string,
  legitimateDomains: string[]
): string | null {
  const baseDomain = domain.split('.')[0];
  const threshold = 2; // Maximum edit distance
  
  for (const knownDomain of legitimateDomains) {
    const knownBase = knownDomain.split('.')[0];
    
    // Skip if domains are identical
    if (baseDomain === knownBase) continue;
    
    const distance = levenshteinDistance(baseDomain, knownBase);
    if (distance > 0 && distance <= threshold) {
      return knownDomain;
    }
  }
  
  return null;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Check if string contains Solana-related keywords
 */
function containsSolanaKeywords(str: string, keywords: string[]): boolean {
  const lower = str.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

/**
 * Find a similar known domain
 */
function findSimilarKnownDomain(
  domain: string,
  legitimateDomains: string[]
): string | null {
  const baseDomain = domain.split('.')[0];
  
  for (const knownDomain of legitimateDomains) {
    const knownBase = knownDomain.split('.')[0];
    const distance = levenshteinDistance(baseDomain, knownBase);
    
    if (distance <= 3 && distance > 0) {
      return knownDomain;
    }
  }
  
  return null;
}

// ============================================
// RISK CALCULATION
// ============================================

/**
 * Calculate overall risk level from signals
 */
function calculateRiskLevel(signals: PhishingSignal[]): RiskLevel {
  if (signals.some(s => s.severity === 'high')) {
    return 'high';
  }
  if (signals.some(s => s.severity === 'medium')) {
    return 'medium';
  }
  if (signals.length > 0) {
    return 'low';
  }
  return 'low';
}

/**
 * Get recommendation based on analysis
 */
function getRecommendation(
  riskLevel: RiskLevel,
  signals: PhishingSignal[]
): 'proceed' | 'warning' | 'block' {
  // Always block known scams
  if (signals.some(s => s.type === 'known_scam')) {
    return 'block';
  }
  
  // Block homoglyph attacks
  if (signals.some(s => s.type === 'homoglyph' && s.severity === 'high')) {
    return 'block';
  }
  
  // Warn for medium or high risk
  if (riskLevel === 'high' || riskLevel === 'medium') {
    return 'warning';
  }
  
  return 'proceed';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normalize domain for comparison
 */
function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '');
}

/**
 * Get all known legitimate domains (for UI display)
 */
export async function getKnownLegitimateDomains(): Promise<string[]> {
  const data = await getThreatIntelData();
  return data.legitimateDomains;
}

/**
 * Get description for a phishing signal type
 */
export function getSignalTypeDescription(type: PhishingSignalType): string {
  switch (type) {
    case 'homoglyph':
      return 'Uses look-alike characters to impersonate a legitimate domain';
    case 'typosquat':
      return 'Uses a misspelling of a legitimate domain';
    case 'suspicious_tld':
      return 'Uses a top-level domain commonly associated with scams';
    case 'known_scam':
      return 'This domain has been reported and confirmed as a scam';
    case 'user_flagged':
      return 'You have previously flagged this domain as suspicious';
    case 'new_domain':
      return 'This is your first interaction with this domain';
    case 'similar_to_known':
      return 'This domain is similar to a known legitimate domain';
    default:
      return 'Unknown signal type';
  }
}
