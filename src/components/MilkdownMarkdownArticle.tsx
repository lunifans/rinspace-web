import { useMemo } from 'react';

import { commentMarkdownToHtml, markdownToHtml } from '@/utils/blogBody';
import { markdownWithoutDefaultTemplate } from '@/utils/markdownTitle';

type MilkdownMarkdownArticleProps = {
  markdown: string;
  className?: string;
  emptyFallback?: string;
  socialTokens?: boolean;
};

export default function MilkdownMarkdownArticle({
  markdown,
  className,
  emptyFallback = '<p>Empty article.</p>',
  socialTokens = false,
}: MilkdownMarkdownArticleProps) {
  const html = useMemo(
    () => {
      const source = markdownWithoutDefaultTemplate(markdown);
      return socialTokens ? commentMarkdownToHtml(source) : markdownToHtml(source);
    },
    [markdown, socialTokens],
  );

  return (
    <section className={`rin-writer-article${className ? ` ${className}` : ''}`}>
      <div
        className="rin-writer-html"
        dangerouslySetInnerHTML={{ __html: html || emptyFallback }}
      />
    </section>
  );
}
