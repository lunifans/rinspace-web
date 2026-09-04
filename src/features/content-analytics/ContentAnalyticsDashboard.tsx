import { Button, Select, Tabs, TabsList, TabsTrigger } from 'components/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';

import LoadingState from '@/components/LoadingState';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatDate, formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import {
  cachedCreatorAnalytics,
  loadCreatorAnalytics,
  type CreatorAnalyticsGranularity,
  type CreatorAnalyticsPoint,
  type CreatorAnalyticsResponse,
} from './api';
import { contentPath } from '@/utils/routes';
import {
  creatorAnalyticsPointLabel,
  creatorPeriodDescriptor,
  creatorPeriodValues,
  currentCreatorPeriod,
  shiftCreatorPeriod,
} from './periods';

type MetricKey = 'reads' | 'likes' | 'favorites' | 'newFollowers';

const chartMetrics: Array<{ key: MetricKey; color: string }> = [
  { key: 'reads', color: '#2b577a' },
  { key: 'likes', color: '#b1493d' },
  { key: 'favorites', color: '#a56b16' },
  { key: 'newFollowers', color: '#2f7d65' },
];

const chartWidth = 960;
const chartHeight = 360;
const chartPadding = { top: 22, right: 24, bottom: 46, left: 58 };

type ContentAnalyticsDashboardProps = {
  userId: string;
  granularity: CreatorAnalyticsGranularity;
  period: string;
  createdAt: number;
  onGranularityChange(granularity: CreatorAnalyticsGranularity): void;
  onPeriodChange(period: string): void;
};

function linePath(
  points: CreatorAnalyticsPoint[],
  metric: MetricKey,
  x: (index: number) => number,
  y: (value: number) => number,
  available: (point: CreatorAnalyticsPoint) => boolean,
) {
  let started = false;
  return points.map((point, index) => {
    if (!available(point)) return '';
    const command = started ? 'L' : 'M';
    started = true;
    return `${command} ${x(index).toFixed(2)} ${y(point[metric]).toFixed(2)}`;
  }).filter(Boolean).join(' ');
}

function chartTickValues(minimum: number, maximum: number) {
  return Array.from({ length: 5 }, (_, index) => maximum - (((maximum - minimum) * index) / 4));
}

function formatTick(locale: 'zh-CN' | 'en', value: number) {
  const rounded = Math.round(value);
  return formatNumber(
    locale,
    rounded,
    Math.abs(rounded) >= 10_000
      ? { notation: 'compact', maximumFractionDigits: 1 }
      : undefined,
  );
}

