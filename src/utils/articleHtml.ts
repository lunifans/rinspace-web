const ignoredLeadingElements = new Set(['script', 'style', 'template']);
const visibleNonTextSelector = [
  'audio',
  'canvas',
  'embed',
  'hr',
  'iframe',
  'img',
  'math',
  'object',
  'pre',
  'svg',
  'table',
  'video',
].join(',');

function normalizedTitleText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function comparableArticleTitleText(value: string) {
  return normalizedTitleText(value).replace(
    /\\([\\`*_{}\[\]()#+\-.!<>|:\/])/g,
    '$1',
  );
}

function nodeHasMeaningfulContent(node: Node) {
  if (node.nodeType === node.TEXT_NODE) {
    return Boolean(normalizedTitleText(node.textContent || ''));
  }
  if (node.nodeType !== node.ELEMENT_NODE) return false;

  const element = node as Element;
  if (ignoredLeadingElements.has(element.tagName.toLowerCase())) return false;
  return Boolean(
    normalizedTitleText(element.textContent || '') ||
      element.matches(visibleNonTextSelector) ||
      element.querySelector(visibleNonTextSelector),
  );
}

function isLeadingContent(element: Element, root: Element) {
  let current: Node | null = element;
  while (current && current !== root) {
    let previous = current.previousSibling;
    while (previous) {
      if (nodeHasMeaningfulContent(previous)) return false;
      previous = previous.previousSibling;
    }
    current = current.parentNode;
  }
  return current === root;
}

export function removeMatchingArticleDocumentTitle(document: Document, title: string) {
  const documentTitle = document.body.querySelector('.rin-doc-title');
  if (documentTitle && isLeadingContent(documentTitle, document.body)) {
    documentTitle.remove();
    return;
  }

  const firstHeading = document.body.querySelector('h1');
  if (
    firstHeading &&
    isLeadingContent(firstHeading, document.body) &&
    comparableArticleTitleText(firstHeading.textContent || '') ===
      comparableArticleTitleText(title)
  ) {
    firstHeading.remove();
  }
}
