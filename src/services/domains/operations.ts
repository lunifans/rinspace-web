import { requestAdminJson } from '../httpClient';

export const operationsCapability = {
  controlView: 'operations.control.view',
  controlDryRun: 'operations.control.dry_run',
  controlApply: 'operations.control.apply',
  controlRecover: 'operations.control.recover',
  eventReplay: 'operations.control.event_replay',
  rendererOperate: 'operations.control.renderer_operate',
  knowledgeRollback: 'operations.control.knowledge_rollback',
  auditView: 'operations.audit.view',
} as const;

export type AdminSystemSection = 'overview' | 'events' | 'publishing' | 'consistency' | 'records';

export type AdminWorkspaceCapabilitiesResponse = Readonly<{
  views: Readonly<{
    home: boolean;
    content: boolean;
    review: boolean;
    system: boolean;
  }>;
  systemSections: Readonly<Record<AdminSystemSection, boolean>>;
  capabilities: Readonly<Record<string, boolean>>;
  features: Readonly<{
    moderationCasesV2: boolean;
    reportFeedback: boolean;
    systemOperations: boolean;
    controlCommands: boolean;
  }>;
}>;

export type OperationsControlStatus = Readonly<{
  state: string;
  sampledAt: string;
  dependencies: Readonly<Record<'controlPlane' | 'gitea' | 'renderer' | 'codeServer', string>>;
  events: Readonly<{
    inboxPending: number;
    inboxQuarantined: number;
    inboxOldestAgeSeconds: number;
    outboxPending: number;
    outboxDead: number;
    outboxOldestAgeSeconds: number;
    giteaEffectsPending: number;
    giteaEffectsDead: number;
  }>;
  publishing: Readonly<{
    provisionPending: number;
    provisionFailed24h: number;
    provisionP95Seconds: number;
    publicationActive: number;
    publicationFailed24h: number;
    publicationDriftOpen: number;
    pushObservationP95Seconds: number;
    queueWaitP95Seconds: number;
    renderDurationP95Seconds: number;
    activationDelayP95Seconds: number;
  }>;
  consistency: Readonly<{
    branchPolicyDrift: number;
    reconciliationRequired: number;
    openFindings: number;
    manualFindings: number;
    reconciliationRepairRatio: number;
  }>;
}>;

export type OperationsAuditItem = Readonly<{
  id: number;
  actorKind: string;
  actorUid: string;
  targetType: string;
  targetId: string;
  command: string;
  reason: string;
  state: string;
  externalOperationId: string;
  correlationId: string;
  parameters: Readonly<Record<string, unknown>>;
  result: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

export type OperationsAuditPage = Readonly<{
  items: readonly OperationsAuditItem[];
  nextCursor: string;
}>;

export type OperationsEventItem = Readonly<{
  id: number;
  kind: 'inbox' | 'outbox' | 'gitea_effect';
  source: string;
  eventId: string;
  eventType: string;
  schemaVersion: string;
  state: string;
  attemptCount: number;
  lastErrorCode: string;
  occurredAt: string;
  processedAt: string;
  updatedAt: string;
}>;

export type OperationsEventPage = Readonly<{ items: readonly OperationsEventItem[]; nextCursor: string }>;

export type OperationsReplayReview = OperationsEventItem & Readonly<{ replayable: boolean }>;

export type OperationsReconciliationResult = Readonly<{
  tier: 'event';
  examined: number;
  differences: number;
  repaired: number;
  manualRequired: number;
  recoverable: number;
  nextCursor: string;
  projectId: string;
  impactHash: string;
  correlationId: string;
}>;

export type OperationsFindingItem = Readonly<{
  id: number;
  subjectType: string;
  subjectId: string;
  checkCode: string;
  severity: string;
  sourceTier: string;
  state: string;
  occurrenceCount: number;
  lastSeenAt: string;
}>;

function objectRecord(value: unknown, field: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid Admin capability field: ${field}`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function booleanField(record: Readonly<Record<string, unknown>>, field: string) {
  const value = record[field];
  if (typeof value !== 'boolean') throw new Error(`Invalid Admin capability field: ${field}`);
  return value;
}

function booleanMap(value: unknown, field: string): Readonly<Record<string, boolean>> {
  const record = objectRecord(value, field);
  const result: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'boolean') throw new Error(`Invalid Admin capability field: ${field}.${key}`);
    result[key] = item;
  }
  return result;
}

function stringField(record: Readonly<Record<string, unknown>>, field: string) {
  const value = record[field];
  if (typeof value !== 'string') throw new Error(`Invalid operations field: ${field}`);
  return value;
}

function numberField(record: Readonly<Record<string, unknown>>, field: string) {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid operations field: ${field}`);
  return value;
}

