import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CodeMirrorEditor from './CodeMirrorEditor';

describe('CodeMirrorEditor comment mode', () => {
  it('hides the gutter and pastes VS Code Markdown as plain text', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeMirrorEditor
        ariaLabel="评论"
        onChange={onChange}
        preferPlainTextPaste
        showLineNumbers={false}
        value=""
      />,
    );

    expect(container.querySelector('.cm-gutters')).toBeNull();
    const content = container.querySelector<HTMLElement>('.cm-content');
    expect(content).not.toBeNull();

    const markdown = '# 标题\n\n- 第一项\n- 第二项';
    fireEvent.paste(content as HTMLElement, {
      clipboardData: {
        types: ['text/plain', 'text/html'],
        getData: (type: string) =>
          type === 'text/plain'
            ? markdown
            : '<pre style="font-family: monospace"># 标题</pre>',
      },
    });

    expect(onChange).toHaveBeenLastCalledWith(markdown);
    expect(container.querySelector('.cm-line')?.textContent).toBe('# 标题');
  });
});
