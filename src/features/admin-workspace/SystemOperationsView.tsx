import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Notice,
  Select,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from 'components/ui';
import {
  applyOperationsReconciliation,
  loadOperationsAuditPage,
  loadOperationsControlStatus,
  loadOperationsEventPage,
  loadOperationsFindings,
  loadOperationsReplayReview,
  operationsCapability,
  replayOperationsEvent,
  runOperationsReconciliationDryRun,
  type AdminSystemSection,
  type OperationsAuditItem,
  type OperationsControlStatus,
  type OperationsEventItem,
  type OperationsFindingItem,
  type OperationsReconciliationResult,
  type OperationsReplayReview,
} from '@/services/domains/operations';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';

import type { AdminWorkspaceAccess } from './access';
import {
  adminDateTimeLabel,
  adminDurationLabel,
  adminEventKindLabel,
  adminSystemSectionLabel,
  adminSystemStateLabel,
} from './labels';

const systemSections: AdminSystemSection[] = ['overview', 'events', 'publishing', 'consistency', 'records'];

function commandIdentity(prefix: string) {
  const value = globalThis.crypto.randomUUID();
  return { idempotencyKey: `${prefix}-${value}`, correlationId: `ops-${value}` };
}

function StatusRow({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'success' | 'warning' | 'destructive' }) {
  return <div className="admin-system-row"><strong>{label}</strong><Badge tone={tone}>{value}</Badge></div>;
}

function Overview({ status, onSectionChange }: { status: OperationsControlStatus; onSectionChange(section: AdminSystemSection): void }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  const eventIssues = status.events.inboxQuarantined + status.events.outboxDead + status.events.giteaEffectsDead;
  const publicationIssues = status.publishing.provisionFailed24h + status.publishing.publicationFailed24h + status.publishing.publicationDriftOpen;
  const consistencyIssues = status.consistency.openFindings + status.consistency.manualFindings + status.consistency.branchPolicyDrift;
  const tracks = [
    { key: 'events' as const, value: eventIssues },
    { key: 'publishing' as const, value: publicationIssues },
    { key: 'consistency' as const, value: consistencyIssues },
  ];
  return (
    <div className="admin-system-tracks">
      <StatusRow label={t('system.health.controlPlane')} value={status.dependencies.controlPlane === 'available' ? t('system.health.available') : t('system.health.unknown')} tone={status.dependencies.controlPlane === 'available' ? 'success' : 'warning'} />
      {tracks.map((item) => (
        <Button className="admin-system-track" key={item.key} onClick={() => onSectionChange(item.key)} variant="ghost">
          <strong>{adminSystemSectionLabel(t, item.key)}</strong>
          <span>{formatNumber(locale, item.value)}</span>
          <Badge tone={item.value ? 'warning' : 'success'}>{item.value ? t('system.health.issues') : t('system.health.healthy')}</Badge>
        </Button>
      ))}
    </div>
  );
}

