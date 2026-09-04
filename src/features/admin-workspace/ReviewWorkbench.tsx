import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Notice,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  Surface,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from 'components/ui';
import {
  loadModerationCaseDetail,
  loadModerationCases,
  reviewModerationCase,
} from '@/services/domains/moderation';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type {
  ModerationCaseDetail,
  ModerationCaseFilterSource,
  ModerationCaseFilterStatus,
  ModerationCaseItem,
  ModerationCaseOperation,
  ModerationDecisionAction,
} from '@/services/contracts';

import {
  adminContentKindLabel,
  adminDateTimeLabel,
  adminReviewDecisionLabel,
  adminReviewOperationImpact,
  adminReviewOperationLabel,
  adminReviewSourceLabel,
  adminReviewStatusLabel,
} from './labels';
import type { AdminWorkspaceQuery } from './queryState';

type ReviewQueryPatch = Partial<Pick<AdminWorkspaceQuery, 'source' | 'status' | 'page' | 'caseId'>>;
type ModerationPage = Awaited<ReturnType<typeof loadModerationCases>>;
type RequestIdentity = Readonly<{ fingerprint: string; idempotencyKey: string; correlationId: string }>;

const pageSize = 20;
const sourceOptions: ModerationCaseFilterSource[] = ['all', 'machine', 'report', 'hybrid'];
const statusOptions: ModerationCaseFilterStatus[] = ['active', 'pending', 'deferred', 'closed'];

function sourceTone(source: ModerationCaseItem['source']): 'neutral' | 'info' | 'warning' {
  if (source === 'report') return 'warning';
  if (source === 'hybrid') return 'info';
  return 'neutral';
}

function errorStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : 0;
}

function requestId() {
  return crypto.randomUUID();
}

