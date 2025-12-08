/**
 * Clipboard utility with fallback for permission failures.
 * Returns true on success, false on failure.
 */

/**
 * Copies text to clipboard using the Clipboard API.
 * Falls back to execCommand for older browsers.
 * 
 * @param text - The text to copy to clipboard
 * @returns Promise<boolean> - true if copy succeeded, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API first
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Clipboard API failed (permission denied, not focused, etc.)
      console.warn('Clipboard API failed, trying fallback:', err);
    }
  }

  // Fallback: use execCommand (deprecated but widely supported)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return success;
  } catch (err) {
    console.error('Fallback clipboard copy failed:', err);
    return false;
  }
}

/**
 * Creates a manual select fallback for when clipboard operations fail.
 * This selects the text in an element so users can Ctrl+C manually.
 * 
 * @param element - The HTML element containing text to select
 */
export function selectTextInElement(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Utility to format text for display (truncate long strings)
 */
export function truncateForDisplay(text: string, maxLength: number = 20): string {
  if (text.length <= maxLength) return text;
  const half = Math.floor((maxLength - 3) / 2);
  return `${text.slice(0, half)}...${text.slice(-half)}`;
}
