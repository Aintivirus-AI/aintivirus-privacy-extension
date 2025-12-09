

const PANEL_ID = 'aintivirus-floating-panel';
const PANEL_CONTAINER_ID = 'aintivirus-panel-container';

interface PanelState {
  isVisible: boolean;
  isMinimized: boolean;
}

let panelState: PanelState = {
  isVisible: false,
  isMinimized: true,
};


let panelElement: HTMLElement | null = null;


function createFloatingPanel(): HTMLElement {
  
  const existing = document.getElementById(PANEL_CONTAINER_ID);
  if (existing) {
    existing.remove();
    panelElement = null;
  }

  
  const container = document.createElement('div');
  container.id = PANEL_CONTAINER_ID;
  container.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 2147483647;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  
  const shadow = container.attachShadow({ mode: 'closed' });

  
  const styles = document.createElement('style');
  styles.textContent = `
    * {
      box-sizing: border-box;
    }

    .panel-wrapper {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 320px;
      height: 645px;
      max-height: calc(100vh - 32px);
      background: #0a0a0f;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(91, 95, 199, 0.2);
      overflow: hidden;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      opacity: 0;
      transform: translateY(-10px) scale(0.95);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .panel-wrapper.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .panel-wrapper.minimized {
      opacity: 0;
      transform: translateY(-10px) scale(0.95);
      pointer-events: none;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: #12121a;
      border-bottom: 1px solid #1f1f2e;
      cursor: move;
      user-select: none;
      flex-shrink: 0;
    }

    .panel-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }

    .panel-logo {
      width: 24px;
      height: 24px;
      border-radius: 4px;
    }

    .panel-title {
      font-size: 12px;
      font-weight: 600;
      color: #e8e8ef;
      letter-spacing: -0.01em;
    }

    .panel-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      pointer-events: auto;
    }

    .panel-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: #9898a8;
      cursor: pointer;
      transition: all 0.15s ease;
      pointer-events: auto;
      position: relative;
      z-index: 10;
    }

    .panel-btn:hover {
      background: #1a1a25;
      border-color: #2a2a3d;
      color: #e8e8ef;
    }

    .panel-btn.settings-btn:hover {
      background: rgba(91, 95, 199, 0.15);
      border-color: #5b5fc7;
      color: #5b5fc7;
    }

    .panel-btn.close-btn:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: #ef4444;
      color: #ef4444;
    }

    .panel-btn svg {
      width: 16px;
      height: 16px;
    }

    .panel-content {
      flex: 1;
      overflow: hidden;
    }

    .panel-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #0a0a0f;
    }

    .panel-wrapper.dragging {
      cursor: move;
      user-select: none;
    }

    .panel-wrapper.dragging .panel-iframe {
      pointer-events: none;
    }
  `;
  shadow.appendChild(styles);

  
  const panelWrapper = document.createElement('div');
  panelWrapper.className = 'panel-wrapper minimized';
  panelWrapper.id = PANEL_ID;

  
  const header = document.createElement('div');
  header.className = 'panel-header';

  
  const brand = document.createElement('div');
  brand.className = 'panel-brand';

  const logo = document.createElement('img');
  logo.className = 'panel-logo';
  logo.src = chrome.runtime.getURL('icons/icon48.png');
  logo.alt = 'Aintivirus';

  const title = document.createElement('span');
  title.className = 'panel-title';
  title.textContent = 'AINTIVIRUS Privacy and Wallet';

  brand.appendChild(logo);
  brand.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'panel-actions';

  
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'panel-btn settings-btn';
  settingsBtn.title = 'Settings';
  settingsBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  `;
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
  });

  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'panel-btn close-btn';
  closeBtn.title = 'Close';
  closeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    
    panelWrapper.classList.remove('visible');
    panelWrapper.classList.add('minimized');
    panelState.isVisible = false;
    panelState.isMinimized = true;

  });

  actions.appendChild(settingsBtn);
  actions.appendChild(closeBtn);
  header.appendChild(brand);
  header.appendChild(actions);

  
  const content = document.createElement('div');
  content.className = 'panel-content';

  const iframe = document.createElement('iframe');
  iframe.className = 'panel-iframe';
  iframe.src = chrome.runtime.getURL('popup.html');
  iframe.allow = 'clipboard-write';

  content.appendChild(iframe);
  panelWrapper.appendChild(header);
  panelWrapper.appendChild(content);
  shadow.appendChild(panelWrapper);

  
  setupDragging(panelWrapper, header);

  document.body.appendChild(container);

  
  panelElement = panelWrapper;

  return panelWrapper;
}


function setupDragging(panel: HTMLElement, handle: HTMLElement): void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startRight = 16;
  let startTop = 16;

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    
    if ((e.target as HTMLElement).closest('button')) return;

    isDragging = true;
    panel.classList.add('dragging');

    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startRight = window.innerWidth - rect.right;
    startTop = rect.top;

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newRight = Math.max(0, startRight - deltaX);
    const newTop = Math.max(0, Math.min(window.innerHeight - 100, startTop + deltaY));

    panel.style.right = `${newRight}px`;
    panel.style.top = `${newTop}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      panel.classList.remove('dragging');
    }
  });
}


function showPanel(): void {
  if (!panelElement) {
    createFloatingPanel();
  }

  if (panelElement) {
    panelElement.classList.remove('minimized');
    panelElement.classList.add('visible');
    panelState.isVisible = true;
    panelState.isMinimized = false;
  }
}


function closePanel(): void {
  if (panelElement) {
    panelElement.classList.remove('visible');
    panelElement.classList.add('minimized');
    panelState.isVisible = false;
    panelState.isMinimized = true;
  }
}


function togglePanel(): void {
  if (panelState.isMinimized) {
    showPanel();
  } else {
    closePanel();
  }
}


export function initializeFloatingPanel(): void {
  
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'TOGGLE_PANEL') {
      togglePanel();
      sendResponse({ success: true, isVisible: !panelState.isMinimized });
      return true;
    }
    if (message.type === 'SHOW_PANEL') {
      showPanel();
      sendResponse({ success: true });
      return true;
    }
    if (message.type === 'HIDE_PANEL') {
      closePanel();
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

}


export { showPanel, closePanel, togglePanel };

