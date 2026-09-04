import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDemoRinEditor } from './rinEditor';

describe('demo Rin editor', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="editor"></div>';
  });

  it('keeps LaTeX editing, preview, and publication bundles entirely in the browser', async () => {
    const onReady = vi.fn();
    const editor = createDemoRinEditor({
      target: '#editor',
      baseUrl: '/unavailable-production-renderer',
      title: 'Local article',
      project: {
        mainFile: 'main.tex',
        activePath: 'main.tex',
        files: [{ path: 'main.tex', kind: 'tex', body: '\\begin{document}seed\\end{document}' }],
      },
      onReady,
    });
    await expect(editor.ready).resolves.toBe(editor);
    await Promise.resolve();
    expect(onReady).toHaveBeenCalledWith({ local: true });

    const source = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="LaTeX source"]');
    expect(source).not.toBeNull();
    source!.value = '\\begin{document}<local> $x^2$\\end{document}';
    source!.dispatchEvent(new Event('input', { bubbles: true }));

    await expect(editor.getFiles?.()).resolves.toMatchObject([
      { path: 'main.tex', body: '\\begin{document}<local> $x^2$\\end{document}' },
    ]);
    const bundle = await editor.save();
    expect(bundle.source).toContain('<local>');
    expect(bundle.html).toContain('&lt;local&gt;');
    expect(bundle.diagnostics).toContain('Local demo preview only; server Renderer was not called.');
    expect(document.querySelector('.demo-rin-editor-preview')?.textContent).toContain('$x^2$');

    editor.destroy();
    expect(document.querySelector('#editor')?.childElementCount).toBe(0);
  });
});
