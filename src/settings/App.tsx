import React, { useEffect, useState } from 'react';
import {
  FeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  PrivacySettings,
  SitePrivacySettings,
  SitePrivacyMode,
  FingerprintSettings,
} from '@shared/types';
import {
  getFeatureFlags,
  setFeatureFlag,
  FEATURE_FLAG_META,
  onFeatureFlagsChange,
  resetFeatureFlags,
} from '@shared/featureFlags';
import { sendToBackground } from '@shared/messaging';
import { DEFAULT_PRIVACY_SETTINGS } from '../privacy/types';
import { DEFAULT_FINGERPRINT_SETTINGS } from '../fingerprinting/types';

interface IconProps {
  size?: number;
  className?: string;
}

const SettingsIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ShieldIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const WalletIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);

const InfoIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const BellIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const BlockIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m4.9 4.9 14.2 14.2" />
  </svg>
);

const CookieIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
    <path d="M8.5 8.5v.01" />
    <path d="M16 15.5v.01" />
    <path d="M12 12v.01" />
    <path d="M11 17v.01" />
    <path d="M7 14v.01" />
  </svg>
);

const LinkIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const GlobeIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const SearchIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const TargetIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const PaletteIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="13.5" cy="6.5" r=".5" />
    <circle cx="17.5" cy="10.5" r=".5" />
    <circle cx="8.5" cy="7.5" r=".5" />
    <circle cx="6.5" cy="12.5" r=".5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const MonitorIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <line x1="8" x2="16" y1="21" y2="21" />
    <line x1="12" x2="12" y1="17" y2="21" />
  </svg>
);

const VolumeIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const RulerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
    <path d="m14.5 12.5 2-2" />
    <path d="m11.5 9.5 2-2" />
    <path d="m8.5 6.5 2-2" />
    <path d="m17.5 15.5 2-2" />
  </svg>
);

const RefreshIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

const CloseIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const AlertIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const GitHubIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const BookIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
);

const BugIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m8 2 1.88 1.88" />
    <path d="M14.12 3.88 16 2" />
    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
    <path d="M12 20v-9" />
    <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
    <path d="M6 13H2" />
    <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
    <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
    <path d="M22 13h-4" />
    <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
  </svg>
);

const TargetCookieIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const BroomIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m13 11 9-9" />
    <path d="M14.6 12.6a2 2 0 1 0-2.12-2.12" />
    <path d="m2 22 9.5-9.5" />
    <path d="M4 4 2 6l8 8-2 2" />
  </svg>
);

const HandStopIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

type TabId = 'general' | 'privacy' | 'trackers' | 'scripts' | 'wallet' | 'about';

interface FilterListStats {
  listCount: number;
  totalRules: number;
  lastUpdate: number | null;
  lists: { url: string; ruleCount: number; fetchedAt: number }[];
}

interface PrivacyMetrics {
  totalBlockedRequests: number;
  totalCookiesDeleted: number;
  activeRuleCount: number;
  filterListCount: number;
  scriptsIntercepted: number;
  requestsModified: number;
  blockedByDomain: { [domain: string]: number };
  recentBlocked: BlockedRequest[];
  recentCookieCleanups: CookieCleanupEntry[];
  sessionStart: number;
}

interface CookieCleanupEntry {
  domain: string;
  count: number;
  mode: string;
  timestamp: number;
}

interface BlockedRequest {
  tabId: number;
  url: string;
  domain: string;
  initiator: string | null;
  resourceType: string;
  ruleId: number;
  timestamp: number;
}

interface FilterListHealth {
  url: string;
  lastFetchStatus: 'success' | 'error' | 'pending';
  lastFetchAt: number;
  lastError?: string;
  ruleCount: number;
  parseErrors: number;
  unsupportedPatterns: string[];
  hasLastKnownGood: boolean;
  lastSuccessAt?: number;
}

interface FilterListHealthSummary {
  totalLists: number;
  healthyLists: number;
  errorLists: number;
  totalRules: number;
  lastRefresh: number;
  lists: FilterListHealth[];
}

interface RulesetStats {
  enabledRulesets: string[];
  availableRulesets: string[];
  filteringLevel: string;
  dynamicRuleCount: number;
  availableStaticSlots: number;
}

interface CookieStats {
  totalCookies: number;
  byDomain: { [domain: string]: number };
  secureCookies: number;
  httpOnlyCookies: number;
}

interface HeaderRuleStatus {
  refererStripping: boolean;
  gpcEnabled: boolean;
  paramStripping: boolean;
  ruleCount: number;
}

interface PrivacyStatus {
  isEnabled: boolean;
  isInitialized: boolean;
  adBlockerEnabled: boolean;
  headerStatus: HeaderRuleStatus;
  cookieStats: CookieStats;
  filterStats: any;
  adblockerStats: any;
  metrics: PrivacyMetrics;
}

function getFeatureIcon(iconName: string): React.ReactNode {
  switch (iconName) {
    case 'shield':
      return <ShieldIcon size={20} />;
    case 'wallet':
      return <WalletIcon size={20} />;
    case 'bell':
      return <BellIcon size={20} />;
    default:
      return <ShieldIcon size={20} />;
  }
}

interface SecuritySettingsState {
  connectionMonitoring: boolean;
  transactionVerification: boolean;
  phishingDetection: boolean;
  warnOnUnknownPrograms: boolean;
  warnOnLargeTransfers: boolean;
  largeTransferThreshold: number;
  warnOnAuthorityChanges: boolean;
  warnOnUnlimitedApprovals: boolean;
  autoBlockMalicious: boolean;
}

interface ConnectionRecordDisplay {
  id: string;
  domain: string;
  timestamp: number;
  approved: boolean;
  revoked: boolean;
}

interface RpcEndpointHealth {
  url: string;
  latencyMs: number;
  lastSuccess: number;
  lastFailure: number | null;
  failureCount: number;
  successCount: number;
  score: number;
  isCustom: boolean;
}

interface RpcHealthSummary {
  endpoints: RpcEndpointHealth[];
  bestEndpoint: string;
  healthyCount: number;
  unhealthyCount: number;
}

type SolanaNetwork = 'mainnet-beta' | 'devnet';

interface ThreatIntelSource {
  id: string;
  name: string;
  url: string;
  type: 'phishing' | 'malware' | 'scam' | 'combined';
  format: 'text' | 'json' | 'csv';
  enabled: boolean;
  refreshIntervalHours: number;
  priority: number;
}

interface ThreatIntelHealth {
  version: string;
  lastRefresh: number;
  usingBootstrap: boolean;
  legitimateDomainCount: number;
  scamDomainCount: number;
  lastError?: string;
  sourcesConfigured?: number;
  sourcesEnabled?: number;
}

const DEFAULT_SECURITY_SETTINGS: SecuritySettingsState = {
  connectionMonitoring: true,
  transactionVerification: true,
  phishingDetection: true,
  warnOnUnknownPrograms: true,
  warnOnLargeTransfers: true,
  largeTransferThreshold: 100,
  warnOnAuthorityChanges: true,
  warnOnUnlimitedApprovals: true,
  autoBlockMalicious: true,
};

interface WalletSecuritySettingsProps {
  walletEnabled: boolean;
}

