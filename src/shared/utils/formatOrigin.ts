export interface FormattedOrigin {
  displayHost: string;
  asciiHost: string;
  etldPlusOne: string;
  isIDN: boolean;
  isSuspicious: boolean;
  fullOrigin: string;
  protocol: string;
  port: string;
}

const SCRIPT_RANGES = {
  latin: /[a-zA-Z]/,
  cyrillic: /[\u0400-\u04FF]/,
  greek: /[\u0370-\u03FF]/,
  hebrew: /[\u0590-\u05FF]/,
  arabic: /[\u0600-\u06FF]/,
  cjk: /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F]/,
};

const CONFUSABLES: Record<string, string> = {
  а: 'a',
  с: 'c',
  е: 'e',
  о: 'o',
  р: 'p',
  х: 'x',
  у: 'y',
  А: 'A',
  В: 'B',
  С: 'C',
  Е: 'E',
  Н: 'H',
  К: 'K',
  М: 'M',
  О: 'O',
  Р: 'P',
  Т: 'T',
  Х: 'X',
  ο: 'o',
  α: 'a',
  ε: 'e',
  ι: 'i',
  ν: 'v',
  τ: 't',
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  Ζ: 'Z',
};

function containsNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

function isPunycode(hostname: string): boolean {
  return hostname.toLowerCase().includes('xn--');
}

function detectScripts(str: string): string[] {
  const detected: string[] = [];

  for (const [script, pattern] of Object.entries(SCRIPT_RANGES)) {
    if (pattern.test(str)) {
      detected.push(script);
    }
  }

  return detected;
}

function hasMixedScripts(hostname: string): boolean {
  const scripts = detectScripts(hostname);

  const hasSuspiciousMix =
    scripts.includes('latin') && (scripts.includes('cyrillic') || scripts.includes('greek'));

  return hasSuspiciousMix;
}

function containsConfusables(hostname: string): boolean {
  for (const char of hostname) {
    if (char in CONFUSABLES) {
      return true;
    }
  }
  return false;
}

function extractEtldPlusOne(hostname: string): string {
  const parts = hostname.split('.');

  if (parts.length <= 2) {
    return hostname;
  }

  const twoPartTlds = [
    'co.uk',
    'com.au',
    'co.nz',
    'co.jp',
    'or.jp',
    'com.br',
    'org.uk',
    'gov.uk',
    'ac.uk',
    'net.au',
    'org.au',
  ];

  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTlds.includes(lastTwo.toLowerCase())) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

function tryDecodePunycode(hostname: string): string {
  try {
    const url = new URL(`https://${hostname}`);
    return url.hostname;
  } catch {
    return hostname;
  }
}

function tryEncodePunycode(hostname: string): string {
  try {
    const url = new URL(`https://${hostname}`);
    return url.hostname;
  } catch {
    return hostname;
  }
}

export function formatOrigin(origin: string): FormattedOrigin {
  const defaultResult: FormattedOrigin = {
    displayHost: origin,
    asciiHost: origin,
    etldPlusOne: origin,
    isIDN: false,
    isSuspicious: false,
    fullOrigin: origin,
    protocol: '',
    port: '',
  };

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const protocol = url.protocol.replace(':', '');
    const port = url.port;

    const hasNonAscii = containsNonAscii(hostname);
    const hasPunycode = isPunycode(hostname);
    const isIDN = hasNonAscii || hasPunycode;

    let displayHost: string;
    let asciiHost: string;

    if (hasPunycode) {
      displayHost = tryDecodePunycode(hostname);
      asciiHost = hostname;
    } else if (hasNonAscii) {
      displayHost = hostname;
      asciiHost = tryEncodePunycode(hostname);
    } else {
      displayHost = hostname;
      asciiHost = hostname;
    }

    const mixedScripts = hasMixedScripts(displayHost);
    const hasConfusables = containsConfusables(displayHost);
    const isSuspicious = isIDN && (mixedScripts || hasConfusables);

    const etldPlusOne = extractEtldPlusOne(asciiHost);

    return {
      displayHost,
      asciiHost,
      etldPlusOne,
      isIDN,
      isSuspicious,
      fullOrigin: origin,
      protocol,
      port,
    };
  } catch {
    return defaultResult;
  }
}

export function formatOriginSimple(origin: string): string {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return origin;
  }
}

export function shouldShowIdnWarning(origin: string): boolean {
  const formatted = formatOrigin(origin);
  return formatted.isIDN || formatted.isSuspicious;
}
