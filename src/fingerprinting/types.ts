

export interface FingerprintSettings {
  enabled: boolean;             
  canvasNoise: boolean;         
  webglMask: boolean;           
  screenMask: boolean;          
  audioNoise: boolean;          
  clientHintsMask: boolean;     
  hardwareConcurrencyMask: boolean;  
  deviceMemoryMask: boolean;    
  languagesMask: boolean;       
  pluginsMask: boolean;         
  timezoneMask: boolean;        
}

export const DEFAULT_FINGERPRINT_SETTINGS: FingerprintSettings = {
  enabled: true,
  canvasNoise: true,
  webglMask: true,
  screenMask: true,
  audioNoise: true,
  clientHintsMask: true,
  hardwareConcurrencyMask: true,
  deviceMemoryMask: true,
  languagesMask: true,
  pluginsMask: true,
  timezoneMask: true,
};


export interface InjectedScriptConfig {
  noiseSeed: number;
  protections: {
    canvas: boolean;
    webgl: boolean;
    screen: boolean;
    audio: boolean;
    clientHints: boolean;
    hardwareConcurrency: boolean;
    deviceMemory: boolean;
    languages: boolean;
    plugins: boolean;
    timezone: boolean;
  };
  maskedScreen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
  };
  trackerDomains: string[];
}


export const COMMON_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
] as const;


export const MASKED_WEBGL = {
  RENDERER: 'WebKit WebGL',
  VENDOR: 'WebKit',
  UNMASKED_RENDERER: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (CML GT2), OpenGL 4.5)',
  UNMASKED_VENDOR: 'Google Inc. (Intel)',
} as const;

export type FingerprintMessageType =
  | 'GET_FINGERPRINT_SETTINGS'
  | 'SET_FINGERPRINT_SETTINGS'
  | 'GET_FINGERPRINT_STATUS';

export interface FingerprintStatus {
  isEnabled: boolean;
  protectionsActive: {
    canvas: boolean;
    webgl: boolean;
    screen: boolean;
    audio: boolean;
    clientHints: boolean;
  };
  injectedTabCount: number;
}

