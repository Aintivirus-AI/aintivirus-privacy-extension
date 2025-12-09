

(function() {
  'use strict';

  
  const EXTENSION_ID = 'AINTIVIRUS';
  const MESSAGE_PREFIX = 'AINTIVIRUS_';
  
  
  const MSG_WALLET_REQUEST = `${MESSAGE_PREFIX}WALLET_REQUEST`;
  const MSG_WALLET_RESPONSE = `${MESSAGE_PREFIX}WALLET_RESPONSE`;
  const MSG_SECURITY_CHECK = `${MESSAGE_PREFIX}SECURITY_CHECK`;
  const MSG_SECURITY_RESULT = `${MESSAGE_PREFIX}SECURITY_RESULT`;

  
  const pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  
  
  let isWalletWrapped = false;
  
  
  let originalWallet: Record<string, unknown> | null = null;

  
  function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  
  function sendToContentScript(type: string, payload: unknown): void {
    window.postMessage({
      source: EXTENSION_ID,
      type,
      payload,
    }, '*');
  }

  
  function waitForResponse(requestId: string, timeoutMs: number = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeoutMs);
      
      pendingRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  
  function serializeTransaction(transaction: unknown): string {
    if (!transaction) return '';
    
    
    if (typeof (transaction as { serialize?: () => Uint8Array }).serialize === 'function') {
      const serialized = (transaction as { serialize: () => Uint8Array }).serialize();
      return btoa(String.fromCharCode(...serialized));
    }
    
    
    if (typeof (transaction as { serializeMessage?: () => Uint8Array }).serializeMessage === 'function') {
      const serialized = (transaction as { serializeMessage: () => Uint8Array }).serializeMessage();
      return btoa(String.fromCharCode(...serialized));
    }
    
    
    try {
      return btoa(JSON.stringify(transaction));
    } catch {
      return '';
    }
  }

  
  function handleContentScriptMessage(event: MessageEvent): void {
    
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data || data.source !== EXTENSION_ID) return;
    
    switch (data.type) {
      case MSG_WALLET_RESPONSE:
        handleWalletResponse(data.payload);
        break;
        
      case MSG_SECURITY_RESULT:
        handleSecurityResult(data.payload);
        break;
    }
  }

  
  function handleWalletResponse(payload: { id: string; success: boolean; result?: unknown; error?: string }): void {
    const pending = pendingRequests.get(payload.id);
    if (!pending) return;
    
    clearTimeout(pending.timeout);
    pendingRequests.delete(payload.id);
    
    if (payload.success) {
      pending.resolve(payload.result);
    } else {
      pending.reject(new Error(payload.error || 'Operation failed'));
    }
  }

  
  function handleSecurityResult(payload: { id: string; proceed: boolean; reason?: string }): void {
    const pending = pendingRequests.get(payload.id);
    if (!pending) return;
    
    clearTimeout(pending.timeout);
    pendingRequests.delete(payload.id);
    
    if (payload.proceed) {
      pending.resolve(true);
    } else {
      pending.reject(new Error(payload.reason || 'Operation blocked'));
    }
  }

  
  function createMethodWrapper(
    originalMethod: (...args: unknown[]) => Promise<unknown>,
    methodName: string,
    walletObj: Record<string, unknown>
  ): (...args: unknown[]) => Promise<unknown> {
    return async function(...args: unknown[]): Promise<unknown> {
      const requestId = generateRequestId();
      
      
      let payload: Record<string, unknown> = {
        id: requestId,
        method: methodName,
        domain: window.location.hostname,
        url: window.location.href,
      };
      
      
      switch (methodName) {
        case 'connect':
          payload.params = args[0] || {};
          break;
          
        case 'signTransaction':
          payload.transaction = serializeTransaction(args[0]);
          break;
          
        case 'signAllTransactions':
          payload.transactions = (args[0] as unknown[])?.map(serializeTransaction) || [];
          break;
          
        case 'signMessage':
          
          if (args[0] instanceof Uint8Array) {
            payload.message = btoa(String.fromCharCode(...args[0]));
          } else if (typeof args[0] === 'string') {
            payload.message = btoa(args[0]);
          }
          break;
          
        case 'signAndSendTransaction':
          payload.transaction = serializeTransaction(args[0]);
          payload.options = args[1] || {};
          break;
      }
      
      
      sendToContentScript(MSG_WALLET_REQUEST, payload);
      
      try {
        
        
        await waitForResponse(requestId, 60000);
        
        
        return originalMethod.apply(walletObj, args);
      } catch (error) {
        
        if (error instanceof Error && error.message === 'Request timeout') {
          

          return originalMethod.apply(walletObj, args);
        }
        
        
        throw error;
      }
    };
  }

  
  function wrapWallet(wallet: Record<string, unknown>): Record<string, unknown> {
    
    const methodsToWrap = [
      'connect',
      'disconnect',
      'signTransaction',
      'signAllTransactions',
      'signMessage',
      'signAndSendTransaction',
    ];
    
    
    const wrappedWallet: Record<string, unknown> = {};
    
    
    for (const key in wallet) {
      const value = wallet[key];
      
      if (methodsToWrap.includes(key) && typeof value === 'function') {
        
        wrappedWallet[key] = createMethodWrapper(
          value.bind(wallet),
          key,
          wallet
        );
      } else if (typeof value === 'function') {
        
        wrappedWallet[key] = value.bind(wallet);
      } else {
        
        Object.defineProperty(wrappedWallet, key, {
          get: () => wallet[key],
          set: (v) => { wallet[key] = v; },
          enumerable: true,
          configurable: true,
        });
      }
    }
    
    
    Object.setPrototypeOf(wrappedWallet, Object.getPrototypeOf(wallet));
    
    return wrappedWallet;
  }

  
  function initWalletInterception(): void {
    if (isWalletWrapped) return;
    
    
    const win = window as unknown as Record<string, unknown>;
    if (typeof window !== 'undefined' && win.solana) {
      wrapExistingWallet();
    }
    
    
    watchForWalletAddition();
    
    isWalletWrapped = true;
  }

  
  function wrapExistingWallet(): void {
    const win = window as unknown as Record<string, unknown>;
    const solana = win.solana as Record<string, unknown>;
    if (!solana || solana._aintivirus_wrapped) return;
    
    originalWallet = solana;
    const wrappedWallet = wrapWallet(solana);
    
    
    (wrappedWallet as Record<string, boolean>)._aintivirus_wrapped = true;
    
    
    const descriptor = Object.getOwnPropertyDescriptor(window, 'solana');
    if (descriptor && !descriptor.configurable) {
      
      
      wrapMethodsInPlace(solana);
      return;
    }
    
    
    try {
      Object.defineProperty(window, 'solana', {
        value: wrappedWallet,
        writable: true,
        configurable: true,
      });

    } catch (error) {
      

      wrapMethodsInPlace(solana);
    }
  }

  
  function wrapMethodsInPlace(wallet: Record<string, unknown>): void {
    const methodsToWrap = [
      'connect',
      'disconnect',
      'signTransaction',
      'signAllTransactions',
      'signMessage',
      'signAndSendTransaction',
    ];
    
    for (const methodName of methodsToWrap) {
      const original = wallet[methodName];
      if (typeof original === 'function' && !(original as unknown as Record<string, boolean>)._aintivirus_wrapped) {
        const wrapped = createMethodWrapper(
          original.bind(wallet),
          methodName,
          wallet
        );
        (wrapped as unknown as Record<string, boolean>)._aintivirus_wrapped = true;
        
        try {
          wallet[methodName] = wrapped;
        } catch {
          
        }
      }
    }
    
    (wallet as Record<string, boolean>)._aintivirus_wrapped = true;
  }

  
  function watchForWalletAddition(): void {
    
    const existingSolanaDescriptor = Object.getOwnPropertyDescriptor(window, 'solana');
    
    
    if (!existingSolanaDescriptor || existingSolanaDescriptor.configurable) {
      let solanaDescriptor = existingSolanaDescriptor;
      
      try {
        Object.defineProperty(window, 'solana', {
          get() {
            return solanaDescriptor?.value;
          },
          set(value) {
            if (value && !(value as Record<string, boolean>)._aintivirus_wrapped) {
              originalWallet = value as Record<string, unknown>;
              const wrapped = wrapWallet(value);
              (wrapped as Record<string, boolean>)._aintivirus_wrapped = true;
              solanaDescriptor = { value: wrapped, writable: true, configurable: true };

            } else {
              solanaDescriptor = { value, writable: true, configurable: true };
            }
          },
          configurable: true,
        });
      } catch {
        
      }
    }
    
    
    const walletNames = ['phantom', 'solflare', 'backpack', 'glow'];
    
    for (const name of walletNames) {
      const existingDescriptor = Object.getOwnPropertyDescriptor(window, name);
      
      
      if (existingDescriptor && !existingDescriptor.configurable) {
        continue;
      }
      
      try {
        Object.defineProperty(window, name, {
          get() {
            return existingDescriptor?.value;
          },
          set(value) {
            if (value && typeof value === 'object' && 'solana' in (value as object)) {
              
              const walletSolana = (value as Record<string, unknown>).solana;
              if (walletSolana && !(walletSolana as Record<string, boolean>)._aintivirus_wrapped) {
                const wrapped = wrapWallet(walletSolana as Record<string, unknown>);
                (wrapped as Record<string, boolean>)._aintivirus_wrapped = true;
                try {
                  (value as Record<string, unknown>).solana = wrapped;
                } catch {
                  
                }
              }
            }
            try {
              Object.defineProperty(window, name, {
                value,
                writable: true,
                configurable: true,
              });
            } catch {
              
            }
          },
          configurable: true,
        });
      } catch {
        
      }
    }
  }

  
  window.addEventListener('message', handleContentScriptMessage);
  
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWalletInterception);
  } else {
    initWalletInterception();
  }
  
  
  setTimeout(initWalletInterception, 0);
  
  
  sendToContentScript(`${MESSAGE_PREFIX}INJECTED_READY`, {
    domain: window.location.hostname,
    url: window.location.href,
  });
  
})();

