import { requestJson } from "../httpClient";

export const reportTargetTypes = [
  "post",
  "blog",
  "book",
  "question",
  "answer",
  "comment",
  "user",
  "discussion",
  "dynamic",
  "forum",
  "status",
] as const;

export type ReportTargetType = (typeof reportTargetTypes)[number];

export type ReportTarget = Readonly<{
  targetType: ReportTargetType;
  title: string;
  targetId?: string;
  objectId?: number;
  slug?: string;
}>;

export type ReportReason = Readonly<{
  key: string;
  label: string;
  requiresDetail: boolean;
}>;

export type ReportReasonCatalog = Readonly<{
  version: number;
  targetType: ReportTargetType;
  reasons: readonly ReportReason[];
}>;

export type ReportSubmission = Readonly<{
  reasonKey: string;
  reasonVersion: number;
  content: string;
  idempotencyKey: string;
}> &
  ReportTarget;

export type ReportReceipt = Readonly<{
  id: number;
  eventId: number | null;
  targetType: string;
  targetId: string;
  reasonKey: string;
  reasonVersion: number;
  status: number;
  version: number;
  supplemented: boolean;
  replayed: boolean;
  createdAt: string;
}>;

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name}格式异常。`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function positiveInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name}格式异常。`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, name: string) {
  if (value === undefined || value === null || value === 0) return null;
  return positiveInteger(value, name);
}

function nonEmptyString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name}格式异常。`);
  }
  return value;
}

function isReportTargetType(value: unknown): value is ReportTargetType {
  return (
    typeof value === "string" &&
    (reportTargetTypes as readonly string[]).includes(value)
  );
}

export function parseReportReasonCatalog(value: unknown): ReportReasonCatalog {
  const root = record(value, "举报原因目录");
  const version = positiveInteger(root.version, "举报原因版本");
  if (!isReportTargetType(root.targetType)) {
    throw new Error("举报目标类型格式异常。");
  }
  if (!Array.isArray(root.reasons) || root.reasons.length === 0) {
    throw new Error("举报原因目录为空。");
  }
  const seen = new Set<string>();
  const reasons = root.reasons.map((item) => {
    const reason = record(item, "举报原因");
    const key = nonEmptyString(reason.key, "举报原因标识");
    if (seen.has(key)) throw new Error("举报原因目录包含重复标识。");
    seen.add(key);
    if (
      reason.requiresDetail !== undefined &&
      typeof reason.requiresDetail !== "boolean"
    ) {
      throw new Error("举报原因补充要求格式异常。");
    }
    return {
      key,
      label: nonEmptyString(reason.label, "举报原因名称"),
      requiresDetail: reason.requiresDetail === true,
    };
  });
  return { version, targetType: root.targetType, reasons };
}

export function parseReportReceipt(value: unknown): ReportReceipt {
  const root = record(value, "举报回执");
  return {
    id: positiveInteger(root.id, "举报编号"),
    eventId: optionalPositiveInteger(root.eventId, "举报事件编号"),
    targetType: nonEmptyString(root.targetType, "举报目标类型"),
    targetId: nonEmptyString(root.targetId, "举报目标编号"),
    reasonKey: nonEmptyString(root.reasonKey, "举报原因标识"),
    reasonVersion: positiveInteger(root.reasonVersion, "举报原因版本"),
    status:
      typeof root.status === "number" && Number.isSafeInteger(root.status)
        ? root.status
        : (() => {
            throw new Error("举报状态格式异常。");
          })(),
    version: optionalPositiveInteger(root.version, "举报版本") ?? 0,
    supplemented: root.supplemented === true,
    replayed: root.replayed === true,
    createdAt: nonEmptyString(root.createdAt, "举报创建时间"),
  };
}

export async function loadReportReasonCatalog(targetType: ReportTargetType) {
  const payload = await requestJson<unknown>("report-reasons", {
    auth: "none",
    query: { target_type: targetType },
  });
  return parseReportReasonCatalog(payload);
}

export async function submitReportSubmission(input: ReportSubmission) {
  const payload = await requestJson<unknown>("reports", {
    method: "POST",
    auth: "required",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: {
      targetType: input.targetType,
      targetId: input.targetId,
      objectId: input.objectId,
      slug: input.slug,
      reasonKey: input.reasonKey,
      reasonVersion: input.reasonVersion,
      content: input.content,
      idempotencyKey: input.idempotencyKey,
    },
  });
  return parseReportReceipt(payload);
}
