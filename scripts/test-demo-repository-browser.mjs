import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

import { chromium, firefox, webkit } from 'playwright';

const databaseName = 'rinspace.demo.repository';
const seedManifest = JSON.parse(fs.readFileSync(new URL('../src/demo/fixtures/v1/seed-manifest.generated.json', import.meta.url), 'utf8'));
const seedFixture = JSON.parse(fs.readFileSync(new URL('../src/demo/fixtures/v1/dataset.json', import.meta.url), 'utf8'));
if (typeof seedManifest.checksum !== 'string' || typeof seedManifest.counts?.entities !== 'number') {
  throw new Error('Generated demo seed manifest is invalid.');
}
if (seedFixture.datasetVersion !== seedManifest.datasetVersion) throw new Error('Demo fixture version does not match its manifest.');
const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4193/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const assetURL = new URL(`${basePath}mockServiceWorker.js`, previewURL.origin).toString();
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_REPOSITORY_BROWSERS
  ? process.env.RINSPACE_DEMO_REPOSITORY_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
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
  if (requestedURL) return operation();
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(previewURL.port)], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    await waitForServer(appURL);
    return await operation();
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      server.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

const pageDiagnostics = new WeakMap();

function attachDiagnostics(page) {
  const diagnostics = [];
  pageDiagnostics.set(page, diagnostics);
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));
  page.on('requestfailed', (request) => diagnostics.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) diagnostics.push(`navigation:${frame.url()}`);
  });
}

async function waitForApp(page, navigate) {
  const diagnostics = pageDiagnostics.get(page) ?? [];
  try {
    await navigate();
    await page.locator('header.topbar').waitFor({ state: 'visible' });
  } catch (error) {
    const body = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '<body unavailable>');
    throw new Error(`App did not become ready at ${page.url()}. Body: ${body.slice(0, 1_000)}. Diagnostics: ${diagnostics.slice(-30).join(' | ')}`, { cause: error });
  }
}

async function openApp(page) {
  attachDiagnostics(page);
  await waitForApp(page, () => page.goto(appURL, { waitUntil: 'domcontentloaded' }));
}

async function repositorySnapshot(page) {
  return page.evaluate((name) => new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(['meta', 'preferences'], 'readonly');
      const metaRequest = transaction.objectStore('meta').get('repository');
      const preferenceRequest = transaction.objectStore('preferences').get('browser-check');
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        const entities = database.transaction('entities', 'readonly').objectStore('entities');
        const drafts = database.transaction('drafts', 'readonly').objectStore('drafts');
        const result = {
          version: database.version,
          stores: Array.from(database.objectStoreNames),
          entityIndexes: Array.from(entities.indexNames),
          draftIndexes: Array.from(drafts.indexNames),
          metadata: metaRequest.result,
          preference: preferenceRequest.result,
        };
        database.close();
        resolve(result);
      };
    };
  }), databaseName);
}

async function putBrowserPreference(page, value) {
  await page.evaluate(({ name, nextValue }) => new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('preferences', 'readwrite');
      transaction.objectStore('preferences').put({
        key: 'browser-check',
        value: nextValue,
        updatedAt: '2026-09-01T00:00:00.000Z',
      });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
    };
  }), { name: databaseName, nextValue: value });
}

async function countStore(page, storeName) {
  return page.evaluate(({ name, selectedStore }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(selectedStore, 'readonly');
      const count = transaction.objectStore(selectedStore).count();
      count.onerror = () => reject(count.error);
      count.onsuccess = () => {
        database.close();
        resolve(count.result);
      };
    };
  }), { name: databaseName, selectedStore: storeName });
}

async function createLegacyDatabase(page, metadata, holdOpen = false, fixture = null) {
  await page.evaluate(({ name, seedMetadata, keepOpen, seedFixture: fixtureInput }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('meta', { keyPath: 'key' });
      const entities = database.createObjectStore('entities', { keyPath: 'key' });
      entities.createIndex('by-kind', 'kind');
      const relations = database.createObjectStore('relations', { keyPath: 'key' });
      relations.createIndex('by-kind', 'kind');
      relations.createIndex('by-source', ['sourceKind', 'sourceId']);
      relations.createIndex('by-target', ['targetKind', 'targetId']);
      const drafts = database.createObjectStore('drafts', { keyPath: 'key' });
      drafts.createIndex('by-owner', 'ownerId');
      const blobs = database.createObjectStore('blobs', { keyPath: 'key' });
      blobs.createIndex('by-created-at', 'createdAt');
      const preferences = database.createObjectStore('preferences', { keyPath: 'key' });
      preferences.createIndex('by-updated-at', 'updatedAt');
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      if (keepOpen) {
        Object.defineProperty(window, '__rinHeldDemoDatabase', { value: database, configurable: true });
        resolve();
        return;
      }
      const transaction = database.transaction(['meta', 'entities', 'relations', 'drafts', 'blobs', 'preferences'], 'readwrite');
      transaction.objectStore('meta').put({ ...seedMetadata, schemaVersion: 1 });
      for (const entity of fixtureInput?.entities ?? []) transaction.objectStore('entities').put(entity);
      for (const relation of fixtureInput?.relations ?? []) transaction.objectStore('relations').put(relation);
      for (const draft of fixtureInput?.drafts ?? []) transaction.objectStore('drafts').put(draft);
      for (const asset of fixtureInput?.assets ?? []) {
        transaction.objectStore('blobs').put({
          key: asset.key,
          name: asset.name,
          type: asset.type,
          bytes: new TextEncoder().encode(asset.text),
          createdAt: asset.createdAt,
        });
      }
      for (const preference of fixtureInput?.preferences ?? []) transaction.objectStore('preferences').put(preference);
      transaction.objectStore('preferences').put({
        key: 'browser-check',
        value: 'preserve-on-upgrade',
        updatedAt: '2026-09-01T00:00:00.000Z',
      });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
    };
  }), { name: databaseName, seedMetadata: metadata, keepOpen: holdOpen, seedFixture: fixture });
}

