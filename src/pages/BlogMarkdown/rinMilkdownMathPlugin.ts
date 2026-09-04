import type { Crepe } from '@milkdown/crepe';
import {
  editorViewCtx,
  inputRulesCtx,
  schemaCtx,
  SchemaReady,
} from '@milkdown/kit/core';
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx';
import { trailingConfig } from '@milkdown/kit/plugin/trailing';
import { codeBlockSchema, headingSchema } from '@milkdown/kit/preset/commonmark';
import {
  tableCellSchema,
  tableHeaderRowSchema,
  tableHeaderSchema,
  tableRowSchema,
  tableSchema,
} from '@milkdown/kit/preset/gfm';
import { GapCursor } from '@milkdown/kit/prose/gapcursor';
import type {
  Node as ProseMirrorNode,
  ResolvedPos,
} from '@milkdown/kit/prose/model';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import {
  Plugin,
  PluginKey,
  Selection,
  type SelectionBookmark,
  TextSelection,
  type Transaction,
} from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose, insert, replaceAll } from '@milkdown/kit/utils';
import katex, { type KatexOptions } from 'katex';

export const rinTopBarMathIcon = `
  <span data-rin-topbar-math="true">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
      <path fill="currentColor" d="M7 19v-.808L13.096 12L7 5.808V5h10v1.25H9.102L14.727 12l-5.625 5.77H17V19z"></path>
    </svg>
  </span>
`;

export function hasCompleteDisplayMathFence(markdown: string) {
  return /(?:^|\n)(?:\$\$\s*\n[\s\S]+?\n\$\$|\$\$[^\n$]+?\$\$[^\n]*|\\\[\s*\n[\s\S]+?\n\\\])(?=\n|$)/.test(markdown);
}

export function hasMarkdownMath(markdown: string) {
  return (
    hasCompleteDisplayMathFence(markdown) ||
    /(^|[^\w$])\$[^$\n]+\$(?=$|[^\w$])/.test(markdown) ||
    /\\\([^]*?\\\)|\\\[[^]*?\\\]/.test(markdown)
  );
}

function looksLikeCodeEditorClipboardHTML(html: string) {
  const normalized = html.toLocaleLowerCase();
  return (
    /white-space\s*:\s*pre(?:-wrap)?/.test(normalized) &&
    /font-family\s*:[^;]*(?:consolas|courier|monospace)/.test(normalized)
  );
}

export function shouldPasteClipboardAsMarkdown(
  plainText: string,
  htmlText: string,
) {
  if (!plainText) return false;
  return hasMarkdownMath(plainText) || looksLikeCodeEditorClipboardHTML(htmlText);
}