function Events({ status, items, kind, nextCursor, loading, canReplay, onReplay, onKindChange, onMore }: { status: OperationsControlStatus; items: readonly OperationsEventItem[]; kind: OperationsEventItem['kind']; nextCursor: string; loading: boolean; canReplay: boolean; onReplay(item: OperationsEventItem): void; onKindChange(kind: OperationsEventItem['kind']): void; onMore(): void }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  return <div className="admin-system-section">
    <Select aria-label={t('system.eventType')} value={kind} onChange={(event) => onKindChange(event.currentTarget.value as OperationsEventItem['kind'])}>
      <option value="inbox">{adminEventKindLabel(t, 'inbox')}</option><option value="outbox">{adminEventKindLabel(t, 'outbox')}</option><option value="gitea_effect">{adminEventKindLabel(t, 'gitea_effect')}</option>
    </Select>
    <div className="admin-system-list">
    <StatusRow label={t('system.metrics.inboxPending')} value={formatNumber(locale, status.events.inboxPending)} tone={status.events.inboxPending ? 'warning' : 'success'} />
    <StatusRow label={t('system.metrics.inboxQuarantined')} value={formatNumber(locale, status.events.inboxQuarantined)} tone={status.events.inboxQuarantined ? 'destructive' : 'success'} />
    <StatusRow label={t('system.metrics.inboxOldest')} value={adminDurationLabel(t, locale, status.events.inboxOldestAgeSeconds)} />
    <StatusRow label={t('system.metrics.outboxPending')} value={formatNumber(locale, status.events.outboxPending)} tone={status.events.outboxPending ? 'warning' : 'success'} />
    <StatusRow label={t('system.metrics.outboxDead')} value={formatNumber(locale, status.events.outboxDead)} tone={status.events.outboxDead ? 'destructive' : 'success'} />
    <StatusRow label={t('system.metrics.outboxOldest')} value={adminDurationLabel(t, locale, status.events.outboxOldestAgeSeconds)} />
    <StatusRow label={t('system.metrics.giteaPending')} value={formatNumber(locale, status.events.giteaEffectsPending)} tone={status.events.giteaEffectsPending ? 'warning' : 'success'} />
    <StatusRow label={t('system.metrics.giteaDead')} value={formatNumber(locale, status.events.giteaEffectsDead)} tone={status.events.giteaEffectsDead ? 'destructive' : 'success'} />
    </div>
    <div className="admin-system-records">
      {items.map((item) => <article key={`${item.kind}:${item.id}`}>
        <div><Badge tone={item.lastErrorCode ? 'destructive' : 'neutral'}>{adminSystemStateLabel(t, item.state)}</Badge><span>#{item.id}</span><time>{adminDateTimeLabel(locale, item.updatedAt)}</time></div>
        <strong>{item.eventType}</strong>
        <span>{item.source} / {formatNumber(locale, item.attemptCount)}</span>
        {item.lastErrorCode ? <code>{item.lastErrorCode}</code> : null}
        {canReplay && item.kind === 'inbox' && item.state === 'quarantined' ? <div className="admin-system-record-actions"><Button onClick={() => onReplay(item)}>{t('system.actions.replay')}</Button></div> : null}
      </article>)}
      {!items.length && !loading ? <EmptyState title={t('system.empty.events')} /> : null}
      {nextCursor ? <Button disabled={loading} onClick={onMore}>{loading ? t('shared.loading') : t('shared.loadMore')}</Button> : null}
    </div>
  </div>;
}

function Publishing({ status }: { status: OperationsControlStatus }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  return <div className="admin-system-list">
    <StatusRow label={t('system.metrics.provisionPending')} value={formatNumber(locale, status.publishing.provisionPending)} />
    <StatusRow label={t('system.metrics.provisionFailed')} value={formatNumber(locale, status.publishing.provisionFailed24h)} tone={status.publishing.provisionFailed24h ? 'destructive' : 'success'} />
    <StatusRow label={t('system.metrics.publicationActive')} value={formatNumber(locale, status.publishing.publicationActive)} />
    <StatusRow label={t('system.metrics.publicationFailed')} value={formatNumber(locale, status.publishing.publicationFailed24h)} tone={status.publishing.publicationFailed24h ? 'destructive' : 'success'} />
    <StatusRow label={t('system.metrics.publicationDrift')} value={formatNumber(locale, status.publishing.publicationDriftOpen)} tone={status.publishing.publicationDriftOpen ? 'warning' : 'success'} />
    <StatusRow label={t('system.metrics.queueP95')} value={adminDurationLabel(t, locale, status.publishing.queueWaitP95Seconds)} />
    <StatusRow label={t('system.metrics.renderP95')} value={adminDurationLabel(t, locale, status.publishing.renderDurationP95Seconds)} />
    <StatusRow label={t('system.metrics.activationP95')} value={adminDurationLabel(t, locale, status.publishing.activationDelayP95Seconds)} />
  </div>;
}

function Consistency({ status, findings, canDryRun, onDryRun }: { status: OperationsControlStatus; findings: readonly OperationsFindingItem[]; canDryRun: boolean; onDryRun(item: OperationsFindingItem): void }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  return <div className="admin-system-section"><div className="admin-system-list">
    <StatusRow label={t('system.metrics.openFindings')} value={formatNumber(locale, status.consistency.openFindings)} tone={status.consistency.openFindings ? 'warning' : 'success'} />
    <StatusRow label={t('system.metrics.manualFindings')} value={formatNumber(locale, status.consistency.manualFindings)} tone={status.consistency.manualFindings ? 'destructive' : 'success'} />
    <StatusRow label={t('system.metrics.reconciliationRequired')} value={formatNumber(locale, status.consistency.reconciliationRequired)} tone={status.consistency.reconciliationRequired ? 'warning' : 'success'} />
    <StatusRow label={t('system.metrics.branchPolicyDrift')} value={formatNumber(locale, status.consistency.branchPolicyDrift)} tone={status.consistency.branchPolicyDrift ? 'warning' : 'success'} />
    <StatusRow label={t('system.metrics.repairRatio')} value={formatNumber(locale, status.consistency.reconciliationRepairRatio, { style: 'percent', maximumFractionDigits: 0 })} />
  </div><div className="admin-system-records">
    {findings.map((item) => <article key={item.id}>
      <div><Badge tone={item.severity === 'critical' ? 'destructive' : 'warning'}>{item.severity}</Badge><Badge>{adminSystemStateLabel(t, item.state)}</Badge><time>{adminDateTimeLabel(locale, item.lastSeenAt)}</time></div>
      <strong>{item.checkCode}</strong>
      <span>{item.subjectType} / {item.subjectId}</span>
      <span>{formatNumber(locale, item.occurrenceCount)}</span>
      {canDryRun && item.subjectType === 'project' ? <div className="admin-system-record-actions"><Button onClick={() => onDryRun(item)}>{t('system.actions.reconcile')}</Button></div> : null}
    </article>)}
    {!findings.length ? <EmptyState title={t('system.empty.findings')} /> : null}
  </div></div>;
}

