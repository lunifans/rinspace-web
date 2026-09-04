import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  forbiddenRuntimeConfigKeys,
  parseRuntimeConfig,
  RuntimeConfigError,
} from './runtime';

const configDirectory = path.join(process.cwd(), 'config');
const readConfig = (name: string): unknown => JSON.parse(
  fs.readFileSync(path.join(configDirectory, name), 'utf8'),
);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const demo = readConfig('runtime.demo.json') as Record<string, unknown>;
const integration = readConfig('runtime.example.json') as Record<string, unknown>;

describe('runtime public configuration', () => {
  it('accepts the checked-in safe demo and generic integration examples', () => {
    expect(parseRuntimeConfig(demo)).toMatchObject({ mode: 'demo', basePath: '/' });
    expect(parseRuntimeConfig(integration)).toMatchObject({ mode: 'integration', basePath: '/rinspace/' });
  });

  it('accepts root and subpath deployments with their matching local API paths', () => {
    const root = parseRuntimeConfig(demo);
    expect(root.api.baseUrl).toBe('/api/');

    const subpath = clone(demo);
    subpath.basePath = '/preview/rinspace/';
    (subpath.api as Record<string, unknown>).baseUrl = '/preview/rinspace/api/';
    expect(parseRuntimeConfig(subpath)).toMatchObject({ basePath: '/preview/rinspace/' });
  });

  it('accepts HTTPS production-like integration and official configurations', () => {
    expect(parseRuntimeConfig(integration)).toMatchObject({ canonicalOrigin: 'https://web.example.com' });
    const official = clone(integration);
    official.mode = 'official';
    official.canonicalOrigin = 'https://app.example.com';
    official.auth = {
      provider: 'cloudbase',
      endpoint: null,
      cloudbase: { envId: 'public-env-id', region: 'ap-shanghai', publishableKey: null },
    };
    expect(parseRuntimeConfig(official)).toMatchObject({ mode: 'official', auth: { provider: 'cloudbase' } });
  });

  it.each(['rinspace/', '/rinspace', '//rinspace/', '/rinspace/../', '/rinspace/?x=1']) (
    'rejects a non-normalized basePath: %s',
    (basePath) => {
      const input = clone(demo);
      input.basePath = basePath;
      expect(() => parseRuntimeConfig(input)).toThrow(RuntimeConfigError);
    },
  );

  it.each(['http://example.com', 'https://example.com/path', 'https://user@example.com', 'not-an-origin']) (
    'rejects an unsafe or non-origin canonicalOrigin: %s',
    (canonicalOrigin) => {
      const input = clone(integration);
      input.canonicalOrigin = canonicalOrigin;
      expect(() => parseRuntimeConfig(input)).toThrow(RuntimeConfigError);
    },
  );

  it('rejects malformed endpoints and local endpoints outside basePath', () => {
    for (const baseUrl of ['//api.example.com/', 'https://api.example.com/v1/?token=x']) {
      const input = clone(demo);
      (input.api as Record<string, unknown>).baseUrl = baseUrl;
      expect(() => parseRuntimeConfig(input)).toThrow(RuntimeConfigError);
    }
    const outsideBase = clone(integration);
    (outsideBase.api as Record<string, unknown>).baseUrl = '/other/api/';
    expect(() => parseRuntimeConfig(outsideBase)).toThrow(RuntimeConfigError);
  });

  it('rejects unknown fields and unsupported schema versions with field diagnostics', () => {
    const unknown = clone(demo);
    unknown.unreviewed = true;
    expect(() => parseRuntimeConfig(unknown)).toThrow(RuntimeConfigError);

    const version = clone(demo);
    version.schemaVersion = 2;
    try {
      parseRuntimeConfig(version);
      expect.fail('expected version validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeConfigError);
      expect((error as RuntimeConfigError).diagnostics[0]?.path).toBe('$.schemaVersion');
    }
  });

  it('permanently rejects secret and administrator identity fields at any depth', () => {
    expect(forbiddenRuntimeConfigKeys).toContain('adminPhoneSha256');
    for (const key of ['adminPhoneSha256', 'databasePassword', 'serviceToken']) {
      const input = clone(demo);
      (input.site as Record<string, unknown>)[key] = 'must-never-reach-the-browser';
      expect(() => parseRuntimeConfig(input)).toThrowError(expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'forbidden_public_config_key', path: `$.site.${key}` }),
        ]),
      }));
    }
  });

  it('fails closed when demo mode points at production or enables integrations', () => {
    const productionOrigin = clone(demo);
    productionOrigin.canonicalOrigin = 'https://rinspace.com';
    expect(() => parseRuntimeConfig(productionOrigin)).toThrow(RuntimeConfigError);

    const externalApi = clone(demo);
    (externalApi.api as Record<string, unknown>).baseUrl = 'https://api.example.com/';
    expect(() => parseRuntimeConfig(externalApi)).toThrow(RuntimeConfigError);

    const integrationEnabled = clone(demo);
    const integrations = integrationEnabled.integrations as Record<string, Record<string, unknown>>;
    integrations.renderer = { enabled: true, baseUrl: 'https://renderer.example.com/' };
    expect(() => parseRuntimeConfig(integrationEnabled)).toThrow(RuntimeConfigError);
  });

  it('enforces auth provider and mode combinations', () => {
    const input = clone(demo);
    input.mode = 'integration';
    expect(() => parseRuntimeConfig(input)).toThrow(RuntimeConfigError);

    const cloudbaseWithoutConfig = clone(integration);
    cloudbaseWithoutConfig.mode = 'official';
    cloudbaseWithoutConfig.auth = { provider: 'cloudbase', endpoint: null, cloudbase: null };
    expect(() => parseRuntimeConfig(cloudbaseWithoutConfig)).toThrow(RuntimeConfigError);
  });

  it('returns a deeply frozen validated configuration', () => {
    const parsed = parseRuntimeConfig(demo);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.site)).toBe(true);
    expect(Object.isFrozen(parsed.integrations.renderer)).toBe(true);
  });
});
