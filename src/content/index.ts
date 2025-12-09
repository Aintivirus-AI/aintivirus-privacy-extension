import { sendToBackground, createMessageListener } from '@shared/messaging';
import { ExtensionMessage, MessageResponse } from '@shared/types';
import { BOOTSTRAP_COSMETIC_SELECTORS, PROTECTED_SITES } from '../privacy/types';
import { 
  getSiteFixForDomain, 
  generateSiteFixCSS, 
  hideAdElements,
  removeEmptyContainers,
  injectAnalyticsBlockers,
} from '../privacy/siteFixes';
import { initializeDAppBridge } from '../dapp/bridge/contentBridge';
import { initializeFloatingPanel } from './floatingPanel';


const INJECTION_SYMBOL = Symbol.for('_av_cs_' + chrome.runtime.id.slice(0, 8));
const OBSERVER_SYMBOL = Symbol.for('_av_ob_' + chrome.runtime.id.slice(0, 8));
const STYLE_SYMBOL = Symbol.for('_av_st_' + chrome.runtime.id.slice(0, 8));
const SECURITY_SYMBOL = Symbol.for('_av_sec_' + chrome.runtime.id.slice(0, 8));


const EXTENSION_ID = 'AINTIVIRUS';
const MESSAGE_PREFIX = 'AINTIVIRUS_';

interface ExtendedWindow extends Window {
  [INJECTION_SYMBOL]?: boolean;
  [OBSERVER_SYMBOL]?: MutationObserver;
  [STYLE_SYMBOL]?: HTMLStyleElement;
  [SECURITY_SYMBOL]?: boolean;
}

const extWindow = window as unknown as ExtendedWindow;


let isAdBlockerEnabled = true;

if (extWindow[INJECTION_SYMBOL]) {
  
} else {
  extWindow[INJECTION_SYMBOL] = true;
  initContentScript().catch((error) => {

  });
}


function isProtectedSite(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return PROTECTED_SITES.some(site => 
    hostname === site || hostname.endsWith(`.${site}`)
  );
}


function isYouTube(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return hostname.includes('youtube.com') || hostname.includes('youtu.be');
}


async function initContentScript(): Promise<void> {
  
  try {
    const response = await sendToBackground({
      type: 'GET_AD_BLOCKER_STATUS',
      payload: undefined,
    });
    
    if (response.success && response.data !== undefined) {
      isAdBlockerEnabled = response.data as boolean;

    }
  } catch (error) {
    

    isAdBlockerEnabled = true;
  }
  
  
  if (isAdBlockerEnabled) {
    
    
    if (!isProtectedSite()) {
      applyBootstrapCosmeticFilters();
    }
    
    
    applySiteSpecificFixes();
    
    
    if (isYouTube()) {
      injectYouTubeScriptlets();
    }
  }
  
  injectSecurityScript();
  setupSecurityMessageListener();
  
  
  initializeDAppBridge();
  
  
  initializeFloatingPanel();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }

  setupMessageListener();
}


