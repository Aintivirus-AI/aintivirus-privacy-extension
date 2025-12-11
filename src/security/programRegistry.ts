// Catalog of Solana program metadata/risk levels plus helpers to merge user overrides.
import { ProgramInfo, ProgramRiskLevel } from './types';
import { getCustomProgramSetting } from './storage';

const NATIVE_PROGRAMS: ProgramInfo[] = [
  {
    programId: '11111111111111111111111111111111',
    name: 'System Program',
    description: 'Core Solana system program for creating accounts and transferring SOL',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'Config1111111111111111111111111111111111111',
    name: 'Config Program',
    description: 'Stores configuration data on-chain',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'Stake11111111111111111111111111111111111111',
    name: 'Stake Program',
    description: 'Manages staking operations for validators',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'Vote111111111111111111111111111111111111111',
    name: 'Vote Program',
    description: 'Manages validator voting',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'BPFLoader1111111111111111111111111111111111',
    name: 'BPF Loader (Deprecated)',
    description: 'Original BPF program loader',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'BPFLoader2111111111111111111111111111111111',
    name: 'BPF Loader 2',
    description: 'BPF program loader for deploying programs',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'BPFLoaderUpgradeab1e11111111111111111111111',
    name: 'BPF Upgradeable Loader',
    description: 'Upgradeable program loader',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'Ed25519SigVerify111111111111111111111111111',
    name: 'Ed25519 Signature Verification',
    description: 'Verifies Ed25519 signatures',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'KeccakSecp256k11111111111111111111111111111',
    name: 'Secp256k1 Program',
    description: 'Ethereum signature verification',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'ComputeBudget111111111111111111111111111111',
    name: 'Compute Budget Program',
    description: 'Manages compute unit limits and priority fees',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
  {
    programId: 'AddressLookupTab1e1111111111111111111111111',
    name: 'Address Lookup Table',
    description: 'Manages address lookup tables for versioned transactions',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'system',
    isNative: true,
    lastUpdated: Date.now(),
  },
];

const SPL_PROGRAMS: ProgramInfo[] = [
  {
    programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    name: 'SPL Token Program',
    description: 'Standard token program for fungible tokens',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'token',
    isNative: false,
    website: 'https://spl.solana.com/token',
    lastUpdated: Date.now(),
  },
  {
    programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    name: 'SPL Token 2022',
    description: 'Extended token program with additional features',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'token',
    isNative: false,
    website: 'https://spl.solana.com/token-2022',
    lastUpdated: Date.now(),
  },
  {
    programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    name: 'Associated Token Account',
    description: 'Creates and manages associated token accounts',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'token',
    isNative: false,
    website: 'https://spl.solana.com/associated-token-account',
    lastUpdated: Date.now(),
  },
  {
    programId: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    name: 'Metaplex Token Metadata',
    description: 'NFT metadata standard',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'nft',
    isNative: false,
    website: 'https://www.metaplex.com/',
    lastUpdated: Date.now(),
  },
  {
    programId: 'auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg',
    name: 'Metaplex Token Auth Rules',
    description: 'NFT authorization rules',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'nft',
    isNative: false,
    website: 'https://www.metaplex.com/',
    lastUpdated: Date.now(),
  },
  {
    programId: 'memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
    name: 'Memo Program (v1)',
    description: 'Attach memo data to transactions',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'utility',
    isNative: false,
    lastUpdated: Date.now(),
  },
  {
    programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
    name: 'Memo Program (v2)',
    description: 'Attach memo data to transactions',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'utility',
    isNative: false,
    lastUpdated: Date.now(),
  },
];

const DEFI_PROGRAMS: ProgramInfo[] = [
  {
    programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    name: 'Jupiter Aggregator v6',
    description: 'DEX aggregator for optimal swap routing',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://jup.ag',
    lastUpdated: Date.now(),
  },
  {
    programId: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
    name: 'Jupiter Aggregator v4',
    description: 'DEX aggregator (legacy version)',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://jup.ag',
    lastUpdated: Date.now(),
  },

  {
    programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    name: 'Raydium AMM',
    description: 'Automated market maker for token swaps',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://raydium.io',
    lastUpdated: Date.now(),
  },
  {
    programId: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    name: 'Raydium CLMM',
    description: 'Concentrated liquidity market maker',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://raydium.io',
    lastUpdated: Date.now(),
  },

  {
    programId: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
    name: 'Orca Swap',
    description: 'Token swap protocol',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://www.orca.so',
    lastUpdated: Date.now(),
  },
  {
    programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    name: 'Orca Whirlpools',
    description: 'Concentrated liquidity pools',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://www.orca.so',
    lastUpdated: Date.now(),
  },

  {
    programId: 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD',
    name: 'Marinade Finance',
    description: 'Liquid staking protocol',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://marinade.finance',
    lastUpdated: Date.now(),
  },

  {
    programId: 'Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb',
    name: 'Jito Staking',
    description: 'MEV-enabled liquid staking',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://www.jito.network',
    lastUpdated: Date.now(),
  },

  {
    programId: 'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA',
    name: 'Marginfi',
    description: 'Lending and borrowing protocol',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://marginfi.com',
    lastUpdated: Date.now(),
  },

  {
    programId: 'KLend2g3cP87ber41GdtFjNNEaWnD8Lu3prRvBXfr5H',
    name: 'Kamino Lend',
    description: 'Lending protocol',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://kamino.finance',
    lastUpdated: Date.now(),
  },

  {
    programId: 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
    name: 'Magic Eden v2',
    description: 'NFT marketplace',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'nft',
    isNative: false,
    website: 'https://magiceden.io',
    lastUpdated: Date.now(),
  },

  {
    programId: 'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN',
    name: 'Tensor Swap',
    description: 'NFT AMM and marketplace',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'nft',
    isNative: false,
    website: 'https://www.tensor.trade',
    lastUpdated: Date.now(),
  },

  {
    programId: 'DeJBGdMFa1uynnnKiwrVioatTuHmNLpyFKnmB5kaFdzQ',
    name: 'Phantom Swap',
    description: 'In-wallet swap feature',
    riskLevel: ProgramRiskLevel.VERIFIED,
    category: 'defi',
    isNative: false,
    website: 'https://phantom.app',
    lastUpdated: Date.now(),
  },
];

const MALICIOUS_PROGRAMS: ProgramInfo[] = [];

const PROGRAM_REGISTRY: Map<string, ProgramInfo> = new Map();

function initializeRegistry(): void {
  const allPrograms = [
    ...NATIVE_PROGRAMS,
    ...SPL_PROGRAMS,
    ...DEFI_PROGRAMS,
    ...MALICIOUS_PROGRAMS,
  ];

  for (const program of allPrograms) {
    PROGRAM_REGISTRY.set(program.programId, program);
  }
}

initializeRegistry();

export async function getProgramInfo(programId: string): Promise<ProgramInfo | null> {
  const customSetting = await getCustomProgramSetting(programId);
  if (customSetting) {
    const registryInfo = PROGRAM_REGISTRY.get(programId);
    if (registryInfo) {
      return {
        ...registryInfo,
        riskLevel: customSettingToRiskLevel(customSetting.trustLevel),
        name: customSetting.label || registryInfo.name,
      };
    }

    return {
      programId,
      name: customSetting.label || 'Custom Program',
      description: 'User-configured program',
      riskLevel: customSettingToRiskLevel(customSetting.trustLevel),
      category: 'custom',
      isNative: false,
      lastUpdated: customSetting.addedAt,
    };
  }

  return PROGRAM_REGISTRY.get(programId) || null;
}

export async function getProgramRiskLevel(programId: string): Promise<ProgramRiskLevel> {
  const info = await getProgramInfo(programId);
  return info?.riskLevel || ProgramRiskLevel.UNKNOWN;
}

export async function isProgramVerified(programId: string): Promise<boolean> {
  const riskLevel = await getProgramRiskLevel(programId);
  return riskLevel === ProgramRiskLevel.VERIFIED;
}

export async function isProgramMalicious(programId: string): Promise<boolean> {
  const riskLevel = await getProgramRiskLevel(programId);
  return riskLevel === ProgramRiskLevel.MALICIOUS;
}

export async function isProgramFlagged(programId: string): Promise<boolean> {
  const riskLevel = await getProgramRiskLevel(programId);
  return riskLevel === ProgramRiskLevel.FLAGGED;
}

export function getProgramsByRiskLevel(riskLevel: ProgramRiskLevel): ProgramInfo[] {
  return Array.from(PROGRAM_REGISTRY.values()).filter((p) => p.riskLevel === riskLevel);
}

export function getProgramsByCategory(category: string): ProgramInfo[] {
  return Array.from(PROGRAM_REGISTRY.values()).filter((p) => p.category === category);
}

export function getNativePrograms(): ProgramInfo[] {
  return Array.from(PROGRAM_REGISTRY.values()).filter((p) => p.isNative);
}

export function getVerifiedDefiPrograms(): ProgramInfo[] {
  return Array.from(PROGRAM_REGISTRY.values()).filter(
    (p) => p.category === 'defi' && p.riskLevel === ProgramRiskLevel.VERIFIED,
  );
}

export function searchPrograms(query: string): ProgramInfo[] {
  const lowerQuery = query.toLowerCase();
  return Array.from(PROGRAM_REGISTRY.values()).filter(
    (p) => p.name.toLowerCase().includes(lowerQuery) || p.programId.includes(query),
  );
}

export function getKnownProgramCount(): number {
  return PROGRAM_REGISTRY.size;
}

export function isSystemProgram(programId: string): boolean {
  return programId === '11111111111111111111111111111111';
}

export function isTokenProgram(programId: string): boolean {
  return (
    programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
    programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  );
}

export function isAssociatedTokenProgram(programId: string): boolean {
  return programId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
}

export function isComputeBudgetProgram(programId: string): boolean {
  return programId === 'ComputeBudget111111111111111111111111111111';
}

function customSettingToRiskLevel(trustLevel: 'trusted' | 'neutral' | 'blocked'): ProgramRiskLevel {
  switch (trustLevel) {
    case 'trusted':
      return ProgramRiskLevel.VERIFIED;
    case 'blocked':
      return ProgramRiskLevel.MALICIOUS;
    default:
      return ProgramRiskLevel.UNKNOWN;
  }
}

export function getRiskLevelDescription(riskLevel: ProgramRiskLevel): string {
  switch (riskLevel) {
    case ProgramRiskLevel.VERIFIED:
      return 'This program is recognized and commonly used. However, this does not guarantee safety.';
    case ProgramRiskLevel.UNKNOWN:
      return 'This program is not in our registry. Exercise caution and verify independently.';
    case ProgramRiskLevel.FLAGGED:
      return 'This program has been flagged as potentially suspicious. Proceed with extreme caution.';
    case ProgramRiskLevel.MALICIOUS:
      return 'This program has been reported as malicious. Interacting with it may result in loss of funds.';
    default:
      return 'Unknown risk level.';
  }
}

export function getRiskLevelColor(riskLevel: ProgramRiskLevel): string {
  switch (riskLevel) {
    case ProgramRiskLevel.VERIFIED:
      return 'success';
    case ProgramRiskLevel.UNKNOWN:
      return 'warning';
    case ProgramRiskLevel.FLAGGED:
      return 'warning';
    case ProgramRiskLevel.MALICIOUS:
      return 'error';
    default:
      return 'default';
  }
}
