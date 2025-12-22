import type {
  PrivacySettings,
  SitePrivacySettings,
  FilterListCache,
  PrivacyMetrics,
  SitePrivacyMode,
  CachedCosmeticRules,
  FilterListHealthStorage,
  LastKnownGoodStorage,
} from '../privacy/types';

import type { RulesetState, StaticRulesetId } from '../privacy/rulesetManager';

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
  ChainType,
  EVMChainId,
  NetworkEnvironment,
  EVMBalance,
  EVMTokenBalance,
  EVMFeeEstimate,
  EVMTransactionResult,
  EVMSendParams,
  EVMTokenSendParams,
  ChainDisplayInfo,
} from '../wallet/types';

import { SUPPORTED_CHAINS } from '../wallet/types';

export type {
  ChainType,
  EVMChainId,
  NetworkEnvironment,
  EVMBalance,
  EVMTokenBalance,
  EVMFeeEstimate,
  EVMTransactionResult,
  EVMSendParams,
  EVMTokenSendParams,
  ChainDisplayInfo,
};
export { SUPPORTED_CHAINS };

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

export type FilteringLevel = 'off' | 'minimal' | 'basic' | 'optimal' | 'complete';

export interface StorageSchema {
  featureFlags: FeatureFlags;
  initialized: boolean;
  version: string;

  privacySettings: PrivacySettings;
  privacySiteSettings: SitePrivacySettings;
  filterListCache: FilterListCache;
  privacyMetrics: PrivacyMetrics;
  cosmeticRulesCache: CachedCosmeticRules;

  filteringLevel: FilteringLevel;

  fingerprintSettings: FingerprintSettings;

  threatIntelCache: CachedThreatIntel;

  filterListHealth: FilterListHealthStorage;
  filterListLastKnownGood: LastKnownGoodStorage;

  rpcHealth: Record<string, RpcEndpointHealth>;
  customRpcUrls: Record<string, string[]>;

  programRegistryCache: CachedProgramRegistry;

  anchorIdlCache: Record<string, CachedIdl>;

  rulesetState: RulesetState;
}

export type MessageType =
  | 'GET_FEATURE_FLAGS'
  | 'SET_FEATURE_FLAG'
  | 'GET_STORAGE'
  | 'SET_STORAGE'
  | 'CONTENT_SCRIPT_READY'
  | 'PING'
  | 'OPEN_SETTINGS'
  | 'GET_PRIVACY_SETTINGS'
  | 'SET_PRIVACY_SETTINGS'
  | 'GET_AD_BLOCKER_STATUS'
  | 'SET_AD_BLOCKER_STATUS'
  | 'AD_BLOCKER_TOGGLED'
  | 'GET_SITE_PRIVACY_MODE'
  | 'SET_SITE_PRIVACY_MODE'
  | 'GET_ALL_SITE_SETTINGS'
  | 'GET_PRIVACY_METRICS'
  | 'GET_PRIVACY_STATUS'
  | 'REFRESH_FILTER_LISTS'
  | 'ADD_FILTER_LIST'
  | 'REMOVE_FILTER_LIST'
  | 'GET_BLOCKED_COUNT'
  | 'GET_BLOCKED_REQUESTS'
  | 'PRIVACY_STATE_CHANGED'
  | 'GET_COSMETIC_RULES'
  | 'GET_FILTER_LIST_HEALTH'
  | 'RESET_FILTER_LIST'
  | 'GET_RULESET_STATS'
  | 'ENABLE_RULESET'
  | 'DISABLE_RULESET'
  | 'TOGGLE_RULESET'
  | 'GET_THREAT_INTEL_HEALTH'
  | 'REFRESH_THREAT_INTEL'
  | 'GET_THREAT_INTEL_SOURCES'
  | 'ADD_THREAT_INTEL_SOURCE'
  | 'REMOVE_THREAT_INTEL_SOURCE'
  | 'TOGGLE_THREAT_INTEL_SOURCE'
  | 'GET_FINGERPRINT_SETTINGS'
  | 'SET_FINGERPRINT_SETTINGS'
  | 'GET_FINGERPRINT_STATUS'
  | WalletMessageType
  | 'GET_SOL_PRICE'
  | 'GET_ETH_PRICE'
  | 'GET_TOKEN_PRICES'
  | SecurityMessageType
  | 'DAPP_REQUEST'
  | 'DAPP_APPROVE'
  | 'DAPP_REJECT'
  | 'DAPP_GET_PERMISSIONS'
  | 'DAPP_REVOKE_PERMISSION'
  | 'DAPP_REVOKE_ALL_PERMISSIONS'
  | 'DAPP_GET_PENDING_REQUESTS'
  | 'DAPP_CANCEL_REQUEST'
  | 'DAPP_GET_PROVIDER_STATE'
  | 'DAPP_PAGE_UNLOAD'
  | 'GET_TAB_ID'
  | 'ADBLOCKER_GET_STATUS'
  | 'ADBLOCKER_SET_ENABLED'
  | 'ADBLOCKER_ADD_TO_ALLOWLIST'
  | 'ADBLOCKER_REMOVE_FROM_ALLOWLIST'
  | 'ADBLOCKER_CHECK_ALLOWLIST';

