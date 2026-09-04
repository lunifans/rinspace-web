import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { loadContentDetail } = vi.hoisted(() => ({
  loadContentDetail: vi.fn(),
}));

vi.mock('@/services/domains/article', () => ({ loadContentDetail }));

import InternalContentLinkPreview from './InternalContentLinkPreview';

function ArticleFixture() {
  const rootRef = useRef<HTMLElement | null>(null);
  return (
    <section ref={rootRef}>
      <a href="/q/303/a-question">另一个问题</a>
      <a href="https://example.com/a/404">外部文章</a>
      <InternalContentLinkPreview rootRef={rootRef} />
    </section>
  );
}

describe('InternalContentLinkPreview', () => {
  it('loads a supported body link on focus intent and leaves external links untouched', async () => {
    loadContentDetail.mockResolvedValue({
      id: '303',
      slug: '303',
      type: 'question',
      title: '层与上同调的问题',
      author: 'Lunifans',
      meta: '12 回答',
      excerpt: '这是来自站内公开内容接口的摘要。',
      tags: [],
      interactions: '',
      heat: '',
      body: '',
      readCount: 20,
      collected: false,
      createdAt: '2026-08-24T00:00:00Z',
      updatedAt: '2026-08-24T00:00:00Z',
    });
    render(<ArticleFixture />);

    const internalLink = screen.getByRole('link', { name: '另一个问题' });
    const externalLink = screen.getByRole('link', { name: '外部文章' });
    expect(loadContentDetail).not.toHaveBeenCalled();

    externalLink.focus();
    expect(loadContentDetail).not.toHaveBeenCalled();

    internalLink.focus();
    expect(await screen.findByText('层与上同调的问题')).toBeTruthy();
    expect(loadContentDetail).toHaveBeenCalledTimes(1);
    expect(loadContentDetail).toHaveBeenCalledWith('303');
    expect(internalLink.getAttribute('href')).toBe('/q/303/a-question');
    expect(externalLink.getAttribute('href')).toBe('https://example.com/a/404');
  });
});
