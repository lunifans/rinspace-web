import type {
  AdminSystemSection,
  AdminWorkspaceCapabilitiesResponse,
} from '@/services/domains/operations';
import type { RuntimeAuthSnapshot } from '@/platform/runtime';

import type { AdminView } from './queryState';

export type AdminWorkspaceAccess = Readonly<{
  isAdmin: boolean;
  canManageContent: boolean;
  canReview: boolean;
  canViewSystem: boolean;
  systemSections: Readonly<Record<AdminSystemSection, boolean>>;
  capabilities: Readonly<Record<string, boolean>>;
  features: AdminWorkspaceCapabilitiesResponse['features'];
  allowedViews: readonly AdminView[];
}>;

export type AdminWorkspaceAccessState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; access: AdminWorkspaceAccess }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>;

export type AdminIdentitySignals = Readonly<{
  isAdmin: boolean;
  isModerator: boolean;
}>;

export function adminIdentitySignalsFromAuth(
  snapshot: RuntimeAuthSnapshot,
): AdminIdentitySignals {
  const isAdmin = snapshot.status === 'authenticated' && snapshot.roles.includes('admin');
  return {
    isAdmin,
    isModerator: isAdmin || (
      snapshot.status === 'authenticated' && snapshot.roles.includes('moderator')
    ),
  };
}

export function deriveAdminWorkspaceAccess(
  identity: AdminIdentitySignals,
  capabilities: AdminWorkspaceCapabilitiesResponse,
): AdminWorkspaceAccess {
  const isAdmin = identity.isAdmin || capabilities.views.home;
  const canManageContent = capabilities.views.content;
  const canReview = capabilities.views.review;
  const allowedViews: AdminView[] = [];
  if (capabilities.views.home) allowedViews.push('home');
  if (canManageContent) allowedViews.push('content');
  if (canReview) allowedViews.push('review');
  if (capabilities.views.system) allowedViews.push('system');
  return {
    isAdmin,
    canManageContent,
    canReview,
    canViewSystem: capabilities.views.system,
    systemSections: capabilities.systemSections,
    capabilities: capabilities.capabilities,
    features: capabilities.features,
    allowedViews,
  };
}

function errorStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : 0;
}

export function adminWorkspaceFailureState(error: unknown): AdminWorkspaceAccessState {
  const status = errorStatus(error);
  if (status === 401 || status === 403) return { kind: 'denied' };
  return { kind: 'unavailable' };
}

export function firstAllowedAdminView(access: AdminWorkspaceAccess, requested: AdminView): AdminView | null {
  if (access.allowedViews.includes(requested)) return requested;
  return access.allowedViews[0] ?? null;
}
