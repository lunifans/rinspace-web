import type { RuntimeAuthSnapshot } from '@/platform/runtime';

export const demoMemberId = 'demo-user-member';
export const demoProfilePreferenceKey = 'demo.profile.member.v1';
export const demoInterfacePreferenceKey = 'demo.interface.member.v1';
export const demoNotificationPreferenceKey = 'demo.notifications.member.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function demoProfileIdentityFromPreference(
  value: unknown,
): Partial<NonNullable<RuntimeAuthSnapshot['user']>> | null {
  if (!isRecord(value)) return null;
  const username = optionalString(value.username).trim();
  const displayName = optionalString(value.nickname).trim();
  if (!username || !displayName) return null;
  return {
    username,
    publicUserId: username,
    displayName,
    avatarUrl: optionalString(value.avatarDataUrl) || null,
  };
}

export function demoInterfaceIdentityFromPreference(
  value: unknown,
): Pick<NonNullable<RuntimeAuthSnapshot['user']>, 'language' | 'colorScheme'> | null {
  if (!isRecord(value)) return null;
  const language = optionalString(value.language).trim();
  const colorScheme = optionalString(value.color_scheme).trim();
  if (!language || !colorScheme) return null;
  return { language, colorScheme };
}