export interface BaseMessage<T extends MessageType, P = undefined> {
  type: T;
  payload: P;
}

export type GetFeatureFlagsMessage = BaseMessage<'GET_FEATURE_FLAGS'>;
export type SetFeatureFlagMessage = BaseMessage<
  'SET_FEATURE_FLAG',
  { id: FeatureFlagId; enabled: boolean }
>;
export type ContentScriptReadyMessage = BaseMessage<'CONTENT_SCRIPT_READY', { url: string }>;
export type PingMessage = BaseMessage<'PING'>;
export type OpenSettingsMessage = BaseMessage<'OPEN_SETTINGS'>;

export type GetPrivacySettingsMessage = BaseMessage<'GET_PRIVACY_SETTINGS'>;
export type SetPrivacySettingsMessage = BaseMessage<
  'SET_PRIVACY_SETTINGS',
  Partial<PrivacySettings>
>;
export type GetAdBlockerStatusMessage = BaseMessage<'GET_AD_BLOCKER_STATUS'>;
export type SetAdBlockerStatusMessage = BaseMessage<'SET_AD_BLOCKER_STATUS', { enabled: boolean }>;
export type AdBlockerToggledMessage = BaseMessage<'AD_BLOCKER_TOGGLED', { enabled: boolean }>;
export type GetSitePrivacyModeMessage = BaseMessage<'GET_SITE_PRIVACY_MODE', { domain: string }>;
export type SetSitePrivacyModeMessage = BaseMessage<
  'SET_SITE_PRIVACY_MODE',
  { domain: string; mode: SitePrivacyMode }
>;
export type GetAllSiteSettingsMessage = BaseMessage<'GET_ALL_SITE_SETTINGS'>;
export type GetPrivacyMetricsMessage = BaseMessage<'GET_PRIVACY_METRICS'>;
export type GetPrivacyStatusMessage = BaseMessage<'GET_PRIVACY_STATUS'>;
export type RefreshFilterListsMessage = BaseMessage<'REFRESH_FILTER_LISTS'>;
export type AddFilterListMessage = BaseMessage<'ADD_FILTER_LIST', { url: string }>;
export type RemoveFilterListMessage = BaseMessage<'REMOVE_FILTER_LIST', { url: string }>;
export type GetBlockedCountMessage = BaseMessage<'GET_BLOCKED_COUNT', { tabId: number }>;
export type GetBlockedRequestsMessage = BaseMessage<'GET_BLOCKED_REQUESTS'>;
export type PrivacyStateChangedMessage = BaseMessage<'PRIVACY_STATE_CHANGED', { enabled: boolean }>;
export type GetCosmeticRulesMessage = BaseMessage<'GET_COSMETIC_RULES', { domain: string }>;

export type GetFilterListHealthMessage = BaseMessage<'GET_FILTER_LIST_HEALTH'>;
export type ResetFilterListMessage = BaseMessage<'RESET_FILTER_LIST', { url: string }>;

export type GetRulesetStatsMessage = BaseMessage<'GET_RULESET_STATS'>;
export type EnableRulesetMessage = BaseMessage<'ENABLE_RULESET', { rulesetId: StaticRulesetId }>;
export type DisableRulesetMessage = BaseMessage<'DISABLE_RULESET', { rulesetId: StaticRulesetId }>;
export type ToggleRulesetMessage = BaseMessage<'TOGGLE_RULESET', { rulesetId: StaticRulesetId }>;

