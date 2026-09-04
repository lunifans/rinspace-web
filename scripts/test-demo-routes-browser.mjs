import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

import { expect } from '@playwright/test';
import { chromium, firefox, webkit } from 'playwright';

const coverage = JSON.parse(fs.readFileSync(new URL('../contracts/demo-coverage.json', import.meta.url), 'utf8'));
const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4210/rinspace-demo/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const canonicalOrigin = 'http://localhost:4173';
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_ROUTE_BROWSERS
  ? process.env.RINSPACE_DEMO_ROUTE_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
  : Object.keys(browserCatalog);

for (const name of selectedNames) {
  if (!(name in browserCatalog)) throw new Error(`Unknown browser: ${name}`);
}

assert.equal(coverage.schemaVersion, 'rinspace-demo-coverage/v1');
assert.equal(coverage.routeCount, 85);
assert.equal(coverage.playwright.cases.length, 16);

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The source server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function withSourceServer(operation) {
  if (requestedURL) return operation();
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(previewURL.port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RINSPACE_RUNTIME_CONFIG_FILE: basePath === '/' ? 'runtime.demo.json' : 'runtime.demo.subpath.json',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    await waitForServer(appURL);
    return await operation();
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      server.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
}

function routeURL(testCase) {
  const relative = testCase.testPath === '/' ? '' : testCase.testPath.replace(/^\//, '');
  const url = new URL(relative, appURL);
  url.searchParams.set('demoPersona', testCase.persona);
  return url.toString();
}

function routePath(testCase) {
  return new URL(routeURL(testCase)).pathname;
}

async function assertExpected(page, testCase) {
  if (testCase.expected === 'authentication-outcome') {
    await expect(page.getByText('需要登录', { exact: true }).first()).toBeVisible();
    return;
  }
  if (testCase.expected === 'authorization-outcome') {
    await expect(page.getByRole('heading', { name: '需要权限' })).toBeVisible();
    return;
  }
  if (testCase.expected === 'capability-boundary') {
    await expect(page.locator('[data-rin-demo-capability]')).toBeVisible();
    return;
  }
  if (testCase.expected === 'unsupported-explanation') {
    await expect(page.locator('[data-rin-demo-route-support="not-yet-supported"]')).toBeVisible();
    return;
  }
  assert.equal(testCase.expected, 'render');
  await expect(page.locator('main').first()).toBeVisible();
  await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);
}

async function validateBrowser(browserName) {
  const browser = await browserCatalog[browserName].launch({
    headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [],
    env: browserEnvironment,
  });
  try {
    const requests = [];
    const runtimeErrors = [];
    for (const persona of ['guest', 'member']) {
      const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 820 } });
      await context.addInitScript(() => {
        localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'zh-CN' }));
      });
      const page = await context.newPage();
      page.on('request', (request) => requests.push(request.url()));
      page.on('response', (response) => {
        if (response.status() >= 400) runtimeErrors.push(`http:${response.status()}:${response.url()}`);
      });
      page.on('pageerror', (error) => runtimeErrors.push(`pageerror:${page.url()}:${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') runtimeErrors.push(`console:${page.url()}:${message.text()}`);
      });
      const personaCases = coverage.playwright.cases.filter((testCase) => testCase.persona === persona);
      for (const [index, testCase] of personaCases.entries()) {
        process.stderr.write(`[demo-routes:${browserName}] ${testCase.id} ${testCase.path}\n`);
        const targetPath = routePath(testCase);
        if (index === 0) {
          await page.goto(routeURL(testCase), { waitUntil: 'domcontentloaded' });
        } else {
          await page.evaluate((pathname) => {
            window.history.pushState(null, '', pathname);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }, targetPath);
          await page.waitForFunction((pathname) => window.location.pathname === pathname, targetPath);
        }
        await page.locator('header.topbar').waitFor({ state: 'visible', timeout: 20_000 });
        await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);
        await assertExpected(page, testCase);

        const head = await page.evaluate(() => ({
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
          canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
          description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
          siteName: document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '',
          ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',
          title: document.title,
        }));
        assert.equal(head.canonicalCount, 1, `${testCase.id} must expose exactly one canonical URL`);
        assert.ok(head.canonical.startsWith(`${canonicalOrigin}${basePath}`), `${testCase.id} canonical: ${head.canonical}`);
        assert.equal(head.ogUrl, head.canonical);
        assert.equal(head.siteName, 'Rinspace Web Demo');
        assert.ok(head.description.length > 0);
        assert.ok(head.title.includes('Rinspace Web Demo') || testCase.expected !== 'render');
        assert.equal(JSON.stringify(head).includes('https://rinspace.com'), false);
      }
      await page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      });
      await context.close();
    }

    const actionableErrors = runtimeErrors.filter((message) => {
      if (browserName === 'webkit' && message.endsWith(':The operation is insecure.')) return false;
      return ![
        'http:401:',
        'the server responded with a status of 401',
        "document is sandboxed and lacks the 'allow-same-origin' flag",
        "frame is sandboxed and the 'allow-scripts' permission is not set",
      ].some((expected) => message.includes(expected));
    });
    assert.deepEqual(actionableErrors, []);
    const external = requests.filter((requestURL) => {
      const url = new URL(requestURL);
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== previewURL.origin;
    });
    assert.deepEqual(external, []);

    return {
      browser: browserName,
      cases: coverage.playwright.cases.length,
      families: [...new Set(coverage.playwright.cases.map((item) => item.family))],
      personas: ['guest', 'member'],
      supportStates: [...new Set(coverage.playwright.cases.map((item) => item.support))],
      externalRequests: external.length,
    };
  } finally {
    await browser.close();
  }
}

await withSourceServer(async () => {
  const results = [];
  for (const browserName of selectedNames) results.push(await validateBrowser(browserName));
  process.stdout.write(`${JSON.stringify({ passed: true, routeCount: coverage.routeCount, results }, null, 2)}\n`);
});
