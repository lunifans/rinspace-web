import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { parseRuntimeConfig } from "@/app/config/runtime";
import type { HttpTransport } from "@/platform/runtime";
import { createContent, parseContentModerationSubmission } from "./feed";
import { installHttpClientRuntime, resetHttpClientRuntimeForTests } from "./httpClient";

const sessionKey = "rinspace-auth-session";
const integration = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "config/runtime.example.json"), "utf8"),
) as unknown);

function encodeBase64URL(value: string) {
  return window
    .btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function validAccessToken() {
  return [
    encodeBase64URL(JSON.stringify({ alg: "none" })),
    encodeBase64URL(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    ),
    "signature",
  ].join(".");
}

beforeEach(() => {
  resetHttpClientRuntimeForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(
    sessionKey,
    JSON.stringify({
      access_token: validAccessToken(),
      refresh_token: "refresh-token",
      expires_in: 3600,
      sub: "moderation-author",
      issued_at: Date.now(),
    }),
  );
});

afterEach(() => {
  resetHttpClientRuntimeForTests();
  vi.unstubAllGlobals();
});

describe("content moderation submission response", () => {
  it("accepts a durable AI second-review response", () => {
    expect(
      parseContentModerationSubmission({
        submissionId: "42",
        state: "ai_review_pending",
        message: "一审未通过，已进入 AI 二审。",
      }),
    ).toEqual({
      submissionId: "42",
      state: "ai_review_pending",
      message: "一审未通过，已进入 AI 二审。",
      contentId: undefined,
      contentSlug: undefined,
    });
  });

  it("rejects unknown workflow states", () => {
    expect(
      parseContentModerationSubmission({
        submissionId: "42",
        state: "provider_label",
        message: "internal result",
      }),
    ).toBeNull();
  });

  it("reuses the same create key while an async submission remains in review", async () => {
    const requestPayloads: Array<Record<string, unknown>> = [];
    const request = vi.fn<HttpTransport["request"]>(async (requestInput) => {
      requestPayloads.push(requestInput.body as Record<string, unknown>);
      return {
        submissionId: "84",
        state: "ai_review_pending",
        message: "一审未通过，已进入 AI 二审。",
      };
    });
    installHttpClientRuntime(integration, {
      kind: "compatible-http",
      request,
      requestRaw: vi.fn(),
    });

    const input = {
      type: "blog" as const,
      status: "published" as const,
      repositoryStatus: "published" as const,
      sourceVisibility: "open" as const,
      sourceVisibilityIntent: "open" as const,
      title: "异步审核博客",
      body: "[[RIN_WRITER]]<p>正文</p>[[/RIN_WRITER]]",
      tags: ["general"],
      editor: "rin" as const,
    };

    const first = await createContent(input);
    const replay = await createContent(input);

    expect(first).toEqual(replay);
    expect(requestPayloads).toHaveLength(2);
    expect(requestPayloads[0].idempotencyKey).toEqual(expect.any(String));
    expect(requestPayloads[1].idempotencyKey).toBe(
      requestPayloads[0].idempotencyKey,
    );
    expect(window.sessionStorage.length).toBe(1);
  });
});
