/**
 * AINTIVIRUS Security Module - Type Definitions
 * 
 * This module provides types for wallet security features including:
 * - Connection monitoring and management
 * - Transaction analysis and risk assessment
 * - Phishing detection
 * - Smart contract risk classification
 * 
 * SECURITY LIMITATIONS:
 * - All analysis is heuristic-based and cannot guarantee safety
 * - Program lists may be incomplete; unknown does not mean malicious
 * - Client-side only; no backend verification available
 * - Cannot simulate or predict actual transaction outcomes
 */

// ============================================
// RISK LEVELS
// ============================================

/**
 * Risk level for transactions and interactions
 * 
 * IMPORTANT: These levels are informational only.
 * A "low" risk level does NOT guarantee safety.
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Risk level for Solana programs
 */
export enum ProgramRiskLevel {
  /** Known, verified programs (SPL Token, System, major DEXs) */
  VERIFIED = 'verified',
  /** Not in any list - requires caution */
  UNKNOWN = 'unknown',
  /** User or community flagged as suspicious */
  FLAGGED = 'flagged',
  /** Known malicious program */
  MALICIOUS = 'malicious',
}

// ============================================
// CONNECTION MONITORING
// ============================================

/**
 * Record of a wallet connection to a dApp
 */
export interface ConnectionRecord {
  /** Unique identifier */
  id: string;
  /** Domain that requested connection */
  domain: string;
  /** Full URL at time of connection */
  url: string;
  /** Connection timestamp (Unix ms) */
  timestamp: number;
  /** Public key that was connected */
  publicKey: string;
  /** Whether the connection was approved */
  approved: boolean;
  /** Whether connection was revoked by user */
  revoked: boolean;
  /** Timestamp when revoked (if applicable) */
  revokedAt?: number;
  /** Risk level at time of connection */
  riskLevel: RiskLevel;
  /** Any warnings shown at connection time */
  warnings: string[];
}

/**
 * Domain trust status
 */
export type DomainTrustStatus = 'trusted' | 'neutral' | 'suspicious' | 'blocked';

/**
 * Domain settings configured by user
 */
export interface DomainSettings {
  /** Domain name */
  domain: string;
  /** User-configured trust status */
  trustStatus: DomainTrustStatus;
  /** First seen timestamp */
  firstSeen: number;
  /** Last connection timestamp */
  lastSeen: number;
  /** Number of connections made */
  connectionCount: number;
  /** User-added notes */
  notes?: string;
}

/**
 * Active connection state for a domain
 */
export interface ActiveConnection {
  domain: string;
  publicKey: string;
  connectedAt: number;
  tabId?: number;
}

// ============================================
// TRANSACTION ANALYSIS
// ============================================

/**
 * Parsed instruction summary
 */
export interface InstructionSummary {
  /** Program ID executing this instruction */
  programId: string;
  /** Program name if known */
  programName?: string;
  /** Risk level of the program */
  programRisk: ProgramRiskLevel;
  /** Human-readable description of the instruction */
  description: string;
  /** Instruction type if recognized */
  type?: string;
  /** Accounts involved */
  accounts: string[];
  /** Specific warnings for this instruction */
  warnings: string[];
}

/**
 * Token transfer information
 */
export interface TokenTransferSummary {
  /** Token mint address */
  mint: string;
  /** Token symbol if known */
  symbol?: string;
  /** Token name if known */
  name?: string;
  /** Amount being transferred (UI amount) */
  amount: number;
  /** Raw amount in smallest units */
  rawAmount: string;
  /** Destination address */
  destination: string;
  /** Source address */
  source: string;
  /** Whether this is an approval (not transfer) */
  isApproval: boolean;
  /** If approval, the approved amount (null = unlimited) */
  approvalAmount?: number | null;
}

/**
 * Authority change detection
 */
export interface AuthorityChange {
  /** Type of authority being changed */
  type: 'owner' | 'close' | 'freeze' | 'mint' | 'update';
  /** Account whose authority is changing */
  account: string;
  /** Current authority (if known) */
  currentAuthority?: string;
  /** New authority being set */
  newAuthority: string;
  /** Whether new authority is the wallet itself */
  isWalletAuthority: boolean;
}

/**
 * Complete transaction analysis result
 * 
 * LIMITATION: This analysis is best-effort and may not capture
 * all aspects of complex transactions. Always verify independently.
 */
