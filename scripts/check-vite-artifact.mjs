import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const build = path.resolve(root, option('--core', 'build'));
const packaged = path.resolve(root, option('--package', 'package'));
const manifest = JSON.parse(fs.readFileSync(path.join(build, 'asset-manifest.json'), 'utf8'));
if (!manifest.files?.['main.js'] || !Array.isArray(manifest.entrypoints)) {
  throw new Error('CRA-compatible manifest is missing files.main.js or entrypoints.');
}
for (const emitted of Object.values(manifest.files)) {
  if (typeof emitted !== 'string') throw new Error('Manifest file values must be strings.');
  const absolute = path.join(build, emitted.replace(/^\//, ''));
  if (!fs.existsSync(absolute)) throw new Error(`Manifest points to a missing file: ${emitted}`);
}
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
if (!html.includes('src="./static/js/') || /src="\/(?:rinspace\/)?static\/js\//.test(html)) {
  throw new Error('Neutral core HTML must use a relative, redirect-free static module graph.');
}
for (const deploymentFile of ['runtime-config.json', 'site.webmanifest', 'static-headers.json', '404.html']) {
  if (fs.existsSync(path.join(build, deploymentFile))) {
    throw new Error(`Neutral core must not contain deployment shell file: ${deploymentFile}`);
  }
}
const version = JSON.parse(fs.readFileSync(path.join(build, 'version.json'), 'utf8'));
for (const key of ['applicationVersion', 'sourceCommit', 'builtAt', 'apiContractVersion', 'demoDataVersion', 'dependencyLockSha256']) {
  if (!version[key]) throw new Error(`version.json is missing ${key}.`);
}
const forbiddenNames = [
  'DB_PASSWORD',
  'DATABASE_URL',
  'PRIVATE_KEY',
  'GITEA_TOKEN',
  'CLOUDREVE_SECRET',
  'REACT_APP_CLOUDBASE_ENV_ID',
  'REACT_APP_CLOUDBASE_ACCESS_KEY',
  '__RINSPACE_PUBLIC_ENV__',
];
const scripts = fs
  .readdirSync(path.join(build, 'static/js'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(build, 'static/js', name), 'utf8'))
  .join('\n');
for (const name of forbiddenNames) {
  if (scripts.includes(name)) throw new Error(`Forbidden server environment name reached the UI: ${name}`);
}

if (fs.existsSync(packaged)) {
  const config = JSON.parse(fs.readFileSync(path.join(packaged, 'runtime-config.json'), 'utf8'));
  const headers = JSON.parse(fs.readFileSync(path.join(packaged, 'static-headers.json'), 'utf8'));
  const packagedHtml = fs.readFileSync(path.join(packaged, 'index.html'), 'utf8');
  if (headers.basePath !== config.basePath || !packagedHtml.includes(`${config.basePath}runtime-config.json`)) {
    throw new Error('Packaged basePath is inconsistent across config, HTML, and headers.');
  }
  if (!fs.readFileSync(path.join(packaged, '404.html'), 'utf8').includes(`${config.basePath}runtime-config.json`)) {
    throw new Error('Packaged SPA fallback does not use the configured basePath.');
  }
}

console.log(`Runtime-neutral Vite artifact contract passed (${Object.keys(manifest.files).length} manifest entries).`);