export function markdownMathForMilkdown(markdown: string) {
  return markdown
    .replace(
      /(^|\n)\$\$[ \t]*([^\n$]+?)[ \t]*\$\$([^\n]*)/g,
      (_match: string, lead: string, body: string, suffix: string) => {
        const trailingText = suffix.trimStart();
        return trailingText
          ? `${lead}$$\n${body}\n$$\n${trailingText}`
          : `${lead}$$\n${body}\n$$`;
      },
    )
    .replace(/\\\[\s*\n?([\s\S]*?)\n?\s*\\\]/g, '$$\n$1\n$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
}

function looksLikeWholeMarkdownDocument(markdown: string) {
  const text = markdown.replace(/\r\n?/g, '\n').trim();
  if (!text.includes('\n')) return false;
  return (
    /^#\s+\S/m.test(text) ||
    /^#{2,6}\s+\S/m.test(text) ||
    /^```/m.test(text) ||
    /^\|.+\|/m.test(text)
  );
}

function selectionCoversDocument(selection: Selection, documentSize: number) {
  return selection.from <= 1 && selection.to >= Math.max(1, documentSize - 1);
}

function shouldReplaceDocumentOnPaste(ctx: Ctx, markdown: string) {
  if (!looksLikeWholeMarkdownDocument(markdown)) return false;
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const docText = state.doc.textContent.trim();
  return docText.length === 0 || selectionCoversDocument(state.selection, state.doc.content.size);
}

export function pasteMarkdownMathInCtx(ctx: Ctx, markdown: string) {
  const milkdownMarkdown = markdownMathForMilkdown(markdown);
  if (shouldReplaceDocumentOnPaste(ctx, milkdownMarkdown)) {
    replaceAll(milkdownMarkdown, true)(ctx);
    return;
  }
  insert(milkdownMarkdown)(ctx);
}

export function restoreSelectionBookmarkInCtx(ctx: Ctx, bookmark: SelectionBookmark) {
  const view = ctx.get(editorViewCtx);
  try {
    const selection = bookmark.resolve(view.state.doc);
    view.dispatch(view.state.tr.setSelection(selection));
    view.focus();
    return true;
  } catch (error: unknown) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function normalizeMilkdownMathMarkdown(markdown: string) {
  return markdown
    .replace(/(^|\n)\\\[\n([\s\S]*?)(?:\n)?\\\]\n\\\](?=\n|$)/g, '$1\\[\n$2\n\\]')
    .replace(/(^|\n)\\\[\n([\s\S]*?)\n\\\]\n\\\](?=\n|$)/g, '$1\\[\n$2\n\\]');
}

export function normalizeLatexBlockEditorValue(value: string) {
  const text = value.replace(/\r\n?/g, '\n').trim();
  const blockFence = /^\$\$(?:\s*\n)?([\s\S]*?)(?:\n\s*)?\$\$$/;
  const bracketFence = /^\\\[(?:\s*\n)?([\s\S]*?)(?:\n\s*)?\\\]$/;
  const blockMatch = blockFence.exec(text);
  if (blockMatch?.[1] !== undefined) {
    return blockMatch[1].trim();
  }
  const bracketMatch = bracketFence.exec(text);
  if (bracketMatch?.[1] !== undefined) {
    return bracketMatch[1].trim();
  }
  return value;
}

function removeClosingMathFence(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const closingLine = lines[lines.length - 1]?.trim();
  if (closingLine !== '$$' && closingLine !== '\\]') return null;
  lines.pop();
  while (lines.length > 1 && lines[lines.length - 1]?.trim() === '') {
    lines.pop();
  }
  return lines.join('\n');
}

const gapCursorWithRuntimeChecks = GapCursor as typeof GapCursor & {
  valid?: ($pos: ResolvedPos) => boolean;
};

export const rinLatexBlockOpenEvent = 'rinspace:open-latex-block-editor';

type RinLatexBlockOpenRequest = {
  requestId: number;
  pos: number;
};

const rinDisplayMathShortcutKey = new PluginKey<RinLatexBlockOpenRequest | null>(
  'rin-display-math-shortcut',
);

let nextLatexBlockOpenRequestId = 0;

function isLatexCodeBlockNode(
  node: ProseMirrorNode | null | undefined,
): node is ProseMirrorNode {
  return (
    node?.type.name === 'code_block' &&
    String(node.attrs.language || '').toLowerCase() === 'latex'
  );
}

export const rinLatexTrailingConfigPlugin: MilkdownPlugin = (ctx) => () => {
  ctx.update(trailingConfig.key, (previous) => ({
    ...previous,
    shouldAppend: (lastNode, state) => {
      if (isLatexCodeBlockNode(lastNode)) return false;
      return previous.shouldAppend(lastNode, state);
    },
  }));
};

export const rinLatexCodeBlockGapCursorPlugin: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(SchemaReady);
  const schema = ctx.get(schemaCtx);
  const codeBlock = schema.nodes.code_block;
  if (!codeBlock) return;
  codeBlock.spec.createGapCursor = true;
};

function insertLatexPlaceholderParagraph(tr: Transaction, pos: number) {
  const paragraph = tr.doc.type.schema.nodes.paragraph?.create();
  if (!paragraph) return false;
  tr.insert(pos, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(pos + 1, tr.doc.content.size)));
  return true;
}

export const rinLatexTrailingPlaceholderPlugin = $prose(() => {
  return new Plugin({
    appendTransaction: (transactions, _oldState, state) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      const lastNode = state.doc.lastChild;
      if (!isLatexCodeBlockNode(lastNode)) return null;

      const tr = state.tr;
      if (!insertLatexPlaceholderParagraph(tr, state.doc.content.size)) return null;
      return tr;
    },
  });
});

export function closeActiveLatexBlockFence(editor: Crepe) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { $from } = state.selection;
    let codeBlockDepth = -1;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (
        node.type.name === 'code_block' &&
        String(node.attrs.language || '').toLowerCase() === 'latex'
      ) {
        codeBlockDepth = depth;
        break;
      }
    }

    if (codeBlockDepth < 0) return false;

    const codeBlock = $from.node(codeBlockDepth);
    const nextContent = removeClosingMathFence(codeBlock.textContent);
    if (nextContent === null) return false;

    const codeBlockPos = $from.before(codeBlockDepth);
    const nextCodeBlock = codeBlock.type.create(
      codeBlock.attrs,
      nextContent ? state.schema.text(nextContent) : null,
      codeBlock.marks,
    );
    const tr = state.tr.replaceWith(
      codeBlockPos,
      codeBlockPos + codeBlock.nodeSize,
      nextCodeBlock,
    );
    if (!selectAfterLatexBlock(tr, codeBlockPos + nextCodeBlock.nodeSize)) return false;
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  });
}

function createLatexBlockAtCurrentParagraph(
  editor: Crepe,
  value: string,
  selectInside: boolean,
) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const parent = $from.parent;
    if (parent.type.name !== 'paragraph') return false;

    const codeBlock = state.schema.nodes.code_block?.create(
      { language: 'LaTeX' },
      value ? state.schema.text(value) : null,
    );
    if (!codeBlock) return false;

    const blockPos = $from.before($from.depth);
    const tr = state.tr.replaceWith(
      blockPos,
      blockPos + parent.nodeSize,
      codeBlock,
    );
    if (selectInside) {
      tr.setSelection(TextSelection.create(tr.doc, blockPos + 1));
    } else if (!selectAfterLatexBlock(tr, blockPos + codeBlock.nodeSize)) {
      return false;
    }
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return { pos: blockPos, openEditor: selectInside };
  });
}

export function insertLatexBlockAtSelection(editor: Crepe, value = '') {
  return editor.editor.action((ctx) => insertLatexBlockInCtx(ctx, value));
}

export function insertLatexBlockInCtx(ctx: Ctx, value = ''): number | false {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  let { selection } = state;
  const domSelection = window.getSelection();
  const anchorNode = domSelection?.anchorNode;
  if (domSelection?.isCollapsed && anchorNode && view.dom.contains(anchorNode)) {
    try {
      const domPos = view.posAtDOM(anchorNode, domSelection.anchorOffset);
      const textPos = [domPos, domPos + 1, domPos - 1]
        .map((pos) => Math.min(Math.max(1, pos), state.doc.content.size))
        .find((pos) => state.doc.resolve(pos).parent.inlineContent);
      if (textPos !== undefined) {
        selection = TextSelection.create(state.doc, textPos);
      }
    } catch (error: unknown) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  const codeBlockType = codeBlockSchema.type(ctx);

  const codeBlock = codeBlockType.create(
    { language: 'LaTeX' },
    value ? state.schema.text(value) : null,
  );
  const { $from } = selection;
  const parent = $from.parent;
  let tr = state.tr;
  let blockPos = selection.from;

  if (selection.empty && parent.isTextblock && $from.depth > 0) {
    const currentBlockPos = $from.before($from.depth);
    const afterCurrentBlock = currentBlockPos + parent.nodeSize;
    if (parent.type.name === 'paragraph' && parent.content.size === 0) {
      blockPos = currentBlockPos;
      tr = tr.replaceWith(currentBlockPos, afterCurrentBlock, codeBlock);
    } else {
      blockPos = afterCurrentBlock;
      tr = tr.insert(blockPos, codeBlock);
    }
  } else {
    tr = tr.replaceWith(selection.from, selection.to, codeBlock);
  }

  tr.setSelection(TextSelection.create(tr.doc, blockPos + 1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return blockPos;
}

export const rinSingleLineDisplayMathInputRule: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(SchemaReady);
  const displayRule = new InputRule(
    /\$\$([^\n$][^\n]*?)\$\$$/,
    (state, match, start) => {
      const content = match[1]?.trim();
      if (!content) return null;

      const { selection } = state;
      if (!selection.empty) return null;

      const { $from } = selection;
      const parent = $from.parent;
      if (parent.type.name !== 'paragraph') return null;

      const codeBlockType = codeBlockSchema.type(ctx);
      const codeBlock = codeBlockType.create(
        { language: 'LaTeX' },
        state.schema.text(content),
      );
      const blockPos = $from.before($from.depth);
      if (start !== blockPos + 1) return null;
      const tr = state.tr.replaceWith(
        blockPos,
        blockPos + parent.nodeSize,
        codeBlock,
      );
      if (!selectAfterLatexBlock(tr, blockPos + codeBlock.nodeSize)) return null;
      return tr;
    },
  );
  const guardedInlineRule = new InputRule(
    /(?:\$)([^$\n]+)(?:\$)$/,
    (state, match, start, end) => {
      const content = match[1]?.trim();
      if (!content) return null;

      const { selection } = state;
      if (!selection.empty) return null;

      const parentText = selection.$from.parent.textBetween(
        0,
        selection.$from.parent.content.size,
        '\n',
        '\n',
      );
      if (parentText.startsWith('$$')) return null;

      const mathInlineType = state.schema.nodes.math_inline;
      if (!mathInlineType) return null;

      return state.tr.replaceWith(
        start,
        end,
        mathInlineType.create({ value: content }),
      );
    },
  );
  const isCrepeInlineMathRule = (rule: InputRule) => {
    const match = (rule as InputRule & { match?: RegExp }).match;
    return match?.source === '(?:\\$)([^$]+)(?:\\$)$';
  };
  ctx.update(inputRulesCtx, (rules) => [
    displayRule,
    guardedInlineRule,
    ...rules.filter((rule) => !isCrepeInlineMathRule(rule)),
  ]);
  return () => {
    ctx.update(inputRulesCtx, (rules) =>
      rules.filter((item) => item !== displayRule && item !== guardedInlineRule),
    );
  };
};

function replaceCurrentParagraphWithLatexBlock(
  view: EditorView,
  value: string,
  openEditor: boolean,
) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const { $from } = selection;
  const parent = $from.parent;
  if ($from.depth <= 0 || parent.type.name !== 'paragraph') return false;

  const codeBlockType = state.schema.nodes.code_block;
  if (!codeBlockType) return false;

  const codeBlock = codeBlockType.create(
    { language: 'LaTeX' },
    value ? state.schema.text(value) : null,
  );
  const blockPos = $from.before($from.depth);
  const tr = state.tr.replaceWith(
    blockPos,
    blockPos + parent.nodeSize,
    codeBlock,
  );

  if (openEditor) {
    tr.setSelection(TextSelection.create(tr.doc, blockPos + 1));
    tr.setMeta(rinDisplayMathShortcutKey, {
      requestId: nextLatexBlockOpenRequestId + 1,
      pos: blockPos,
    } satisfies RinLatexBlockOpenRequest);
    nextLatexBlockOpenRequestId += 1;
  } else if (!selectAfterLatexBlock(tr, blockPos + codeBlock.nodeSize)) {
    return false;
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function activeParagraphTextAroundSelection(view: EditorView) {
  const { selection } = view.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  const parent = $from.parent;
  if (parent.type.name !== 'paragraph') return null;

  return {
    before: parent.textBetween(0, $from.parentOffset, '\n', '\n'),
    after: parent.textBetween($from.parentOffset, parent.content.size, '\n', '\n'),
  };
}

function isDisplayMathFenceKey(event: KeyboardEvent) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar';
}

export const rinDisplayMathShortcutPlugin = $prose(() => {
  return new Plugin<RinLatexBlockOpenRequest | null>({
    key: rinDisplayMathShortcutKey,
    state: {
      init: () => null,
      apply: (tr, previous) => {
        const request = tr.getMeta(rinDisplayMathShortcutKey) as
          | RinLatexBlockOpenRequest
          | undefined;
        return request || previous;
      },
    },
    props: {
      handleTextInput: (view, _from, _to, text) => {
        if (text !== '$') return false;
        const around = activeParagraphTextAroundSelection(view);
        if (!around || around.before !== '$$$' || around.after !== '') return false;
        return replaceCurrentParagraphWithLatexBlock(view, '', true);
      },
      handleKeyDown: (view, event) => {
        if (!isDisplayMathFenceKey(event)) return false;
        const around = activeParagraphTextAroundSelection(view);
        if (!around || around.before !== '$$' || around.after !== '') return false;
        event.preventDefault();
        return replaceCurrentParagraphWithLatexBlock(view, '', true);
      },
    },
    view: () => {
      let lastRequestId = 0;
      return {
        update: (currentView) => {
          const request = rinDisplayMathShortcutKey.getState(currentView.state);
          if (!request || request.requestId === lastRequestId) return;
          lastRequestId = request.requestId;
          currentView.dom.dispatchEvent(
            new CustomEvent<RinLatexBlockOpenRequest>(rinLatexBlockOpenEvent, {
              bubbles: true,
              detail: request,
            }),
          );
        },
        destroy: () => {
          lastRequestId = 0;
        },
      };
    },
  });
});

function isEmptyLatexFenceBlock(node: ProseMirrorNode | null | undefined) {
  return isLatexCodeBlockNode(node) && node.textContent.trim() === '';
}

function trimBlankFormulaLines(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end).join('\n');
}

export const rinTypedDisplayMathFenceMergePlugin = $prose((ctx) => {
  return new Plugin({
    appendTransaction: (transactions, _oldState, state) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;

      const positions: number[] = [];
      let pos = 0;
      state.doc.forEach((node) => {
        positions.push(pos);
        pos += node.nodeSize;
      });

      for (let index = 0; index < state.doc.childCount; index += 1) {
        const openFence = state.doc.child(index);
        if (!isEmptyLatexFenceBlock(openFence)) continue;

        const formulaLines: string[] = [];
        for (let closeIndex = index + 1; closeIndex < state.doc.childCount; closeIndex += 1) {
          const node = state.doc.child(closeIndex);
          if (isEmptyLatexFenceBlock(node)) {
            const content = trimBlankFormulaLines(formulaLines);
            if (!content.trim()) break;

            const codeBlockType = codeBlockSchema.type(ctx);
            const nextCodeBlock = codeBlockType.create(
              { language: 'LaTeX' },
              state.schema.text(content),
            );
            const from = positions[index];
            const to = positions[closeIndex] + node.nodeSize;
            const tr = state.tr.replaceWith(from, to, nextCodeBlock);
            if (!selectAfterLatexBlock(tr, from + nextCodeBlock.nodeSize)) return null;
            return tr;
          }

          if (node.type.name !== 'paragraph') break;
          formulaLines.push(node.textContent);
        }
      }

      return null;
    },
  });
});

type ParsedMarkdownTableRow = {
  cells: string[];
};

function parseMarkdownTableRow(text: string): ParsedMarkdownTableRow | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
  if (cells.length < 2) return null;
  return { cells };
}

function parseMarkdownTableAlignment(text: string, columnCount: number) {
  const row = parseMarkdownTableRow(text);
  if (!row || row.cells.length !== columnCount) return null;
  const alignments: Array<'left' | 'center' | 'right'> = [];
  for (const cell of row.cells) {
    if (!/^:?-{1,}:?$/.test(cell)) return null;
    const starts = cell.startsWith(':');
    const ends = cell.endsWith(':');
    alignments.push(starts && ends ? 'center' : ends ? 'right' : 'left');
  }
  return alignments;
}

function normalizeMarkdownTableCells(cells: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_value, index) => cells[index] || '');
}

export const rinTypedMarkdownTableInputPlugin = $prose((ctx) => {
  return new Plugin({
    appendTransaction: (transactions, _oldState, state) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;

      const positions: number[] = [];
      let pos = 0;
      state.doc.forEach((node) => {
        positions.push(pos);
        pos += node.nodeSize;
      });

      for (let index = 0; index < state.doc.childCount - 3; index += 1) {
        const headerNode = state.doc.child(index);
        const separatorNode = state.doc.child(index + 1);
        if (headerNode.type.name !== 'paragraph' || separatorNode.type.name !== 'paragraph') {
          continue;
        }

        const header = parseMarkdownTableRow(headerNode.textContent);
        if (!header) continue;

        const columnCount = header.cells.length;
        const alignments = parseMarkdownTableAlignment(separatorNode.textContent, columnCount);
        if (!alignments) continue;

        const bodyRows: ParsedMarkdownTableRow[] = [];
        let closeIndex = index + 2;
        for (; closeIndex < state.doc.childCount; closeIndex += 1) {
          const rowNode = state.doc.child(closeIndex);
          if (rowNode.type.name !== 'paragraph') break;
          if (rowNode.textContent.trim() === '') break;
          const row = parseMarkdownTableRow(rowNode.textContent);
          if (!row) break;
          bodyRows.push(row);
        }

        if (bodyRows.length === 0) continue;
        if (closeIndex >= state.doc.childCount) continue;
        const closingNode = state.doc.child(closeIndex);
        if (!closingNode || closingNode.type.name !== 'paragraph' || closingNode.textContent.trim() !== '') {
          continue;
        }

        const schema = state.schema;
        const paragraphType = schema.nodes.paragraph;
        const createCellContent = (text: string) =>
          paragraphType.create(null, text ? schema.text(text) : null);
        const headerCells = normalizeMarkdownTableCells(header.cells, columnCount).map(
          (text, cellIndex) =>
            tableHeaderSchema
              .type(ctx)
              .create({ alignment: alignments[cellIndex] }, createCellContent(text)),
        );
        const dataRows = bodyRows.map((row) =>
          tableRowSchema.type(ctx).create(
            null,
            normalizeMarkdownTableCells(row.cells, columnCount).map((text, cellIndex) =>
              tableCellSchema
                .type(ctx)
                .create({ alignment: alignments[cellIndex] }, createCellContent(text)),
            ),
          ),
        );
        const tableNode = tableSchema.type(ctx).create(null, [
          tableHeaderRowSchema.type(ctx).create(null, headerCells),
          ...dataRows,
        ]);
        const from = positions[index];
        const to = positions[closeIndex];
        const tr = state.tr.replaceWith(from, to, tableNode);
        const nextSelectionPos = Math.min(from + tableNode.nodeSize + 1, tr.doc.content.size);
        tr.setSelection(TextSelection.create(tr.doc, nextSelectionPos));
        return tr.scrollIntoView();
      }

      return null;
    },
  });
});

export const rinNonFirstH1InputRule: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(SchemaReady);
  const demoteRule = new InputRule(/^#\s$/, (state, _match, start, end) => {
    const { selection } = state;
    if (!selection.empty) return null;

    const { $from } = selection;
    const parent = $from.parent;
    if ($from.depth <= 0 || parent.type.name !== 'paragraph') return null;

    const blockPos = $from.before($from.depth);
    if (blockPos <= 0 || start !== blockPos + 1) return null;

    const tr = state.tr.delete(start, end);
    const nextBlockStart = tr.mapping.map(blockPos);
    const nextBlockEnd = tr.mapping.map(blockPos + parent.nodeSize);
    const heading = headingSchema.type(ctx);
    tr.setBlockType(nextBlockStart, nextBlockEnd, heading, { level: 2 });
    return tr;
  });
  ctx.update(inputRulesCtx, (rules) => [demoteRule, ...rules]);
  return () => {
    ctx.update(inputRulesCtx, (rules) => rules.filter((item) => item !== demoteRule));
  };
};

const htmlBreakLiteralPattern = /\\?<br\s*(?:\\?\/)?\\?>/gi;
const latexPlaceholderPreviewClass = 'rin-latex-placeholder-preview';

type ProseMirrorNodeLike = {
  type: {
    name: string;
  };
  attrs: Record<string, unknown>;
  textContent: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function proseMirrorNodeFromElement(element: HTMLElement): ProseMirrorNodeLike | null {
  const viewDesc = (element as HTMLElement & { pmViewDesc?: unknown }).pmViewDesc;
  if (!isRecord(viewDesc)) return null;

  const node = viewDesc.node;
  if (!isRecord(node)) return null;

  const type = node.type;
  if (!isRecord(type) || typeof type.name !== 'string') return null;

  const attrs = node.attrs;
  if (!isRecord(attrs)) return null;

  return {
    type: {
      name: type.name,
    },
    attrs,
    textContent: typeof node.textContent === 'string' ? node.textContent : '',
  };
}

function codeBlockLanguage(block: HTMLElement) {
  const node = proseMirrorNodeFromElement(block);
  if (node?.type.name === 'code_block') {
    return String(node.attrs.language || '');
  }

  const codeMirrorContent = block.querySelector('.cm-content');
  if (codeMirrorContent instanceof HTMLElement) {
    if (codeMirrorContent.dataset.language === 'stex') return 'LaTeX';
    return codeMirrorContent.dataset.language || '';
  }

  return '';
}

function latexCodeBlockContent(block: HTMLElement) {
  const node = proseMirrorNodeFromElement(block);
  if (node?.type.name === 'code_block') {
    return node.textContent;
  }

  const codeMirrorContent = block.querySelector('.cm-content');
  if (codeMirrorContent instanceof HTMLElement) return codeMirrorContent.textContent || '';

  return block.querySelector('.milkdown-code-block-placeholder code')?.textContent || '';
}

function directLatexPlaceholderPreview(block: HTMLElement) {
  return Array.from(block.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains(latexPlaceholderPreviewClass),
  );
}

export function isLatexCodeBlockElement(block: HTMLElement) {
  const language = codeBlockLanguage(block).toLowerCase();
  return language === 'latex' || language === 'stex';
}

export function syncLatexCodeBlockElement(
  block: HTMLElement,
  katexOptions?: KatexOptions,
) {
  const hasCodeMirrorContent = Boolean(block.querySelector('.cm-content'));
  const content = latexCodeBlockContent(block).trim();
  const isLatexBlock =
    isLatexCodeBlockElement(block) && (hasCodeMirrorContent || content.length > 0);
  block.classList.toggle('rin-latex-block', isLatexBlock);

  const existingPreview = directLatexPlaceholderPreview(block);
  if (!isLatexBlock || hasCodeMirrorContent) {
    existingPreview?.remove();
    return;
  }

  if (existingPreview?.dataset.source === content) return;

  const preview = existingPreview || document.createElement('div');
  preview.className = `preview ${latexPlaceholderPreviewClass}`;
  preview.dataset.source = content;
  preview.innerHTML = katex.renderToString(content, {
    ...katexOptions,
    throwOnError: false,
    displayMode: true,
  });

  if (!existingPreview) block.appendChild(preview);
}

export function removeActiveHtmlBreakLiteral(editor: Crepe) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const parent = $from.parent;
    if (parent.type.name !== 'paragraph') return false;

    const text = parent.textBetween(0, parent.content.size, '\n', '\n');
    htmlBreakLiteralPattern.lastIndex = 0;
    if (!htmlBreakLiteralPattern.test(text)) return false;
    htmlBreakLiteralPattern.lastIndex = 0;
    const cleaned = text.replace(htmlBreakLiteralPattern, '');
    if (cleaned === text) return false;

    const contentStart = $from.before($from.depth) + 1;
    const tr = state.tr.insertText(cleaned, contentStart, contentStart + parent.content.size);
    tr.setSelection(TextSelection.create(tr.doc, contentStart + cleaned.length));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  });
}

function setGapCursorSelection(tr: Transaction, pos: number) {
  try {
    const resolved = tr.doc.resolve(pos);
    if (!gapCursorWithRuntimeChecks.valid?.(resolved)) return false;
    tr.setSelection(new GapCursor(resolved));
    return true;
  } catch (error: unknown) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function selectAfterBlock(tr: Transaction, afterBlockPos: number, preferGapCursor: boolean) {
  const safePos = Math.min(afterBlockPos, tr.doc.content.size);
  const resolved = tr.doc.resolve(safePos);
  if (preferGapCursor && setGapCursorSelection(tr, safePos)) return true;

  const nextNode = resolved.nodeAfter;

  if (!nextNode) {
    if (preferGapCursor) {
      try {
        tr.setSelection(Selection.near(resolved, 1));
        return true;
      } catch (error: unknown) {
        if (error instanceof RangeError) return false;
        throw error;
      }
    }

    const paragraph = tr.doc.type.schema.nodes.paragraph?.create();
    if (!paragraph) return false;
    tr.insert(safePos, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, safePos + 1));
    return true;
  }

  if (nextNode.isTextblock) {
    tr.setSelection(TextSelection.create(tr.doc, safePos + 1));
    return true;
  }

  try {
    tr.setSelection(Selection.near(resolved, 1));
  } catch (error: unknown) {
    if (error instanceof RangeError) return false;
    throw error;
  }
  return true;
}

function selectAfterLatexBlock(tr: Transaction, afterBlockPos: number) {
  const safePos = Math.min(afterBlockPos, tr.doc.content.size);
  const resolved = tr.doc.resolve(safePos);
  const nextNode = resolved.nodeAfter;
  if (nextNode?.isTextblock) {
    tr.setSelection(TextSelection.create(tr.doc, safePos + 1));
    return true;
  }
  if (!nextNode) {
    return insertLatexPlaceholderParagraph(tr, safePos);
  }
  try {
    tr.setSelection(Selection.near(resolved, 1));
    return true;
  } catch (error: unknown) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function handleInlineDisplayMathDollar(editor: Crepe) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const parent = $from.parent;
    if (parent.type.name !== 'paragraph') return false;

    const textBefore = parent.textBetween(0, $from.parentOffset, '\n', '\n');
    const textAfter = parent.textBetween($from.parentOffset, parent.content.size, '\n', '\n');
    if (textAfter.trim()) return false;

    const draft = textBefore.trim();
    const complete = /^\$\$([^$\n]+)\$$/.exec(draft);
    if (complete?.[1]) {
      return createLatexBlockAtCurrentParagraph(editor, complete[1].trim(), false);
    }

    if (/^\$\$[^$\n]+$/.test(draft)) {
      view.dispatch(state.tr.insertText('$').scrollIntoView());
      return true;
    }

    return false;
  });
}

function inlineMathNodeInfo(editor: Crepe, element: HTMLElement) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const basePos = view.posAtDOM(element, 0);
    const positions = Array.from(new Set([basePos, basePos - 1, basePos + 1]));
    const match = positions.find((pos) => {
      if (pos < 0 || pos > view.state.doc.content.size) return false;
      return view.state.doc.nodeAt(pos)?.type.name === 'math_inline';
    });

    if (match === undefined) return null;

    const node = view.state.doc.nodeAt(match);
    if (!node) return null;
    return {
      pos: match,
      value: String(node.attrs.value || ''),
    };
  });
}

function updateInlineMathNode(editor: Crepe, pos: number, value: string) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'math_inline') return false;

    const trimmed = value.trim();
    const tr = trimmed
      ? view.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          value: trimmed,
        })
      : view.state.tr.delete(pos, pos + node.nodeSize);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  });
}

export type LatexBlockEditorState = {
  pos: number;
  value: string;
  top: number;
  left: number;
  width: number;
};

export function latexBlockNodeInfo(editor: Crepe, element: HTMLElement) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const basePos = view.posAtDOM(element, 0);
    const positions = Array.from(
      new Set([basePos, basePos - 2, basePos - 1, basePos + 1, basePos + 2]),
    );
    const match = positions.find((pos) => {
      if (pos < 0 || pos > view.state.doc.content.size) return false;
      const node = view.state.doc.nodeAt(pos);
      return (
        node?.type.name === 'code_block' &&
        String(node.attrs.language || '').toLowerCase() === 'latex'
      );
    });

    if (match === undefined) return null;

    const node = view.state.doc.nodeAt(match);
    if (!node) return null;
    return {
      pos: match,
      value: node.textContent,
    };
  });
}

export function updateLatexBlockNode(
  editor: Crepe,
  pos: number,
  value: string,
  focusAfter = false,
) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    let targetPos = pos;
    let node = (() => {
      try {
        return view.state.doc.nodeAt(targetPos);
      } catch (error: unknown) {
        if (error instanceof RangeError) return null;
        throw error;
      }
    })();
    if (
      !node ||
      node.type.name !== 'code_block' ||
      String(node.attrs.language || '').toLowerCase() !== 'latex'
    ) {
      let fallbackPos: number | null = null;
      let fallbackDistance = Number.POSITIVE_INFINITY;
      view.state.doc.descendants((candidate, candidatePos) => {
        if (
          candidate.type.name !== 'code_block' ||
          String(candidate.attrs.language || '').toLowerCase() !== 'latex'
        ) {
          return true;
        }
        const isGoodMatch = candidate.textContent === value || candidate.textContent === '';
        if (!isGoodMatch) return true;
        const distance = Math.abs(candidatePos - pos);
        if (distance < fallbackDistance) {
          fallbackDistance = distance;
          fallbackPos = candidatePos;
        }
        return true;
      });
      if (fallbackPos !== null) {
        targetPos = fallbackPos;
        node = view.state.doc.nodeAt(targetPos);
      }
    }
    if (
      !node ||
      node.type.name !== 'code_block' ||
      String(node.attrs.language || '').toLowerCase() !== 'latex'
    ) {
      return false;
    }

    if (node.textContent === value && !focusAfter) {
      return true;
    }

    const nextNode = node.type.create(
      node.attrs,
      value ? view.state.schema.text(value) : null,
      node.marks,
    );
    const tr = view.state.tr.replaceWith(targetPos, targetPos + node.nodeSize, nextNode);
    if (focusAfter) {
      const afterBlockPos = targetPos + nextNode.nodeSize;
      if (!selectAfterLatexBlock(tr, afterBlockPos)) return false;
    }
    view.dispatch(tr.scrollIntoView());
    if (focusAfter) view.focus();
    return true;
  });
}

function codeBlockNodeInfo(editor: Crepe, element: HTMLElement) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const basePos = view.posAtDOM(element, 0);
    const positions = Array.from(
      new Set([basePos, basePos - 2, basePos - 1, basePos + 1, basePos + 2]),
    );
    const match = positions.find((pos) => {
      if (pos < 0 || pos > view.state.doc.content.size) return false;
      return view.state.doc.nodeAt(pos)?.type.name === 'code_block';
    });

    if (match === undefined) return null;

    const node = view.state.doc.nodeAt(match);
    if (!node) return null;
    return {
      pos: match,
      attrs: node.attrs,
      content: codeBlockElementContent(element) ?? node.textContent,
    };
  });
}

function codeBlockElementContent(block: HTMLElement) {
  const lines = Array.from(block.querySelectorAll('.cm-content .cm-line'));
  if (lines.length > 0) {
    return lines.map((line) => line.textContent || '').join('\n');
  }

  const content = block.querySelector('.cm-content');
  if (content instanceof HTMLElement) return content.textContent || '';

  const placeholder = block.querySelector('.milkdown-code-block-placeholder code');
  if (placeholder instanceof HTMLElement) return placeholder.textContent || '';

  return null;
}

function removeClosingCodeFence(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  while (lines.length > 1 && lines[lines.length - 1]?.trim() === '') {
    lines.pop();
  }
  if (lines[lines.length - 1]?.trim() !== '```') return null;
  lines.pop();
  return lines.join('\n');
}

function typedCodeFenceInfoString(content: string) {
  const text = content.replace(/\r\n?/g, '\n').trim();
  if (!/^[A-Za-z][A-Za-z0-9_+#.-]{0,31}$/.test(text)) return '';
  return text;
}

export function promoteActiveCodeBlockInfoString(editor: Crepe, block: HTMLElement) {
  const info = codeBlockNodeInfo(editor, block);
  if (!info || String(info.attrs.language || '').trim()) return false;

  const language = typedCodeFenceInfoString(info.content);
  if (!language) return false;

  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const node = view.state.doc.nodeAt(info.pos);
    if (
      !node ||
      node.type.name !== 'code_block' ||
      String(node.attrs.language || '').trim()
    ) {
      return false;
    }

    const nextNode = node.type.create(
      {
        ...node.attrs,
        language,
      },
      null,
      node.marks,
    );
    const tr = view.state.tr.replaceWith(info.pos, info.pos + node.nodeSize, nextNode);
    tr.setSelection(TextSelection.create(tr.doc, info.pos + 1));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  });
}

export function closeActiveCodeBlockFence(editor: Crepe, block: HTMLElement) {
  const info = codeBlockNodeInfo(editor, block);
  if (!info || String(info.attrs.language || '').toLowerCase() === 'latex') {
    return false;
  }

  const nextContent = removeClosingCodeFence(info.content);
  if (nextContent === null) return false;

  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const node = view.state.doc.nodeAt(info.pos);
    if (
      !node ||
      node.type.name !== 'code_block' ||
      String(node.attrs.language || '').toLowerCase() === 'latex'
    ) {
      return false;
    }

    const nextNode = node.type.create(
      node.attrs,
      nextContent ? view.state.schema.text(nextContent) : null,
      node.marks,
    );
    const tr = view.state.tr.replaceWith(info.pos, info.pos + node.nodeSize, nextNode);
    if (!selectAfterBlock(tr, info.pos + nextNode.nodeSize, false)) return false;
    view.dispatch(tr.scrollIntoView());
    forceProseMirrorFocus(view);
    window.requestAnimationFrame(() => forceProseMirrorFocus(view));
    window.setTimeout(() => forceProseMirrorFocus(view), 50);
    return true;
  });
}

