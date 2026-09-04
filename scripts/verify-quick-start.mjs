import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const sourceRoot = process.cwd();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-quick-start-'));
const offline = process.argv.includes('--offline');
const writeEvidence = process.argv.includes('--write');
const port = 4213;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function waitForReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const [index, config] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/`),
        fetch(`http://127.0.0.1:${port}/runtime-config.json`),
      ]);
      if (index.ok && config.ok && (await config.json()).mode === 'demo') return;
    } catch {
      // The clean dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Clean quick-start server did not become ready.');
}

const startedAt = Date.now();
let server;

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once('exit', resolve));
  if (process.platform === 'win32') server.kill('SIGTERM');
  else process.kill(-server.pid, 'SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

try {
  fs.cpSync(sourceRoot, temporaryRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(sourceRoot, source).split(path.sep).join('/');
      return relative === '' || !/^(?:\.git|build|node_modules|package(?:-|\/)|playwright-report|test-results)(?:\/|$)/.test(relative);
    },
  });
  const installStartedAt = Date.now();
  await run('corepack', ['pnpm', 'install', '--frozen-lockfile', ...(offline ? ['--offline'] : [])], {
    cwd: temporaryRoot,
    env: process.env,
  });
  const installedAt = Date.now();
  server = spawn('corepack', ['pnpm', 'start', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: temporaryRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
      RINSPACE_RUNTIME_CONFIG_FILE: 'runtime.demo.json',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForReady();
  const readyAt = Date.now();
  const evidence = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      node: process.version,
      pnpm: '9.7.0',
      cleanWorkingDirectory: true,
      dependencyStoreMode: offline ? 'warm-offline-store' : 'network-allowed',
    },
    timingMilliseconds: {
      copy: installStartedAt - startedAt,
      install: installedAt - installStartedAt,
      serverReady: readyAt - installedAt,
      total: readyAt - startedAt,
    },
    result: 'passed',
  };
  if (writeEvidence) fs.writeFileSync(path.join(sourceRoot, 'docs/quick-start-verification.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await stopServer();
  fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
