import { describe, expect, it } from 'vitest';

import type { FeedItem } from '@/services/contracts';

import { feedPresentationDate, feedPresentationMetrics } from './feedPresentation';

const dynamic: FeedItem = {
  id: 'dynamic-1',
  type: 'status',
  title: 'Authored title',
  author: 'Ada',
  createdAt: '2026-08-26T01:00:00Z',
  contentUpdatedAt: '2026-08-27T02:00:00Z',
  meta: '不应参与日期解析',
  excerpt: 'Authored body',
  tags: [],
  interactions: '999 赞 · 888 评论',
  heat: '服务端中文状态',
  readCount: 12,
  voteScore: 7,
  commentCount: 3,
  shareCount: 1,
};

describe('structured feed presentation', () => {
  it('selects structured timestamps without reading preformatted metadata', () => {
    expect(feedPresentationDate(dynamic)?.toISOString()).toBe('2026-08-27T02:00:00.000Z');
    expect(feedPresentationDate({ ...dynamic, contentUpdatedAt: 'invalid' })).toBeNull();
  });

  it('builds semantic metrics without parsing preformatted interactions', () => {
    expect(feedPresentationMetrics(dynamic)).toEqual([
      { kind: 'read', value: 12 },
      { kind: 'like', value: 7 },
      { kind: 'comment', value: 3 },
      { kind: 'share', value: 1 },
    ]);
  });
});
