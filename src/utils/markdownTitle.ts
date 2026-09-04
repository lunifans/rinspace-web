const h1Pattern = /^\s{0,3}#(?!#)(?:\s|$)/;
const crepeDefaultMarkdownPattern = /^#\s+Untitled\s*\n+\s*Start writing here\.\s*$/i;
const markdownTextEscapePattern = /\\([\\`*{}\[\]()#+\-.!_$<>|])/g;
const markdownHeadingSpecialPattern = /([\\`*{}\[\]()#+\-.!_$<>|])/g;
const fencedCodePattern = /^\s{0,3}(`{3,}|~{3,})/;
const htmlBreakPattern = /\\?<br\s*(?:\\?\/)?\\?>/gi;
const htmlBreakOnlyLinePattern = /^(?:\s*\\?<br\s*(?:\\?\/)?\\?>\s*)+$/i;

function unescapeMarkdownText(value: string) {
  return value.replace(markdownTextEscapePattern, '$1');
}

function normalizedMarkdownTitleText(value: string) {
  return unescapeMarkdownText(value).replace(/\s+/g, ' ').trim();
}

function escapeMarkdownHeadingText(value: string) {
  return value.replace(markdownHeadingSpecialPattern, '\\$1');
}

export function sanitizeMarkdownSource(markdown: string) {
  let fenceMarker: string | null = null;
  return markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const fenceMatch = fencedCodePattern.exec(line);
      if (fenceMarker) {
        if (fenceMatch?.[1]?.[0] === fenceMarker[0] && fenceMatch[1].length >= fenceMarker.length) {
          fenceMarker = null;
        }
        return line;
      }
      if (fenceMatch?.[1]) {
        fenceMarker = fenceMatch[1];
        return line;
      }
      if (htmlBreakOnlyLinePattern.test(line)) return '';
      return line.replace(htmlBreakPattern, '');
    })
    .join('\n');
}

export function markdownWithoutDefaultTemplate(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, '\n').trim();
  return crepeDefaultMarkdownPattern.test(normalized) ? '' : sanitizeMarkdownSource(markdown);
}

export function firstMarkdownHeading(markdown: string) {
  const heading = markdownWithoutDefaultTemplate(markdown)
    .replace(/\r\n?/g, '\n')
    .split('\n')[0];
  if (!heading || !h1Pattern.test(heading)) return null;
  return heading
    .replace(/^\s{0,3}#\s*/, '')
    .replace(/\s+#*\s*$/, '')
    .replace(markdownTextEscapePattern, '$1')
    .trim();
}

export function markdownWithoutMatchingTitle(markdown: string, title: string) {
  const source = markdownWithoutDefaultTemplate(markdown).replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  const firstLine = lines[0] || '';
  const firstHeading = firstMarkdownHeading(source);

  if (
    !h1Pattern.test(firstLine) ||
    !firstHeading ||
    normalizedMarkdownTitleText(firstHeading) !== normalizedMarkdownTitleText(title)
  ) {
    return source;
  }

  return lines.slice(1).join('\n').replace(/^\n+/, '');
}

function demoteMarkdownHeading(line: string) {
  return line.replace(/^(\s{0,3})#(?!#)(\s|$)/, '$1##$2');
}

export function markdownWithTitle(markdown: string, title: string) {
  const nextTitle = title.trim();
  const lines = markdownWithoutDefaultTemplate(markdown)
    .replace(/\r\n?/g, '\n')
    .split('\n');

  let fenceMarker: string | null = null;
  const bodyLines = lines.map((line, index) => {
    const fenceMatch = fencedCodePattern.exec(line);
    if (fenceMarker) {
      if (fenceMatch?.[1]?.[0] === fenceMarker[0] && fenceMatch[1].length >= fenceMarker.length) {
        fenceMarker = null;
      }
      return line;
    }
    if (fenceMatch?.[1]) {
      fenceMarker = fenceMatch[1];
      return line;
    }
    if (!h1Pattern.test(line)) return line;
    if (index === 0) return null;
    return demoteMarkdownHeading(line);
  });
  const body = bodyLines
    .filter((line): line is string => line !== null)
    .join('\n')
    .replace(/^\n+/, '');

  if (!nextTitle) return body;
  const escapedTitle = escapeMarkdownHeadingText(unescapeMarkdownText(nextTitle));
  return body.trim() ? `# ${escapedTitle}\n\n${body}` : `# ${escapedTitle}`;
}
