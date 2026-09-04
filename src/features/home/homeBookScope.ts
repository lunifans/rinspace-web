import type { FeedItem } from "@/services/contracts";

export type HomeOriginalBookFormat = "pdf" | "latex" | "markdown";

export function homeOriginalBookFormat(
  item: Pick<FeedItem, "type" | "book">,
): HomeOriginalBookFormat | null {
  if (item.type !== "book" || !item.book) return null;
  if (item.book.kind === "markdown") return "markdown";
  if (item.book.kind !== "original") return null;
  return item.book.pdfUrl ? "pdf" : "latex";
}

export function isHomeOriginalBook(
  item: Pick<FeedItem, "type" | "book">,
) {
  return homeOriginalBookFormat(item) !== null;
}
