import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseRuntimeConfig } from './runtime';
import {
  installPublicRuntimeConfig,
  publicAsset,
  publicEnv,
  resetPublicRuntimeConfigForTests,
} from './env';

const demoSubpath = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.subpath.json'), 'utf8'),
) as unknown);

afterEach(() => {
  resetPublicRuntimeConfigForTests();
  document.head.innerHTML = '';
});

describe('runtime public environment bridge', () => {
  it('derives the shell prefix before bootstrap and then uses validated runtime config', () => {
    document.head.innerHTML = '<meta name="rinspace-runtime-config" content="/preview/runtime-config.json">';
    expect(publicEnv.publicBasePath).toBe('/preview');
    expect(publicAsset('/assets/logo.png')).toBe('/preview/assets/logo.png');

    installPublicRuntimeConfig(demoSubpath);
    expect(publicEnv.publicBasePath).toBe('/rinspace-demo');
    expect(publicEnv.basePath).toBe('/rinspace-demo/');
    expect(publicEnv.cloudbaseEnvId).toBe('');
  });

  it('does not accept a cross-origin runtime config marker as a shell prefix', () => {
    document.head.innerHTML = '<meta name="rinspace-runtime-config" content="https://example.com/runtime-config.json">';
    expect(publicEnv.publicBasePath).toBe('');
  });
});
