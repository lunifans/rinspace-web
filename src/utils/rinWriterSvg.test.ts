import {
  prefixRinWriterDiagramSvgIds,
  sanitizeRinWriterDiagramSvgUses,
} from './rinWriterSvg';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toContain(expected: string): void;
  not: {
    toContain(expected: string): void;
  };
};

function sanitizeDiagramSvg(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  sanitizeRinWriterDiagramSvgUses(document.body);
  prefixRinWriterDiagramSvgIds(document);
  return document.body.innerHTML;
}

const dvisvgmDiagramHtml = `
<figure class="rin-tikz rin-tikz-tikzcd">
  <div class="rin-tikz-svg">
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <path id="g0-1" d="M0 0h1v1H0z"></path>
      </defs>
      <g>
        <use x="6.28" y="-39.26" style="filter:url(#x)" data-action="x" xlink:href="#g0-1"></use>
      </g>
      <path d="M0 0H10" stroke="#000" fill="none"></path>
    </svg>
  </div>
</figure>`;

test('keeps local dvisvgm glyph use elements inside Rin diagram SVGs', () => {
  const html = sanitizeDiagramSvg(dvisvgmDiagramHtml);

  expect(html).toContain('<use');
  expect(html).toContain('id="rin-writer-svg-1-g0-1"');
  expect(html).toContain('href="#rin-writer-svg-1-g0-1"');
  expect(html).toContain('xlink:href="#rin-writer-svg-1-g0-1"');
  expect(html).toContain('stroke="#000"');
  expect(html).not.toContain('style=');
  expect(html).not.toContain('data-action');
});

test('removes SVG use elements outside Rin diagram SVGs', () => {
  const html = sanitizeDiagramSvg(`
    <svg>
      <defs><path id="g0-1" d="M0 0h1v1H0z"></path></defs>
      <use href="#g0-1"></use>
    </svg>
  `);

  expect(html).not.toContain('<use');
  expect(html).toContain('<path');
});

test('removes non-local SVG use references in Rin diagram SVGs', () => {
  const html = sanitizeDiagramSvg(`
    <figure class="rin-tikz">
      <div class="rin-tikz-svg">
        <svg>
          <defs><path id="g0-1" d="M0 0h1v1H0z"></path></defs>
          <use href="https://example.com/glyphs.svg#g0-1"></use>
          <use href="#missing"></use>
        </svg>
      </div>
    </figure>
  `);

  expect(html).not.toContain('<use');
  expect(html).not.toContain('https://example.com');
});
