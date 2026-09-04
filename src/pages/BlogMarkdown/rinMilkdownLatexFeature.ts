import { CrepeFeature, useCrepeFeatures } from '@milkdown/crepe';
import { codeBlockConfig } from '@milkdown/kit/component/code-block';
import type { Editor } from '@milkdown/kit/core';
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import { findNodeInSelection, nodeRule } from '@milkdown/kit/prose';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { Node as MarkdownNode } from '@milkdown/kit/transformer';
import { $command, $inputRule, $nodeSchema, $remark } from '@milkdown/kit/utils';
import katex, { type KatexOptions } from 'katex';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';

const mathInlineId = 'math_inline';

export type RinLatexFeatureConfig = {
  katexOptions?: KatexOptions;
};

const mathInlineSchema = $nodeSchema(mathInlineId, () => ({
  group: 'inline',
  inline: true,
  draggable: true,
  atom: true,
  attrs: {
    value: {
      default: '',
    },
  },
  parseDOM: [
    {
      tag: `span[data-type="${mathInlineId}"]`,
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).dataset.value ?? '',
      }),
    },
  ],
  toDOM: (node) => {
    const code = String(node.attrs.value || '');
    const dom = document.createElement('span');
    dom.dataset.type = mathInlineId;
    dom.dataset.value = code;
    katex.render(code, dom, {
      throwOnError: false,
    });

    return dom;
  },
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === mathInlineId,
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.attrs.value);
    },
  },
}));

const blockLatexSchema = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const baseSchema = prev(ctx);
  return {
    ...baseSchema,
    toMarkdown: {
      match: baseSchema.toMarkdown.match,
      runner: (state, node) => {
        const language = node.attrs.language ?? '';
        if (String(language).toLowerCase() === 'latex') {
          state.addNode('math', undefined, node.content.firstChild?.text || '');
          return;
        }
        baseSchema.toMarkdown.runner(state, node);
      },
    },
  };
});

const mathInlineInputRule = $inputRule((ctx) =>
  nodeRule(/(?:\$)([^$]+)(?:\$)$/, mathInlineSchema.type(ctx), {
    getAttr: (match) => ({
      value: match[1] ?? '',
    }),
  }),
);

const toggleLatexCommand = $command('ToggleLatex', (ctx) => () => (state, dispatch) => {
  const {
    hasNode: hasLatex,
    pos: latexPos,
    target: latexNode,
  } = findNodeInSelection(state, mathInlineSchema.type(ctx));

  const { selection, doc, tr } = state;
  if (!hasLatex) {
    const text = doc.textBetween(selection.from, selection.to);
    const nextTr = tr.replaceSelectionWith(
      mathInlineSchema.type(ctx).create({
        value: text,
      }),
    );
    if (dispatch) {
      dispatch(nextTr.setSelection(NodeSelection.create(nextTr.doc, selection.from)));
    }
    return true;
  }

  const { from, to } = selection;
  if (!latexNode || latexPos < 0) return false;

  let nextTr = tr.delete(latexPos, latexPos + 1);
  const content = String((latexNode as ProseNode).attrs.value || '');
  nextTr = nextTr.insertText(content, latexPos);
  if (dispatch) {
    dispatch(
      nextTr.setSelection(TextSelection.create(nextTr.doc, from, to + content.length - 1)),
    );
  }
  return true;
});

const remarkMathPlugin = $remark<'remarkMath', undefined>('remarkMath', () => remarkMath);

function visitMathBlock(ast: MarkdownNode) {
  return visit(
    ast,
    'math',
    (
      node: MarkdownNode & { value: string },
      index: number | undefined,
      parent: MarkdownNode & { children: MarkdownNode[] },
    ) => {
      if (index === undefined) return;
      const nextNode = {
        type: 'code',
        lang: 'LaTeX',
        value: node.value,
      };
      parent.children.splice(index, 1, nextNode as MarkdownNode);
    },
  );
}

const remarkMathBlockPlugin = $remark('remarkMathBlock', () => () => visitMathBlock);

function renderLatex(content: string, options?: KatexOptions) {
  return katex.renderToString(content, {
    ...options,
    throwOnError: false,
    displayMode: true,
  });
}

function registerCrepeLatexFeatureFlag(editor: Editor) {
  editor.config((ctx) => {
    useCrepeFeatures(ctx).update((features) => {
      if (features.includes(CrepeFeature.Latex)) return features;
      return [...features, CrepeFeature.Latex];
    });
  });
}

export function rinLatexFeature(editor: Editor, config?: RinLatexFeatureConfig) {
  registerCrepeLatexFeatureFlag(editor);
  editor
    .config((ctx) => {
      const flags = useCrepeFeatures(ctx).get();
      if (!flags.includes(CrepeFeature.CodeMirror)) {
        throw new Error('CodeMirror must be enabled before Rin LaTeX feature.');
      }

      ctx.update(codeBlockConfig.key, (prev) => ({
        ...prev,
        renderPreview: (language, content, applyPreview) => {
          if (language.toLowerCase() === 'latex' && content.length > 0) {
            return renderLatex(content, config?.katexOptions);
          }
          return prev.renderPreview(language, content, applyPreview);
        },
      }));
    })
    .use(remarkMathPlugin)
    .use(remarkMathBlockPlugin)
    .use(mathInlineSchema)
    .use(mathInlineInputRule)
    .use(blockLatexSchema)
    .use(toggleLatexCommand);
}
