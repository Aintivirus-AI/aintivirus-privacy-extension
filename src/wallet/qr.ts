

import QRCode from 'qrcode';


export async function generateAddressQR(
  address: string,
  options?: {
    size?: number;
    lightTheme?: boolean;
  }
): Promise<string> {
  const { size = 200, lightTheme = true } = options || {};
  
  try {
    
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
    
    
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
  } catch (error) {

    throw new Error('Failed to generate QR code');
  }
}


export async function generateSolanaPayQR(
  address: string,
  options?: {
    amount?: number;      
    label?: string;       
    message?: string;     
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
    
    
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
  } catch (error) {

    throw new Error('Failed to generate QR code');
  }
}


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

    throw new Error('Failed to generate QR code');
  }
}


export function canEncodeAsQR(data: string): boolean {
  
  
  if (!data || data.length === 0) {
    return false;
  }
  
  
  if (data.length > 4000) {
    return false;
  }
  
  return true;
}


export function getMinimumQRSize(dataLength: number): number {
  
  
  if (dataLength <= 50) {
    return 100;
  } else if (dataLength <= 100) {
    return 150;
  } else {
    return 200;
  }
}