const WalletSecuritySettings: React.FC<WalletSecuritySettingsProps> = ({ walletEnabled }) => {
  const [securitySettings, setSecuritySettings] =
    useState<SecuritySettingsState>(DEFAULT_SECURITY_SETTINGS);
  const [connections, setConnections] = useState<ConnectionRecordDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const [rpcHealth, setRpcHealth] = useState<RpcHealthSummary | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<SolanaNetwork>('mainnet-beta');
  const [newRpcUrl, setNewRpcUrl] = useState('');
  const [addingRpc, setAddingRpc] = useState(false);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [testingRpc, setTestingRpc] = useState<string | null>(null);

  // Helper function to mask API keys in URLs
  const maskApiKey = (url: string): string => {
    try {
      const urlObj = new URL(url);

      // Check for various API key parameter names
      const apiKeyParams = ['api-key', 'apikey', 'apiKey'];

      for (const param of apiKeyParams) {
        const apiKey = urlObj.searchParams.get(param);

        if (apiKey && apiKey.length > 8) {
          // Show first 4 and last 4 characters, mask the rest
          const masked =
            apiKey.substring(0, 4) +
            '•'.repeat(Math.min(apiKey.length - 8, 20)) +
            apiKey.substring(apiKey.length - 4);

          // Do a simple string replacement to avoid URL encoding
          return url.replace(apiKey, masked);
        }
      }

      return url;
    } catch {
      // If URL parsing fails, return original
      return url;
    }
  };

  const [threatIntelHealth, setThreatIntelHealth] = useState<ThreatIntelHealth | null>(null);
  const [threatIntelSources, setThreatIntelSources] = useState<ThreatIntelSource[]>([]);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceType, setNewSourceType] = useState<'phishing' | 'malware' | 'scam' | 'combined'>(
    'phishing',
  );
  const [newSourceFormat, setNewSourceFormat] = useState<'text' | 'json' | 'csv'>('text');
  const [addingSource, setAddingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [refreshingThreatIntel, setRefreshingThreatIntel] = useState(false);

  useEffect(() => {
    loadSecurityData();
    loadRpcHealth();
    loadThreatIntelData();
  }, []);

  const loadSecurityData = async () => {
    try {
      const settingsRes = await sendToBackground({
        type: 'SECURITY_GET_SETTINGS',
        payload: undefined,
      });
      if (settingsRes.success && settingsRes.data) {
        setSecuritySettings(settingsRes.data as SecuritySettingsState);
      }

      const connectionsRes = await sendToBackground({
        type: 'SECURITY_GET_CONNECTIONS',
        payload: { limit: 50 },
      });
      if (connectionsRes.success && connectionsRes.data) {
        setConnections(connectionsRes.data as ConnectionRecordDisplay[]);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const loadRpcHealth = async () => {
    try {
      const res = await sendToBackground({
        type: 'WALLET_GET_RPC_HEALTH',
        payload: undefined,
      });
      if (res.success && res.data) {
        setRpcHealth(res.data as RpcHealthSummary);
      }
    } catch (error) {}
  };

  const handleAddRpc = async () => {
    if (!newRpcUrl.trim()) return;

    setAddingRpc(true);
    setRpcError(null);

    try {
      const res = await sendToBackground({
        type: 'WALLET_ADD_RPC',
        payload: { network: selectedNetwork, url: newRpcUrl.trim() },
      });

      if (res.success && res.data) {
        const result = res.data as { success: boolean; error?: string };
        if (result.success) {
          setNewRpcUrl('');
          await loadRpcHealth();
        } else {
          setRpcError(result.error || 'Failed to add RPC');
        }
      } else {
        setRpcError(res.error || 'Failed to add RPC');
      }
    } catch (error) {
      setRpcError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAddingRpc(false);
    }
  };

  const handleRemoveRpc = async (url: string) => {
    try {
      await sendToBackground({
        type: 'WALLET_REMOVE_RPC',
        payload: { network: selectedNetwork, url },
      });
      await loadRpcHealth();
    } catch (error) {}
  };

  const handleTestRpc = async (url: string) => {
    setTestingRpc(url);
    try {
      await sendToBackground({
        type: 'WALLET_TEST_RPC',
        payload: { url },
      });
      await loadRpcHealth();
    } catch (error) {
    } finally {
      setTestingRpc(null);
    }
  };

  const loadThreatIntelData = async () => {
    try {
      const [healthRes, sourcesRes] = await Promise.all([
        sendToBackground({ type: 'GET_THREAT_INTEL_HEALTH', payload: undefined }),
        sendToBackground({ type: 'GET_THREAT_INTEL_SOURCES', payload: undefined }),
      ]);

      if (healthRes.success && healthRes.data) {
        setThreatIntelHealth(healthRes.data as ThreatIntelHealth);
      }
      if (sourcesRes.success && sourcesRes.data) {
        setThreatIntelSources(sourcesRes.data as ThreatIntelSource[]);
      }
    } catch (error) {}
  };

  const handleRefreshThreatIntel = async () => {
    setRefreshingThreatIntel(true);
    try {
      await sendToBackground({ type: 'REFRESH_THREAT_INTEL', payload: undefined });
      await loadThreatIntelData();
    } catch (error) {
    } finally {
      setRefreshingThreatIntel(false);
    }
  };

  const handleToggleSource = async (sourceId: string, enabled: boolean) => {
    try {
      await sendToBackground({
        type: 'TOGGLE_THREAT_INTEL_SOURCE',
        payload: { sourceId, enabled },
      });

      setThreatIntelSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, enabled } : s)));
    } catch (error) {}
  };

  const handleAddSource = async () => {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;

    setAddingSource(true);
    setSourceError(null);

    try {
      const res = await sendToBackground({
        type: 'ADD_THREAT_INTEL_SOURCE',
        payload: {
          name: newSourceName.trim(),
          url: newSourceUrl.trim(),
          type: newSourceType,
          format: newSourceFormat,
        },
      });

      if (res.success) {
        setNewSourceName('');
        setNewSourceUrl('');
        setShowAddSource(false);
        await loadThreatIntelData();
      } else {
        setSourceError(res.error || 'Failed to add source');
      }
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAddingSource(false);
    }
  };

  const handleRemoveSource = async (sourceId: string) => {
    try {
      await sendToBackground({
        type: 'REMOVE_THREAT_INTEL_SOURCE',
        payload: { sourceId },
      });
      setThreatIntelSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (error) {}
  };

  const handleSettingChange = async (key: keyof SecuritySettingsState, value: boolean | number) => {
    const updated = { ...securitySettings, [key]: value };
    setSecuritySettings(updated);
    await sendToBackground({
      type: 'SECURITY_SET_SETTINGS',
      payload: { [key]: value },
    });
  };

  const handleRevokeConnection = async (domain: string) => {
    await sendToBackground({
      type: 'SECURITY_CONNECTION_REVOKE',
      payload: { domain },
    });

    const connectionsRes = await sendToBackground({
      type: 'SECURITY_GET_CONNECTIONS',
      payload: { limit: 50 },
    });
    if (connectionsRes.success && connectionsRes.data) {
      setConnections(connectionsRes.data as ConnectionRecordDisplay[]);
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const activeConnections = connections.filter((c) => c.approved && !c.revoked);

  if (loading) {
    return (
      <section className="settings-section">
        <div className="loading">
          <div className="spinner" />
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h2>Wallet Security</h2>
      <p className="settings-section-desc">Keep your crypto wallet safe from scams and theft</p>

      {}
      <div className="settings-stats-grid">
        <div className="settings-stat-card">
          <span className="settings-stat-value">{activeConnections.length}</span>
          <span className="settings-stat-label"> Active Connections</span>
        </div>
        <div className="settings-stat-card">
          <span className="settings-stat-value">
            {connections.filter((c) => c.approved).length}
          </span>
          <span className="settings-stat-label"> Total Approved</span>
        </div>
        <div className="settings-stat-card">
          <span className="settings-stat-value">
            {connections.filter((c) => !c.approved).length}
          </span>
          <span className="settings-stat-label"> Denied</span>
        </div>
      </div>

      {}
      <div className="settings-subsection">
        <h3>Security Monitoring</h3>
        <p className="settings-subsection-desc">
          We watch for suspicious activity and warn you before something bad happens.
        </p>

        <div className="settings-group" role="list">
          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <LinkIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Connection Monitoring</span>
                <span className="settings-item-desc">
                  Know when apps try to connect to your wallet
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.connectionMonitoring}
                onChange={() =>
                  handleSettingChange(
                    'connectionMonitoring',
                    !securitySettings.connectionMonitoring,
                  )
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>

          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <ShieldIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Transaction Verification</span>
                <span className="settings-item-desc">
                  Check transactions for risks before you approve them
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.transactionVerification}
                onChange={() =>
                  handleSettingChange(
                    'transactionVerification',
                    !securitySettings.transactionVerification,
                  )
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>

          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <AlertIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Phishing Detection</span>
                <span className="settings-item-desc">
                  Warn you when visiting fake or scam websites
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.phishingDetection}
                onChange={() =>
                  handleSettingChange('phishingDetection', !securitySettings.phishingDetection)
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>

          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <BlockIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Auto-Block Scams</span>
                <span className="settings-item-desc">
                  Automatically block websites known for stealing crypto
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.autoBlockMalicious}
                onChange={() =>
                  handleSettingChange('autoBlockMalicious', !securitySettings.autoBlockMalicious)
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>
        </div>
      </div>

      {}
      <div className="settings-subsection">
        <h3>Transaction Warnings</h3>
        <p className="settings-subsection-desc">Get extra warnings for risky transaction types</p>

        <div className="settings-group" role="list">
          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <WalletIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Large Transfer Warning</span>
                <span className="settings-item-desc">Warn when sending more than a set amount</span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.warnOnLargeTransfers}
                onChange={() =>
                  handleSettingChange(
                    'warnOnLargeTransfers',
                    !securitySettings.warnOnLargeTransfers,
                  )
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>

          {securitySettings.warnOnLargeTransfers && (
            <div className="settings-item" role="listitem" style={{ paddingLeft: '52px' }}>
              <div className="settings-item-info">
                <div className="settings-item-text">
                  <span className="settings-item-name">Warning Amount (USD)</span>
                  <span className="settings-item-desc">
                    Warn when transfer value exceeds this amount
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>$</span>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: '100px', textAlign: 'right' }}
                  value={securitySettings.largeTransferThreshold}
                  onChange={(e) =>
                    handleSettingChange('largeTransferThreshold', parseFloat(e.target.value) || 100)
                  }
                  min={1}
                  step={10}
                  disabled={!walletEnabled}
                />
              </div>
            </div>
          )}

          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <SearchIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Unknown App Warning</span>
                <span className="settings-item-desc">
                  Warn when interacting with apps we don't recognize
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.warnOnUnknownPrograms}
                onChange={() =>
                  handleSettingChange(
                    'warnOnUnknownPrograms',
                    !securitySettings.warnOnUnknownPrograms,
                  )
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>

          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <SettingsIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Permission Change Warning</span>
                <span className="settings-item-desc">
                  Warn when apps try to change who controls your tokens
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.warnOnAuthorityChanges}
                onChange={() =>
                  handleSettingChange(
                    'warnOnAuthorityChanges',
                    !securitySettings.warnOnAuthorityChanges,
                  )
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>

          <div className="settings-item" role="listitem">
            <div className="settings-item-info">
              <div className="settings-item-icon">
                <AlertIcon size={20} />
              </div>
              <div className="settings-item-text">
                <span className="settings-item-name">Unlimited Spending Warning</span>
                <span className="settings-item-desc">
                  Warn when apps ask for unlimited access to your tokens
                </span>
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={securitySettings.warnOnUnlimitedApprovals}
                onChange={() =>
                  handleSettingChange(
                    'warnOnUnlimitedApprovals',
                    !securitySettings.warnOnUnlimitedApprovals,
                  )
                }
                disabled={!walletEnabled}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          </div>
        </div>
      </div>

      {}
      <div className="settings-subsection">
        <h3>Connected Sites</h3>
        <p className="settings-subsection-desc">
          Websites that can see your wallet. You can disconnect any site you don't trust anymore.
        </p>

        {activeConnections.length === 0 ? (
          <div className="empty-state">
            <LinkIcon size={32} />
            <p>No active connections</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              dApp connections will appear here when you approve them
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeConnections.map((conn) => (
              <div
                key={conn.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {conn.domain}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Connected {formatTime(conn.timestamp)}
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleRevokeConnection(conn.domain)}
                  disabled={!walletEnabled}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {}
      <div className="settings-subsection">
        <h3>Network Connections</h3>
        <p className="settings-subsection-desc">
          Servers used to connect to Solana (advanced - most users don't need to change this)
        </p>

        {}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Network
          </label>
          <select
            value={selectedNetwork}
            onChange={(e) => setSelectedNetwork(e.target.value as SolanaNetwork)}
            disabled={!walletEnabled}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              minWidth: '150px',
            }}
          >
            <option value="mainnet-beta">Mainnet Beta</option>
            <option value="devnet">Devnet</option>
          </select>
        </div>

        {}
        {rpcHealth && (
          <>
            <div className="settings-stats-grid" style={{ marginBottom: '16px' }}>
              <div className="settings-stat-card">
                <span className="settings-stat-value" style={{ color: 'var(--success)' }}>
                  {rpcHealth.healthyCount}
                </span>
                <span className="settings-stat-label">Healthy</span>
              </div>
              <div className="settings-stat-card">
                <span
                  className="settings-stat-value"
                  style={{
                    color: rpcHealth.unhealthyCount > 0 ? 'var(--danger)' : 'var(--text-muted)',
                  }}
                >
                  {rpcHealth.unhealthyCount}
                </span>
                <span className="settings-stat-label">Unhealthy</span>
              </div>
              <div className="settings-stat-card">
                <span className="settings-stat-value">{rpcHealth.endpoints.length}</span>
                <span className="settings-stat-label">Total Endpoints</span>
              </div>
            </div>

            {}
            <div
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                What does Score mean?
              </div>
              <p style={{ margin: '0 0 8px 0', lineHeight: 1.5 }}>
                The score (0-100) measures each server's reliability based on response speed,
                success rate, and recent failures. Higher scores mean faster, more reliable
                connections.
              </p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>70+</span> = Excellent
                </span>
                <span>
                  <span style={{ color: 'var(--warning)', fontWeight: 600 }}>50-69</span> = OK
                </span>
                <span>
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>&lt;50</span> = Poor
                </span>
              </div>
              <p style={{ margin: '8px 0 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
                Click "Test" to check a server's current performance and update its score.
              </p>
            </div>

            {}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}
            >
              {rpcHealth.endpoints.map((endpoint) => (
                <div
                  key={endpoint.url}
                  style={{
                    background: 'var(--bg-secondary)',
                    border:
                      endpoint.url === rpcHealth.bestEndpoint
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: endpoint.score >= 50 ? 'var(--success)' : 'var(--danger)',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          wordBreak: 'break-all',
                        }}
                      >
                        {maskApiKey(endpoint.url)}
                      </span>
                      {endpoint.isCustom && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--accent-muted)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          Custom
                        </span>
                      )}
                      {endpoint.url === rpcHealth.bestEndpoint && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--success-muted)',
                            color: 'var(--success)',
                          }}
                        >
                          Best
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background:
                            endpoint.score >= 70
                              ? 'var(--success-muted)'
                              : endpoint.score >= 50
                                ? 'var(--warning-muted)'
                                : 'var(--danger-muted)',
                          color:
                            endpoint.score >= 70
                              ? 'var(--success)'
                              : endpoint.score >= 50
                                ? 'var(--warning)'
                                : 'var(--danger)',
                        }}
                      >
                        Score: {endpoint.score}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: '16px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {endpoint.latencyMs > 0 && <span>Latency: {endpoint.latencyMs}ms</span>}
                      <span style={{ color: 'var(--success)' }}>✓ {endpoint.successCount}</span>
                      {endpoint.failureCount > 0 && (
                        <span style={{ color: 'var(--danger)' }}>✗ {endpoint.failureCount}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleTestRpc(endpoint.url)}
                        disabled={testingRpc === endpoint.url || !walletEnabled}
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                      >
                        {testingRpc === endpoint.url ? 'Testing...' : 'Test'}
                      </button>
                      {endpoint.isCustom && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemoveRpc(endpoint.url)}
                          disabled={!walletEnabled}
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {}
        <div style={{ marginTop: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Add Custom RPC Endpoint
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="url"
              className="form-input"
              placeholder="https://your-rpc-endpoint.com"
              value={newRpcUrl}
              onChange={(e) => setNewRpcUrl(e.target.value)}
              disabled={!walletEnabled || addingRpc}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleAddRpc}
              disabled={!newRpcUrl.trim() || !walletEnabled || addingRpc}
            >
              {addingRpc ? 'Adding...' : 'Add'}
            </button>
          </div>
          {rpcError && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: 'var(--danger-muted)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--danger)',
              }}
            >
              {rpcError}
            </div>
          )}
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Only HTTPS endpoints are allowed for security. The endpoint will be tested before
            adding.
          </p>
        </div>
      </div>

      {}
      <div className="settings-subsection">
        <h3>Scam Database</h3>
        <p className="settings-subsection-desc">
          Lists of known scam websites we check against (updated automatically)
        </p>

        {}
        {threatIntelHealth && (
          <div className="settings-stats-grid" style={{ marginBottom: '16px' }}>
            <div className="settings-stat-card">
              <span className="settings-stat-value">{threatIntelHealth.scamDomainCount}</span>
              <span className="settings-stat-label"> Scam Domains</span>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-value">{threatIntelHealth.legitimateDomainCount}</span>
              <span className="settings-stat-label"> Legitimate Domains</span>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-value">
                {threatIntelHealth.sourcesEnabled || 0}/{threatIntelHealth.sourcesConfigured || 0}
              </span>
              <span className="settings-stat-label"> Sources Active</span>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-value" style={{ fontSize: '14px' }}>
                {threatIntelHealth.lastRefresh > 0
                  ? formatTime(threatIntelHealth.lastRefresh)
                  : 'Never'}
              </span>
              <span className="settings-stat-label"> Last Refresh</span>
            </div>
          </div>
        )}

        {}
        {threatIntelHealth?.usingBootstrap && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              background: 'var(--warning-muted)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertIcon size={16} />
            <span style={{ fontSize: '13px', color: 'var(--warning)' }}>
              Using bootstrap data. Remote sources have not been fetched yet.
            </span>
          </div>
        )}

        {}
        <div style={{ marginBottom: '16px' }}>
          <button
            className="btn btn-primary"
            onClick={handleRefreshThreatIntel}
            disabled={refreshingThreatIntel || !walletEnabled}
          >
            <RefreshIcon size={14} />
            <span>{refreshingThreatIntel ? 'Refreshing...' : 'Refresh Threat Data'}</span>
          </button>
        </div>

        {}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {threatIntelSources.map((source) => (
            <div
              key={source.id}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px 16px',
                opacity: source.enabled ? 1 : 0.6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {source.name}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background:
                        source.type === 'phishing'
                          ? 'var(--danger-muted)'
                          : source.type === 'malware'
                            ? 'var(--warning-muted)'
                            : source.type === 'scam'
                              ? 'var(--danger-muted)'
                              : 'var(--accent-muted)',
                      color:
                        source.type === 'phishing'
                          ? 'var(--danger)'
                          : source.type === 'malware'
                            ? 'var(--warning)'
                            : source.type === 'scam'
                              ? 'var(--danger)'
                              : 'var(--accent-primary)',
                    }}
                  >
                    {source.type}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {source.format}
                  </span>
                  {source.id.startsWith('custom-') && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--accent-muted)',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      Custom
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label className="toggle" style={{ marginRight: '8px' }}>
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={() => handleToggleSource(source.id, !source.enabled)}
                      disabled={!walletEnabled}
                    />
                    <span className="toggle-track" aria-hidden="true" />
                  </label>
                  {source.id.startsWith('custom-') && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveSource(source.id)}
                      disabled={!walletEnabled}
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {maskApiKey(source.url)}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  marginTop: '8px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                <span>Refresh: every {source.refreshIntervalHours}h</span>
                <span>Priority: {source.priority}</span>
              </div>
            </div>
          ))}
        </div>

        {}
        {!showAddSource ? (
          <button
            className="btn btn-secondary"
            onClick={() => setShowAddSource(true)}
            disabled={!walletEnabled}
          >
            Add Custom Source
          </button>
        ) : (
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-primary)' }}>
              Add Custom Threat Intel Source
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Source Name
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="My Custom Feed"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  disabled={addingSource}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Feed URL (HTTPS only)
                </label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://example.com/threat-feed.txt"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  disabled={addingSource}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Threat Type
                  </label>
                  <select
                    value={newSourceType}
                    onChange={(e) =>
                      setNewSourceType(
                        e.target.value as 'phishing' | 'malware' | 'scam' | 'combined',
                      )
                    }
                    disabled={addingSource}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  >
                    <option value="phishing">Phishing</option>
                    <option value="malware">Malware</option>
                    <option value="scam">Scam</option>
                    <option value="combined">Combined</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Format
                  </label>
                  <select
                    value={newSourceFormat}
                    onChange={(e) => setNewSourceFormat(e.target.value as 'text' | 'json' | 'csv')}
                    disabled={addingSource}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  >
                    <option value="text">Text (one URL per line)</option>
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>
              </div>

              {sourceError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--danger-muted)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--danger)',
                  }}
                >
                  {sourceError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleAddSource}
                  disabled={!newSourceName.trim() || !newSourceUrl.trim() || addingSource}
                >
                  {addingSource ? 'Adding...' : 'Add Source'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddSource(false);
                    setNewSourceName('');
                    setNewSourceUrl('');
                    setSourceError(null);
                  }}
                  disabled={addingSource}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {}
      <div
        style={{
          marginTop: '24px',
          padding: '16px 20px',
          background: 'var(--warning-muted)',
          border: '1px solid var(--warning)',
          borderRadius: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ flexShrink: 0, marginTop: '2px', color: 'var(--warning)' }}>
            <AlertIcon size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: '4px' }}>
              Security Limitations
            </div>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              This security analysis is informational only and cannot guarantee safety. Program
              lists may be incomplete. Unknown programs are not necessarily malicious. Always verify
              transaction details independently before signing.
            </p>
          </div>
        </div>
      </div>

      {!walletEnabled && (
        <div className="notice" style={{ marginTop: '24px' }}>
          <AlertIcon size={20} />
          <p>
            Wallet feature is disabled. Enable it in the General tab to configure security settings.
          </p>
        </div>
      )}
    </section>
  );
};

