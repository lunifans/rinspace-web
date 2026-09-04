import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const documents = ['README.md', 'README.zh-CN.md'].map((name) => ({
  name,
  source: fs.readFileSync(path.join(root, name), 'utf8'),
}));
const expectedSections = [
  'product',
  'scope',
  'demo',
  'screenshots',
  'quick-start',
  'reset',
  'static-deployment',
  'docker-deployment',
  'integration',
  'architecture',
  'configuration',
  'testing',
  'licensing',
  'security',
  'limitations',
];
const requiredCommands = [
  'pnpm install --frozen-lockfile',
  'pnpm start',
  'pnpm build',
  'pnpm package -- --config config/runtime.demo.json --out package',
  'docker compose up --build',
  'pnpm test',
  'pnpm test:static-package',
  'pnpm test:container-contract',
];
const requiredPublicKeys = [
  'RINSPACE_PUBLIC_BASE_PATH',
  'RINSPACE_PUBLIC_API_BASE_URL',
  'RINSPACE_PUBLIC_CANONICAL_ORIGIN',
  'RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON',
];

for (const document of documents) {
  const sections = [...document.source.matchAll(/<!--\s*rinspace-section:\s*([a-z-]+)\s*-->/g)].map((match) => match[1]);
  if (JSON.stringify(sections) !== JSON.stringify(expectedSections)) {
    throw new Error(`${document.name} section contract differs: ${sections.join(', ')}`);
  }
  for (const command of requiredCommands) {
    if (!document.source.includes(command)) throw new Error(`${document.name} is missing command: ${command}`);
  }
  for (const key of requiredPublicKeys) {
    if (!document.source.includes(key)) throw new Error(`${document.name} is missing public config key: ${key}`);
  }
  for (const phrase of ['AGPL-3.0-only', 'commercial', 'production-only']) {
    if (!document.source.toLowerCase().includes(phrase.toLowerCase())) throw new Error(`${document.name} is missing release-boundary phrase: ${phrase}`);
  }
  for (const match of document.source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|#)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(root, target))) throw new Error(`${document.name} references a missing image: ${target}`);
  }
}

if (!documents[0].source.includes('[简体中文](./README.zh-CN.md)')) throw new Error('English README is missing the Chinese link.');
if (!documents[1].source.includes('[English](./README.md)')) throw new Error('Chinese README is missing the English link.');
const quickStart = JSON.parse(fs.readFileSync(path.join(root, 'docs/quick-start-verification.json'), 'utf8'));
if (quickStart.result !== 'passed' || quickStart.environment?.cleanWorkingDirectory !== true) {
  throw new Error('Quick-start evidence must come from a passing clean working directory.');
}
if (!Number.isFinite(quickStart.timingMilliseconds?.total) || quickStart.timingMilliseconds.total >= 180_000) {
  throw new Error('The recorded quick start did not reach ready within three minutes.');
}
const screenshotManifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/assets/screenshots/manifest.json'), 'utf8'));
for (const [name, width, height] of [
  ['demo-guest-desktop.png', 1440, 1000],
  ['demo-member-desktop.png', 1440, 1000],
  ['demo-guest-mobile.png', 390, 844],
  ['demo-member-mobile.png', 390, 844],
]) {
  const png = fs.readFileSync(path.join(root, 'docs/assets/screenshots', name));
  if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw new Error(`${name} dimensions changed.`);
  const sha256 = crypto.createHash('sha256').update(png).digest('hex');
  if (screenshotManifest.files?.[name]?.sha256 !== sha256) throw new Error(`${name} differs from the screenshot manifest.`);
}
process.stdout.write(`README parity passed (${expectedSections.length} shared sections, ${requiredCommands.length} shared commands, ${quickStart.timingMilliseconds.total} ms quick start).\n`);
