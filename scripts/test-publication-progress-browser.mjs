#!/usr/bin/env node

import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = (
  process.env.RINSPACE_BROWSER_BASE_URL || "http://127.0.0.1:4173"
).replace(/\/$/, "");
const chromiumPath = process.env.CHROMIUM_BIN;
const now = new Date().toISOString();

function postFixture(kind) {
  const contentId = kind === "book" ? "102" : "101";
  const result = {
    id: contentId,
    type: kind,
    title: "渲染状态浏览器验收",
    author: "Rin Author",
    authorId: "author-1",
    authorUid: "author-uid-1",
    meta: "刚刚发布",
    excerpt: "用于验证侧栏状态组件。",
    interactions: "12 阅读 · 0 评论",
    heat: "12",
    tags: ["Rinspace"],
    images: [],
    slug: "publication-progress-browser",
    body: "# 正文标题\n\n这是作品正文。",
    readCount: 12,
    collected: false,
    createdAt: now,
    updatedAt: now,
  };
  if (kind === "book") {
    result.book = {
      kind: "markdown",
      bookTitle: "渲染状态测试书",
      authors: ["Rin Author"],
      toc: [{ title: "第一章", page: 1, level: 2 }],
    };
  }
  return result;
}

function progressFixture(state, contentId, knownEta = true) {
  const result = {
    schemaVersion: "rin-publication-progress/v1",
    view: "public",
    projectId: `${contentId === "102" ? "book" : "article"}:${contentId}`,
    state,
    displayingPreviousVersion: true,
    updatedAt: now,
    sourceCommitShort: "abcdef1",
  };
  if (state === "queued") {
    result.queue = {
      ...(knownEta ? { jobsAheadEstimate: 3 } : {}),
      queuedProjects: 4,
      activeProjects: 1,
      estimate: knownEta
        ? {
            estimatedStartAt: now,
            estimatedStartRange: { earliest: now, latest: now },
            confidence: "medium",
            sampleCount: 12,
            estimatorVersion: "v1",
            scope: "instance",
            calculatedAt: now,
          }
        : null,
      scope: "instance",
      calculatedAt: now,
    };
  } else if (state === "running") {
    result.run = {
      stage: "document_compile",
      elapsedSeconds: 37,
      progress: { completedStages: 2, totalStages: 4 },
    };
  } else if (state === "failed") {
    result.failure = {
      code: "render_failed",
      message: "渲染服务未能完成本次任务。",
    };
  }
  return result;
}

const state = { name: "queued", knownEta: true, progressRequests: 0 };
const consoleErrors = [];

async function handle(route) {
  const path = new URL(route.request().url()).pathname.replace(
    /^\/rinspace(?=\/)/,
    "",
  );
  if (path.endsWith("/publication-progress")) {
    state.progressRequests += 1;
    const contentId = path.split("/").at(-2);
    if (state.name === "idle") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      json: progressFixture(state.name, contentId, state.knownEta),
    });
    return;
  }
  if (path === "/api/content/101") {
    await route.fulfill({ json: postFixture("blog") });
    return;
  }
  if (path === "/api/content/102") {
    await route.fulfill({ json: postFixture("book") });
    return;
  }
  if (path === "/api/books/102/read") {
    await route.fulfill({
      json: {
        post: postFixture("book"),
        toc: [{ id: "chapter-1", text: "第一章", level: 2 }],
        page: {
          id: "chapter-1",
          text: "第一章",
          level: 2,
          html: "<p>书籍正文。</p>",
        },
        pageIndex: 0,
        pageCount: 1,
        source: "renderer",
      },
    });
    return;
  }
  if (path === "/api/books/102/reviews") {
    await route.fulfill({
      json: {
        items: [],
        rating: { averageScore: 0, reviewCount: 0, breakdown: [] },
      },
    });
    return;
  }
  if (path === "/api/revisions") {
    await route.fulfill({ json: { items: [] } });
    return;
  }
  if (path === "/api/meta/reaction") {
    await route.fulfill({ json: { reaction_summary: [] } });
    return;
  }
  if (/^\/api\/content\/(?:101|102)\/book-context$/.test(path)) {
    await route.fulfill({ json: { items: [], generatedAt: now } });
    return;
  }
  if (path === "/api/books/102/related") {
    await route.fulfill({ json: { items: [], count: 0, page: 1, pageSize: 0, generatedAt: now } });
    return;
  }
  if (path === "/api/books/102/chapters/activity") {
    await route.fulfill({ json: { bookId: "102", chapters: [] } });
    return;
  }
  if (path === "/api/books/102/activity") {
    await route.fulfill({
      json: {
        bookId: "102",
        items: [],
        counts: {},
        total: 0,
        page: 1,
        pageSize: 0,
        generatedAt: now,
      },
    });
    return;
  }
  await route.fulfill({ json: {} });
}