export interface TransactionSummary {
  /** Unique analysis ID */
  id: string;
  /** Timestamp of analysis */
  analyzedAt: number;
  /** Domain requesting the transaction */
  domain: string;
  /** All instruction summaries */
  instructions: InstructionSummary[];
  /** Total SOL being transferred out */
  totalSolTransfer: number;
  /** Token transfers detected */
  tokenTransfers: TokenTransferSummary[];
  /** Authority changes detected */
  authorityChanges: AuthorityChange[];
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** All warnings generated */
  warnings: string[];
  /** Unknown programs encountered */
  unknownPrograms: string[];
  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
  /** Raw serialized transaction for reference */
  serializedTransaction: string;
}

/**
 * Transaction verification request from dApp
 */
export interface TransactionVerificationRequest {
  /** Request ID for tracking */
  requestId: string;
  /** Domain making the request */
  domain: string;
  /** Serialized transaction(s) */
  transactions: string[];
  /** Tab ID of requesting page */
  tabId?: number;
  /** Timestamp of request */
  timestamp: number;
}

/**
 * User's decision on a transaction
 */
export interface TransactionDecision {
  requestId: string;
  approved: boolean;
  timestamp: number;
  /** If rejected, reason provided by user */
  rejectionReason?: string;
}

// ============================================
// PHISHING DETECTION
// ============================================

/**
 * Types of phishing signals detected
 */
export type PhishingSignalType =
  | 'homoglyph'
  | 'typosquat'
  | 'suspicious_tld'
  | 'known_scam'
  | 'user_flagged'
  | 'new_domain'
  | 'similar_to_known';

/**
 * Individual phishing signal
 */
export interface PhishingSignal {
  type: PhishingSignalType;
  severity: RiskLevel;
  description: string;
  /** Related legitimate domain if applicable */
  relatedDomain?: string;
}

/**
 * Complete phishing analysis result
 * 
 * LIMITATION: Homoglyph and typosquat detection cannot catch
 * all possible variations. This is a heuristic check only.
 */
export interface PhishingAnalysis {
  /** Domain being analyzed */
  domain: string;
  /** Whether any signals were detected */
  isPhishing: boolean;
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** All signals detected */
  signals: PhishingSignal[];
  /** Recommended action */
  recommendation: 'proceed' | 'warning' | 'block';
  /** Whether user has previously dismissed warnings for this domain */
  previouslyDismissed: boolean;
}

// ============================================
// PROGRAM REGISTRY
// ============================================

/**
 * Known program information
 */
export interface ProgramInfo {
  /** Program ID (base58) */
  programId: string;
  /** Human-readable name */
  name: string;
  /** Description of what the program does */
  description: string;
  /** Risk level classification */
  riskLevel: ProgramRiskLevel;
  /** Category (e.g., 'defi', 'nft', 'system') */
  category: string;
  /** Whether this is a native Solana program */
  isNative: boolean;
  /** Website if known */
  website?: string;
  /** When this entry was last updated */
  lastUpdated: number;
}

/**
 * User's custom program settings
 */
export interface CustomProgramSetting {
  programId: string;
  /** User-assigned trust level */
  trustLevel: 'trusted' | 'neutral' | 'blocked';
  /** User-added label */
  label?: string;
  /** When setting was added */
  addedAt: number;
}

// ============================================
// SECURITY SETTINGS
// ============================================

/**
 * User-configurable security settings
 */
export interface SecuritySettings {
  /** Enable wallet connection monitoring */
  connectionMonitoring: boolean;
  /** Enable transaction verification */
  transactionVerification: boolean;
  /** Enable phishing detection */
  phishingDetection: boolean;
  /** Show warnings for unknown programs */
  warnOnUnknownPrograms: boolean;
  /** Show warnings for large transfers */
  warnOnLargeTransfers: boolean;
  /** Threshold for "large" transfer warning (in USD) */
  largeTransferThreshold: number;
  /** Show warnings for authority changes */
  warnOnAuthorityChanges: boolean;
  /** Show warnings for unlimited approvals */
  warnOnUnlimitedApprovals: boolean;
  /** Auto-block known malicious domains */
  autoBlockMalicious: boolean;
  /** Maximum connections to log (for storage limits) */
  maxConnectionHistory: number;
}

