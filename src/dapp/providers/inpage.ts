

import { createEVMProvider, AintivirusEVMProvider } from './evm';
import { createSolanaProvider, AintivirusSolanaProvider, PublicKey } from './solana';
import { PROVIDER_INFO } from '../bridge/constants';


interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: AintivirusEVMProvider;
}


function announceEIP6963Provider(provider: AintivirusEVMProvider): void {
  const info: EIP6963ProviderInfo = {
    uuid: 'aintivirus-wallet',
    name: PROVIDER_INFO.NAME,
    
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMjAgNlYxMkMyMCAxNy41MiAxNi43OSAyMi4xMiAxMiAyM0M3LjIxIDIyLjEyIDQgMTcuNTIgNCAxMlY2TDEyIDJaIiBmaWxsPSIjNWI1ZmM3Ii8+CjxwYXRoIGQ9Ik0xMCA4TDE0IDEyTDEwIDE2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=',
    rdns: 'app.aintivirus.wallet',
  };

  const detail: EIP6963ProviderDetail = { info, provider };

  
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));

  
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  });
}


function injectEVMProvider(): AintivirusEVMProvider | null {
  const provider = createEVMProvider();

  try {
    
    const existingDescriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
    
    if (existingDescriptor && !existingDescriptor.configurable) {
      

      const existing = (window as unknown as { ethereum?: AintivirusEVMProvider }).ethereum;
      if (existing && Array.isArray((existing as unknown as { providers?: unknown[] }).providers)) {
        (existing as unknown as { providers: unknown[] }).providers.push(provider);

      }
      
      return provider;
    }

    
    const proxyProvider = new Proxy(provider, {
      get(target, prop: string | symbol) {
        if (prop === 'providers') {
          return [target];
        }
        return (target as unknown as Record<string | symbol, unknown>)[prop];
      },
    });

    Object.defineProperty(window, 'ethereum', {
      value: proxyProvider,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    
    announceEIP6963Provider(provider);

    return provider;
  } catch (error) {

    return null;
  }
}


function injectSolanaProvider(): AintivirusSolanaProvider | null {
  const provider = createSolanaProvider();

  try {
    
    const existingDescriptor = Object.getOwnPropertyDescriptor(window, 'solana');
    
    if (existingDescriptor && !existingDescriptor.configurable) {
      

      return provider;
    }

    Object.defineProperty(window, 'solana', {
      value: provider,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    
    Object.defineProperty(window, 'aintivirus', {
      value: {
        solana: provider,
      },
      writable: true,
      configurable: true,
      enumerable: true,
    });

    return provider;
  } catch (error) {

    return null;
  }
}


function registerWalletStandard(solanaProvider: AintivirusSolanaProvider): void {
  
  const wallet = {
    name: PROVIDER_INFO.NAME,
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMjAgNlYxMkMyMCAxNy41MiAxNi43OSAyMi4xMiAxMiAyM0M3LjIxIDIyLjEyIDQgMTcuNTIgNCAxMlY2TDEyIDJaIiBmaWxsPSIjNWI1ZmM3Ii8+CjxwYXRoIGQ9Ik0xMCA4TDE0IDEyTDEwIDE2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=',
    version: PROVIDER_INFO.VERSION,
    chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'],
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async () => {
          const { publicKey } = await solanaProvider.connect();
          return {
            accounts: [{
              address: publicKey.toBase58(),
              publicKey: publicKey.toBytes(),
              chains: ['solana:mainnet'],
              features: ['solana:signTransaction', 'solana:signMessage'],
            }],
          };
        },
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: () => solanaProvider.disconnect(),
      },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signTransaction: async (transaction: { serialize(): Uint8Array }) => {
          return solanaProvider.signTransaction(transaction);
        },
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: async (message: Uint8Array) => {
          return solanaProvider.signMessage(message);
        },
      },
    },
    accounts: [],
  };

  
  try {
    
    const windowWithWallets = window as unknown as { 
      navigator?: { 
        wallets?: { 
          register?: (wallet: unknown) => void 
        } 
      } 
    };
    
    if (windowWithWallets.navigator?.wallets?.register) {
      windowWithWallets.navigator.wallets.register(wallet);

    }
  } catch (error) {

  }
}


function initialize(): void {
  
  if (window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'moz-extension:') {
    return;
  }

  
  const evmProvider = injectEVMProvider();
  const solanaProvider = injectSolanaProvider();

  
  if (solanaProvider) {
    registerWalletStandard(solanaProvider);
  }

  
  window.postMessage({
    source: 'aintivirus-inpage',
    type: 'DAPP_PROVIDERS_READY',
    payload: {
      ethereum: !!evmProvider,
      solana: !!solanaProvider,
    },
  }, '*');

}


initialize();


document.addEventListener('DOMContentLoaded', () => {
  
  if (!(window as unknown as { ethereum?: unknown }).ethereum) {
    injectEVMProvider();
  }
  if (!(window as unknown as { solana?: unknown }).solana) {
    injectSolanaProvider();
  }
});


export { AintivirusEVMProvider, AintivirusSolanaProvider, PublicKey };
