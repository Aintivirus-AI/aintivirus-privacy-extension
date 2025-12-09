

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


export async function analyzeDomain(domain: string): Promise<PhishingAnalysis> {
  const normalizedDomain = normalizeDomain(domain);
  const signals: PhishingSignal[] = [];
  
  
  const threatData = await getThreatIntelData();
  
  
  const previouslyDismissed = await isWarningDismissed(normalizedDomain);
  
  
  const domainSettings = await getDomainSettings(normalizedDomain);
  if (domainSettings?.trustStatus === 'blocked') {
    signals.push({
      type: 'user_flagged',
      severity: 'high',
      description: 'You have marked this domain as blocked',
    });
  } else if (domainSettings?.trustStatus === 'trusted') {
    
    return {
      domain: normalizedDomain,
      isPhishing: false,
      riskLevel: 'low',
      signals: [],
      recommendation: 'proceed',
      previouslyDismissed,
    };
  }
  
  
  if (await isKnownScamDomain(normalizedDomain)) {
    signals.push({
      type: 'known_scam',
      severity: 'high',
      description: 'This domain has been reported as a scam',
    });
  }
  
  
  const homoglyphResult = await checkHomoglyphs(normalizedDomain, threatData);
  if (homoglyphResult) {
    signals.push({
      type: 'homoglyph',
      severity: 'high',
      description: `This domain uses characters that look similar to "${homoglyphResult.target}"`,
      relatedDomain: homoglyphResult.target,
    });
  }
  
  
  const typosquatResult = checkTyposquatting(normalizedDomain, threatData.legitimateDomains);
  if (typosquatResult) {
    signals.push({
      type: 'typosquat',
      severity: 'medium',
      description: `This domain is very similar to "${typosquatResult}"`,
      relatedDomain: typosquatResult,
    });
  }
  
  
  if (await isSuspiciousTld(normalizedDomain)) {
    
    const baseName = normalizedDomain.split('.')[0];
    if (containsSolanaKeywords(baseName, threatData.solanaKeywords)) {
      signals.push({
        type: 'suspicious_tld',
        severity: 'medium',
        description: 'This domain uses a TLD commonly associated with phishing',
      });
    }
  }
  
  
  const similarDomain = findSimilarKnownDomain(normalizedDomain, threatData.legitimateDomains);
  if (similarDomain && similarDomain !== normalizedDomain) {
    signals.push({
      type: 'similar_to_known',
      severity: 'low',
      description: `This domain is similar to the legitimate "${similarDomain}"`,
      relatedDomain: similarDomain,
    });
  }
  
  
  if (!domainSettings) {
    signals.push({
      type: 'new_domain',
      severity: 'low',
      description: 'You have not connected to this domain before',
    });
  }
  
  
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


export async function shouldShowWarning(domain: string): Promise<boolean> {
  const normalized = normalizeDomain(domain);
  const threatData = await getThreatIntelData();
  
  
  if (await isKnownScamDomain(normalized)) {
    return true;
  }
  
  
  if (await checkHomoglyphs(normalized, threatData)) {
    return true;
  }
  
  
  if (await isKnownLegitimateDomain(normalized)) {
    return false;
  }
  
  
  const baseName = normalized.split('.')[0];
  if (await isSuspiciousTld(normalized) && containsSolanaKeywords(baseName, threatData.solanaKeywords)) {
    return true;
  }
  
  return false;
}


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


function containsHomoglyphs(
  input: string,
  target: string,
  homoglyphMap: Record<string, string[]>
): boolean {
  if (input === target) return false; 
  if (input.length !== target.length) return false; 
  
  let homoglyphCount = 0;
  
  for (let i = 0; i < target.length; i++) {
    const targetChar = target[i].toLowerCase();
    const inputChar = input[i].toLowerCase();
    
    if (inputChar === targetChar) continue;
    
    
    const homoglyphs = homoglyphMap[targetChar] || [];
    if (homoglyphs.includes(inputChar)) {
      homoglyphCount++;
    } else {
      
      return false;
    }
  }
  
  return homoglyphCount > 0;
}


function checkTyposquatting(
  domain: string,
  legitimateDomains: string[]
): string | null {
  const baseDomain = domain.split('.')[0];
  const threshold = 2; 
  
  for (const knownDomain of legitimateDomains) {
    const knownBase = knownDomain.split('.')[0];
    
    
    if (baseDomain === knownBase) continue;
    
    const distance = levenshteinDistance(baseDomain, knownBase);
    if (distance > 0 && distance <= threshold) {
      return knownDomain;
    }
  }
  
  return null;
}


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
          matrix[i - 1][j - 1] + 1, 
          matrix[i][j - 1] + 1,     
          matrix[i - 1][j] + 1      
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}


function containsSolanaKeywords(str: string, keywords: string[]): boolean {
  const lower = str.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}


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


function getRecommendation(
  riskLevel: RiskLevel,
  signals: PhishingSignal[]
): 'proceed' | 'warning' | 'block' {
  
  if (signals.some(s => s.type === 'known_scam')) {
    return 'block';
  }
  
  
  if (signals.some(s => s.type === 'homoglyph' && s.severity === 'high')) {
    return 'block';
  }
  
  
  if (riskLevel === 'high' || riskLevel === 'medium') {
    return 'warning';
  }
  
  return 'proceed';
}


function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '');
}


export async function getKnownLegitimateDomains(): Promise<string[]> {
  const data = await getThreatIntelData();
  return data.legitimateDomains;
}


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
