import type { 
  PrivacySettings, 
  SitePrivacySettings, 
  FilterListCache,
  PrivacyMetrics,
  SitePrivacyMode,
  BlockedRequest,
  CachedCosmeticRules,
  FilterListHealthStorage,
  LastKnownGoodStorage,
} from '../privacy/types';

import type { CachedThreatIntel } from '../threatIntel/types';
import type { RpcEndpointHealth } from '../wallet/types';
import type { CachedProgramRegistry } from '../security/programRegistryRemote';
import type { CachedIdl } from '../security/anchorIdlLoader';

import type { FingerprintSettings } from '../fingerprinting/types';

import type {
  WalletMessageType,
  WalletMessagePayloads,
  WalletState,
  WalletBalance,
  WalletSettings,
  SignedTransaction,
  SolanaNetwork,
} from '../wallet/types';

import type {
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
} from '../security/types';

export type FeatureFlagId = 'privacy' | 'wallet' | 'notifications';

export interface FeatureFlags {
  privacy: boolean;
  wallet: boolean;
  notifications: boolean;
}

export interface StorageSchema {
  featureFlags: FeatureFlags;
  initialized: boolean;
  version: string;
  // Privacy
  privacySettings: PrivacySettings;
  privacySiteSettings: SitePrivacySettings;
  filterListCache: FilterListCache;
  privacyMetrics: PrivacyMetrics;
  cosmeticRulesCache: CachedCosmeticRules;
  // Fingerprinting
  fingerprintSettings: FingerprintSettings;
  // Threat Intelligence (Phase: Hardening)
  threatIntelCache: CachedThreatIntel;
  // Filter List Health (Phase: Hardening)
  filterListHealth: FilterListHealthStorage;
  filterListLastKnownGood: LastKnownGoodStorage;
  // RPC Health (Phase: Hardening)
  rpcHealth: Record<string, RpcEndpointHealth>;
  customRpcUrls: Record<string, string[]>;
  // Program Registry (Phase: Hardening)
  programRegistryCache: CachedProgramRegistry;
  // Anchor IDL Cache (Phase: Hardening)
  anchorIdlCache: Record<string, CachedIdl>;
}

export type MessageType =
  | 'GET_FEATURE_FLAGS'
  | 'SET_FEATURE_FLAG'
  | 'GET_STORAGE'
  | 'SET_STORAGE'
  | 'CONTENT_SCRIPT_READY'
  | 'PING'
  // Privacy
  | 'GET_PRIVACY_SETTINGS'
  | 'SET_PRIVACY_SETTINGS'
  | 'GET_SITE_PRIVACY_MODE'
  | 'SET_SITE_PRIVACY_MODE'
  | 'GET_ALL_SITE_SETTINGS'
  | 'GET_PRIVACY_METRICS'
  | 'REFRESH_FILTER_LISTS'
  | 'ADD_FILTER_LIST'
  | 'REMOVE_FILTER_LIST'
  | 'GET_BLOCKED_COUNT'
  | 'GET_BLOCKED_REQUESTS'
  | 'PRIVACY_STATE_CHANGED'
  | 'GET_COSMETIC_RULES'
  // Filter List Health
  | 'GET_FILTER_LIST_HEALTH'
  | 'RESET_FILTER_LIST'
  // Threat Intelligence
  | 'GET_THREAT_INTEL_HEALTH'
  | 'REFRESH_THREAT_INTEL'
  | 'GET_THREAT_INTEL_SOURCES'
  | 'ADD_THREAT_INTEL_SOURCE'
  | 'REMOVE_THREAT_INTEL_SOURCE'
  | 'TOGGLE_THREAT_INTEL_SOURCE'
  // Fingerprinting
  | 'GET_FINGERPRINT_SETTINGS'
  | 'SET_FINGERPRINT_SETTINGS'
  | 'GET_FINGERPRINT_STATUS'
  // Wallet
  | WalletMessageType
  // Security
  | SecurityMessageType;

export interface BaseMessage<T extends MessageType, P = undefined> {
  type: T;
  payload: P;
}

export type GetFeatureFlagsMessage = BaseMessage<'GET_FEATURE_FLAGS'>;
export type SetFeatureFlagMessage = BaseMessage<'SET_FEATURE_FLAG', { id: FeatureFlagId; enabled: boolean }>;
export type ContentScriptReadyMessage = BaseMessage<'CONTENT_SCRIPT_READY', { url: string }>;
export type PingMessage = BaseMessage<'PING'>;

