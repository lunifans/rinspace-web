import {
  contentTitleSlug,
  legacyTagPath,
  tagEditPath,
  tagPath,
  tagReadOrLegacyPath,
  tagReadPath,
  tagWikiHistoryPath,
  tagWikiPath,
} from './routes';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
};

test('builds id-first canonical tag routes with trailing readable slug', () => {
  expect(tagReadPath(5815, 'weil-pairings')).toBe('/tags/5815/weil-pairings');
  expect(tagPath(5815, 'Weil Pairings')).toBe('/tags/5815/weil-pairings');
});

test('builds id-first wiki routes with slug as the last segment', () => {
  expect(tagWikiPath(5815, 'weil-pairings')).toBe('/tags/5815/info/weil-pairings');
  expect(tagWikiHistoryPath(5815, 'Weil Pairings')).toBe('/tags/5815/info/history/weil-pairings');
  expect(tagEditPath(5815, 'weil-pairings')).toBe('/tags/5815/edit/weil-pairings');
});

test('encodes canonical tag route segments consistently', () => {
  expect(contentTitleSlug('  Abelian Variety  ')).toBe('abelian-variety');
  expect(tagWikiPath('42/7', '中文 标签')).toBe('/tags/42%2F7/info/%E4%B8%AD%E6%96%87-%E6%A0%87%E7%AD%BE');
  expect(legacyTagPath('abelian-variety')).toBe('/tags/abelian-variety');
});

test('uses canonical tag route only for numeric tag identity', () => {
  expect(tagReadOrLegacyPath('5815', 'Weil Pairings')).toBe('/tags/5815/weil-pairings');
  expect(tagReadOrLegacyPath('abelian-variety')).toBe('/tags/abelian-variety');
});
