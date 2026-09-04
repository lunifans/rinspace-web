import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assembleRuntimeShell, immutableCacheControl } from './static-package.mjs';

function writeCore(directory, version) {
  fs.mkdirSync(path.join(directory, 'static/js'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'static/css'), { recursive: true });
  const hash = crypto.createHash('sha256').update(version).digest('hex').slice(0, 8);
  const js = `static/js/index.${hash}.js`;
  const css = `static/css/index.${hash}.css`;
  fs.writeFileSync(path.join(directory, js), `globalThis.__fixture=${JSON.stringify(version)};\n`);
  fs.writeFileSync(path.join(directory, css), 'body{margin:0}\n');
  fs.writeFileSync(path.join(directory, 'mockServiceWorker.js'), '// fixture worker\n');
  fs.writeFileSync(path.join(directory, 'bootstrap-theme.js'), '// fixture theme\n');
  fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><head><meta name="description" content="neutral"><meta name="rinspace-runtime-config" content="./runtime-config.json"><link rel="stylesheet" href="./${css}"><title>Neutral</title></head><body><script src="./bootstrap-theme.js"></script><script type="module" src="./${js}"></script></body></html>`);
  fs.writeFileSync(path.join(directory, 'asset-manifest.json'), `${JSON.stringify({ files: { 'main.js': `/${js}`, 'main.css': `/${css}` }, entrypoints: [`/${js}`, `/${css}`] }, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, 'version.json'), `${JSON.stringify({ schemaVersion: 1, applicationVersion: version })}\n`);
  return { js, css };
}

test('one neutral core assembles root and subpath shells without changing immutable resources', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-package-'));
  const core = path.join(temporary, 'core');
  const root = path.join(temporary, 'root');
  const subpath = path.join(temporary, 'subpath');
  const assets = writeCore(core, 'v1');
  const rootResult = assembleRuntimeShell({ coreDirectory: core, configFile: 'config/runtime.demo.json', outputDirectory: root, expectedBasePath: '/' });
  const subpathResult = assembleRuntimeShell({ coreDirectory: core, configFile: 'config/runtime.demo.subpath.json', outputDirectory: subpath, expectedBasePath: '/rinspace-demo/' });

  assert.deepEqual(rootResult.immutableDigests, subpathResult.immutableDigests);
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /content="\/runtime-config\.json"/);
  const subpathHtml = fs.readFileSync(path.join(subpath, 'index.html'), 'utf8');
  assert.ok(subpathHtml.includes(`src="/rinspace-demo/${assets.js}"`));
  assert.match(subpathHtml, /rel="canonical" href="http:\/\/localhost:4173\/rinspace-demo\/"/);
  assert.equal(fs.readFileSync(path.join(subpath, '404.html'), 'utf8'), subpathHtml);
  const manifest = JSON.parse(fs.readFileSync(path.join(subpath, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/rinspace-demo/');
  assert.equal(manifest.scope, '/rinspace-demo/');
  const headers = JSON.parse(fs.readFileSync(path.join(subpath, 'static-headers.json'), 'utf8'));
  assert.equal(headers.serviceWorker.allowedScope, '/rinspace-demo/');
  assert.ok(headers.cacheRules.some((rule) => rule.cacheControl === immutableCacheControl && rule.paths.includes(`/rinspace-demo/${assets.js}`)));
  assert.match(headers.securityHeaders['Content-Security-Policy'], /connect-src 'self'/);
});

test('packaging fails closed for a basePath mismatch and symbolic-link core input', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-package-invalid-'));
  const core = path.join(temporary, 'core');
  writeCore(core, 'v1');
  assert.throws(() => assembleRuntimeShell({
    coreDirectory: core,
    configFile: 'config/runtime.demo.json',
    outputDirectory: path.join(temporary, 'out'),
    expectedBasePath: '/other/',
  }), /does not match/);
  fs.symlinkSync(path.join(core, 'index.html'), path.join(core, 'linked-index.html'));
  assert.throws(() => assembleRuntimeShell({
    coreDirectory: core,
    configFile: 'config/runtime.demo.json',
    outputDirectory: path.join(temporary, 'out'),
  }), /symbolic links/);
});

test('a previous complete core can be restored after a newer package is assembled', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-package-rollback-'));
  const coreV1 = path.join(temporary, 'core-v1');
  const coreV2 = path.join(temporary, 'core-v2');
  const output = path.join(temporary, 'active');
  writeCore(coreV1, 'v1');
  writeCore(coreV2, 'v2');
  const first = assembleRuntimeShell({ coreDirectory: coreV1, configFile: 'config/runtime.demo.json', outputDirectory: output });
  assembleRuntimeShell({ coreDirectory: coreV2, configFile: 'config/runtime.demo.json', outputDirectory: output });
  const restored = assembleRuntimeShell({ coreDirectory: coreV1, configFile: 'config/runtime.demo.json', outputDirectory: output });
  assert.deepEqual(restored.immutableDigests, first.immutableDigests);
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'version.json'), 'utf8')).applicationVersion, 'v1');
});