export type GetThreatIntelHealthMessage = BaseMessage<'GET_THREAT_INTEL_HEALTH'>;
export type RefreshThreatIntelMessage = BaseMessage<'REFRESH_THREAT_INTEL'>;
export type GetThreatIntelSourcesMessage = BaseMessage<'GET_THREAT_INTEL_SOURCES'>;
export type AddThreatIntelSourceMessage = BaseMessage<
  'ADD_THREAT_INTEL_SOURCE',
  ThreatIntelSourceInput
>;
export type RemoveThreatIntelSourceMessage = BaseMessage<
  'REMOVE_THREAT_INTEL_SOURCE',
  { sourceId: string }
>;
export type ToggleThreatIntelSourceMessage = BaseMessage<
  'TOGGLE_THREAT_INTEL_SOURCE',
  { sourceId: string; enabled: boolean }
>;

export interface ThreatIntelSourceInput {
  name: string;
  url: string;
  type: 'phishing' | 'malware' | 'scam' | 'combined';
  format: 'text' | 'json' | 'csv';
  refreshIntervalHours?: number;
  priority?: number;
}

export type GetFingerprintSettingsMessage = BaseMessage<'GET_FINGERPRINT_SETTINGS'>;
export type SetFingerprintSettingsMessage = BaseMessage<
  'SET_FINGERPRINT_SETTINGS',
  Partial<FingerprintSettings>
>;
export type GetFingerprintStatusMessage = BaseMessage<'GET_FINGERPRINT_STATUS'>;

export type WalletCreateMessage = BaseMessage<
  'WALLET_CREATE',
  WalletMessagePayloads['WALLET_CREATE']
>;
export type WalletImportMessage = BaseMessage<
  'WALLET_IMPORT',
  WalletMessagePayloads['WALLET_IMPORT']
>;
export type WalletUnlockMessage = BaseMessage<
  'WALLET_UNLOCK',
  WalletMessagePayloads['WALLET_UNLOCK']
>;
export type WalletLockMessage = BaseMessage<'WALLET_LOCK'>;
export type WalletExistsMessage = BaseMessage<'WALLET_EXISTS'>;
export type WalletGetStateMessage = BaseMessage<'WALLET_GET_STATE'>;
export type WalletDeleteMessage = BaseMessage<
  'WALLET_DELETE',
  WalletMessagePayloads['WALLET_DELETE']
>;
export type WalletGetBalanceMessage = BaseMessage<
  'WALLET_GET_BALANCE',
  WalletMessagePayloads['WALLET_GET_BALANCE']
>;
export type WalletGetAddressMessage = BaseMessage<'WALLET_GET_ADDRESS'>;
export type WalletGetAddressQRMessage = BaseMessage<
  'WALLET_GET_ADDRESS_QR',
  WalletMessagePayloads['WALLET_GET_ADDRESS_QR']
>;
export type WalletSetNetworkMessage = BaseMessage<
  'WALLET_SET_NETWORK',
  WalletMessagePayloads['WALLET_SET_NETWORK']
>;
export type WalletGetNetworkMessage = BaseMessage<'WALLET_GET_NETWORK'>;
export type WalletGetNetworkStatusMessage = BaseMessage<'WALLET_GET_NETWORK_STATUS'>;
export type WalletSignTransactionMessage = BaseMessage<
  'WALLET_SIGN_TRANSACTION',
  WalletMessagePayloads['WALLET_SIGN_TRANSACTION']
>;
export type WalletSignMessageMessage = BaseMessage<
  'WALLET_SIGN_MESSAGE',
  WalletMessagePayloads['WALLET_SIGN_MESSAGE']
>;
export type WalletGetSettingsMessage = BaseMessage<'WALLET_GET_SETTINGS'>;
export type WalletSetSettingsMessage = BaseMessage<
  'WALLET_SET_SETTINGS',
  WalletMessagePayloads['WALLET_SET_SETTINGS']
>;
export type WalletSendSolMessage = BaseMessage<
  'WALLET_SEND_SOL',
  WalletMessagePayloads['WALLET_SEND_SOL']
>;
export type WalletSendSPLTokenMessage = BaseMessage<
  'WALLET_SEND_SPL_TOKEN',
  WalletMessagePayloads['WALLET_SEND_SPL_TOKEN']
