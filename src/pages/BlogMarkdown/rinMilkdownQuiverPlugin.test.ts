import {
  diagramIdFromImageUrl,
  ensureQuiverImageComments,
  quiverMarkdownBlock,
  tikzcdDiagramSourceText,
} from './rinMilkdownQuiverPlugin';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toContain(expected: string): void;
  not: {
    toContain(expected: string): void;
  };
};

const quiverCode = 'WzAsMixbMCwwLCJBIl0sWzEsMCwiQiJdLFswLDFdXQ==';

test('stores quiver inserts as a plain diagram image', () => {
  const markdown = quiverMarkdownBlock('', '/rin/api/diagrams/example');

  expect(markdown).toContain('![Quiver diagram](/rin/api/diagrams/example)');
  expect(markdown).not.toContain('rin-quiver');
  expect(markdown).not.toContain(`![${quiverCode}]`);
});

test('extracts diagram id from rin diagram image urls', () => {
  expect(diagramIdFromImageUrl('/rin/api/diagrams/example')).toBe('example');
  expect(diagramIdFromImageUrl('https://rinspace.com/rin/api/diagrams/example.svg')).toBe('example');
});

test('builds tikzcd source text from stored diagram source', () => {
  expect(tikzcdDiagramSourceText({
    body: 'A \\arrow[r] & B',
    options: 'column sep=large',
  })).toBe('\\begin{tikzcd}[column sep=large]\nA \\arrow[r] & B\n\\end{tikzcd}');
});

test('strips old quiver metadata comments from saved markdown', () => {
  const upgraded = ensureQuiverImageComments(
    [
      `<!-- rin-quiver url="https://rinspace.com/quiver/#q=${quiverCode}" type="tikzcd" -->`,
      `![${quiverCode}](/rin/api/diagrams/example)`,
    ].join('\n'),
    'https://rinspace.com',
  );
  expect(upgraded).toBe('![Quiver diagram](/rin/api/diagrams/example)');

  const labelled = ensureQuiverImageComments(
    '![Quiver diagram](/rin/api/diagrams/example)',
    'https://rinspace.com',
  );
  expect(labelled).toBe('![Quiver diagram](/rin/api/diagrams/example)');
});

test('normalizes milkdown quiver image caption into markdown alt text', () => {
  const normalized = ensureQuiverImageComments(
    '![1.00](/rin/api/diagrams/example "你好")',
    'https://rinspace.com',
  );

  expect(normalized).toBe('![你好](/rin/api/diagrams/example)');
});
