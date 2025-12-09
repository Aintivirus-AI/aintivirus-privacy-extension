

export type RiskLevel = 'low' | 'medium' | 'high';


export enum ProgramRiskLevel {
  
  VERIFIED = 'verified',
  
  UNKNOWN = 'unknown',
  
  FLAGGED = 'flagged',
  
  MALICIOUS = 'malicious',
}


export interface ConnectionRecord {
  
  id: string;
  
  domain: string;
  
  url: string;
  
  timestamp: number;
  
  publicKey: string;
  
  approved: boolean;
  
  revoked: boolean;
  
  revokedAt?: number;
  
  riskLevel: RiskLevel;
  
  warnings: string[];
}


export type DomainTrustStatus = 'trusted' | 'neutral' | 'suspicious' | 'blocked';


export interface DomainSettings {
  
  domain: string;
  
  trustStatus: DomainTrustStatus;
  
  firstSeen: number;
  
  lastSeen: number;
  
  connectionCount: number;
  
  notes?: string;
}


export interface ActiveConnection {
  domain: string;
  publicKey: string;
  connectedAt: number;
  tabId?: number;
}


export interface InstructionSummary {
  
  programId: string;
  
  programName?: string;
  
  programRisk: ProgramRiskLevel;
  
  description: string;
  
  type?: string;
  
  accounts: string[];
  
  warnings: string[];
}


export interface TokenTransferSummary {
  
  mint: string;
  
  symbol?: string;
  
  name?: string;
  
  amount: number;
  
  rawAmount: string;
  
  destination: string;
  
  source: string;
  
  isApproval: boolean;
  
  approvalAmount?: number | null;
}


export interface AuthorityChange {
  
  type: 'owner' | 'close' | 'freeze' | 'mint' | 'update';
  
  account: string;
  
  currentAuthority?: string;
  
  newAuthority: string;
  
  isWalletAuthority: boolean;
}


export interface TransactionSummary {
  
  id: string;
  
  analyzedAt: number;
  
  domain: string;
  
  instructions: InstructionSummary[];
  
  totalSolTransfer: number;
  
  tokenTransfers: TokenTransferSummary[];
  
  authorityChanges: AuthorityChange[];
  
  riskLevel: RiskLevel;
  
  warnings: string[];
  
  unknownPrograms: string[];
  
  requiresConfirmation: boolean;
  
  serializedTransaction: string;
}


export interface TransactionVerificationRequest {
  
  requestId: string;
  
  domain: string;
  
  transactions: string[];
  
  tabId?: number;
  
  timestamp: number;
}


export interface TransactionDecision {
  requestId: string;
  approved: boolean;
  timestamp: number;
  
  rejectionReason?: string;
}


export type PhishingSignalType =
  | 'homoglyph'
  | 'typosquat'
  | 'suspicious_tld'
  | 'known_scam'
  | 'user_flagged'
  | 'new_domain'
  | 'similar_to_known';


export interface PhishingSignal {
  type: PhishingSignalType;
  severity: RiskLevel;
  description: string;
  
  relatedDomain?: string;
}


export interface PhishingAnalysis {
  
  domain: string;
  
  isPhishing: boolean;
  
  riskLevel: RiskLevel;
  
  signals: PhishingSignal[];
  
  recommendation: 'proceed' | 'warning' | 'block';
  
  previouslyDismissed: boolean;
}


export interface ProgramInfo {
  
  programId: string;
  
  name: string;
  
  description: string;
  
  riskLevel: ProgramRiskLevel;
  
  category: string;
  
  isNative: boolean;
  
  website?: string;
  
  lastUpdated: number;
}


export interface CustomProgramSetting {
  programId: string;
  
  trustLevel: 'trusted' | 'neutral' | 'blocked';
  
  label?: string;
  
  addedAt: number;
}


export interface SecuritySettings {
  
  connectionMonitoring: boolean;
  
  transactionVerification: boolean;
  
  phishingDetection: boolean;
  
  warnOnUnknownPrograms: boolean;
  
  warnOnLargeTransfers: boolean;
  
  largeTransferThreshold: number;
  
  warnOnAuthorityChanges: boolean;
  
  warnOnUnlimitedApprovals: boolean;
  
  autoBlockMalicious: boolean;
  
  maxConnectionHistory: number;
}


export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  connectionMonitoring: true,
  transactionVerification: true,
  phishingDetection: true,
  warnOnUnknownPrograms: true,
  warnOnLargeTransfers: true,
  largeTransferThreshold: 100, 
  warnOnAuthorityChanges: true,
  warnOnUnlimitedApprovals: true,
  autoBlockMalicious: true,
  maxConnectionHistory: 500,
};


export interface SecurityStorageSchema {
  
  securitySettings: SecuritySettings;
  
  connectionHistory: ConnectionRecord[];
  
  activeConnections: Record<string, ActiveConnection>;
  
  domainSettings: Record<string, DomainSettings>;
  
  customPrograms: Record<string, CustomProgramSetting>;
  
  dismissedWarnings: Record<string, number>; 
  
  pendingVerifications: TransactionVerificationRequest[];
}


export const DEFAULT_SECURITY_STORAGE: SecurityStorageSchema = {
  securitySettings: DEFAULT_SECURITY_SETTINGS,
  connectionHistory: [],
  activeConnections: {},
  domainSettings: {},
  customPrograms: {},
  dismissedWarnings: {},
  pendingVerifications: [],
};