function snapshotValue(snapshot: Readonly<Record<string, unknown>>, keys: readonly string[]) {
  for (const key of keys) {
    const value = snapshot[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function ReviewQueueRow({ item, onOpen }: { item: ModerationCaseItem; onOpen(): void }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  const kindLabel = adminContentKindLabel(t, item.contentKind || item.targetType);
  const signals = [
    item.reportCount ? t('review.signals.reports', {
      count: item.reportCount,
      displayCount: formatNumber(locale, item.reportCount),
    }) : '',
    item.score ? t('review.signals.score', { score: formatNumber(locale, item.score) }) : '',
    item.error ? t('review.signals.error') : '',
  ].filter(Boolean);
  return (
    <Button className="admin-review-row" onClick={onOpen} type="button" variant="ghost">
      <span className="admin-review-row-id">#{item.id}</span>
      <span className="admin-review-row-badges">
        <Badge tone={sourceTone(item.source)}>{adminReviewSourceLabel(t, item.source)}</Badge>
        <Badge>{kindLabel}</Badge>
        <Badge tone={item.status === 'deferred' ? 'warning' : 'neutral'}>{adminReviewStatusLabel(t, item.status)}</Badge>
      </span>
      <strong>{item.title || `${kindLabel} #${item.targetId}`}</strong>
      {item.excerpt ? <span className="admin-review-row-excerpt">{item.excerpt}</span> : null}
      <span className="admin-review-row-meta">
        {signals.length ? `${signals.join(' · ')} · ` : ''}{adminDateTimeLabel(locale, item.updatedAt)}
      </span>
    </Button>
  );
}

function ReviewQueue({
  query,
  result,
  loading,
  error,
  onQueryChange,
  onRefresh,
}: {
  query: AdminWorkspaceQuery;
  result: ModerationPage | null;
  loading: boolean;
  error: string;
  onQueryChange(patch: ReviewQueryPatch): void;
  onRefresh(): void;
}) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  const [caseDraft, setCaseDraft] = useState('');
  const openCase = (caseId: number) => {
    sessionStorage.setItem('rinspace-admin-review-scroll', String(window.scrollY));
    onQueryChange({ caseId });
  };
  const submitCase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const caseId = Number(caseDraft.trim());
    if (Number.isSafeInteger(caseId) && caseId > 0) openCase(caseId);
  };
  return (
    <section className="admin-workspace-view admin-review-queue" aria-label={t('review.queue')}>
      <div className="admin-review-counts" aria-label={t('review.caseCounts')}>
        <Badge tone="warning">{t('review.counts.active', { displayCount: formatNumber(locale, result?.counts.active ?? 0) })}</Badge>
        <Badge>{t('review.counts.deferred', { displayCount: formatNumber(locale, result?.counts.deferred ?? 0) })}</Badge>
        <Badge>{t('review.counts.closed', { displayCount: formatNumber(locale, result?.counts.closed ?? 0) })}</Badge>
        <Button className="admin-review-refresh" onClick={onRefresh} disabled={loading}>{t('shared.refresh')}</Button>
      </div>
      <div className="admin-review-toolbar">
        <SegmentedControl
          label={t('review.caseStatus')}
          value={query.status}
          items={statusOptions.map((value) => ({ value, label: adminReviewStatusLabel(t, value) }))}
          onValueChange={(status) => onQueryChange({ status })}
        />
        <Select
          aria-label={t('review.caseSource')}
          value={query.source}
          onChange={(event) => onQueryChange({ source: event.currentTarget.value as ModerationCaseFilterSource })}
        >
          {sourceOptions.map((value) => <option key={value} value={value}>{adminReviewSourceLabel(t, value)}</option>)}
        </Select>
        <form className="admin-review-id-search" onSubmit={submitCase}>
          <Input aria-label={t('review.caseId')} inputMode="numeric" value={caseDraft} onChange={(event) => setCaseDraft(event.currentTarget.value)} placeholder={t('review.caseId')} />
          <Button type="submit" disabled={!/^\d+$/.test(caseDraft.trim())}>{t('shared.open')}</Button>
        </form>
      </div>
      {error ? <Notice tone="destructive" title={t('review.queueLoadFailed')}>{error}</Notice> : null}
      {loading && !result ? <div className="admin-review-skeletons"><Skeleton /><Skeleton /><Skeleton /></div> : null}
      {result?.items.length ? (
        <div className="admin-review-list">
          {result.items.map((item) => <ReviewQueueRow item={item} key={item.id} onOpen={() => openCase(item.id)} />)}
        </div>
      ) : !loading && !error ? <EmptyState title={t('review.empty')} /> : null}
      {result ? (
        <Pagination page={query.page} pageCount={Math.max(1, Math.ceil(result.count / pageSize))} onPageChange={(page) => onQueryChange({ page })} />
      ) : null}
    </section>
  );
}

function CaseEvidence({ detail }: { detail: ModerationCaseDetail }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  const tabs = [
    detail.machineEvidence.length ? 'machine' : '',
    detail.case.reports.length || detail.reasonDistribution.length ? 'reports' : '',
    detail.timeline.length ? 'timeline' : '',
  ].filter(Boolean);
  if (!tabs.length) return null;
  return (
    <Tabs defaultValue={tabs[0]}>
      <TabsList aria-label={t('review.evidence')}>
        {detail.machineEvidence.length ? <TabsTrigger value="machine">{t('review.evidenceTabs.machine')}</TabsTrigger> : null}
        {detail.case.reports.length || detail.reasonDistribution.length ? <TabsTrigger value="reports">{t('review.evidenceTabs.reports')}</TabsTrigger> : null}
        {detail.timeline.length ? <TabsTrigger value="timeline">{t('review.evidenceTabs.timeline')}</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="machine">
        <div className="admin-review-evidence-list">
          {detail.machineEvidence.map((item) => (
            <article key={item.id}>
              <div><Badge tone="info">{item.provider}</Badge><Badge>{item.decision}</Badge><Badge>{formatNumber(locale, item.score)}</Badge></div>
              <strong>{[item.label, item.subLabel].filter(Boolean).join(' / ')}</strong>
              {item.excerpt ? <p>{item.excerpt}</p> : null}
              <time>{adminDateTimeLabel(locale, item.createdAt)}</time>
            </article>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="reports">
        <div className="admin-review-evidence-list">
          {detail.reasonDistribution.map((item) => (
            <article key={item.reasonKey}><strong>{item.reasonLabel}</strong><Badge tone="warning">{formatNumber(locale, item.count)}</Badge></article>
          ))}
          {detail.case.reports.map((report) => (
            <article key={report.id}>
              <strong>{report.reasonLabel}</strong>
              {report.content ? <p>{report.content}</p> : null}
              <time>{adminDateTimeLabel(locale, report.createdAt)}</time>
            </article>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="timeline">
        <ol className="admin-review-timeline">
          {detail.timeline.map((item) => (
            <li key={item.id}>
              <time>{adminDateTimeLabel(locale, item.createdAt)}</time>
              <strong>{item.action}</strong>
              {item.summary ? <p>{item.summary}</p> : null}
            </li>
          ))}
        </ol>
      </TabsContent>
    </Tabs>
  );
}

function ReviewCase({
  detail,
  loading,
  error,
  conflict,
  submitting,
  completed,
  previousId,
  nextId,
  onOpenCase,
  onBack,
  onSubmit,
}: {
  detail: ModerationCaseDetail | null;
  loading: boolean;
  error: string;
  conflict: string;
  submitting: boolean;
  completed: boolean;
  previousId: number | null;
  nextId: number | null;
  onOpenCase(caseId: number): void;
  onBack(): void;
  onSubmit(action: ModerationCaseOperation, note: string, suspendDuration: string): Promise<void>;
}) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  const [decision, setDecision] = useState<'no_violation' | 'violation' | 'defer' | ''>('');
  const [action, setAction] = useState<ModerationCaseOperation | ''>('');
  const [note, setNote] = useState('');
  const [suspendDuration, setSuspendDuration] = useState('7d');
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    setDecision('');
    setAction('');
    setNote('');
    setSuspendDuration('7d');
    setConfirmOpen(false);
  }, [detail?.case.id]);

  const decisionOption = detail?.decisionOptions.find((item) => item.key === decision) || null;
  const actionOption: ModerationDecisionAction | null = decisionOption?.actions.find((item) => item.operation === action) || null;
  const actionImpact = actionOption && detail
    ? adminReviewOperationImpact(t, actionOption.operation, detail.case.contentKind || detail.case.targetType)
    : '';

  if (completed) return <section className="admin-workspace-view"><EmptyState title={t('review.completed')} action={<Button onClick={onBack}>{t('review.backToQueue')}</Button>} /></section>;
  return (
    <section className="admin-workspace-view admin-review-case" aria-labelledby="admin-review-case-title">
      <div className="admin-review-case-nav">
        <Button onClick={onBack} variant="ghost">{t('review.backToQueue')}</Button>
        <div>
          <Button disabled={!previousId} onClick={() => previousId && onOpenCase(previousId)} variant="ghost">{t('review.previous')}</Button>
          <Button disabled={!nextId} onClick={() => nextId && onOpenCase(nextId)} variant="ghost">{t('review.next')}</Button>
        </div>
      </div>
      {error ? <Notice tone="destructive" title={t('review.caseLoadFailed')}>{error}</Notice> : null}
      {conflict ? <Notice tone="warning" title={t('review.conflict')}>{conflict}</Notice> : null}
      {loading && !detail ? <div className="admin-review-case-loading"><Skeleton /><Skeleton /></div> : null}
      {detail ? (
        <div className="admin-review-case-grid">
          <div className="admin-review-reader">
            <header>
              <div className="admin-review-row-badges">
                <Badge tone={sourceTone(detail.case.source)}>{adminReviewSourceLabel(t, detail.case.source)}</Badge>
                <Badge>{adminContentKindLabel(t, detail.case.contentKind || detail.case.targetType)}</Badge>
                <Badge>{adminReviewStatusLabel(t, detail.case.status)}</Badge>
              </div>
              <span className="admin-review-row-id">#{detail.case.id}</span>
              <h1 id="admin-review-case-title">{detail.case.title || `${adminContentKindLabel(t, detail.case.contentKind || detail.case.targetType)} #${detail.case.targetId}`}</h1>
            </header>
            <Surface className="admin-review-snapshot">
              <h2>{t('review.snapshot')}</h2>
              {snapshotValue(detail.snapshot, ['title']) ? <strong>{snapshotValue(detail.snapshot, ['title'])}</strong> : null}
              <p>{snapshotValue(detail.snapshot, ['body', 'content', 'description', 'excerpt']) || detail.case.excerpt || t('review.snapshotMissing')}</p>
            </Surface>
            <CaseEvidence detail={detail} />
            <Accordion type="single" collapsible>
              <AccordionItem value="technical">
                <AccordionTrigger>{t('review.technical')}</AccordionTrigger>
                <AccordionContent>
                  <dl className="admin-review-technical">
                    <div><dt>{t('review.requestId')}</dt><dd>{detail.case.requestId || '—'}</dd></div>
                    <div><dt>{t('review.payloadSha256')}</dt><dd>{detail.case.payloadSha256 || '—'}</dd></div>
                    <div><dt>{t('review.generatedAt')}</dt><dd>{adminDateTimeLabel(locale, detail.generatedAt)}</dd></div>
                    <div><dt>{t('review.version')}</dt><dd>{detail.case.version}</dd></div>
                  </dl>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <aside className="admin-review-decision" aria-label={t('review.decisionPanel')}>
            <h2>{t('review.decision')}</h2>
            <div className="admin-review-decision-list">
              {detail.decisionOptions.map((item) => (
                <Button
                  aria-pressed={decision === item.key}
                  key={item.key}
                  onClick={() => {
                    setDecision(item.key);
                    setAction('');
                    setConfirmOpen(false);
                  }}
                  variant={decision === item.key ? 'primary' : 'secondary'}
                >
                  {adminReviewDecisionLabel(t, item.key)}
                </Button>
              ))}
            </div>
            {decisionOption ? <h3>{t('review.action')}</h3> : null}
            <div className="admin-review-action-list">
              {decisionOption?.actions.map((item) => (
                <Button
                  aria-pressed={action === item.operation}
                  key={item.operation}
                  onClick={() => {
                    setAction(item.operation);
                    setConfirmOpen(false);
                  }}
                  variant={action === item.operation ? 'primary' : 'secondary'}
                >
                  {adminReviewOperationLabel(t, item.operation)}
                </Button>
              ))}
            </div>
            {action && actionOption ? (
              <>
                <label className="admin-review-note-field">
                  <span>{t('review.basis')}{actionOption.requiresNote ? ' *' : ''}</span>
                  <Textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} rows={5} />
                </label>
                {actionOption.requiresDuration ? (
                  <label className="admin-review-note-field">
                    <span>{t('review.duration')}</span>
                    <Select value={suspendDuration} onChange={(event) => setSuspendDuration(event.currentTarget.value)}>
                      <option value="24h">{t('content.durations.24h')}</option><option value="72h">{t('content.durations.72h')}</option><option value="7d">{t('content.durations.7d')}</option><option value="1m">{t('content.durations.1m')}</option><option value="1y">{t('content.durations.1y')}</option>
                    </Select>
                  </label>
                ) : null}
                {actionImpact ? <Notice tone={actionOption.tone === 'destructive' ? 'destructive' : 'warning'}>{actionImpact}</Notice> : null}
                <Button
                  disabled={actionOption.requiresNote && !note.trim()}
                  onClick={() => {
                    if (actionOption.tone === 'destructive') setConfirmOpen(true);
                    else void onSubmit(action, note.trim(), suspendDuration);
                  }}
                  pending={submitting}
                  variant={actionOption.tone === 'destructive' ? 'destructive' : 'primary'}
                >
                  {t('review.submit')}
                </Button>
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <DialogContent title={t('review.confirmTitle')}>
                    <dl className="admin-review-confirmation">
                      <div><dt>{t('review.confirmation.case')}</dt><dd>#{detail.case.id} {detail.case.title}</dd></div>
                      <div><dt>{t('review.confirmation.decision')}</dt><dd>{decisionOption ? adminReviewDecisionLabel(t, decisionOption.key) : ''}</dd></div>
                      <div><dt>{t('review.confirmation.action')}</dt><dd>{adminReviewOperationLabel(t, actionOption.operation)}</dd></div>
                      <div><dt>{t('review.confirmation.impact')}</dt><dd>{actionImpact}</dd></div>
                    </dl>
                    <div className="admin-review-confirmation-actions">
                      <Button disabled={submitting} onClick={() => setConfirmOpen(false)}>{t('shared.cancel')}</Button>
                      <Button
                        onClick={() => void onSubmit(action, note.trim(), suspendDuration)}
                        pending={submitting}
                        variant="destructive"
                      >
                        {t('review.confirm')}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export function ReviewWorkbench({
  query,
  onQueryChange,
}: {
  query: AdminWorkspaceQuery;
  onQueryChange(patch: ReviewQueryPatch): void;
}) {
  const [result, setResult] = useState<ModerationPage | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [detail, setDetail] = useState<ModerationCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [conflict, setConflict] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const requestIdentityRef = useRef<RequestIdentity | null>(null);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError('');
    try {
      setResult(await loadModerationCases({ source: query.source, status: query.status, page: query.page, pageSize }));
    } catch (error: unknown) {
      setQueueError(localizedErrorMessage(error, 'admin.reviewQueueLoadFailed'));
    } finally {
      setQueueLoading(false);
    }
  }, [query.page, query.source, query.status]);

  const loadCase = useCallback(async (caseId: number) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      setDetail(await loadModerationCaseDetail(caseId));
    } catch (error: unknown) {
      setDetail(null);
      setDetailError(localizedErrorMessage(error, 'admin.reviewCaseLoadFailed'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);
  useEffect(() => {
    setConflict('');
    setCompleted(false);
    requestIdentityRef.current = null;
    if (query.caseId) void loadCase(query.caseId);
    else setDetail(null);
  }, [loadCase, query.caseId]);

  const currentIndex = useMemo(() => result?.items.findIndex((item) => item.id === query.caseId) ?? -1, [query.caseId, result?.items]);
  const previousId = currentIndex > 0 ? result?.items[currentIndex - 1]?.id ?? null : null;
  const nextId = currentIndex >= 0 ? result?.items[currentIndex + 1]?.id ?? null : null;

  const backToQueue = () => {
    onQueryChange({ caseId: null });
    const scroll = Number(sessionStorage.getItem('rinspace-admin-review-scroll') || 0);
    window.requestAnimationFrame(() => window.scrollTo({ top: scroll }));
  };

  const submit = async (action: ModerationCaseOperation, note: string, suspendDuration: string) => {
    if (!detail) return;
    const fingerprint = JSON.stringify({ action, note, suspendDuration: action === 'suspend_user' ? suspendDuration : '' });
    const identity = requestIdentityRef.current?.fingerprint === fingerprint
      ? requestIdentityRef.current
      : { fingerprint, idempotencyKey: requestId(), correlationId: requestId() };
    requestIdentityRef.current = identity;
    setSubmitting(true);
    setConflict('');
    try {
      await reviewModerationCase({
        id: detail.case.id,
        operation: action,
        note,
        expectedVersion: detail.case.version,
        idempotencyKey: identity.idempotencyKey,
        correlationId: identity.correlationId,
        suspendDuration: action === 'suspend_user' ? suspendDuration : undefined,
      });
      requestIdentityRef.current = null;
      const remaining = result?.items.filter((item) => item.id !== detail.case.id) ?? [];
      setResult((current) => current ? {
        ...current,
        count: Math.max(0, current.count - 1),
        items: current.items.filter((item) => item.id !== detail.case.id),
        counts: { ...current.counts, active: Math.max(0, current.counts.active - 1) },
      } : current);
      const successor = currentIndex >= 0 ? remaining[Math.min(currentIndex, remaining.length - 1)] : remaining[0];
      if (successor) onQueryChange({ caseId: successor.id });
      else setCompleted(true);
    } catch (error: unknown) {
      const status = errorStatus(error);
      if (status === 409) {
        setConflict(localizedErrorMessage(null, 'admin.reviewConflict'));
        await loadCase(detail.case.id);
      } else if (status === 404) {
        setResult((current) => current ? { ...current, items: current.items.filter((item) => item.id !== detail.case.id) } : current);
        onQueryChange({ caseId: null });
      } else if (status === 403) {
        setDetail(null);
        setDetailError(localizedErrorMessage(error, 'admin.reviewSubmitFailed'));
      } else {
        setDetailError(localizedErrorMessage(error, 'admin.reviewSubmitFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!query.caseId) {
    return <ReviewQueue query={query} result={result} loading={queueLoading} error={queueError} onQueryChange={onQueryChange} onRefresh={() => void loadQueue()} />;
  }
  return (
    <ReviewCase
      detail={detail}
      loading={detailLoading}
      error={detailError}
      conflict={conflict}
      submitting={submitting}
      completed={completed}
      previousId={previousId}
      nextId={nextId}
      onOpenCase={(caseId) => onQueryChange({ caseId })}
      onBack={backToQueue}
      onSubmit={submit}
    />
  );
}
