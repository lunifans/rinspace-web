import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestJson } = vi.hoisted(() => ({ requestJson: vi.fn() }));

vi.mock("@/services/httpClient", () => {
  class ServiceError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly payload: unknown,
    ) {
      super(message);
    }
  }
  return { requestJson, ServiceError };
});

import { ServiceError } from "@/services/httpClient";
import {
  BookPublicationConflictError,
  bookAnnotationPageCacheKey,
  createBookAnnotation,
  parseBookAnnotationItem,
  parseBookAnnotationPageSummary,
} from "./service";

const annotation = {
  id: "17",
  blockId: "rb_0123456789abcdef0123456789abcdef",
  kind: "question",
  body: "条件是否充分？",
  status: "open",
  anchorState: "resolved",
  voteCount: 2,
  replyCount: 1,
  own: false,
  createdAt: "2026-08-25T10:00:00Z",
  updatedAt: "2026-08-25T10:00:00Z",
};

describe("book annotation service boundary", () => {
  beforeEach(() => requestJson.mockReset());

  it("parses public summaries without inventing a private slot", () => {
    const parsed = parseBookAnnotationPageSummary({
      anchorVersion: "rin-document-bundle/v2",
      publicationCommit: "a".repeat(40),
      public: [{ blockId: annotation.blockId, items: [annotation] }],
    });
    expect(parsed).toEqual({
      anchorVersion: "rin-document-bundle/v2",
      publicationCommit: "a".repeat(40),
      public: [{ blockId: annotation.blockId, items: [annotation] }],
      mine: undefined,
    });
    expect(parsed).not.toHaveProperty("private");
  });

  it("rejects malformed kinds and counts", () => {
    expect(
      parseBookAnnotationItem({ ...annotation, kind: "reply" }),
    ).toBeNull();
    expect(
      parseBookAnnotationItem({ ...annotation, voteCount: "2" }),
    ).toBeNull();
  });

  it("separates public and viewer cache identities", () => {
    expect(
      bookAnnotationPageCacheKey("book", "page", "commit", false),
    ).not.toEqual(bookAnnotationPageCacheKey("book", "page", "commit", true));
  });

  it("maps a publication race to the retryable conflict type", async () => {
    requestJson.mockRejectedValueOnce(new ServiceError("changed", 409, null));
    await expect(
      createBookAnnotation("book", "page", {
        blockId: annotation.blockId,
        publicationCommit: "a".repeat(40),
        kind: "question",
        body: "条件是否充分？",
        correctionText: "",
        selection: null,
      }),
    ).rejects.toBeInstanceOf(BookPublicationConflictError);
  });
});
