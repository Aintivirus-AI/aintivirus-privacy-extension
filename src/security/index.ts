/**
 * AINTIVIRUS Security Module - Main Entry Point
 * 
 * This module provides wallet security features including:
 * - Wallet connection monitoring
 * - Transaction verification and risk analysis
 * - Phishing site detection
 * - Smart contract risk assessment
 * 
 * IMPORTANT SECURITY DISCLAIMERS:
 * - All analysis is heuristic-based and informational only
 * - This module CANNOT guarantee transaction or site safety
 * - Unknown programs/domains are NOT automatically malicious
 * - Users should always verify transactions independently
 * - This is a client-side only solution with inherent limitations
 */

import {
  SecurityMessageType,
  SecurityMessagePayloads,
  SecurityMessageResponses,
  SecuritySettings,
  ConnectionRecord,
  ActiveConnection,
  PhishingAnalysis,
  TransactionSummary,
  DomainSettings,
  ProgramInfo,
  TransactionVerificationRequest,
} from './types';
import {
  initializeSecurityStorage,
  getSecuritySettings,
  saveSecuritySettings,
  getDomainSettings,
  setDomainTrustStatus,
  getPendingVerifications,
  clearExpiredVerifications,
} from './storage';
import {
  handleConnectionRequest,
  approveConnection,
  denyConnection,
  revokeConnection,
  getAllActiveConnections,
  getConnections,
  trustDomain,
  blockDomain,
} from './connectionMonitor';
import {
  analyzeDomain,
  shouldShowWarning,
  getKnownLegitimateDomains,
} from './phishingDetector';
import {
  analyzeTransactions,
  createVerificationRequest,
  completeVerificationRequest,
} from './transactionAnalyzer';
import {
  getProgramInfo,
  getProgramRiskLevel,
} from './programRegistry';
import {
  setCustomProgramSetting,
  dismissWarning,
} from './storage';
import {
  notifyPhishingSite,
  notifyConnectionRequest,
  notifyRiskyTransaction,
} from '@shared/notifications';
import {
  initializeProgramRegistry,
  setupProgramRegistryAlarm,
} from './programRegistryRemote';
import {
  initializeIdlLoader,
} from './anchorIdlLoader';

// ============================================
// MODULE INITIALIZATION
// ============================================

/**
 * Initialize the security module
 * 
 * Called when the background script starts.
 * Sets up storage and periodic cleanup tasks.
 */
export async function initializeSecurityModule(): Promise<void> {
  console.log('[AINTIVIRUS Security] Initializing security module...');
  
  // Initialize storage with defaults
  await initializeSecurityStorage();
  
  // Clear expired verifications
  await clearExpiredVerifications();
  
  // Initialize program registry (remote-updatable)
  await initializeProgramRegistry();
  setupProgramRegistryAlarm();
  
  // Initialize Anchor IDL loader
  await initializeIdlLoader();
  
  // Set up periodic cleanup
  setupPeriodicCleanup();
  
  const settings = await getSecuritySettings();
  console.log('[AINTIVIRUS Security] Security module initialized:', {
    connectionMonitoring: settings.connectionMonitoring,
    transactionVerification: settings.transactionVerification,
    phishingDetection: settings.phishingDetection,
  });
}

/**
 * Set up periodic cleanup tasks
 */
function setupPeriodicCleanup(): void {
  // Create alarm for periodic cleanup (every 30 minutes)
  chrome.alarms.create('securityCleanup', {
    periodInMinutes: 30,
  });
}

/**
 * Handle cleanup alarm
 */
export async function handleSecurityCleanupAlarm(): Promise<void> {
  await clearExpiredVerifications();
}

// ============================================
// MESSAGE HANDLER
// ============================================

/**
 * Handle incoming security messages from popup/content scripts
 * 
 * This is the main routing function for all security operations.
 * Each message type is validated and routed to the appropriate handler.
 * 
 * @param type - Message type
 * @param payload - Message payload
 * @param senderTabId - Optional tab ID from message sender
 * @returns Response data
 */
