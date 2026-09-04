function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function prefixInlineSvgIds(svg: string, prefix: string) {
  if (!svg || !prefix) return svg;
  const ids = new Set<string>();
  const prefixed = svg.replace(/\bid=(["'])([^"']+)\1/g, (match, quote: string, id: string) => {
    if (!id || id.startsWith(prefix)) return match;
    ids.add(id);
    return `id=${quote}${prefix}${id}${quote}`;
  });
  if (ids.size === 0) return prefixed;

  let next = prefixed;
  const orderedIds = Array.from(ids).sort((left, right) => right.length - left.length);
  for (const id of orderedIds) {
    const escaped = escapeRegExp(id);
    next = next.replace(
      new RegExp(`\\b((?:xlink:href|href)=["'])#${escaped}(["'])`, 'g'),
      `$1#${prefix}${id}$2`,
    );
    next = next.replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${prefix}${id})`);
  }
  return next;
}
