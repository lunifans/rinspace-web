import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./phoneAuth', () => ({
  forceRefreshAuthSession: vi.fn(),
  getAuthAccessToken: vi.fn(async () => 'access-token'),
  getAuthDeviceId: vi.fn(() => 'device-id'),
  getStoredSession: vi.fn(() => null),
}));
vi.mock('./httpClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./httpClient')>();
  return { ...actual, requestJson: vi.fn() };
});

import { requestJson, ServiceError } from './httpClient';
import {
  loadModerationCaseDetail,
  ModerationCaseServiceError,
  reviewModerationCase,
} from './feed';

const caseItem = {
  id: 41,
  source: 'hybrid',
  status: 'pending',
  targetScope: 'content',
  targetType: 'blog',
  targetId: 'blog-1',
  contentKind: 'blog',
  actorUid: '',
  actorName: '',
  reportedUid: 'reported-1',
  reportedName: '被举报者',
  title: '案件标题',
  excerpt: '案件摘要',
  provider: 'provider',
  bizType: 'text',
  decision: 'review',
  label: 'abuse',
  subLabel: 'harassment',
  score: 88,
  requestId: 'request-1',
  error: '',
  payloadSha256: 'sha',
  raw: '',
  moderationEventId: 3,
  reportCount: 1,
  reportType: 2,
  reportContent: '举报内容',
  operation: '',
  reviewNote: '',
  reviewedBy: '',
  createdAt: '2026-08-27T01:00:00Z',
  updatedAt: '2026-08-27T01:05:00Z',
  version: 7,
  allowedActions: ['defer', 'ignore_report', 'hide_post'],
  reports: [{
    id: 9,
    reportType: 2,
    reasonKey: 'harassment',
    reasonLabel: '人身攻击',
    reasonVersion: 1,
    content: '补充证据',
    status: 0,
    version: 1,
    createdAt: '2026-08-27T01:00:00Z',
  }],
};

describe('moderation case service', () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
  });

  it('preserves detail evidence, allowed actions, version and redaction', async () => {
    vi.mocked(requestJson).mockResolvedValue({
      case: caseItem,
      decisionOptions: [
        {
          key: 'no_violation',
          label: '未违规',
          actions: [{ operation: 'ignore_report', label: '举报不成立', tone: 'neutral', requiresNote: false, requiresDuration: false }],
        },
        {
          key: 'violation',
          label: '违规',
          actions: [{ operation: 'hide_post', label: '隐藏内容', tone: 'destructive', requiresNote: true, requiresDuration: false, impact: '博客将从公开访问中隐藏。' }],
        },
        {
          key: 'defer',
          label: '暂缓',
          actions: [{ operation: 'defer', label: '暂缓', tone: 'warning', requiresNote: true, requiresDuration: false }],
        },
      ],
      snapshot: { title: '审核时标题', body: '审核时正文' },
      machineEvidence: [{
        id: 3,
        provider: 'provider',
        decision: 'review',
        label: 'abuse',
        score: 88,
        createdAt: '2026-08-27T01:00:00Z',
      }],
      reasonDistribution: [{ reasonKey: 'harassment', reasonLabel: '人身攻击', count: 1 }],
      timeline: [{ id: 'case:41', kind: 'case', action: 'created', createdAt: '2026-08-27T01:00:00Z' }],
      generatedAt: '2026-08-27T01:06:00Z',
    });

    const detail = await loadModerationCaseDetail(41);
    expect(detail.case.version).toBe(7);
    expect(detail.case.allowedActions).toEqual(['defer', 'ignore_report', 'hide_post']);
    expect(detail.decisionOptions[1].actions[0]).toMatchObject({ operation: 'hide_post', requiresNote: true });
    expect(detail.case.reports[0].reporter).toBe('');
    expect(detail.snapshot.title).toBe('审核时标题');
    expect(detail.timeline[0].payload).toEqual({});
  });

  it('sends optimistic concurrency, idempotency and correlation values', async () => {
    vi.mocked(requestJson).mockResolvedValue({
      id: 41,
      status: 'deferred',
      operation: 'defer',
      version: 8,
      correlationId: 'correlation-1',
      reviewedAt: '2026-08-27T01:10:00Z',
    });

    const result = await reviewModerationCase({
      id: 41,
      operation: 'defer',
      note: '需要更多上下文',
      expectedVersion: 7,
      idempotencyKey: 'idempotency-1',
      correlationId: 'correlation-1',
    });
    expect(result.version).toBe(8);
    expect(requestJson).toHaveBeenCalledWith('moderation/cases/41', {
      method: 'PUT',
      auth: 'required',
      headers: {
        'Idempotency-Key': 'idempotency-1',
        'X-Correlation-ID': 'correlation-1',
      },
      body: {
        operation: 'defer',
        note: '需要更多上下文',
        expectedVersion: 7,
        idempotencyKey: 'idempotency-1',
        correlationId: 'correlation-1',
        suspendDuration: '',
      },
    });
  });

  it('keeps conflict status available to the workbench', async () => {
    vi.mocked(requestJson).mockRejectedValue(
      new ServiceError('案件版本已更新', 409, { message: '案件版本已更新' }),
    );
    await expect(reviewModerationCase({
      id: 41,
      operation: 'defer',
      expectedVersion: 7,
      idempotencyKey: 'idempotency-1',
      correlationId: 'correlation-1',
    })).rejects.toMatchObject({ status: 409, message: '案件版本已更新' } satisfies Partial<ModerationCaseServiceError>);
  });
});
