import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';

import { chromium, firefox, webkit } from 'playwright';

const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4194/rinspace-demo/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const workerURL = new URL(`${basePath}mockServiceWorker.js`, previewURL.origin).toString();
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_MSW_BROWSERS
  ? process.env.RINSPACE_DEMO_MSW_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
  : Object.keys(browserCatalog);

for (const name of selectedNames) {
  if (!(name in browserCatalog)) throw new Error(`Unknown browser: ${name}`);
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The source server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function withSourceServer(operation) {
  if (requestedURL) return operation({ canSwitchRuntime: false, setRuntime: async () => undefined });
  let server = null;
  const stop = async () => {
    if (!server) return;
    const active = server;
    server = null;
    active.kill('SIGTERM');
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      active.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  };
  const setRuntime = async (runtimeConfigFile) => {
    await stop();
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(previewURL.port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RINSPACE_RUNTIME_CONFIG_FILE: runtimeConfigFile,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await waitForServer(appURL);
  };
  try {
    return await operation({ canSwitchRuntime: true, setRuntime });
  } finally {
    await stop();
  }
}

async function waitForApp(page) {
  try {
    await page.goto(appURL, { waitUntil: 'domcontentloaded' });
    await page.locator('header.topbar').waitFor({ state: 'visible' });
  } catch (error) {
    const body = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '<body unavailable>');
    throw new Error(`App did not become ready at ${page.url()}. Body: ${body.slice(0, 1_000)}`, { cause: error });
  }
}

async function validateBrowser(browserName, runtime) {
  const browserType = browserCatalog[browserName];
  const browser = await browserType.launch({
    headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [],
    env: browserEnvironment,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const browserRequests = [];
    page.on('request', (request) => browserRequests.push(request.url()));
    await waitForApp(page);

    const registration = await page.evaluate(async ({ expectedScope, expectedScript }) => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const selected = registrations.find((item) => item.scope === expectedScope);
      if (!selected) throw new Error('Scoped demo worker is missing.');
      const scripts = [selected.active, selected.waiting, selected.installing]
        .map((worker) => worker?.scriptURL)
        .filter(Boolean);
      if (!scripts.includes(expectedScript)) throw new Error('Scoped demo worker script is incorrect.');
      return {
        count: registrations.length,
        scope: selected.scope,
        marker: JSON.parse(localStorage.getItem('rinspace.demo.worker.v1') || '{}'),
      };
    }, { expectedScope: appURL, expectedScript: workerURL });
    assert.equal(registration.count, 1);
    assert.equal(registration.scope, appURL);
    assert.deepEqual(registration.marker, { schemaVersion: 1, scriptURL: workerURL, scope: appURL });

    const responses = await page.evaluate(async (apiBase) => {
      const siteResponse = await fetch(`${apiBase}siteinfo`);
      const contentResponse = await fetch(`${apiBase}content?type=blog&page=2&size=1`);
      return {
        siteStatus: siteResponse.status,
        site: await siteResponse.json(),
        contentStatus: contentResponse.status,
        content: await contentResponse.json(),
      };
    }, `${appURL}api/`);
    assert.equal(responses.siteStatus, 200);
    assert.equal(responses.site.general.name, 'Rinspace Web Demo');
    assert.equal(responses.contentStatus, 200);
    assert.equal(responses.content.count, 3);
    assert.equal(responses.content.items[0].id, '1020');

    const scenario = await page.evaluate(async (apiBase) => {
      localStorage.setItem('rinspace.demo.scenario.v1', 'unauthorized');
      const response = await fetch(`${apiBase}content`);
      const payload = await response.json();
      localStorage.removeItem('rinspace.demo.scenario.v1');
      return { status: response.status, payload };
    }, `${appURL}api/`);
    assert.equal(scenario.status, 401);
    assert.equal(scenario.payload.error.code, 'demo.scenario.unauthorized');

    const beforeBlocked = browserRequests.length;
    const blocked = await page.evaluate(async ({ apiBase, urls }) => {
      const results = [];
      for (const url of [`${apiBase}not-registered`, ...urls]) {
        try {
          await fetch(url);
          results.push({ url, blocked: false });
        } catch (error) {
          results.push({
            url,
            blocked: true,
            code: error && typeof error === 'object' && 'code' in error ? error.code : null,
          });
        }
      }
      return results;
    }, {
      apiBase: `${appURL}api/`,
      urls: [
        'https://rinspace.com/api/feed',
        'https://example.tcloudbasegateway.com/auth/v1/user',
        'https://gitea.example.invalid/api/v1/user',
        'https://pay.example.invalid/checkout',
        'https://upload.example.invalid/object',
        'https://renderer.example.invalid/render',
      ],
    });
    assert.ok(blocked.every((result) => result.blocked));
    assert.equal(blocked[0].code, 'network.path_unregistered');
    assert.ok(blocked.slice(1).every((result) => result.code === 'network.external_blocked'));
    assert.equal(browserRequests.length, beforeBlocked);

    await waitForApp(page);
    const afterRestart = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((items) => items.length));
    assert.equal(afterRestart, 1);

    await page.evaluate(async ({ scriptURL, scope }) => {
      await navigator.serviceWorker.register(scriptURL, { scope });
    }, { scriptURL: workerURL, scope: `${appURL}unrelated/` });
    if (runtime.canSwitchRuntime) {
      await runtime.setRuntime('runtime.integration.subpath.json');
      await waitForApp(page);
      const cleanup = await page.evaluate(async ({ expectedScope, unrelatedScope }) => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const entityCount = await new Promise((resolve, reject) => {
        const open = indexedDB.open('rinspace.demo.repository');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const count = database.transaction('entities', 'readonly').objectStore('entities').count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => {
            database.close();
            resolve(count.result);
          };
        };
      });
      return {
        expectedPresent: registrations.some((item) => item.scope === expectedScope),
        unrelatedPresent: registrations.some((item) => item.scope === unrelatedScope),
        marker: localStorage.getItem('rinspace.demo.worker.v1'),
        entityCount,
      };
      }, { expectedScope: appURL, unrelatedScope: `${appURL}unrelated/` });
      assert.equal(cleanup.expectedPresent, false);
      assert.equal(cleanup.unrelatedPresent, true);
      assert.equal(cleanup.marker, null);
      assert.equal(cleanup.entityCount, 23);
    }

    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((item) => item.unregister()));
    });
    await context.close();
    const externalRequests = browserRequests.filter((requestURL) => new URL(requestURL).origin !== previewURL.origin);
    assert.deepEqual(externalRequests, []);
    return { browser: browserName, scope: basePath, handlers: 29, scenarios: 9 };
  } finally {
    await browser.close();
  }
}

await withSourceServer(async (runtime) => {
  const results = [];
  for (const browserName of selectedNames) {
    if (runtime.canSwitchRuntime) await runtime.setRuntime('runtime.demo.subpath.json');
    results.push(await validateBrowser(browserName, runtime));
  }
  process.stdout.write(`${JSON.stringify({ passed: true, results }, null, 2)}\n`);
});
