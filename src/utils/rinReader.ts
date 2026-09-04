export type RinReaderTocItem = {
  id: string;
  text: string;
  level: 2 | 3 | 4;
};

export type RinReaderPage = {
  id: string;
  text: string;
  level: 2 | 3 | 4;
  html: string;
};

export type RinReaderPayload = {
  version: '0.1';
  title: string;
  toc: RinReaderTocItem[];
  pages: RinReaderPage[];
};

function normalizedText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function slugifyHeading(value: string, fallback: string) {
  const slug = normalizedText(value)
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || fallback;
}

function uniqueHeadingId(
  base: string,
  existingIds: Set<string>,
  usedIds: Map<string, number>,
) {
  const nextCount = (usedIds.get(base) || 0) + 1;
  usedIds.set(base, nextCount);
  let candidate = nextCount === 1 ? base : `${base}-${nextCount}`;
  while (existingIds.has(candidate)) {
    const retryCount = (usedIds.get(base) || 0) + 1;
    usedIds.set(base, retryCount);
    candidate = `${base}-${retryCount}`;
  }
  existingIds.add(candidate);
  return candidate;
}

function ensureHeadingIds(document: Document) {
  const existingIds = new Set(
    Array.from(document.body.querySelectorAll('[id]'))
      .map((element) => element.id)
      .filter(Boolean),
  );
  const usedIds = new Map<string, number>();
  document.body.querySelectorAll('h2, h3, h4').forEach((heading, index) => {
    if (heading.id) return;
    const base = slugifyHeading(
      heading.textContent || '',
      `section-${index + 1}`,
    );
    heading.id = uniqueHeadingId(base, existingIds, usedIds);
  });
}

function topLevelContainerFor(body: HTMLElement, target: Element) {
  for (const child of Array.from(body.childNodes)) {
    if (child === target) return child;
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).contains(target)) {
      return child;
    }
  }
  return target;
}

function nodeStartsPage(node: Node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = node as Element;
  if (element.tagName.toLowerCase() === 'h2') return true;
  return Boolean(element.querySelector('h2'));
}

export function buildRinReaderPayload(
  html: string,
  title: string,
): RinReaderPayload | null {
  if (typeof window === 'undefined' || !html.trim()) return null;
  const document = new DOMParser().parseFromString(html, 'text/html');
  ensureHeadingIds(document);
  const headings = Array.from(document.body.querySelectorAll('h2, h3, h4'));
  const toc = headings
    .map((heading) => {
      const level = Number(heading.tagName.slice(1));
      const text = normalizedText(heading.textContent || '');
      if (!heading.id || !text || (level !== 2 && level !== 3 && level !== 4)) {
        return null;
      }
      return { id: heading.id, text, level } satisfies RinReaderTocItem;
    })
    .filter((item): item is RinReaderTocItem => Boolean(item));
  if (!toc.length) return null;

  const pageHeadings = headings.filter((heading) => heading.tagName.toLowerCase() === 'h2');
  const pageStarts = pageHeadings.length ? pageHeadings : headings;
  const pages = pageStarts
    .map((heading) => {
      const startNode = topLevelContainerFor(document.body, heading);
      const pageDocument = document.implementation.createHTMLDocument('');
      let collecting = false;
      for (const child of Array.from(document.body.childNodes)) {
        if (child === startNode) {
          collecting = true;
        } else if (collecting && nodeStartsPage(child)) {
          break;
        }
        if (collecting) {
          pageDocument.body.appendChild(child.cloneNode(true));
        }
      }
      const level = Number(heading.tagName.slice(1));
      const text = normalizedText(heading.textContent || '');
      if (!heading.id || !text || (level !== 2 && level !== 3 && level !== 4)) {
        return null;
      }
      return {
        id: heading.id,
        text,
        level,
        html: pageDocument.body.innerHTML.trim(),
      } satisfies RinReaderPage;
    })
    .filter((item): item is RinReaderPage => Boolean(item?.html));

  if (!pages.length) return null;
  return {
    version: '0.1',
    title: title.trim(),
    toc,
    pages,
  };
}
