import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parseRuntimeConfig } from '../src/app/config/runtime.ts';
import { assembleRuntimeShell } from './static-package.mjs';

function fullCommit(value, label) {
  if (!/^[0-9a-f]{40}$/.test(value || '')) throw new Error(`${label} must be a lowercase full commit.`);
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function assembleOfficialReleaseShell({
  coreDirectory,
  configFile,
  outputDirectory,
  expectedCommit,
  expectedVersion,
  expectedContractVersion,
}) {
  const core = fs.realpathSync(coreDirectory);
  const configBytes = fs.readFileSync(configFile);
  const config = parseRuntimeConfig(JSON.parse(configBytes.toString('utf8')));
  if (config.mode !== 'official') throw new Error('Release shell requires an official runtime config.');
  if (config.runtimeConfigChannel !== undefined) throw new Error('Runtime config cannot override the private release channel.');
  if (config.site.sourceUrl !== 'https://github.com/rinspacehq/rinspace-web') {
    throw new Error('Official runtime config must expose the canonical public source URL.');
  }
  const version = JSON.parse(fs.readFileSync(path.join(core, 'version.json'), 'utf8'));
  if (version.schemaVersion !== 1) throw new Error('Core version.json schemaVersion must be 1.');
  if (version.sourceCommit !== fullCommit(expectedCommit, 'expectedCommit')) throw new Error('Core commit does not match the release lock.');
  if (version.applicationVersion !== expectedVersion) throw new Error('Core version does not match the release lock.');
  if (version.apiContractVersion !== expectedContractVersion) throw new Error('Core contract does not match the release lock.');
  if (config.api.contractVersion !== expectedContractVersion) throw new Error('Official config contract does not match the release lock.');

  const assembled = assembleRuntimeShell({
    coreDirectory: core,
    config,
    outputDirectory,
    expectedBasePath: config.basePath,
  });
  const result = Object.freeze({
    schemaVersion: 1,
    mode: 'official',
    sourceCommit: version.sourceCommit,
    applicationVersion: version.applicationVersion,
    apiContractVersion: version.apiContractVersion,
    basePath: config.basePath,
    runtimeConfigSha256: digest(fs.readFileSync(path.join(path.resolve(outputDirectory), 'runtime-config.json'))),
    immutableAssetCount: Object.keys(assembled.immutableDigests).length,
  });
  fs.writeFileSync(
    path.join(path.resolve(outputDirectory), 'official-shell-result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

function option(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} is required.`);
  return value;
}

function run() {
  const result = assembleOfficialReleaseShell({
    coreDirectory: path.resolve(option('--core')),
    configFile: path.resolve(option('--config')),
    outputDirectory: path.resolve(option('--out')),
    expectedCommit: option('--expected-commit'),
    expectedVersion: option('--expected-version'),
    expectedContractVersion: option('--expected-contract-version'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) run();
