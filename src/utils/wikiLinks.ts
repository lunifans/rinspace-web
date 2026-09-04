import { publicEnv } from '@/app/config/env';
export type WikiTagReference = {
  kind?: 'tag' | 'blog' | 'book';
  tagId?: string;
  slug: string;
  label: string;
  section: string;
  href: string;
};

export type WikiResolvedReference = {
  key: string;
  label: string;
  href: string;
  resolved?: boolean;
};

const wikiLinkPattern = /\[\[([^\]\|\n]{1,160})(?:\|([^\]\n]{0,200}))?\]\]/g;
const wikiCitationCommandPattern = /\\(?:cite|citet|citep|citealp|citeauthor|citeyear|parencite|textcite|autocite)(?:\[[^\]\n]*\]){0,2}\{([^{}\n]{1,500})\}/g;
const skippedTextContainers = new Set([
  'A',
  'CODE',
  'KBD',
  'MATH',
  'PRE',
  'SAMP',
  'SCRIPT',
  'STYLE',
  'SVG',
  'TEXTAREA',
]);

const rinMathJaxStyleSelector =
  'style.rin-mathjax-chtml-style[data-rin-math-engine="mathjax-chtml"]';

export function wikiDocumentHtml(document: Document) {
  const seen = new Set<string>();
  const rendererStyles = Array.from(
    document.querySelectorAll<HTMLStyleElement>(rinMathJaxStyleSelector),
  )
    .map((style) => style.outerHTML)
    .filter((styleHtml) => {
      if (seen.has(styleHtml)) return false;
      seen.add(styleHtml);
      return true;
    });
  return [...rendererStyles, document.body.innerHTML]
    .filter(Boolean)
    .join('\n');
}

export function stripRinDocumentTitle(html: string) {
  const source = html.trim();
  if (!source || typeof DOMParser === 'undefined') return source;
  const document = new DOMParser().parseFromString(source, 'text/html');
  document.body.querySelectorAll('.rin-doc-title').forEach((element) => {
    element.remove();
  });
  return wikiDocumentHtml(document);
}

