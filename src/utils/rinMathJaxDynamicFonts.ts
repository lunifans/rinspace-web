type DynamicFontLoader = () => Promise<unknown>;

const newcmCHTMLDynamicPrefix = '@mathjax/mathjax-newcm-font/js/chtml/dynamic/';

// MathJax constructs these module names at runtime. Keep literal import targets so
// webpack includes every NewCM CHTML table while still loading each table on demand.
const newcmCHTMLDynamicLoaders: Record<string, DynamicFontLoader> = {
  PUA: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/PUA.js'),
  'accents-b-i': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/accents-b-i.js'),
  accents: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/accents.js'),
  arabic: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/arabic.js'),
  arrows: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/arrows.js'),
  'braille-d': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/braille-d.js'),
  braille: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/braille.js'),
  calligraphic: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/calligraphic.js'),
  cherokee: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/cherokee.js'),
  'cyrillic-ss': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/cyrillic-ss.js'),
  cyrillic: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/cyrillic.js'),
  devanagari: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/devanagari.js'),
  'double-struck': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/double-struck.js'),
  fraktur: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/fraktur.js'),
  'greek-ss': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/greek-ss.js'),
  greek: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/greek.js'),
  hebrew: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/hebrew.js'),
  'latin-b': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/latin-b.js'),
  'latin-bi': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/latin-bi.js'),
  'latin-i': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/latin-i.js'),
  latin: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/latin.js'),
  marrows: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/marrows.js'),
  math: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/math.js'),
  'monospace-ex': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/monospace-ex.js'),
  'monospace-l': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/monospace-l.js'),
  monospace: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/monospace.js'),
  mshapes: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/mshapes.js'),
  'phonetics-ss': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/phonetics-ss.js'),
  phonetics: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/phonetics.js'),
  'sans-serif-b': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/sans-serif-b.js'),
  'sans-serif-bi': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/sans-serif-bi.js'),
  'sans-serif-ex': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/sans-serif-ex.js'),
  'sans-serif-i': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/sans-serif-i.js'),
  'sans-serif-r': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/sans-serif-r.js'),
  'sans-serif': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/sans-serif.js'),
  script: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/script.js'),
  shapes: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/shapes.js'),
  'symbols-b-i': () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/symbols-b-i.js'),
  symbols: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/symbols.js'),
  variants: () => import('@mathjax/mathjax-newcm-font/mjs/chtml/dynamic/variants.js'),
};

export function loadRinMathJaxNewcmDynamicFont(name: string) {
  if (!name.startsWith(newcmCHTMLDynamicPrefix) || !name.endsWith('.js')) return null;
  const table = name.slice(newcmCHTMLDynamicPrefix.length, -3);
  return newcmCHTMLDynamicLoaders[table]?.() || null;
}
