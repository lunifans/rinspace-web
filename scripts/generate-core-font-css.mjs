import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'public/fonts/library/rinspace-fonts.css');
const target = path.join(root, 'public/fonts/library/rinspace-core-fonts.css');
const families = new Set(['IBM Plex Sans', 'IBM Plex Mono', 'Rinspace Newsreader']);
const blocks = fs.readFileSync(source, 'utf8').match(/@font-face\s*\{[\s\S]*?\}/g) || [];
const selected = blocks.filter((block) => {
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  return family && families.has(family);
});
if (!selected.length) throw new Error('Core self-hosted font faces were not found.');
fs.writeFileSync(target, `/* Generated from the pinned offline font library. */\n${selected.join('\n\n')}\n`);
console.log(`Core font CSS generated: ${selected.length} faces.`);