export function wikiPlainTextFromHtml(html: string) {
  const source = stripRinDocumentTitle(html).trim();
  if (!source) return '';
  if (!/<[a-z][\s\S]*>/i.test(source)) return source;
  if (typeof DOMParser === 'undefined') {
    return source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const document = new DOMParser().parseFromString(source, 'text/html');
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function cleanBibtexBraceArtifacts(value: string) {
  return value.replace(/\{([^{}\n]{1,180})\}/g, '$1');
}

function polishBibliographyTextNodes(root: Element, document: Document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let next = walker.nextNode();
  while (next) {
    nodes.push(next as Text);
    next = walker.nextNode();
  }
  nodes.forEach((node) => {
    const value = node.nodeValue || '';
    const cleaned = cleanBibtexBraceArtifacts(value);
    if (cleaned !== value) node.nodeValue = cleaned;
  });
}

export function polishRinBibliographyDocument(document: Document) {
  const bibliographies = Array.from(document.body.querySelectorAll<HTMLElement>('.rin-bibliography'));
  if (!bibliographies.length) return false;
  bibliographies.forEach((bibliography) => {
    bibliography.querySelectorAll<HTMLElement>('.rin-env-title').forEach((title) => {
      if ((title.textContent || '').trim().toLowerCase() === 'references') {
        title.textContent = '参考文献';
      }
    });
    polishBibliographyTextNodes(bibliography, document);
  });
  return true;
}

export function polishRinBibliographyHtml(html: string) {
  const source = html.trim();
  if (!source || typeof DOMParser === 'undefined') return source;
  const document = new DOMParser().parseFromString(source, 'text/html');
  if (!polishRinBibliographyDocument(document)) return source;
  return wikiDocumentHtml(document) || source;
}

function appBasePath() {
  return publicEnv.publicBasePath || '';
}

function normalizeWikiSlug(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(new RegExp(`^${appBasePath().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
    .replace(/^\/?tags\//, '')
    .replace(/\/info$/, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function splitTarget(value: string, allowTagPath = false) {
  const [rawValue, sectionValue = ''] = value.split('#', 2);
  let slugValue = rawValue;
  let tagId = '';
  const normalizedPath = rawValue
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(new RegExp(`^${appBasePath().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
    .replace(/^\/+|\/+$/g, '');
  if (allowTagPath && normalizedPath.startsWith('tags/')) {
    const parts = normalizedPath.split('/');
    if (/^\d+$/.test(parts[1] || '')) {
      tagId = parts[1];
      slugValue = '';
    }
  }
  const slug = tagId ? '' : normalizeWikiSlug(slugValue);
  const section = sectionValue.trim();
  return { tagId, slug, section };
}

function wikiTagHref(slug: string, section = '', tagId = '', kind: 'tag' | 'blog' | 'book' = 'tag') {
  const base = kind === 'blog'
    ? `${appBasePath()}/a/${encodeURIComponent(slug)}`
    : kind === 'book'
    ? `${appBasePath()}/books/${encodeURIComponent(slug)}`
    : tagId
    ? `${appBasePath()}/tags/${encodeURIComponent(tagId)}/info/${encodeURIComponent(slug || 'tag')}`
    : `${appBasePath()}/tags/${encodeURIComponent(slug)}/info`;
  return section ? `${base}#${encodeURIComponent(section)}` : base;
}

function wikiReferenceFromMatch(target: string, label?: string, allowTagPath = false): WikiTagReference | null {
  const { tagId, slug, section } = splitTarget(target, allowTagPath);
  if (!tagId && (!slug || slug.includes('/') || slug.length > 120)) return null;
  const displayLabel = (label || '').trim() || slug || `tags/${tagId}`;
  return {
    kind: 'tag',
    tagId: tagId || undefined,
    slug,
    label: displayLabel,
    section,
    href: wikiTagHref(slug, section, tagId),
  };
}

function wikiReferenceFromCitationKey(key: string): WikiTagReference | null {
  const trimmed = key.trim().replace(/^rinspace:/, '');
  if (trimmed.startsWith('tags/')) return wikiReferenceFromMatch(trimmed, undefined, true);
  if (trimmed.startsWith('a/')) {
    const [id, section = ''] = trimmed.slice('a/'.length).split('#', 2);
    const slug = id.trim();
    if (!slug || slug.includes('/')) return null;
    return {
      kind: 'blog',
      slug,
      label: `a/${slug}`,
      section: section.trim(),
      href: wikiTagHref(slug, section.trim(), '', 'blog'),
    };
  }
  if (trimmed.startsWith('books/')) {
    const [id, section = ''] = trimmed.slice('books/'.length).split('#', 2);
    const slug = id.trim();
    if (!slug || slug.includes('/')) return null;
    return {
      kind: 'book',
      slug,
      label: `books/${slug}`,
      section: section.trim(),
      href: wikiTagHref(slug, section.trim(), '', 'book'),
    };
  }
  if (!trimmed.startsWith('tag:')) return null;
  return wikiReferenceFromMatch(trimmed.slice('tag:'.length));
}

function wikiReferencesFromCitationKeys(keys: string) {
  return keys
    .split(',')
    .map(wikiReferenceFromCitationKey)
    .filter((reference): reference is WikiTagReference => reference !== null);
}

function parentSkipsWikiLinks(node: Node) {
  let element = node.parentElement;
  while (element) {
    if (skippedTextContainers.has(element.tagName)) return true;
    element = element.parentElement;
  }
  return false;
}

function withSectionKey(key: string, section = '') {
  return section ? `${key}#${section}` : key;
}

function citationDatasetKey(reference: WikiTagReference) {
  const base = reference.kind === 'blog'
    ? `a/${reference.slug}`
    : reference.kind === 'book'
    ? `books/${reference.slug}`
    : reference.tagId ? `tags/${reference.tagId}` : `tag:${reference.slug}`;
  return withSectionKey(base, reference.section);
}

function resolutionFor(reference: WikiTagReference, resolutions?: Map<string, WikiResolvedReference>) {
  if (!resolutions) return null;
  return resolutions.get(citationDatasetKey(reference)) || resolutions.get(citationDatasetKey({ ...reference, section: '' })) || null;
}

function resolvedHref(value: string) {
  const href = value.trim();
  if (!href || href.startsWith('#') || /^https?:\/\//i.test(href)) return href;
  const base = appBasePath();
  if (href === base || href.startsWith(`${base}/`)) return href;
  if (href.startsWith('/')) return `${base}${href}`;
  return href;
}

function linkTextNode(textNode: Text, resolutions?: Map<string, WikiResolvedReference>) {
  const source = textNode.nodeValue || '';
  wikiLinkPattern.lastIndex = 0;
  wikiCitationCommandPattern.lastIndex = 0;
  if (!wikiLinkPattern.test(source) && !wikiCitationCommandPattern.test(source)) return;
  wikiLinkPattern.lastIndex = 0;
  wikiCitationCommandPattern.lastIndex = 0;

  const ownerDocument = textNode.ownerDocument;
  const fragment = ownerDocument.createDocumentFragment();
  let cursor = 0;
  const matches: Array<{
    index: number;
    length: number;
    references: WikiTagReference[];
    fallback: string;
  }> = [];
  let linkMatch = wikiLinkPattern.exec(source);
  while (linkMatch) {
    const reference = wikiReferenceFromMatch(linkMatch[1], linkMatch[2]);
    matches.push({
      index: linkMatch.index,
      length: linkMatch[0].length,
      references: reference ? [reference] : [],
      fallback: linkMatch[0],
    });
    linkMatch = wikiLinkPattern.exec(source);
  }
  let citationMatch = wikiCitationCommandPattern.exec(source);
  while (citationMatch) {
    matches.push({
      index: citationMatch.index,
      length: citationMatch[0].length,
      references: wikiReferencesFromCitationKeys(citationMatch[1]),
      fallback: citationMatch[0],
    });
    citationMatch = wikiCitationCommandPattern.exec(source);
  }
  matches.sort((left, right) => left.index - right.index);

  matches.forEach((match) => {
    if (match.index < cursor) return;
    if (match.index > cursor) {
      fragment.appendChild(ownerDocument.createTextNode(source.slice(cursor, match.index)));
    }
    if (match.references.length) {
      match.references.forEach((reference, index) => {
        if (index > 0) fragment.appendChild(ownerDocument.createTextNode(', '));
        const anchor = ownerDocument.createElement('a');
        const resolved = resolutionFor(reference, resolutions);
        anchor.href = resolved ? resolvedHref(resolved.href) : reference.href;
        anchor.className = 'wiki-tag-link';
        anchor.dataset.wikiTagRef = reference.tagId || reference.slug;
        anchor.dataset.rinspaceCitation = citationDatasetKey(reference);
        anchor.textContent = resolved?.label || reference.label;
        fragment.appendChild(anchor);
      });
    } else {
      fragment.appendChild(ownerDocument.createTextNode(match.fallback));
    }
    cursor = match.index + match.length;
  });
  if (cursor < source.length) {
    fragment.appendChild(ownerDocument.createTextNode(source.slice(cursor)));
  }
  textNode.replaceWith(fragment);
}

function enhanceCitationElements(document: Document, resolutions?: Map<string, WikiResolvedReference>) {
  document.body.querySelectorAll<HTMLElement>('.rin-citation').forEach((element) => {
    if (element.querySelector('a')) return;
    const text = (element.textContent || '').trim().replace(/^\[|\]$/g, '');
    const references = wikiReferencesFromCitationKeys(text);
    if (!references.length) return;
    element.textContent = '';
    references.forEach((reference, index) => {
      if (index > 0) element.appendChild(document.createTextNode(', '));
      const anchor = document.createElement('a');
      const resolved = resolutionFor(reference, resolutions);
      anchor.href = resolved ? resolvedHref(resolved.href) : reference.href;
      anchor.className = 'wiki-tag-link';
      anchor.dataset.wikiTagRef = reference.tagId || reference.slug;
      anchor.dataset.rinspaceCitation = citationDatasetKey(reference);
      anchor.textContent = resolved?.label || reference.label;
      element.appendChild(anchor);
    });
  });
}

export function enhanceWikiTagLinks(html: string, resolvedReferences: WikiResolvedReference[] = []) {
  const source = html.trim();
  if (!source || typeof DOMParser === 'undefined') return source;
  const resolutions = new Map(
    resolvedReferences
      .filter((reference) => reference.key && reference.href)
      .map((reference) => [reference.key, reference]),
  );
  const document = new DOMParser().parseFromString(source, 'text/html');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let next = walker.nextNode();
  while (next) {
    if (!parentSkipsWikiLinks(next)) nodes.push(next as Text);
    next = walker.nextNode();
  }
  nodes.forEach((node) => linkTextNode(node, resolutions));
  enhanceCitationElements(document, resolutions);
  return wikiDocumentHtml(document) || source;
}

function parseLinkedAnchors(source: string) {
  if (!source.trim() || typeof DOMParser === 'undefined') return [] as WikiTagReference[];
  const document = new DOMParser().parseFromString(source, 'text/html');
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
    .map((anchor): WikiTagReference | null => {
      const citationKey = anchor.dataset.rinspaceCitation;
      if (citationKey) {
        const reference = wikiReferenceFromCitationKey(citationKey);
        if (reference) {
          return {
            ...reference,
            label: (anchor.textContent || '').trim() || reference.label,
          };
        }
      }
      const href = anchor.getAttribute('href') || '';
      const bibMatch = href.match(/^#rin-bib-(.+)$/);
      if (bibMatch) {
        return wikiReferenceFromCitationKey(decodeURIComponent(bibMatch[1]));
      }
      const tagMatch = href.match(/\/tags\/([^/#?]+)(?:(?:\/info(?:\/([^/#?]+))?)|(?:\/([^/#?]+)))?(?:#([^?]+))?/);
      if (tagMatch) {
        const identity = decodeURIComponent(tagMatch[1]);
        const pathSlug = tagMatch[2] || tagMatch[3] ? decodeURIComponent(tagMatch[2] || tagMatch[3]) : '';
        const section = tagMatch[4] ? decodeURIComponent(tagMatch[4]) : '';
        const isId = /^\d+$/.test(identity);
        const slug = isId ? pathSlug : identity;
        return {
          kind: 'tag',
          tagId: isId ? identity : undefined,
          slug,
          section,
          label: (anchor.textContent || '').trim() || slug || `tags/${identity}`,
          href: wikiTagHref(slug, section, isId ? identity : ''),
        };
      }
      const blogMatch = href.match(/\/a\/([^/#?]+)(?:\/[^#?]*)?(?:#([^?]+))?/);
      if (blogMatch) {
        const slug = decodeURIComponent(blogMatch[1]);
        const section = blogMatch[2] ? decodeURIComponent(blogMatch[2]) : '';
        return {
          kind: 'blog',
          slug,
          section,
          label: (anchor.textContent || '').trim() || `a/${slug}`,
          href: wikiTagHref(slug, section, '', 'blog'),
        };
      }
      const bookMatch = href.match(/\/books\/([^/#?]+)(?:\/[^#?]*)?(?:#([^?]+))?/);
      if (!bookMatch) return null;
      const slug = decodeURIComponent(bookMatch[1]);
      const section = bookMatch[2] ? decodeURIComponent(bookMatch[2]) : '';
      return {
        kind: 'book',
        slug,
        section,
        label: (anchor.textContent || '').trim() || `books/${slug}`,
        href: wikiTagHref(slug, section, '', 'book'),
      };
    })
    .filter((reference): reference is WikiTagReference => Boolean(reference));
}

export function extractWikiTagReferences(source: string) {
  const references: WikiTagReference[] = [];
  wikiCitationCommandPattern.lastIndex = 0;
  let citationMatch = wikiCitationCommandPattern.exec(source);
  while (citationMatch) {
    references.push(...wikiReferencesFromCitationKeys(citationMatch[1]));
    citationMatch = wikiCitationCommandPattern.exec(source);
  }
  wikiLinkPattern.lastIndex = 0;
  let match = wikiLinkPattern.exec(source);
  while (match) {
    const reference = wikiReferenceFromMatch(match[1], match[2]);
    if (reference) references.push(reference);
    match = wikiLinkPattern.exec(source);
  }
  references.push(...parseLinkedAnchors(source));

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind || 'tag'}:${reference.tagId || reference.slug}#${reference.section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