const App: React.FC = () => {
  const getInitialTab = (): TabId => {
    const hash = window.location.hash.replace('#', '');
    if (['general', 'privacy', 'trackers', 'scripts', 'wallet', 'about'].includes(hash)) {
      return hash as TabId;
    }
    return 'general';
  };

  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab());
  const [loading, setLoading] = useState(true);

  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [siteSettings, setSiteSettings] = useState<SitePrivacySettings>({});
  const [filterStats, setFilterStats] = useState<FilterListStats | null>(null);
  const [metrics, setMetrics] = useState<PrivacyMetrics | null>(null);
  const [newFilterUrl, setNewFilterUrl] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [fingerprintSettings, setFingerprintSettings] = useState<FingerprintSettings>(
    DEFAULT_FINGERPRINT_SETTINGS,
  );

  const [blockedRequests, setBlockedRequests] = useState<BlockedRequest[]>([]);
  const [trackerSearch, setTrackerSearch] = useState('');

  const [filterListHealth, setFilterListHealth] = useState<FilterListHealthSummary | null>(null);
  const [retryingList, setRetryingList] = useState<string | null>(null);

  const [rulesetStats, setRulesetStats] = useState<RulesetStats | null>(null);

  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus | null>(null);

  useEffect(() => {
    loadInitialData();

    const unsubscribe = onFeatureFlagsChange((newFlags) => {
      setFlags(newFlags);
    });

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['general', 'privacy', 'trackers', 'scripts', 'wallet', 'about'].includes(hash)) {
        setActiveTab(hash as TabId);
      }
    };
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      unsubscribe();
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Listen for ad blocker status changes from other sources (e.g., popup)
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.privacySettings) {
        const newSettings = changes.privacySettings.newValue;
        if (newSettings) {
          setPrivacySettings(newSettings);
          // Also refresh privacy status to keep adBlockerEnabled in sync
          fetchPrivacyStatus().then((status) => {
            if (status) setPrivacyStatus(status);
          });
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const loadInitialData = async () => {
    try {
      const [
        loadedFlags,
        privSettings,
        siteSets,
        filterStatsData,
        metricsData,
        fpSettings,
        blocked,
        filterHealth,
        rulesetStatsData,
        privacyStatusData,
      ] = await Promise.all([
        getFeatureFlags(),
        fetchPrivacySettings(),
        fetchSiteSettings(),
        fetchFilterStats(),
        fetchMetrics(),
        fetchFingerprintSettings(),
        fetchBlockedRequests(),
        fetchFilterListHealth(),
        fetchRulesetStats(),
        fetchPrivacyStatus(),
      ]);

      setFlags(loadedFlags);
      if (privSettings) setPrivacySettings(privSettings);
      if (siteSets) setSiteSettings(siteSets);
      if (filterStatsData) setFilterStats(filterStatsData);
      if (metricsData) setMetrics(metricsData);
      if (fpSettings) setFingerprintSettings(fpSettings);
      if (blocked) setBlockedRequests(blocked);
      if (filterHealth) setFilterListHealth(filterHealth);
      if (rulesetStatsData) setRulesetStats(rulesetStatsData);
      if (privacyStatusData) setPrivacyStatus(privacyStatusData);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const fetchBlockedRequests = async (): Promise<BlockedRequest[] | null> => {
    const response = await sendToBackground({ type: 'GET_BLOCKED_REQUESTS', payload: undefined });
    return response.success ? (response.data as BlockedRequest[]) : null;
  };

  const fetchPrivacySettings = async (): Promise<PrivacySettings | null> => {
    const response = await sendToBackground({ type: 'GET_PRIVACY_SETTINGS', payload: undefined });
    return response.success ? (response.data as PrivacySettings) : null;
  };

  const fetchSiteSettings = async (): Promise<SitePrivacySettings | null> => {
    const response = await sendToBackground({ type: 'GET_ALL_SITE_SETTINGS', payload: undefined });
    return response.success ? (response.data as SitePrivacySettings) : null;
  };

  const fetchFilterStats = async (): Promise<FilterListStats | null> => {
    return null;
  };

  const fetchFilterListHealth = async (): Promise<FilterListHealthSummary | null> => {
    const response = await sendToBackground({ type: 'GET_FILTER_LIST_HEALTH', payload: undefined });
    return response.success ? (response.data as FilterListHealthSummary) : null;
  };

  const handleRetryFilterList = async (url: string) => {
    setRetryingList(url);
    try {
      await sendToBackground({ type: 'RESET_FILTER_LIST', payload: { url } });
      await sendToBackground({ type: 'REFRESH_FILTER_LISTS', payload: undefined });
      const newHealth = await fetchFilterListHealth();
      if (newHealth) setFilterListHealth(newHealth);
    } catch (error) {
    } finally {
      setRetryingList(null);
    }
  };

  const fetchMetrics = async (): Promise<PrivacyMetrics | null> => {
    const response = await sendToBackground({ type: 'GET_PRIVACY_METRICS', payload: undefined });
    return response.success ? (response.data as PrivacyMetrics) : null;
  };

  const fetchFingerprintSettings = async (): Promise<FingerprintSettings | null> => {
    const response = await sendToBackground({
      type: 'GET_FINGERPRINT_SETTINGS',
      payload: undefined,
    });
    return response.success ? (response.data as FingerprintSettings) : null;
  };

  const fetchRulesetStats = async (): Promise<RulesetStats | null> => {
    const response = await sendToBackground({ type: 'GET_RULESET_STATS', payload: undefined });
    return response.success ? (response.data as RulesetStats) : null;
  };

  const fetchPrivacyStatus = async (): Promise<PrivacyStatus | null> => {
    const response = await sendToBackground({ type: 'GET_PRIVACY_STATUS', payload: undefined });
    return response.success ? (response.data as PrivacyStatus) : null;
  };

  const handleToggle = async (id: keyof FeatureFlags) => {
    const newValue = !flags[id];
    setFlags((prev) => ({ ...prev, [id]: newValue }));
    await setFeatureFlag(id, newValue);
  };

  const handleReset = async () => {
    if (confirm('Reset all settings to defaults?')) {
      await resetFeatureFlags();
    }
  };

  const handlePrivacySettingChange = async <K extends keyof PrivacySettings>(
    key: K,
    value: PrivacySettings[K],
  ) => {
    const updated = { ...privacySettings, [key]: value };
    setPrivacySettings(updated);
    await sendToBackground({
      type: 'SET_PRIVACY_SETTINGS',
      payload: { [key]: value },
    });
  };

  const handleFingerprintSettingChange = async (key: keyof FingerprintSettings, value: boolean) => {
    const updated = { ...fingerprintSettings, [key]: value };
    setFingerprintSettings(updated);
    await sendToBackground({
      type: 'SET_FINGERPRINT_SETTINGS',
      payload: { [key]: value },
    });
  };

  const handleAdBlockerToggle = async (enabled: boolean) => {
    if (privacyStatus) {
      setPrivacyStatus({ ...privacyStatus, adBlockerEnabled: enabled });
    }

    try {
      const response = await sendToBackground({
        type: 'SET_AD_BLOCKER_STATUS',
        payload: { enabled },
      });

      const newStatus = await fetchPrivacyStatus();
      if (newStatus) {
        setPrivacyStatus(newStatus);
      }

      // Refresh metrics and ruleset stats
      const newMetrics = await fetchMetrics();
      if (newMetrics) setMetrics(newMetrics);
      const newRulesetStats = await fetchRulesetStats();
      if (newRulesetStats) setRulesetStats(newRulesetStats);
    } catch (error) {
      if (privacyStatus) {
        setPrivacyStatus({ ...privacyStatus, adBlockerEnabled: !enabled });
      }
    }
  };

  const handleRefreshFilterLists = async () => {
    setRefreshing(true);
    try {
      await sendToBackground({ type: 'REFRESH_FILTER_LISTS', payload: undefined });
      const newMetrics = await fetchMetrics();
      if (newMetrics) setMetrics(newMetrics);
    } catch (error) {
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddFilterList = async () => {
    if (!newFilterUrl.trim()) return;

    const urlToAdd = newFilterUrl.trim();
    try {
      await sendToBackground({
        type: 'ADD_FILTER_LIST',
        payload: { url: urlToAdd },
      });
      setNewFilterUrl('');
      setPrivacySettings((prev) => ({
        ...prev,
        filterListUrls: [...prev.filterListUrls, urlToAdd],
      }));
      const newMetrics = await fetchMetrics();
      if (newMetrics) setMetrics(newMetrics);
    } catch (error) {}
  };

  const handleRemoveFilterList = async (url: string) => {
    try {
      await sendToBackground({
        type: 'REMOVE_FILTER_LIST',
        payload: { url },
      });
      setPrivacySettings((prev) => ({
        ...prev,
        filterListUrls: prev.filterListUrls.filter((u) => u !== url),
      }));
    } catch (error) {}
  };

  const handleSiteModeChange = async (domain: string, mode: SitePrivacyMode) => {
    try {
      await sendToBackground({
        type: 'SET_SITE_PRIVACY_MODE',
        payload: { domain, mode },
      });
      setSiteSettings((prev) => ({ ...prev, [domain]: mode }));
    } catch (error) {}
  };

  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const filteredSites = Object.entries(siteSettings).filter(([domain]) =>
    domain.toLowerCase().includes(siteSearch.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="settings-container">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <header className="settings-header">
        <div className="settings-header-content">
          <div className="settings-brand">
            <img src="icons/ainti_l1.png" alt="AINTIVIRUS" className="logo-icon" />
            <h1>Aintivirus Privacy Settings</h1>
          </div>
          <p className="settings-tagline">Configure your browser privacy protection.</p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav">
          <button
            className={`nav-item ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <SettingsIcon size={16} />
            <span>General</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            <ShieldIcon size={16} />
            <span>Privacy</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'trackers' ? 'active' : ''}`}
            onClick={() => setActiveTab('trackers')}
          >
            <BlockIcon size={16} />
            <span>Trackers</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'scripts' ? 'active' : ''}`}
            onClick={() => setActiveTab('scripts')}
          >
            <TargetIcon size={16} />
            <span>Scripts</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'wallet' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallet')}
          >
            <WalletIcon size={16} />
            <span>Wallet</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            <InfoIcon size={16} />
            <span>About</span>
          </button>
        </nav>

        <main className="settings-main">
          {activeTab === 'general' && (
            <section className="settings-section">
              <h2>Main Features</h2>
              <p className="settings-section-desc">Turn protection features on or off</p>

              <div className="settings-group" role="list">
                {FEATURE_FLAG_META.map((feature) => (
                  <div key={feature.id} className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">{getFeatureIcon(feature.icon)}</div>
                      <div className="settings-item-text">
                        <span className="settings-item-name" id={`setting-${feature.id}-label`}>
                          {feature.name}
                        </span>
                        <span className="settings-item-desc" id={`setting-${feature.id}-desc`}>
                          {feature.description}
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={flags[feature.id]}
                        onChange={() => handleToggle(feature.id)}
                        aria-labelledby={`setting-${feature.id}-label`}
                        aria-describedby={`setting-${feature.id}-desc`}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 'var(--space-xl)',
                  paddingTop: 'var(--space-xl)',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <button className="btn btn-secondary" onClick={handleReset}>
                  Reset to Defaults
                </button>
              </div>
            </section>
          )}

          {activeTab === 'privacy' && (
            <section className="settings-section">
              <h2>Privacy Protection</h2>
              <p className="settings-section-desc">
                Protect your identity and personal data from websites
              </p>

              {}
              {metrics && (
                <div className="settings-stats-grid">
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.scriptsIntercepted || 0)}
                    </span>
                    <span className="settings-stat-label"> Scripts Intercepted</span>
                  </div>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.requestsModified || 0)}
                    </span>
                    <span className="settings-stat-label"> Requests Modified</span>
                  </div>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.totalCookiesDeleted)}
                    </span>
                    <span className="settings-stat-label"> Cookies Deleted</span>
                  </div>
                </div>
              )}

              {}
              <div className="settings-subsection">
                <h3>Privacy Features</h3>
                {!flags.privacy && (
                  <p className="settings-subsection-hint">
                    Enable "Privacy & Ad Blocking" in the General tab to activate these features.
                  </p>
                )}

                <div className="settings-group" role="list">
                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <CookieIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Cookie Auto-Delete</span>
                        <span className="settings-item-desc">
                          Automatically clean up tracking files when you close a tab
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={flags.privacy && privacySettings.cookieCleanup}
                        onChange={() =>
                          handlePrivacySettingChange(
                            'cookieCleanup',
                            !privacySettings.cookieCleanup,
                          )
                        }
                        disabled={!flags.privacy}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <LinkIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Hide Where You Came From</span>
                        <span className="settings-item-desc">
                          Don't let sites know which page you visited before
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={flags.privacy && privacySettings.headerMinimization}
                        onChange={() =>
                          handlePrivacySettingChange(
                            'headerMinimization',
                            !privacySettings.headerMinimization,
                          )
                        }
                        disabled={!flags.privacy}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <GlobeIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Global Privacy Control</span>
                        <span className="settings-item-desc">
                          Tell websites "Do Not Sell My Data" automatically
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={flags.privacy && privacySettings.sendGPC}
                        onChange={() =>
                          handlePrivacySettingChange('sendGPC', !privacySettings.sendGPC)
                        }
                        disabled={!flags.privacy}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <SearchIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Clean Link URLs</span>
                        <span className="settings-item-desc">
                          Remove tracking codes from links (like those long Facebook/Google URLs)
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={flags.privacy && privacySettings.stripTrackingParams}
                        onChange={() =>
                          handlePrivacySettingChange(
                            'stripTrackingParams',
                            !privacySettings.stripTrackingParams,
                          )
                        }
                        disabled={!flags.privacy}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>
                </div>
              </div>

              {}
              <div className="settings-subsection">
                <h3>Fingerprint Protection</h3>
                <p className="settings-subsection-desc">
                  Stop websites from recognizing you based on your device's unique characteristics
                </p>
                {!flags.privacy && (
                  <p className="settings-subsection-hint">
                    Enable "Privacy & Ad Blocking" in the General tab to activate these features.
                  </p>
                )}

                <div className="settings-group" role="list">
                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <TargetIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Enable Fingerprint Protection</span>
                        <span className="settings-item-desc">
                          Turn on all disguise features below
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={flags.privacy && fingerprintSettings.enabled}
                        onChange={() =>
                          handleFingerprintSettingChange('enabled', !fingerprintSettings.enabled)
                        }
                        disabled={!flags.privacy}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <PaletteIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Canvas Protection</span>
                        <span className="settings-item-desc">
                          Prevent sites from identifying you through image rendering
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={
                          flags.privacy &&
                          fingerprintSettings.enabled &&
                          fingerprintSettings.canvasNoise
                        }
                        onChange={() =>
                          handleFingerprintSettingChange(
                            'canvasNoise',
                            !fingerprintSettings.canvasNoise,
                          )
                        }
                        disabled={!flags.privacy || !fingerprintSettings.enabled}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <MonitorIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Graphics Card Protection</span>
                        <span className="settings-item-desc">
                          Hide your graphics card details from websites
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={
                          flags.privacy &&
                          fingerprintSettings.enabled &&
                          fingerprintSettings.webglMask
                        }
                        onChange={() =>
                          handleFingerprintSettingChange(
                            'webglMask',
                            !fingerprintSettings.webglMask,
                          )
                        }
                        disabled={!flags.privacy || !fingerprintSettings.enabled}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <RulerIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Screen Size Protection</span>
                        <span className="settings-item-desc">
                          Report a common screen size instead of your real one
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={
                          flags.privacy &&
                          fingerprintSettings.enabled &&
                          fingerprintSettings.screenMask
                        }
                        onChange={() =>
                          handleFingerprintSettingChange(
                            'screenMask',
                            !fingerprintSettings.screenMask,
                          )
                        }
                        disabled={!flags.privacy || !fingerprintSettings.enabled}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <VolumeIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Audio Protection</span>
                        <span className="settings-item-desc">
                          Prevent tracking through your device's audio system
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={
                          flags.privacy &&
                          fingerprintSettings.enabled &&
                          fingerprintSettings.audioNoise
                        }
                        onChange={() =>
                          handleFingerprintSettingChange(
                            'audioNoise',
                            !fingerprintSettings.audioNoise,
                          )
                        }
                        disabled={!flags.privacy || !fingerprintSettings.enabled}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <GlobeIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Device Info Protection</span>
                        <span className="settings-item-desc">
                          Hide details about your operating system and device type
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={
                          flags.privacy &&
                          fingerprintSettings.enabled &&
                          fingerprintSettings.clientHintsMask
                        }
                        onChange={() =>
                          handleFingerprintSettingChange(
                            'clientHintsMask',
                            !fingerprintSettings.clientHintsMask,
                          )
                        }
                        disabled={!flags.privacy || !fingerprintSettings.enabled}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>
                </div>
              </div>

              {}
              {flags.privacy && privacyStatus?.cookieStats && (
                <div className="settings-subsection">
                  <h3>Current Cookie Status</h3>
                  <p className="settings-subsection-desc">
                    Real-time overview of cookies currently stored in your browser
                  </p>

                  <div className="settings-stats-grid" style={{ marginBottom: '16px' }}>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value">
                        {formatNumber(privacyStatus.cookieStats.totalCookies)}
                      </span>
                      <span className="settings-stat-label">Total Cookies</span>
                    </div>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value" style={{ color: 'var(--success)' }}>
                        {formatNumber(privacyStatus.cookieStats.secureCookies)}
                      </span>
                      <span className="settings-stat-label">Secure Cookies</span>
                    </div>
                    <div className="settings-stat-card">
                      <span
                        className="settings-stat-value"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {formatNumber(privacyStatus.cookieStats.httpOnlyCookies)}
                      </span>
                      <span className="settings-stat-label">HttpOnly Cookies</span>
                    </div>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value">
                        {formatNumber(Object.keys(privacyStatus.cookieStats.byDomain).length)}
                      </span>
                      <span className="settings-stat-label">Cookie Domains</span>
                    </div>
                  </div>

                  {}
                  {Object.keys(privacyStatus.cookieStats.byDomain).length > 0 && (
                    <div>
                      <h4
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          marginBottom: '12px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Top Cookie Setters
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(privacyStatus.cookieStats.byDomain)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 5)
                          .map(([domain, count]) => (
                            <div
                              key={domain}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                background: 'var(--bg-secondary)',
                                borderRadius: '6px',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '13px',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {domain}
                              </span>
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--text-muted)',
                                  background: 'var(--bg-tertiary)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                }}
                              >
                                {count} {count === 1 ? 'cookie' : 'cookies'}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {}
              {flags.privacy &&
                metrics?.blockedByDomain &&
                Object.keys(metrics.blockedByDomain).length > 0 && (
                  <div className="settings-subsection">
                    <h3>Most Invasive Sites</h3>
                    <p className="settings-subsection-desc">
                      Domains that have attempted the most tracking requests
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Object.entries(metrics.blockedByDomain)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([domain, count], index) => {
                          const maxCount = Math.max(...Object.values(metrics.blockedByDomain));
                          const percentage = (count / maxCount) * 100;

                          return (
                            <div
                              key={domain}
                              style={{
                                padding: '12px',
                                background: 'var(--bg-secondary)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginBottom: '8px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      color: 'var(--text-muted)',
                                      minWidth: '20px',
                                    }}
                                  >
                                    #{index + 1}
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '13px',
                                      color: 'var(--text-primary)',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {domain}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: 'var(--danger)',
                                    background: 'var(--danger-muted)',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                  }}
                                >
                                  {formatNumber(count)} blocked
                                </span>
                              </div>
                              <div
                                style={{
                                  width: '100%',
                                  height: '4px',
                                  background: 'var(--bg-tertiary)',
                                  borderRadius: '2px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${percentage}%`,
                                    height: '100%',
                                    background:
                                      'linear-gradient(90deg, var(--danger) 0%, var(--warning) 100%)',
                                    transition: 'width 0.3s ease',
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

              {}
              {flags.privacy && privacyStatus?.headerStatus && (
                <div className="settings-subsection">
                  <h3>Active Protection Features</h3>
                  <p className="settings-subsection-desc">
                    Real-time status of your privacy protection features
                  </p>

                  <div className="settings-group" role="list" style={{ gap: '8px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        Referrer Headers
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: privacyStatus.headerStatus.refererStripping
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                          color: privacyStatus.headerStatus.refererStripping
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {privacyStatus.headerStatus.refererStripping ? '✓ STRIPPED' : 'INACTIVE'}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        Global Privacy Control
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: privacyStatus.headerStatus.gpcEnabled
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                          color: privacyStatus.headerStatus.gpcEnabled
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {privacyStatus.headerStatus.gpcEnabled ? '✓ ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        Tracking Parameters
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: privacyStatus.headerStatus.paramStripping
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                          color: privacyStatus.headerStatus.paramStripping
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {privacyStatus.headerStatus.paramStripping ? '✓ CLEANED' : 'INACTIVE'}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        Fingerprint Protection
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: fingerprintSettings.enabled
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                          color: fingerprintSettings.enabled
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {fingerprintSettings.enabled ? '✓ ENABLED' : 'INACTIVE'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {}
              {flags.privacy &&
                metrics?.recentCookieCleanups &&
                metrics.recentCookieCleanups.length > 0 && (
                  <div className="settings-subsection">
                    <h3>Recent Privacy Actions</h3>
                    <p className="settings-subsection-desc">
                      Live feed of recent protection events
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                      }}
                    >
                      {metrics.recentCookieCleanups.slice(0, 15).map((cleanup, index) => {
                        const timeAgo = (() => {
                          const diff = Date.now() - cleanup.timestamp;
                          if (diff < 60000) return 'Just now';
                          if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                          if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                          return new Date(cleanup.timestamp).toLocaleString();
                        })();

                        return (
                          <div
                            key={`${cleanup.timestamp}-${index}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '10px 12px',
                              background: 'var(--bg-secondary)',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>🍪</span>
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: '13px',
                                  color: 'var(--text-primary)',
                                  marginBottom: '2px',
                                }}
                              >
                                Deleted <strong>{cleanup.count}</strong>{' '}
                                {cleanup.count === 1 ? 'cookie' : 'cookies'}
                                {cleanup.domain && (
                                  <>
                                    {' '}
                                    from{' '}
                                    <span
                                      style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '12px',
                                        color: 'var(--accent-primary)',
                                      }}
                                    >
                                      {cleanup.domain}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {timeAgo}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {}
              <div className="settings-subsection">
                <h3>Cookie Cleanup Mode</h3>
                <p className="settings-subsection-desc">
                  Choose what happens to cookies when you close a tab
                </p>
                {!flags.privacy && (
                  <p className="settings-subsection-hint">
                    Enable "Privacy & Ad Blocking" in the General tab to configure cookie cleanup.
                  </p>
                )}

                <div className="settings-mode-selector">
                  <button
                    className={`settings-mode-btn ${privacySettings.defaultCookieMode === 'third-party' ? 'active' : ''}`}
                    onClick={() => handlePrivacySettingChange('defaultCookieMode', 'third-party')}
                    disabled={!flags.privacy}
                  >
                    <TargetCookieIcon size={24} />
                    <span className="settings-mode-name">Smart (Recommended)</span>
                    <span className="settings-mode-desc">
                      Remove trackers but keep you logged in
                    </span>
                  </button>
                  <button
                    className={`settings-mode-btn ${privacySettings.defaultCookieMode === 'all' ? 'active' : ''}`}
                    onClick={() => handlePrivacySettingChange('defaultCookieMode', 'all')}
                    disabled={!flags.privacy}
                  >
                    <BroomIcon size={24} />
                    <span className="settings-mode-name">Delete All</span>
                    <span className="settings-mode-desc">
                      Full cleanup - you may need to log in again
                    </span>
                  </button>
                  <button
                    className={`settings-mode-btn ${privacySettings.defaultCookieMode === 'none' ? 'active' : ''}`}
                    onClick={() => handlePrivacySettingChange('defaultCookieMode', 'none')}
                    disabled={!flags.privacy}
                  >
                    <HandStopIcon size={24} />
                    <span className="settings-mode-name">Keep All</span>
                    <span className="settings-mode-desc">
                      Don't delete any cookies automatically
                    </span>
                  </button>
                </div>
              </div>

              {}
              <div className="settings-subsection">
                <h3>Website Exceptions</h3>
                <p className="settings-subsection-desc">
                  Adjust protection level for specific sites (useful if a site doesn't work
                  properly)
                </p>
                {!flags.privacy && (
                  <p className="settings-subsection-hint">
                    Enable "Privacy & Ad Blocking" in the General tab to configure per-site
                    settings.
                  </p>
                )}

                <input
                  type="text"
                  className="form-input site-search-input"
                  placeholder="Search sites..."
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                />

                {filteredSites.length > 0 ? (
                  <div className="site-list">
                    {filteredSites.map(([domain, mode]) => (
                      <div key={domain} className="site-list-item">
                        <span className="site-list-domain">{domain}</span>
                        <select
                          className="site-list-select"
                          value={mode}
                          onChange={(e) =>
                            handleSiteModeChange(domain, e.target.value as SitePrivacyMode)
                          }
                          disabled={!flags.privacy}
                        >
                          <option value="normal">Normal</option>
                          <option value="strict">Strict</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No per-site settings configured yet.</p>
                    <p
                      style={{
                        marginTop: 'var(--space-sm)',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Sites will appear here when you customize their privacy settings.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'trackers' && (
            <section className="settings-section">
              <h2>Ads & Tracker Blocking</h2>
              <p className="settings-section-desc">
                Stop websites from tracking you and showing annoying ads
              </p>
              {!flags.privacy && (
                <p className="settings-subsection-hint">
                  Enable "Privacy & Ad Blocking" in the General tab to start blocking trackers.
                </p>
              )}

              {}
              {metrics && (
                <div className="settings-stats-grid" style={{ marginBottom: '24px' }}>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.totalBlockedRequests)}
                    </span>
                    <span className="settings-stat-label"> Total Blocked</span>
                  </div>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.activeRuleCount)}
                    </span>
                    <span className="settings-stat-label"> Active Rules</span>
                  </div>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(blockedRequests.length)}
                    </span>
                    <span className="settings-stat-label"> Recent Requests</span>
                  </div>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(new Set(blockedRequests.map((r) => r.domain)).size)}
                    </span>
                    <span className="settings-stat-label"> Unique Domains</span>
                  </div>
                </div>
              )}

              {}
              <div className="settings-subsection">
                <h3>Tracker Blocking</h3>
                {!flags.privacy && (
                  <p className="settings-subsection-hint">
                    Enable "Privacy & Ad Blocking" in the General tab to activate these features.
                  </p>
                )}

                <div className="settings-group" role="list">
                  <div className="settings-item" role="listitem">
                    <div className="settings-item-info">
                      <div className="settings-item-icon">
                        <BlockIcon size={20} />
                      </div>
                      <div className="settings-item-text">
                        <span className="settings-item-name">Block Ads & Trackers</span>
                        <span className="settings-item-desc">
                          Hide annoying ads and stop companies from watching what you do online
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={
                          privacyStatus?.adBlockerEnabled ?? privacySettings.adBlockerEnabled
                        }
                        onChange={() =>
                          handleAdBlockerToggle(
                            !(privacyStatus?.adBlockerEnabled ?? privacySettings.adBlockerEnabled),
                          )
                        }
                        disabled={!flags.privacy}
                      />
                      <span className="toggle-track" aria-hidden="true" />
                    </label>
                  </div>
                </div>
              </div>

              {}
              {rulesetStats && (
                <div className="settings-subsection">
                  <h3>Static Block Lists</h3>
                  <p className="settings-subsection-desc">
                    Pre-compiled ad and tracker blocking rules (based on EasyList, EasyPrivacy, and
                    Aintivirus Adblocker filters)
                  </p>
                  {!flags.privacy && (
                    <p className="settings-subsection-hint">
                      Enable "Privacy & Ad Blocking" in the General tab to activate blocking.
                    </p>
                  )}

                  <div className="settings-stats-grid" style={{ marginBottom: '16px' }}>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value" style={{ color: 'var(--success)' }}>
                        {rulesetStats.enabledRulesets.length}
                      </span>
                      <span className="settings-stat-label"> Active Rulesets</span>
                    </div>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value">
                        {rulesetStats.availableRulesets.length}
                      </span>
                      <span className="settings-stat-label"> Total Available</span>
                    </div>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value">
                        {formatNumber(rulesetStats.availableStaticSlots)}
                      </span>
                      <span className="settings-stat-label"> Available Slots</span>
                    </div>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value" style={{ textTransform: 'capitalize' }}>
                        {rulesetStats.filteringLevel}
                      </span>
                      <span className="settings-stat-label"> Filtering Level</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rulesetStats.enabledRulesets.map((rulesetId) => (
                      <div
                        key={rulesetId}
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: 'var(--success)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                          {rulesetId
                            .replace('static_ruleset_', '')
                            .replace(/_/g, ' ')
                            .toUpperCase()}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--success-muted)',
                            color: 'var(--success)',
                          }}
                        >
                          ACTIVE
                        </span>
                      </div>
                    ))}
                  </div>

                  {rulesetStats.enabledRulesets.length === 0 && (
                    <div className="empty-state" style={{ padding: '24px', textAlign: 'center' }}>
                      <p>No rulesets are currently active.</p>
                      <p
                        style={{
                          marginTop: 'var(--space-sm)',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Enable "Privacy & Ad Blocking" in the General tab to activate blocking.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {}
              {privacySettings.filterListUrls.length > 0 && (
                <div className="settings-subsection">
                  <h3>Custom Filter Lists</h3>
                  <p className="settings-subsection-desc">
                    Additional filter lists you've added (updated automatically)
                    {privacySettings.lastFilterUpdate && (
                      <span
                        style={{
                          marginLeft: 'var(--space-sm)',
                          padding: '2px 8px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        Last updated: {formatDate(privacySettings.lastFilterUpdate)}
                      </span>
                    )}
                  </p>

                  <div className="filter-list-header">
                    <button
                      className="btn btn-primary"
                      onClick={handleRefreshFilterLists}
                      disabled={refreshing || !flags.privacy}
                    >
                      <RefreshIcon size={14} />
                      <span>{refreshing ? 'Refreshing...' : 'Refresh Lists'}</span>
                    </button>
                  </div>

                  <div className="filter-list-items">
                    {privacySettings.filterListUrls.map((url) => (
                      <div key={url} className="filter-list-item">
                        <span className="filter-list-url">{url}</span>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemoveFilterList(url)}
                          disabled={!flags.privacy}
                        >
                          <CloseIcon size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {}
              {filterListHealth && privacySettings.filterListUrls.length > 0 && (
                <div className="settings-subsection">
                  <h3>Custom Filter List Status</h3>
                  <p className="settings-subsection-desc">
                    Check if your custom filter lists are working properly
                  </p>

                  {}
                  <div className="settings-stats-grid" style={{ marginBottom: '16px' }}>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value" style={{ color: 'var(--success)' }}>
                        {filterListHealth.healthyLists}
                      </span>
                      <span className="settings-stat-label">Healthy</span>
                    </div>
                    <div className="settings-stat-card">
                      <span
                        className="settings-stat-value"
                        style={{
                          color:
                            filterListHealth.errorLists > 0 ? 'var(--danger)' : 'var(--text-muted)',
                        }}
                      >
                        {filterListHealth.errorLists}
                      </span>
                      <span className="settings-stat-label">Errors</span>
                    </div>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value">
                        {formatNumber(filterListHealth.totalRules)}
                      </span>
                      <span className="settings-stat-label">Total Rules</span>
                    </div>
                    <div className="settings-stat-card">
                      <span className="settings-stat-value">
                        {filterListHealth.lastRefresh > 0
                          ? formatDate(filterListHealth.lastRefresh)
                          : 'Never'}
                      </span>
                      <span className="settings-stat-label">Last Refresh</span>
                    </div>
                  </div>

                  {}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filterListHealth.lists.map((list) => {
                      const shortName = (() => {
                        try {
                          const url = new URL(list.url);
                          const pathParts = url.pathname.split('/').filter(Boolean);
                          return pathParts[pathParts.length - 1] || url.hostname;
                        } catch {
                          return list.url.slice(0, 30) + '...';
                        }
                      })();

                      return (
                        <div
                          key={list.url}
                          style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background:
                                    list.lastFetchStatus === 'success'
                                      ? 'var(--success)'
                                      : list.lastFetchStatus === 'error'
                                        ? 'var(--danger)'
                                        : 'var(--warning)',
                                }}
                              />
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {shortName}
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background:
                                    list.lastFetchStatus === 'success'
                                      ? 'var(--success-muted)'
                                      : list.lastFetchStatus === 'error'
                                        ? 'var(--danger-muted)'
                                        : 'var(--warning-muted)',
                                  color:
                                    list.lastFetchStatus === 'success'
                                      ? 'var(--success)'
                                      : list.lastFetchStatus === 'error'
                                        ? 'var(--danger)'
                                        : 'var(--warning)',
                                }}
                              >
                                {list.lastFetchStatus}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {list.lastFetchStatus === 'error' && (
                                <button
                                  className="btn btn-sm"
                                  onClick={() => handleRetryFilterList(list.url)}
                                  disabled={retryingList === list.url || !flags.privacy}
                                  style={{
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                  }}
                                >
                                  {retryingList === list.url ? 'Retrying...' : 'Retry'}
                                </button>
                              )}
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '13px',
                                  color: 'var(--accent-primary)',
                                }}
                              >
                                {formatNumber(list.ruleCount)} rules
                              </span>
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                              wordBreak: 'break-all',
                            }}
                          >
                            {list.url}
                          </div>
                          {list.lastError && (
                            <div
                              style={{
                                marginTop: '8px',
                                padding: '8px',
                                background: 'var(--danger-muted)',
                                borderRadius: '4px',
                                fontSize: '12px',
                                color: 'var(--danger)',
                              }}
                            >
                              {list.lastError}
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              gap: '16px',
                              marginTop: '8px',
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {list.lastFetchAt > 0 && (
                              <span>Last fetch: {formatDate(list.lastFetchAt)}</span>
                            )}
                            {list.parseErrors > 0 && (
                              <span style={{ color: 'var(--warning)' }}>
                                {list.parseErrors} parse errors
                              </span>
                            )}
                            {list.unsupportedPatterns.length > 0 && (
                              <span>{list.unsupportedPatterns.length} unsupported patterns</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {}
              <div className="settings-subsection">
                <h3>Recently Blocked Trackers</h3>
                <p className="settings-subsection-desc">
                  View trackers and ads we've blocked while you browse
                </p>

                {}
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search trackers by domain or URL..."
                  value={trackerSearch}
                  onChange={(e) => setTrackerSearch(e.target.value)}
                  style={{ marginBottom: '16px' }}
                />

                {(() => {
                  const groupedByDomain = blockedRequests.reduce(
                    (acc, req) => {
                      if (!acc[req.domain]) {
                        acc[req.domain] = [];
                      }
                      acc[req.domain].push(req);
                      return acc;
                    },
                    {} as Record<string, BlockedRequest[]>,
                  );

                  const sortedDomains = Object.entries(groupedByDomain)
                    .filter(
                      ([domain]) =>
                        !trackerSearch ||
                        domain.toLowerCase().includes(trackerSearch.toLowerCase()),
                    )
                    .sort((a, b) => b[1].length - a[1].length);

                  const formatTime = (timestamp: number) => {
                    const date = new Date(timestamp);
                    const now = new Date();
                    const diff = now.getTime() - date.getTime();
                    if (diff < 60000) return 'Just now';
                    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                    return date.toLocaleString();
                  };

                  if (sortedDomains.length === 0) {
                    return (
                      <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
                        <BlockIcon size={48} />
                        <h3 style={{ marginTop: '16px', marginBottom: '8px' }}>
                          No Trackers Blocked Yet
                        </h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                          Blocked trackers will appear here as you browse the web.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {sortedDomains.map(([domain, requests]) => (
                        <details
                          key={domain}
                          className="tracker-domain-group"
                          style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '12px',
                            overflow: 'hidden',
                          }}
                        >
                          <summary
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '16px 20px',
                              cursor: 'pointer',
                              listStyle: 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <BlockIcon size={20} />
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {domain}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '14px',
                                  fontWeight: 700,
                                  color: 'var(--accent-primary)',
                                  background: 'var(--accent-muted)',
                                  padding: '4px 12px',
                                  borderRadius: '6px',
                                }}
                              >
                                {requests.length} blocked
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>▾</span>
                            </div>
                          </summary>
                          <div
                            style={{
                              borderTop: '1px solid var(--border-subtle)',
                              maxHeight: '300px',
                              overflowY: 'auto',
                            }}
                          >
                            {requests.map((req, idx) => (
                              <div
                                key={`${req.url}-${idx}`}
                                style={{
                                  padding: '12px 20px',
                                  borderBottom: '1px solid var(--border-subtle)',
                                }}
                              >
                                <div
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                    wordBreak: 'break-all',
                                    lineHeight: 1.5,
                                    marginBottom: '8px',
                                  }}
                                >
                                  {req.url}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      textTransform: 'uppercase',
                                      color: 'var(--text-muted)',
                                      background: 'var(--bg-tertiary)',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    {req.resourceType || 'unknown'}
                                  </span>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {formatTime(req.timestamp)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </section>
          )}

          {activeTab === 'scripts' && (
            <section className="settings-section">
              <h2>Intercepted Scripts</h2>
              <p className="settings-section-desc">
                Scripts we've modified to protect your identity
              </p>
              {!flags.privacy && (
                <p className="settings-subsection-hint">
                  Enable "Privacy & Ad Blocking" in the General tab to start intercepting
                  fingerprinting scripts.
                </p>
              )}

              {}
              {metrics && (
                <div className="settings-stats-grid" style={{ marginBottom: '24px' }}>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.scriptsIntercepted || 0)}
                    </span>
                    <span className="settings-stat-label"> Scripts Intercepted</span>
                  </div>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.requestsModified || 0)}
                    </span>
                    <span className="settings-stat-label"> Requests Modified</span>
                  </div>
                  <div className="settings-stat-card">
                    <span className="settings-stat-value">
                      {formatNumber(metrics.activeRuleCount)}
                    </span>
                    <span className="settings-stat-label"> Active Rules</span>
                  </div>
                </div>
              )}

              {}
              <div className="settings-subsection" style={{ marginTop: 0 }}>
                <h3>Protection Status</h3>
                <p className="settings-subsection-desc">
                  These features disguise your browser so websites can't recognize you
                </p>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    marginTop: '16px',
                  }}
                >
                  {}
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <PaletteIcon size={20} />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          Canvas Protection
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Blocks image-based tracking
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          fingerprintSettings.canvasNoise && fingerprintSettings.enabled
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                        color:
                          fingerprintSettings.canvasNoise && fingerprintSettings.enabled
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {fingerprintSettings.canvasNoise && fingerprintSettings.enabled
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>

                  {}
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <MonitorIcon size={20} />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          Graphics Card Protection
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Hides your graphics card details
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          fingerprintSettings.webglMask && fingerprintSettings.enabled
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                        color:
                          fingerprintSettings.webglMask && fingerprintSettings.enabled
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {fingerprintSettings.webglMask && fingerprintSettings.enabled
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>

                  {}
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <VolumeIcon size={20} />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          Audio Protection
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Blocks audio-based tracking
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          fingerprintSettings.audioNoise && fingerprintSettings.enabled
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                        color:
                          fingerprintSettings.audioNoise && fingerprintSettings.enabled
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {fingerprintSettings.audioNoise && fingerprintSettings.enabled
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>

                  {}
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <RulerIcon size={20} />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          Screen Size Protection
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Hides your real screen size
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          fingerprintSettings.screenMask && fingerprintSettings.enabled
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                        color:
                          fingerprintSettings.screenMask && fingerprintSettings.enabled
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {fingerprintSettings.screenMask && fingerprintSettings.enabled
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>

                  {}
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <GlobeIcon size={20} />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          Device Info Protection
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Hides your device and system details
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          fingerprintSettings.clientHintsMask && fingerprintSettings.enabled
                            ? 'var(--success-muted)'
                            : 'var(--bg-tertiary)',
                        color:
                          fingerprintSettings.clientHintsMask && fingerprintSettings.enabled
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {fingerprintSettings.clientHintsMask && fingerprintSettings.enabled
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {}
              <div
                style={{
                  marginTop: '24px',
                  padding: '16px 20px',
                  background: 'var(--accent-muted)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flexShrink: 0, marginTop: '2px' }}>
                    <InfoIcon size={20} />
                  </div>
                  <div>
                    <div
                      style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}
                    >
                      How Script Interception Works
                    </div>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      When enabled, fingerprint protection injects code that intercepts JavaScript
                      API calls commonly used for browser fingerprinting. This includes Canvas,
                      WebGL, AudioContext, and Navigator APIs. The intercepted calls return slightly
                      randomized or normalized values to prevent unique identification while
                      maintaining website functionality.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'wallet' && <WalletSecuritySettings walletEnabled={flags.wallet} />}

          {activeTab === 'about' && (
            <section className="settings-section">
              <h2>About Aintivirus</h2>

              <div className="about-content">
                <div className="about-logo">
                  <img src="icons/ainti_l1.png" alt="AINTIVIRUS" className="logo-icon" />
                  <h3>Aintivirus</h3>
                  <span className="version-badge">Version 0.2.0</span>
                </div>

                <p className="about-desc">
                  Aintivirus browser security extension that protects your privacy and crypto assets
                  while browsing the web.
                </p>

                <div className="about-links">
                  <a
                    href="https://github.com/Aintivirus-AI/aintivirus-privacy-extension"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-link"
                  >
                    <GitHubIcon size={16} />
                    <span>GitHub Repository</span>
                  </a>
                  <a
                    href="https://github.com/Aintivirus-AI/aintivirus-privacy-extension#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-link"
                  >
                    <BookIcon size={16} />
                    <span>Documentation</span>
                  </a>
                  <a
                    href="https://github.com/Aintivirus-AI/aintivirus-privacy-extension/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-link"
                  >
                    <BugIcon size={16} />
                    <span>Report an Issue</span>
                  </a>
                </div>

                <div className="about-footer">
                  <p>$AINTI. All rights reserved.</p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
