import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ensureLocaleNamespaces, i18n } from "@/i18n";
import type { CommentSummary } from "@/services/contracts";
import {
  ContentCommentThreadList,
  ContentCommentVotes,
  groupContentCommentThreads,
} from "./ContentCommentThreadList";

function comment(
  id: number,
  parentId?: number,
  createdAt = "2026-08-25T13:00:00Z",
): CommentSummary {
  return {
    id,
    targetType: "post",
    targetId: 7,
    parentId,
    author: `用户 ${id}`,
    body: `评论 ${id}`,
    voteCount: 0,
    upVoteCount: id,
    downVoteCount: 0,
    viewerVoteStatus: "none",
    createdAt,
    updatedAt: createdAt,
  };
}

describe("shared content comment threads", () => {
  beforeAll(async () => {
    await ensureLocaleNamespaces("zh-CN", ["reader"]);
    await i18n.changeLanguage("zh-CN");
  });

  it("flattens deeper replies under one visual root and sorts them oldest first", () => {
    const items = [
      comment(1),
      comment(3, 2, "2026-08-25T13:03:00Z"),
      comment(2, 1, "2026-08-25T13:02:00Z"),
      comment(4),
    ];
    const threads = groupContentCommentThreads(items);
    expect(threads.map((thread) => thread.root.id)).toEqual([1, 4]);
    expect(threads[0]?.replies.map((reply) => reply.id)).toEqual([2, 3]);
  });

  it("uses the detail comment identity, action order and collapsed reply language", () => {
    const onReply = vi.fn();
    const onToggleReplies = vi.fn();
    const threads = groupContentCommentThreads([
      comment(1),
      comment(2, 1),
      comment(3, 1),
      comment(4, 1),
      comment(5, 1),
    ]);
    render(
      <MemoryRouter>
        <ContentCommentThreadList
          threads={threads}
          canReply
          resolveIdentity={(item) => ({ userId: item.author })}
          isAuthor={(item) => item.id === 1}
          renderVotes={(item) => (
            <ContentCommentVotes
              upCount={item.upVoteCount}
              downCount={item.downVoteCount}
              status={item.viewerVoteStatus}
              onVote={() => undefined}
            />
          )}
          isRepliesExpanded={() => false}
          onToggleReplies={onToggleReplies}
          onReply={onReply}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("作者")).toBeTruthy();
    expect(screen.getByRole("button", { name: "点赞 1" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "点踩 0" })).toHaveLength(4);
    expect(screen.getByText("共 4 条回复，展开")).toBeTruthy();
  });

  it("localizes shared comment controls without translating authored content", async () => {
    await ensureLocaleNamespaces("en", ["reader"]);
    await act(async () => i18n.changeLanguage("en"));
    const threads = groupContentCommentThreads([
      comment(1),
      comment(2, 1),
      comment(3, 1),
      comment(4, 1),
      comment(5, 1),
    ]);
    render(
      <MemoryRouter>
        <ContentCommentThreadList
          threads={threads}
          canReply
          resolveIdentity={(item) => ({ userId: item.author })}
          isAuthor={(item) => item.id === 1}
          renderVotes={(item) => (
            <ContentCommentVotes
              upCount={item.upVoteCount}
              downCount={item.downVoteCount}
              status={item.viewerVoteStatus}
              onVote={() => undefined}
            />
          )}
          isRepliesExpanded={() => false}
          onToggleReplies={() => undefined}
          onReply={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Author")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upvote 1" })).toBeTruthy();
    expect(screen.getByText("Show 4 replies")).toBeTruthy();
    expect(screen.getByText("用户 1")).toBeTruthy();
    await act(async () => i18n.changeLanguage("zh-CN"));
  });
});