>;
export type WalletEstimateFeeMessage = BaseMessage<
  'WALLET_ESTIMATE_FEE',
  WalletMessagePayloads['WALLET_ESTIMATE_FEE']
>;
export type WalletGetHistoryMessage = BaseMessage<
  'WALLET_GET_HISTORY',
  WalletMessagePayloads['WALLET_GET_HISTORY']
>;
export type WalletGetTokensMessage = BaseMessage<
  'WALLET_GET_TOKENS',
  WalletMessagePayloads['WALLET_GET_TOKENS']
>;
export type WalletAddTokenMessage = BaseMessage<
  'WALLET_ADD_TOKEN',
  WalletMessagePayloads['WALLET_ADD_TOKEN']
>;
export type WalletRemoveTokenMessage = BaseMessage<
  'WALLET_REMOVE_TOKEN',
  WalletMessagePayloads['WALLET_REMOVE_TOKEN']
>;
export type WalletGetPopularTokensMessage = BaseMessage<
  'WALLET_GET_POPULAR_TOKENS',
  WalletMessagePayloads['WALLET_GET_POPULAR_TOKENS']
>;
export type WalletGetTokenMetadataMessage = BaseMessage<
  'WALLET_GET_TOKEN_METADATA',
  WalletMessagePayloads['WALLET_GET_TOKEN_METADATA']
>;
export type WalletGetRpcHealthMessage = BaseMessage<'WALLET_GET_RPC_HEALTH'>;
export type WalletAddRpcMessage = BaseMessage<
  'WALLET_ADD_RPC',
  WalletMessagePayloads['WALLET_ADD_RPC']
>;
export type WalletRemoveRpcMessage = BaseMessage<
  'WALLET_REMOVE_RPC',
  WalletMessagePayloads['WALLET_REMOVE_RPC']
>;
export type WalletTestRpcMessage = BaseMessage<
  'WALLET_TEST_RPC',
  WalletMessagePayloads['WALLET_TEST_RPC']
>;

export type WalletListMessage = BaseMessage<'WALLET_LIST'>;
export type WalletAddMessage = BaseMessage<'WALLET_ADD', WalletMessagePayloads['WALLET_ADD']>;
export type WalletImportAddMessage = BaseMessage<
  'WALLET_IMPORT_ADD',
  WalletMessagePayloads['WALLET_IMPORT_ADD']
>;
export type WalletSwitchMessage = BaseMessage<
  'WALLET_SWITCH',
  WalletMessagePayloads['WALLET_SWITCH']
>;
export type WalletRenameMessage = BaseMessage<
  'WALLET_RENAME',
  WalletMessagePayloads['WALLET_RENAME']
>;
export type WalletDeleteOneMessage = BaseMessage<
  'WALLET_DELETE_ONE',
  WalletMessagePayloads['WALLET_DELETE_ONE']
>;
export type WalletExportOneMessage = BaseMessage<
  'WALLET_EXPORT_ONE',
  WalletMessagePayloads['WALLET_EXPORT_ONE']
>;
export type WalletImportPrivateKeyMessage = BaseMessage<
  'WALLET_IMPORT_PRIVATE_KEY',
  WalletMessagePayloads['WALLET_IMPORT_PRIVATE_KEY']
>;
export type WalletExportPrivateKeyMessage = BaseMessage<
  'WALLET_EXPORT_PRIVATE_KEY',
  WalletMessagePayloads['WALLET_EXPORT_PRIVATE_KEY']
>;
export type WalletGetActiveMessage = BaseMessage<'WALLET_GET_ACTIVE'>;

export type WalletSetChainMessage = BaseMessage<
  'WALLET_SET_CHAIN',
  WalletMessagePayloads['WALLET_SET_CHAIN']
>;
export type WalletSetEVMChainMessage = BaseMessage<
  'WALLET_SET_EVM_CHAIN',
  WalletMessagePayloads['WALLET_SET_EVM_CHAIN']
>;
export type WalletGetEVMBalanceMessage = BaseMessage<
  'WALLET_GET_EVM_BALANCE',
  WalletMessagePayloads['WALLET_GET_EVM_BALANCE']
>;
export type WalletSendETHMessage = BaseMessage<
  'WALLET_SEND_ETH',
  WalletMessagePayloads['WALLET_SEND_ETH']
