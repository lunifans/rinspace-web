import { describe, expect, it } from 'vitest';

import {
  parseAdminWorkspaceCapabilities,
  parseOperationsAuditPage,
  parseOperationsControlStatus,
  parseOperationsEventPage,
  parseOperationsFindings,
  parseOperationsReconciliationResult,
  parseOperationsReplayReview,
} from './operations';

const payload = {
  views: { home: true, content: true, review: false, system: true },
  systemSections: {
    overview: true,
    events: true,
    publishing: true,
    consistency: true,
    records: false,
  },
  capabilities: {
    'operations.control.view': true,
    'operations.audit.view': false,
  },
  features: {
    moderationCasesV2: false,
    reportFeedback: true,
    systemOperations: true,
    controlCommands: false,
  },
};

describe('Admin workspace capability contract', () => {
  it('preserves the server view, section, feature, and capability decisions', () => {
    expect(parseAdminWorkspaceCapabilities(payload)).toEqual(payload);
  });

  it('rejects missing or non-boolean authority fields', () => {
    expect(() => parseAdminWorkspaceCapabilities({ ...payload, views: { ...payload.views, review: 'yes' } })).toThrow(
      'Invalid Admin capability field: review',
    );
    expect(() => parseAdminWorkspaceCapabilities({ ...payload, systemSections: null })).toThrow(
      'Invalid Admin capability field: systemSections',
    );
    expect(() => parseAdminWorkspaceCapabilities({
      ...payload,
      capabilities: { 'operations.control.view': 'true' },
    })).toThrow('Invalid Admin capability field: capabilities.operations.control.view');
  });
});

describe('system operations contracts', () => {
  const status = {
    state: 'available',
    sampledAt: '2026-08-27T00:00:00Z',
    dependencies: { controlPlane: 'available', gitea: 'unknown', renderer: 'unknown', codeServer: 'unknown' },
    events: { inboxPending: 1, inboxQuarantined: 0, inboxOldestAgeSeconds: 2, outboxPending: 3, outboxDead: 0, outboxOldestAgeSeconds: 4, giteaEffectsPending: 5, giteaEffectsDead: 0 },
    publishing: { provisionPending: 1, provisionFailed24h: 0, provisionP95Seconds: 2, publicationActive: 3, publicationFailed24h: 0, publicationDriftOpen: 0, pushObservationP95Seconds: 4, queueWaitP95Seconds: 5, renderDurationP95Seconds: 6, activationDelayP95Seconds: 7 },
    consistency: { branchPolicyDrift: 0, reconciliationRequired: 1, openFindings: 2, manualFindings: 0, reconciliationRepairRatio: 0.5 },
  };

  it('parses non-negative status aggregates and rejects false healthy counts', () => {
    expect(parseOperationsControlStatus(status)).toEqual(status);
    expect(() => parseOperationsControlStatus({ ...status, events: { ...status.events, inboxPending: -1 } })).toThrow('inboxPending');
  });

  it('keeps only the audit read contract', () => {
    expect(parseOperationsAuditPage({
      items: [{
        id: 9, actorKind: 'user', actorUid: 'operator', targetType: 'moderation_case', targetId: '41',
        command: 'moderation.case.defer', reason: '等待证据', state: 'succeeded', externalOperationId: '',
        correlationId: 'correlation-1', parameters: { expectedVersion: 3 }, result: { state: 'deferred' },
        capabilitySnapshot: { role: 'moderator' }, createdAt: '2026-08-27T00:00:00Z',
      }],
      nextCursor: '9',
    })).toMatchObject({ items: [{ id: 9, command: 'moderation.case.defer' }], nextCursor: '9' });
  });

  it('parses the privacy-safe event contract', () => {
    expect(parseOperationsEventPage({
      items: [{
        id: 12, kind: 'inbox', source: 'gitea', eventId: 'event-12', eventType: 'repository.push',
        schemaVersion: '1', state: 'quarantined', attemptCount: 3, lastErrorCode: 'schema_invalid',
        occurredAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:01:00Z',
      }],
      nextCursor: '12',
    })).toMatchObject({ items: [{ id: 12, state: 'quarantined', processedAt: '' }], nextCursor: '12' });
    expect(() => parseOperationsEventPage({ items: [{ kind: 'payload' }] })).toThrow();
  });

  it('drops raw reconciliation values from the frontend contract', () => {
    const findings = parseOperationsFindings({ items: [{
      id: 7, subjectType: 'project', subjectId: '42', checkCode: 'branch_policy', severity: 'warning',
      sourceTier: 'incremental', state: 'open', occurrenceCount: 2, lastSeenAt: '2026-08-27T00:00:00Z',
      expected: { secret: 'not exposed' }, actual: { token: 'not exposed' },
    }] });
    expect(findings).toEqual([{
      id: 7, subjectType: 'project', subjectId: '42', checkCode: 'branch_policy', severity: 'warning',
      sourceTier: 'incremental', state: 'open', occurrenceCount: 2, lastSeenAt: '2026-08-27T00:00:00Z',
    }]);
  });

  it('validates replay review and reconciliation command results', () => {
    expect(parseOperationsReplayReview({
      id: 12, kind: 'inbox', source: 'gitea', eventId: 'event-12', eventType: 'repository.push',
      schemaVersion: '1', state: 'quarantined', attemptCount: 3, lastErrorCode: 'schema_invalid',
      occurredAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:01:00Z', replayable: true,
    })).toMatchObject({ id: 12, replayable: true });
    expect(() => parseOperationsReplayReview({ replayable: 'yes' })).toThrow();

    const result = {
      tier: 'event', examined: 1, differences: 1, repaired: 0, manualRequired: 0, recoverable: 1,
      projectId: 'article:41', impactHash: 'a'.repeat(64), correlationId: 'ops-correlation-1',
    };
    expect(parseOperationsReconciliationResult(result)).toMatchObject(result);
    expect(() => parseOperationsReconciliationResult({ ...result, differences: -1 })).toThrow('differences');
  });
});
