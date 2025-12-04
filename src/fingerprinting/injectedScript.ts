// This runs in the actual page context to mess with fingerprinting APIs
// MUST be self-contained - no imports! Gets bundled separately.
(function() {
  'use strict';
  interface InjectedConfig {
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
    _configKey?: string; // Internal: the key used to pass this config
  }

  // Find our config - it's stored with a random key so sites can't easily detect it
  const win = window as unknown as Record<string, InjectedConfig | undefined>;
  let config: InjectedConfig | undefined;
  let configKey: string | undefined;
  
  for (const key in win) {
    if (key.startsWith('_fp_cfg_') && typeof win[key] === 'object' && win[key]?.noiseSeed !== undefined) {
      config = win[key];
      configKey = key;
      break;
    }
  }
  
  if (!config) {
    return; // no config means something went wrong
  }

  // Clean up so sites can't find our config
  try {
    if (configKey) delete win[configKey];
  } catch {
    if (configKey) win[configKey] = undefined;
  }

  // --- Random number generator (seeded so results are consistent per domain) ---
  
  function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return function(): number {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = createSeededRandom(config.noiseSeed);

  function generateIntNoise(amplitude: number): number {
    return Math.floor(random() * (amplitude * 2 + 1)) - amplitude;
  }

  function clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  // --- Canvas fingerprint protection ---
  // Add random noise to canvas data so each site gets slightly different results

  if (config.protections.canvas) {
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    function addNoiseToImageData(imageData: ImageData): void {
      const data = imageData.data;
      const noiseAmplitude = 2;
      
      for (let i = 0; i < data.length; i += 4) {
        // Tweak RGB, leave alpha alone
        data[i] = clampByte(data[i] + generateIntNoise(noiseAmplitude));
        data[i + 1] = clampByte(data[i + 1] + generateIntNoise(noiseAmplitude));
        data[i + 2] = clampByte(data[i + 2] + generateIntNoise(noiseAmplitude));
      }
    }

    CanvasRenderingContext2D.prototype.getImageData = function(
      sx: number, 
      sy: number, 
      sw: number, 
      sh: number,
      settings?: ImageDataSettings
    ): ImageData {
      const imageData = originalGetImageData.call(this, sx, sy, sw, sh, settings);
      addNoiseToImageData(imageData);
      return imageData;
    };

    HTMLCanvasElement.prototype.toDataURL = function(
      type?: string,
      quality?: number
    ): string {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(this, 0, 0);
        const imageData = originalGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
        addNoiseToImageData(imageData);
        ctx.putImageData(imageData, 0, 0);
        return originalToDataURL.call(canvas, type, quality);
      }
      
      return originalToDataURL.call(this, type, quality);
    };

    HTMLCanvasElement.prototype.toBlob = function(
      callback: BlobCallback,
      type?: string,
      quality?: number
    ): void {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(this, 0, 0);
        const imageData = originalGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
        addNoiseToImageData(imageData);
        ctx.putImageData(imageData, 0, 0);
        return originalToBlob.call(canvas, callback, type, quality);
      }
      
      return originalToBlob.call(this, callback, type, quality);
    };
  }

  // --- WebGL fingerprint protection ---
  // Make everyone look like they have a generic Intel GPU

  if (config.protections.webgl) {
    const MASKED_WEBGL = {
      RENDERER: 'WebKit WebGL',
      VENDOR: 'WebKit',
      UNMASKED_RENDERER: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (CML GT2), OpenGL 4.5)',
      UNMASKED_VENDOR: 'Google Inc. (Intel)',
    };

    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(pname: GLenum): unknown {
      if (pname === 0x1F01) return MASKED_WEBGL.RENDERER;
      if (pname === 0x1F00) return MASKED_WEBGL.VENDOR;
      
      const debugExt = this.getExtension('WEBGL_debug_renderer_info');
      if (debugExt) {
        if (pname === debugExt.UNMASKED_RENDERER_WEBGL) return MASKED_WEBGL.UNMASKED_RENDERER;
        if (pname === debugExt.UNMASKED_VENDOR_WEBGL) return MASKED_WEBGL.UNMASKED_VENDOR;
      }
      
      return originalGetParameter.call(this, pname);
    };

    if (typeof WebGL2RenderingContext !== 'undefined') {
      const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(pname: GLenum): unknown {
        if (pname === 0x1F01) return MASKED_WEBGL.RENDERER;
        if (pname === 0x1F00) return MASKED_WEBGL.VENDOR;
        
        const debugExt = this.getExtension('WEBGL_debug_renderer_info');
        if (debugExt) {
          if (pname === debugExt.UNMASKED_RENDERER_WEBGL) return MASKED_WEBGL.UNMASKED_RENDERER;
          if (pname === debugExt.UNMASKED_VENDOR_WEBGL) return MASKED_WEBGL.UNMASKED_VENDOR;
        }
        
        return originalGetParameter2.call(this, pname);
      };
    }
  }

  // --- Screen resolution masking ---
  // Report a common screen size instead of the real one

  if (config.protections.screen) {
    const maskedScreen = config.maskedScreen;
    Object.defineProperties(window.screen, {
      width: { get: () => maskedScreen.width, configurable: true },
      height: { get: () => maskedScreen.height, configurable: true },
      availWidth: { get: () => maskedScreen.availWidth, configurable: true },
      availHeight: { get: () => maskedScreen.availHeight, configurable: true },
      colorDepth: { get: () => maskedScreen.colorDepth, configurable: true },
      pixelDepth: { get: () => maskedScreen.pixelDepth, configurable: true },
    });

    const originalOuterWidth = window.outerWidth;
    const originalOuterHeight = window.outerHeight;
    
    Object.defineProperties(window, {
      outerWidth: { 
        get: () => Math.min(originalOuterWidth, maskedScreen.width), 
        configurable: true 
      },
      outerHeight: { 
        get: () => Math.min(originalOuterHeight, maskedScreen.height), 
        configurable: true 
      },
    });

    Object.defineProperty(window, 'devicePixelRatio', {
      get: () => 1,
      configurable: true,
    });
  }

  // --- Audio fingerprint protection ---
  // Add tiny noise to audio data so fingerprints don't match

  if (config.protections.audio) {
    const OriginalAudioContext = window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext;
    
    if (OriginalAudioContext) {
      const originalGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData = function(array: Float32Array): void {
        originalGetFloatFrequencyData.call(this, array as unknown as Float32Array<ArrayBuffer>);
        const noiseAmplitude = 0.0001;
        for (let i = 0; i < array.length; i++) {
          array[i] += (random() * 2 - 1) * noiseAmplitude;
        }
      };

      const originalGetByteFrequencyData = AnalyserNode.prototype.getByteFrequencyData;
      AnalyserNode.prototype.getByteFrequencyData = function(array: Uint8Array): void {
        originalGetByteFrequencyData.call(this, array as unknown as Uint8Array<ArrayBuffer>);
        for (let i = 0; i < array.length; i++) {
          array[i] = clampByte(array[i] + generateIntNoise(1));
        }
      };

      const originalGetChannelData = AudioBuffer.prototype.getChannelData;
      (AudioBuffer.prototype as unknown as { getChannelData: (channel: number) => Float32Array }).getChannelData = function(channel: number): Float32Array {
        const data = originalGetChannelData.call(this, channel);
        const noiseAmplitude = 0.0000001; // imperceptible
        for (let i = 0; i < data.length; i++) {
          data[i] += (random() * 2 - 1) * noiseAmplitude;
        }
        return data;
      };
    }
  }

  // --- Client hints masking ---
  // Hide detailed browser/OS info

  if (config.protections.clientHints) {
    if ('userAgentData' in navigator) {
      const originalUserAgentData = navigator.userAgentData as NavigatorUAData;
      
      if (originalUserAgentData && typeof originalUserAgentData.getHighEntropyValues === 'function') {
        const originalGetHighEntropyValues = originalUserAgentData.getHighEntropyValues.bind(originalUserAgentData);
        
        originalUserAgentData.getHighEntropyValues = async function(hints: string[]): Promise<UADataValues> {
          const realValues = await originalGetHighEntropyValues(hints);
          
          // Return generic values instead of the real ones
          return {
            ...realValues,
            platformVersion: realValues.platformVersion ? '10.0.0' : undefined,
            architecture: realValues.architecture ? 'x86' : undefined,
            bitness: realValues.bitness ? '64' : undefined,
            model: realValues.model ? '' : undefined,
          } as UADataValues;
        };
      }
    }
  }

  // --- Hardware concurrency ---
  // Everyone has 4 cores now

  if (config.protections.hardwareConcurrency) {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4,
      configurable: true,
    });
  }

  // --- Device memory ---
  // Everyone has 8GB RAM

  if (config.protections.deviceMemory) {
    if ('deviceMemory' in navigator) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true,
      });
    }
  }

  // --- Plugins and mimetypes ---
  // Hide what plugins are installed

  if (config.protections.plugins) {
    const emptyPluginArray = {
      length: 0,
      item: () => null,
      namedItem: () => null,
      refresh: () => {},
      [Symbol.iterator]: function* () {},
    };

    const emptyMimeTypeArray = {
      length: 0,
      item: () => null,
      namedItem: () => null,
      [Symbol.iterator]: function* () {},
    };

    Object.defineProperty(navigator, 'plugins', {
      get: () => emptyPluginArray,
      configurable: true,
    });

    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => emptyMimeTypeArray,
      configurable: true,
    });
  }

  // --- Languages ---
  // Everyone speaks American English

  if (config.protections.languages) {
    const normalizedLanguages = ['en-US', 'en'];
    
    Object.defineProperty(navigator, 'languages', {
      get: () => Object.freeze([...normalizedLanguages]),
      configurable: true,
    });

    Object.defineProperty(navigator, 'language', {
      get: () => 'en-US',
      configurable: true,
    });
  }

  // --- Timezone ---
  // Everyone's in California

  if (config.protections.timezone) {
    const OriginalDate = Date;
    const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    const NORMALIZED_OFFSET = 480; // Pacific time
    const NORMALIZED_TIMEZONE = 'America/Los_Angeles';
    
    Date.prototype.getTimezoneOffset = function(): number {
      return NORMALIZED_OFFSET;
    };
    
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = function(
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): Intl.DateTimeFormat {
      const normalizedOptions = {
        ...options,
        timeZone: options?.timeZone || NORMALIZED_TIMEZONE,
      };
      return new OriginalDateTimeFormat(locales, normalizedOptions);
    } as typeof Intl.DateTimeFormat;
    
    Object.setPrototypeOf(Intl.DateTimeFormat, OriginalDateTimeFormat);
    (Intl.DateTimeFormat as unknown as { supportedLocalesOf: typeof OriginalDateTimeFormat.supportedLocalesOf }).supportedLocalesOf = 
      OriginalDateTimeFormat.supportedLocalesOf;
  }

  // --- Tracker beacon blocking ---
  // Silently drop tracking beacons

  if (config.trackerDomains && config.trackerDomains.length > 0) {
    const trackerDomains = config.trackerDomains;
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    
    function isTrackerUrl(urlString: string): boolean {
      try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();
        
        for (const tracker of trackerDomains) {
          if (hostname === tracker || hostname.endsWith('.' + tracker)) {
            return true;
          }
        }
        
        const analyticsPatterns = [
          /google-analytics\.com/i,
          /googletagmanager\.com/i,
          /facebook\.net.*tr/i,
          /pixel\.facebook\.com/i,
          /analytics\./i,
          /collect\?/i,
          /beacon\./i,
          /tracking\./i,
          /telemetry\./i,
          /metrics\./i,
        ];
        
        const fullUrl = urlString.toLowerCase();
        for (const pattern of analyticsPatterns) {
          if (pattern.test(fullUrl)) {
            return true;
          }
        }
        
        return false;
      } catch {
        return false;
      }
    }
    
    (navigator as unknown as { sendBeacon: typeof navigator.sendBeacon }).sendBeacon = function(
      url: string | URL,
      data?: BodyInit | null
    ): boolean {
      const urlString = url.toString();
      
      // Pretend we sent it but actually drop it
      if (isTrackerUrl(urlString)) {
        return true;
      }
      
      return originalSendBeacon(urlString, data);
    };
  }

  // Done - protections are active
})();

// TS declarations for browser APIs
interface NavigatorUAData {
  brands: { brand: string; version: string }[];
  mobile: boolean;
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<UADataValues>;
}

interface UADataValues {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
  model?: string;
  uaFullVersion?: string;
  fullVersionList?: { brand: string; version: string }[];
  wow64?: boolean;
}

declare global {
  interface Navigator {
    userAgentData?: NavigatorUAData;
  }
}

export {};