export type SecurityMessageType =
  
  | 'SECURITY_CONNECTION_REQUEST'
  | 'SECURITY_CONNECTION_APPROVE'
  | 'SECURITY_CONNECTION_DENY'
  | 'SECURITY_CONNECTION_REVOKE'
  | 'SECURITY_GET_CONNECTIONS'
  | 'SECURITY_GET_ACTIVE_CONNECTIONS'
  
  | 'SECURITY_VERIFY_TRANSACTION'
  | 'SECURITY_TRANSACTION_DECISION'
  | 'SECURITY_GET_PENDING_VERIFICATIONS'
  
  | 'SECURITY_CHECK_DOMAIN'
  | 'SECURITY_DISMISS_WARNING'
  | 'SECURITY_REPORT_DOMAIN'
  
  | 'SECURITY_GET_SETTINGS'
  | 'SECURITY_SET_SETTINGS'
  | 'SECURITY_GET_DOMAIN_SETTINGS'
  | 'SECURITY_SET_DOMAIN_TRUST'
  
  | 'SECURITY_GET_PROGRAM_INFO'
  | 'SECURITY_SET_PROGRAM_TRUST';


export interface SecurityMessagePayloads {
  SECURITY_CONNECTION_REQUEST: {
    domain: string;
    url: string;
    tabId?: number;
  };
  SECURITY_CONNECTION_APPROVE: {
    domain: string;
    publicKey: string;
  };
  SECURITY_CONNECTION_DENY: {
    domain: string;
    reason?: string;
  };
  SECURITY_CONNECTION_REVOKE: {
    domain: string;
  };
  SECURITY_GET_CONNECTIONS: {
    limit?: number;
    offset?: number;
  };
  SECURITY_GET_ACTIVE_CONNECTIONS: undefined;
  SECURITY_VERIFY_TRANSACTION: {
    domain: string;
    serializedTransactions: string[];
    tabId?: number;
  };
  SECURITY_TRANSACTION_DECISION: {
    requestId: string;
    approved: boolean;
    reason?: string;
  };
  SECURITY_GET_PENDING_VERIFICATIONS: undefined;
  SECURITY_CHECK_DOMAIN: {
    domain: string;
  };
  SECURITY_DISMISS_WARNING: {
    domain: string;
  };
  SECURITY_REPORT_DOMAIN: {
    domain: string;
    reason: string;
  };
  SECURITY_GET_SETTINGS: undefined;
  SECURITY_SET_SETTINGS: Partial<SecuritySettings>;
  SECURITY_GET_DOMAIN_SETTINGS: {
    domain: string;
  };
  SECURITY_SET_DOMAIN_TRUST: {
    domain: string;
    trustStatus: DomainTrustStatus;
  };
  SECURITY_GET_PROGRAM_INFO: {
    programId: string;
  };
  SECURITY_SET_PROGRAM_TRUST: {
    programId: string;
    trustLevel: 'trusted' | 'neutral' | 'blocked';
    label?: string;
  };
}


export interface SecurityMessageResponses {
  SECURITY_CONNECTION_REQUEST: PhishingAnalysis;
  SECURITY_CONNECTION_APPROVE: ConnectionRecord;
  SECURITY_CONNECTION_DENY: void;
  SECURITY_CONNECTION_REVOKE: void;
  SECURITY_GET_CONNECTIONS: ConnectionRecord[];
  SECURITY_GET_ACTIVE_CONNECTIONS: ActiveConnection[];
  SECURITY_VERIFY_TRANSACTION: TransactionSummary[];
  SECURITY_TRANSACTION_DECISION: void;
  SECURITY_GET_PENDING_VERIFICATIONS: TransactionVerificationRequest[];
  SECURITY_CHECK_DOMAIN: PhishingAnalysis;
  SECURITY_DISMISS_WARNING: void;
  SECURITY_REPORT_DOMAIN: void;
  SECURITY_GET_SETTINGS: SecuritySettings;
  SECURITY_SET_SETTINGS: void;
  SECURITY_GET_DOMAIN_SETTINGS: DomainSettings | null;
  SECURITY_SET_DOMAIN_TRUST: void;
  SECURITY_GET_PROGRAM_INFO: ProgramInfo | null;
  SECURITY_SET_PROGRAM_TRUST: void;
}


export interface InjectedToContentMessage {
  type: 'AINTIVIRUS_WALLET_REQUEST';
  payload: {
    id: string;
    method: 'connect' | 'disconnect' | 'signTransaction' | 'signAllTransactions' | 'signMessage';
    params?: unknown;
  };
}


export interface ContentToInjectedMessage {
  type: 'AINTIVIRUS_WALLET_RESPONSE';
  payload: {
    id: string;
    success: boolean;
    result?: unknown;
    error?: string;
  };
}


export interface TransactionVerificationState {
  isOpen: boolean;
  request: TransactionVerificationRequest | null;
  summaries: TransactionSummary[];
  isLoading: boolean;
  error?: string;
}


export interface PhishingWarningState {
  isShown: boolean;
  analysis: PhishingAnalysis | null;
  userChoice: 'pending' | 'proceed' | 'goBack' | null;
}


export interface ConnectionFilter {
  domain?: string;
  approved?: boolean;
  revoked?: boolean;
  dateFrom?: number;
  dateTo?: number;
}

