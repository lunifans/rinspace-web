import { requestJson } from '@/services/httpClient';
import { commandsCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import {
  codeBlockSchema,
  setBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark';

const quiverIcon = `
  <span class="milkdown-icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="6" r="1.7"></circle>
        <circle cx="18" cy="6" r="1.7"></circle>
        <circle cx="6" cy="18" r="1.7"></circle>
        <circle cx="18" cy="18" r="1.7"></circle>
        <path d="M8.2 6h7.1"></path>
        <path d="M15.1 4.4 17 6l-1.9 1.6"></path>
        <path d="M6 8.2v7.1"></path>
        <path d="M4.4 15.1 6 17l1.6-1.9"></path>
        <path d="M8.2 18h7.1"></path>
        <path d="M15.1 16.4 17 18l-1.9 1.6"></path>
      </g>
    </svg>
  </span>
`;

type TopBarGroupInstance = {
  addItem: (
    key: string,
    item: {
      icon: string;
      active: (ctx: Ctx) => boolean;
      onRun: (ctx: Ctx) => void;
    },
  ) => TopBarGroupInstance;
  clear: () => TopBarGroupInstance;
};

export type QuiverTopBarBuilder = {
  addGroup: (key: string, label: string) => TopBarGroupInstance;
  getGroup: (key: string) => TopBarGroupInstance;
};

export type QuiverExportMessage = {
  scope: 'rin-quiver';
  type: 'export-tikzcd-result';
  requestId: string | null;
  ok: boolean;
  error?: string;
  payload?: {
    data?: string;
    url?: string;
  };
};

export type TikzcdDiagramSource = {
  body: string;
  options: string;
};

export type DiagramSourcePayload = TikzcdDiagramSource & {
  type: string;
};

export type RenderedDiagram = {
  url: string;
};

export function buildQuiverTopBar(
  builder: QuiverTopBarBuilder,
  openQuiver: () => void,
  label = 'Quiver',
) {
  builder.addGroup('rin-quiver', label).addItem('quiver', {
    icon: quiverIcon,
    active: () => false,
    onRun: openQuiver,
  });
}

export function buildRinTopBar(
  builder: QuiverTopBarBuilder,
  options: {
    mathIcon: string;
    mathLabel?: string;
    quiverLabel?: string;
    openMath: (ctx: Ctx) => void;
    openQuiver: () => void;
  },
) {
  builder.getGroup('block').clear().addItem('code-block', {
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm8 10h6v2h-6v-2zm-3.333-3L5.838 9.172l1.415-1.415L11.495 12l-4.242 4.243-1.415-1.415L8.667 12z"></path>
      </svg>
    `,
    active: () => false,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const codeBlock = codeBlockSchema.type(ctx);
      commands.call(setBlockTypeCommand.key, { nodeType: codeBlock });
    },
  });

  builder.addGroup('rin-math', options.mathLabel || 'Math').addItem('math', {
    icon: options.mathIcon,
    active: () => false,
    onRun: options.openMath,
  });

  buildQuiverTopBar(builder, options.openQuiver, options.quiverLabel || 'Quiver');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function readQuiverExportMessage(value: unknown): QuiverExportMessage | null {
  if (!isObject(value)) return null;
  if (value.scope !== 'rin-quiver' || value.type !== 'export-tikzcd-result') {
    return null;
  }
  const payload = isObject(value.payload) ? value.payload : undefined;
  return {
    scope: 'rin-quiver',
    type: 'export-tikzcd-result',
    requestId: typeof value.requestId === 'string' ? value.requestId : null,
    ok: value.ok === true,
    error: typeof value.error === 'string' ? value.error : undefined,
    payload: payload
      ? {
          data: typeof payload.data === 'string' ? payload.data : undefined,
          url: typeof payload.url === 'string' ? payload.url : undefined,
        }
      : undefined,
  };
}

export function normalizeQuiverTikzcd(value: string) {
  const text = value.trim();
  const begin = text.indexOf('\\begin{tikzcd}');
  const end = text.indexOf('\\end{tikzcd}', begin);
  if (begin < 0 || end < begin) return text;
  return text.slice(begin, end + '\\end{tikzcd}'.length).trim();
}

function optionalArgumentEnd(text: string, start: number) {
  if (text[start] !== '[') return start;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

export function parseTikzcdSource(source: string): TikzcdDiagramSource | null {
  const text = normalizeQuiverTikzcd(source);
  const begin = text.indexOf('\\begin{tikzcd}');
  if (begin < 0) {
    const body = text.trim();
    return body ? { body, options: '' } : null;
  }
  let bodyStart = begin + '\\begin{tikzcd}'.length;
  let options = '';
  if (text[bodyStart] === '[') {
    const optionEnd = optionalArgumentEnd(text, bodyStart);
    if (optionEnd < 0) return null;
    options = text.slice(bodyStart + 1, optionEnd - 1).trim();
    bodyStart = optionEnd;
  }
  const bodyEnd = text.indexOf('\\end{tikzcd}', bodyStart);
  if (bodyEnd < 0) return null;
  const body = text.slice(bodyStart, bodyEnd).trim();
  return body ? { body, options } : null;
}

export function quiverUrlFromExportUrl(value: string, origin: string) {
  const raw = value.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, origin);
    const quiverUrl = new URL('/quiver/', origin);
    quiverUrl.hash = parsed.hash.replace(/^#/, '');
    return quiverUrl.toString();
  } catch {
    if (!raw.startsWith('#')) return '';
    const quiverUrl = new URL('/quiver/', origin);
    quiverUrl.hash = raw.slice(1);
    return quiverUrl.toString();
  }
}

export function quiverCodeFromUrl(url: string) {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url;
  const params = new URLSearchParams(hash);
  return params.get('q') || '';
}

function markdownAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function quiverMetadataComment(quiverUrl: string) {
  return `<!-- rin-quiver url="${markdownAttribute(quiverUrl)}" type="tikzcd" -->`;
}

export function isLikelyQuiverCode(value: string) {
  const code = value.trim();
  return code.length >= 8 && /^[A-Za-z0-9+/=_-]+$/.test(code);
}

export function quiverMarkdownBlock(_quiverUrl: string, imageUrl: string) {
  if (!imageUrl.trim()) return '';
  return `\n\n![Quiver diagram](${imageUrl})\n\n`;
}

export function diagramIdFromImageUrl(value: string, origin = window.location.origin) {
  const raw = value.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, origin);
    const match = parsed.pathname.match(/\/rin\/api\/diagrams\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]).replace(/\.svg$/, '') : '';
  } catch {
    const match = raw.match(/\/rin\/api\/diagrams\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]).replace(/\.svg$/, '') : '';
  }
}

export function tikzcdDiagramSourceText(source: TikzcdDiagramSource) {
  const options = source.options.trim();
  return [
    `\\begin{tikzcd}${options ? `[${options}]` : ''}`,
    source.body.trim(),
    '\\end{tikzcd}',
  ].join('\n');
}

export async function loadTikzcdDiagramSource(id: string): Promise<TikzcdDiagramSource> {
  const diagramID = id.trim();
  if (!diagramID) throw new Error('Missing Quiver diagram identifier.');
  const payload = await requestJson<unknown>(
    `diagrams/${encodeURIComponent(diagramID)}/source`,
    { auth: 'none' },
  );
  if (!isObject(payload)) throw new Error('Unable to read the Quiver diagram source.');
  const type = typeof payload.type === 'string' ? payload.type : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const options = typeof payload.options === 'string' ? payload.options.trim() : '';
  if (type !== 'tikzcd') throw new Error('This image is not a Quiver commutative diagram.');
  if (!body) throw new Error('The Quiver diagram source is empty.');
  return { body, options };
}

export async function renderTikzcdDiagram(
  source: TikzcdDiagramSource,
): Promise<RenderedDiagram> {
  const payload = await requestJson<unknown>('diagrams/tikzcd', {
      method: 'POST',
      auth: 'none',
      body: {
        body: source.body,
        options: source.options,
      },
      timeoutMs: 15_000,
    });
  if (!isObject(payload)) throw new Error('Unable to render the Quiver diagram.');
  const url = typeof payload.url === 'string' ? payload.url : '';
  if (!url) throw new Error('The Quiver renderer did not return an image URL.');
  return { url };
}

function previousNonEmptyLine(lines: string[], index: number) {
  for (let lineIndex = index - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex]?.trim() || '';
    if (line) return line;
  }
  return '';
}

function quiverCodeFromComment(comment: string) {
  const match = comment.match(/rin-quiver\s+url="([^"]+)"/);
  if (!match?.[1]) return '';
  return quiverCodeFromUrl(match[1].replace(/&amp;/g, '&'));
}

export function quiverUrlFromComment(comment: string) {
  const match = comment.match(/rin-quiver\s+url="([^"]+)"/);
  return match?.[1] ? match[1].replace(/&amp;/g, '&') : '';
}

type DiagramImageLine = {
  alt: string;
  url: string;
  title: string;
};

function unquoteMarkdownTitle(value: string) {
  const text = value.trim();
  if (!text) return '';
  const quote = text[0];
  if (
    (quote === '"' && text.endsWith('"')) ||
    (quote === "'" && text.endsWith("'")) ||
    (quote === '(' && text.endsWith(')'))
  ) {
    return text
      .slice(1, -1)
      .replace(/\\(["'()\\])/g, '$1')
      .trim();
  }
  return text;
}

function markdownImageAlt(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function parseDiagramImageLine(line: string): DiagramImageLine | null {
  const match = line
    .trim()
    .match(/^!\[([^\]]*)\]\((\/rin\/api\/diagrams\/[^)\s]+|https?:\/\/[^)\s]+\/rin\/api\/diagrams\/[^)\s]+)(?:\s+(.+))?\)$/);
  if (!match?.[2]) return null;
  return {
    alt: match[1] || '',
    url: match[2],
    title: match[3] ? unquoteMarkdownTitle(match[3]) : '',
  };
}

function isDiagramImageLine(line: string) {
  return Boolean(parseDiagramImageLine(line));
}

function normalizedDiagramImageAlt(image: DiagramImageLine) {
  const title = image.title.trim();
  if (title) return title;
  const alt = image.alt.trim();
  if (!alt || isLikelyQuiverCode(alt) || /^\d+(?:\.\d+)?$/.test(alt)) {
    return 'Quiver diagram';
  }
  return alt;
}

export function ensureQuiverImageComments(markdown: string, origin: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const nextLines: string[] = [];

  lines.forEach((line, index) => {
    const image = parseDiagramImageLine(line);
    const previous = previousNonEmptyLine(nextLines, nextLines.length);
    if (/^<!--\s*rin-quiver\b[\s\S]*-->$/.test(line.trim())) {
      return;
    }
    if (!image) {
      nextLines.push(lines[index] ?? line);
      return;
    }

    const existingCode = isLikelyQuiverCode(image.alt || '') ? image.alt || '' : '';
    const commentCode = previous.includes('rin-quiver') ? quiverCodeFromComment(previous) : '';
    const code = existingCode || commentCode;
    const alt = markdownImageAlt(normalizedDiagramImageAlt(image));
    if (code || commentCode) {
      nextLines.push(`![${alt}](${image.url})`);
      return;
    }
    nextLines.push(`![${alt}](${image.url})`);
  });

  return nextLines.join('\n');
}

export function replaceQuiverImageBlock(
  markdown: string,
  oldCode: string,
  nextBlock: string,
  origin: string,
) {
  if (!oldCode) return markdown;
  const normalized = ensureQuiverImageComments(markdown, origin);
  const lines = normalized.split('\n');
  const replacement = nextBlock.trim().split('\n');
  const nextLines: string[] = [];
  let replaced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!replaced && line.includes('rin-quiver') && quiverCodeFromComment(line) === oldCode) {
      nextLines.push(...replacement);
      replaced = true;
      let scan = index + 1;
      while (scan < lines.length && !(lines[scan] || '').trim()) scan += 1;
      if (scan < lines.length && isDiagramImageLine(lines[scan] || '')) {
        index = scan;
      }
      continue;
    }
    nextLines.push(line);
  }

  return replaced ? nextLines.join('\n') : markdown;
}
