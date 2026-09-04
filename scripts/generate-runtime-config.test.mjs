import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildRuntimeConfig } from './generate-runtime-config.mjs';

const template = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config/runtime.official.example.json'), 'utf8'));

test('runtime config generation reads only named public values and normalizes a subpath', () => {
  const config = buildRuntimeConfig({
    template,
    environment: {
      RINSPACE_PUBLIC_BASE_PATH: '/rinspace',
      RINSPACE_PUBLIC_CLOUDBASE_ENV_ID: 'approved-public-env',
      RINSPACE_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY: 'approved-public-key',
      RINSPACE_PUBLIC_GITEA_BASE_URL: '/repos/',
      DATABASE_PASSWORD: 'must-not-appear',
    },
  });
  assert.equal(config.basePath, '/rinspace/');
  assert.equal(config.auth.cloudbase.envId, 'approved-public-env');
  assert.equal(config.integrations.gitea.baseUrl, '/repos/');
  assert.equal(JSON.stringify(config).includes('must-not-appear'), false);
});

test('runtime config generation rejects an override that breaks endpoint containment', () => {
  assert.throws(() => buildRuntimeConfig({
    template,
    environment: { RINSPACE_PUBLIC_BASE_PATH: '/other/' },
  }), /invalid/);
});

test('a complete public JSON input is still schema validated and cannot carry secrets', () => {
  const publicDocument = structuredClone(template);
  publicDocument.databasePassword = 'forbidden';
  assert.throws(() => buildRuntimeConfig({
    template,
    environment: { RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON: JSON.stringify(publicDocument) },
  }), /invalid|Secret/);
});