export type GetPrivacySettingsMessage = BaseMessage<'GET_PRIVACY_SETTINGS'>;
export type SetPrivacySettingsMessage = BaseMessage<'SET_PRIVACY_SETTINGS', Partial<PrivacySettings>>;
export type GetSitePrivacyModeMessage = BaseMessage<'GET_SITE_PRIVACY_MODE', { domain: string }>;
export type SetSitePrivacyModeMessage = BaseMessage<'SET_SITE_PRIVACY_MODE', { domain: string; mode: SitePrivacyMode }>;
export type GetAllSiteSettingsMessage = BaseMessage<'GET_ALL_SITE_SETTINGS'>;
export type GetPrivacyMetricsMessage = BaseMessage<'GET_PRIVACY_METRICS'>;
export type RefreshFilterListsMessage = BaseMessage<'REFRESH_FILTER_LISTS'>;
export type AddFilterListMessage = BaseMessage<'ADD_FILTER_LIST', { url: string }>;
export type RemoveFilterListMessage = BaseMessage<'REMOVE_FILTER_LIST', { url: string }>;
export type GetBlockedCountMessage = BaseMessage<'GET_BLOCKED_COUNT', { tabId: number }>;
export type GetBlockedRequestsMessage = BaseMessage<'GET_BLOCKED_REQUESTS'>;
export type PrivacyStateChangedMessage = BaseMessage<'PRIVACY_STATE_CHANGED', { enabled: boolean }>;
export type GetCosmeticRulesMessage = BaseMessage<'GET_COSMETIC_RULES', { domain: string }>;

// Filter List Health messages
export type GetFilterListHealthMessage = BaseMessage<'GET_FILTER_LIST_HEALTH'>;
export type ResetFilterListMessage = BaseMessage<'RESET_FILTER_LIST', { url: string }>;

// Threat Intelligence messages
export type GetThreatIntelHealthMessage = BaseMessage<'GET_THREAT_INTEL_HEALTH'>;
export type RefreshThreatIntelMessage = BaseMessage<'REFRESH_THREAT_INTEL'>;
export type GetThreatIntelSourcesMessage = BaseMessage<'GET_THREAT_INTEL_SOURCES'>;
export type AddThreatIntelSourceMessage = BaseMessage<'ADD_THREAT_INTEL_SOURCE', ThreatIntelSourceInput>;
export type RemoveThreatIntelSourceMessage = BaseMessage<'REMOVE_THREAT_INTEL_SOURCE', { sourceId: string }>;
export type ToggleThreatIntelSourceMessage = BaseMessage<'TOGGLE_THREAT_INTEL_SOURCE', { sourceId: string; enabled: boolean }>;

// Threat Intel Source input for adding new sources
export interface ThreatIntelSourceInput {
  name: string;
  url: string;
  type: 'phishing' | 'malware' | 'scam' | 'combined';
  format: 'text' | 'json' | 'csv';
  refreshIntervalHours?: number;
  priority?: number;
}

export type GetFingerprintSettingsMessage = BaseMessage<'GET_FINGERPRINT_SETTINGS'>;
export type SetFingerprintSettingsMessage = BaseMessage<'SET_FINGERPRINT_SETTINGS', Partial<FingerprintSettings>>;
export type GetFingerprintStatusMessage = BaseMessage<'GET_FINGERPRINT_STATUS'>;

