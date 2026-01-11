/**
 * TRON chain configuration
 */

import type { TronNetworkConfig } from './types';

export const TRON_NETWORKS: Record<'mainnet' | 'testnet', TronNetworkConfig> = {
  mainnet: {
    name: 'Mainnet',
    fullNode: 'https://api.trongrid.io',
    solidityNode: 'https://api.trongrid.io',
    eventServer: 'https://api.trongrid.io',
    explorerUrl: 'https://tronscan.org',
  },
  testnet: {
    name: 'Nile Testnet',
    fullNode: 'https://nile.trongrid.io',
    solidityNode: 'https://nile.trongrid.io',
    eventServer: 'https://nile.trongrid.io',
    explorerUrl: 'https://nile.tronscan.org',
  },
};

/**
 * TRON constants
 */
export const TRON_CONSTANTS = {
  /** 1 TRX = 1,000,000 SUN */
  SUN_PER_TRX: 1_000_000,
  /** Coin type for BIP-44 derivation */
  COIN_TYPE: 195,
  /** Default derivation path */
  DERIVATION_PATH: "m/44'/195'/0'/0/{index}",
  /** Address prefix byte (0x41 for mainnet) */
  ADDRESS_PREFIX: 0x41,
  /** Testnet address prefix (0xa0) */
  TESTNET_ADDRESS_PREFIX: 0xa0,
  /** Default bandwidth cost per byte */
  BANDWIDTH_COST_PER_BYTE: 1,
  /** Free daily bandwidth */
  FREE_BANDWIDTH_LIMIT: 1500,
  /** Energy cost for TRC20 transfers */
  TRC20_ENERGY_COST: 65000,
};

/**
 * Common TRC20 tokens on TRON
 */
export const COMMON_TRC20_TOKENS = [
  {
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  },
  {
    address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
  {
    address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
    symbol: 'BTT',
    name: 'BitTorrent',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/22457/small/btt.png',
  },
  {
    address: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
    symbol: 'WTRX',
    name: 'Wrapped TRX',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
  },
  {
    address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
    symbol: 'SUN',
    name: 'Sun Token',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/12424/small/sun_logo.png',
  },
];

/**
 * Get explorer URL for an address
 */
export function getTronAddressExplorerUrl(address: string, testnet: boolean = false): string {
  const network = testnet ? TRON_NETWORKS.testnet : TRON_NETWORKS.mainnet;
  return `${network.explorerUrl}/#/address/${address}`;
}

/**
 * Get explorer URL for a transaction
 */
export function getTronTxExplorerUrl(txid: string, testnet: boolean = false): string {
  const network = testnet ? TRON_NETWORKS.testnet : TRON_NETWORKS.mainnet;
  return `${network.explorerUrl}/#/transaction/${txid}`;
}

/**
 * Convert SUN to TRX
 */
export function sunToTrx(sun: number): number {
  return sun / TRON_CONSTANTS.SUN_PER_TRX;
}

/**
 * Convert TRX to SUN
 */
export function trxToSun(trx: number): number {
  return Math.floor(trx * TRON_CONSTANTS.SUN_PER_TRX);
}
