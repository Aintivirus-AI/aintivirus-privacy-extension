/**
 * AINTIVIRUS dApp Connectivity - Inpage Script
 * 
 * This script is injected into the page context (MAIN world) to provide
 * window.ethereum and window.solana providers for dApp connectivity.
 * 
 * SECURITY ARCHITECTURE:
 * - Runs in page context, no access to chrome.* APIs
 * - Communicates with content script via window.postMessage
 * - Private keys never exposed to this script
 * - Origin validation on all requests
 * 
 * INJECTION:
 * - Injected via content script before page loads
 * - Must run at document_start to beat dApp detection
 */

import { createEVMProvider, AintivirusEVMProvider } from './evm';
import { createSolanaProvider, AintivirusSolanaProvider, PublicKey } from './solana';
import { PROVIDER_INFO } from '../bridge/constants';

// ============================================
// PROVIDER ANNOUNCEMENT (EIP-6963)
// ============================================

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

/**
 * Announce the provider via EIP-6963 events
 */
function announceEIP6963Provider(provider: AintivirusEVMProvider): void {
  const info: EIP6963ProviderInfo = {
    uuid: 'aintivirus-wallet',
    name: PROVIDER_INFO.NAME,
    // SVG icon as data URI (purple shield)
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMjAgNlYxMkMyMCAxNy41MiAxNi43OSAyMi4xMiAxMiAyM0M3LjIxIDIyLjEyIDQgMTcuNTIgNCAxMlY2TDEyIDJaIiBmaWxsPSIjNWI1ZmM3Ii8+CjxwYXRoIGQ9Ik0xMCA4TDE0IDEyTDEwIDE2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=',
    rdns: 'app.aintivirus.wallet',
  };

  const detail: EIP6963ProviderDetail = { info, provider };

  // Announce on window
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));

  // Listen for requests
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  });
}

// ============================================
// PROVIDER INJECTION
// ============================================

/**
 * Inject the EVM provider as window.ethereum
 */
function injectEVMProvider(): AintivirusEVMProvider | null {
  const provider = createEVMProvider();

  try {
    // Check if ethereum is already defined
    const existingDescriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
    
    if (existingDescriptor && !existingDescriptor.configurable) {
      // Cannot override, try to add to existing provider's providers array
      console.log('[Aintivirus] window.ethereum already defined and not configurable');
      
      const existing = (window as unknown as { ethereum?: AintivirusEVMProvider }).ethereum;
      if (existing && Array.isArray((existing as unknown as { providers?: unknown[] }).providers)) {
        (existing as unknown as { providers: unknown[] }).providers.push(provider);
        console.log('[Aintivirus] Added to existing ethereum.providers array');
      }
      
      return provider;
    }

    // Define as proxy to handle multiple wallets
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

    console.log('[Aintivirus] window.ethereum provider injected');

    // Announce via EIP-6963
    announceEIP6963Provider(provider);

    return provider;
  } catch (error) {
    console.error('[Aintivirus] Failed to inject ethereum provider:', error);
    return null;
  }
}

/**
 * Inject the Solana provider as window.solana
 */
function injectSolanaProvider(): AintivirusSolanaProvider | null {
  const provider = createSolanaProvider();

  try {
    // Check if solana is already defined
    const existingDescriptor = Object.getOwnPropertyDescriptor(window, 'solana');
    
    if (existingDescriptor && !existingDescriptor.configurable) {
      // Cannot override existing provider
      console.log('[Aintivirus] window.solana already defined and not configurable');
      return provider;
    }

    Object.defineProperty(window, 'solana', {
      value: provider,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    console.log('[Aintivirus] window.solana provider injected');

    // Also set window.aintivirus for direct access
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
    console.error('[Aintivirus] Failed to inject solana provider:', error);
    return null;
  }
}

// ============================================
// WALLET STANDARD REGISTRATION
// ============================================

/**
 * Register with the Wallet Standard
 * @see https://github.com/wallet-standard/wallet-standard
 */
function registerWalletStandard(solanaProvider: AintivirusSolanaProvider): void {
  // Create a wallet adapter for the Wallet Standard
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

  // Dispatch registration event
  try {
    // Check for existing wallet-standard registration
    const windowWithWallets = window as unknown as { 
      navigator?: { 
        wallets?: { 
          register?: (wallet: unknown) => void 
        } 
      } 
    };
    
    if (windowWithWallets.navigator?.wallets?.register) {
      windowWithWallets.navigator.wallets.register(wallet);
      console.log('[Aintivirus] Registered with Wallet Standard');
    }
  } catch (error) {
    console.debug('[Aintivirus] Wallet Standard registration skipped:', error);
  }
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Main initialization function
 */
function initialize(): void {
  // Skip injection for extension pages
  if (window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'moz-extension:') {
    return;
  }

  // Inject providers
  const evmProvider = injectEVMProvider();
  const solanaProvider = injectSolanaProvider();

  // Register with Wallet Standard
  if (solanaProvider) {
    registerWalletStandard(solanaProvider);
  }

  // Notify content script that providers are ready
  window.postMessage({
    source: 'aintivirus-inpage',
    type: 'DAPP_PROVIDERS_READY',
    payload: {
      ethereum: !!evmProvider,
      solana: !!solanaProvider,
    },
  }, '*');

  console.log('[Aintivirus] dApp providers initialized');
}

// Run initialization immediately (script runs at document_start)
initialize();

// Also handle dynamic navigation (SPAs)
document.addEventListener('DOMContentLoaded', () => {
  // Re-check provider injection in case of late initialization
  if (!(window as unknown as { ethereum?: unknown }).ethereum) {
    injectEVMProvider();
  }
  if (!(window as unknown as { solana?: unknown }).solana) {
    injectSolanaProvider();
  }
});

// ============================================
// EXPORTS (for type checking only, this is an entry point)
// ============================================

export { AintivirusEVMProvider, AintivirusSolanaProvider, PublicKey };