export type WalletCreateMessage = BaseMessage<'WALLET_CREATE', WalletMessagePayloads['WALLET_CREATE']>;
export type WalletImportMessage = BaseMessage<'WALLET_IMPORT', WalletMessagePayloads['WALLET_IMPORT']>;
export type WalletUnlockMessage = BaseMessage<'WALLET_UNLOCK', WalletMessagePayloads['WALLET_UNLOCK']>;
export type WalletLockMessage = BaseMessage<'WALLET_LOCK'>;
export type WalletExistsMessage = BaseMessage<'WALLET_EXISTS'>;
export type WalletGetStateMessage = BaseMessage<'WALLET_GET_STATE'>;
export type WalletDeleteMessage = BaseMessage<'WALLET_DELETE', WalletMessagePayloads['WALLET_DELETE']>;
export type WalletGetBalanceMessage = BaseMessage<'WALLET_GET_BALANCE'>;
export type WalletGetAddressMessage = BaseMessage<'WALLET_GET_ADDRESS'>;
export type WalletGetAddressQRMessage = BaseMessage<'WALLET_GET_ADDRESS_QR', WalletMessagePayloads['WALLET_GET_ADDRESS_QR']>;
export type WalletSetNetworkMessage = BaseMessage<'WALLET_SET_NETWORK', WalletMessagePayloads['WALLET_SET_NETWORK']>;
export type WalletGetNetworkMessage = BaseMessage<'WALLET_GET_NETWORK'>;
export type WalletGetNetworkStatusMessage = BaseMessage<'WALLET_GET_NETWORK_STATUS'>;
export type WalletSignTransactionMessage = BaseMessage<'WALLET_SIGN_TRANSACTION', WalletMessagePayloads['WALLET_SIGN_TRANSACTION']>;
export type WalletSignMessageMessage = BaseMessage<'WALLET_SIGN_MESSAGE', WalletMessagePayloads['WALLET_SIGN_MESSAGE']>;
export type WalletGetSettingsMessage = BaseMessage<'WALLET_GET_SETTINGS'>;
export type WalletSetSettingsMessage = BaseMessage<'WALLET_SET_SETTINGS', WalletMessagePayloads['WALLET_SET_SETTINGS']>;
export type WalletSendSolMessage = BaseMessage<'WALLET_SEND_SOL', WalletMessagePayloads['WALLET_SEND_SOL']>;
export type WalletEstimateFeeMessage = BaseMessage<'WALLET_ESTIMATE_FEE', WalletMessagePayloads['WALLET_ESTIMATE_FEE']>;
export type WalletGetHistoryMessage = BaseMessage<'WALLET_GET_HISTORY', WalletMessagePayloads['WALLET_GET_HISTORY']>;
export type WalletGetTokensMessage = BaseMessage<'WALLET_GET_TOKENS'>;
export type WalletAddTokenMessage = BaseMessage<'WALLET_ADD_TOKEN', WalletMessagePayloads['WALLET_ADD_TOKEN']>;
export type WalletRemoveTokenMessage = BaseMessage<'WALLET_REMOVE_TOKEN', WalletMessagePayloads['WALLET_REMOVE_TOKEN']>;
export type WalletGetRpcHealthMessage = BaseMessage<'WALLET_GET_RPC_HEALTH'>;
export type WalletAddRpcMessage = BaseMessage<'WALLET_ADD_RPC', WalletMessagePayloads['WALLET_ADD_RPC']>;
export type WalletRemoveRpcMessage = BaseMessage<'WALLET_REMOVE_RPC', WalletMessagePayloads['WALLET_REMOVE_RPC']>;
export type WalletTestRpcMessage = BaseMessage<'WALLET_TEST_RPC', WalletMessagePayloads['WALLET_TEST_RPC']>;

