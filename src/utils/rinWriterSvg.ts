import { prefixInlineSvgIds } from './inlineSvgIds';

const allowedRinSvgUseAttributes = new Set([
  'href',
  'xlink:href',
  'x',
  'y',
  'dx',
  'dy',
  'transform',
  'width',
  'height',
]);

function isSafeRinSvgUseReference(value: string) {
  return /^#[A-Za-z_][\w:.-]*$/.test(value.trim());
}

function isSafeRinDiagramSvgUse(element: Element) {
  if (!element.closest('.rin-tikz-svg, .rin-reader-diagram-svg, .math-diagram-svg')) {
    return false;
  }
  const svg = element.closest('svg');
  if (!svg) return false;
  const href = (element.getAttribute('href') || '').trim();
  const xlinkHref = (element.getAttribute('xlink:href') || '').trim();
  const reference = href || xlinkHref;
  if (!reference || !isSafeRinSvgUseReference(reference)) return false;
  if (href && xlinkHref && href !== xlinkHref) return false;
  const referenceId = reference.slice(1);
  const hasLocalDefinition = Array.from(svg.querySelectorAll('defs [id]'))
    .some((definition) => definition.id === referenceId);
  if (!hasLocalDefinition) return false;
  element.setAttribute('href', reference);
  element.setAttribute('xlink:href', reference);
  return true;
}

function pruneRinDiagramSvgUseAttributes(element: Element) {
  Array.from(element.attributes).forEach((attribute) => {
    if (!allowedRinSvgUseAttributes.has(attribute.name.toLowerCase())) {
      element.removeAttribute(attribute.name);
    }
  });
}

export function sanitizeRinWriterDiagramSvgUses(root: ParentNode) {
  root.querySelectorAll('use').forEach((element) => {
    if (!isSafeRinDiagramSvgUse(element)) {
      element.remove();
      return;
    }
    pruneRinDiagramSvgUseAttributes(element);
  });
}

export function prefixRinWriterDiagramSvgIds(document: Document) {
  let index = 0;
  document.body
    .querySelectorAll('.rin-tikz-svg svg, .rin-reader-diagram-svg svg, .math-diagram-svg svg')
    .forEach((svg) => {
      index += 1;
      const prefixed = prefixInlineSvgIds(svg.outerHTML, `rin-writer-svg-${index}-`);
      if (prefixed === svg.outerHTML) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = prefixed;
      const nextSvg = wrapper.firstElementChild;
      if (nextSvg) svg.replaceWith(nextSvg);
    });
}