>;
export type WalletSendERC20Message = BaseMessage<
  'WALLET_SEND_ERC20',
  WalletMessagePayloads['WALLET_SEND_ERC20']
>;
export type WalletGetEVMTokensMessage = BaseMessage<
  'WALLET_GET_EVM_TOKENS',
  WalletMessagePayloads['WALLET_GET_EVM_TOKENS']
>;
export type WalletGetEVMHistoryMessage = BaseMessage<
  'WALLET_GET_EVM_HISTORY',
  WalletMessagePayloads['WALLET_GET_EVM_HISTORY']
>;
export type WalletEstimateEVMFeeMessage = BaseMessage<
  'WALLET_ESTIMATE_EVM_FEE',
  WalletMessagePayloads['WALLET_ESTIMATE_EVM_FEE']
>;
export type WalletGetEVMAddressMessage = BaseMessage<'WALLET_GET_EVM_ADDRESS'>;

export type EVMGetPendingTxsMessage = BaseMessage<
  'EVM_GET_PENDING_TXS',
  WalletMessagePayloads['EVM_GET_PENDING_TXS']
>;
export type EVMSpeedUpTxMessage = BaseMessage<
  'EVM_SPEED_UP_TX',
  WalletMessagePayloads['EVM_SPEED_UP_TX']
>;
export type EVMCancelTxMessage = BaseMessage<
  'EVM_CANCEL_TX',
  WalletMessagePayloads['EVM_CANCEL_TX']
>;
export type EVMGetGasPresetsMessage = BaseMessage<
  'EVM_GET_GAS_PRESETS',
  WalletMessagePayloads['EVM_GET_GAS_PRESETS']
>;
export type EVMEstimateReplacementFeeMessage = BaseMessage<
  'EVM_ESTIMATE_REPLACEMENT_FEE',
  WalletMessagePayloads['EVM_ESTIMATE_REPLACEMENT_FEE']
>;

export type WalletGetAllowancesMessage = BaseMessage<
  'WALLET_GET_ALLOWANCES',
  WalletMessagePayloads['WALLET_GET_ALLOWANCES']
>;
export type WalletEstimateRevokeFeeMessage = BaseMessage<
  'WALLET_ESTIMATE_REVOKE_FEE',
  WalletMessagePayloads['WALLET_ESTIMATE_REVOKE_FEE']
>;
export type WalletRevokeAllowanceMessage = BaseMessage<
  'WALLET_REVOKE_ALLOWANCE',
  WalletMessagePayloads['WALLET_REVOKE_ALLOWANCE']
>;

// Jupiter Swap messages (Solana)
export type WalletSwapQuoteMessage = BaseMessage<
  'WALLET_SWAP_QUOTE',
  WalletMessagePayloads['WALLET_SWAP_QUOTE']
>;
export type WalletSwapExecuteMessage = BaseMessage<
  'WALLET_SWAP_EXECUTE',
  WalletMessagePayloads['WALLET_SWAP_EXECUTE']
>;
export type WalletSwapAvailableMessage = BaseMessage<'WALLET_SWAP_AVAILABLE'>;
export type WalletSwapReferralStatusMessage = BaseMessage<'WALLET_SWAP_REFERRAL_STATUS'>;

// EVM Swap messages (ParaSwap)
export type EVMSwapQuoteMessage = BaseMessage<
  'EVM_SWAP_QUOTE',
  WalletMessagePayloads['EVM_SWAP_QUOTE']
>;
export type EVMSwapExecuteMessage = BaseMessage<
  'EVM_SWAP_EXECUTE',
  WalletMessagePayloads['EVM_SWAP_EXECUTE']
>;
export type EVMSwapAvailableMessage = BaseMessage<
  'EVM_SWAP_AVAILABLE',
  WalletMessagePayloads['EVM_SWAP_AVAILABLE']
>;

export type EVMRpcRequestMessage = BaseMessage<
  'EVM_RPC_REQUEST',
  WalletMessagePayloads['EVM_RPC_REQUEST']
>;

export type SecurityConnectionRequestMessage = BaseMessage<
  'SECURITY_CONNECTION_REQUEST',
  SecurityMessagePayloads['SECURITY_CONNECTION_REQUEST']
>;
export type SecurityConnectionApproveMessage = BaseMessage<
  'SECURITY_CONNECTION_APPROVE',
  SecurityMessagePayloads['SECURITY_CONNECTION_APPROVE']