export type SecurityConnectionRequestMessage = BaseMessage<'SECURITY_CONNECTION_REQUEST', SecurityMessagePayloads['SECURITY_CONNECTION_REQUEST']>;
export type SecurityConnectionApproveMessage = BaseMessage<'SECURITY_CONNECTION_APPROVE', SecurityMessagePayloads['SECURITY_CONNECTION_APPROVE']>;
export type SecurityConnectionDenyMessage = BaseMessage<'SECURITY_CONNECTION_DENY', SecurityMessagePayloads['SECURITY_CONNECTION_DENY']>;
export type SecurityConnectionRevokeMessage = BaseMessage<'SECURITY_CONNECTION_REVOKE', SecurityMessagePayloads['SECURITY_CONNECTION_REVOKE']>;
export type SecurityGetConnectionsMessage = BaseMessage<'SECURITY_GET_CONNECTIONS', SecurityMessagePayloads['SECURITY_GET_CONNECTIONS']>;
export type SecurityGetActiveConnectionsMessage = BaseMessage<'SECURITY_GET_ACTIVE_CONNECTIONS'>;
export type SecurityVerifyTransactionMessage = BaseMessage<'SECURITY_VERIFY_TRANSACTION', SecurityMessagePayloads['SECURITY_VERIFY_TRANSACTION']>;
export type SecurityTransactionDecisionMessage = BaseMessage<'SECURITY_TRANSACTION_DECISION', SecurityMessagePayloads['SECURITY_TRANSACTION_DECISION']>;
export type SecurityGetPendingVerificationsMessage = BaseMessage<'SECURITY_GET_PENDING_VERIFICATIONS'>;
export type SecurityCheckDomainMessage = BaseMessage<'SECURITY_CHECK_DOMAIN', SecurityMessagePayloads['SECURITY_CHECK_DOMAIN']>;
export type SecurityDismissWarningMessage = BaseMessage<'SECURITY_DISMISS_WARNING', SecurityMessagePayloads['SECURITY_DISMISS_WARNING']>;
export type SecurityReportDomainMessage = BaseMessage<'SECURITY_REPORT_DOMAIN', SecurityMessagePayloads['SECURITY_REPORT_DOMAIN']>;
export type SecurityGetSettingsMessage = BaseMessage<'SECURITY_GET_SETTINGS'>;
export type SecuritySetSettingsMessage = BaseMessage<'SECURITY_SET_SETTINGS', SecurityMessagePayloads['SECURITY_SET_SETTINGS']>;
export type SecurityGetDomainSettingsMessage = BaseMessage<'SECURITY_GET_DOMAIN_SETTINGS', SecurityMessagePayloads['SECURITY_GET_DOMAIN_SETTINGS']>;
export type SecuritySetDomainTrustMessage = BaseMessage<'SECURITY_SET_DOMAIN_TRUST', SecurityMessagePayloads['SECURITY_SET_DOMAIN_TRUST']>;
export type SecurityGetProgramInfoMessage = BaseMessage<'SECURITY_GET_PROGRAM_INFO', SecurityMessagePayloads['SECURITY_GET_PROGRAM_INFO']>;
export type SecuritySetProgramTrustMessage = BaseMessage<'SECURITY_SET_PROGRAM_TRUST', SecurityMessagePayloads['SECURITY_SET_PROGRAM_TRUST']>;

export type ExtensionMessage =
  | GetFeatureFlagsMessage
  | SetFeatureFlagMessage
  | ContentScriptReadyMessage
  | PingMessage
  // Privacy messages
  | GetPrivacySettingsMessage
  | SetPrivacySettingsMessage
  | GetSitePrivacyModeMessage
  | SetSitePrivacyModeMessage
  | GetAllSiteSettingsMessage
  | GetPrivacyMetricsMessage
  | RefreshFilterListsMessage
  | AddFilterListMessage
  | RemoveFilterListMessage
  | GetBlockedCountMessage
  | GetBlockedRequestsMessage
  | PrivacyStateChangedMessage
  | GetCosmeticRulesMessage
  // Filter List Health messages
  | GetFilterListHealthMessage
  | ResetFilterListMessage
  // Threat Intelligence messages
  | GetThreatIntelHealthMessage
  | RefreshThreatIntelMessage
  | GetThreatIntelSourcesMessage
  | AddThreatIntelSourceMessage
  | RemoveThreatIntelSourceMessage
  | ToggleThreatIntelSourceMessage
  // Fingerprint protection messages
  | GetFingerprintSettingsMessage
  | SetFingerprintSettingsMessage
  | GetFingerprintStatusMessage
  | WalletCreateMessage
  | WalletImportMessage
  | WalletUnlockMessage
  | WalletLockMessage
  | WalletExistsMessage
  | WalletGetStateMessage
  | WalletDeleteMessage
  | WalletGetBalanceMessage
  | WalletGetAddressMessage
  | WalletGetAddressQRMessage
  | WalletSetNetworkMessage
  | WalletGetNetworkMessage
  | WalletGetNetworkStatusMessage
  | WalletSignTransactionMessage
  | WalletSignMessageMessage
  | WalletGetSettingsMessage
  | WalletSetSettingsMessage
  | WalletSendSolMessage
  | WalletEstimateFeeMessage
  | WalletGetHistoryMessage
  | WalletGetTokensMessage
  | WalletAddTokenMessage
  | WalletRemoveTokenMessage
  // Wallet RPC health messages
  | WalletGetRpcHealthMessage
  | WalletAddRpcMessage
  | WalletRemoveRpcMessage
  | WalletTestRpcMessage
  | SecurityConnectionRequestMessage
  | SecurityConnectionApproveMessage
  | SecurityConnectionDenyMessage
  | SecurityConnectionRevokeMessage
  | SecurityGetConnectionsMessage
  | SecurityGetActiveConnectionsMessage
  | SecurityVerifyTransactionMessage
  | SecurityTransactionDecisionMessage
  | SecurityGetPendingVerificationsMessage
  | SecurityCheckDomainMessage
  | SecurityDismissWarningMessage
  | SecurityReportDomainMessage
  | SecurityGetSettingsMessage
  | SecuritySetSettingsMessage
  | SecurityGetDomainSettingsMessage
  | SecuritySetDomainTrustMessage
  | SecurityGetProgramInfoMessage
  | SecuritySetProgramTrustMessage;

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