export function parseOperationsControlStatus(value: unknown): OperationsControlStatus {
  const root = objectRecord(value, 'status');
  const dependencies = objectRecord(root.dependencies, 'dependencies');
  const events = objectRecord(root.events, 'events');
  const publishing = objectRecord(root.publishing, 'publishing');
  const consistency = objectRecord(root.consistency, 'consistency');
  return {
    state: stringField(root, 'state'),
    sampledAt: stringField(root, 'sampledAt'),
    dependencies: {
      controlPlane: stringField(dependencies, 'controlPlane'),
      gitea: stringField(dependencies, 'gitea'),
      renderer: stringField(dependencies, 'renderer'),
      codeServer: stringField(dependencies, 'codeServer'),
    },
    events: {
      inboxPending: numberField(events, 'inboxPending'),
      inboxQuarantined: numberField(events, 'inboxQuarantined'),
      inboxOldestAgeSeconds: numberField(events, 'inboxOldestAgeSeconds'),
      outboxPending: numberField(events, 'outboxPending'),
      outboxDead: numberField(events, 'outboxDead'),
      outboxOldestAgeSeconds: numberField(events, 'outboxOldestAgeSeconds'),
      giteaEffectsPending: numberField(events, 'giteaEffectsPending'),
      giteaEffectsDead: numberField(events, 'giteaEffectsDead'),
    },
    publishing: {
      provisionPending: numberField(publishing, 'provisionPending'),
      provisionFailed24h: numberField(publishing, 'provisionFailed24h'),
      provisionP95Seconds: numberField(publishing, 'provisionP95Seconds'),
      publicationActive: numberField(publishing, 'publicationActive'),
      publicationFailed24h: numberField(publishing, 'publicationFailed24h'),
      publicationDriftOpen: numberField(publishing, 'publicationDriftOpen'),
      pushObservationP95Seconds: numberField(publishing, 'pushObservationP95Seconds'),
      queueWaitP95Seconds: numberField(publishing, 'queueWaitP95Seconds'),
      renderDurationP95Seconds: numberField(publishing, 'renderDurationP95Seconds'),
      activationDelayP95Seconds: numberField(publishing, 'activationDelayP95Seconds'),
    },
    consistency: {
      branchPolicyDrift: numberField(consistency, 'branchPolicyDrift'),
      reconciliationRequired: numberField(consistency, 'reconciliationRequired'),
      openFindings: numberField(consistency, 'openFindings'),
      manualFindings: numberField(consistency, 'manualFindings'),
      reconciliationRepairRatio: numberField(consistency, 'reconciliationRepairRatio'),
    },
  };
}

export function parseOperationsAuditPage(value: unknown): OperationsAuditPage {
  const root = objectRecord(value, 'audit');
  if (!Array.isArray(root.items)) throw new Error('Invalid operations field: items');
  const items = root.items.map((candidate) => {
    const item = objectRecord(candidate, 'audit item');
    const id = numberField(item, 'id');
    const parameters = objectRecord(item.parameters, 'parameters');
    const result = objectRecord(item.result, 'result');
    return {
      id,
      actorKind: stringField(item, 'actorKind'),
      actorUid: stringField(item, 'actorUid'),
      targetType: stringField(item, 'targetType'),
      targetId: stringField(item, 'targetId'),
      command: stringField(item, 'command'),
      reason: stringField(item, 'reason'),
      state: stringField(item, 'state'),
      externalOperationId: stringField(item, 'externalOperationId'),
      correlationId: stringField(item, 'correlationId'),
      parameters,
      result,
      createdAt: stringField(item, 'createdAt'),
    };
  });
  return { items, nextCursor: typeof root.nextCursor === 'string' ? root.nextCursor : '' };
}

