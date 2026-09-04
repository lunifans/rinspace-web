import { rinMathJaxStretchyFontLoads } from './rinMathJaxMenu';

declare function test(name: string, callback: () => void): void;

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function hasLoad(loads: ReturnType<typeof rinMathJaxStretchyFontLoads>, font: string, text: string) {
  return loads.some((load) => load.font === font && load.text === text);
}

test('loads the computed NewCM fonts and glyphs used by a segmented matrix delimiter', () => {
  document.body.innerHTML = `
    <span class="rin-math rin-math-mathjax">
      <mjx-stretchy-v class="mjx-c5B">
        <mjx-beg>⎡</mjx-beg>
        <mjx-ext><mjx-spacer>⎢\n⎢\n⎢\n⎢</mjx-spacer></mjx-ext>
        <mjx-end>⎣</mjx-end>
      </mjx-stretchy-v>
    </span>
  `;
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = () => ({
    fontFamily: 'MJX-NCM-ZERO, MJX-NCM-N',
    fontSize: '16px',
  } as CSSStyleDeclaration);

  try {
    const loads = rinMathJaxStretchyFontLoads(document.body);

    assert(hasLoad(loads, '16px "MJX-NCM-N"', '⎡'), 'opening glyph must load NCM normal');
    assert(
      hasLoad(loads, '16px "MJX-NCM-N"', '⎢\n⎢\n⎢\n⎢'),
      'extender glyphs must load NCM normal',
    );
    assert(hasLoad(loads, '16px "MJX-NCM-N"', '⎣'), 'closing glyph must load NCM normal');
    assert(hasLoad(loads, '16px "MJX-NCM-ZERO"', '⎡'), 'fallback prefix must be retained');
    assert(!loads.some(({ font }) => font.includes('MJX-NCM-S3')), 'unused Size font must not load');
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
    document.body.replaceChildren();
  }
});

test('deduplicates identical computed font and glyph requests', () => {
  document.body.innerHTML = `
    <mjx-stretchy-v>
      <mjx-beg>⎡</mjx-beg>
      <mjx-end>⎡</mjx-end>
    </mjx-stretchy-v>
  `;
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = () => ({
    fontFamily: '"MJX-NCM-N"',
    fontSize: '1em',
  } as CSSStyleDeclaration);

  try {
    const loads = rinMathJaxStretchyFontLoads(document.body);
    assert(loads.length === 1, `expected one deduplicated load, received ${loads.length}`);
    assert(hasLoad(loads, '1em "MJX-NCM-N"', '⎡'), 'deduplicated load must retain glyph');
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
    document.body.replaceChildren();
  }
});
