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

export const TRON_CONSTANTS = {
  SUN_PER_TRX: 1_000_000,
  COIN_TYPE: 195,
  DERIVATION_PATH: "m/44'/195'/0'/0/{index}",
  ADDRESS_PREFIX: 0x41,
  TESTNET_ADDRESS_PREFIX: 0xa0,
  BANDWIDTH_COST_PER_BYTE: 1,
  FREE_BANDWIDTH_LIMIT: 1500,
  TRC20_ENERGY_COST: 65000,
};

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

export function getTronAddressExplorerUrl(address: string, testnet: boolean = false): string {
  const network = testnet ? TRON_NETWORKS.testnet : TRON_NETWORKS.mainnet;
  return `${network.explorerUrl}/#/address/${address}`;
}

export function getTronTxExplorerUrl(txid: string, testnet: boolean = false): string {
  const network = testnet ? TRON_NETWORKS.testnet : TRON_NETWORKS.mainnet;
  return `${network.explorerUrl}/#/transaction/${txid}`;
}

export function sunToTrx(sun: number): number {
  return sun / TRON_CONSTANTS.SUN_PER_TRX;
}

export function trxToSun(trx: number): number {
  return Math.floor(trx * TRON_CONSTANTS.SUN_PER_TRX);
}
