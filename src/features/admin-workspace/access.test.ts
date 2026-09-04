import { describe, expect, it } from 'vitest';

import type { RuntimeAuthSnapshot } from '@/platform/runtime';

import {
  adminIdentitySignalsFromAuth,
  adminWorkspaceFailureState,
  deriveAdminWorkspaceAccess,
  firstAllowedAdminView,
} from './access';

const capabilities = {
  capabilities: {},
  views: {
    home: false,
    content: false,
    review: true,
    system: false,
  },
  systemSections: {
    overview: false,
    events: false,
    publishing: false,
    consistency: false,
    records: false,
  },
  features: {
    moderationCasesV2: true,
    reportFeedback: false,
    systemOperations: false,
    controlCommands: false,
  },
};

describe('admin workspace access', () => {
  it('derives administrator and moderator presentation only from the auth snapshot roles', () => {
    const snapshot = (roles: string[]): RuntimeAuthSnapshot => ({
      status: 'authenticated',
      user: null,
      roles,
      capabilities: new Set<never>(),
    });
    expect(adminIdentitySignalsFromAuth(snapshot(['member']))).toEqual({ isAdmin: false, isModerator: false });
    expect(adminIdentitySignalsFromAuth(snapshot(['member', 'moderator']))).toEqual({ isAdmin: false, isModerator: true });
    expect(adminIdentitySignalsFromAuth(snapshot(['member', 'admin']))).toEqual({ isAdmin: true, isModerator: true });
  });

  it('gives administrators all three product views', () => {
    const access = deriveAdminWorkspaceAccess({ isAdmin: true, isModerator: true }, {
      ...capabilities,
      views: { home: true, content: true, review: true, system: false },
    });
    expect(access.allowedViews).toEqual(['home', 'content', 'review']);
    expect(access.canManageContent).toBe(true);
    expect(access.canReview).toBe(true);
  });

  it('keeps a review-only member inside the review view', () => {
    const access = deriveAdminWorkspaceAccess({ isAdmin: false, isModerator: false }, capabilities);
    expect(access.allowedViews).toEqual(['review']);
    expect(firstAllowedAdminView(access, 'home')).toBe('review');
  });

  it('adds system only when the server enables the system view', () => {
    const access = deriveAdminWorkspaceAccess({ isAdmin: false, isModerator: false }, {
      ...capabilities,
      views: { home: false, content: false, review: false, system: true },
      systemSections: { ...capabilities.systemSections, records: true },
      features: { ...capabilities.features, systemOperations: true },
    });
    expect(access.allowedViews).toEqual(['system']);
    expect(access.systemSections.records).toBe(true);
  });

  it('does not expand server access from client role signals', () => {
    const deniedByServer = {
      ...capabilities,
      views: { home: false, content: false, review: false, system: false },
    };
    expect(deriveAdminWorkspaceAccess({ isAdmin: false, isModerator: true }, deniedByServer).allowedViews).toEqual([]);
  });

  it('maps refusal separately from service failure', () => {
    expect(adminWorkspaceFailureState({ status: 403 })).toEqual({ kind: 'denied' });
    expect(adminWorkspaceFailureState(new Error('network unavailable'))).toEqual({ kind: 'unavailable' });
  });
});
