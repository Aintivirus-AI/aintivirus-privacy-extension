import type { EVMChainId } from '../types';

// Known spender addresses provide friendly labels for popular DEXes/bridges.
export interface SpenderInfo {
  address: string;

  label: string;

  category: 'dex' | 'bridge' | 'lending' | 'nft' | 'aggregator' | 'other';

  iconUrl?: string;

  verified?: boolean;
}

export const KNOWN_SPENDERS: Record<EVMChainId, SpenderInfo[]> = {
  ethereum: [
    {
      address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      label: 'Uniswap V3: Router 2',
      category: 'dex',
      verified: true,
    },
    {
      address: '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B',
      label: 'Uniswap Universal Router',
      category: 'dex',
      verified: true,
    },
    {
      address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      label: 'Uniswap Universal Router V2',
      category: 'dex',
      verified: true,
    },
    {
      address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      label: 'Uniswap V2: Router',
      category: 'dex',
      verified: true,
    },
    {
      address: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      label: 'Uniswap V3: Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      label: '1inch V5 Router',
      category: 'aggregator',
      verified: true,
    },
    {
      address: '0x111111125421cA6dc452d289314280a0f8842A65',
      label: '1inch V6 Router',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0x99a58482BD75cbab83b27EC03CA68fF489b5788f',
      label: 'Curve: Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1E0049783F008A0085193E00003D00cd54003c71',
      label: 'OpenSea Seaport',
      category: 'nft',
      verified: true,
    },
    {
      address: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
      label: 'OpenSea Seaport 1.5',
      category: 'nft',
      verified: true,
    },

    {
      address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      label: 'Aave V3: Pool',
      category: 'lending',
      verified: true,
    },
    {
      address: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
      label: 'Aave V2: Pool',
      category: 'lending',
      verified: true,
    },

    {
      address: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
      label: 'Compound V3: cUSDCv3',
      category: 'lending',
      verified: true,
    },

    {
      address: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
      label: 'SushiSwap Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      label: 'Uniswap Permit2',
      category: 'other',
      verified: true,
    },

    {
      address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      label: '0x Exchange Proxy',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
      label: 'Lido stETH',
      category: 'other',
      verified: true,
    },
  ],

  polygon: [
    {
      address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      label: 'Uniswap V3: Router 2',
      category: 'dex',
      verified: true,
    },
    {
      address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      label: 'Uniswap Universal Router V2',
      category: 'dex',
      verified: true,
    },

    {
      address: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      label: 'QuickSwap Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      label: 'SushiSwap Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      label: '1inch V5 Router',
      category: 'aggregator',
      verified: true,
    },
    {
      address: '0x111111125421cA6dc452d289314280a0f8842A65',
      label: '1inch V6 Router',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      label: 'Aave V3: Pool',
      category: 'lending',
      verified: true,
    },

    {
      address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      label: '0x Exchange Proxy',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      label: 'Uniswap Permit2',
      category: 'other',
      verified: true,
    },

    {
      address: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
      label: 'OpenSea Seaport 1.5',
      category: 'nft',
      verified: true,
    },
  ],

  arbitrum: [
    {
      address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      label: 'Uniswap V3: Router 2',
      category: 'dex',
      verified: true,
    },
    {
      address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      label: 'Uniswap Universal Router V2',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      label: 'SushiSwap Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      label: '1inch V5 Router',
      category: 'aggregator',
      verified: true,
    },
    {
      address: '0x111111125421cA6dc452d289314280a0f8842A65',
      label: '1inch V6 Router',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064',
      label: 'GMX Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      label: 'Aave V3: Pool',
      category: 'lending',
      verified: true,
    },

    {
      address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      label: '0x Exchange Proxy',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      label: 'Uniswap Permit2',
      category: 'other',
      verified: true,
    },

    {
      address: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
      label: 'Camelot Router',
      category: 'dex',
      verified: true,
    },
  ],

  optimism: [
    {
      address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      label: 'Uniswap V3: Router 2',
      category: 'dex',
      verified: true,
    },
    {
      address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      label: 'Uniswap Universal Router V2',
      category: 'dex',
      verified: true,
    },

    {
      address: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
      label: 'Velodrome Router V2',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      label: '1inch V5 Router',
      category: 'aggregator',
      verified: true,
    },
    {
      address: '0x111111125421cA6dc452d289314280a0f8842A65',
      label: '1inch V6 Router',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      label: 'Aave V3: Pool',
      category: 'lending',
      verified: true,
    },

    {
      address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      label: '0x Exchange Proxy',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      label: 'Uniswap Permit2',
      category: 'other',
      verified: true,
    },

    {
      address: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4',
      label: 'Synthetix: SNX Proxy',
      category: 'other',
      verified: true,
    },
  ],

  base: [
    {
      address: '0x2626664c2603336E57B271c5C0b26F421741e481',
      label: 'Uniswap V3: Router 2',
      category: 'dex',
      verified: true,
    },
    {
      address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      label: 'Uniswap Universal Router V2',
      category: 'dex',
      verified: true,
    },

    {
      address: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      label: 'Aerodrome Router',
      category: 'dex',
      verified: true,
    },

    {
      address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      label: '1inch V5 Router',
      category: 'aggregator',
      verified: true,
    },
    {
      address: '0x111111125421cA6dc452d289314280a0f8842A65',
      label: '1inch V6 Router',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      label: '0x Exchange Proxy',
      category: 'aggregator',
      verified: true,
    },

    {
      address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      label: 'Uniswap Permit2',
      category: 'other',
      verified: true,
    },

    {
      address: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      label: 'Aave V3: Pool',
      category: 'lending',
      verified: true,
    },

    {
      address: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
      label: 'OpenSea Seaport 1.5',
      category: 'nft',
      verified: true,
    },
  ],
};

export function getKnownSpenders(chainId: EVMChainId): SpenderInfo[] {
  return KNOWN_SPENDERS[chainId] || [];
}

export function getSpenderLabel(chainId: EVMChainId, spenderAddress: string): string | undefined {
  const spenders = KNOWN_SPENDERS[chainId] || [];
  const found = spenders.find((s) => s.address.toLowerCase() === spenderAddress.toLowerCase());
  return found?.label;
}

export function isVerifiedSpender(chainId: EVMChainId, spenderAddress: string): boolean {
  const spenders = KNOWN_SPENDERS[chainId] || [];
  const found = spenders.find((s) => s.address.toLowerCase() === spenderAddress.toLowerCase());
  return found?.verified ?? false;
}

export function getAllKnownSpenderAddresses(): Set<string> {
  const addresses = new Set<string>();
  for (const chainSpenders of Object.values(KNOWN_SPENDERS)) {
    for (const spender of chainSpenders) {
      addresses.add(spender.address.toLowerCase());
    }
  }
  return addresses;
}
