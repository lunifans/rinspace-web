// Generates src/styles/product-families/dark-legacy-overrides.css from the six
// minimized legacy route-family stylesheets. Parses every rule with postcss,
// rewrites hardcoded light-theme colors to --rin-* dark tokens, and emits
// unlayered `[data-theme="dark"] <selector>` rules that win over the low-priority
// `route-foundation` layer.
//
// Run from ui/:  node scripts/generate-dark-legacy-overrides.mjs
// Manual additions go in dark-legacy-overrides.manual.css (appended verbatim).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const uiRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const familiesDir = path.join(uiRoot, 'src/styles/product-families');
const familyFiles = [
  'discovery.css',
  'knowledge.css',
  'knowledge-accessibility.css',
  'identity.css',
  'creation.css',
  'operations.css',
  'account-policy.css',
];
const outFile = path.join(familiesDir, 'dark-legacy-overrides.css');
const manualFile = path.join(familiesDir, 'dark-legacy-overrides.manual.css');

// Property groups decide which replacement table applies.
const TEXT_PROPS = new Set(['color', 'caret-color', 'fill', 'stroke', 'text-decoration-color']);
const BORDER_PROPS = new Set([
  'border', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-inline', 'border-block', 'border-inline-start', 'border-inline-end',
  'border-block-start', 'border-block-end', 'outline', 'outline-color',
]);
const BG_PROPS = new Set(['background', 'background-color']);
const SHADOW_PROPS = new Set(['box-shadow']);