async function validateLifecycle(browserType, browserName) {
  const browser = await browserType.launch({
    headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [],
    env: browserEnvironment,
  });
  try {
    const lifecycle = await browser.newContext();
    const page = await lifecycle.newPage();
    await openApp(page);
    const initial = await repositorySnapshot(page);
    assert.equal(initial.version, 2);
    assert.deepEqual(initial.stores.sort(), ['blobs', 'drafts', 'entities', 'meta', 'preferences', 'relations']);
    assert.equal(initial.metadata.schemaVersion, 2);
    assert.equal(initial.metadata.datasetVersion, 'rinspace-demo-v1');
    assert.equal(initial.metadata.state, 'ready');
    assert.equal(initial.metadata.checksum, seedManifest.checksum);
    const initialEntityCount = await countStore(page, 'entities');
    assert.equal(initialEntityCount, seedManifest.counts.entities);
    const demoLocalStorage = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('rinspace.demo.')));
    assert.deepEqual(demoLocalStorage.sort(), ['rinspace.demo.persona.v1', 'rinspace.demo.worker.v1']);
    await putBrowserPreference(page, 'persists-after-reload');
    // A same-URL navigation restarts the document without Playwright's hard-reload
    // behavior, which intentionally bypasses the Service Worker in Firefox.
    await waitForApp(page, () => page.goto(appURL, { waitUntil: 'domcontentloaded' }));
    assert.equal((await repositorySnapshot(page)).preference.value, 'persists-after-reload');
    await lifecycle.close();

    const migration = await browser.newContext();
    const utility = await migration.newPage();
    await utility.goto(assetURL);
    await createLegacyDatabase(utility, initial.metadata, false, seedFixture);
    const upgradedPage = utility;
    await openApp(upgradedPage);
    const upgraded = await repositorySnapshot(upgradedPage);
    assert.equal(upgraded.version, 2);
    assert.equal(upgraded.metadata.schemaVersion, 2);
    assert.equal(upgraded.preference.value, 'preserve-on-upgrade');
    assert.equal(await countStore(upgradedPage, 'entities'), seedManifest.counts.entities);
    assert.equal(await countStore(upgradedPage, 'blobs'), seedManifest.counts.blobs);
    assert.ok(upgraded.entityIndexes.includes('by-kind-updated-at'));
    assert.ok(upgraded.draftIndexes.includes('by-owner-updated-at'));
    await migration.close();

    const multiTab = await browser.newContext();
    const first = await multiTab.newPage();
    await openApp(first);
    const [second] = await Promise.all([
      multiTab.waitForEvent('page'),
      first.evaluate((url) => { window.open(url, '_blank'); }, appURL),
    ]);
    attachDiagnostics(second);
    await waitForApp(second, () => second.waitForLoadState('domcontentloaded'));
    await second.evaluate((name) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('versionchange blocked'));
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    }), databaseName);
    await first.locator('[data-rin-demo-repository-status="versionchange"]').waitFor({ state: 'visible' });
    await second.locator('[data-rin-demo-repository-status="versionchange"]').waitFor({ state: 'visible' });
    await multiTab.close();

    const blocked = await browser.newContext();
    const blocker = await blocked.newPage();
    await blocker.goto(assetURL);
    await createLegacyDatabase(blocker, null, true);
    const blockedApp = await blocked.newPage();
    await blockedApp.goto(appURL, { waitUntil: 'domcontentloaded' });
    await blockedApp.locator('[data-rin-bootstrap-error="true"]').waitFor({ state: 'visible' });
    assert.match(await blockedApp.locator('[data-rin-bootstrap-error="true"]').textContent(), /demo_repository_upgrade_blocked/);
    await blocker.evaluate(() => {
      window.__rinHeldDemoDatabase?.close();
      delete window.__rinHeldDemoDatabase;
    });
    await blocked.close();

    return { browser: browserName, stores: initial.stores.length, schemaVersion: initial.version };
  } finally {
    await browser.close();
  }
}

await withSourceServer(async () => {
  const results = [];
  for (const browserName of selectedNames) {
    results.push(await validateLifecycle(browserCatalog[browserName], browserName));
  }
  process.stdout.write(`${JSON.stringify({ passed: true, results }, null, 2)}\n`);
});
