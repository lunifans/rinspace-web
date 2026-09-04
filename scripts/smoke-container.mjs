import assert from 'node:assert/strict';
import process from 'node:process';

const origin = process.env.RINSPACE_SMOKE_ORIGIN || 'http://127.0.0.1:8080';
const basePath = process.env.RINSPACE_SMOKE_BASE_PATH || '/';
const expectedCommit = process.env.RINSPACE_SMOKE_COMMIT || '';
const mounted = basePath === '/' ? origin : `${origin}${basePath.slice(0, -1)}`;

async function eventually(pathname) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}${pathname}`);
      if (response.ok) return response;
      lastError = new Error(`${pathname} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new Error(`Timed out waiting for ${pathname}`);
}

const health = await eventually('/healthz');
assert.deepEqual(await health.json(), { status: 'ok' });
const versionResponse = await eventually('/version.json');
assert.equal(versionResponse.headers.get('cache-control'), 'no-store');
const version = await versionResponse.json();
if (expectedCommit) assert.equal(version.sourceCommit, expectedCommit);

const deepRoute = await fetch(`${mounted}/a/1010/local-error-atlas`, { headers: { Accept: 'text/html' } });
assert.equal(deepRoute.status, 200);
assert.equal(deepRoute.headers.get('cache-control'), 'no-store');
assert.match(deepRoute.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
const html = await deepRoute.text();
assert.ok(html.includes(`content="${basePath}runtime-config.json"`));
const scriptPath = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
assert.ok(scriptPath?.startsWith(`${basePath}static/js/`));

const script = await fetch(`${origin}${scriptPath}`);
assert.equal(script.status, 200);
assert.equal(script.headers.get('cache-control'), 'public, max-age=31536000, immutable');
const configResponse = await fetch(`${origin}${basePath}runtime-config.json`);
assert.equal(configResponse.headers.get('cache-control'), 'no-store');
assert.equal((await configResponse.json()).basePath, basePath);
const worker = await fetch(`${origin}${basePath}mockServiceWorker.js`);
assert.equal(worker.headers.get('service-worker-allowed'), basePath);
const missingAsset = await fetch(`${origin}${basePath}static/js/missing.12345678.js`, { headers: { Accept: 'text/html' } });
assert.equal(missingAsset.status, 404);

process.stdout.write(`Container smoke passed for ${basePath}.\n`);
