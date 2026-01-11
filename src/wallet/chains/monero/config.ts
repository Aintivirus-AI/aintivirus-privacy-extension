/**
 * Monero chain configuration
 */

import type { MoneroNodeConfig } from './types';

// ============================================================================
// Constants
// ============================================================================

export const MONERO_CONSTANTS = {
  /** Piconeros per XMR (1 XMR = 1e12 piconeros) */
  PICONERO_PER_XMR: BigInt(1_000_000_000_000),
  /** Decimals for XMR */
  DECIMALS: 12,
  /** Coin type for BIP-44 (not used for standard Monero, but useful for reference) */
  COIN_TYPE: 128,
  /** Minimum confirmations for "confirmed" status */
  MIN_CONFIRMATIONS: 10,
  /** Address prefix for mainnet (starts with '4') */
  MAINNET_ADDRESS_PREFIX: '4',
  /** Address prefix for testnet (starts with '9' or 'A') */
  TESTNET_ADDRESS_PREFIX: '9',
  /** Standard Monero address length */
  ADDRESS_LENGTH: 95,
  /** View key length (64 hex characters) */
  VIEW_KEY_LENGTH: 64,
};

// ============================================================================
// Public Nodes
// ============================================================================

/**
 * Public Monero nodes
 * These are used for fetching blockchain data without running a local node.
 */
export const PUBLIC_MONERO_NODES: MoneroNodeConfig[] = [
  {
    url: 'https://node.moneroworld.com:18089',
    name: 'MoneroWorld',
    testnet: false,
  },
  {
    url: 'https://nodes.hashvault.pro:18081',
    name: 'HashVault',
    testnet: false,
  },
  {
    url: 'https://xmr-node.cakewallet.com:18081',
    name: 'CakeWallet',
    testnet: false,
  },
  {
    url: 'https://node.sethforprivacy.com',
    name: 'Seth for Privacy',
    testnet: false,
  },
];

export const PUBLIC_MONERO_TESTNET_NODES: MoneroNodeConfig[] = [
  {
    url: 'https://stagenet.xmr-tw.org:38081',
    name: 'XMR-TW Stagenet',
    testnet: true,
  },
];

// ============================================================================
// Explorer URLs
// ============================================================================

export const MONERO_EXPLORERS = {
  mainnet: 'https://xmrchain.net',
  testnet: 'https://stagenet.xmrchain.net',
};

/**
 * Get explorer URL for a transaction
 */
export function getMoneroTxExplorerUrl(txHash: string, testnet: boolean = false): string {
  const baseUrl = testnet ? MONERO_EXPLORERS.testnet : MONERO_EXPLORERS.mainnet;
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get explorer URL for an address
 */
export function getMoneroAddressExplorerUrl(address: string, testnet: boolean = false): string {
  const baseUrl = testnet ? MONERO_EXPLORERS.testnet : MONERO_EXPLORERS.mainnet;
  // Note: Monero explorers typically don't show address-specific pages for privacy
  return `${baseUrl}/search?value=${address}`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert piconeros to XMR
 */
export function piconeroToXmr(piconero: bigint): number {
  return Number(piconero) / Number(MONERO_CONSTANTS.PICONERO_PER_XMR);
}

/**
 * Convert XMR to piconeros
 */
export function xmrToPiconero(xmr: number): bigint {
  return BigInt(Math.floor(xmr * Number(MONERO_CONSTANTS.PICONERO_PER_XMR)));
}

/**
 * Format XMR amount for display
 */
export function formatXmr(piconero: bigint, maxDecimals: number = 6): string {
  const xmr = piconeroToXmr(piconero);
  return xmr.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

/**
 * Get a random public node
 */
export function getRandomNode(testnet: boolean = false): MoneroNodeConfig {
  const nodes = testnet ? PUBLIC_MONERO_TESTNET_NODES : PUBLIC_MONERO_NODES;
  return nodes[Math.floor(Math.random() * nodes.length)];
}

/**
 * Get all available nodes
 */
export function getAvailableNodes(testnet: boolean = false): MoneroNodeConfig[] {
  return testnet ? PUBLIC_MONERO_TESTNET_NODES : PUBLIC_MONERO_NODES;
}
