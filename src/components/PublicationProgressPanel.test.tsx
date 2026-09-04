import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PublicationProgressPanel } from "./PublicationProgressPanel";
import type {
  PublicationProgress,
  PublicationState,
} from "@/services/publicationProgress";
import { publicAsset } from "@/app/config/env";

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeNull(): void;
  not: { toBeNull(): void };
};

const now = "2026-08-14T10:00:00Z";
const base = {
  schemaVersion: "rin-publication-progress/v1" as const,
  view: "public" as const,
  projectId: "article:42",
  displayingPreviousVersion: true,
  updatedAt: now,
};

function progress(state: PublicationState): PublicationProgress {
  if (state === "queued")
    return {
      ...base,
      state,
      queue: {
        jobsAheadEstimate: 2,
        queuedProjects: 3,
        activeProjects: 1,
        estimate: null,
        scope: "instance",
        calculatedAt: now,
      },
    };
  if (state === "running")
    return {
      ...base,
      state,
      run: {
        stage: "document_compile",
        elapsedSeconds: 75,
        progress: { completedStages: 1, totalStages: 3 },
      },
    };
  if (state === "failed")
    return {
      ...base,
      state,
      failure: { code: "publication_failed", message: "当前继续显示上一版。" },
    };
  return { ...base, state };
}

function renderPanel(value: PublicationProgress | null) {
  return render(<PublicationProgressPanel progress={value} />);
}

test("PublicationProgressPanel renders truthful copy for every visible state", () => {
  const cases: Array<[PublicationState, string]> = [
    ["awaiting_event", "接收新版本"],
    ["validating", "检查项目"],
    ["queued", "等待渲染"],
    ["running", "正在渲染"],
    ["activating", "正在发布"],
    ["failed", "更新未完成"],
    ["reconciliation_required", "状态待核对"],
	["published", "发布完成"],
  ];
  cases.forEach(([state, title]) => {
    const view = renderPanel(progress(state));
    expect(screen.queryByRole("heading", { name: title })).not.toBeNull();
    view.unmount();
  });
});

test("PublicationProgressPanel shows completion and hides superseded states", () => {
  const published = renderPanel(progress("published"));
  expect(screen.queryByRole("heading", { name: "发布完成" })).not.toBeNull();
  published.unmount();
  const superseded = renderPanel(progress("superseded"));
  expect(superseded.container.firstChild).toBeNull();
});

test("PublicationProgressPanel does not invent an ETA without queue evidence", () => {
  const value = progress("queued");
  if (value.state === "queued") {
    value.queue.jobsAheadEstimate = undefined;
  }
  renderPanel(value);
  expect(screen.queryByText("等待渲染资源")).not.toBeNull();
  expect(screen.queryByText(/前方约/)).toBeNull();
});

test("PublicationProgressPanel shows platform sponsorship only while work is active", () => {
  (["queued", "running", "activating"] as const).forEach((state) => {
    const view = renderPanel(progress(state));
    const link = screen.queryByRole("link", {
      name: /支持渲染服务/,
    });
    expect(link?.getAttribute("href")).toBe(publicAsset("/sponsor"));
    expect(
      link?.querySelector('[data-animate-ui-icon="heart-handshake"]') ?? null,
    ).not.toBeNull();
    expect(
      link?.querySelector('[data-animate-ui-icon="arrow-up-right"]') ?? null,
    ).not.toBeNull();
    view.unmount();
  });
  const failed = renderPanel(progress("failed"));
  expect(screen.queryByRole("link", { name: /支持渲染服务/ })).toBeNull();
  failed.unmount();
});

test("PublicationProgressPanel exposes diagnostics only in author failure view", () => {
  const authorFailure: PublicationProgress = {
    ...base,
    view: "author",
    state: "failed",
    failure: { code: "render_failed", message: "请查看诊断。" },
    author: {
      diagnostics: [
        {
          code: "renderer.failed",
          severity: "error",
          message: "文档转换失败。",
        },
      ],
      diagnosticsPath: "/diagnostics/42",
    },
  };
  const author = renderPanel(authorFailure);
  expect(
    author.container.querySelector('[data-animate-ui-icon="circle-alert"]'),
  ).not.toBeNull();
  expect(screen.queryByText("renderer.failed")).toBeNull();
  const trigger = screen.queryByRole("button", { name: "查看诊断信息" });
  expect(trigger).not.toBeNull();
  if (trigger) fireEvent.click(trigger);
  expect(screen.queryByText("renderer.failed")).not.toBeNull();
  expect(
    screen.queryByRole("link", { name: /打开完整诊断/ })?.getAttribute("href"),
  ).toBe("/diagnostics/42");
  expect(
    screen
      .queryByRole("link", { name: /打开完整诊断/ })
      ?.querySelector('[data-animate-ui-icon="arrow-up-right"]') ?? null,
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "收起诊断信息" })).not.toBeNull();
  author.unmount();
  const publicFailure = renderPanel(progress("failed"));
  expect(screen.queryByText("renderer.failed")).toBeNull();
  expect(screen.queryByRole("button", { name: "查看诊断信息" })).toBeNull();
});
