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
      // Another wallet owns window.ethereum, but we can still participate
      const existing = (window as unknown as { ethereum?: AintivirusEVMProvider }).ethereum;
      if (existing && Array.isArray((existing as unknown as { providers?: unknown[] }).providers)) {
        (existing as unknown as { providers: unknown[] }).providers.push(provider);
      }

      // IMPORTANT: Still announce via EIP-6963 so modern dApps can detect us!
      // This is the modern standard and works independently of window.ethereum
      announceEIP6963Provider(provider);

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
    // Even if we fail to set window.ethereum, try to announce via EIP-6963
    try {
      announceEIP6963Provider(provider);
    } catch {
      // Best effort
    }
    return provider;
  }
}

function injectSolanaProvider(): AintivirusSolanaProvider | null {
  const provider = createSolanaProvider();

  try {
    // Create our own namespace that's always available
    Object.defineProperty(window, 'aintivirus', {
      value: {
        solana: provider,
      },
      writable: true,
      configurable: true,
      enumerable: true,
    });

    // Try to set window.solana
    const existingSolanaDescriptor = Object.getOwnPropertyDescriptor(window, 'solana');
    if (!existingSolanaDescriptor || existingSolanaDescriptor.configurable) {
      Object.defineProperty(window, 'solana', {
        value: provider,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    // Also try to set window.phantom.solana for Phantom-compatible detection
    // Many dApps check for window.phantom?.solana
    try {
      const existingPhantom = (window as unknown as { phantom?: { solana?: unknown } }).phantom;
      if (!existingPhantom) {
        Object.defineProperty(window, 'phantom', {
          value: { solana: provider },
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else if (!existingPhantom.solana) {
        // Phantom namespace exists but no solana provider
        existingPhantom.solana = provider;
      }
    } catch {
      // Can't set phantom namespace, that's okay
    }

    return provider;
  } catch (error) {
    return provider; // Still return provider even if injection fails
  }
}

// Custom event class for wallet-standard registration
class RegisterWalletEvent extends Event {
  readonly #detail: (api: { register: (wallet: unknown) => void }) => void;

  get detail() {
    return this.#detail;
  }

  get type() {
    return 'wallet-standard:register-wallet' as const;
  }

  constructor(callback: (api: { register: (wallet: unknown) => void }) => void) {
    super('wallet-standard:register-wallet', {
      bubbles: false,
      cancelable: false,
      composed: false,
    });
    this.#detail = callback;
  }
}

function registerWalletStandard(solanaProvider: AintivirusSolanaProvider): void {
  // Build the wallet object with proper Wallet Standard structure
  const wallet = {
    // Required Wallet Standard properties
    version: '1.0.0' as const,
    name: PROVIDER_INFO.NAME,
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMjAgNlYxMkMyMCAxNy41MiAxNi43OSAyMi4xMiAxMiAyM0M3LjIxIDIyLjEyIDQgMTcuNTIgNCAxMlY2TDEyIDJaIiBmaWxsPSIjNWI1ZmM3Ii8+CjxwYXRoIGQ9Ik0xMCA4TDE0IDEyTDEwIDE2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=' as `data:image/svg+xml;base64,${string}`,
    chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'] as const,
    accounts: [] as Array<{
      address: string;
      publicKey: Uint8Array;
      chains: readonly string[];
      features: readonly string[];
    }>,
    features: {
      // Standard connect feature
      'standard:connect': {
        version: '1.0.0' as const,
        connect: async () => {
          const { publicKey } = await solanaProvider.connect();
          const account = {
            address: publicKey.toBase58(),
            publicKey: publicKey.toBytes(),
            chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'] as const,
            features: [
              'solana:signTransaction',
              'solana:signAndSendTransaction',
              'solana:signMessage',
            ] as const,
          };
          // Update accounts array
          wallet.accounts = [account];
          return { accounts: [account] };
        },
      },
      // Standard disconnect feature
      'standard:disconnect': {
        version: '1.0.0' as const,
        disconnect: async () => {
          await solanaProvider.disconnect();
          wallet.accounts = [];
        },
      },
      // Standard events feature
      'standard:events': {
        version: '1.0.0' as const,
        on: (event: string, listener: (...args: unknown[]) => void) => {
          solanaProvider.on(event, listener);
          return () => solanaProvider.off(event, listener);
        },
      },
      // Solana sign transaction feature
      // Wallet-standard spec: transaction is Uint8Array (serialized bytes), output is { signedTransaction: Uint8Array }
      'solana:signTransaction': {
        version: '1.0.0' as const,
        supportedTransactionVersions: ['legacy', 0] as const,
        signTransaction: async (...inputs: readonly { transaction: Uint8Array; account: { address: string }; chain?: string }[]) => {
          const results: { signedTransaction: Uint8Array }[] = [];
          for (const input of inputs) {
            // Wallet-standard passes transaction as Uint8Array bytes
            // We need to pass these bytes directly to signTransactionBytes
            const signedBytes = await solanaProvider.signTransactionBytes(input.transaction);
            results.push({ signedTransaction: signedBytes });
          }
          return results;
        },
      },
      // Solana sign and send transaction feature
      // Wallet-standard spec: transaction is Uint8Array (serialized bytes)
      'solana:signAndSendTransaction': {
        version: '1.0.0' as const,
        supportedTransactionVersions: ['legacy', 0] as const,
        signAndSendTransaction: async (...inputs: readonly { transaction: Uint8Array; account: { address: string }; chain?: string; options?: { skipPreflight?: boolean } }[]) => {
          const results: { signature: Uint8Array }[] = [];
          for (const input of inputs) {
            // Wallet-standard passes transaction as Uint8Array bytes
            const { signature } = await solanaProvider.signAndSendTransactionBytes(
              input.transaction,
              input.options,
            );
            // Convert base58 signature to bytes
            const signatureBytes = solanaProvider.base58ToBytes(signature);
            results.push({ signature: signatureBytes });
          }
          return results;
        },
      },
      // Solana sign message feature
      'solana:signMessage': {
        version: '1.0.0' as const,
        signMessage: async (...inputs: Array<{ message: Uint8Array; account: { address: string } }>) => {
          const results = [];
          for (const input of inputs) {
            const { signature } = await solanaProvider.signMessage(input.message);
            results.push({ signedMessage: input.message, signature });
          }
          return results;
        },
      },
    },
  };

  // Register using the proper wallet-standard event mechanism
  const registerCallback = ({ register }: { register: (wallet: unknown) => void }) => {
    register(wallet);
  };

  // Dispatch the register-wallet event
  try {
    window.dispatchEvent(new RegisterWalletEvent(registerCallback));
  } catch (error) {
    console.error('[Aintivirus] wallet-standard:register-wallet event failed:', error);
  }

  // Listen for app-ready event (for apps that load after the wallet)
  window.addEventListener('wallet-standard:app-ready', ((event: CustomEvent<{ register: (wallet: unknown) => void }>) => {
    try {
      registerCallback(event.detail);
    } catch (error) {
      console.error('[Aintivirus] wallet-standard:app-ready handler failed:', error);
    }
  }) as EventListener);

  // Also support deprecated registration method for older dApps
  try {
    const windowWithWallets = window as unknown as {
      navigator?: {
        wallets?: Array<(api: { register: (wallet: unknown) => void }) => void>;
      };
    };
    if (windowWithWallets.navigator) {
      windowWithWallets.navigator.wallets = windowWithWallets.navigator.wallets || [];
      windowWithWallets.navigator.wallets.push(registerCallback);
    }
  } catch {
    // Deprecated method failed, but that's okay
  }
}

// Track if we've already initialized to prevent double injection
let initialized = false;
let evmProviderInstance: AintivirusEVMProvider | null = null;
let solanaProviderInstance: AintivirusSolanaProvider | null = null;

function initialize(): void {
  if (initialized) return;
  
  if (
    window.location.protocol === 'chrome-extension:' ||
    window.location.protocol === 'moz-extension:'
  ) {
    return;
  }

  initialized = true;
  evmProviderInstance = injectEVMProvider();
  solanaProviderInstance = injectSolanaProvider();

  if (solanaProviderInstance) {
    registerWalletStandard(solanaProviderInstance);
  }

  window.postMessage(
    {
      source: 'aintivirus-inpage',
      type: 'DAPP_PROVIDERS_READY',
      payload: {
        ethereum: !!evmProviderInstance,
        solana: !!solanaProviderInstance,
      },
    },
    '*',
  );
}

// Re-announce EIP-6963 provider when dApps request it
// Some dApps request providers after our initial announcement
function setupEIP6963ReannounceListener(): void {
  window.addEventListener('eip6963:requestProvider', () => {
    if (evmProviderInstance) {
      // Already handled by announceEIP6963Provider, but dispatch again just in case
      const info: EIP6963ProviderInfo = {
        uuid: 'aintivirus-wallet',
        name: PROVIDER_INFO.NAME,
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMjAgNlYxMkMyMCAxNy41MiAxNi43OSAyMi4xMiAxMiAyM0M3LjIxIDIyLjEyIDQgMTcuNTIgNCAxMlY2TDEyIDJaIiBmaWxsPSIjNWI1ZmM3Ii8+CjxwYXRoIGQ9Ik0xMCA4TDE0IDEyTDEwIDE2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=',
        rdns: 'app.aintivirus.wallet',
      };
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { 
        detail: { info, provider: evmProviderInstance } 
      }));
    }
  });
}

initialize();
setupEIP6963ReannounceListener();

// Some pages load providers after DOMContentLoaded, so try again
document.addEventListener('DOMContentLoaded', () => {
  // Re-inject if our providers were overwritten or not set
  const existingEth = (window as unknown as { ethereum?: { isAintivirus?: boolean } }).ethereum;
  const existingSol = (window as unknown as { solana?: { isAintivirus?: boolean } }).solana;
  
  // If ethereum exists but isn't ours and isn't marked as having us in providers
  if (!existingEth?.isAintivirus) {
    const newProvider = injectEVMProvider();
    if (newProvider) {
      evmProviderInstance = newProvider;
    }
  }
  
  // If solana doesn't exist or isn't ours
  if (!existingSol?.isAintivirus) {
    const newProvider = injectSolanaProvider();
    if (newProvider) {
      solanaProviderInstance = newProvider;
      registerWalletStandard(newProvider);
    }
  }
});

// Also try after a small delay for SPAs that initialize late
setTimeout(() => {
  const existingEth = (window as unknown as { ethereum?: { isAintivirus?: boolean } }).ethereum;
  const existingSol = (window as unknown as { solana?: { isAintivirus?: boolean } }).solana;
  
  if (!existingEth?.isAintivirus) {
    injectEVMProvider();
  }
  
  if (!existingSol?.isAintivirus) {
    const newProvider = injectSolanaProvider();
    if (newProvider) {
      registerWalletStandard(newProvider);
    }
  }
}, 500);

export { AintivirusEVMProvider, AintivirusSolanaProvider, PublicKey };
