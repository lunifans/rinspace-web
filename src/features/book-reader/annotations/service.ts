import { requestJson, ServiceError } from "@/services/httpClient";

export type BookAnnotationKind =
  | "highlight"
  | "note"
  | "comment"
  | "question"
  | "erratum";

export type BookAnnotationItem = {
  id: string;
  blockId: string;
  kind: BookAnnotationKind;
  body?: string;
  correctionText?: string;
  status: string;
  anchorState: "resolved" | "orphaned";
  voteCount: number;
  replyCount: number;
  authorId?: string;
  author?: string;
  own: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BookAnnotationBlockGroup = {
  blockId: string;
  items: BookAnnotationItem[];
};

export type BookAnnotationPageSummary = {
  anchorVersion: string;
  publicationCommit: string;
  public: BookAnnotationBlockGroup[];
  mine?: BookAnnotationBlockGroup[];
};

export type CreateBookAnnotationInput = {
  blockId: string;
  publicationCommit: string;
  kind: BookAnnotationKind;
  body: string;
  correctionText: string;
  selection: null;
};

export type UpdateBookAnnotationInput = {
  body?: string;
  correctionText?: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function annotationKind(value: unknown): BookAnnotationKind | null {
  return value === "highlight" ||
    value === "note" ||
    value === "comment" ||
    value === "question" ||
    value === "erratum"
    ? value
    : null;
}

export function parseBookAnnotationItem(
  value: unknown,
): BookAnnotationItem | null {
  if (!isRecord(value)) return null;
  const kind = annotationKind(value.kind);
  if (
    typeof value.id !== "string" ||
    typeof value.blockId !== "string" ||
    !kind ||
    typeof value.status !== "string" ||
    (value.anchorState !== "resolved" && value.anchorState !== "orphaned") ||
    typeof value.voteCount !== "number" ||
    typeof value.replyCount !== "number" ||
    typeof value.own !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  )
    return null;
  if (value.body !== undefined && typeof value.body !== "string") return null;
  if (
    value.correctionText !== undefined &&
    typeof value.correctionText !== "string"
  )
    return null;
  if (value.authorId !== undefined && typeof value.authorId !== "string")
    return null;
  if (value.author !== undefined && typeof value.author !== "string")
    return null;
  return {
    id: value.id,
    blockId: value.blockId,
    kind,
    body: value.body,
    correctionText: value.correctionText,
    status: value.status,
    anchorState: value.anchorState,
    voteCount: value.voteCount,
    replyCount: value.replyCount,
    authorId: value.authorId,
    author: value.author,
    own: value.own,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseGroup(value: unknown): BookAnnotationBlockGroup | null {
  if (
    !isRecord(value) ||
    typeof value.blockId !== "string" ||
    !Array.isArray(value.items)
  )
    return null;
  const items = value.items.map(parseBookAnnotationItem);
  if (items.some((item) => item === null)) return null;
  return {
    blockId: value.blockId,
    items: items.filter((item): item is BookAnnotationItem => item !== null),
  };
}

export function parseBookAnnotationPageSummary(
  value: unknown,
): BookAnnotationPageSummary | null {
  if (
    !isRecord(value) ||
    typeof value.anchorVersion !== "string" ||
    typeof value.publicationCommit !== "string" ||
    !Array.isArray(value.public)
  )
    return null;
  const publicGroups = value.public.map(parseGroup);
  if (publicGroups.some((group) => group === null)) return null;
  let mine: BookAnnotationBlockGroup[] | undefined;
  if (value.mine !== undefined) {
    if (!Array.isArray(value.mine)) return null;
    const privateGroups = value.mine.map(parseGroup);
    if (privateGroups.some((group) => group === null)) return null;
    mine = privateGroups.filter(
      (group): group is BookAnnotationBlockGroup => group !== null,
    );
  }
  return {
    anchorVersion: value.anchorVersion,
    publicationCommit: value.publicationCommit,
    public: publicGroups.filter(
      (group): group is BookAnnotationBlockGroup => group !== null,
    ),
    mine,
  };
}

export function bookAnnotationPageCacheKey(
  bookRef: string,
  pageId: string,
  commit: string,
  authenticated: boolean,
) {
  return [
    "book-annotations",
    bookRef,
    pageId,
    commit,
    authenticated ? "viewer" : "public",
  ] as const;
}

export class BookPublicationConflictError extends Error {}

export async function loadBookAnnotationPage(
  bookRef: string,
  pageId: string,
  commit: string,
): Promise<BookAnnotationPageSummary> {
  const payload = await requestJson<unknown>(
    `books/${encodeURIComponent(bookRef)}/reader/pages/${encodeURIComponent(pageId)}/annotations`,
    { auth: "optional", query: { commit } },
  );
  const parsed = parseBookAnnotationPageSummary(payload);
  if (!parsed) throw new Error("批注数据格式异常");
  return parsed;
}

export async function createBookAnnotation(
  bookRef: string,
  pageId: string,
  input: CreateBookAnnotationInput,
): Promise<BookAnnotationItem> {
  let payload: unknown;
  try {
    payload = await requestJson<unknown>(
      `books/${encodeURIComponent(bookRef)}/reader/pages/${encodeURIComponent(pageId)}/annotations`,
      {
        auth: "required",
        method: "POST",
        headers: {
          "Idempotency-Key":
            globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.round(globalThis.performance?.now?.() || 0)}`,
        },
        body: input,
      },
    );
  } catch (error) {
    if (error instanceof ServiceError && error.status === 409) {
      throw new BookPublicationConflictError("发布版本已更新");
    }
    throw error;
  }
  const parsed = parseBookAnnotationItem(payload);
  if (!parsed) throw new Error("批注数据格式异常");
  return parsed;
}

export async function loadBookAnnotation(
  annotationId: string,
): Promise<BookAnnotationItem> {
  const payload = await requestJson<unknown>(
    `book-annotations/${encodeURIComponent(annotationId)}`,
    { auth: "optional" },
  );
  const parsed = parseBookAnnotationItem(payload);
  if (!parsed) throw new Error("批注数据格式异常");
  return parsed;
}

export async function updateBookAnnotation(
  annotationId: string,
  input: UpdateBookAnnotationInput,
): Promise<BookAnnotationItem> {
  const payload = await requestJson<unknown>(
    `book-annotations/${encodeURIComponent(annotationId)}`,
    {
      auth: "required",
      method: "PATCH",
      body: input,
    },
  );
  const parsed = parseBookAnnotationItem(payload);
  if (!parsed) throw new Error("批注数据格式异常");
  return parsed;
}

export async function deleteBookAnnotation(
  annotationId: string,
): Promise<void> {
  await requestJson<unknown>(
    `book-annotations/${encodeURIComponent(annotationId)}`,
    {
      auth: "required",
      method: "DELETE",
    },
  );
}
