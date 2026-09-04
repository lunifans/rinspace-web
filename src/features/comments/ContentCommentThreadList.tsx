import {
  AnimateButton,
  AnimateChevronDown,
  AnimateMore,
  AnimateThumbsDown,
  AnimateThumbsUp,
  Icon,
  rinMotion,
} from "@/components/ui";
import UserIdentity from "@/components/UserIdentity";
import type { CommentSummary } from "@/services/contracts";
import { motion, useReducedMotion } from "motion/react";
import {
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { formatDate, formatNumber } from "@/i18n/format";
import { useResolvedLocale } from "@/i18n/LanguageProvider";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import type { LocaleId } from "@/i18n/types";

const MilkdownMarkdownArticle = lazy(
  () => import("@/components/MilkdownMarkdownArticle"),
);

export type ContentCommentIdentity = {
  userId: string;
  imageUrl?: string;
  rank?: number;
};

export type ContentCommentMenuAction = {
  key: string;
  label: string;
  disabled?: boolean;
  dangerous?: boolean;
  onSelect: () => void;
};

export type ContentCommentThread = {
  root: CommentSummary;
  replies: CommentSummary[];
};

export function groupContentCommentThreads(
  items: CommentSummary[],
): ContentCommentThread[] {
  const commentsById = new Map(items.map((item) => [item.id, item]));
  const roots = items.filter(
    (item) => !item.parentId && !item.replyToCommentId,
  );
  const repliesByRoot = new Map<number, CommentSummary[]>();
  const rootIdFor = (item: CommentSummary) => {
    let parentId = item.parentId || item.replyToCommentId;
    const visited = new Set<number>();
    while (parentId && parentId > 0 && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = commentsById.get(parentId);
      if (!parent) return parentId;
      const nextParentId = parent.parentId || parent.replyToCommentId;
      if (!nextParentId || nextParentId <= 0) return parent.id;
      parentId = nextParentId;
    }
    return parentId || 0;
  };

  items.forEach((item) => {
    const rootId = rootIdFor(item);
    if (!rootId || rootId === item.id) return;
    const replies = repliesByRoot.get(rootId) || [];
    replies.push(item);
    repliesByRoot.set(rootId, replies);
  });
  repliesByRoot.forEach((replies) => {
    replies.sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    );
  });

  const rootIds = new Set(roots.map((root) => root.id));
  const orphanReplies = items.filter((item) => {
    if (!item.parentId && !item.replyToCommentId) return false;
    const rootId = rootIdFor(item);
    return !rootId || !rootIds.has(rootId);
  });

  return [
    ...roots.map((root) => ({
      root,
      replies: repliesByRoot.get(root.id) || [],
    })),
    ...orphanReplies.map((root) => ({ root, replies: [] })),
  ];
}

