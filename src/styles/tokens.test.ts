import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const themes = {
  light: { canvas: '#f8fafc', surface: '#ffffff', ink: '#2c3e50', muted: '#4a5568', accent: '#2b577a', signal: '#2b577a', destructive: '#b42318', warning: '#8a5a00' },
  dark: { canvas: '#0b1218', surface: '#111c25', ink: '#e8f0f5', muted: '#a8b6c2', accent: '#83b4d4', signal: '#83b4d4', destructive: '#ff8a80', warning: '#f1c75b' },
} as const;

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }

describe.each(Object.entries(themes))('%s semantic tokens', (_name, colors) => {
  it.each(['ink', 'muted', 'accent', 'signal', 'destructive', 'warning'] as const)('%s is readable on canvas', (token) => {
    expect(contrast(colors[token], colors.canvas)).toBeGreaterThanOrEqual(token === 'muted' ? 4.5 : 3);
  });
  it('body ink is readable on surfaces', () => expect(contrast(colors.ink, colors.surface)).toBeGreaterThanOrEqual(7));
});

describe('foundation ownership boundaries', () => {
  it('self-hosts all approved font families with swap behavior', () => {
    const css = fs.readFileSync(path.resolve('public/fonts/library/rinspace-fonts.css'), 'utf8');
    for (const family of ['IBM Plex Sans', 'Rinspace Newsreader', 'IBM Plex Mono', 'Rinspace Noto Sans SC', 'Rinspace Noto Serif SC']) expect(css).toContain(family);
    expect(css.match(/font-display:\s*swap/g)?.length).toBeGreaterThan(4);
  });

  it('omits Tailwind preflight and protects rich/editor/frozen surfaces', () => {
    const entry = fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8');
    const foundations = fs.readFileSync(path.resolve('src/styles/foundations.css'), 'utf8');
    expect(entry).not.toContain('preflight.css');
    for (const boundary of ['.rin-rich-content', '.rin-editor-host', '[data-rin-ui-boundary="frozen"]', '.katex', 'mjx-container']) expect(foundations).toContain(boundary);
  });

  it('keeps cultivation realm and phase semantics in the shared style entry', () => {
    const entry = fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8');
    const cultivation = fs.readFileSync(path.resolve('src/styles/cultivation.css'), 'utf8');
    expect(entry).toContain('@import "./cultivation.css"');
    for (const realm of ['qi', 'foundation', 'dan', 'yuanying', 'huashen', 'lianxu', 'heti', 'dacheng', 'zhenxian', 'jinxian', 'taiyi', 'daluo', 'daozu']) {
      expect(cultivation).toContain(`.cultivation-badge.realm-${realm}`);
    }
    for (const phase of ['q1', 'q13', 'early', 'middle', 'late', 'complete']) {
      expect(cultivation).toContain(`.cultivation-badge.phase-${phase}`);
    }
  });
});
