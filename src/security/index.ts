// Security module entrypoint: wires message handling, storage, phishing analysis,
// connection tracking, and program registry/IDL bootstrapping.
import {
  SecurityMessageType,
  SecurityMessagePayloads,
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
import { analyzeDomain, shouldShowWarning, getKnownLegitimateDomains } from './phishingDetector';
import {
  analyzeTransactions,
  createVerificationRequest,
  completeVerificationRequest,
} from './transactionAnalyzer';
import { getProgramInfo, getProgramRiskLevel } from './programRegistry';
import { setCustomProgramSetting, dismissWarning } from './storage';
import {
  notifyPhishingSite,
  notifyConnectionRequest,
  notifyRiskyTransaction,
} from '@shared/notifications';
import { initializeProgramRegistry, setupProgramRegistryAlarm } from './programRegistryRemote';
import { initializeIdlLoader } from './anchorIdlLoader';

export async function initializeSecurityModule(): Promise<void> {
  // Prepare persisted state, clean stale verification requests, and hydrate the
  // program registry/IDL cache on startup.
  await initializeSecurityStorage();

  await clearExpiredVerifications();

  await initializeProgramRegistry();
  setupProgramRegistryAlarm();

  await initializeIdlLoader();

  setupPeriodicCleanup();
}

function setupPeriodicCleanup(): void {
  // Background alarm cleans up stale verification requests.
  chrome.alarms.create('securityCleanup', {
    periodInMinutes: 30,
  });
}

export async function handleSecurityCleanupAlarm(): Promise<void> {
  await clearExpiredVerifications();
}

// Router for security-related messages coming from UI/content/background.
export async function handleSecurityMessage(
  type: SecurityMessageType,
  payload: unknown,
  senderTabId?: number,
): Promise<unknown> {
  switch (type) {
    case 'SECURITY_CONNECTION_REQUEST':
      return handleConnectionRequestMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_REQUEST'],
      );

    case 'SECURITY_CONNECTION_APPROVE':
      return handleConnectionApproveMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_APPROVE'],
      );

    case 'SECURITY_CONNECTION_DENY':
      return handleConnectionDenyMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_DENY'],
      );

    case 'SECURITY_CONNECTION_REVOKE':
      return handleConnectionRevokeMessage(
        payload as SecurityMessagePayloads['SECURITY_CONNECTION_REVOKE'],
      );

    case 'SECURITY_GET_CONNECTIONS':
      return handleGetConnectionsMessage(
        payload as SecurityMessagePayloads['SECURITY_GET_CONNECTIONS'],
      );

    case 'SECURITY_GET_ACTIVE_CONNECTIONS':
      return handleGetActiveConnectionsMessage();

    case 'SECURITY_VERIFY_TRANSACTION':
      return handleVerifyTransactionMessage(
        payload as SecurityMessagePayloads['SECURITY_VERIFY_TRANSACTION'],
      );

    case 'SECURITY_TRANSACTION_DECISION':
      return handleTransactionDecisionMessage(
        payload as SecurityMessagePayloads['SECURITY_TRANSACTION_DECISION'],
      );

    case 'SECURITY_GET_PENDING_VERIFICATIONS':
      return handleGetPendingVerificationsMessage();

    case 'SECURITY_CHECK_DOMAIN':
      return handleCheckDomainMessage(
        payload as SecurityMessagePayloads['SECURITY_CHECK_DOMAIN'],
        senderTabId,
      );

    case 'SECURITY_DISMISS_WARNING':
      return handleDismissWarningMessage(
        payload as SecurityMessagePayloads['SECURITY_DISMISS_WARNING'],
      );

    case 'SECURITY_REPORT_DOMAIN':
      return handleReportDomainMessage(
        payload as SecurityMessagePayloads['SECURITY_REPORT_DOMAIN'],
      );

    case 'SECURITY_GET_SETTINGS':
      return handleGetSettingsMessage();

    case 'SECURITY_SET_SETTINGS':
      return handleSetSettingsMessage(payload as SecurityMessagePayloads['SECURITY_SET_SETTINGS']);

    case 'SECURITY_GET_DOMAIN_SETTINGS':
      return handleGetDomainSettingsMessage(
        payload as SecurityMessagePayloads['SECURITY_GET_DOMAIN_SETTINGS'],
      );

    case 'SECURITY_SET_DOMAIN_TRUST':
      return handleSetDomainTrustMessage(
        payload as SecurityMessagePayloads['SECURITY_SET_DOMAIN_TRUST'],
      );

    case 'SECURITY_GET_PROGRAM_INFO':
      return handleGetProgramInfoMessage(
        payload as SecurityMessagePayloads['SECURITY_GET_PROGRAM_INFO'],
      );

    case 'SECURITY_SET_PROGRAM_TRUST':
      return handleSetProgramTrustMessage(
        payload as SecurityMessagePayloads['SECURITY_SET_PROGRAM_TRUST'],
      );

    default:
      throw new Error(`Unknown security message type: ${type}`);
  }
}

async function handleConnectionRequestMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_REQUEST'],
): Promise<PhishingAnalysis> {
  const { domain, url, tabId } = payload;
  const analysis = await handleConnectionRequest(domain, url, tabId);

  if (analysis.riskLevel === 'high' || analysis.isPhishing) {
    await notifyConnectionRequest(domain, analysis.riskLevel, tabId);
  }

  return analysis;
}

async function handleConnectionApproveMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_APPROVE'],
): Promise<ConnectionRecord> {
  const { domain, publicKey } = payload;
  return approveConnection(domain, domain, publicKey);
}

