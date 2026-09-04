import DOMPurify from 'dompurify';

const forbiddenInteractiveTags = [
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'meta',
  'object',
  'option',
  'select',
  'textarea',
];

const rinMathJaxStyleSelector =
  'style.rin-mathjax-chtml-style[data-rin-math-engine="mathjax-chtml"]';
const rinMathJaxStyleMaxBytes = 1024 * 1024;
const rinMathJaxElementPattern = /^mjx-[a-z][a-z0-9-]*$/;

type SanitizeReaderHtmlOptions = {
  rendererFinal?: boolean;
};

function splitTrustedRinRendererHtml(value: string) {
  if (typeof DOMParser === 'undefined') {
    return { bodyHtml: value, styleHtml: '' };
  }
  const document = new DOMParser().parseFromString(value, 'text/html');
  const seen = new Set<string>();
  const styles = Array.from(
    document.querySelectorAll<HTMLStyleElement>(rinMathJaxStyleSelector),
  )
    .filter((style) => {
      const text = style.textContent || '';
      return (
        new Blob([text]).size <= rinMathJaxStyleMaxBytes &&
        text.includes('mjx-container') &&
        text.includes('@font-face') &&
        text.includes('/fonts/mathjax-newcm/')
      );
    })
    .map((style) => style.outerHTML)
    .filter((styleHtml) => {
      if (seen.has(styleHtml)) return false;
      seen.add(styleHtml);
      return true;
    });
  document.querySelectorAll('style').forEach((style) => style.remove());
  return {
    bodyHtml: document.body.innerHTML,
    styleHtml: styles.join('\n'),
  };
}

/**
 * Sanitize repository-rendered or legacy HTML immediately before it crosses
 * React's dangerouslySetInnerHTML boundary. DOMPurify removes event handlers,
 * executable URLs and script-capable markup while retaining document, math,
 * and diagram structure used by the Rin reader.
 */
export function sanitizeReaderHtml(
  value: string,
  options: SanitizeReaderHtmlOptions = {},
): string {
  if (!value.trim()) return '';
  const rendererHtml = options.rendererFinal
    ? splitTrustedRinRendererHtml(value)
    : { bodyHtml: value, styleHtml: '' };
  const bodyHtml = DOMPurify.sanitize(rendererHtml.bodyHtml, {
    USE_PROFILES: {
      html: true,
      mathMl: true,
      svg: true,
      svgFilters: true,
    },
    FORBID_TAGS: forbiddenInteractiveTags,
    ...(options.rendererFinal
      ? {
          CUSTOM_ELEMENT_HANDLING: {
            tagNameCheck: rinMathJaxElementPattern,
            attributeNameCheck: (attributeName: string) =>
              !/^on/i.test(attributeName) &&
              !/^(?:href|src|xlink:href|formaction)$/i.test(attributeName),
            allowCustomizedBuiltInElements: false,
          },
        }
      : {}),
  });
  return [rendererHtml.styleHtml, bodyHtml].filter(Boolean).join('\n').trim();
}
