import { describe, expect, it } from 'vitest';

import {
  resolveInternalContentPreview,
} from './internalContentPreview';

const options = {
  currentHref: 'https://rinspace.com/a/100/current-article',
  origin: 'https://rinspace.com',
};

describe('resolveInternalContentPreview', () => {
  it.each([
    ['/a/101/another-article', 'blog', '101'],
    ['/books/202/read/a-chapter', 'book', '202'],
    ['/q/303/a-question', 'question', '303'],
    ['/d/404/a-discussion', 'discussion', '404'],
    ['/s/505/a-status', 'dynamic', '505'],
    ['/announcements/606', 'announcement', '606'],
  ])('recognizes supported internal content route %s', (href, kind, slug) => {
    expect(resolveInternalContentPreview(href, options)).toMatchObject({ href, kind, slug });
  });

  it('accepts canonical Rinspace absolute links while running on another same-origin host', () => {
    expect(resolveInternalContentPreview('https://rinspace.com/books/202', {
      currentHref: 'http://localhost:5173/a/100',
      origin: 'http://localhost:5173',
    })).toMatchObject({ kind: 'book', slug: '202' });
  });

  it('supports an application base path', () => {
    expect(resolveInternalContentPreview('/rinspace/q/303/title', {
      ...options,
      basePath: '/rinspace',
    })).toMatchObject({ kind: 'question', slug: '303' });
  });

  it.each([
    'https://example.com/a/101',
    '#section-two',
    'mailto:hello@rinspace.com',
    '/@lunifans',
    '/tags/42/algebra',
    '/a/100/current-article#footnote',
  ])('does not enhance unsupported link %s', (href) => {
    expect(resolveInternalContentPreview(href, options)).toBeNull();
  });
});