function injectYouTubeScriptlets(): void {
  try {
    
    const scriptContent = `
(function() {
  'use strict';
  
  const originalDefineProperty = Object.defineProperty;
  Object.defineProperty = function(obj, prop, descriptor) {
    if (prop === 'adBlocksFound' || 
        prop === 'adPlacements' ||
        prop === 'adSlots' ||
        prop === 'playerAds') {
      if (descriptor && descriptor.value !== undefined) {
        descriptor.value = undefined;
      }
      if (descriptor && descriptor.get) {
        descriptor.get = function() { return undefined; };
      }
    }
    return originalDefineProperty.call(this, obj, prop, descriptor);
  };
  
  const blockProperties = [
    'FuckAdBlock',
    'BlockAdBlock', 
    'fuckAdBlock',
    'blockAdBlock',
    'adBlockEnabled',
    'adblockEnabled',
    'isAdBlockActive'
  ];
  
  for (const prop of blockProperties) {
    try {
      Object.defineProperty(window, prop, {
        get: function() { return undefined; },
        set: function() { return true; },
        configurable: false
      });
    } catch (e) {
    }
  }
  
  const originalParse = JSON.parse;
  JSON.parse = function(text) {
    const result = originalParse.call(this, text);
    if (result && typeof result === 'object') {
      if (result.adPlacements) delete result.adPlacements;
      if (result.playerAds) delete result.playerAds;
      if (result.adSlots) delete result.adSlots;
      if (result.adBreakHeartbeatParams) delete result.adBreakHeartbeatParams;
    }
    return result;
  };
  
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName) {
    const element = originalCreateElement(tagName);
    if (tagName.toLowerCase() === 'tp-yt-paper-dialog') {
      element.setAttribute('data-aintivirus-blocked', 'true');
      setTimeout(() => {
        if (element.parentNode) {
          element.style.display = 'none';
        }
      }, 0);
    }
    return element;
  };

})();
`;

    const script = document.createElement('script');
    script.textContent = scriptContent;
    script.id = 'aintivirus-youtube-scriptlets';
    
    
    const target = document.head || document.documentElement;
    if (target) {
      target.insertBefore(script, target.firstChild);
      
      script.remove();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {

    }
  }
}


function applyBootstrapCosmeticFilters(): void {
  const style = document.createElement('style');
  style.id = 'aintivirus-cosmetic-bootstrap';
  style.textContent = generateCosmeticCSS(BOOTSTRAP_COSMETIC_SELECTORS);
  const target = document.head || document.documentElement;
  if (target) {
    target.insertBefore(style, target.firstChild);
  }
}


function applySiteSpecificFixes(): void {
  const hostname = window.location.hostname.toLowerCase();
  const siteFix = getSiteFixForDomain(hostname);
  
  
  if (hostname.includes('adblock') || hostname.includes('tester')) {
    injectAnalyticsBlockers();
  }
  
  if (!siteFix) return;

  
  const style = document.createElement('style');
  style.id = 'aintivirus-site-fixes';
  style.textContent = generateSiteFixCSS(siteFix);
  
  const target = document.head || document.documentElement;
  if (target) {
    target.insertBefore(style, target.firstChild);
  }
  
  
  if (siteFix.enableMutationObserver) {
    setupSiteFixObserver();
  }
}


function setupSiteFixObserver(): void {
  let throttled = false;
  const THROTTLE_MS = 100;
  
  const observer = new MutationObserver((mutations) => {
    if (throttled) return;
    
    throttled = true;
    setTimeout(() => { throttled = false; }, THROTTLE_MS);
    
    
    let hasNewElements = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        hasNewElements = true;
        break;
      }
    }
    
    if (hasNewElements) {
      
      const hiddenCount = hideAdElements();
      const removedCount = removeEmptyContainers();
      
      if ((hiddenCount > 0 || removedCount > 0) && process.env.NODE_ENV !== 'production') {

      }
    }
  });
  
  
  const startObserver = () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      
      
      hideAdElements();
      removeEmptyContainers();
    }
  };
  
  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver);
  }
}


async function onDOMReady(): Promise<void> {
  await sendToBackground({
    type: 'CONTENT_SCRIPT_READY',
    payload: { url: window.location.href },
  });

  await checkPhishingAndWarn();
  
  
  if (isAdBlockerEnabled) {
    await applyCosmeticFilters();
    removeAdPlaceholders();
    initPageObservers();
  }
}


async function applyCosmeticFilters(): Promise<void> {
  
  if (isProtectedSite()) {
    if (process.env.NODE_ENV !== 'production') {

    }
    return;
  }
  
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

        }
      }
    }
  } catch (error) {
    
    if (process.env.NODE_ENV !== 'production') {

    }
  }
}


function generateCosmeticCSS(selectors: string[]): string {
  if (selectors.length === 0) return '';
  
  
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


function removeAdPlaceholders(): void {
  
  if (isProtectedSite()) {
    return;
  }
  
  const emptyAdSelectors = [
    '.adsbygoogle:empty',
    'ins.adsbygoogle:empty',
    '[data-ad-slot]:empty',
    '[id^="google_ads_"]:empty',
    '[id^="div-gpt-ad"]:empty',
  ];
  
  
  const advertisementContainers = document.querySelectorAll('[aria-label="Advertisement"], [aria-label="Ads"]');
  advertisementContainers.forEach(el => {
    
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
      
    }
  });
  
  collapseAdWrappers();
}


function collapseAdWrappers(): void {
  
  if (isProtectedSite()) {
    return;
  }
  
  
  const wrapperSelectors = [
    '.adsbygoogle',
    '[id^="div-gpt-ad"]',
    '[id^="google_ads_"]',
    '[id^="taboola-"]',
    '.OUTBRAIN',
    '.adthrive-ad',
    '[id^="adthrive-"]',
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
      
    }
  });
}


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

    case 'AD_BLOCKER_TOGGLED': {
      const { enabled } = message.payload as { enabled: boolean };

      isAdBlockerEnabled = enabled;
      
      if (enabled) {
        
        enableCosmeticFiltering();
      } else {
        
        disableCosmeticFiltering();
      }
      
      return { success: true };
    }

    default:
      return { success: true };
  }
}


