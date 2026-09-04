import type { TFunction } from 'i18next';

import { formatDate, formatNumber } from '@/i18n/format';
import type { LocaleId } from '@/i18n/types';
import type {
  AdminUserRole,
  ModerationCaseFilterSource,
  ModerationCaseFilterStatus,
  ModerationCaseItem,
  ModerationCaseOperation,
} from '@/services/contracts';
import type { AdminSystemSection, OperationsEventItem } from '@/services/domains/operations';
import type { AdminView } from './queryState';

export type AdminTranslation = TFunction<'admin'>;

const contentKindKeys: Record<string, string> = {
  blog: 'content.kinds.blog',
  book: 'content.kinds.book',
  question: 'content.kinds.question',
  answer: 'content.kinds.answer',
  comment: 'content.kinds.comment',
  forum: 'content.kinds.discussion',
  discussion: 'content.kinds.discussion',
  status: 'content.kinds.dynamic',
  dynamic: 'content.kinds.dynamic',
  user: 'content.kinds.user',
};

const statusKeys: Record<string, string> = {
  active: 'statuses.active',
  available: 'statuses.available',
  closed: 'statuses.closed',
  completed: 'statuses.completed',
  deferred: 'statuses.deferred',
  deleted: 'statuses.deleted',
  draft: 'statuses.draft',
  failed: 'statuses.failed',
  ignored: 'statuses.ignored',
  inactive: 'statuses.inactive',
  normal: 'statuses.normal',
  open: 'statuses.open',
  pending: 'statuses.pending',
  private: 'statuses.private',
  published: 'statuses.published',
  quarantined: 'statuses.quarantined',
  rejected: 'statuses.rejected',
  succeeded: 'statuses.succeeded',
  suspended: 'statuses.suspended',
  unavailable: 'statuses.unavailable',
  unknown: 'statuses.unknown',
};

const operationKeys: Record<ModerationCaseOperation, string> = {
  approve: 'review.operations.approve',
  reject: 'review.operations.reject',
  defer: 'review.operations.defer',
  ignore_report: 'review.operations.ignoreReport',
  hide_question: 'review.operations.hideQuestion',
  hide_post: 'review.operations.hidePost',
  delete_answer: 'review.operations.deleteAnswer',
  hide_comment: 'review.operations.hideComment',
  hide_book_annotation: 'review.operations.hideBookAnnotation',
  hide_user: 'review.operations.hideUser',
  suspend_user: 'review.operations.suspendUser',
  target_unavailable: 'review.operations.targetUnavailable',
};

export function adminViewLabel(t: AdminTranslation, view: AdminView) {
  return t(`views.${view}`);
}

export function adminSystemSectionLabel(t: AdminTranslation, section: AdminSystemSection) {
  return t(`system.sections.${section}`);
}

export function adminContentKindLabel(t: AdminTranslation, value: string) {
  const key = contentKindKeys[value];
  return key ? t(key) : value || t('content.kinds.content');
}

export function adminStatusLabel(t: AdminTranslation, value: string | undefined) {
  if (!value) return t('statuses.unknown');
  const key = statusKeys[value];
  return key ? t(key) : value;
}

export function adminUserRoleLabel(t: AdminTranslation, role: AdminUserRole | string) {
  if (role === 'admin') return t('content.roles.admin');
  if (role === 'moderator') return t('content.roles.moderator');
  return t('content.roles.member');
}

export function adminReviewSourceLabel(t: AdminTranslation, source: ModerationCaseFilterSource) {
  return t(`review.sources.${source}`);
}

export function adminReviewStatusLabel(
  t: AdminTranslation,
  status: ModerationCaseItem['status'] | ModerationCaseFilterStatus,
) {
  return t(`review.statuses.${status}`);
}

export function adminReviewDecisionLabel(t: AdminTranslation, key: string) {
  if (key === 'no_violation') return t('review.decisions.noViolation');
  if (key === 'violation') return t('review.decisions.violation');
  if (key === 'defer') return t('review.decisions.defer');
  return key;
}

export function adminReviewOperationLabel(t: AdminTranslation, operation: ModerationCaseOperation) {
  return t(operationKeys[operation]);
}

export function adminReviewOperationImpact(
  t: AdminTranslation,
  operation: ModerationCaseOperation,
  targetType: string,
) {
  if (operation === 'suspend_user' || operation === 'hide_user') {
    return t('review.impacts.userState');
  }
  if (operation === 'hide_question' || operation === 'hide_post' || operation === 'hide_comment' || operation === 'hide_book_annotation') {
    return t('review.impacts.hideTarget', { target: adminContentKindLabel(t, targetType) });
  }
  if (operation === 'delete_answer') return t('review.impacts.deleteAnswer');
  if (operation === 'reject') return t('review.impacts.reject');
  if (operation === 'target_unavailable') return t('review.impacts.targetUnavailable');
  return '';
}

export function adminSystemStateLabel(t: AdminTranslation, value: string) {
  return adminStatusLabel(t, value);
}

export function adminEventKindLabel(t: AdminTranslation, kind: OperationsEventItem['kind']) {
  return t(`system.eventKinds.${kind}`);
}

export function adminDateTimeLabel(locale: LocaleId, value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function adminDurationLabel(t: AdminTranslation, locale: LocaleId, seconds: number) {
  if (seconds < 60) {
    const value = Math.round(seconds);
    return t('system.duration.seconds', { count: value, displayCount: formatNumber(locale, value) });
  }
  if (seconds < 3600) {
    const value = Math.round(seconds / 60);
    return t('system.duration.minutes', { count: value, displayCount: formatNumber(locale, value) });
  }
  const value = seconds / 3600;
  return t('system.duration.hours', {
    count: value,
    displayCount: formatNumber(locale, value, { maximumFractionDigits: 1 }),
  });
}

export function adminPermissionRuleLabel(t: AdminTranslation, key: string, fallback: string) {
  return t(`content.permissions.rules.${key}.label`, { defaultValue: fallback });
}

export function adminPermissionRuleDescription(t: AdminTranslation, key: string, fallback: string) {
  return t(`content.permissions.rules.${key}.description`, { defaultValue: fallback });
}