export function formatContentCommentDate(value: string, locale: LocaleId = "zh-CN") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(locale, date, {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContentCommentVotes({
  upCount,
  downCount,
  status,
  disabled = false,
  onVote,
}: {
  upCount: number;
  downCount: number;
  status: CommentSummary["viewerVoteStatus"];
  disabled?: boolean;
  onVote: (type: "up" | "down") => void;
}) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  return (
    <div className="content-comment-votes" aria-label={t("comments.votes")}>
      <AnimateButton
        unstyled
        type="button"
        className={status === "up" ? "active" : ""}
        aria-label={t("comments.upvote", { displayCount: formatNumber(locale, upCount) })}
        aria-pressed={status === "up"}
        disabled={disabled}
        onClick={() => onVote("up")}
      >
        <AnimateThumbsUp size={16} animateOnHover />
        <span>{upCount}</span>
      </AnimateButton>
      <AnimateButton
        unstyled
        type="button"
        className={status === "down" ? "active down" : "down"}
        aria-label={t("comments.downvote", { displayCount: formatNumber(locale, downCount) })}
        aria-pressed={status === "down"}
        disabled={disabled}
        onClick={() => onVote("down")}
      >
        <AnimateThumbsDown size={16} animateOnHover />
        <span>{downCount}</span>
      </AnimateButton>
    </div>
  );
}

export function ContentCommentMoreMenu({
  actions,
}: {
  actions: ContentCommentMenuAction[];
}) {
  const { t } = useFeatureTranslation("reader");
  if (!actions.length) return null;
  return (
    <details className="content-comment-more">
      <summary aria-label={t("comments.more")}>
        <AnimateMore size={18} animateOnHover />
      </summary>
      <div className="content-comment-more-menu">
        {actions.map((action) => (
          <AnimateButton
            unstyled
            type="button"
            className={action.dangerous ? "danger" : ""}
            disabled={action.disabled}
            onClick={action.onSelect}
            key={action.key}
          >
            {action.label}
          </AnimateButton>
        ))}
      </div>
    </details>
  );
}

export function ContentCommentThreadList({
  threads,
  canReply,
  resolveIdentity,
  isAuthor,
  isEditing,
  renderEditForm,
  renderMoreMenu,
  renderVotes,
  isRepliesExpanded,
  onToggleReplies,
  onReply,
  onJumpToComment,
  emptyLabel,
}: {
  threads: ContentCommentThread[];
  canReply: boolean;
  resolveIdentity: (item: CommentSummary) => ContentCommentIdentity;
  isAuthor: (item: CommentSummary) => boolean;
  isEditing?: (item: CommentSummary) => boolean;
  renderEditForm?: (item: CommentSummary) => ReactNode;
  renderMoreMenu?: (item: CommentSummary) => ReactNode;
  renderVotes: (item: CommentSummary) => ReactNode;
  isRepliesExpanded: (rootId: number) => boolean;
  onToggleReplies: (rootId: number) => void;
  onReply: (item: CommentSummary, rootId: number) => void;
  onJumpToComment?: (commentId: number) => void;
  emptyLabel?: string;
}) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  const reducedMotion = useReducedMotion();
  const visibleEmptyLabel = emptyLabel || t("comments.empty");

  if (!threads.length) {
    return (
      <div className="state-strip content-comment-empty">{visibleEmptyLabel}</div>
    );
  }

  const renderItem = (
    item: CommentSummary,
    reply: boolean,
    rootId: number,
  ): ReactNode => {
    const identity = resolveIdentity(item);
    const replies = reply
      ? []
      : threads.find((thread) => thread.root.id === rootId)?.replies || [];
    const expanded = isRepliesExpanded(rootId);
    const visibleReplies = expanded ? replies : replies.slice(0, 3);
    const editing = Boolean(isEditing?.(item));
    return (
      <article
        id={`comment-${item.id}`}
        className={reply ? "content-comment-item is-reply" : "content-comment-item"}
        key={item.id}
      >
        <div className="content-comment-identity">
          <UserIdentity
            name={item.author}
            userId={identity.userId}
            imageUrl={identity.imageUrl}
            rank={identity.rank}
            size={reply ? "sm" : "md"}
            variant="default"
          />
          {isAuthor(item) ? (
            <span className="content-comment-author-badge">{t("comments.author")}</span>
          ) : null}
          {renderMoreMenu?.(item)}
        </div>
        <div className="content-comment-main">
          {editing && renderEditForm ? (
            renderEditForm(item)
          ) : (
            <>
              {reply && item.replyToCommentId && item.replyToAuthor ? (
                onJumpToComment ? (
                  <AnimateButton
                    unstyled
                    type="button"
                    className="content-comment-reply-reference"
                    onClick={() => onJumpToComment(item.replyToCommentId || 0)}
                  >
                    {t("comments.replyTo", { author: item.replyToAuthor })}
                  </AnimateButton>
                ) : (
                  <span className="content-comment-reply-reference">
                    {t("comments.replyTo", { author: item.replyToAuthor })}
                  </span>
                )
              ) : null}
              <Suspense fallback={null}>
                <MilkdownMarkdownArticle
                  markdown={item.body}
                  className="content-comment-markdown"
                  emptyFallback=""
                  socialTokens
                />
              </Suspense>
            </>
          )}
          <div className="content-comment-actions">
            <time dateTime={item.createdAt}>
              {formatContentCommentDate(item.createdAt, locale)}
            </time>
            {renderVotes(item)}
            <AnimateButton
              unstyled
              type="button"
              className="content-comment-reply-action"
              disabled={!canReply}
              onClick={() => onReply(item, rootId)}
            >
              <Icon name="reply" />
              {t("comments.reply")}
            </AnimateButton>
          </div>
          {!reply && replies.length ? (
            <motion.div
              className="content-comment-replies"
              layout={reducedMotion ? false : "size"}
              transition={{
                duration: reducedMotion ? 0 : rinMotion.structural,
                ease: rinMotion.easeOut,
              }}
            >
              {visibleReplies.map((child) =>
                renderItem(child, true, rootId),
              )}
              {replies.length > 3 ? (
                <AnimateButton
                  unstyled
                  type="button"
                  className="content-comment-replies-toggle"
                  aria-expanded={expanded}
                  onClick={() => onToggleReplies(rootId)}
                >
                  {expanded
                    ? t("comments.collapseReplies")
                    : t("comments.expandReplies", {
                      count: replies.length,
                      displayCount: formatNumber(locale, replies.length),
                    })}
                  <motion.span
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : rinMotion.iconSpring
                    }
                    aria-hidden="true"
                  >
                    <AnimateChevronDown size={14} />
                  </motion.span>
                </AnimateButton>
              ) : null}
            </motion.div>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="comment-list content-comment-list">
      {threads.map(({ root }) => renderItem(root, false, root.id))}
    </div>
  );
}
