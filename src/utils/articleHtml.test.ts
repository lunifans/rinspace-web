import { removeMatchingArticleDocumentTitle } from './articleHtml';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeNull(): void;
};

function documentFrom(html: string) {
  return new DOMParser().parseFromString(html, 'text/html');
}

test('removes a matching leading h1 nested in the server-rendered article wrapper', () => {
  const document = documentFrom(
    '<style>.article{}</style><article class="rin-markdown-draft"><h1>Dijkstra’s algorithm</h1><p>Body</p></article>',
  );

  removeMatchingArticleDocumentTitle(document, 'Dijkstra’s algorithm');

  expect(document.body.querySelector('h1')).toBeNull();
  expect(document.body.textContent?.trim()).toBe('Body');
});

test('keeps a leading h1 when it differs from the page title', () => {
  const document = documentFrom('<article><h1>Independent heading</h1><p>Body</p></article>');

  removeMatchingArticleDocumentTitle(document, 'Page title');

  expect(document.body.querySelector('h1')?.textContent).toBe('Independent heading');
});

test('keeps a matching h1 when meaningful article content appears before it', () => {
  const document = documentFrom('<article><p>Introduction</p><h1>Page title</h1></article>');

  removeMatchingArticleDocumentTitle(document, 'Page title');

  expect(document.body.querySelector('h1')?.textContent).toBe('Page title');
});

test('removes a leading rin writer document title without touching later headings', () => {
  const document = documentFrom(
    '<article><div class="rin-doc-title">Page title</div><h1>Section title</h1></article>',
  );

  removeMatchingArticleDocumentTitle(document, 'Page title');

  expect(document.body.querySelector('.rin-doc-title')).toBeNull();
  expect(document.body.querySelector('h1')?.textContent).toBe('Section title');
});
