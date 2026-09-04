import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const chunksDirectory = path.join(root, 'build/static/js');
const evidencePath = path.join(root, 'docs/translation-bundle-budget.json');
const write = process.argv.slice(2).includes('--write');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--write');
const namespaces = ['discovery', 'reader', 'creation', 'creator', 'identity', 'admin', 'settings', 'legal'];
const perChunkBudgetBytes = 12 * 1024;
const totalBudgetBytes = 72 * 1024;

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
}

if (!fs.existsSync(chunksDirectory)) {
  throw new Error('Production build not found. Run pnpm build before checking translation chunks.');
}

const emittedFiles = fs.readdirSync(chunksDirectory);
const resources = namespaces.flatMap((namespace) => {
  const candidates = emittedFiles
    .filter((name) => name.startsWith(`${namespace}.`) && name.endsWith('.chunk.js'))
    .map((name) => {
      const file = path.join(chunksDirectory, name);
      const source = fs.readFileSync(file);
      const text = source.toString('utf8');
      return {
        namespace,
        file: name,
        bytes: source.byteLength,
        gzipBytes: gzipSync(source).byteLength,
        isResource: !/\bfrom"\.\//.test(text) && /export\{[^}]*default/.test(text),
      };
    })
    .filter(({ isResource }) => isResource)
    .map(({ isResource: _isResource, ...candidate }) => candidate);

  if (candidates.length !== 2) {
    throw new Error(`${namespace}: expected one feature translation chunk per locale, found ${candidates.length}.`);
  }
  return candidates;
});

const oversized = resources.filter(({ gzipBytes }) => gzipBytes > perChunkBudgetBytes);
const totalGzipBytes = resources.reduce((sum, resource) => sum + resource.gzipBytes, 0);
if (oversized.length > 0) {
  throw new Error(`Translation chunk budget exceeded: ${oversized.map(({ file, gzipBytes }) => `${file}=${gzipBytes}`).join(', ')}`);
}
if (totalGzipBytes > totalBudgetBytes) {
  throw new Error(`Translation bundle budget exceeded: ${totalGzipBytes} > ${totalBudgetBytes} gzip bytes.`);
}

const report = {
  profile: 'two locales; feature namespaces only; core shell namespaces excluded',
  budgets: { perChunkGzipBytes: perChunkBudgetBytes, totalFeatureGzipBytes: totalBudgetBytes },
  actual: { totalFeatureGzipBytes: totalGzipBytes, chunks: resources },
};
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
if (write) {
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, serializedReport);
} else if (!fs.existsSync(evidencePath) || fs.readFileSync(evidencePath, 'utf8') !== serializedReport) {
  throw new Error('Translation bundle evidence is stale. Run pnpm check:i18n:bundles:write after a reviewed production build.');
}
console.log(`Translation bundle budget passed: ${resources.length} chunks, ${totalGzipBytes} gzip bytes.`);
