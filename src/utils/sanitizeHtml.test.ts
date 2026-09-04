import { expect, test } from 'vitest';

import { sanitizeReaderHtml } from './sanitizeHtml';

test('removes executable markup while preserving reader structure', () => {
  const sanitized = sanitizeReaderHtml([
    '<article><h2 id="safe">Safe</h2>',
    '<img src="x" onerror="alert(1)">',
    '<a href="javascript:alert(2)">bad link</a>',
    '<script>alert(3)</script>',
    '<iframe srcdoc="<script>alert(4)</script>"></iframe>',
    '<math><mi>x</mi></math><svg viewBox="0 0 1 1"><path d="M0 0"></path></svg>',
    '</article>',
  ].join(''));

  expect(sanitized).toContain('<article>');
  expect(sanitized).toContain('<h2 id="safe">Safe</h2>');
  expect(sanitized).toContain('<math>');
  expect(sanitized).toContain('<svg');
  expect(sanitized).not.toContain('onerror');
  expect(sanitized).not.toContain('javascript:');
  expect(sanitized).not.toContain('<script');
  expect(sanitized).not.toContain('<iframe');
});

test('preserves verified Rin Renderer MathJax CHTML without weakening ordinary HTML cleaning', () => {
  const source = [
    '<style class="rin-mathjax-chtml-style" data-rin-math-engine="mathjax-chtml">',
    '@font-face{font-family:MJXZERO;src:url("/fonts/mathjax-newcm/woff2/mjx-ncm-zero.woff2")}',
    'mjx-container[jax="CHTML"]{display:inline-block}',
    '</style>',
    '<p>Formula ',
    '<mjx-container class="MathJax" jax="CHTML" onclick="alert(1)">',
    '<mjx-math data-latex="x"><mjx-mi><mjx-c class="mjx-c1D465">x</mjx-c></mjx-mi></mjx-math>',
    '</mjx-container></p>',
    '<style>body{display:none}</style>',
    '<script>alert(2)</script>',
  ].join('');

  const ordinary = sanitizeReaderHtml(source);
  expect(ordinary).not.toContain('rin-mathjax-chtml-style');
  expect(ordinary).not.toContain('<mjx-container');

  const rendererFinal = sanitizeReaderHtml(source, { rendererFinal: true });
  expect(rendererFinal).toContain('rin-mathjax-chtml-style');
  expect(rendererFinal).toContain('<mjx-container');
  expect(rendererFinal).toContain('<mjx-math data-latex="x">');
  expect(rendererFinal).toContain('<mjx-c class="mjx-c1D465">');
  expect(rendererFinal).not.toContain('onclick');
  expect(rendererFinal).not.toContain('body{display:none}');
  expect(rendererFinal).not.toContain('<script');
});
