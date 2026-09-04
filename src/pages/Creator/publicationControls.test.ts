import {
  contentStatusForCreatorControls,
  creatorPageState,
  creatorSourceVisibility,
} from './publicationControls';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): { toBe(expected: unknown): void };

test('creator controls preserve all page-state and visibility combinations', () => {
  const combinations = [
    { page: 'draft', source: 'private', status: 'draft' },
    { page: 'draft', source: 'open', status: 'draft' },
    { page: 'published', source: 'private', status: 'private' },
    { page: 'published', source: 'open', status: 'published' },
  ] as const;

  combinations.forEach(({ page, source, status }) => {
    expect(contentStatusForCreatorControls(page, source)).toBe(status);
    expect(creatorPageState({ publishStatus: status, repositoryStatus: page, sourceVisibility: source })).toBe(page);
    expect(creatorSourceVisibility({ publishStatus: status, repositoryStatus: page, sourceVisibility: source })).toBe(source);
  });
});
