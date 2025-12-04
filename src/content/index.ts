import { sendToBackground, createMessageListener } from '@shared/messaging';
import { ExtensionMessage, MessageResponse } from '@shared/types';
import { BOOTSTRAP_COSMETIC_SELECTORS } from '../privacy/types';

// Content script - runs on every page to hide ads, show warnings, and talk to the background
// We use Symbols for markers so pages can't detect we're here
const INJECTION_SYMBOL = Symbol.for('_av_cs_' + chrome.runtime.id.slice(0, 8));
const OBSERVER_SYMBOL = Symbol.for('_av_ob_' + chrome.runtime.id.slice(0, 8));
const STYLE_SYMBOL = Symbol.for('_av_st_' + chrome.runtime.id.slice(0, 8));
const SECURITY_SYMBOL = Symbol.for('_av_sec_' + chrome.runtime.id.slice(0, 8));

// For secure messaging with the injected script
const EXTENSION_ID = 'AINTIVIRUS';
const MESSAGE_PREFIX = 'AINTIVIRUS_';

interface ExtendedWindow extends Window {
  [INJECTION_SYMBOL]?: boolean;
  [OBSERVER_SYMBOL]?: MutationObserver;
  [STYLE_SYMBOL]?: HTMLStyleElement;
  [SECURITY_SYMBOL]?: boolean;
}

const extWindow = window as unknown as ExtendedWindow;

if (extWindow[INJECTION_SYMBOL]) {
  // Already injected, bail
} else {
  extWindow[INJECTION_SYMBOL] = true;
  initContentScript();
}

// Boot up the content script - hide ads fast, inject security, set up listeners
function initContentScript(): void {
  // Hide ads immediately before user sees them flash
  applyBootstrapCosmeticFilters();
  injectSecurityScript();
  setupSecurityMessageListener();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }

  setupMessageListener();
}

// Inject some basic ad-hiding CSS right away, before we fetch the full filter lists
function applyBootstrapCosmeticFilters(): void {
  const style = document.createElement('style');
  style.id = 'aintivirus-cosmetic-bootstrap';
  style.textContent = generateCosmeticCSS(BOOTSTRAP_COSMETIC_SELECTORS);
  const target = document.head || document.documentElement;
  if (target) {
    target.insertBefore(style, target.firstChild);
  }
}

// DOM's ready, time to do the real work
async function onDOMReady(): Promise<void> {
  await sendToBackground({
    type: 'CONTENT_SCRIPT_READY',
    payload: { url: window.location.href },
  });

  await checkPhishingAndWarn();
  await applyCosmeticFilters();
  removeAdPlaceholders();
  initPageObservers();
}

