import { Button } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';

import LoadingState from '@/components/LoadingState';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatDate, formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import {
  cachedCreatorContributions,
  loadCreatorContributions,
  type CreatorContribution,
} from '@/services/domains/creator';
import { recentContributionCalendar, shanghaiDateKeyFromTimestamp } from './creatorInsights';

type CreatorContributionHeatmapProps = {
  username: string;
};

const heatmapSquareSize = 10;
const heatmapCellSize = 12;
const heatmapGridLeft = 28;
const heatmapGridTop = 16;

function contributionLevel(value: number, maximum: number) {
  if (value <= 0 || maximum <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((value / maximum) * 4)));
}

export default function CreatorContributionHeatmap({ username }: CreatorContributionHeatmapProps) {
  const { t } = useFeatureTranslation('creator');
  const locale = useResolvedLocale();
  const initialContributions = cachedCreatorContributions(username);
  const [contributions, setContributions] = useState<CreatorContribution[]>(initialContributions || []);
  const [loading, setLoading] = useState(!initialContributions);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cached = requestVersion === 0 ? cachedCreatorContributions(username) : null;
    if (cached) setContributions(cached);
    setLoading(!cached);
    setError('');
    void loadCreatorContributions(username, { force: requestVersion > 0 })
      .then((items) => {
        if (!cancelled) setContributions(items);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            localizedErrorMessage(reason, 'creator.contributionsLoadFailed'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestVersion, username]);

  const calendar = useMemo(() => recentContributionCalendar(), []);
  const values = useMemo(() => {
    const result = new Map<string, number>();
    contributions.forEach((entry) => {
      const key = shanghaiDateKeyFromTimestamp(entry.timestamp);
      result.set(key, (result.get(key) || 0) + entry.contributions);
    });
    return result;
  }, [contributions]);
  const visibleDays = calendar.days.filter((day) => day.withinRange);
  const total = visibleDays.reduce((sum, day) => sum + (values.get(day.key) || 0), 0);
  const maximum = Math.max(0, ...visibleDays.map((day) => values.get(day.key) || 0));
  const weeks = Array.from(
    { length: Math.ceil(calendar.days.length / 7) },
    (_, index) => calendar.days.slice(index * 7, (index + 1) * 7),
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }),
    [locale],
  );
  let previousMonth = 0;
  const monthLabels = weeks.map((week, index) => {
    const firstVisible = week.find((day) => day.withinRange);
    if (!firstVisible || firstVisible.month === previousMonth) return '';
    previousMonth = firstVisible.month;
    if (index === 0 && firstVisible.day > 14) return '';
    return monthFormatter.format(
      new Date(Date.UTC(2000, firstVisible.month - 1, 1)),
    );
  });
  const heatmapWidth = heatmapGridLeft + (weeks.length * heatmapCellSize) + 2;
  const heatmapHeight = heatmapGridTop + (7 * heatmapCellSize);

  return (
    <section className="creator-heatmap-section" aria-label={t('heatmap.label')}>
      {loading ? <div className="creator-panel-state"><LoadingState variant="compact" /></div> : null}
      {!loading && error ? (
        <div className="creator-panel-state" role="status">
          <span>{error}</span>
          <Button type="button" onClick={() => setRequestVersion((value) => value + 1)}>{t('common.retry')}</Button>
        </div>
      ) : null}
      {!loading && !error ? (
        <div className="creator-heatmap-scroll">
          <div className="creator-heatmap">
            <svg
              className="creator-heatmap-svg"
              viewBox={`0 0 ${heatmapWidth} ${heatmapHeight}`}
              role="img"
              aria-label={t('heatmap.contributions', {
                count: total,
                displayCount: formatNumber(locale, total),
              })}
            >
              <g className="creator-heatmap-months" aria-hidden="true">
                {monthLabels.map((label, index) => (
                  label ? (
                    <text x={heatmapGridLeft + (index * heatmapCellSize)} y={10} key={`${index}:${label}`}>
                      {label}
                    </text>
                  ) : null
                ))}
              </g>
              <g className="creator-heatmap-weekdays" aria-hidden="true">
                {[
                  { index: 0, label: t('heatmap.weekday.monday') },
                  { index: 2, label: t('heatmap.weekday.wednesday') },
                  { index: 4, label: t('heatmap.weekday.friday') },
                ].map((day) => (
                  <text x={0} y={heatmapGridTop + (day.index * heatmapCellSize) + 8} key={day.label}>{day.label}</text>
                ))}
              </g>
              <g className="creator-heatmap-grid" transform={`translate(${heatmapGridLeft}, ${heatmapGridTop})`} aria-hidden="true">
                {weeks.map((week, weekIndex) => (
                  <g transform={`translate(${weekIndex * heatmapCellSize}, 0)`} key={week[0]?.key || weekIndex}>
                    {week.map((day, dayIndex) => {
                      const count = day.withinRange ? values.get(day.key) || 0 : 0;
                      const level = day.withinRange ? contributionLevel(count, maximum) : 'outside';
                      return (
                        <rect
                          className="creator-heatmap-cell"
                          data-level={level}
                          x={0}
                          y={dayIndex * heatmapCellSize}
                          width={heatmapSquareSize}
                          height={heatmapSquareSize}
                          rx={1.5}
                          key={day.key}
                        >
                          {day.withinRange ? (
                            <title>{t('heatmap.dayContributions', {
                              count,
                              date: formatDate(locale, `${day.key}T00:00:00Z`, {
                                dateStyle: 'medium',
                                timeZone: 'UTC',
                              }),
                              displayCount: formatNumber(locale, count),
                            })}</title>
                          ) : null}
                        </rect>
                      );
                    })}
                  </g>
                ))}
              </g>
            </svg>
            <div className="creator-heatmap-footer">
              <span>{t('heatmap.contributions', {
                count: total,
                displayCount: formatNumber(locale, total),
              })}</span>
              <div className="creator-heatmap-legend" aria-hidden="true">
                <span>{t('heatmap.less')}</span>
                {[0, 1, 2, 3, 4].map((level) => <i data-level={level} key={level} />)}
                <span>{t('heatmap.more')}</span>
              </div>
            </div>
            <ol className="rin-sr-only">
              {visibleDays.filter((day) => (values.get(day.key) || 0) > 0).map((day) => (
                <li key={day.key}>{t('heatmap.dayContributions', {
                  count: values.get(day.key) || 0,
                  date: formatDate(locale, `${day.key}T00:00:00Z`, {
                    dateStyle: 'medium',
                    timeZone: 'UTC',
                  }),
                  displayCount: formatNumber(locale, values.get(day.key) || 0),
                })}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  );
}