export async function handleSecurityMessage(
  type: SecurityMessageType,
  payload: unknown,
  senderTabId?: number
): Promise<unknown> {
  switch (type) {
    // ========== Connection Monitoring ==========
    
    case 'SECURITY_CONNECTION_REQUEST':
      return handleConnectionRequestMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_REQUEST']
      );
    
    case 'SECURITY_CONNECTION_APPROVE':
      return handleConnectionApproveMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_APPROVE']
      );
    
    case 'SECURITY_CONNECTION_DENY':
      return handleConnectionDenyMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_DENY']
      );
    
    case 'SECURITY_CONNECTION_REVOKE':
      return handleConnectionRevokeMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_REVOKE']
      );
    
    case 'SECURITY_GET_CONNECTIONS':
      return handleGetConnectionsMessage(
        payload as SecurityMessagePayloads['SECURITY_GET_CONNECTIONS']
      );
    
    case 'SECURITY_GET_ACTIVE_CONNECTIONS':
      return handleGetActiveConnectionsMessage();
    
    // ========== Transaction Verification ==========
    
    case 'SECURITY_VERIFY_TRANSACTION':
      return handleVerifyTransactionMessage(
        payload as SecurityMessagePayloads['SECURITY_VERIFY_TRANSACTION']
      );
    
    case 'SECURITY_TRANSACTION_DECISION':
      return handleTransactionDecisionMessage(
        payload as SecurityMessagePayloads['SECURITY_TRANSACTION_DECISION']
      );
    
    case 'SECURITY_GET_PENDING_VERIFICATIONS':
      return handleGetPendingVerificationsMessage();
    
    // ========== Phishing Detection ==========
    
    case 'SECURITY_CHECK_DOMAIN':
      return handleCheckDomainMessage(
        payload as SecurityMessagePayloads['SECURITY_CHECK_DOMAIN'],
        senderTabId
      );
    
    case 'SECURITY_DISMISS_WARNING':
      return handleDismissWarningMessage(
        payload as SecurityMessagePayloads['SECURITY_DISMISS_WARNING']
      );
    
    case 'SECURITY_REPORT_DOMAIN':
      return handleReportDomainMessage(
        payload as SecurityMessagePayloads['SECURITY_REPORT_DOMAIN']
      );
    
    // ========== Settings ==========
    
    case 'SECURITY_GET_SETTINGS':
      return handleGetSettingsMessage();
    
    case 'SECURITY_SET_SETTINGS':
      return handleSetSettingsMessage(
        payload as SecurityMessagePayloads['SECURITY_SET_SETTINGS']
      );
    
    case 'SECURITY_GET_DOMAIN_SETTINGS':
      return handleGetDomainSettingsMessage(
        payload as SecurityMessagePayloads['SECURITY_GET_DOMAIN_SETTINGS']
      );
    
    case 'SECURITY_SET_DOMAIN_TRUST':
      return handleSetDomainTrustMessage(
        payload as SecurityMessagePayloads['SECURITY_SET_DOMAIN_TRUST']
      );
    
    // ========== Program Registry ==========
    
    case 'SECURITY_GET_PROGRAM_INFO':
      return handleGetProgramInfoMessage(
        payload as SecurityMessagePayloads['SECURITY_GET_PROGRAM_INFO']
      );
    
    case 'SECURITY_SET_PROGRAM_TRUST':
      return handleSetProgramTrustMessage(
        payload as SecurityMessagePayloads['SECURITY_SET_PROGRAM_TRUST']
      );
    
    default:
      throw new Error(`Unknown security message type: ${type}`);
  }
}

// ============================================
// MESSAGE HANDLERS
// ============================================

/**
 * Handle connection request from dApp
 */
async function handleConnectionRequestMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_REQUEST']
): Promise<PhishingAnalysis> {
  const { domain, url, tabId } = payload;
  const analysis = await handleConnectionRequest(domain, url, tabId);
  
  // Send notification for risky connection requests
  if (analysis.riskLevel === 'high' || analysis.isPhishing) {
    await notifyConnectionRequest(domain, analysis.riskLevel, tabId);
  }
  
  return analysis;
}

/**
 * Handle connection approval
 */
async function handleConnectionApproveMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_APPROVE']
): Promise<ConnectionRecord> {
  const { domain, publicKey } = payload;
  return approveConnection(domain, domain, publicKey);
}

/**
 * Handle connection denial
 */
async function handleConnectionDenyMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_DENY']
): Promise<void> {
  const { domain, reason } = payload;
  await denyConnection(domain, domain, reason);
}

/**
 * Handle connection revocation
 */
async function handleConnectionRevokeMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_REVOKE']
): Promise<void> {
  const { domain } = payload;
  await revokeConnection(domain);
}

/**
 * Handle get connections request
 */
async function handleGetConnectionsMessage(
  payload: SecurityMessagePayloads['SECURITY_GET_CONNECTIONS']
): Promise<ConnectionRecord[]> {
  const { limit, offset } = payload || {};
  return getConnections(limit, offset);
}

/**
 * Handle get active connections request
 */
async function handleGetActiveConnectionsMessage(): Promise<ActiveConnection[]> {
  return getAllActiveConnections();
}

/**
 * Handle transaction verification request
 */
async function handleVerifyTransactionMessage(
  payload: SecurityMessagePayloads['SECURITY_VERIFY_TRANSACTION']
): Promise<TransactionSummary[]> {
  const { domain, serializedTransactions, tabId } = payload;
  
  // Create verification request for tracking
  await createVerificationRequest(domain, serializedTransactions, tabId);
  
  // Analyze transactions
  const summaries = await analyzeTransactions(serializedTransactions, domain);
  
  // Check if any transactions are risky and send notification
  const hasRiskyTransaction = summaries.some(
    s => s.riskLevel === 'high' || s.riskLevel === 'medium'
  );
  
  if (hasRiskyTransaction) {
    const highestRisk = summaries.reduce((max, s) => {
      if (s.riskLevel === 'high') return 'high';
      if (s.riskLevel === 'medium' && max !== 'high') return 'medium';
      return max;
    }, 'low' as string);
    
    const allWarnings = summaries.flatMap(s => s.warnings);
    await notifyRiskyTransaction(domain, highestRisk, allWarnings, tabId);
  }
  
  return summaries;
}

