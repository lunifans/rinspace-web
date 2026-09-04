import type { ContentType, FeedItem } from '@/services/contracts';

export type FeedPresentationSource = Pick<
  FeedItem,
  | 'type'
  | 'createdAt'
  | 'updatedAt'
  | 'publishedAt'
  | 'contentUpdatedAt'
  | 'readCount'
  | 'voteScore'
  | 'answerCount'
  | 'commentCount'
  | 'replyCount'
  | 'favoriteCount'
  | 'likeCount'
  | 'shareCount'
>;

export type FeedMetricKind =
  | 'read'
  | 'vote'
  | 'answer'
  | 'comment'
  | 'reply'
  | 'favorite'
  | 'like'
  | 'share';

export type FeedPresentationMetric = Readonly<{
  kind: FeedMetricKind;
  value: number;
}>;

function displayType(type: ContentType) {
  if (type === 'forum') return 'discussion';
  if (type === 'status') return 'dynamic';
  return type;
}

function finiteMetric(kind: FeedMetricKind, values: readonly unknown[]) {
  const value = values.find((candidate) => (
    typeof candidate === 'number' && Number.isFinite(candidate)
  ));
  return typeof value === 'number' ? { kind, value } : null;
}

export function feedPresentationDate(item: FeedPresentationSource) {
  const raw = item.contentUpdatedAt || item.updatedAt || item.publishedAt || item.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function feedPresentationMetrics(item: FeedPresentationSource) {
  const type = displayType(item.type);
  let metrics: Array<FeedPresentationMetric | null>;

  if (type === 'blog') {
    metrics = [
      finiteMetric('read', [item.readCount]),
      finiteMetric('favorite', [item.favoriteCount]),
      finiteMetric('comment', [item.commentCount]),
    ];
  } else if (type === 'question') {
    metrics = [
      finiteMetric('vote', [item.voteScore]),
      finiteMetric('answer', [item.answerCount]),
      finiteMetric('read', [item.readCount]),
    ];
  } else if (type === 'discussion' || type === 'announcement') {
    metrics = [
      finiteMetric('read', [item.readCount]),
      finiteMetric('reply', [item.replyCount, item.commentCount]),
      finiteMetric('favorite', [item.favoriteCount]),
    ];
  } else if (type === 'dynamic') {
    metrics = [
      finiteMetric('read', [item.readCount]),
      finiteMetric('like', [item.likeCount, item.voteScore]),
      finiteMetric('comment', [item.commentCount]),
      finiteMetric('share', [item.shareCount]),
    ];
  } else {
    metrics = [
      finiteMetric('read', [item.readCount]),
      finiteMetric('favorite', [item.favoriteCount]),
      finiteMetric('comment', [item.commentCount]),
    ];
  }

  return metrics.filter((metric): metric is FeedPresentationMetric => Boolean(metric));
}