// Ordered longest-first; each entry replaces one hardcoded light value.
const TEXT_MAP = [
  [/rgb\(\s*27\s*,\s*27\s*,\s*24\s*\)/g, 'var(--rin-ink)'],
  [/rgb\(\s*44\s*,\s*62\s*,\s*80\s*\)/g, 'var(--rin-ink)'],
  [/#24292e/gi, 'var(--rin-ink)'],
  [/#2c3e50/gi, 'var(--rin-ink)'],
  [/#1b1b18/gi, 'var(--rin-ink)'],
  [/#718096/gi, 'var(--rin-ink-muted)'],
  [/#64748b/gi, 'var(--rin-ink-muted)'],
  [/#4a5568/gi, 'var(--rin-ink-muted)'],
  [/#2b577a/gi, 'var(--rin-accent)'],
  [/#8a5a20/gi, 'var(--rin-warning)'],
  [/#276749/gi, 'var(--rin-success)'],
  [/#9d2f25/gi, 'var(--rin-destructive)'],
  [/#b42318/gi, 'var(--rin-destructive)'],
];

const BG_MAP = [
  [/#ffffff/gi, 'var(--rin-surface)'],
  [/#fff(?![0-9a-fA-F])/gi, 'var(--rin-surface)'],
  [/#f8fafc/gi, 'var(--rin-canvas)'],
  [/#f1f5f9/gi, 'var(--rin-surface-subtle)'],
  [/#edf2f7/gi, 'var(--rin-surface-subtle)'],
  [/#e2e8f0/gi, 'var(--rin-surface-subtle)'],
  [/#e5e7eb/gi, 'var(--rin-surface-subtle)'],
  [/#cbd5df/gi, 'var(--rin-surface-subtle)'],
  [/#2b577a/gi, 'var(--rin-accent)'],
  [/#2c3e50/gi, 'var(--rin-elevated)'],
  [/#1b1b18/gi, 'var(--rin-elevated)'],
  [/#9d2f25/gi, 'var(--rin-destructive)'],
  [/#b42318/gi, 'var(--rin-destructive)'],
  [/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g, 'rgba(17, 28, 37, $1)'],
  [/rgba\(\s*248\s*,\s*250\s*,\s*252\s*,\s*([\d.]+)\s*\)/g, 'rgba(11, 18, 24, $1)'],
  [/rgba\(\s*237\s*,\s*242\s*,\s*247\s*,\s*([\d.]+)\s*\)/g, 'rgba(15, 25, 33, $1)'],
];

const BORDER_MAP = [
  [/#e5e7eb/gi, 'var(--rin-border)'],
  [/#e2e8f0/gi, 'var(--rin-border)'],
  [/#edf2f7/gi, 'var(--rin-border)'],
  [/#f1f5f9/gi, 'var(--rin-border)'],
  [/#cbd5df/gi, 'var(--rin-border)'],
  [/#d1d5db/gi, 'var(--rin-border)'],
  [/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)/g, 'rgba(232, 240, 245, $1)'],
];

const SHADOW_MAP = [
  [/rgba\(\s*27\s*,\s*27\s*,\s*24\s*,\s*([\d.]+)\s*\)/g, 'rgba(0, 0, 0, $1)'],
  [/rgba\(\s*44\s*,\s*62\s*,\s*80\s*,\s*([\d.]+)\s*\)/g, 'rgba(0, 0, 0, $1)'],
  [/rgb\(\s*44\s*62\s*80\s*\/\s*([\d.]+)\s*\)/g, 'rgb(0 0 0 / $1)'],
];

const mapsFor = (prop) =>
  TEXT_PROPS.has(prop) ? TEXT_MAP : BORDER_PROPS.has(prop) ? BORDER_MAP
  : BG_PROPS.has(prop) ? BG_MAP : SHADOW_PROPS.has(prop) ? SHADOW_MAP : null;

function rewriteValue(prop, value) {
  if (/var\(|gradient\(|url\(/i.test(value)) return null;
  const map = mapsFor(prop);
  if (!map) return null;
  let out = value;
  let changed = false;
  for (const [re, repl] of map) {
    if (re.test(out)) { out = out.replace(re, repl); changed = true; }
  }
  return changed ? out : null;
}

function splitTopLevelCommas(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts;
}

function prefixSelectorWithDark(selector) {
  return splitTopLevelCommas(selector).map((part) => `[data-theme="dark"] ${part}`).join(', ');
}

function parentAtRulePrefix(rule) {
  const parts = [];
  let p = rule.parent;
  while (p && p.type === 'atrule') {
    if (p.name !== 'layer') parts.unshift(p);
    p = p.parent;
  }
  return parts;
}

const emitted = new Map(); // key -> { wrapper, selector, prop, value, important }
let skippedVarGradient = 0;

for (const file of familyFiles) {
  const css = fs.readFileSync(path.join(familiesDir, file), 'utf8');
  const root = postcss.parse(css, { from: file });
  root.walkRules((rule) => {
    if (!rule.selector) return;
    if (/^:root$/.test(rule.selector)) return;
    const wrappers = parentAtRulePrefix(rule);
    const wrapperKey = wrappers.map((w) => `${w.name} ${w.params}`).join('|');
    if (wrappers.some((w) => w.name === 'keyframes')) return;
    if (rule.selector.includes('[data-theme')) return;

    let prefixed = null;
    for (const decl of rule.nodes ?? []) {
      if (decl.type !== 'decl') continue;
      const rewritten = rewriteValue(decl.prop, decl.value);
      if (!rewritten) {
        if (/var\(|gradient\(/i.test(decl.value) && mapsFor(decl.prop)) skippedVarGradient++;
        continue;
      }
      if (prefixed === null) prefixed = prefixSelectorWithDark(rule.selector);
      const key = `${wrapperKey}||${prefixed}||${decl.prop}`;
      if (!emitted.has(key)) {
        emitted.set(key, {
          wrappers, selector: prefixed, prop: decl.prop,
          value: rewritten, important: decl.important,
        });
      }
    }
  });
}

const lines = [];
lines.push('/* AUTO-GENERATED by scripts/generate-dark-legacy-overrides.mjs — do not edit. */');
lines.push('/* Regenerate: node scripts/generate-dark-legacy-overrides.mjs */');
lines.push('');
lines.push('/* Important overrides live in the early `rin-dark-important` layer: for');
lines.push('   important declarations the layer order reverses, so this beats the');
lines.push('   route-foundation layer that the legacy family files live in. */');

const sorted = [...emitted.values()].sort((a, b) => a.selector.localeCompare(b.selector));
const importantRules = sorted.filter((r) => r.important);
const normalRules = sorted.filter((r) => !r.important);

function ruleText(r, indent = '  ') {
  return `${indent}${r.selector} { ${r.prop}: ${r.value} !important; }`;
}

lines.push('@layer rin-dark-important {');
for (const r of importantRules) {
  if (r.wrappers.length > 0) {
    const open = r.wrappers.map((w) => `  @${w.name} ${w.params} {`).join('\n');
    const close = r.wrappers.map(() => '  }').join('\n');
    lines.push(`${open}\n${ruleText(r, '    ')}\n${close}`);
  } else {
    lines.push(ruleText(r));
  }
}
lines.push('}');
lines.push('');

function writeRule(l, r) {
  l.push(`${r.selector} { ${r.prop}: ${r.value}; }`);
}

for (const r of normalRules) {
  if (r.wrappers.length > 0) {
    const open = r.wrappers.map((w) => `@${w.name} ${w.params} {`).join('\n');
    const close = r.wrappers.map(() => '}').join('\n');
    lines.push(`${open}\n  ${r.selector} { ${r.prop}: ${r.value}; }\n${close}`);
  } else {
    writeRule(lines, r);
  }
}

if (fs.existsSync(manualFile)) {
  lines.push('');
  lines.push('/* MANUAL OVERRIDES (dark-legacy-overrides.manual.css) */');
  lines.push(fs.readFileSync(manualFile, 'utf8'));
}

fs.writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`emitted ${emitted.size} override rules (${skippedVarGradient} var()/gradient decls left to tokens) -> ${path.relative(uiRoot, outFile)}`);
