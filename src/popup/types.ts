/**
 * Shared types for the popup UI
 */

import type { FeatureFlags } from '@shared/types';

/**
 * Main navigation tabs
 */
export type MainTab = 'security' | 'wallet' | 'store';

/**
 * Wallet sub-views
 */
export type WalletView = 'dashboard' | 'send' | 'receive' | 'manage' | 'add-wallet' | 'swap';

/**
 * Privacy statistics for the Security tab
 */
export interface PrivacyStats {
  totalBlockedRequests: number;
  totalCookiesDeleted: number;
  activeRuleCount: number;
  currentTabBlocked: number;
  scriptsIntercepted: number;
  requestsModified: number;
  blockedByDomain?: { [domain: string]: number };
  sessionStart?: number;
}

/**
 * Props for the Security tab component
 */
export interface SecurityTabProps {
  flags: FeatureFlags;
  stats: PrivacyStats;
  onToggle: (id: keyof FeatureFlags) => void;
  adBlockerEnabled: boolean;
  onAdBlockerToggle: (enabled: boolean) => void;
}

/**
 * EVM transaction history item from Etherscan-like API
 */
export interface EVMHistoryItem {
  hash: string;
  timestamp: number;
  direction: 'sent' | 'received' | 'self' | 'unknown';
  type: string;
  amount: number;
  symbol: string;
  counterparty?: string;
  fee?: number;
  status: 'confirmed' | 'pending' | 'failed';
  explorerUrl: string;
  logoUri?: string;
  tokenAddress?: string;
  swapInfo?: {
    fromToken: {
      symbol: string;
      amount: number;
      address?: string;
      logoUri?: string;
    };
    toToken: {
      symbol: string;
      amount: number;
      address?: string;
      logoUri?: string;
    };
  };
}

/**
 * Selected token for sending
 */
export interface SelectedTokenForSend {
  type: 'native' | 'spl' | 'erc20';
  mint?: string;
  address?: string;
  symbol: string;
  balance: number;
  decimals: number;
  logoUri?: string;
}

/**
 * Connection record for UI display
 */
export interface ConnectionRecordUI {
  domain: string;
  timestamp: number;
  approved: boolean;
  revoked: boolean;
}

/**
 * Receive view props
 */
export interface ReceiveViewProps {
  address: string;
  activeChain: 'solana' | 'evm';
  activeEVMChain: number | string | null;
  activeChainId?: string | null;
  onClose: () => void;
}

/**
 * Swap quote result (Jupiter/Solana)
 */
export interface SwapQuoteResult {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  inputAmountFormatted: string;
  outputAmountFormatted: string;
  minimumReceivedFormatted: string;
  priceImpact: string;
  platformFeeFormatted: string | null;
  route: string;
  rawQuote: unknown;
}

/**
 * EVM swap quote result (ParaSwap)
 */
export interface EVMSwapQuoteResult {
  chainId: number | string;
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  srcAmountFormatted: string;
  destAmountFormatted: string;
  minimumReceivedFormatted: string;
  exchangeRate: string;
  gasCostUSD: string;
  route: string;
  rawQuote: unknown;
}

/**
 * Wallet entry for manage wallets
 */
export interface WalletEntryUI {
  id: string;
  label: string;
  publicAddress: string;
  createdAt: number;
}
