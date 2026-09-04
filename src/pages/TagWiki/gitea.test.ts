import {
  tagWikiGiteaFolder,
  tagWikiGiteaHistoryPath,
  tagWikiGiteaSourcePath,
} from './gitea';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
};

test('builds id-first Gitea folder paths for canonical tags', () => {
  const tag = { id: 5815, tagId: '5815', slugName: 'weil-pairings' };

  expect(tagWikiGiteaFolder(tag)).toBe('5815-weil-pairings');
  expect(tagWikiGiteaSourcePath(tag)).toBe('/repos/rinspace/tags/src/branch/main/5815-weil-pairings');
  expect(tagWikiGiteaHistoryPath(tag)).toBe('/repos/rinspace/tags/commits/branch/main/5815-weil-pairings');
});

test('keeps the persisted wiki source folder across slug changes', () => {
  const tag = {
    id: 42,
    tagId: '42',
    slugName: 'abelian-variety',
    wikiSourceFile: {
      filename: '42-abelian-varieties/main.tex',
    },
  };

  expect(tagWikiGiteaFolder(tag)).toBe('42-abelian-varieties');
  expect(tagWikiGiteaSourcePath(tag)).toBe('/repos/rinspace/tags/src/branch/main/42-abelian-varieties');
});

test('keeps legacy slug-only Gitea paths as a fallback', () => {
  expect(tagWikiGiteaFolder('abelian-variety')).toBe('abelian-variety');
  expect(tagWikiGiteaHistoryPath('abelian-variety')).toBe(
    '/repos/rinspace/tags/commits/branch/main/abelian-variety',
  );
});