function enableCosmeticFiltering(): void {

  
  if (!isProtectedSite()) {
    applyBootstrapCosmeticFilters();
  }
  
  
  applySiteSpecificFixes();
  
  
  if (isYouTube()) {
    injectYouTubeScriptlets();
  }
  
  
  applyCosmeticFilters();
  removeAdPlaceholders();
  initPageObservers();
}


function disableCosmeticFiltering(): void {

  
  const bootstrapStyle = document.getElementById('aintivirus-cosmetic-bootstrap');
  if (bootstrapStyle) {
    bootstrapStyle.remove();
  }
  
  
  const siteFixStyle = document.getElementById('aintivirus-site-fixes');
  if (siteFixStyle) {
    siteFixStyle.remove();
  }
  
  
  const mainStyle = document.getElementById('aintivirus-cosmetic');
  if (mainStyle) {
    mainStyle.remove();
  }
  
  
  const observer = extWindow[OBSERVER_SYMBOL];
  if (observer) {
    observer.disconnect();
    delete extWindow[OBSERVER_SYMBOL];
  }
  
  
  delete extWindow[STYLE_SYMBOL];

}


function initPageObservers(): void {
  let mutationThrottled = false;
  const THROTTLE_MS = 250;
  let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

  
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
  
  
  window.addEventListener('pagehide', cleanup, { once: true });
}


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


function injectSecurityScript(): void {
  if (extWindow[SECURITY_SYMBOL]) return;
  extWindow[SECURITY_SYMBOL] = true;
  
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('securityInjected.js');
    script.id = 'aintivirus-security';
    script.onload = () => script.remove(); 
    
    const target = document.head || document.documentElement;
    if (target) {
      target.insertBefore(script, target.firstChild);
    }
  } catch (error) {
    
    if (process.env.NODE_ENV !== 'production') {

    }
  }
}


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

        }
        break;
    }
  });
}


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
    
  }
}


function createSvgElement(svgHtml: string): SVGSVGElement {
  
  const temp = document.createElement('div');
  temp.innerHTML = svgHtml;
  return temp.firstElementChild as SVGSVGElement;
}


function createTextElement(tag: string, text: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}


function createButton(text: string, id: string, className: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.id = id;
  btn.className = className;
  return btn;
}


function showPhishingOverlay(
  domain: string,
  analysis: {
    signals: Array<{ description: string }>;
    riskLevel: string;
  }
): void {
  const overlay = document.createElement('div');
  overlay.id = 'aintivirus-phishing-overlay';
  
  
  const modal = document.createElement('div');
  modal.className = 'av-phishing-modal';
  
  
  const iconDiv = document.createElement('div');
  iconDiv.className = 'av-phishing-icon';
  iconDiv.appendChild(createSvgElement(`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  `));
  modal.appendChild(iconDiv);
  
  
  modal.appendChild(createTextElement('h2', 'Security Warning'));
  
  
  modal.appendChild(createTextElement('p', domain, 'av-domain'));
  
  
  modal.appendChild(createTextElement('p', 'This site has been flagged as potentially dangerous.', 'av-warning-text'));
  
  
  const signalsList = document.createElement('ul');
  signalsList.className = 'av-signals';
  for (const signal of analysis.signals) {
    const li = document.createElement('li');
    li.textContent = signal.description; 
    signalsList.appendChild(li);
  }
  modal.appendChild(signalsList);
  
  
  const disclaimer = createTextElement('p', 
    'AINTIVIRUS cannot guarantee this assessment is accurate. If you believe this is a legitimate site, you may proceed at your own risk.',
    'av-disclaimer'
  );
  modal.appendChild(disclaimer);
  
  
  const actions = document.createElement('div');
  actions.className = 'av-actions';
  
  const backBtn = createButton('Go Back to Safety', 'av-go-back', 'av-btn av-btn-back');
  const proceedBtn = createButton('I Understand the Risk', 'av-proceed', 'av-btn av-btn-proceed');
  
  actions.appendChild(backBtn);
  actions.appendChild(proceedBtn);
  modal.appendChild(actions);
  
  overlay.appendChild(modal);
  
  
  const style = document.createElement('style');
  style.textContent = getPhishingOverlayStyles();
  overlay.appendChild(style);
  
  document.body.appendChild(overlay);
  
  
  backBtn.addEventListener('click', () => {
    window.history.back();
    setTimeout(() => {
      window.location.href = 'about:blank';
    }, 100);
  });
  
  proceedBtn.addEventListener('click', async () => {
    await sendToBackground({
      type: 'SECURITY_DISMISS_WARNING',
      payload: { domain },
    });
    overlay.remove();
  });
}


