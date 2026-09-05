export const STATUS_SLUG_VERSION = "rinspace-status-slug-v1";
export const STATUS_SLUG_FALLBACK = "post";
export const STATUS_SLUG_MAX_GRAPHEMES = 48;

export type StatusSlugVisibility =
  | "public"
  | "unlisted"
  | "private"
  | "direct";

export interface StatusSlugInput {
  text: string;
  visibility: StatusSlugVisibility;
  sensitive: boolean;
}

function firstGraphemes(value: string, limit: number): string {
  const Segmenter = Intl.Segmenter;
  const segments = new Segmenter("und", { granularity: "grapheme" }).segment(
    value,
  );
  return Array.from(segments, ({ segment }) => segment).slice(0, limit).join("");
}

export function statusSlugV1({
  text,
  visibility,
  sensitive,
}: StatusSlugInput): string {
  if (sensitive || (visibility !== "public" && visibility !== "unlisted")) {
    return STATUS_SLUG_FALLBACK;
  }

  const slug = firstGraphemes(
    text
      .normalize("NFKC")
      .replace(/<[^>]*>/gu, " ")
      .replace(/https?:\/\/[^\s<]+/giu, " ")
      .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, " ")
      .replace(/(^|[\s([{])@[\p{L}\p{N}_]+(?:@[\p{L}\p{N}.-]+)?/gu, "$1")
      .replace(/[\p{Cc}\p{Cf}]/gu, " ")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/gu, ""),
    STATUS_SLUG_MAX_GRAPHEMES,
  ).replace(/-+$/gu, "");

  return slug || STATUS_SLUG_FALLBACK;
}
