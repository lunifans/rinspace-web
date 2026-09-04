import path from 'node:path';
import process from 'node:process';

import { startArtifactServer } from './static-server.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

const rootDirectory = path.resolve(option('--root', process.env.RINSPACE_ARTIFACT_DIR || 'package'));
const port = Number(option('--port', process.env.PORT || '4173'));
const server = startArtifactServer({ rootDirectory, port, host: '127.0.0.1' });

server.on('listening', () => {
  const address = server.address();
  const activePort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`Rinspace artifact server listening on http://127.0.0.1:${activePort}\n`);
});
