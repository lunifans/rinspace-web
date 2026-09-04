import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assembleRuntimeShell, immutableCacheControl } from './static-package.mjs';
import { startArtifactServer } from './static-server.mjs';

function fixturePackage() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-server-'));
  const core = path.join(temporary, 'core');
  const output = path.join(temporary, 'package');
  fs.mkdirSync(path.join(core, 'static/js'), { recursive: true });
  fs.writeFileSync(path.join(core, 'static/js/index.12345678.js'), 'export {};\n');
  fs.writeFileSync(path.join(core, 'mockServiceWorker.js'), '// worker\n');
  fs.writeFileSync(path.join(core, 'index.html'), '<!doctype html><html lang="en"><head><meta name="description" content="neutral"><meta name="rinspace-runtime-config" content="./runtime-config.json"><title>Neutral</title></head><body><script type="module" src="./static/js/index.12345678.js"></script></body></html>');
  fs.writeFileSync(path.join(core, 'asset-manifest.json'), '{"files":{"main.js":"/static/js/index.12345678.js"},"entrypoints":["/static/js/index.12345678.js"]}\n');
  fs.writeFileSync(path.join(core, 'version.json'), '{"schemaVersion":1,"applicationVersion":"v1"}\n');
  assembleRuntimeShell({
    coreDirectory: core,
    configFile: 'config/runtime.demo.subpath.json',
    copyCore: false,
    outputDirectory: output,
  });
  assert.equal(fs.existsSync(path.join(output, 'static/js/index.12345678.js')), false);
  return { core, output };
}

test('artifact server provides production-like deep-route fallback, cache, scope, and 404 behavior', async (context) => {
  const fixture = fixturePackage();
  const server = startArtifactServer({ rootDirectory: fixture.output, assetDirectory: fixture.core, port: 0 });
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const route = await fetch(`${origin}/rinspace-demo/a/1010/deep/article`, { headers: { Accept: 'text/html' } });
  assert.equal(route.status, 200);
  assert.match(await route.text(), /Rinspace Web Demo/);
  assert.equal(route.headers.get('cache-control'), 'no-store');
  assert.match(route.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);

  const asset = await fetch(`${origin}/rinspace-demo/static/js/index.12345678.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), immutableCacheControl);
  const missingAsset = await fetch(`${origin}/rinspace-demo/static/js/missing.12345678.js`, { headers: { Accept: 'text/html' } });
  assert.equal(missingAsset.status, 404);
  const outsideMount = await fetch(`${origin}/legal`, { headers: { Accept: 'text/html' } });
  assert.equal(outsideMount.status, 404);
  const worker = await fetch(`${origin}/rinspace-demo/mockServiceWorker.js`);
  assert.equal(worker.headers.get('service-worker-allowed'), '/rinspace-demo/');
  assert.equal(worker.headers.get('cache-control'), 'no-store');
  const health = await fetch(`${origin}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const version = await fetch(`${origin}/version.json`);
  assert.equal((await version.json()).applicationVersion, 'v1');
});