export function hasActiveCodeBlockClosingFence(editor: Crepe, block: HTMLElement) {
  const info = codeBlockNodeInfo(editor, block);
  return Boolean(
    info &&
      String(info.attrs.language || '').toLowerCase() !== 'latex' &&
      removeClosingCodeFence(info.content) !== null,
  );
}

export function focusParagraphElementInCtx(ctx: Ctx, paragraph: HTMLElement) {
  const view = ctx.get(editorViewCtx);
  let paragraphPos = 0;
  try {
    paragraphPos = view.posAtDOM(paragraph, 0);
  } catch (error: unknown) {
    if (error instanceof RangeError) return false;
    throw error;
  }

  const maxPos = view.state.doc.content.size;
  const textPos = [paragraphPos, paragraphPos + 1, paragraphPos - 1]
    .map((pos) => Math.min(Math.max(1, pos), maxPos))
    .find((pos) => {
      const resolved = view.state.doc.resolve(pos);
      return resolved.parent.inlineContent;
    });
  const tr = view.state.tr;
  if (textPos !== undefined) {
    tr.setSelection(TextSelection.create(tr.doc, textPos));
  } else {
    const nearPos = Math.min(Math.max(1, paragraphPos), maxPos);
    try {
      tr.setSelection(Selection.near(tr.doc.resolve(nearPos), 1));
    } catch (error: unknown) {
      if (error instanceof RangeError) return false;
      throw error;
    }
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function forceProseMirrorFocus(view: EditorView) {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement !== view.dom &&
    view.dom.contains(activeElement)
  ) {
    activeElement.blur();
  }
  view.dom.focus({ preventScroll: true });
  view.focus();
}

export function deleteLatexBlockBeforeParagraphInCtx(ctx: Ctx, paragraph: HTMLElement) {
  const view = ctx.get(editorViewCtx);
  let paragraphPos = 0;
  try {
    paragraphPos = view.posAtDOM(paragraph, 0);
  } catch (error: unknown) {
    if (error instanceof RangeError) return false;
    throw error;
  }

  const maxPos = view.state.doc.content.size;
  const safeParagraphPos = Math.min(Math.max(0, paragraphPos), maxPos);
  let paragraphFrom = safeParagraphPos;
  if (view.state.doc.nodeAt(paragraphFrom)?.type.name !== 'paragraph') {
    const resolvedPos = Math.min(Math.max(1, paragraphPos), maxPos);
    const resolved = view.state.doc.resolve(resolvedPos);
    if (resolved.parent.type.name !== 'paragraph' || resolved.depth <= 0) {
      return false;
    }
    paragraphFrom = resolved.before(resolved.depth);
  }

  const resolved = view.state.doc.resolve(paragraphFrom);
  const previous = resolved.nodeBefore;
  if (
    !previous ||
    previous.type.name !== 'code_block' ||
    String(previous.attrs.language || '').toLowerCase() !== 'latex'
  ) {
    return false;
  }

  const blockFrom = Math.max(0, paragraphFrom - previous.nodeSize);
  const tr = view.state.tr.delete(blockFrom, paragraphFrom);
  const nextParagraphPos = tr.mapping.map(paragraphFrom, -1);
  const selectionPos = Math.min(nextParagraphPos + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.create(tr.doc, selectionPos));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function selectWritablePositionAfterDelete(tr: Transaction, pos: number) {
  const safePos = Math.min(Math.max(0, pos), tr.doc.content.size);
  const resolved = tr.doc.resolve(safePos);
  if (setGapCursorSelection(tr, safePos)) return true;

  const nextNode = resolved.nodeAfter;
  if (nextNode?.isTextblock) {
    tr.setSelection(TextSelection.create(tr.doc, safePos + 1));
    return true;
  }

  try {
    tr.setSelection(Selection.near(resolved, -1));
    return true;
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      const paragraph = tr.doc.type.schema.nodes.paragraph?.create();
      if (!paragraph) return false;
      tr.insert(safePos, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, safePos + 1));
      return true;
    }
    throw error;
  }
}