/**
 * Default security settings
 */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  connectionMonitoring: true,
  transactionVerification: true,
  phishingDetection: true,
  warnOnUnknownPrograms: true,
  warnOnLargeTransfers: true,
  largeTransferThreshold: 100, // $100 USD
  warnOnAuthorityChanges: true,
  warnOnUnlimitedApprovals: true,
  autoBlockMalicious: true,
  maxConnectionHistory: 500,
};

// ============================================
// SECURITY STORAGE
// ============================================

/**
 * Security module storage schema
 */
export interface SecurityStorageSchema {
  /** User security settings */
  securitySettings: SecuritySettings;
  /** Connection history */
  connectionHistory: ConnectionRecord[];
  /** Active connections by domain */
  activeConnections: Record<string, ActiveConnection>;
  /** Domain-specific settings */
  domainSettings: Record<string, DomainSettings>;
  /** Custom program settings */
  customPrograms: Record<string, CustomProgramSetting>;
  /** Domains user has dismissed warnings for */
  dismissedWarnings: Record<string, number>; // domain -> timestamp
  /** Pending transaction verifications */
  pendingVerifications: TransactionVerificationRequest[];
}

/**
 * Default security storage state
 */
export const DEFAULT_SECURITY_STORAGE: SecurityStorageSchema = {
  securitySettings: DEFAULT_SECURITY_SETTINGS,
  connectionHistory: [],
  activeConnections: {},
  domainSettings: {},
  customPrograms: {},
  dismissedWarnings: {},
  pendingVerifications: [],
};

// ============================================
// MESSAGE TYPES
// ============================================

/**
 * Security-related message types for inter-component communication
 */
export type SecurityMessageType =
  // Connection monitoring
  | 'SECURITY_CONNECTION_REQUEST'
  | 'SECURITY_CONNECTION_APPROVE'
  | 'SECURITY_CONNECTION_DENY'
  | 'SECURITY_CONNECTION_REVOKE'
  | 'SECURITY_GET_CONNECTIONS'
  | 'SECURITY_GET_ACTIVE_CONNECTIONS'
  // Transaction verification
  | 'SECURITY_VERIFY_TRANSACTION'
  | 'SECURITY_TRANSACTION_DECISION'
  | 'SECURITY_GET_PENDING_VERIFICATIONS'
  // Phishing detection
  | 'SECURITY_CHECK_DOMAIN'
  | 'SECURITY_DISMISS_WARNING'
  | 'SECURITY_REPORT_DOMAIN'
  // Settings
  | 'SECURITY_GET_SETTINGS'
  | 'SECURITY_SET_SETTINGS'
  | 'SECURITY_GET_DOMAIN_SETTINGS'
  | 'SECURITY_SET_DOMAIN_TRUST'
  // Program registry
  | 'SECURITY_GET_PROGRAM_INFO'
  | 'SECURITY_SET_PROGRAM_TRUST';

/**
 * Message payloads for security operations
 */
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

/**
 * Message responses for security operations
 */
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

// ============================================
// INJECTED SCRIPT MESSAGES
// ============================================

/**
 * Messages from injected script to content script
 */
export interface InjectedToContentMessage {
  type: 'AINTIVIRUS_WALLET_REQUEST';
  payload: {
    id: string;
    method: 'connect' | 'disconnect' | 'signTransaction' | 'signAllTransactions' | 'signMessage';
    params?: unknown;
  };
}

/**
 * Messages from content script to injected script
 */
export interface ContentToInjectedMessage {
  type: 'AINTIVIRUS_WALLET_RESPONSE';
  payload: {
    id: string;
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * State for transaction verification modal
 */
export interface TransactionVerificationState {
  isOpen: boolean;
  request: TransactionVerificationRequest | null;
  summaries: TransactionSummary[];
  isLoading: boolean;
  error?: string;
}

/**
 * State for phishing warning overlay
 */
export interface PhishingWarningState {
  isShown: boolean;
  analysis: PhishingAnalysis | null;
  userChoice: 'pending' | 'proceed' | 'goBack' | null;
}

/**
 * Connection list filter options
 */
export interface ConnectionFilter {
  domain?: string;
  approved?: boolean;
  revoked?: boolean;
  dateFrom?: number;
  dateTo?: number;
}


