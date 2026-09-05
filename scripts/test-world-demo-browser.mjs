import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || "http://127.0.0.1:4214/");
const basePath =
  previewURL.pathname === "/"
    ? "/"
    : `${previewURL.pathname.replace(/\/+$/, "")}/`;
const appURL = new URL(basePath, previewURL.origin);

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The local source server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function withServer(operation) {
  if (requestedURL) return operation();
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      previewURL.port,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RINSPACE_RUNTIME_CONFIG_FILE: "runtime.demo.json",
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  try {
    await waitForServer(appURL);
    return await operation();
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

function target(relative) {
  return new URL(relative.replace(/^\//, ""), appURL).toString();
}

async function gotoStable(page, relative) {
  await page.goto(target(relative), { waitUntil: "domcontentloaded" });
  await page
    .locator("header.topbar")
    .waitFor({ state: "visible", timeout: 20_000 });
  await page
    .locator("main")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

async function assertAccessible(page) {
  const report = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  assert.deepEqual(
    report.violations.map((violation) => violation.id),
    [],
  );
}

await withServer(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      "rinspace-language-preference-v1",
      JSON.stringify({ preference: "zh-CN" }),
    );
  });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });

  await gotoStable(page, "/");
  assert.equal(await page.locator('[data-demo-world="inner"]').count(), 0);
  await page.locator("a.rin-world-shell__logo").click();
  await page.waitForURL((url) => url.searchParams.get("world") === "inner");
  await page.locator('[data-demo-world="inner"]').waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-demo-post-id]").count(), 3);
  assert.equal(
    (await page.locator('a[href="/@demo-orbit-reader?world=inner"]').count()) >
      0,
    true,
  );
  assert.equal(
    (await page
      .locator('a[href="/tags/reproducibility?world=inner"]')
      .count()) > 0,
    true,
  );
  assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
  await assertAccessible(page);

  await gotoStable(page, "/p/7001001");
  assert.equal(
    await page.locator("main").getAttribute("data-demo-post-state"),
    "missing",
  );
  assert.match(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
    /\/p\/7001001\/local-first-community-design$/,
  );

  await gotoStable(page, "/p/7001001/not-the-current-slug");
  assert.equal(
    await page.locator("main").getAttribute("data-demo-post-state"),
    "incorrect",
  );
  assert.equal(await page.locator('[data-demo-post-id="7001001"]').count(), 1);
  await assertAccessible(page);

  await gotoStable(page, "/p/9999999/anything");
  assert.equal(
    await page.locator("main").getAttribute("data-demo-post-state"),
    "not-found",
  );

  await gotoStable(page, "/?world=inner&demoState=degraded");
  assert.equal(
    await page
      .locator("[data-demo-world-state]")
      .getAttribute("data-demo-world-state"),
    "degraded",
  );
  assert.equal(await page.locator("[data-demo-post-id]").count(), 0);

  await gotoStable(page, "/books");
  assert.equal(
    await page.locator("a.rin-world-shell__logo").getAttribute("href"),
    "/?world=inner",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, "/?world=inner");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.clientWidth),
    390,
  );

  const externalRequests = requests.filter((requestURL) => {
    const url = new URL(requestURL);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.origin !== previewURL.origin
    );
  });
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  await context.close();
  await browser.close();
  process.stdout.write(
    `${JSON.stringify(
      {
        passed: true,
        worlds: ["outer", "inner"],
        posts: 3,
        slugStates: ["canonical", "missing", "incorrect", "not-found"],
        degraded: "fail-closed",
        externalRequests: 0,
        viewport: "390x844",
      },
      null,
      2,
    )}\n`,
  );
});