export default function ContentAnalyticsDashboard({
  userId,
  granularity,
  period,
  createdAt,
  onGranularityChange,
  onPeriodChange,
}: ContentAnalyticsDashboardProps) {
  const { t } = useFeatureTranslation('creator');
  const locale = useResolvedLocale();
  const initialData = cachedCreatorAnalytics({ granularity, period }, userId);
  const [data, setData] = useState<CreatorAnalyticsResponse | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<MetricKey>>(() => new Set(chartMetrics.map((metric) => metric.key)));
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = cachedCreatorAnalytics({ granularity, period }, userId);
    setData(cached);
    setLoading(!cached);
    setError('');
    setHoveredIndex(null);
    void loadCreatorAnalytics({ granularity, period }, { cacheScope: userId })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        const previousPeriod = shiftCreatorPeriod(granularity, period, -1);
        const hasPreviousPeriod = creatorPeriodValues(granularity, createdAt)
          .some((value) => value === previousPeriod);
        if (hasPreviousPeriod) {
          void loadCreatorAnalytics(
            { granularity, period: previousPeriod },
            { cacheScope: userId },
          ).catch(() => undefined);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            localizedErrorMessage(reason, 'creator.analyticsLoadFailed'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createdAt, granularity, period, requestVersion, userId]);

  const periodLabel = useCallback((value: string) => {
    const descriptor = creatorPeriodDescriptor(granularity, value);
    if (!descriptor) return value;
    if (granularity === 'week' && descriptor.week) {
      return t('analytics.period.weekLabel', {
        year: descriptor.year,
        week: descriptor.week,
        start: formatDate(locale, descriptor.start, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
        end: formatDate(locale, descriptor.end, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
      });
    }
    return formatDate(
      locale,
      descriptor.start,
      granularity === 'month'
        ? { year: 'numeric', month: 'long', timeZone: 'UTC' }
        : { year: 'numeric', timeZone: 'UTC' },
    );
  }, [granularity, locale, t]);
  const options = useMemo(
    () => creatorPeriodValues(granularity, createdAt).map((value) => ({
      value,
      label: periodLabel(value),
    })),
    [createdAt, granularity, periodLabel],
  );
  const current = currentCreatorPeriod(granularity);
  const previous = shiftCreatorPeriod(granularity, period, -1);
  const next = shiftCreatorPeriod(granularity, period, 1);
  const points = data?.points || [];
  const visible = chartMetrics.filter((metric) => visibleMetrics.has(metric.key));
  const readHistoryKey = data?.readHistoryStart
    ? (granularity === 'year' ? data.readHistoryStart.slice(0, 7) : data.readHistoryStart)
    : '';
  const metricAvailable = (point: CreatorAnalyticsPoint, metric: MetricKey) => (
    metric !== 'reads' || !readHistoryKey || point.key >= readHistoryKey
  );
  const values = points.flatMap((point) => visible
    .filter((metric) => metricAvailable(point, metric.key))
    .map((metric) => point[metric.key]));
  const rawMinimum = Math.min(0, ...values);
  const rawMaximum = Math.max(0, ...values);
  const span = Math.max(1, rawMaximum - rawMinimum);
  const minimum = rawMinimum < 0 ? rawMinimum - (span * 0.08) : 0;
  const maximum = rawMaximum > 0 ? rawMaximum + (span * 0.08) : 1;
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const x = (index: number) => chartPadding.left + ((points.length <= 1 ? 0 : index / (points.length - 1)) * plotWidth);
  const y = (value: number) => chartPadding.top + (((maximum - value) / (maximum - minimum)) * plotHeight);
  const xLabelStep = points.length <= 12 ? 1 : Math.ceil(points.length / 7);
  const hovered = hoveredIndex === null ? null : points[hoveredIndex];

  const toggleMetric = (metric: MetricKey) => {
    setVisibleMetrics((currentMetrics) => {
      if (currentMetrics.has(metric) && currentMetrics.size === 1) return currentMetrics;
      const nextMetrics = new Set(currentMetrics);
      if (nextMetrics.has(metric)) nextMetrics.delete(metric);
      else nextMetrics.add(metric);
      return nextMetrics;
    });
  };

  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!points.length || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const index = Math.max(0, Math.min(points.length - 1, Math.round(((relativeX - chartPadding.left) / plotWidth) * (points.length - 1))));
    setHoveredIndex(index);
  };

  return (
    <section className="creator-analytics-panel" aria-labelledby="creator-trend-heading">
      <div className="creator-analytics-toolbar">
        <Tabs value={granularity} onValueChange={(value) => onGranularityChange(value as CreatorAnalyticsGranularity)}>
          <TabsList className="creator-period-tabs" aria-label={t('analytics.period.label')}>
            <TabsTrigger value="week">{t('analytics.period.week')}</TabsTrigger>
            <TabsTrigger value="month">{t('analytics.period.month')}</TabsTrigger>
            <TabsTrigger value="year">{t('analytics.period.year')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="creator-period-picker">
          <Button type="button" aria-label={t('analytics.period.previous')} title={t('analytics.period.previous')} onClick={() => onPeriodChange(previous)}>‹</Button>
          <Select value={period} aria-label={t('analytics.period.select')} onChange={(event) => onPeriodChange(event.currentTarget.value)}>
            {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </Select>
          <Button type="button" aria-label={t('analytics.period.next')} title={t('analytics.period.next')} disabled={next > current} onClick={() => onPeriodChange(next)}>›</Button>
        </div>
      </div>

      <div className="creator-read-summary" aria-label={t('analytics.summary.label')}>
        <dl>
          <dt>{t('analytics.summary.cumulativeReads')}</dt>
          <dd>{formatNumber(locale, data?.cumulativeReads || 0)}</dd>
        </dl>
        <dl>
          <dt>{t('analytics.summary.periodReads')}</dt>
          <dd>{formatNumber(locale, data?.periodReads || 0)}</dd>
        </dl>
      </div>

      <div className="creator-chart-heading">
        <h2 id="creator-trend-heading">{periodLabel(period)}</h2>
        <div className="creator-chart-legend" aria-label={t('analytics.metrics.label')}>
          {chartMetrics.map((metric) => {
            const active = visibleMetrics.has(metric.key);
            const total = points.reduce((sum, point) => sum + point[metric.key], 0);
            return (
              <Button type="button" aria-pressed={active} className={active ? 'is-active' : ''} onClick={() => toggleMetric(metric.key)} key={metric.key}>
                <i style={{ backgroundColor: metric.color }} />
                <span>{t(`analytics.metrics.${metric.key}`)}</span>
                <strong>{formatNumber(locale, total)}</strong>
              </Button>
            );
          })}
        </div>
      </div>

      {loading ? <div className="creator-panel-state creator-chart-state"><LoadingState variant="compact" /></div> : null}
      {!loading && error ? (
        <div className="creator-panel-state creator-chart-state" role="status">
          <span>{error}</span>
          <Button type="button" onClick={() => setRequestVersion((value) => value + 1)}>{t('common.retry')}</Button>
        </div>
      ) : null}
      {!loading && !error ? (
        <div className="creator-chart-wrap">
          <svg
            ref={svgRef}
            className="creator-line-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-labelledby="creator-chart-title creator-chart-description"
            onPointerMove={handlePointer}
            onPointerLeave={() => setHoveredIndex(null)}
          >
            <title id="creator-chart-title">{t('analytics.chart.title')}</title>
            <desc id="creator-chart-description">{t('analytics.chart.description')}</desc>
            {chartTickValues(minimum, maximum).map((tick) => (
              <g className="creator-chart-gridline" key={tick}>
                <line x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y(tick)} y2={y(tick)} />
                <text x={chartPadding.left - 12} y={y(tick) + 4}>{formatTick(locale, tick)}</text>
              </g>
            ))}
            <line className="creator-chart-axis" x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y(0)} y2={y(0)} />
            {points.map((point, index) => (
              index % xLabelStep === 0 || index === points.length - 1
                ? <text className="creator-chart-x-label" x={x(index)} y={chartHeight - 16} key={point.key}>{creatorAnalyticsPointLabel(locale, granularity, point.key)}</text>
                : null
            ))}
            {visible.map((metric) => (
              <g key={metric.key}>
                <path
                  className="creator-chart-line"
                  d={linePath(points, metric.key, x, y, (point) => metricAvailable(point, metric.key))}
                  stroke={metric.color}
                />
                {points.length <= 12 ? points.map((point, index) => (
                  metricAvailable(point, metric.key)
                    ? <circle className="creator-chart-point" cx={x(index)} cy={y(point[metric.key])} r="2.8" fill={metric.color} key={point.key} />
                    : null
                )) : null}
              </g>
            ))}
            {hovered && hoveredIndex !== null ? (
              <g className="creator-chart-focus">
                <line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={chartPadding.top} y2={chartHeight - chartPadding.bottom} />
                {visible.map((metric) => (
                  metricAvailable(hovered, metric.key)
                    ? <circle cx={x(hoveredIndex)} cy={y(hovered[metric.key])} r="4" fill={metric.color} key={metric.key} />
                    : null
                ))}
              </g>
            ) : null}
          </svg>
          {hovered && hoveredIndex !== null ? (
            <div className="creator-chart-tooltip" style={{ left: `${(x(hoveredIndex) / chartWidth) * 100}%` }}>
              <strong>{hovered.key}</strong>
              {visible.map((metric) => (
                <span key={metric.key}>
                  <i style={{ backgroundColor: metric.color }} />
                  {t(`analytics.metrics.${metric.key}`)} {metricAvailable(hovered, metric.key) ? formatNumber(locale, hovered[metric.key]) : '—'}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && data && data.topWorks.length > 0 ? (
        <section className="creator-read-sources" aria-labelledby="creator-read-sources-heading">
          <div className="creator-read-sources-heading">
            <h3 id="creator-read-sources-heading">{t('analytics.sources.heading')}</h3>
          </div>
          <ol>
            {data.topWorks.map((work, index) => (
              <li key={work.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <Link to={contentPath(work.contentType, work.id, work.title)}>{work.title || t('analytics.sources.untitled')}</Link>
                <strong>+{formatNumber(locale, work.reads)}</strong>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="rin-sr-only">
        <table>
          <caption>{t('analytics.table.caption', { period: periodLabel(period) })}</caption>
          <thead><tr><th>{t('analytics.table.date')}</th>{chartMetrics.map((metric) => <th key={metric.key}>{t(`analytics.metrics.${metric.key}`)}</th>)}</tr></thead>
          <tbody>{points.map((point) => <tr key={point.key}><th>{point.key}</th>{chartMetrics.map((metric) => <td key={metric.key}>{metricAvailable(point, metric.key) ? point[metric.key] : '—'}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