export function parseOperationsEventPage(value: unknown): OperationsEventPage {
  const root = objectRecord(value, 'events');
  if (!Array.isArray(root.items)) throw new Error('Invalid operations field: items');
  const items = root.items.map((candidate) => {
    const item = objectRecord(candidate, 'event item');
    const kind = stringField(item, 'kind');
    if (kind !== 'inbox' && kind !== 'outbox' && kind !== 'gitea_effect') throw new Error('Invalid operations field: kind');
    return {
      id: numberField(item, 'id'),
      kind: kind as OperationsEventItem['kind'],
      source: stringField(item, 'source'),
      eventId: stringField(item, 'eventId'),
      eventType: stringField(item, 'eventType'),
      schemaVersion: stringField(item, 'schemaVersion'),
      state: stringField(item, 'state'),
      attemptCount: numberField(item, 'attemptCount'),
      lastErrorCode: stringField(item, 'lastErrorCode'),
      occurredAt: stringField(item, 'occurredAt'),
      processedAt: typeof item.processedAt === 'string' ? item.processedAt : '',
      updatedAt: stringField(item, 'updatedAt'),
    };
  });
  return { items, nextCursor: typeof root.nextCursor === 'string' ? root.nextCursor : '' };
}

export function parseOperationsReplayReview(value: unknown): OperationsReplayReview {
  const item = objectRecord(value, 'event review');
  const page = parseOperationsEventPage({ items: [item] });
  if (typeof item.replayable !== 'boolean') throw new Error('Invalid operations field: replayable');
  return { ...page.items[0], replayable: item.replayable };
}

export function parseOperationsReconciliationResult(value: unknown): OperationsReconciliationResult {
  const root = objectRecord(value, 'reconciliation');
  const tier = stringField(root, 'tier');
  if (tier !== 'event') throw new Error('Invalid operations field: tier');
  return {
    tier,
    examined: numberField(root, 'examined'),
    differences: numberField(root, 'differences'),
    repaired: numberField(root, 'repaired'),
    manualRequired: numberField(root, 'manualRequired'),
    recoverable: numberField(root, 'recoverable'),
    nextCursor: typeof root.nextCursor === 'string' ? root.nextCursor : '',
    projectId: stringField(root, 'projectId'),
    impactHash: stringField(root, 'impactHash'),
    correlationId: stringField(root, 'correlationId'),
  };
}

export function parseOperationsFindings(value: unknown): readonly OperationsFindingItem[] {
  const root = objectRecord(value, 'findings');
  if (!Array.isArray(root.items)) throw new Error('Invalid operations field: items');
  return root.items.map((candidate) => {
    const item = objectRecord(candidate, 'finding item');
    return {
      id: numberField(item, 'id'),
      subjectType: stringField(item, 'subjectType'),
      subjectId: stringField(item, 'subjectId'),
      checkCode: stringField(item, 'checkCode'),
      severity: stringField(item, 'severity'),
      sourceTier: stringField(item, 'sourceTier'),
      state: stringField(item, 'state'),
      occurrenceCount: numberField(item, 'occurrenceCount'),
      lastSeenAt: stringField(item, 'lastSeenAt'),
    };
  });
}

