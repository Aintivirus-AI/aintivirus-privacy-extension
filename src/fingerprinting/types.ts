// Fingerprint protection settings
// Each one can be toggled if it breaks sites

export interface FingerprintSettings {
  enabled: boolean;             // master switch
  canvasNoise: boolean;         // add noise to canvas output
  webglMask: boolean;           // hide GPU info
  screenMask: boolean;          // fake screen size
  audioNoise: boolean;          // mess with audio context
  clientHintsMask: boolean;     // hide browser details
  hardwareConcurrencyMask: boolean;  // fake CPU count
  deviceMemoryMask: boolean;    // fake RAM amount
  languagesMask: boolean;       // everyone speaks english
  pluginsMask: boolean;         // hide plugins
  timezoneMask: boolean;        // fake timezone
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

// What we pass to the injected script (must be JSON-serializable)
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

// Common resolutions - most people have one of these
export const COMMON_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
] as const;

// Fake GPU info - Intel integrated is super common so we blend in
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


