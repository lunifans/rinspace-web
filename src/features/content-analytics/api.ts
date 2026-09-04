import { requestJson } from '@/services/httpClient';

export type CreatorAnalyticsGranularity = 'week' | 'month' | 'year';

export type CreatorAnalyticsPoint = {
  key: string;
  label: string;
  reads: number;
  likes: number;
  favorites: number;
  newFollowers: number;
};

export type ContentReadWorkSummary = {
  id: string;
  slug: string;
  title: string;
  contentType: string;
  reads: number;
};

export type CreatorAnalyticsResponse = {
  granularity: CreatorAnalyticsGranularity;
  period: string;
  start: string;
  end: string;
  cumulativeReads: number;
  periodReads: number;
  readHistoryStart: string;
  topWorks: ContentReadWorkSummary[];
  points: CreatorAnalyticsPoint[];
};

type AnalyticsCacheEntry = {
  expiresAt: number;
  value: CreatorAnalyticsResponse;
};

const analyticsCacheLifetimeMs = 5 * 60 * 1000;
const analyticsCache = new Map<string, AnalyticsCacheEntry>();
const analyticsRequests = new Map<string, Promise<CreatorAnalyticsResponse>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseCreatorAnalyticsResponse(value: unknown): CreatorAnalyticsResponse {
  if (!isRecord(value) || !Array.isArray(value.points)) throw new Error('创作数据格式异常。');
  const granularity = value.granularity;
  if (granularity !== 'week' && granularity !== 'month' && granularity !== 'year') throw new Error('创作数据格式异常。');
  const points = value.points.map((point) => {
    if (!isRecord(point)) throw new Error('创作数据格式异常。');
    const reads = finiteNumber(point.reads);
    const likes = finiteNumber(point.likes);
    const favorites = finiteNumber(point.favorites);
    const newFollowers = finiteNumber(point.newFollowers);
    if (typeof point.key !== 'string' || typeof point.label !== 'string' || reads === null || likes === null || favorites === null || newFollowers === null) {
      throw new Error('创作数据格式异常。');
    }
    return { key: point.key, label: point.label, reads, likes, favorites, newFollowers };
  });
  const topWorks = Array.isArray(value.topWorks) ? value.topWorks.map((work) => {
    if (!isRecord(work)) throw new Error('创作数据格式异常。');
    const reads = finiteNumber(work.reads);
    if (typeof work.id !== 'string' || typeof work.slug !== 'string' || typeof work.title !== 'string' || typeof work.contentType !== 'string' || reads === null) {
      throw new Error('创作数据格式异常。');
    }
    return { id: work.id, slug: work.slug, title: work.title, contentType: work.contentType, reads };
  }) : [];
  if (typeof value.period !== 'string' || typeof value.start !== 'string' || typeof value.end !== 'string') throw new Error('创作数据格式异常。');
  const cumulativeReads = finiteNumber(value.cumulativeReads) ?? 0;
  const periodReads = finiteNumber(value.periodReads) ?? points.reduce((sum, point) => sum + point.reads, 0);
  const readHistoryStart = typeof value.readHistoryStart === 'string' ? value.readHistoryStart : '';
  return {
    granularity,
    period: value.period,
    start: value.start,
    end: value.end,
    cumulativeReads,
    periodReads,
    readHistoryStart,
    topWorks,
    points,
  };
}

function analyticsCacheKey(input: { granularity: CreatorAnalyticsGranularity; period: string }, cacheScope: string) {
  return `${cacheScope.trim()}:${input.granularity}:${input.period}`;
}

export function cachedCreatorAnalytics(
  input: { granularity: CreatorAnalyticsGranularity; period: string },
  cacheScope: string,
) {
  const entry = analyticsCache.get(analyticsCacheKey(input, cacheScope));
  return entry && entry.expiresAt > Date.now() ? entry.value : null;
}

export async function loadCreatorAnalytics(
  input: { granularity: CreatorAnalyticsGranularity; period: string },
  options: { cacheScope: string; force?: boolean },
) {
  const key = analyticsCacheKey(input, options.cacheScope);
  if (!options.force) {
    const cached = cachedCreatorAnalytics(input, options.cacheScope);
    if (cached) return cached;
    const pending = analyticsRequests.get(key);
    if (pending) return pending;
  }

  const request = requestJson<unknown>('creator/analytics', {
    auth: 'required',
    query: input,
  }).then((payload) => {
    const response = parseCreatorAnalyticsResponse(payload);
    analyticsCache.set(key, {
      expiresAt: Date.now() + analyticsCacheLifetimeMs,
      value: response,
    });
    return response;
  }).finally(() => {
    if (analyticsRequests.get(key) === request) analyticsRequests.delete(key);
  });
  analyticsRequests.set(key, request);
  return request;
}
