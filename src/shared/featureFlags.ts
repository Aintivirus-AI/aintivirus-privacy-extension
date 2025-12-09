import { storage } from './storage';
import { FeatureFlags, FeatureFlagId, DEFAULT_FEATURE_FLAGS } from './types';

export interface FeatureFlagMeta {
  id: FeatureFlagId;
  name: string;
  description: string;
  icon: string;
}


export const FEATURE_FLAG_META: FeatureFlagMeta[] = [
  {
    id: 'privacy',
    name: 'Privacy Features',
    description: 'Cookie cleanup, header protection, and fingerprint blocking',
    icon: 'shield',
  },
  {
    id: 'wallet',
    name: 'Wallet Security',
    description: 'Protect your crypto wallet from scams and phishing sites',
    icon: 'wallet',
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Get alerts when we block something dangerous',
    icon: 'bell',
  },
];

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const flags = await storage.get('featureFlags');
  return flags ?? DEFAULT_FEATURE_FLAGS;
}

export async function getFeatureFlag(id: FeatureFlagId): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[id];
}

export async function setFeatureFlag(id: FeatureFlagId, enabled: boolean): Promise<void> {
  const flags = await getFeatureFlags();
  await storage.set('featureFlags', {
    ...flags,
    [id]: enabled,
  });
}

export async function toggleFeatureFlag(id: FeatureFlagId): Promise<boolean> {
  const current = await getFeatureFlag(id);
  const newValue = !current;
  await setFeatureFlag(id, newValue);
  return newValue;
}

export async function resetFeatureFlags(): Promise<void> {
  await storage.set('featureFlags', DEFAULT_FEATURE_FLAGS);
}

export function onFeatureFlagsChange(
  callback: (flags: FeatureFlags) => void
): () => void {
  return storage.onChange((changes) => {
    if (changes.featureFlags?.newValue) {
      callback(changes.featureFlags.newValue);
    }
  });
}

