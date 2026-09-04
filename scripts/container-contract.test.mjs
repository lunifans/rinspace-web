import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
const compose = fs.readFileSync('compose.yaml', 'utf8');
const subpathCompose = fs.readFileSync('compose.subpath.yaml', 'utf8');
const runtime = fs.readFileSync('scripts/container-runtime.mjs', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('container build and runtime use a pinned multi-platform Node image and a non-root entrypoint', () => {
  assert.match(dockerfile, /node:22\.22\.2-alpine3\.22@sha256:[a-f0-9]{64}/);
  assert.equal((dockerfile.match(/FROM \$\{NODE_IMAGE\}/g) || []).length, 2);
  assert.match(dockerfile, /corepack prepare pnpm@9\.7\.0 --activate/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision="\$\{RINSPACE_BUILD_COMMIT\}"/);
  assert.match(dockerfile, /org\.opencontainers\.image\.created="\$\{RINSPACE_BUILD_TIME\}"/);
  assert.match(dockerfile, /USER 1000:1000[\s\S]*EXPOSE 8080[\s\S]*ENTRYPOINT/);
  assert.doesNotMatch(dockerfile, /(?:ARG|ENV)\s+(?:REACT_APP_|VITE_|.*(?:PASSWORD|PRIVATE_KEY|SERVICE_TOKEN))/i);
});

test('the container runtime bundler is an explicit, reproducible build dependency', () => {
  assert.equal(packageJson.devDependencies?.esbuild, '0.25.12');
  assert.match(dockerfile, /pnpm exec esbuild scripts\/container-runtime\.mjs/);
});

test('Compose defaults to a zero-credential, read-only, capability-free service', () => {
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /\/run\/rinspace:rw,noexec,nosuid,nodev,uid=1000,gid=1000/);
  assert.match(compose, /127\.0\.0\.1:\$\{RINSPACE_WEB_PORT:-8080\}:8080/);
  assert.doesNotMatch(compose, /privileged:|network_mode:\s*host|docker\.sock|password|secret|token/i);
  assert.match(subpathCompose, /RINSPACE_PUBLIC_BASE_PATH:\s*\/rinspace-demo\//);
  assert.match(subpathCompose, /RINSPACE_PUBLIC_API_BASE_URL:\s*\/rinspace-demo\/api\//);
});

test('container startup names every accepted public input and never exports the ambient environment', () => {
  for (const name of [
    'RINSPACE_PUBLIC_API_BASE_URL',
    'RINSPACE_PUBLIC_BASE_PATH',
    'RINSPACE_PUBLIC_CANONICAL_ORIGIN',
    'RINSPACE_PUBLIC_CLOUDBASE_ENV_ID',
    'RINSPACE_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY',
    'RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON',
  ]) assert.match(runtime, new RegExp(name));
  assert.doesNotMatch(runtime, /Object\.(?:entries|keys|values)\(process\.env\)|\.\.\.process\.env/);
  assert.match(runtime, /copyCore:\s*false/);
  assert.match(runtime, /assetDirectory:\s*coreDirectory/);
});
