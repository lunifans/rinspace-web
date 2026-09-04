import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const failures = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:ts|tsx|css)$/.test(entry.name) ? [full] : [];
  });
}

for (const file of walk(srcRoot)) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const source = fs.readFileSync(file, 'utf8');
  const ownsCultivationSemanticPalette = relative === 'src/styles/cultivation.css';
  if (!ownsCultivationSemanticPalette && (/#(?:2f6b4f|0f766e|b45309)\b/i.test(source)
    || /rgba?\(\s*(?:47\s*,\s*107\s*,\s*79|15\s*,\s*118\s*,\s*110|180\s*,\s*83\s*,\s*9)\b/i.test(source))) {
    failures.push(`rejected V1 brand color in ${relative}`);
  }
  if (/legacyCompat|legacy-families|generated\/legacy|generate-family-styles|rin-legacy-/.test(source)) {
    failures.push(`retired presentation source in ${relative}`);
  }
  if (/(?:className=[^\n]*\bbi(?:\s|[-`'"])|bootstrap-icons|from ['"]react-bootstrap['"])/.test(source)) {
    failures.push(`Bootstrap presentation outside the owned UI layer: ${relative}`);
  }
  const ownsPrimitiveImplementation = relative.startsWith('src/components/ui/')
    || relative.startsWith('src/components/animate-ui/');
  if (!ownsPrimitiveImplementation && /<button\b/.test(source)) {
    failures.push(`raw button bypasses the Animate UI production layer: ${relative}`);
  }
  if (relative.startsWith('src/pages/') && /from ['"]@?\/?(?:src\/)?components\/animate-ui/.test(source)) {
    failures.push(`page bypasses the stable components/ui boundary: ${relative}`);
  }
  if (/https?:\/\/[^'"\s]*animate-ui/i.test(source)) {
    failures.push(`runtime Animate UI network dependency in ${relative}`);
  }
}

function readPageFamilySource(entry, visited = new Set()) {
  const resolvedEntry = path.resolve(entry);
  if (visited.has(resolvedEntry) || !fs.existsSync(resolvedEntry)) return '';
  visited.add(resolvedEntry);

  const source = fs.readFileSync(resolvedEntry, 'utf8');
  const reExport = source.match(/export\s*\{\s*default\s*\}\s*from\s*['"](\.[^'"]+)['"]/);
  if (!reExport) return source;

  const candidate = path.resolve(path.dirname(resolvedEntry), reExport[1]);
  const target = [candidate, `${candidate}.tsx`, path.join(candidate, 'index.tsx')]
    .find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  return target ? `${source}\n${readPageFamilySource(target, visited)}` : source;
}

for (const directory of fs.readdirSync(path.join(srcRoot, 'pages'), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const entry = path.join(srcRoot, 'pages', directory.name, 'index.tsx');
  if (!fs.existsSync(entry)) continue;
  const source = readPageFamilySource(entry);
  if (!/(?:components\/ui|@\/components\/ui|SiteTopbar)/.test(source)) {
    failures.push(`page family has no production path to the owned UI layer: ${directory.name}`);
  }
}

for (const family of ['account-policy', 'creation', 'discovery', 'identity', 'knowledge', 'operations']) {
  const file = path.join(srcRoot, 'styles/product-families', `${family}.css`);
  if (!fs.existsSync(file)) failures.push(`missing product family stylesheet: ${family}`);
  else if (!fs.readFileSync(file, 'utf8').trimStart().startsWith('@layer route-foundation')) {
    failures.push(`product family stylesheet is not isolated in route-foundation layer: ${family}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Redesign source gate passed: approved palette, owned primitives, frozen boundary, and route-layer isolation verified.');
