import { mergeWikiSources } from './wikiMerge';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toContain(expected: string): void;
};

test('mergeWikiSources keeps local when latest is unchanged', () => {
  const result = mergeWikiSources('a\nb\nc', 'a\nmine\nc', 'a\nb\nc');
  expect(result).toEqual({ merged: 'a\nmine\nc', hasConflicts: false });
});

test('mergeWikiSources keeps latest when local is unchanged', () => {
  const result = mergeWikiSources('a\nb\nc', 'a\nb\nc', 'a\nlatest\nc');
  expect(result).toEqual({ merged: 'a\nlatest\nc', hasConflicts: false });
});

test('mergeWikiSources combines non-overlapping edits', () => {
  const result = mergeWikiSources(
    'a\nb\nc\nd',
    'a\nmine\nc\nd',
    'a\nb\nc\nlatest',
  );
  expect(result).toEqual({ merged: 'a\nmine\nc\nlatest', hasConflicts: false });
});

test('mergeWikiSources marks overlapping edits', () => {
  const result = mergeWikiSources('a\nb\nc', 'a\nmine\nc', 'a\nlatest\nc');
  expect(result.hasConflicts).toBe(true);
  expect(result.merged).toContain('<<<<<<< 我的未保存修改');
  expect(result.merged).toContain('||||||| 打开编辑器时的版本');
  expect(result.merged).toContain('>>>>>>> 线上最新版');
});