import { 
  DEFAULT_PRIVACY_SETTINGS, 
  DEFAULT_PRIVACY_METRICS,
  DEFAULT_COSMETIC_RULES,
  DEFAULT_FILTER_LIST_HEALTH,
  DEFAULT_LAST_KNOWN_GOOD,
} from '../privacy/types';

import { DEFAULT_FINGERPRINT_SETTINGS } from '../fingerprinting/types';
import { DEFAULT_CACHED_THREAT_INTEL } from '../threatIntel/types';
import { DEFAULT_RPC_HEALTH } from '../wallet/types';

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  privacy: false,
  wallet: false,
  notifications: true,
};

export const DEFAULT_STORAGE: StorageSchema = {
  featureFlags: DEFAULT_FEATURE_FLAGS,
  initialized: false,
  version: '0.1.0',
  // Privacy
  privacySettings: DEFAULT_PRIVACY_SETTINGS,
  privacySiteSettings: {},
  filterListCache: {},
  privacyMetrics: DEFAULT_PRIVACY_METRICS,
  cosmeticRulesCache: DEFAULT_COSMETIC_RULES,
  // Fingerprinting
  fingerprintSettings: DEFAULT_FINGERPRINT_SETTINGS,
  // Threat Intelligence
  threatIntelCache: DEFAULT_CACHED_THREAT_INTEL,
  // Filter List Health
  filterListHealth: DEFAULT_FILTER_LIST_HEALTH,
  filterListLastKnownGood: DEFAULT_LAST_KNOWN_GOOD,
  // RPC Health
  rpcHealth: DEFAULT_RPC_HEALTH,
  customRpcUrls: {},
  // Program Registry
  programRegistryCache: {
    data: { programs: [], version: 'empty', updatedAt: 0 },
    fetchedAt: 0,
    expiresAt: 0,
    source: 'bootstrap',
    isBootstrap: true,
  },
  // Anchor IDL Cache
  anchorIdlCache: {},
};

// Re-exports
export type { 
  PrivacySettings, 
  SitePrivacySettings, 
  SitePrivacyMode,
  PrivacyMetrics,
  BlockedRequest,
  CookieCleanupEntry,
  CachedCosmeticRules,
  FilterListHealth,
  FilterListHealthSummary,
} from '../privacy/types';

export type {
  ThreatIntelData,
  ThreatIntelHealth,
  CachedThreatIntel,
} from '../threatIntel/types';

export type { FingerprintSettings } from '../fingerprinting/types';
export type {
  WalletMessageType,
  WalletMessagePayloads,
  WalletMessageResponses,
  WalletState,
  WalletLockState,
  WalletBalance,
  WalletSettings,
  SignedTransaction,
  SolanaNetwork,
  EncryptedVault,
  // Phase 6 types
  SendTransactionParams,
  SendTransactionResult,
  FeeEstimate,
  TransactionHistoryItem,
  TransactionHistoryResult,
  TransactionDirection,
  TransactionStatus,
  SPLTokenBalance,
  CustomToken,
  TokenMetadata,
  // RPC Health types
  RpcEndpointHealth,
  RpcHealthSummary,
} from '../wallet/types';

export type { 
  CachedProgramRegistry,
  ProgramRegistryHealth,
} from '../security/programRegistryRemote';

export type {
  CachedIdl,
  DecodedInstruction,
} from '../security/anchorIdlLoader';

export type {
  SecurityMessageType,
  SecurityMessagePayloads,
  SecurityMessageResponses,
  SecuritySettings,
  ConnectionRecord,
  ActiveConnection,
  PhishingAnalysis,
  TransactionSummary,
  DomainSettings,
  DomainTrustStatus,
  ProgramInfo,
  RiskLevel,
  TransactionVerificationRequest,
  InstructionSummary,
  TokenTransferSummary,
  AuthorityChange,
} from '../security/types';

export { ProgramRiskLevel } from '../security/types';