async function assertSidebar(page, path, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
  const panel = page.locator(".detail-side > .publication-progress-panel");
  await panel.waitFor({ state: "visible" });
  assert.equal(await panel.count(), 1, `expected one sidebar panel at ${path}`);
  assert.equal(
    await panel.evaluate(
      (node) => node.nextElementSibling === node.parentElement.lastElementChild,
    ),
    true,
  );
  assert.equal(
    await page.locator(".detail-main .publication-progress-panel").count(),
    0,
  );
}

async function assertBookReaderKeepsTheContextRailClear(page, path, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator(".book-reader-article").waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".publication-progress-panel").count(),
    0,
    `book reader must reserve its contextual rail for content at ${path}`,
  );
}

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ["--no-sandbox", "--no-proxy-server"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "rinspace-language-preference-v1",
      JSON.stringify({ preference: "zh-CN" }),
    );
  });
  await page.route("**/api/**", handle);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const viewport of [1440, 390]) {
    await assertSidebar(page, "/a/101/publication-progress-browser", viewport);
    await assertSidebar(
      page,
      "/books/102/publication-progress-browser",
      viewport,
    );
    await assertBookReaderKeepsTheContextRailClear(
      page,
      "/books/102/read/publication-progress-browser",
      viewport,
    );
  }

  state.knownEta = false;
  await assertSidebar(page, "/a/101/publication-progress-browser", 1440);
  assert.match(
    await page.locator(".publication-progress-detail").innerText(),
    /等待渲染资源/,
  );

  state.name = "running";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".state-running").waitFor({ state: "visible" });
  assert.match(
    await page.locator(".publication-progress-detail").innerText(),
    /文档转换/,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.match(
    await page
      .locator(".publication-progress-meter span")
      .evaluate((node) => getComputedStyle(node).transitionDuration),
    /^(?:0s|0\.001s)$/,
  );

  state.name = "failed";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".state-failed").waitFor({ state: "visible" });
  assert.equal(await page.locator(".publication-progress-support").count(), 0);

  state.name = "queued";
  state.knownEta = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  const sponsor = page.locator(".publication-progress-support a");
  await sponsor.waitFor({ state: "visible" });
  await sponsor.focus();
  assert.notEqual(
    await sponsor.evaluate((node) => getComputedStyle(node).outlineStyle),
    "none",
  );
  await sponsor.click();
  await page.waitForURL(`${baseURL}/sponsor`);

  await page.goto(`${baseURL}/a/101/publication-progress-browser`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator(".publication-progress-panel")
    .waitFor({ state: "visible" });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenCount = state.progressRequests;
  await page.waitForTimeout(5500);
  assert.equal(
    state.progressRequests,
    hiddenCount,
    "hidden page continued polling",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  assert.ok(
    state.progressRequests > hiddenCount,
    "visible page did not resume immediately",
  );

  state.name = "idle";
  await page.goto(`${baseURL}/a/101/publication-progress-browser`, {
    waitUntil: "domcontentloaded",
  });
  assert.equal(await page.locator(".publication-progress-panel").count(), 0);
  state.name = "published";
  await page.waitForTimeout(5500);
  assert.equal(await page.locator(".publication-progress-panel").count(), 1);
  assert.equal(
    await page.getByRole("heading", { name: "发布完成" }).count(),
    1,
  );
  state.name = "idle";
  await page.waitForTimeout(5500);
  assert.equal(await page.locator(".publication-progress-panel").count(), 0);
  assert.deepEqual(
    consoleErrors,
    [],
    `browser console errors: ${consoleErrors.join("; ")}`,
  );
} finally {
  await browser.close();
}

console.log("publication progress browser acceptance passed");
