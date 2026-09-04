import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assembleOfficialReleaseShell } from './release-shell-cli.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';

function fixture(temporary) {
  const core = path.join(temporary, 'core');
  const output = path.join(temporary, 'official');
  const configFile = path.join(temporary, 'runtime.json');
  fs.mkdirSync(path.join(core, 'static/js'), { recursive: true });
  fs.writeFileSync(path.join(core, 'static/js/index.12345678.js'), 'console.log("fixture")\n');
  fs.writeFileSync(path.join(core, 'asset-manifest.json'), JSON.stringify({ files: { main: './static/js/index.12345678.js' }, entrypoints: ['./static/js/index.12345678.js'] }));
  fs.writeFileSync(path.join(core, 'index.html'), '<!doctype html><html lang="en"><head><meta name="description" content="fixture"><meta name="rinspace-runtime-config" content="./runtime-config.json"><title>Fixture</title></head><body><script src="./static/js/index.12345678.js"></script></body></html>');
  fs.writeFileSync(path.join(core, 'version.json'), `${JSON.stringify({ schemaVersion: 1, applicationVersion: '0.1.0', sourceCommit: commit, apiContractVersion: 'v1' })}\n`);
  const config = JSON.parse(fs.readFileSync('config/runtime.official.example.json', 'utf8'));
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  return { core, output, configFile, config };
}

test('assembles an official shell from a verified neutral release core', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-official-shell-'));
  try {
    const input = fixture(temporary);
    const result = assembleOfficialReleaseShell({
      coreDirectory: input.core,
      configFile: input.configFile,
      outputDirectory: input.output,
      expectedCommit: commit,
      expectedVersion: '0.1.0',
      expectedContractVersion: 'v1',
    });
    assert.equal(result.mode, 'official');
    assert.equal(result.immutableAssetCount, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(input.output, 'runtime-config.json'))).mode, 'official');
    const headers = JSON.parse(fs.readFileSync(path.join(input.output, 'static-headers.json'), 'utf8'));
    assert.ok(headers.cacheRules.some((rule) => rule.cacheControl === 'no-store' && rule.paths.includes('/official-shell-result.json')));
    assert.match(fs.readFileSync(path.join(input.output, '_headers'), 'utf8'), /\/official-shell-result\.json\n  Cache-Control: no-store/);
    const html = fs.readFileSync(path.join(input.output, 'index.html'), 'utf8');
    assert.match(html, /<title>芥子环<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/rinspace\.com\/"/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('rejects a demo config, wrong commit, and secret-shaped runtime field', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-official-shell-invalid-'));
  try {
    const input = fixture(temporary);
    const run = (overrides = {}) => assembleOfficialReleaseShell({
      coreDirectory: input.core,
      configFile: input.configFile,
      outputDirectory: input.output,
      expectedCommit: commit,
      expectedVersion: '0.1.0',
      expectedContractVersion: 'v1',
      ...overrides,
    });
    assert.throws(() => run({ expectedCommit: '0'.repeat(40) }), /Core commit/);
    fs.writeFileSync(input.configFile, `${JSON.stringify({ ...input.config, mode: 'demo' })}\n`);
    assert.throws(() => run(), /invalid|Demo mode|Official mode/i);
    fs.writeFileSync(input.configFile, `${JSON.stringify({ ...input.config, databasePassword: 'forbidden' })}\n`);
    assert.throws(() => run(), /invalid|Secret/i);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
