/**
 * AINTIVIRUS Security Module - Injected Script
 * 
 * This script is injected into the page context to intercept
 * wallet adapter interactions. It wraps the window.solana object
 * to monitor and validate wallet operations.
 * 
 * SECURITY ARCHITECTURE:
 * - This script runs in the page's JavaScript context
 * - It communicates with the content script via postMessage
 * - All sensitive operations go through the background script
 * - Original wallet functionality is preserved
 * 
 * IMPORTANT:
 * - This script intercepts but does NOT block operations
 * - User confirmation is requested for flagged operations
 * - The original wallet adapter remains functional
 */

(function() {
  'use strict';

  // ============================================
  // CONSTANTS
  // ============================================
  
  const EXTENSION_ID = 'AINTIVIRUS';
  const MESSAGE_PREFIX = 'AINTIVIRUS_';
  
  // Message types
  const MSG_WALLET_REQUEST = `${MESSAGE_PREFIX}WALLET_REQUEST`;
  const MSG_WALLET_RESPONSE = `${MESSAGE_PREFIX}WALLET_RESPONSE`;
  const MSG_SECURITY_CHECK = `${MESSAGE_PREFIX}SECURITY_CHECK`;
  const MSG_SECURITY_RESULT = `${MESSAGE_PREFIX}SECURITY_RESULT`;

  // ============================================
  // STATE
  // ============================================
  
  // Store pending requests
  const pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  
  // Track if wallet is already wrapped
  let isWalletWrapped = false;
  
  // Original wallet reference
  let originalWallet: Record<string, unknown> | null = null;

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  /**
   * Generate unique request ID
   */
  function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Send message to content script
   */
  function sendToContentScript(type: string, payload: unknown): void {
    window.postMessage({
      source: EXTENSION_ID,
      type,
      payload,
    }, '*');
  }

  /**
   * Wait for response from content script
   */
  function waitForResponse(requestId: string, timeoutMs: number = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeoutMs);
      
      pendingRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  /**
   * Serialize transaction for transmission
   */
  function serializeTransaction(transaction: unknown): string {
    if (!transaction) return '';
    
    // Handle versioned transactions
    if (typeof (transaction as { serialize?: () => Uint8Array }).serialize === 'function') {
      const serialized = (transaction as { serialize: () => Uint8Array }).serialize();
      return btoa(String.fromCharCode(...serialized));
    }
    
    // Handle legacy transactions
    if (typeof (transaction as { serializeMessage?: () => Uint8Array }).serializeMessage === 'function') {
      const serialized = (transaction as { serializeMessage: () => Uint8Array }).serializeMessage();
      return btoa(String.fromCharCode(...serialized));
    }
    
    // Fallback: try to serialize as JSON
    try {
      return btoa(JSON.stringify(transaction));
    } catch {
      return '';
    }
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================
  
  /**
   * Handle messages from content script
   */
  function handleContentScriptMessage(event: MessageEvent): void {
    // Only accept messages from same window
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

  /**
   * Handle wallet operation response
   */
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

  /**
   * Handle security check result
   */
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

  // ============================================
  // WALLET WRAPPER
  // ============================================
  
  /**
   * Create a wrapper for wallet methods
   */
  function createMethodWrapper(
    originalMethod: (...args: unknown[]) => Promise<unknown>,
    methodName: string,
    walletObj: Record<string, unknown>
  ): (...args: unknown[]) => Promise<unknown> {
    return async function(...args: unknown[]): Promise<unknown> {
      const requestId = generateRequestId();
      
      // Prepare request payload
      let payload: Record<string, unknown> = {
        id: requestId,
        method: methodName,
        domain: window.location.hostname,
        url: window.location.href,
      };
      
      // Add method-specific data
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
          // Handle message signing
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
      
      // Send to content script for security check
      sendToContentScript(MSG_WALLET_REQUEST, payload);
      
      try {
        // Wait for security check response
        // Content script will either approve or show a warning
        await waitForResponse(requestId, 60000);
        
        // Security check passed, proceed with original method
        return originalMethod.apply(walletObj, args);
      } catch (error) {
        // Security check failed or user rejected
        if (error instanceof Error && error.message === 'Request timeout') {
          // Timeout - proceed anyway to not break dApp functionality
          console.warn('[AINTIVIRUS] Security check timeout, proceeding with caution');
          return originalMethod.apply(walletObj, args);
        }
        
        // User rejected or security blocked
        throw error;
      }
    };
  }

  /**
   * Wrap a wallet object with security monitoring
   */
  function wrapWallet(wallet: Record<string, unknown>): Record<string, unknown> {
    // Methods to wrap
    const methodsToWrap = [
      'connect',
      'disconnect',
      'signTransaction',
      'signAllTransactions',
      'signMessage',
      'signAndSendTransaction',
    ];
    
    // Create wrapped wallet
    const wrappedWallet: Record<string, unknown> = {};
    
    // Copy all properties
    for (const key in wallet) {
      const value = wallet[key];
      
      if (methodsToWrap.includes(key) && typeof value === 'function') {
        // Wrap method with security monitoring
        wrappedWallet[key] = createMethodWrapper(
          value.bind(wallet),
          key,
          wallet
        );
      } else if (typeof value === 'function') {
        // Bind other methods to original wallet
        wrappedWallet[key] = value.bind(wallet);
      } else {
        // Copy other properties with getter/setter
        Object.defineProperty(wrappedWallet, key, {
          get: () => wallet[key],
          set: (v) => { wallet[key] = v; },
          enumerable: true,
          configurable: true,
        });
      }
    }
    
    // Preserve prototype chain
    Object.setPrototypeOf(wrappedWallet, Object.getPrototypeOf(wallet));
    
    return wrappedWallet;
  }

  /**
   * Initialize wallet interception
   */
  function initWalletInterception(): void {
    if (isWalletWrapped) return;
    
    // Check for existing wallet
    const win = window as unknown as Record<string, unknown>;
    if (typeof window !== 'undefined' && win.solana) {
      wrapExistingWallet();
    }
    
    // Watch for wallet being added
    watchForWalletAddition();
    
    isWalletWrapped = true;
  }

  /**
   * Wrap existing window.solana
   */
  function wrapExistingWallet(): void {
    const win = window as unknown as Record<string, unknown>;
    const solana = win.solana as Record<string, unknown>;
    if (!solana || solana._aintivirus_wrapped) return;
    
    originalWallet = solana;
    const wrappedWallet = wrapWallet(solana);
    
    // Mark as wrapped to prevent double-wrapping
    (wrappedWallet as Record<string, boolean>)._aintivirus_wrapped = true;
    
    // Check if property is configurable before trying to redefine
    const descriptor = Object.getOwnPropertyDescriptor(window, 'solana');
    if (descriptor && !descriptor.configurable) {
      // Property is not configurable, cannot wrap
      // Fall back to wrapping methods in-place if possible
      console.log('[AINTIVIRUS] Cannot redefine window.solana, using in-place wrapping');
      wrapMethodsInPlace(solana);
      return;
    }
    
    // Replace window.solana
    try {
      Object.defineProperty(window, 'solana', {
        value: wrappedWallet,
        writable: true,
        configurable: true,
      });
      console.log('[AINTIVIRUS] Wallet security monitoring active');
    } catch (error) {
      // Fallback: wrap methods in place
      console.log('[AINTIVIRUS] Fallback to in-place wrapping');
      wrapMethodsInPlace(solana);
    }
  }

  /**
   * Wrap wallet methods in-place when we can't replace the object
   */
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
          // Property might be read-only, skip
        }
      }
    }
    
    (wallet as Record<string, boolean>)._aintivirus_wrapped = true;
  }

  /**
   * Watch for wallet being added to window
   */
  function watchForWalletAddition(): void {
    // Check if solana property exists and is configurable
    const existingSolanaDescriptor = Object.getOwnPropertyDescriptor(window, 'solana');
    
    // Only try to define property watcher if it's configurable or doesn't exist
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
              console.log('[AINTIVIRUS] Wallet security monitoring active');
            } else {
              solanaDescriptor = { value, writable: true, configurable: true };
            }
          },
          configurable: true,
        });
      } catch {
        // Cannot define property watcher, skip
      }
    }
    
    // Also watch for phantom and other common wallet names
    const walletNames = ['phantom', 'solflare', 'backpack', 'glow'];
    
    for (const name of walletNames) {
      const existingDescriptor = Object.getOwnPropertyDescriptor(window, name);
      
      // Only try if configurable or doesn't exist
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
              // Wallet with solana property
              const walletSolana = (value as Record<string, unknown>).solana;
              if (walletSolana && !(walletSolana as Record<string, boolean>)._aintivirus_wrapped) {
                const wrapped = wrapWallet(walletSolana as Record<string, unknown>);
                (wrapped as Record<string, boolean>)._aintivirus_wrapped = true;
                try {
                  (value as Record<string, unknown>).solana = wrapped;
                } catch {
                  // Property might be read-only
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
              // Cannot redefine
            }
          },
          configurable: true,
        });
      } catch {
        // Cannot define property watcher for this name
      }
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  
  // Listen for messages from content script
  window.addEventListener('message', handleContentScriptMessage);
  
  // Initialize wallet interception
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWalletInterception);
  } else {
    initWalletInterception();
  }
  
  // Also try immediately in case wallet is already loaded
  setTimeout(initWalletInterception, 0);
  
  // Notify content script that injected script is ready
  sendToContentScript(`${MESSAGE_PREFIX}INJECTED_READY`, {
    domain: window.location.hostname,
    url: window.location.href,
  });
  
})();

