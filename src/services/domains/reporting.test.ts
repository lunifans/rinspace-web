import { describe, expect, it } from "vitest";

import { parseReportReasonCatalog, parseReportReceipt } from "./reporting";

describe("reporting contracts", () => {
  it("parses the versioned reason catalog without inventing fallbacks", () => {
    expect(
      parseReportReasonCatalog({
        version: 3,
        targetType: "comment",
        reasons: [
          { key: "spam", label: "垃圾广告" },
          { key: "other", label: "其他", requiresDetail: true },
        ],
      }),
    ).toEqual({
      version: 3,
      targetType: "comment",
      reasons: [
        { key: "spam", label: "垃圾广告", requiresDetail: false },
        { key: "other", label: "其他", requiresDetail: true },
      ],
    });
  });

  it("rejects empty, duplicate, and malformed reason catalogs", () => {
    expect(() =>
      parseReportReasonCatalog({
        version: 1,
        targetType: "comment",
        reasons: [],
      }),
    ).toThrow("举报原因目录为空");
    expect(() =>
      parseReportReasonCatalog({
        version: 1,
        targetType: "comment",
        reasons: [
          { key: "spam", label: "垃圾广告" },
          { key: "spam", label: "重复" },
        ],
      }),
    ).toThrow("重复标识");
    expect(() =>
      parseReportReasonCatalog({
        version: 1,
        targetType: "unknown",
        reasons: [{ key: "spam", label: "垃圾广告" }],
      }),
    ).toThrow("目标类型格式异常");
  });

  it("preserves episode, event, reason, version, and replay fields", () => {
    expect(
      parseReportReceipt({
        id: 42,
        eventId: 81,
        targetType: "comment",
        targetId: "9",
        reasonKey: "other",
        reasonVersion: 2,
        status: 0,
        version: 4,
        supplemented: true,
        replayed: true,
        createdAt: "2026-08-27T08:00:00Z",
      }),
    ).toMatchObject({
      id: 42,
      eventId: 81,
      reasonKey: "other",
      reasonVersion: 2,
      version: 4,
      supplemented: true,
      replayed: true,
    });
  });
});
