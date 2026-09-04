import fs from 'node:fs';
import path from 'node:path';

const uiRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(uiRoot, '..');
const root = path.join(uiRoot, 'src');
const allowed = new Set([
  path.join(root, 'app/config/env.ts'),
]);
const findings = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !allowed.has(absolute)) {
      const source = fs.readFileSync(absolute, 'utf8');
      if (/process\.env|import\.meta\.env/.test(source)) {
        findings.push(path.relative(root, absolute));
      }
    }
  }
}

walk(root);
if (findings.length) {
  throw new Error(`Direct environment access is forbidden outside app/config/env.ts:\n${findings.join('\n')}`);
}

const clientEnvironmentIdentityPattern = /(?:REACT_APP_|VITE_)RIN(?:SPACE)?_ADMIN_PHONE(?:_SHA256)?/i;
const browserSourceIdentityPattern = /(?:REACT_APP_|VITE_)?RIN(?:SPACE)?_ADMIN_PHONE(?:_SHA256)?|adminPhone(?:Sha256|Hash)?/i;
const browserConfigTargets = [
  { file: path.join(repositoryRoot, 'Dockerfile'), pattern: clientEnvironmentIdentityPattern },
  { file: path.join(repositoryRoot, '.env.example'), pattern: clientEnvironmentIdentityPattern },
  { file: path.join(repositoryRoot, '.env.production'), pattern: clientEnvironmentIdentityPattern },
  { file: path.join(repositoryRoot, 'scripts/redesign/migrate-ui-env-access.mjs'), pattern: browserSourceIdentityPattern },
  { file: path.join(uiRoot, '.env.example'), pattern: browserSourceIdentityPattern },
  { file: path.join(uiRoot, '.env.production'), pattern: browserSourceIdentityPattern },
  { file: path.join(uiRoot, 'vite.config.ts'), pattern: browserSourceIdentityPattern },
  { file: path.join(root, 'app/config/env.ts'), pattern: browserSourceIdentityPattern },
  ...fs.readdirSync(path.join(uiRoot, 'config'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ file: path.join(uiRoot, 'config', name), pattern: browserSourceIdentityPattern })),
];
const administratorIdentityFindings = browserConfigTargets
  .filter(({ file }) => fs.existsSync(file))
  .filter(({ file, pattern }) => pattern.test(fs.readFileSync(file, 'utf8')))
  .map(({ file }) => path.relative(repositoryRoot, file));
if (administratorIdentityFindings.length) {
  throw new Error(`Administrator phone identity is forbidden in browser configuration:\n${administratorIdentityFindings.join('\n')}`);
}

console.log(`Environment boundary check passed (${browserConfigTargets.length} browser config surfaces scanned).`);