function latexBlockBeforeCurrentSelection(state: {
  selection: Selection;
  doc: ProseMirrorNode;
}) {
  const { selection } = state;
  if (!selection.empty) return null;

  const directPrevious = selection.$from.nodeBefore;
  if (isLatexCodeBlockNode(directPrevious)) {
    return {
      from: selection.from - directPrevious.nodeSize,
      to: selection.from,
      paragraphFrom: null,
    };
  }

  const { $from } = selection;
  const parent = $from.parent;
  if (parent.type.name !== 'paragraph' || parent.content.size !== 0 || $from.depth <= 0) {
    return null;
  }

  const paragraphFrom = $from.before($from.depth);
  const previous = state.doc.resolve(paragraphFrom).nodeBefore;
  if (!isLatexCodeBlockNode(previous)) return null;

  return {
    from: paragraphFrom - previous.nodeSize,
    to: paragraphFrom,
    paragraphFrom,
  };
}

export function deleteLatexBlockBeforeSelectionInCtx(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const info = latexBlockBeforeCurrentSelection(state);
  if (!info) return false;

  const tr = state.tr.delete(info.from, info.to);
  const selectionPos = info.paragraphFrom ?? info.from;
  if (!selectWritablePositionAfterDelete(tr, selectionPos)) return false;
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export function focusAfterLatexBlock(editor: Crepe, pos: number) {
  return editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const node = view.state.doc.nodeAt(pos);
    if (
      !node ||
      node.type.name !== 'code_block' ||
      String(node.attrs.language || '').toLowerCase() !== 'latex'
    ) {
      return false;
    }

    const afterBlockPos = pos + node.nodeSize;
    const tr = view.state.tr;
    if (!selectAfterLatexBlock(tr, afterBlockPos)) return false;
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function openInlineMathPopover(
  editor: Crepe,
  element: HTMLElement,
  onClose: () => void,
  labels: {
    ariaLabel: string;
    save: string;
    cancel: string;
  } = {
    ariaLabel: 'Edit inline formula',
    save: 'Done',
    cancel: 'Cancel',
  },
) {
  const info = inlineMathNodeInfo(editor, element);
  if (!info) return null;

  const form = document.createElement('form');
  form.className = 'milkdown-inline-math-popover';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = info.value;
  input.setAttribute('aria-label', labels.ariaLabel);

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.textContent = labels.save;

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = labels.cancel;

  form.append(input, saveButton, cancelButton);
  document.body.appendChild(form);

  const rect = element.getBoundingClientRect();
  const width = Math.min(420, Math.max(260, window.innerWidth - 24));
  form.style.width = `${width}px`;
  form.style.left = `${clamp(
    rect.left + window.scrollX,
    12,
    window.scrollX + window.innerWidth - width - 12,
  )}px`;
  form.style.top = `${rect.bottom + window.scrollY + 8}px`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('mousedown', handleOutsidePointer, true);
    document.removeEventListener('keydown', handleEscape, true);
    form.remove();
    onClose();
  };

  const save = () => {
    updateInlineMathNode(editor, info.pos, input.value);
    close();
  };

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    save();
  }

  function handleCancel() {
    close();
  }

  function handleOutsidePointer(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (form.contains(target) || element.contains(target)) return;
    close();
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  }

  form.addEventListener('submit', handleSubmit);
  cancelButton.addEventListener('click', handleCancel);
  document.addEventListener('mousedown', handleOutsidePointer, true);
  document.addEventListener('keydown', handleEscape, true);
  window.setTimeout(() => {
    input.focus();
    input.select();
  }, 0);

  return () => {
    form.removeEventListener('submit', handleSubmit);
    cancelButton.removeEventListener('click', handleCancel);
    close();
  };
}