export function parseAdminWorkspaceCapabilities(value: unknown): AdminWorkspaceCapabilitiesResponse {
  const root = objectRecord(value, 'root');
  const views = objectRecord(root.views, 'views');
  const sections = objectRecord(root.systemSections, 'systemSections');
  const features = objectRecord(root.features, 'features');
  return {
    views: {
      home: booleanField(views, 'home'),
      content: booleanField(views, 'content'),
      review: booleanField(views, 'review'),
      system: booleanField(views, 'system'),
    },
    systemSections: {
      overview: booleanField(sections, 'overview'),
      events: booleanField(sections, 'events'),
      publishing: booleanField(sections, 'publishing'),
      consistency: booleanField(sections, 'consistency'),
      records: booleanField(sections, 'records'),
    },
    capabilities: booleanMap(root.capabilities, 'capabilities'),
    features: {
      moderationCasesV2: booleanField(features, 'moderationCasesV2'),
      reportFeedback: booleanField(features, 'reportFeedback'),
      systemOperations: booleanField(features, 'systemOperations'),
      controlCommands: booleanField(features, 'controlCommands'),
    },
  };
}

export async function loadAdminWorkspaceCapabilities() {
  const payload = await requestAdminJson<unknown>('workspace/capabilities', { auth: 'required' });
  return parseAdminWorkspaceCapabilities(payload);
}

export async function loadOperationsControlStatus() {
  return parseOperationsControlStatus(await requestAdminJson<unknown>('control/status', { auth: 'required' }));
}

export async function loadOperationsAuditPage(cursor = '') {
  return parseOperationsAuditPage(await requestAdminJson<unknown>('operations/audit', {
    auth: 'required',
    query: { limit: 50, cursor: cursor || undefined },
  }));
}

export async function loadOperationsEventPage(input: { kind: OperationsEventItem['kind']; state?: string; cursor?: string }) {
  return parseOperationsEventPage(await requestAdminJson<unknown>('control/events', {
    auth: 'required',
    query: { kind: input.kind, state: input.state || undefined, cursor: input.cursor || undefined, limit: 50 },
  }));
}

export async function loadOperationsFindings(state: 'open' | 'manual_required' | 'repaired' | 'ignored' = 'open') {
  return parseOperationsFindings(await requestAdminJson<unknown>('control/findings', {
    auth: 'required',
    query: { state, limit: 100 },
  }));
}

export async function loadOperationsReplayReview(kind: 'inbox', id: number) {
  return parseOperationsReplayReview(await requestAdminJson<unknown>('control/events/replay-review', {
    auth: 'required',
    query: { kind, id },
  }));
}

type OperationsCommandIdentity = Readonly<{ idempotencyKey: string; correlationId: string }>;

export async function replayOperationsEvent(input: Readonly<{ kind: 'inbox'; id: number; reason: string }> & OperationsCommandIdentity) {
  const payload = await requestAdminJson<unknown>('control/events/replay', {
    auth: 'required', method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey, 'X-Correlation-ID': input.correlationId },
    body: { kind: input.kind, id: input.id, reason: input.reason, idempotencyKey: input.idempotencyKey },
  });
  const root = objectRecord(payload, 'event replay');
  if (root.replayed !== true || stringField(root, 'kind') !== input.kind || numberField(root, 'id') !== input.id) {
    throw new Error('Invalid operations event replay response');
  }
}

export async function runOperationsReconciliationDryRun(input: Readonly<{ projectId: string; reason: string }> & OperationsCommandIdentity) {
  return parseOperationsReconciliationResult(await requestAdminJson<unknown>('control/reconciliation/dry-run', {
    auth: 'required', method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey, 'X-Correlation-ID': input.correlationId },
    body: { projectId: input.projectId, reason: input.reason, idempotencyKey: input.idempotencyKey },
  }));
}

export async function applyOperationsReconciliation(input: Readonly<{ projectId: string; impactHash: string; reason: string }> & OperationsCommandIdentity) {
  return parseOperationsReconciliationResult(await requestAdminJson<unknown>('control/reconciliation/apply', {
    auth: 'required', method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey, 'X-Correlation-ID': input.correlationId },
    body: { projectId: input.projectId, impactHash: input.impactHash, reason: input.reason, idempotencyKey: input.idempotencyKey },
  }));
}