/**
 * Handle transaction decision (approve/reject)
 */
async function handleTransactionDecisionMessage(
  payload: SecurityMessagePayloads['SECURITY_TRANSACTION_DECISION']
): Promise<void> {
  const { requestId, approved } = payload;
  await completeVerificationRequest(requestId, approved);
}

/**
 * Handle get pending verifications request
 */
async function handleGetPendingVerificationsMessage(): Promise<TransactionVerificationRequest[]> {
  return getPendingVerifications();
}

/**
 * Handle domain check request
 */
async function handleCheckDomainMessage(
  payload: SecurityMessagePayloads['SECURITY_CHECK_DOMAIN'],
  tabId?: number
): Promise<PhishingAnalysis> {
  const { domain } = payload;
  const analysis = await analyzeDomain(domain);
  
  // Send notification for phishing sites (only if not previously dismissed)
  if ((analysis.isPhishing || analysis.riskLevel === 'high') && !analysis.previouslyDismissed) {
    await notifyPhishingSite(domain, analysis.riskLevel, tabId);
  }
  
  return analysis;
}

/**
 * Handle dismiss warning request
 */
async function handleDismissWarningMessage(
  payload: SecurityMessagePayloads['SECURITY_DISMISS_WARNING']
): Promise<void> {
  const { domain } = payload;
  await dismissWarning(domain);
}

/**
 * Handle report domain request
 */
async function handleReportDomainMessage(
  payload: SecurityMessagePayloads['SECURITY_REPORT_DOMAIN']
): Promise<void> {
  const { domain, reason } = payload;
  
  // Block the domain in local settings
  // Note: In the future, this could submit to a centralized threat intel service
  await blockDomain(domain);
  
  console.log(`[AINTIVIRUS Security] Domain reported: ${domain} - ${reason}`);
}

/**
 * Handle get settings request
 */
async function handleGetSettingsMessage(): Promise<SecuritySettings> {
  return getSecuritySettings();
}

/**
 * Handle set settings request
 */
async function handleSetSettingsMessage(
  payload: SecurityMessagePayloads['SECURITY_SET_SETTINGS']
): Promise<void> {
  await saveSecuritySettings(payload);
}

/**
 * Handle get domain settings request
 */
async function handleGetDomainSettingsMessage(
  payload: SecurityMessagePayloads['SECURITY_GET_DOMAIN_SETTINGS']
): Promise<DomainSettings | null> {
  const { domain } = payload;
  return getDomainSettings(domain);
}

/**
 * Handle set domain trust request
 */
async function handleSetDomainTrustMessage(
  payload: SecurityMessagePayloads['SECURITY_SET_DOMAIN_TRUST']
): Promise<void> {
  const { domain, trustStatus } = payload;
  
  if (trustStatus === 'trusted') {
    await trustDomain(domain);
  } else if (trustStatus === 'blocked') {
    await blockDomain(domain);
  } else {
    await setDomainTrustStatus(domain, trustStatus);
  }
}

/**
 * Handle get program info request
 */
async function handleGetProgramInfoMessage(
  payload: SecurityMessagePayloads['SECURITY_GET_PROGRAM_INFO']
): Promise<ProgramInfo | null> {
  const { programId } = payload;
  return getProgramInfo(programId);
}

/**
 * Handle set program trust request
 */
async function handleSetProgramTrustMessage(
  payload: SecurityMessagePayloads['SECURITY_SET_PROGRAM_TRUST']
): Promise<void> {
  const { programId, trustLevel, label } = payload;
  await setCustomProgramSetting(programId, trustLevel, label);
}

// ============================================
// EXPORTS
// ============================================

// Re-export types
export * from './types';

// Re-export key functions for direct use
export {
  // Connection monitoring
  handleConnectionRequest,
  approveConnection,
  denyConnection,
  revokeConnection,
  getAllActiveConnections,
  getConnections,
  trustDomain,
  blockDomain,
} from './connectionMonitor';

export {
  // Phishing detection
  analyzeDomain,
  shouldShowWarning,
  getKnownLegitimateDomains,
} from './phishingDetector';

export {
  // Transaction analysis
  analyzeTransactions,
  analyzeTransaction,
  getTransactionDescription,
  getRiskLevelColor,
  getRiskLevelIcon,
} from './transactionAnalyzer';

export {
  // Program registry
  getProgramInfo,
  getProgramRiskLevel,
  isProgramVerified,
  isProgramMalicious,
  getRiskLevelDescription,
} from './programRegistry';

export {
  // Storage
  getSecuritySettings,
  saveSecuritySettings,
  getDomainSettings,
  getConnectionHistory,
  clearAllSecurityStorage,
} from './storage';

export {
  // Remote Program Registry
  getProgramRegistry,
  refreshProgramRegistry,
  getRemoteProgramInfo,
  getProgramRegistryHealth,
  searchPrograms,
} from './programRegistryRemote';

export {
  // Anchor IDL Loader
  getIdl,
  decodeInstruction,
  hasKnownIdl,
  getIdlCacheStats,
} from './anchorIdlLoader';