>;
export type SecurityConnectionDenyMessage = BaseMessage<
  'SECURITY_CONNECTION_DENY',
  SecurityMessagePayloads['SECURITY_CONNECTION_DENY']
>;
export type SecurityConnectionRevokeMessage = BaseMessage<
  'SECURITY_CONNECTION_REVOKE',
  SecurityMessagePayloads['SECURITY_CONNECTION_REVOKE']
>;
export type SecurityGetConnectionsMessage = BaseMessage<
  'SECURITY_GET_CONNECTIONS',
  SecurityMessagePayloads['SECURITY_GET_CONNECTIONS']
>;
export type SecurityGetActiveConnectionsMessage = BaseMessage<'SECURITY_GET_ACTIVE_CONNECTIONS'>;
export type SecurityVerifyTransactionMessage = BaseMessage<
  'SECURITY_VERIFY_TRANSACTION',
  SecurityMessagePayloads['SECURITY_VERIFY_TRANSACTION']
>;
export type SecurityTransactionDecisionMessage = BaseMessage<
  'SECURITY_TRANSACTION_DECISION',
  SecurityMessagePayloads['SECURITY_TRANSACTION_DECISION']
>;
export type SecurityGetPendingVerificationsMessage =
  BaseMessage<'SECURITY_GET_PENDING_VERIFICATIONS'>;
export type SecurityCheckDomainMessage = BaseMessage<
  'SECURITY_CHECK_DOMAIN',
  SecurityMessagePayloads['SECURITY_CHECK_DOMAIN']
>;
export type SecurityDismissWarningMessage = BaseMessage<
  'SECURITY_DISMISS_WARNING',
  SecurityMessagePayloads['SECURITY_DISMISS_WARNING']
>;
export type SecurityReportDomainMessage = BaseMessage<
  'SECURITY_REPORT_DOMAIN',
  SecurityMessagePayloads['SECURITY_REPORT_DOMAIN']
>;
export type SecurityGetSettingsMessage = BaseMessage<'SECURITY_GET_SETTINGS'>;
export type SecuritySetSettingsMessage = BaseMessage<
  'SECURITY_SET_SETTINGS',
  SecurityMessagePayloads['SECURITY_SET_SETTINGS']
>;
export type SecurityGetDomainSettingsMessage = BaseMessage<
  'SECURITY_GET_DOMAIN_SETTINGS',
  SecurityMessagePayloads['SECURITY_GET_DOMAIN_SETTINGS']
>;
export type SecuritySetDomainTrustMessage = BaseMessage<
  'SECURITY_SET_DOMAIN_TRUST',
  SecurityMessagePayloads['SECURITY_SET_DOMAIN_TRUST']
>;
export type SecurityGetProgramInfoMessage = BaseMessage<
  'SECURITY_GET_PROGRAM_INFO',
  SecurityMessagePayloads['SECURITY_GET_PROGRAM_INFO']
>;
export type SecuritySetProgramTrustMessage = BaseMessage<
  'SECURITY_SET_PROGRAM_TRUST',
  SecurityMessagePayloads['SECURITY_SET_PROGRAM_TRUST']
>;

export type GetSolPriceMessage = BaseMessage<'GET_SOL_PRICE'>;
export type GetEthPriceMessage = BaseMessage<'GET_ETH_PRICE'>;
export type GetTokenPricesMessage = BaseMessage<'GET_TOKEN_PRICES', { mints: string[] }>;

export type DappRequestMessage = BaseMessage<
  'DAPP_REQUEST',
  {
    chainType: 'evm' | 'solana';
    method: string;
    params: unknown;
    origin: string;
    tabId: number;
    favicon?: string;
    title?: string;
  }
>;
export type DappApproveMessage = BaseMessage<
  'DAPP_APPROVE',
  {
    requestId: string;
    selectedAccounts?: string[];
    remember?: boolean;
  }
>;
export type DappRejectMessage = BaseMessage<
  'DAPP_REJECT',
  {
    requestId: string;
    reason?: string;
  }
>;
export type DappGetPermissionsMessage = BaseMessage<'DAPP_GET_PERMISSIONS'>;
export type DappRevokePermissionMessage = BaseMessage<
  'DAPP_REVOKE_PERMISSION',
  {
    origin: string;
    chainType?: 'evm' | 'solana';
  }