async function showConnectionWarning(
  domain: string,
  analysis: { riskLevel: string; isPhishing: boolean }
): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'aintivirus-connection-warning';
    
    
    const modal = document.createElement('div');
    modal.className = 'av-warning-modal';
    
    
    const header = document.createElement('div');
    header.className = 'av-warning-header';
    header.appendChild(createSvgElement(`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    `));
    header.appendChild(createTextElement('h3', 'Connection Warning'));
    modal.appendChild(header);
    
    
    const requestP = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = domain; 
    requestP.appendChild(strong);
    requestP.appendChild(document.createTextNode(' is requesting wallet access.'));
    modal.appendChild(requestP);
    
    
    const riskP = createTextElement('p', `Risk Level: ${analysis.riskLevel.toUpperCase()}`, `av-risk av-risk-${analysis.riskLevel}`);
    modal.appendChild(riskP);
    
    
    if (analysis.isPhishing) {
      modal.appendChild(createTextElement('p', 'This domain has been flagged as a potential phishing site.', 'av-phishing-alert'));
    }
    
    
    modal.appendChild(createTextElement('p', 'AINTIVIRUS cannot guarantee safety. Verify this is the correct site.', 'av-disclaimer'));
    
    
    const actions = document.createElement('div');
    actions.className = 'av-actions';
    
    const cancelBtn = createButton('Cancel', 'av-cancel', 'av-btn av-btn-cancel');
    const connectBtn = createButton('Connect Anyway', 'av-connect', 'av-btn av-btn-connect');
    
    actions.appendChild(cancelBtn);
    actions.appendChild(connectBtn);
    modal.appendChild(actions);
    
    overlay.appendChild(modal);
    
    
    const style = document.createElement('style');
    style.textContent = getWarningModalStyles();
    overlay.appendChild(style);
    
    document.body.appendChild(overlay);
    
    
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    
    connectBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}


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
    
    
    const modal = document.createElement('div');
    modal.className = 'av-warning-modal';
    
    
    const header = document.createElement('div');
    header.className = 'av-warning-header';
    header.appendChild(createSvgElement(`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    `));
    header.appendChild(createTextElement('h3', 'Transaction Warning'));
    modal.appendChild(header);
    
    
    const requestP = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = domain; 
    requestP.appendChild(strong);
    requestP.appendChild(document.createTextNode(' is requesting a transaction.'));
    modal.appendChild(requestP);
    
    
    const riskP = createTextElement('p', `Risk Level: ${highestRisk.toUpperCase()}`, `av-risk av-risk-${highestRisk}`);
    modal.appendChild(riskP);
    
    
    if (allWarnings.length > 0) {
      const warningsList = document.createElement('ul');
      warningsList.className = 'av-warnings';
      for (const warning of allWarnings) {
        const li = document.createElement('li');
        li.textContent = warning; 
        warningsList.appendChild(li);
      }
      modal.appendChild(warningsList);
    }
    
    
    modal.appendChild(createTextElement('p', 
      'This analysis is informational only. AINTIVIRUS cannot guarantee transaction safety. Always verify transaction details independently.',
      'av-disclaimer'
    ));
    
    
    const actions = document.createElement('div');
    actions.className = 'av-actions';
    
    const rejectBtn = createButton('Reject', 'av-reject', 'av-btn av-btn-cancel');
    const confirmBtn = createButton('Sign Anyway', 'av-confirm', 'av-btn av-btn-confirm');
    
    actions.appendChild(rejectBtn);
    actions.appendChild(confirmBtn);
    modal.appendChild(actions);
    
    overlay.appendChild(modal);
    
    
    const style = document.createElement('style');
    style.textContent = getWarningModalStyles();
    overlay.appendChild(style);
    
    document.body.appendChild(overlay);
    
    
    rejectBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    
    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}


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

}

