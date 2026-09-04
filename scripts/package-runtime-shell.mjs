import path from 'node:path';
import process from 'node:process';

import { assembleRuntimeShell } from './static-package.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

const coreDirectory = option('--core', 'build');
const configFile = option('--config', 'config/runtime.demo.json');
const outputDirectory = option('--out', 'package');
const expectedBasePath = option('--base-path', undefined);

const result = assembleRuntimeShell({ coreDirectory, configFile, outputDirectory, expectedBasePath });
process.stdout.write(`Packaged ${path.resolve(outputDirectory)} for ${result.config.mode} at ${result.config.basePath} (${Object.keys(result.immutableDigests).length} immutable resources).\n`);