>;
export type DappRevokeAllPermissionsMessage = BaseMessage<'DAPP_REVOKE_ALL_PERMISSIONS'>;
export type DappGetPendingRequestsMessage = BaseMessage<'DAPP_GET_PENDING_REQUESTS'>;
export type DappCancelRequestMessage = BaseMessage<
  'DAPP_CANCEL_REQUEST',
  {
    requestId: string;
  }
>;
export type DappGetProviderStateMessage = BaseMessage<
  'DAPP_GET_PROVIDER_STATE',
  {
    chainType: 'evm' | 'solana';
    origin: string;
  }
>;
export type DappPageUnloadMessage = BaseMessage<
  'DAPP_PAGE_UNLOAD',
  {
    tabId: number;
    origin: string;
  }
>;
export type GetTabIdMessage = BaseMessage<'GET_TAB_ID'>;

export type AdblockerGetStatusMessage = BaseMessage<'ADBLOCKER_GET_STATUS'>;
export type AdblockerSetEnabledMessage = BaseMessage<'ADBLOCKER_SET_ENABLED', { enabled: boolean }>;
export type AdblockerAddToAllowlistMessage = BaseMessage<
  'ADBLOCKER_ADD_TO_ALLOWLIST',
  { domain: string }
>;
export type AdblockerRemoveFromAllowlistMessage = BaseMessage<
  'ADBLOCKER_REMOVE_FROM_ALLOWLIST',
  { domain: string }
>;
export type AdblockerCheckAllowlistMessage = BaseMessage<
  'ADBLOCKER_CHECK_ALLOWLIST',
  { domain: string }
>;

export type ExtensionMessage =
  | GetFeatureFlagsMessage
  | SetFeatureFlagMessage
  | ContentScriptReadyMessage
  | PingMessage
  | OpenSettingsMessage
  | GetPrivacySettingsMessage
  | SetPrivacySettingsMessage
  | GetAdBlockerStatusMessage
  | SetAdBlockerStatusMessage
  | AdBlockerToggledMessage
  | GetSitePrivacyModeMessage
  | SetSitePrivacyModeMessage
  | GetAllSiteSettingsMessage
  | GetPrivacyMetricsMessage
  | GetPrivacyStatusMessage
  | RefreshFilterListsMessage
  | AddFilterListMessage
  | RemoveFilterListMessage
  | GetBlockedCountMessage
  | GetBlockedRequestsMessage
  | PrivacyStateChangedMessage
  | GetCosmeticRulesMessage
  | GetFilterListHealthMessage
  | ResetFilterListMessage
  | GetRulesetStatsMessage
  | EnableRulesetMessage
  | DisableRulesetMessage
  | ToggleRulesetMessage
  | GetThreatIntelHealthMessage
  | RefreshThreatIntelMessage
  | GetThreatIntelSourcesMessage
  | AddThreatIntelSourceMessage
  | RemoveThreatIntelSourceMessage
  | ToggleThreatIntelSourceMessage
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
  | WalletSendSPLTokenMessage
  | WalletEstimateFeeMessage
  | WalletGetHistoryMessage
  | WalletGetTokensMessage
  | WalletAddTokenMessage
  | WalletRemoveTokenMessage
  | WalletGetPopularTokensMessage
  | WalletGetTokenMetadataMessage
  | WalletGetRpcHealthMessage
  | WalletAddRpcMessage
  | WalletRemoveRpcMessage
  | WalletTestRpcMessage
  | WalletListMessage
  | WalletAddMessage
  | WalletImportAddMessage
  | WalletSwitchMessage
  | WalletRenameMessage
  | WalletDeleteOneMessage
  | WalletExportOneMessage
  | WalletImportPrivateKeyMessage
  | WalletExportPrivateKeyMessage
  | WalletGetActiveMessage
  | WalletSetChainMessage
  | WalletSetEVMChainMessage
  | WalletGetEVMBalanceMessage
  | WalletSendETHMessage
  | WalletSendERC20Message
  | WalletGetEVMTokensMessage
  | WalletGetEVMHistoryMessage
  | WalletEstimateEVMFeeMessage
  | WalletGetEVMAddressMessage
  | EVMGetPendingTxsMessage
  | EVMSpeedUpTxMessage
  | EVMCancelTxMessage
  | EVMGetGasPresetsMessage
  | EVMEstimateReplacementFeeMessage
  | WalletGetAllowancesMessage
  | WalletEstimateRevokeFeeMessage
  | WalletRevokeAllowanceMessage

  // Jupiter Swap (Solana)
  | WalletSwapQuoteMessage
  | WalletSwapExecuteMessage
  | WalletSwapAvailableMessage
  | WalletSwapReferralStatusMessage

  // EVM Swap (ParaSwap)
  | EVMSwapQuoteMessage
  | EVMSwapExecuteMessage
  | EVMSwapAvailableMessage

  | EVMRpcRequestMessage
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
  | SecuritySetProgramTrustMessage
  | GetSolPriceMessage
  | GetEthPriceMessage
  | GetTokenPricesMessage
  | DappRequestMessage
  | DappApproveMessage
  | DappRejectMessage
  | DappGetPermissionsMessage
  | DappRevokePermissionMessage
  | DappRevokeAllPermissionsMessage
  | DappGetPendingRequestsMessage
  | DappCancelRequestMessage
  | DappGetProviderStateMessage
  | DappPageUnloadMessage
  | GetTabIdMessage
  | AdblockerGetStatusMessage
  | AdblockerSetEnabledMessage
  | AdblockerAddToAllowlistMessage
  | AdblockerRemoveFromAllowlistMessage
  | AdblockerCheckAllowlistMessage;

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

