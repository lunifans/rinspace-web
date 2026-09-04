import type {
  RinBundle,
  RinEditorGlobal,
  RinEditorInstance,
  RinEditorOptions,
  RinEventName,
  RinProject,
  RinProjectFile,
  RinView,
} from '@/utils/rinWriter';

type RinEventHandler = (payload: unknown) => void;

function escapedHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clonedFiles(files: readonly RinProjectFile[]): RinProjectFile[] {
  return files.map((file) => ({ ...file }));
}

function defaultFile(title: string): RinProjectFile {
  return {
    path: 'main.tex',
    kind: 'tex',
    body: [
      '\\documentclass{article}',
      '\\usepackage{amsmath,amssymb}',
      `\\title{${title.replace(/[{}]/g, '')}}`,
      '\\begin{document}',
      '\\maketitle',
      '',
      '\\end{document}',
    ].join('\n'),
  };
}

function archiveBuffer(source: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(source);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createDemoRinEditor(options: RinEditorOptions): RinEditorInstance {
  const target = typeof options.target === 'string'
    ? document.querySelector<HTMLElement>(options.target)
    : options.target;
  if (!target) throw new Error('Demo Rin editor target is unavailable.');

  let title = options.title?.trim() || options.project?.title?.trim() || 'Rinspace demo';
  let files = clonedFiles(options.project?.files?.length ? options.project.files : [defaultFile(title)]);
  let mainFile = options.project?.mainFile || files[0]?.path || 'main.tex';
  let activePath = options.project?.activePath || mainFile;
  let view: RinView = options.view || options.project?.view || 'split';
  const handlers = new Map<RinEventName, Set<RinEventHandler>>();

  target.replaceChildren();
  const shell = document.createElement('section');
  shell.className = 'demo-rin-editor';
  shell.setAttribute('aria-label', 'Local Rin editor');
  const sourceLabel = document.createElement('label');
  sourceLabel.className = 'demo-rin-editor-source';
  const sourceTitle = document.createElement('span');
  sourceTitle.textContent = 'LaTeX · local source';
  const sourceEditor = document.createElement('textarea');
  sourceEditor.setAttribute('aria-label', 'LaTeX source');
  sourceEditor.spellcheck = false;
  const preview = document.createElement('pre');
  preview.className = 'demo-rin-editor-preview';
  preview.setAttribute('aria-label', 'Local LaTeX preview');
  sourceLabel.append(sourceTitle, sourceEditor);
  shell.append(sourceLabel, preview);
  target.append(shell);

  const emit = (name: RinEventName, payload: unknown) => {
    handlers.get(name)?.forEach((handler) => handler(payload));
  };
  const activeFile = () => files.find((file) => file.path === activePath) ?? files[0] ?? null;
  const render = () => {
    const file = activeFile();
    sourceEditor.value = file?.body || '';
    preview.textContent = file?.body || '';
    shell.dataset.view = view;
  };
  const updateActiveBody = (body: string) => {
    const index = files.findIndex((file) => file.path === activePath);
    if (index >= 0) files[index] = { ...files[index], body };
    else files.push({ path: activePath || mainFile, kind: 'tex', body });
    preview.textContent = body;
    emit('change', { title, path: activePath, body });
    emit('preview', { diagnostics: [], local: true });
  };
  const inputHandler = () => updateActiveBody(sourceEditor.value);
  sourceEditor.addEventListener('input', inputHandler);
  render();

  const bundle = async (): Promise<RinBundle> => {
    const source = files.find((file) => file.path === mainFile)?.body || activeFile()?.body || '';
    const html = `<pre class="rin-demo-latex-source"><code>${escapedHtml(source)}</code></pre>`;
    const data = archiveBuffer(source);
    const project: RinProject = {
      ...(options.project || {}),
      title,
      mainFile,
      activePath,
      files: clonedFiles(files),
      view,
    };
    return {
      archive: { filename: 'rinspace-demo-source.tex', mime: 'text/x-tex', data, bytes: data.byteLength },
      html,
      htmlFile: { filename: 'index.html', mime: 'text/html', text: html },
      project,
      source,
      texSource: source,
      diagnostics: ['Local demo preview only; server Renderer was not called.'],
      assets: [],
      assetFiles: [],
    };
  };

  let editor!: RinEditorInstance;
  editor = {
    ready: Promise.resolve(undefined as unknown as RinEditorInstance),
    async importArchive(file, importOptions) {
      const name = file instanceof File ? file.name : '';
      if (/\.(?:tex|ltx|txt)$/i.test(name) || file.type.startsWith('text/')) {
        const body = await file.text();
        const path = importOptions?.activePath || name || mainFile;
        if (importOptions?.mode === 'merge') {
          files.push({ path, kind: 'tex', body });
        } else {
          files = [{ path, kind: 'tex', body }];
          mainFile = path;
        }
        activePath = path;
        render();
        emit('change', { title, path, body });
      }
      return { local: true };
    },
    save: bundle,
    exportBundle: bundle,
    getPublishPayload: bundle,
    async getTitle() { return title; },
    async setTitle(nextTitle) { title = nextTitle; return { title }; },
    async getActiveFile() { return activeFile() ? { ...activeFile()! } : null; },
    async getFiles() { return clonedFiles(files); },
    async getMainFile() { return mainFile; },
    async setMainFile(path, setOptions) {
      mainFile = path;
      if (setOptions?.activate) activePath = path;
      render();
    },
    async getFile(path) { return files.find((file) => file.path === path) ?? null; },
    async setProject(project) {
      title = project.title?.trim() || title;
      files = clonedFiles(project.files?.length ? project.files : files);
      mainFile = project.mainFile || files[0]?.path || mainFile;
      activePath = project.activePath || mainFile;
      view = project.view || view;
      render();
    },
    async setFile(path, body, setOptions) {
      const index = files.findIndex((file) => file.path === path);
      const next = { path, body, kind: setOptions?.kind || files[index]?.kind || 'tex' };
      if (index >= 0) files[index] = { ...files[index], ...next };
      else files.push(next);
      if (setOptions?.main) mainFile = path;
      if (setOptions?.activate) activePath = path;
      render();
      emit('change', { title, path, body });
    },
    async createFile(path, body = '', createOptions) {
      return editor.setFile?.(path, body, createOptions);
    },
    async createFolder() { return { local: true }; },
    async renameFile(from, to) {
      files = files.map((file) => file.path === from ? { ...file, path: to } : file);
      if (mainFile === from) mainFile = to;
      if (activePath === from) activePath = to;
      render();
    },
    async deleteFile(path) {
      files = files.filter((file) => file.path !== path);
      mainFile = files.some((file) => file.path === mainFile) ? mainFile : files[0]?.path || 'main.tex';
      activePath = files.some((file) => file.path === activePath) ? activePath : mainFile;
      render();
    },
    async renameFolder(from, to) {
      const prefix = `${from.replace(/\/$/, '')}/`;
      files = files.map((file) => file.path.startsWith(prefix)
        ? { ...file, path: `${to.replace(/\/$/, '')}/${file.path.slice(prefix.length)}` }
        : file);
      render();
    },
    async deleteFolder(path) {
      const prefix = `${path.replace(/\/$/, '')}/`;
      files = files.filter((file) => !file.path.startsWith(prefix));
      render();
    },
    async setActiveFile(path) { activePath = path; render(); },
    async setView(nextView) { view = nextView; render(); },
    async insertText(text) {
      const start = sourceEditor.selectionStart;
      const end = sourceEditor.selectionEnd;
      const next = `${sourceEditor.value.slice(0, start)}${text}${sourceEditor.value.slice(end)}`;
      updateActiveBody(next);
      render();
      sourceEditor.setSelectionRange(start + text.length, start + text.length);
    },
    destroy() {
      sourceEditor.removeEventListener('input', inputHandler);
      target.replaceChildren();
      handlers.clear();
    },
    on(name, handler) {
      const current = handlers.get(name) ?? new Set<RinEventHandler>();
      current.add(handler);
      handlers.set(name, current);
      return editor;
    },
    off(name, handler) {
      handlers.get(name)?.delete(handler);
      return editor;
    },
  };
  editor.ready = Promise.resolve(editor);
  queueMicrotask(() => {
    options.onReady?.({ local: true });
    emit('ready', { local: true });
  });
  return editor;
}

export const demoRinEditorGlobal: RinEditorGlobal = Object.freeze({
  version: 'demo-browser-v1',
  create: createDemoRinEditor,
});
