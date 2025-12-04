/**
 * AINTIVIRUS Wallet Module - QR Code Generation
 * 
 * Generates QR codes for wallet addresses to facilitate receiving payments.
 * 
 * SECURITY:
 * - Only generates QR codes for public addresses (safe to share)
 * - No sensitive data is ever encoded in QR codes
 * - Uses offline generation (no external services)
 * 
 * NOTE: Uses SVG output because service workers don't have canvas access.
 * SVG is converted to data URL for consistent API.
 */

import QRCode from 'qrcode';

// ============================================
// QR CODE GENERATION
// ============================================

/**
 * Generate a QR code for a Solana address
 * 
 * SECURITY: This only encodes the public address, which is safe to share.
 * The QR code can be used by others to send SOL to this address.
 * 
 * NOTE: Uses SVG generation because service workers don't have canvas.
 * Returns SVG as a data URL for easy embedding in img tags.
 * 
 * @param address - Base58-encoded Solana public key
 * @param options - Optional customization
 * @returns Data URL for the QR code image (SVG)
 */
export async function generateAddressQR(
  address: string,
  options?: {
    size?: number;
    lightTheme?: boolean;
  }
): Promise<string> {
  const { size = 200, lightTheme = true } = options || {};
  
  try {
    // Generate QR code as SVG string (works in service workers without canvas)
    const svgOptions: QRCode.QRCodeToStringOptions = {
      type: 'svg',
      margin: 2,
      width: size,
      color: lightTheme 
        ? { dark: '#000000', light: '#ffffff' }
        : { dark: '#f0f0f5', light: '#0f0f14' },
      errorCorrectionLevel: 'M',
    };
    
    const svg = await QRCode.toString(address, svgOptions);
    
    // Convert SVG to data URL
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
  } catch (error) {
    console.error('[AINTIVIRUS Wallet] Failed to generate QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generate a QR code with Solana URI scheme
 * 
 * Uses the Solana Pay URL format: solana:<address>
 * This format is recognized by mobile wallets.
 * 
 * @param address - Base58-encoded Solana public key
 * @param options - Optional customization including amount
 * @returns Data URL for the QR code image (SVG)
 */
export async function generateSolanaPayQR(
  address: string,
  options?: {
    amount?: number;      // Amount in SOL
    label?: string;       // Label for the payment
    message?: string;     // Message/memo
    size?: number;
    lightTheme?: boolean;
  }
): Promise<string> {
  const { 
    amount, 
    label, 
    message, 
    size = 200, 
    lightTheme = true 
  } = options || {};
  
  // Build Solana Pay URL
  // Format: solana:<recipient>?amount=<amount>&label=<label>&message=<message>
  let url = `solana:${address}`;
  
  const params: string[] = [];
  if (amount !== undefined && amount > 0) {
    params.push(`amount=${amount}`);
  }
  if (label) {
    params.push(`label=${encodeURIComponent(label)}`);
  }
  if (message) {
    params.push(`message=${encodeURIComponent(message)}`);
  }
  
  if (params.length > 0) {
    url += '?' + params.join('&');
  }
  
  try {
    // Generate QR code as SVG string (works in service workers)
    const svgOptions: QRCode.QRCodeToStringOptions = {
      type: 'svg',
      margin: 2,
      width: size,
      color: lightTheme 
        ? { dark: '#000000', light: '#ffffff' }
        : { dark: '#f0f0f5', light: '#0f0f14' },
      errorCorrectionLevel: 'M',
    };
    
    const svg = await QRCode.toString(url, svgOptions);
    
    // Convert SVG to data URL
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
  } catch (error) {
    console.error('[AINTIVIRUS Wallet] Failed to generate Solana Pay QR:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generate QR code as SVG string
 * 
 * SVG is resolution-independent and can be styled with CSS.
 * Useful for embedding directly in the UI.
 * 
 * @param address - Base58-encoded Solana public key
 * @returns SVG string
 */
export async function generateAddressQRSvg(
  address: string,
  options?: {
    size?: number;
    lightTheme?: boolean;
  }
): Promise<string> {
  const { size = 200, lightTheme = false } = options || {};
  
  const svgOptions: QRCode.QRCodeToStringOptions = {
    type: 'svg',
    margin: 2,
    width: size,
    color: lightTheme 
      ? { dark: '#000000', light: '#ffffff' }
      : { dark: '#f0f0f5', light: '#0f0f14' },
    errorCorrectionLevel: 'M',
  };
  
  try {
    const svg = await QRCode.toString(address, svgOptions);
    return svg;
  } catch (error) {
    console.error('[AINTIVIRUS Wallet] Failed to generate QR SVG:', error);
    throw new Error('Failed to generate QR code');
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Validate that a string can be encoded as a QR code
 * 
 * @param data - String to validate
 * @returns True if valid for QR encoding
 */
export function canEncodeAsQR(data: string): boolean {
  // QR codes can encode up to ~4000 alphanumeric characters
  // Solana addresses are 32-44 characters, so this should always pass
  if (!data || data.length === 0) {
    return false;
  }
  
  // QR version 40 can hold 4296 alphanumeric chars max
  if (data.length > 4000) {
    return false;
  }
  
  return true;
}

/**
 * Get the minimum QR code size for readability
 * 
 * @param dataLength - Length of data to encode
 * @returns Minimum recommended size in pixels
 */
export function getMinimumQRSize(dataLength: number): number {
  // Solana addresses are ~44 chars, which fits in QR version 2
  // Minimum readable size is about 100px for mobile cameras
  if (dataLength <= 50) {
    return 100;
  } else if (dataLength <= 100) {
    return 150;
  } else {
    return 200;
  }
}