async function handleConnectionDenyMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_DENY'],
): Promise<void> {
  const { domain, reason } = payload;
  await denyConnection(domain, domain, reason);
}

async function handleConnectionRevokeMessage(
  payload: SecurityMessagePayloads['SECURITY_CONNECTION_REVOKE'],
): Promise<void> {
  const { domain } = payload;
  await revokeConnection(domain);
}

async function handleGetConnectionsMessage(
  payload: SecurityMessagePayloads['SECURITY_GET_CONNECTIONS'],
): Promise<ConnectionRecord[]> {
  const { limit, offset } = payload || {};
  return getConnections(limit, offset);
}

async function handleGetActiveConnectionsMessage(): Promise<ActiveConnection[]> {
  return getAllActiveConnections();
}

async function handleVerifyTransactionMessage(
  payload: SecurityMessagePayloads['SECURITY_VERIFY_TRANSACTION'],
): Promise<TransactionSummary[]> {
  const { domain, serializedTransactions, tabId } = payload;

  await createVerificationRequest(domain, serializedTransactions, tabId);

  const summaries = await analyzeTransactions(serializedTransactions, domain);

  const hasRiskyTransaction = summaries.some(
    (s) => s.riskLevel === 'high' || s.riskLevel === 'medium',
  );

  if (hasRiskyTransaction) {
    const highestRisk = summaries.reduce((max, s) => {
      if (s.riskLevel === 'high') return 'high';
      if (s.riskLevel === 'medium' && max !== 'high') return 'medium';
      return max;
    }, 'low' as string);

    const allWarnings = summaries.flatMap((s) => s.warnings);
    await notifyRiskyTransaction(domain, highestRisk, allWarnings, tabId);
  }

  return summaries;
}

async function handleTransactionDecisionMessage(
  payload: SecurityMessagePayloads['SECURITY_TRANSACTION_DECISION'],
): Promise<void> {
  const { requestId, approved } = payload;
  await completeVerificationRequest(requestId, approved);
}

async function handleGetPendingVerificationsMessage(): Promise<TransactionVerificationRequest[]> {
  return getPendingVerifications();
}

async function handleCheckDomainMessage(
  payload: SecurityMessagePayloads['SECURITY_CHECK_DOMAIN'],
  tabId?: number,
): Promise<PhishingAnalysis> {
  const { domain } = payload;
  const analysis = await analyzeDomain(domain);

  if ((analysis.isPhishing || analysis.riskLevel === 'high') && !analysis.previouslyDismissed) {
    await notifyPhishingSite(domain, analysis.riskLevel, tabId);
  }

  return analysis;
}

async function handleDismissWarningMessage(
  payload: SecurityMessagePayloads['SECURITY_DISMISS_WARNING'],
): Promise<void> {
  const { domain } = payload;
  await dismissWarning(domain);
}

async function handleReportDomainMessage(
  payload: SecurityMessagePayloads['SECURITY_REPORT_DOMAIN'],
): Promise<void> {
  const { domain, reason } = payload;

  await blockDomain(domain);
}

async function handleGetSettingsMessage(): Promise<SecuritySettings> {
  return getSecuritySettings();
}

async function handleSetSettingsMessage(
  payload: SecurityMessagePayloads['SECURITY_SET_SETTINGS'],
): Promise<void> {
  await saveSecuritySettings(payload);
}

async function handleGetDomainSettingsMessage(
  payload: SecurityMessagePayloads['SECURITY_GET_DOMAIN_SETTINGS'],
): Promise<DomainSettings | null> {
  const { domain } = payload;
  return getDomainSettings(domain);
}

async function handleSetDomainTrustMessage(
  payload: SecurityMessagePayloads['SECURITY_SET_DOMAIN_TRUST'],
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

async function handleGetProgramInfoMessage(
  payload: SecurityMessagePayloads['SECURITY_GET_PROGRAM_INFO'],
): Promise<ProgramInfo | null> {
  const { programId } = payload;
  return getProgramInfo(programId);
}

async function handleSetProgramTrustMessage(
  payload: SecurityMessagePayloads['SECURITY_SET_PROGRAM_TRUST'],
): Promise<void> {
  const { programId, trustLevel, label } = payload;
  await setCustomProgramSetting(programId, trustLevel, label);
}

export * from './types';

export {
  handleConnectionRequest,
  approveConnection,
  denyConnection,
  revokeConnection,
  getAllActiveConnections,
  getConnections,
  trustDomain,
  blockDomain,
} from './connectionMonitor';

export { analyzeDomain, shouldShowWarning, getKnownLegitimateDomains } from './phishingDetector';

export {
  analyzeTransactions,
  analyzeTransaction,
  getTransactionDescription,
  getRiskLevelColor,
  getRiskLevelIcon,
} from './transactionAnalyzer';

export {
  getProgramInfo,
  getProgramRiskLevel,
  isProgramVerified,
  isProgramMalicious,
  getRiskLevelDescription,
} from './programRegistry';

export {
  getSecuritySettings,
  saveSecuritySettings,
  getDomainSettings,
  getConnectionHistory,
  clearAllSecurityStorage,
} from './storage';

export {
  getProgramRegistry,
  refreshProgramRegistry,
  getRemoteProgramInfo,
  getProgramRegistryHealth,
  searchPrograms,
} from './programRegistryRemote';

export { getIdl, decodeInstruction, hasKnownIdl, getIdlCacheStats } from './anchorIdlLoader';