import { DEFAULT_RULESET_STATE } from '../privacy/rulesetManager';

import { DEFAULT_FINGERPRINT_SETTINGS } from '../fingerprinting/types';
import { DEFAULT_CACHED_THREAT_INTEL } from '../threatIntel/types';
import { DEFAULT_RPC_HEALTH } from '../wallet/types';

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  privacy: true,
  wallet: true,
  notifications: true,
};

export const DEFAULT_STORAGE: StorageSchema = {
  featureFlags: DEFAULT_FEATURE_FLAGS,
  initialized: false,
  version: '0.2.0',

  privacySettings: DEFAULT_PRIVACY_SETTINGS,
  privacySiteSettings: {},
  filterListCache: {},
  privacyMetrics: DEFAULT_PRIVACY_METRICS,
  cosmeticRulesCache: DEFAULT_COSMETIC_RULES,

  filteringLevel: 'optimal',

  fingerprintSettings: DEFAULT_FINGERPRINT_SETTINGS,

  threatIntelCache: DEFAULT_CACHED_THREAT_INTEL,

  filterListHealth: DEFAULT_FILTER_LIST_HEALTH,
  filterListLastKnownGood: DEFAULT_LAST_KNOWN_GOOD,

  rpcHealth: DEFAULT_RPC_HEALTH,
  customRpcUrls: {},

  programRegistryCache: {
    data: { programs: [], version: 'empty', updatedAt: 0 },
    fetchedAt: 0,
    expiresAt: 0,
    source: 'bootstrap',
    isBootstrap: true,
  },

  anchorIdlCache: {},

  rulesetState: DEFAULT_RULESET_STATE,
};

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

export type { ThreatIntelData, ThreatIntelHealth, CachedThreatIntel } from '../threatIntel/types';

export type { FingerprintSettings } from '../fingerprinting/types';
export type { RulesetState, StaticRulesetId } from '../privacy/rulesetManager';
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
  WalletEntry,
  MultiWalletVault,
  EncryptedWalletData,
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
  RpcEndpointHealth,
  RpcHealthSummary,
  EVMPendingTxStatus,
  EVMPendingTxInfo,
  EVMGasPresets,
  EVMReplacementFeeEstimate,
  EVMTokenAllowance,
  EVMAllowanceEntry,
  EVMAllowanceDiscoveryResult,
  EVMRevokeFeeEstimate,
  RecentRecipient,
  RecentRecipientsMap,
  RecentRecipientChainId,

  // Jupiter Swap types
  SwapQuoteResult,
  SwapExecuteResult,
  SwapReferralStatus,
} from '../wallet/types';
export { MAX_RECENT_RECIPIENTS } from '../wallet/types';

export type {
  CachedProgramRegistry,
  ProgramRegistryHealth,
} from '../security/programRegistryRemote';

export type { CachedIdl, DecodedInstruction } from '../security/anchorIdlLoader';

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
