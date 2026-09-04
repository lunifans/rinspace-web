import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parseRuntimeConfig } from '../src/app/config/runtime.ts';

const publicEnvironmentNames = Object.freeze([
  'RINSPACE_PUBLIC_API_BASE_URL',
  'RINSPACE_PUBLIC_API_CONTRACT_VERSION',
  'RINSPACE_PUBLIC_BASE_PATH',
  'RINSPACE_PUBLIC_CANONICAL_ORIGIN',
  'RINSPACE_PUBLIC_CLOUDBASE_ENV_ID',
  'RINSPACE_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY',
  'RINSPACE_PUBLIC_CLOUDBASE_REGION',
  'RINSPACE_PUBLIC_GITEA_BASE_URL',
  'RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON',
]);

const legacyPublicNames = Object.freeze([
  'REACT_APP_CLOUDBASE_ACCESS_KEY',
  'REACT_APP_CLOUDBASE_ENV_ID',
  'REACT_APP_CLOUDBASE_REGION',
]);

export function readAllowedEnvFile(fileName) {
  const allowed = new Set(legacyPublicNames);
  const result = {};
  for (const line of fs.readFileSync(fileName, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !allowed.has(match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

function normalizedBasePath(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === '/') return '/';
  return `${trimmed.replace(/\/+$/, '')}/`;
}

export function buildRuntimeConfig({ template, environment = {}, legacyEnvironment = {}, basePath }) {
  const selected = Object.fromEntries(publicEnvironmentNames.map((name) => [name, environment[name]]));
  const document = selected.RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON
    ? JSON.parse(selected.RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON)
    : structuredClone(template);
  document.basePath = normalizedBasePath(basePath || selected.RINSPACE_PUBLIC_BASE_PATH) || document.basePath;
  document.canonicalOrigin = selected.RINSPACE_PUBLIC_CANONICAL_ORIGIN || document.canonicalOrigin;
  document.api.baseUrl = selected.RINSPACE_PUBLIC_API_BASE_URL || document.api.baseUrl;
  document.api.contractVersion = selected.RINSPACE_PUBLIC_API_CONTRACT_VERSION || document.api.contractVersion;
  const cloudbase = document.auth.provider === 'cloudbase' ? document.auth.cloudbase : null;
  if (cloudbase) {
    cloudbase.envId = selected.RINSPACE_PUBLIC_CLOUDBASE_ENV_ID
      || legacyEnvironment.REACT_APP_CLOUDBASE_ENV_ID
      || cloudbase.envId;
    cloudbase.region = selected.RINSPACE_PUBLIC_CLOUDBASE_REGION
      || legacyEnvironment.REACT_APP_CLOUDBASE_REGION
      || cloudbase.region;
    cloudbase.publishableKey = selected.RINSPACE_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY
      || legacyEnvironment.REACT_APP_CLOUDBASE_ACCESS_KEY
      || cloudbase.publishableKey;
  }
  const giteaBaseUrl = selected.RINSPACE_PUBLIC_GITEA_BASE_URL;
  if (giteaBaseUrl) {
    document.integrations.gitea = { enabled: true, baseUrl: giteaBaseUrl };
    document.features.externalIntegrations = true;
  }
  return parseRuntimeConfig(document);
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

if (
  process.argv[1]
  && path.basename(process.argv[1]) === 'generate-runtime-config.mjs'
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const templateFile = path.resolve(option('--template', 'config/runtime.official.example.json'));
  const outputFile = path.resolve(option('--out', 'config/runtime.generated.json'));
  const legacyFile = option('--legacy-public-env-file', '');
  const template = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
  const config = buildRuntimeConfig({
    template,
    environment: process.env,
    legacyEnvironment: legacyFile ? readAllowedEnvFile(path.resolve(legacyFile)) : {},
    basePath: option('--base-path', undefined),
  });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Generated validated ${config.mode} runtime config at ${outputFile} from the public allowlist.\n`);
}
