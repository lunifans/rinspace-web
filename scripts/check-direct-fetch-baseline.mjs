import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src');
const baselinePath = path.join(projectRoot, 'config', 'direct-fetch-baseline.json');

function productionSource(relativePath) {
  return /\.(?:ts|tsx)$/.test(relativePath)
    && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
    && !relativePath.includes('/__tests__/');
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
    return productionSource(relative) ? [relative] : [];
  });
}

function unwrap(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function containsGlobalFetch(expression) {
  const current = unwrap(expression);
  if (ts.isIdentifier(current)) return current.text === 'fetch';
  if (ts.isPropertyAccessExpression(current)) {
    return current.name.text === 'fetch'
      && ts.isIdentifier(current.expression)
      && ['globalThis', 'window', 'self'].includes(current.expression.text);
  }
  if (ts.isBinaryExpression(current)) {
    return containsGlobalFetch(current.left) || containsGlobalFetch(current.right);
  }
  return false;
}

function directFetchCount(relativePath) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
  const kind = relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, kind);
  let count = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && containsGlobalFetch(node.expression)) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
}

function currentInventory() {
  return Object.fromEntries(sourceFiles(sourceRoot)
    .map((relativePath) => [relativePath, directFetchCount(relativePath)])
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right)));
}

const current = currentInventory();
if (process.argv.includes('--print-current')) {
  process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
if (baseline.schemaVersion !== 1) throw new Error('Unsupported direct-fetch baseline schema.');
const allowed = { ...baseline.approvedCallSites, ...baseline.legacyCallSites };
const failures = [];
const compatibilityFeedPath = path.join(projectRoot, 'src', 'services', 'feed.ts');
const compatibilityFeedSource = fs.readFileSync(compatibilityFeedPath, 'utf8');
const compatibilityFeed = ts.createSourceFile(
  'src/services/feed.ts',
  compatibilityFeedSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
if (
  compatibilityFeed.statements.length !== 1
  || !ts.isExportDeclaration(compatibilityFeed.statements[0])
  || compatibilityFeed.statements[0].moduleSpecifier?.getText(compatibilityFeed) !== "'./legacyFeed'"
) {
  failures.push('src/services/feed.ts: compatibility surface must remain a single re-export from ./legacyFeed');
}
for (const [relativePath, count] of Object.entries(current)) {
  const entry = allowed[relativePath];
  if (!entry) {
    failures.push(`${relativePath}: ${count} direct fetch call(s) are not owned by the baseline`);
    continue;
  }
  if (typeof entry.owner !== 'string' || !entry.owner.trim()) {
    failures.push(`${relativePath}: baseline owner is missing`);
  }
  if (!Number.isInteger(entry.count) || entry.count !== count) {
    const action = Number.isInteger(entry.count) && entry.count > count
      ? 'decreased; update the baseline in the same change'
      : 'grew';
    failures.push(`${relativePath}: direct fetch count ${action} from ${entry.count} to ${count}`);
  }
}
for (const [relativePath, entry] of Object.entries(allowed)) {
  if (!(relativePath in current)) {
    failures.push(`${relativePath}: no direct fetch remains; remove the stale baseline entry`);
  } else if (!Number.isInteger(entry.count) || entry.count <= 0) {
    failures.push(`${relativePath}: invalid baseline count ${entry.count}`);
  }
}
if (failures.length > 0) {
  process.stderr.write(`Direct fetch baseline failed:\n- ${failures.join('\n- ')}\n`);
  process.exit(1);
}

const currentCount = Object.values(current).reduce((sum, count) => sum + count, 0);
process.stdout.write(`Direct fetch baseline passed: ${Object.keys(current).length} files, ${currentCount} calls.\n`);
