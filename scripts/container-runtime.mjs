import fs from 'node:fs';
import process from 'node:process';

import { buildRuntimeConfig } from './generate-runtime-config.mjs';
import { assembleRuntimeShell } from './static-package.mjs';
import { startArtifactServer } from './static-server.mjs';

const coreDirectory = '/opt/rinspace/core';
const outputDirectory = '/run/rinspace';
const templateFile = '/opt/rinspace/runtime.demo.json';
const port = Number(process.env.PORT || '8080');

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 through 65535.');

const template = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
const completeConfig = process.env.RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON;
const environment = {
  RINSPACE_PUBLIC_API_BASE_URL: process.env.RINSPACE_PUBLIC_API_BASE_URL || (completeConfig ? undefined : '/api/'),
  RINSPACE_PUBLIC_API_CONTRACT_VERSION: process.env.RINSPACE_PUBLIC_API_CONTRACT_VERSION,
  RINSPACE_PUBLIC_BASE_PATH: process.env.RINSPACE_PUBLIC_BASE_PATH || (completeConfig ? undefined : '/'),
  RINSPACE_PUBLIC_CANONICAL_ORIGIN: process.env.RINSPACE_PUBLIC_CANONICAL_ORIGIN || (completeConfig ? undefined : 'http://localhost:8080'),
  RINSPACE_PUBLIC_CLOUDBASE_ENV_ID: process.env.RINSPACE_PUBLIC_CLOUDBASE_ENV_ID,
  RINSPACE_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY: process.env.RINSPACE_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY,
  RINSPACE_PUBLIC_CLOUDBASE_REGION: process.env.RINSPACE_PUBLIC_CLOUDBASE_REGION,
  RINSPACE_PUBLIC_GITEA_BASE_URL: process.env.RINSPACE_PUBLIC_GITEA_BASE_URL,
  RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON: completeConfig,
};
const config = buildRuntimeConfig({ template, environment });
assembleRuntimeShell({
  coreDirectory,
  config,
  copyCore: false,
  expectedBasePath: config.basePath,
  outputDirectory,
});

const server = startArtifactServer({
  rootDirectory: outputDirectory,
  assetDirectory: coreDirectory,
  host: '0.0.0.0',
  port,
});

server.on('listening', () => {
  process.stdout.write(`Rinspace Web ${config.mode} shell ready on port ${port} at ${config.basePath}.\n`);
});

function shutdown() {
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