function Records({ items, nextCursor, loading, onMore }: { items: readonly OperationsAuditItem[]; nextCursor: string; loading: boolean; onMore(): void }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  if (!items.length && !loading) return <EmptyState title={t('system.empty.records')} />;
  return <div className="admin-system-records">
    {items.map((item) => <article key={item.id}>
      <div><Badge>{adminSystemStateLabel(t, item.state)}</Badge><span>#{item.id}</span><time>{adminDateTimeLabel(locale, item.createdAt)}</time></div>
      <strong>{item.command}</strong>
      <span>{item.targetType} / {item.targetId}</span>
      {item.actorUid ? <span>{item.actorUid}</span> : null}
      {item.correlationId ? <code>{item.correlationId}</code> : null}
    </article>)}
    {nextCursor ? <Button disabled={loading} onClick={onMore}>{loading ? t('shared.loading') : t('shared.loadMore')}</Button> : null}
  </div>;
}

export function SystemOperationsView({ access, section, onSectionChange }: { access: AdminWorkspaceAccess; section: AdminSystemSection; onSectionChange(section: AdminSystemSection): void }) {
  const { t } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  const visibleSections = useMemo(() => systemSections.filter((item) => access.systemSections[item]), [access.systemSections]);
  const [status, setStatus] = useState<OperationsControlStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [records, setRecords] = useState<readonly OperationsAuditItem[]>([]);
  const [recordCursor, setRecordCursor] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [eventKind, setEventKind] = useState<OperationsEventItem['kind']>('inbox');
  const [events, setEvents] = useState<readonly OperationsEventItem[]>([]);
  const [eventCursor, setEventCursor] = useState('');
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [findings, setFindings] = useState<readonly OperationsFindingItem[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [findingsError, setFindingsError] = useState('');
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayReview, setReplayReview] = useState<OperationsReplayReview | null>(null);
  const [replayReason, setReplayReason] = useState('');
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState('');
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [reconciliationProject, setReconciliationProject] = useState('');
  const [reconciliationReason, setReconciliationReason] = useState('');
  const [reconciliationResult, setReconciliationResult] = useState<OperationsReconciliationResult | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState('');

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try { setStatus(await loadOperationsControlStatus()); }
    catch (error) { setStatusError(localizedErrorMessage(error, 'admin.operationsStatusLoadFailed')); }
    finally { setStatusLoading(false); }
  }, []);

  const loadRecords = useCallback(async (cursor = '') => {
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const page = await loadOperationsAuditPage(cursor);
      setRecords((current) => cursor ? [...current, ...page.items] : page.items);
      setRecordCursor(page.nextCursor);
    } catch (error) { setRecordsError(localizedErrorMessage(error, 'admin.operationsAuditLoadFailed')); }
    finally { setRecordsLoading(false); }
  }, []);

  const loadEvents = useCallback(async (kind: OperationsEventItem['kind'], cursor = '') => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const page = await loadOperationsEventPage({ kind, cursor });
      setEvents((current) => cursor ? [...current, ...page.items] : page.items);
      setEventCursor(page.nextCursor);
    } catch (error) { setEventsError(localizedErrorMessage(error, 'admin.operationsEventsLoadFailed')); }
    finally { setEventsLoading(false); }
  }, []);

  const loadFindings = useCallback(async () => {
    setFindingsLoading(true);
    setFindingsError('');
    try { setFindings(await loadOperationsFindings('open')); }
    catch (error) { setFindingsError(localizedErrorMessage(error, 'admin.operationsFindingsLoadFailed')); }
    finally { setFindingsLoading(false); }
  }, []);

  const openReplay = useCallback(async (item: OperationsEventItem) => {
    if (item.kind !== 'inbox') return;
    setReplayOpen(true);
    setReplayReview(null);
    setReplayReason('');
    setReplayError('');
    setReplayLoading(true);
    try { setReplayReview(await loadOperationsReplayReview('inbox', item.id)); }
    catch (error) { setReplayError(localizedErrorMessage(error, 'admin.operationsReplayLoadFailed')); }
    finally { setReplayLoading(false); }
  }, []);

  const submitReplay = useCallback(async () => {
    if (!replayReview || !replayReason.trim()) return;
    setReplayLoading(true);
    setReplayError('');
    try {
      await replayOperationsEvent({ kind: 'inbox', id: replayReview.id, reason: replayReason.trim(), ...commandIdentity('event-replay') });
      setReplayOpen(false);
      await Promise.all([refreshStatus(), loadEvents('inbox')]);
    } catch (error) { setReplayError(localizedErrorMessage(error, 'admin.operationsReplayFailed')); }
    finally { setReplayLoading(false); }
  }, [loadEvents, refreshStatus, replayReason, replayReview]);

  const openReconciliation = useCallback((item: OperationsFindingItem) => {
    if (item.subjectType !== 'project') return;
    setReconciliationOpen(true);
    setReconciliationProject(item.subjectId);
    setReconciliationReason('');
    setReconciliationResult(null);
    setReconciliationError('');
  }, []);

  const dryRunReconciliation = useCallback(async () => {
    if (!reconciliationProject || !reconciliationReason.trim()) return;
    setReconciliationLoading(true);
    setReconciliationError('');
    try {
      setReconciliationResult(await runOperationsReconciliationDryRun({ projectId: reconciliationProject, reason: reconciliationReason.trim(), ...commandIdentity('reconcile-check') }));
    } catch (error) { setReconciliationError(localizedErrorMessage(error, 'admin.operationsReconciliationFailed')); }
    finally { setReconciliationLoading(false); }
  }, [reconciliationProject, reconciliationReason]);

  const applyReconciliation = useCallback(async () => {
    if (!reconciliationResult || !reconciliationReason.trim()) return;
    setReconciliationLoading(true);
    setReconciliationError('');
    try {
      await applyOperationsReconciliation({
        projectId: reconciliationResult.projectId,
        impactHash: reconciliationResult.impactHash,
        reason: reconciliationReason.trim(),
        ...commandIdentity('reconcile-apply'),
      });
      setReconciliationOpen(false);
      await Promise.all([refreshStatus(), loadFindings()]);
    } catch (error) { setReconciliationError(localizedErrorMessage(error, 'admin.operationsReconciliationFailed')); }
    finally { setReconciliationLoading(false); }
  }, [loadFindings, reconciliationReason, reconciliationResult, refreshStatus]);

  useEffect(() => {
    if (section === 'records') void loadRecords();
    else {
      void refreshStatus();
      if (section === 'events') void loadEvents(eventKind);
      if (section === 'consistency') void loadFindings();
    }
  }, [eventKind, loadEvents, loadFindings, loadRecords, refreshStatus, section]);

  const refreshing = statusLoading || recordsLoading || eventsLoading || findingsLoading;
  const canReplay = access.features.controlCommands && Boolean(access.capabilities[operationsCapability.eventReplay]);
  const canDryRun = access.features.controlCommands && Boolean(access.capabilities[operationsCapability.controlDryRun]);
  const canApply = access.features.controlCommands && Boolean(access.capabilities[operationsCapability.controlApply]);

  return <section className="admin-workspace-view admin-system-view" aria-label={t('system.label')}>
    <div className="admin-system-toolbar">
      <Tabs value={section} onValueChange={(value) => onSectionChange(value as AdminSystemSection)}>
        <TabsList aria-label={t('system.sectionsLabel')}>
          {visibleSections.map((item) => <TabsTrigger key={item} value={item}>{adminSystemSectionLabel(t, item)}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <Button onClick={() => {
        if (section === 'records') void loadRecords();
        else {
          void refreshStatus();
          if (section === 'events') void loadEvents(eventKind);
          if (section === 'consistency') void loadFindings();
        }
      }} disabled={refreshing}>{t('shared.refresh')}</Button>
    </div>
    {statusError ? <Notice tone="destructive" title={t('system.errors.status')}>{statusError}</Notice> : null}
    {recordsError ? <Notice tone="destructive" title={t('system.errors.records')}>{recordsError}</Notice> : null}
    {eventsError ? <Notice tone="destructive" title={t('system.errors.events')}>{eventsError}</Notice> : null}
    {findingsError ? <Notice tone="destructive" title={t('system.errors.findings')}>{findingsError}</Notice> : null}
    {section !== 'records' && statusLoading && !status ? <div className="admin-system-loading"><Skeleton /><Skeleton /><Skeleton /></div> : null}
    {status && section === 'overview' ? <Overview status={status} onSectionChange={onSectionChange} /> : null}
    {status && section === 'events' ? <Events status={status} items={events} kind={eventKind} nextCursor={eventCursor} loading={eventsLoading} canReplay={canReplay} onReplay={(item) => void openReplay(item)} onKindChange={(kind) => { setEventKind(kind); setEvents([]); setEventCursor(''); }} onMore={() => void loadEvents(eventKind, eventCursor)} /> : null}
    {status && section === 'publishing' ? <Publishing status={status} /> : null}
    {status && section === 'consistency' ? <Consistency status={status} findings={findings} canDryRun={canDryRun} onDryRun={openReconciliation} /> : null}
    {section === 'records' ? <Records items={records} nextCursor={recordCursor} loading={recordsLoading} onMore={() => void loadRecords(recordCursor)} /> : null}
    {status ? <time className="admin-system-sampled">{adminDateTimeLabel(locale, status.sampledAt)}</time> : null}
    <Dialog open={replayOpen} onOpenChange={(open) => { if (!replayLoading) setReplayOpen(open); }}>
      <DialogContent title={t('system.replay.title')} showCloseButton={!replayLoading}>
        {replayLoading && !replayReview ? <Skeleton /> : null}
        {replayError ? <Notice tone="destructive" title={t('system.errors.replay')}>{replayError}</Notice> : null}
        {replayReview ? <dl className="admin-system-command-facts">
          <div><dt>{t('system.replay.event')}</dt><dd>#{replayReview.id}</dd></div>
          <div><dt>{t('system.replay.type')}</dt><dd>{replayReview.eventType}</dd></div>
          <div><dt>{t('system.replay.state')}</dt><dd>{adminSystemStateLabel(t, replayReview.state)}</dd></div>
          <div><dt>{t('system.replay.error')}</dt><dd>{replayReview.lastErrorCode || '—'}</dd></div>
        </dl> : null}
        <label className="admin-system-command-reason"><span>{t('system.reason')}</span><Textarea rows={3} maxLength={500} value={replayReason} onChange={(event) => setReplayReason(event.currentTarget.value)} /></label>
        <div className="admin-system-command-actions">
          <Button disabled={replayLoading} onClick={() => setReplayOpen(false)}>{t('shared.cancel')}</Button>
          <Button variant="destructive" pending={replayLoading} disabled={!replayReview?.replayable || !replayReason.trim()} onClick={() => void submitReplay()}>{t('system.actions.confirmReplay')}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={reconciliationOpen} onOpenChange={(open) => { if (!reconciliationLoading) setReconciliationOpen(open); }}>
      <DialogContent title={t('system.reconciliation.title')} showCloseButton={!reconciliationLoading}>
        {reconciliationError ? <Notice tone="destructive" title={t('system.errors.reconciliation')}>{reconciliationError}</Notice> : null}
        <dl className="admin-system-command-facts">
          <div><dt>{t('system.reconciliation.project')}</dt><dd>{reconciliationProject}</dd></div>
          {reconciliationResult ? <>
            <div><dt>{t('system.reconciliation.differences')}</dt><dd>{formatNumber(locale, reconciliationResult.differences)}</dd></div>
            <div><dt>{t('system.reconciliation.recoverable')}</dt><dd>{formatNumber(locale, reconciliationResult.recoverable)}</dd></div>
            <div><dt>{t('system.reconciliation.manual')}</dt><dd>{formatNumber(locale, reconciliationResult.manualRequired)}</dd></div>
            <div><dt>{t('system.reconciliation.impactHash')}</dt><dd><code>{reconciliationResult.impactHash}</code></dd></div>
          </> : null}
        </dl>
        <label className="admin-system-command-reason"><span>{t('system.reason')}</span><Textarea rows={3} maxLength={500} value={reconciliationReason} onChange={(event) => { setReconciliationReason(event.currentTarget.value); setReconciliationResult(null); }} /></label>
        <div className="admin-system-command-actions">
          <Button disabled={reconciliationLoading} onClick={() => setReconciliationOpen(false)}>{t('shared.cancel')}</Button>
          <Button pending={reconciliationLoading} disabled={!reconciliationReason.trim()} onClick={() => void dryRunReconciliation()}>{t('system.actions.runCheck')}</Button>
          {reconciliationResult && canApply && reconciliationResult.recoverable > 0 ? <Button variant="destructive" pending={reconciliationLoading} onClick={() => void applyReconciliation()}>{t('system.actions.applyRepair')}</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