// Get the full cosmetic filter rules for this site and apply them
async function applyCosmeticFilters(): Promise<void> {
  try {
    const domain = window.location.hostname;
    
    const response = await sendToBackground({
      type: 'GET_COSMETIC_RULES',
      payload: { domain },
    });
    
    const data = response.data as { selectors?: string[] } | undefined;
    
    if (response.success && data?.selectors) {
      const selectors = data.selectors;
      
      if (selectors.length > 0) {
        let style = document.getElementById('aintivirus-cosmetic') as HTMLStyleElement;
        if (!style) {
          style = document.createElement('style');
          style.id = 'aintivirus-cosmetic';
          (document.head || document.documentElement).appendChild(style);
        }
        
        style.textContent = generateCosmeticCSS(selectors);
        extWindow[STYLE_SYMBOL] = style;
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[AINTIVIRUS] Applied ${selectors.length} cosmetic rules for ${domain}`);
        }
      }
    }
  } catch (error) {
    // Not the end of the world if this fails
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AINTIVIRUS] Failed to fetch cosmetic rules:', error);
    }
  }
}

// Turn a list of selectors into CSS that hides them all
function generateCosmeticCSS(selectors: string[]): string {
  if (selectors.length === 0) return '';
  
  // Chrome has CSS limits so we chunk these up
  const CHUNK_SIZE = 100;
  const chunks: string[] = [];
  
  for (let i = 0; i < selectors.length; i += CHUNK_SIZE) {
    const chunk = selectors.slice(i, i + CHUNK_SIZE);
    chunks.push(chunk.join(',\n'));
  }
  
  return chunks.map(chunk => 
    `${chunk} { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; max-height: 0 !important; overflow: hidden !important; opacity: 0 !important; pointer-events: none !important; }`
  ).join('\n');
}

// Some ad containers leave ugly empty boxes - collapse them
function removeAdPlaceholders(): void {
  const emptyAdSelectors = [
    '.adsbygoogle:empty',
    'ins.adsbygoogle:empty',
    '[data-ad-slot]:empty',
    '[id^="google_ads_"]:empty',
    '[id^="div-gpt-ad"]:empty',
  ];
  
  // Kill those "Advertisement" labeled containers too
  const advertisementContainers = document.querySelectorAll('[aria-label="Advertisement"], [aria-label="Ads"]');
  advertisementContainers.forEach(el => {
    // Check if element is effectively empty (no visible content)
    const hasVisibleContent = Array.from(el.children).some(child => {
      const style = window.getComputedStyle(child);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    
    if (!hasVisibleContent) {
      (el as HTMLElement).style.display = 'none';
      (el as HTMLElement).style.height = '0';
      (el as HTMLElement).style.overflow = 'hidden';
    }
  });
  
  emptyAdSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        (el as HTMLElement).style.display = 'none';
        (el as HTMLElement).style.height = '0';
      });
    } catch {
      // Invalid selector, skip
    }
  });
  
  collapseAdWrappers();
}

// If a wrapper only has hidden ads inside, hide the whole wrapper
function collapseAdWrappers(): void {
  const wrapperSelectors = [
    '[class*="ad-container"]',
    '[class*="ad-wrapper"]',
    '[class*="advertisement"]',
    '[class*="sponsored"]',
    '[id*="ad-container"]',
    '[id*="ad-wrapper"]',
    'aside[class*="ad"]',
    'div[class*="sidebar-ad"]',
  ];
  
  wrapperSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(wrapper => {
        const rect = wrapper.getBoundingClientRect();
        const hasContent = rect.height > 10 && 
          Array.from(wrapper.children).some(child => {
            const childRect = child.getBoundingClientRect();
            return childRect.height > 5;
          });
        
        if (!hasContent) {
          const el = wrapper as HTMLElement;
          el.style.display = 'none';
          el.style.height = '0';
          el.style.minHeight = '0';
          el.style.padding = '0';
          el.style.margin = '0';
          el.style.overflow = 'hidden';
        }
      });
    } catch {
      // Invalid selector, skip
    }
  });
}

// Listen for messages from background
function setupMessageListener(): void {
  createMessageListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    return true;
  });
}

async function handleMessage(message: ExtensionMessage): Promise<MessageResponse> {
  switch (message.type) {
    case 'PING':
      return { success: true, data: 'pong from content script' };

    default:
      return { success: true };
  }
}

// Watch for new DOM elements (ads can load late) and hide them too
function initPageObservers(): void {
  let mutationThrottled = false;
  const THROTTLE_MS = 250;
  let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

  // Don't go crazy, throttle the mutation callbacks
  const handleMutations: MutationCallback = (mutations, _observer) => {
    if (mutationThrottled) return;
    
    mutationThrottled = true;
    setTimeout(() => { mutationThrottled = false; }, THROTTLE_MS);
    
    let hasNewAdElements = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (isAdRelatedElement(el)) {
              hasNewAdElements = true;
              break;
            }
          }
        }
      }
      if (hasNewAdElements) break;
    }
    
    if (hasNewAdElements) {
      if (cleanupTimeout) clearTimeout(cleanupTimeout);
      cleanupTimeout = setTimeout(() => {
        removeAdPlaceholders();
        cleanupTimeout = null;
      }, 100);
    }
  };

  const observer = new MutationObserver(handleMutations);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  extWindow[OBSERVER_SYMBOL] = observer;
  
  // Clean up when leaving - pagehide is the new unload
  window.addEventListener('pagehide', cleanup, { once: true });
}

// Quick check if this element smells like an ad
function isAdRelatedElement(el: Element): boolean {
  const className = el.className?.toString?.() || '';
  const id = el.id || '';
  const tagName = el.tagName?.toLowerCase();
  const adPatterns = [
    /\bad[s-]?\b/i,
    /\badvertis/i,
    /\bsponsor/i,
    /\bgoogle.*ad/i,
    /\bgpt-ad/i,
    /\btaboola/i,
    /\boutbrain/i,
  ];
  
  const testString = `${className} ${id}`;
  for (const pattern of adPatterns) {
    if (pattern.test(testString)) return true;
  }
  
  if (tagName === 'ins' && className.includes('adsbygoogle')) return true;
  if (el.hasAttribute('data-ad-slot')) return true;
  if (el.hasAttribute('data-ad-client')) return true;
  
  return false;
}

// --- Wallet Security ---

// Inject our security script into the page so we can intercept wallet calls
function injectSecurityScript(): void {
  if (extWindow[SECURITY_SYMBOL]) return;
  extWindow[SECURITY_SYMBOL] = true;
  
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('securityInjected.js');
    script.id = 'aintivirus-security';
    script.onload = () => script.remove(); // cleanup
    
    const target = document.head || document.documentElement;
    if (target) {
      target.insertBefore(script, target.firstChild);
    }
  } catch (error) {
    // Some pages block script injection, that's fine
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AINTIVIRUS] Security script injection failed:', error);
    }
  }
}

// Handle messages from our injected script
function setupSecurityMessageListener(): void {
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data || data.source !== EXTENSION_ID) return;
    
    switch (data.type) {
      case `${MESSAGE_PREFIX}WALLET_REQUEST`:
        await handleWalletRequest(data.payload);
        break;
        
      case `${MESSAGE_PREFIX}INJECTED_READY`:
        if (process.env.NODE_ENV !== 'production') {
          console.log('[AINTIVIRUS] Security script ready');
        }
        break;
    }
  });
}

// A dApp wants to do something with the wallet - check if it's safe first
async function handleWalletRequest(payload: {
  id: string;
  method: string;
  domain: string;
  url: string;
  transaction?: string;
  transactions?: string[];
  message?: string;
  params?: unknown;
}): Promise<void> {
  const { id, method, domain, url, transaction, transactions } = payload;
  
  try {
    let shouldProceed = true;
    
    switch (method) {
      case 'connect':
        const connectionResult = await sendToBackground({
          type: 'SECURITY_CONNECTION_REQUEST',
          payload: { domain, url },
        });
        
        if (connectionResult.success && connectionResult.data) {
          const analysis = connectionResult.data as { riskLevel: string; isPhishing: boolean };
          
          if (analysis.isPhishing || analysis.riskLevel === 'high') {
            shouldProceed = await showConnectionWarning(domain, analysis);
          }
          
          if (shouldProceed) {
            await sendToBackground({
              type: 'SECURITY_CONNECTION_APPROVE',
              payload: { domain, publicKey: '' },
            });
          }
        }
        break;
        
      case 'signTransaction':
      case 'signAllTransactions':
        const txsToVerify = transactions || (transaction ? [transaction] : []);
        
        if (txsToVerify.length > 0) {
          const verifyResult = await sendToBackground({
            type: 'SECURITY_VERIFY_TRANSACTION',
            payload: { domain, serializedTransactions: txsToVerify },
          });
          
          if (verifyResult.success && verifyResult.data) {
            const summaries = verifyResult.data as Array<{ riskLevel: string; warnings: string[] }>;
            const hasHighRisk = summaries.some(s => s.riskLevel === 'high');
            const hasWarnings = summaries.some(s => s.warnings.length > 0);
            
            if (hasHighRisk || hasWarnings) {
              shouldProceed = await showTransactionWarning(domain, summaries);
            }
          }
        }
        break;
        
      case 'signMessage':
        // Message signing is usually fine
        break;
        
      case 'disconnect':
        await sendToBackground({
          type: 'SECURITY_CONNECTION_REVOKE',
          payload: { domain },
        });
        break;
    }
    
    sendToInjectedScript(id, shouldProceed, shouldProceed ? undefined : 'User rejected');
    
  } catch (error) {
    // Something broke, let them through rather than blocking legit transactions
    sendToInjectedScript(id, true);
  }
}

function sendToInjectedScript(id: string, success: boolean, error?: string): void {
  window.postMessage({
    source: EXTENSION_ID,
    type: `${MESSAGE_PREFIX}WALLET_RESPONSE`,
    payload: { id, success, error },
  }, '*');
}

// Check if this site looks sketchy
async function checkPhishingAndWarn(): Promise<void> {
  try {
    const domain = window.location.hostname;
    
    const result = await sendToBackground({
      type: 'SECURITY_CHECK_DOMAIN',
      payload: { domain },
    });
    
    if (result.success && result.data) {
      const analysis = result.data as {
        isPhishing: boolean;
        riskLevel: string;
        signals: Array<{ description: string }>;
        recommendation: string;
        previouslyDismissed: boolean;
      };
      
      if ((analysis.isPhishing || analysis.riskLevel === 'high') && !analysis.previouslyDismissed) {
        showPhishingOverlay(domain, analysis);
      }
    }
  } catch {
    // Don't break the page if this fails
  }
}

// Big scary warning for phishing sites
function showPhishingOverlay(
  domain: string,
  analysis: {
    signals: Array<{ description: string }>;
    riskLevel: string;
  }
): void {
  const overlay = document.createElement('div');
  overlay.id = 'aintivirus-phishing-overlay';
  overlay.innerHTML = `
    <div class="av-phishing-modal">
      <div class="av-phishing-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <h2>Security Warning</h2>
      <p class="av-domain">${escapeHtml(domain)}</p>
      <p class="av-warning-text">This site has been flagged as potentially dangerous.</p>
      <ul class="av-signals">
        ${analysis.signals.map(s => `<li>${escapeHtml(s.description)}</li>`).join('')}
      </ul>
      <p class="av-disclaimer">
        AINTIVIRUS cannot guarantee this assessment is accurate. 
        If you believe this is a legitimate site, you may proceed at your own risk.
      </p>
      <div class="av-actions">
        <button class="av-btn av-btn-back" id="av-go-back">Go Back to Safety</button>
        <button class="av-btn av-btn-proceed" id="av-proceed">I Understand the Risk</button>
      </div>
    </div>
  `;
  
  const style = document.createElement('style');
  style.textContent = getPhishingOverlayStyles();
  overlay.appendChild(style);
  
  document.body.appendChild(overlay);
  document.getElementById('av-go-back')?.addEventListener('click', () => {
    window.history.back();
    setTimeout(() => {
      window.location.href = 'about:blank';
    }, 100);
  });
  
  document.getElementById('av-proceed')?.addEventListener('click', async () => {
    await sendToBackground({
      type: 'SECURITY_DISMISS_WARNING',
      payload: { domain },
    });
    overlay.remove();
  });
}

// Warn user before connecting to a risky site
async function showConnectionWarning(
  domain: string,
  analysis: { riskLevel: string; isPhishing: boolean }
): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'aintivirus-connection-warning';
    overlay.innerHTML = `
      <div class="av-warning-modal">
        <div class="av-warning-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3>Connection Warning</h3>
        </div>
        <p><strong>${escapeHtml(domain)}</strong> is requesting wallet access.</p>
        <p class="av-risk av-risk-${analysis.riskLevel}">Risk Level: ${analysis.riskLevel.toUpperCase()}</p>
        ${analysis.isPhishing ? '<p class="av-phishing-alert">This domain has been flagged as a potential phishing site.</p>' : ''}
        <p class="av-disclaimer">AINTIVIRUS cannot guarantee safety. Verify this is the correct site.</p>
        <div class="av-actions">
          <button class="av-btn av-btn-cancel" id="av-cancel">Cancel</button>
          <button class="av-btn av-btn-connect" id="av-connect">Connect Anyway</button>
        </div>
      </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = getWarningModalStyles();
    overlay.appendChild(style);
    
    document.body.appendChild(overlay);
    
    document.getElementById('av-cancel')?.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    
    document.getElementById('av-connect')?.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}

// Show what's risky about this transaction
async function showTransactionWarning(
  domain: string,
  summaries: Array<{ riskLevel: string; warnings: string[] }>
): Promise<boolean> {
  const allWarnings = summaries.flatMap(s => s.warnings);
  const highestRisk = summaries.reduce((max, s) => {
    if (s.riskLevel === 'high') return 'high';
    if (s.riskLevel === 'medium' && max !== 'high') return 'medium';
    return max;
  }, 'low' as string);
  
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'aintivirus-tx-warning';
    overlay.innerHTML = `
      <div class="av-warning-modal">
        <div class="av-warning-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h3>Transaction Warning</h3>
        </div>
        <p><strong>${escapeHtml(domain)}</strong> is requesting a transaction.</p>
        <p class="av-risk av-risk-${highestRisk}">Risk Level: ${highestRisk.toUpperCase()}</p>
        ${allWarnings.length > 0 ? `
          <ul class="av-warnings">
            ${allWarnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
          </ul>
        ` : ''}
        <p class="av-disclaimer">
          This analysis is informational only. AINTIVIRUS cannot guarantee transaction safety.
          Always verify transaction details independently.
        </p>
        <div class="av-actions">
          <button class="av-btn av-btn-cancel" id="av-reject">Reject</button>
          <button class="av-btn av-btn-confirm" id="av-confirm">Sign Anyway</button>
        </div>
      </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = getWarningModalStyles();
    overlay.appendChild(style);
    
    document.body.appendChild(overlay);
    
    document.getElementById('av-reject')?.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    
    document.getElementById('av-confirm')?.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}

// Escape HTML - don't want phishers injecting their own stuff
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getPhishingOverlayStyles(): string {
  return `
    #aintivirus-phishing-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(10, 10, 15, 0.98);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .av-phishing-modal {
      background: #1a1a25;
      border: 1px solid #c44c4c;
      border-radius: 16px;
      padding: 32px;
      max-width: 480px;
      text-align: center;
      color: #e8e8ef;
    }
    .av-phishing-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      color: #c44c4c;
    }
    .av-phishing-icon svg {
      width: 100%;
      height: 100%;
    }
    .av-phishing-modal h2 {
      color: #c44c4c;
      margin: 0 0 8px;
      font-size: 24px;
    }
    .av-domain {
      font-family: monospace;
      font-size: 14px;
      color: #9898a8;
      margin: 0 0 16px;
      word-break: break-all;
    }
    .av-warning-text {
      color: #e8e8ef;
      margin: 0 0 16px;
    }
    .av-signals {
      text-align: left;
      margin: 16px 0;
      padding-left: 20px;
      color: #d4a534;
    }
    .av-signals li {
      margin: 8px 0;
    }
    .av-disclaimer {
      font-size: 12px;
      color: #5c5c6c;
      margin: 16px 0;
    }
    .av-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .av-btn {
      flex: 1;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .av-btn-back {
      background: #5b5fc7;
      color: white;
    }
    .av-btn-back:hover {
      background: #6e72d4;
    }
    .av-btn-proceed {
      background: transparent;
      border: 1px solid #c44c4c;
      color: #c44c4c;
    }
    .av-btn-proceed:hover {
      background: rgba(196, 76, 76, 0.1);
    }
  `;
}

function getWarningModalStyles(): string {
  return `
    #aintivirus-connection-warning,
    #aintivirus-tx-warning {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(10, 10, 15, 0.9);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .av-warning-modal {
      background: #1a1a25;
      border: 1px solid #2a2a3d;
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      color: #e8e8ef;
    }
    .av-warning-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .av-warning-header svg {
      width: 24px;
      height: 24px;
      color: #d4a534;
    }
    .av-warning-header h3 {
      margin: 0;
      font-size: 18px;
    }
    .av-risk {
      font-weight: 600;
      margin: 12px 0;
    }
    .av-risk-low { color: #3d9970; }
    .av-risk-medium { color: #d4a534; }
    .av-risk-high { color: #c44c4c; }
    .av-phishing-alert {
      background: rgba(196, 76, 76, 0.15);
      border: 1px solid #c44c4c;
      color: #c44c4c;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      margin: 12px 0;
    }
    .av-warnings {
      text-align: left;
      margin: 12px 0;
      padding-left: 20px;
      color: #d4a534;
      font-size: 13px;
    }
    .av-warnings li {
      margin: 6px 0;
    }
    .av-disclaimer {
      font-size: 11px;
      color: #5c5c6c;
      margin: 12px 0;
    }
    .av-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .av-btn {
      flex: 1;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .av-btn-cancel {
      background: transparent;
      border: 1px solid #2a2a3d;
      color: #e8e8ef;
    }
    .av-btn-cancel:hover {
      background: #222230;
    }
    .av-btn-connect,
    .av-btn-confirm {
      background: #d4a534;
      color: #0a0a0f;
    }
    .av-btn-connect:hover,
    .av-btn-confirm:hover {
      background: #e0b343;
    }
  `;
}

// Clean up when we're done - remove our stuff from the page
export function cleanup(): void {
  const observer = extWindow[OBSERVER_SYMBOL];
  if (observer) {
    observer.disconnect();
    delete extWindow[OBSERVER_SYMBOL];
  }
  
  const style = extWindow[STYLE_SYMBOL];
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  delete extWindow[STYLE_SYMBOL];
  
  const bootstrapStyle = document.getElementById('aintivirus-cosmetic-bootstrap');
  if (bootstrapStyle && bootstrapStyle.parentNode) {
    bootstrapStyle.parentNode.removeChild(bootstrapStyle);
  }
  
  const mainStyle = document.getElementById('aintivirus-cosmetic');
  if (mainStyle && mainStyle.parentNode) {
    mainStyle.parentNode.removeChild(mainStyle);
  }
  
  delete extWindow[INJECTION_SYMBOL];
}

if (process.env.NODE_ENV !== 'production') {
  console.log('[AINTIVIRUS] Content script loaded');
}

