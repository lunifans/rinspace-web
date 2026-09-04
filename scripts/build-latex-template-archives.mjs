import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const templateRoot = path.join(root, 'templates');
const outputRoot = path.join(root, 'public/templates');
const write = process.argv.includes('--write');
const templates = [
  ['latex-article', 'latex-article.tar.gz', ['main.tex', 'refs.bib', 'sections/intro.tex', 'figures/.gitkeep']],
  ['latex-book', 'latex-book.tar.gz', ['main.tex', 'refs.bib', 'chapters/chapter-01.tex', 'figures/.gitkeep']],
];

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

fs.mkdirSync(outputRoot, { recursive: true });
for (const [sourceDirectory, archiveName, requiredPaths] of templates) {
  const sourcePath = path.join(templateRoot, sourceDirectory);
  for (const relative of requiredPaths) {
    if (!fs.existsSync(path.join(sourcePath, relative))) {
      throw new Error(`${sourceDirectory} is missing ${relative}`);
    }
  }
  const tar = run('tar', [
    '--sort=name',
    '--mtime=@0',
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-cf',
    '-',
    '-C',
    sourcePath,
    '.',
  ]);
  const archive = run('gzip', ['-n', '-9'], { input: tar });
  const outputPath = path.join(outputRoot, archiveName);
  if (write) {
    fs.writeFileSync(outputPath, archive);
  } else if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(archive)) {
    throw new Error(`${path.relative(root, outputPath)} is missing or stale; run pnpm generate:latex-templates`);
  }
  process.stdout.write(`${archiveName} sha256:${sha256(archive)}\n`);
}
