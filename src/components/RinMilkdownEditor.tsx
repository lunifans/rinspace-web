import { AnimateButton } from 'components/ui';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { editorViewCtx, schemaCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { Fragment, Slice } from '@milkdown/kit/prose/model';
import { replaceAll } from '@milkdown/kit/utils';
import {
  forwardRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { useOptionalBootstrap } from '@/app/bootstrap/context';
import CodeMirrorEditor, {
  type CodeMirrorEditorHandle,
} from '@/components/CodeMirrorEditor';
import LoadingState from '@/components/LoadingState';
import { uploadAnswerFile } from '@/services/domains/publication';
import { messageFromError } from '@/services/errors';
import { markdownWithoutDefaultTemplate } from '@/utils/markdownTitle';
import {
  defaultQuiverDialogLayout,
  fitQuiverDialogLayout,
  quiverResizeEdges,
  resizeQuiverDialogLayout,
  type QuiverDialogLayout,
  type QuiverResizeEdge,
} from '@/utils/quiverDialogLayout';
import {
  closeActiveLatexBlockFence,
  closeActiveCodeBlockFence,
  deleteLatexBlockBeforeParagraphInCtx,
  deleteLatexBlockBeforeSelectionInCtx,
  focusAfterLatexBlock,
  focusParagraphElementInCtx,
  hasActiveCodeBlockClosingFence,
  hasCompleteDisplayMathFence,
  insertLatexBlockInCtx,
  latexBlockNodeInfo,
  normalizeMilkdownMathMarkdown,
  normalizeLatexBlockEditorValue,
  openInlineMathPopover,
  pasteMarkdownMathInCtx,
  promoteActiveCodeBlockInfoString,
  rinDisplayMathShortcutPlugin,
  rinLatexCodeBlockGapCursorPlugin,
  rinLatexBlockOpenEvent,
  rinLatexTrailingConfigPlugin,
  rinLatexTrailingPlaceholderPlugin,
  rinTypedMarkdownTableInputPlugin,
  rinTypedDisplayMathFenceMergePlugin,
  restoreSelectionBookmarkInCtx,
  rinNonFirstH1InputRule,
  rinSingleLineDisplayMathInputRule,
  rinTopBarMathIcon,
  shouldPasteClipboardAsMarkdown,
  syncLatexCodeBlockElement,
  updateLatexBlockNode,
  type LatexBlockEditorState,
} from '@/pages/BlogMarkdown/rinMilkdownMathPlugin';
import {
  buildRinTopBar,
  diagramIdFromImageUrl,
  ensureQuiverImageComments,
  loadTikzcdDiagramSource,
  normalizeQuiverTikzcd,
  parseTikzcdSource,
  readQuiverExportMessage,
  renderTikzcdDiagram,
  tikzcdDiagramSourceText,
} from '@/pages/BlogMarkdown/rinMilkdownQuiverPlugin';

export type RinMilkdownEditorHandle = {
  getValue: () => string;
};

type RinMilkdownEditorProps = {
  id?: string;
  value: string;
  minHeight?: string;
  placeholder?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onReady?: (ready: boolean) => void;
  onError?: (message: string) => void;
};

const defaultQuiverFrameSrc = '/quiver/?rinWriter=1';
const editorToolbarLabels = [
  '粗体',
  '斜体',
  '删除线',
  '行内代码',
  '无序列表',
  '有序列表',
  '撤销',
  '插入链接',
  '插入图片',
  '插入表格',
  '插入代码块',
  '插入引用',
  '插入分隔线',
  '插入公式',
  '插入交换图',
];

function applyEditorAccessibility(host: HTMLDivElement, ariaLabel: string) {
  host.querySelector<HTMLElement>('.ProseMirror')?.setAttribute('aria-label', ariaLabel);
  const toolbar = host.querySelector<HTMLElement>('.top-bar-inner');
  toolbar?.setAttribute('role', 'toolbar');
  toolbar?.setAttribute('aria-label', 'Markdown 编辑工具');
  host.querySelectorAll<HTMLButtonElement>('.top-bar-item').forEach((button, index) => {
    const label = editorToolbarLabels[index] || `编辑工具 ${index + 1}`;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  });
}

const bodyHeadingOptions = [
  { label: 'Paragraph', level: null },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
  { label: 'Heading 4', level: 4 },
  { label: 'Heading 5', level: 5 },
  { label: 'Heading 6', level: 6 },
];

type QuiverDialogInteraction = {
  mode: 'drag' | 'resize';
  edge?: QuiverResizeEdge;
  pointerId: number;
  startX: number;
  startY: number;
  startLayout: QuiverDialogLayout;
};

function quiverEditorNodes(ctx: Ctx, imageUrl: string) {
  const schema = ctx.get(schemaCtx);
  const imageBlockType = schema.nodes['image-block'];
  if (!imageBlockType) {
    throw new Error('编辑器缺少 Quiver 图片所需节点');
  }
  return [
    imageBlockType.create({
      src: imageUrl,
      caption: '',
      ratio: 1,
    }),
  ];
}

function insertQuiverDiagramBlock(imageUrl: string) {
  return (ctx: Ctx) => {
    const view = ctx.get(editorViewCtx);
    const nodes = quiverEditorNodes(ctx, imageUrl);
    view.dispatch(
      view.state.tr
        .replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0))
        .scrollIntoView(),
    );
  };
}

function replaceQuiverDiagramBlock(oldImageUrl: string, nextImageUrl: string) {
  return (ctx: Ctx) => {
    const view = ctx.get(editorViewCtx);
    const nodes = quiverEditorNodes(ctx, nextImageUrl);
    const oldID = diagramIdFromImageUrl(oldImageUrl);
    let targetPos = -1;
    let targetSize = 0;
    let targetAttrs: Record<string, unknown> | null = null;

    view.state.doc.descendants((node, pos) => {
      if (targetPos >= 0) return false;
      if (node.type.name !== 'image-block') return true;
      const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
      if (diagramIdFromImageUrl(src) !== oldID) return true;
      targetPos = pos;
      targetSize = node.nodeSize;
      targetAttrs = { ...node.attrs };
      return false;
    });

    if (targetPos < 0) {
      view.dispatch(
        view.state.tr
          .replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0))
          .scrollIntoView(),
      );
      return;
    }

    const schema = ctx.get(schemaCtx);
    const imageBlockType = schema.nodes['image-block'];
    if (!imageBlockType) {
      throw new Error('编辑器缺少 Quiver 图片所需节点');
    }
    const replacement = imageBlockType.create({
      ...(targetAttrs || {}),
      src: nextImageUrl,
    });
    view.dispatch(
      view.state.tr
        .replaceWith(targetPos, targetPos + targetSize, replacement)
        .scrollIntoView(),
    );
  };
}

function cleanEditorMarkdown(markdown: string) {
  return normalizeMilkdownMathMarkdown(markdownWithoutDefaultTemplate(markdown));
}

const RinMilkdownEditor = forwardRef<RinMilkdownEditorHandle, RinMilkdownEditorProps>(
  function RinMilkdownEditor(
    {
      id,
      value,
      minHeight = '220px',
      placeholder = '写下内容...',
      ariaLabel,
      readOnly = false,
      className = '',
      onChange,
      onReady,
      onError,
    },
    ref,
  ) {
    const bootstrap = useOptionalBootstrap();
    const demoMode = bootstrap?.config.mode === 'demo';
    const bootstrapRef = useRef(bootstrap);
    const demoModeRef = useRef(demoMode);
    bootstrapRef.current = bootstrap;
    demoModeRef.current = demoMode;
    const hostRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<Crepe | null>(null);
    const activeLatexBlockRef = useRef<HTMLElement | null>(null);
    const latexEditorHandleRef = useRef<CodeMirrorEditorHandle | null>(null);
    const latexEditorStateRef = useRef<LatexBlockEditorState | null>(null);
    const openLatexBlockEditorAtPosRef = useRef<((pos: number) => boolean) | null>(null);
    const pendingLatexContinuationPosRef = useRef<number | null>(null);
    const pendingCodeBlockFocusRef = useRef<{
      beforeCount: number;
      timeout: number;
    } | null>(null);
    const quiverFrameRef = useRef<HTMLIFrameElement | null>(null);
    const quiverSelectionRestoreRef = useRef<(() => boolean) | null>(null);
    const quiverReplacingImageSrcRef = useRef('');
    const quiverImportSourceRef = useRef('');
    const quiverImportRequestSequenceRef = useRef(0);
    const quiverRequestSequenceRef = useRef(0);
    const quiverDialogInteractionRef = useRef<QuiverDialogInteraction | null>(null);
    const quiverActiveRequestRef = useRef<{
      id: string;
      timeout: number;
    } | null>(null);
    const markdownRef = useRef(value);
    const mathReparseTimerRef = useRef<number | null>(null);
    const lastMathReparseRef = useRef('');
    const skipNextMathReparseRef = useRef(false);
    const syncingRef = useRef(false);
    const readOnlyRef = useRef(readOnly);
    const [editorReady, setEditorReady] = useState(false);
    const [latexEditor, setLatexEditor] = useState<LatexBlockEditorState | null>(null);
    const [quiverOpen, setQuiverOpen] = useState(false);
    const [quiverPending, setQuiverPending] = useState(false);
    const [quiverFrameReady, setQuiverFrameReady] = useState(false);
    const [quiverError, setQuiverError] = useState('');
    const [quiverFrameSrc, setQuiverFrameSrc] = useState(defaultQuiverFrameSrc);
    const [quiverDialogLayout, setQuiverDialogLayout] = useState<QuiverDialogLayout>(() =>
      defaultQuiverDialogLayout(),
    );
    const [quiverDialogInteracting, setQuiverDialogInteracting] = useState(false);

    useImperativeHandle(ref, () => ({
      getValue: () => markdownRef.current,
    }));

    useEffect(() => {
      readOnlyRef.current = readOnly;
    }, [readOnly]);

    const emitChange = (next: string) => {
      markdownRef.current = next;
      onChange(next);
    };

    const closeLatexBlockEditor = (commit = true, focusAfter = false) => {
      const currentLatexEditor = latexEditorStateRef.current;
      const currentLatexBlock = activeLatexBlockRef.current;
      if (!currentLatexEditor && !currentLatexBlock) return;
      activeLatexBlockRef.current?.classList.remove('rin-latex-editing');
      let committed = false;
      if (commit && currentLatexEditor && editorRef.current) {
        skipNextMathReparseRef.current = true;
        const nextLatexValue = normalizeLatexBlockEditorValue(currentLatexEditor.value);
        committed = updateLatexBlockNode(
          editorRef.current,
          currentLatexEditor.pos,
          nextLatexValue,
          focusAfter,
        );
        emitChange(cleanEditorMarkdown(editorRef.current.getMarkdown()));
      }
      activeLatexBlockRef.current = null;
      latexEditorHandleRef.current = null;
      latexEditorStateRef.current = null;
      pendingLatexContinuationPosRef.current =
        focusAfter && commit && currentLatexEditor && !committed ? currentLatexEditor.pos : null;
      setLatexEditor(null);
    };

    const changeLatexBlockValue = (nextValue: string) => {
      setLatexEditor((current) => {
        if (!current) return current;
        const next = { ...current, value: nextValue };
        latexEditorStateRef.current = next;
        return next;
      });
    };

    const submitLatexBlockAndContinue = () => {
      closeLatexBlockEditor(true, true);
    };

    const clearQuiverRequest = () => {
      if (quiverActiveRequestRef.current) {
        window.clearTimeout(quiverActiveRequestRef.current.timeout);
      }
      quiverActiveRequestRef.current = null;
    };

    const saveQuiverSelection = () => {
      if (!editorRef.current) {
        quiverSelectionRestoreRef.current = null;
        return;
      }
      quiverSelectionRestoreRef.current = editorRef.current.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const bookmark = view.state.selection.getBookmark();
        return () => {
          if (!editorRef.current) return false;
          return editorRef.current.editor.action((restoreCtx) => {
            return restoreSelectionBookmarkInCtx(restoreCtx, bookmark);
          });
        };
      });
    };

    const importSourceIntoQuiver = () => {
      const source = quiverImportSourceRef.current;
      if (!source || !quiverFrameReady) return;
      const target = quiverFrameRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(
        {
          scope: 'rin-quiver',
          type: 'import-tikzcd',
          requestId: `quiver-import-${Date.now()}-${++quiverImportRequestSequenceRef.current}`,
          payload: {
            data: source,
          },
        },
        window.location.origin,
      );
    };

    const openQuiverDialog = ({
      source = '',
      replacingImageSrc = '',
    }: { source?: string; replacingImageSrc?: string } = {}) => {
      if (readOnlyRef.current) return;
      if (demoModeRef.current) {
        onError?.(messageFromError(null, 'creation.quiverUnavailable'));
        return;
      }
      closeLatexBlockEditor();
      if (replacingImageSrc) {
        quiverSelectionRestoreRef.current = null;
      }
      quiverReplacingImageSrcRef.current = replacingImageSrc;
      quiverImportSourceRef.current = source;
      setQuiverFrameSrc(defaultQuiverFrameSrc);
      setQuiverError('');
      setQuiverPending(false);
      setQuiverFrameReady(false);
      setQuiverDialogLayout(defaultQuiverDialogLayout());
      setQuiverOpen(true);
    };

    const closeQuiverDialog = () => {
      clearQuiverRequest();
      quiverDialogInteractionRef.current = null;
      quiverReplacingImageSrcRef.current = '';
      quiverImportSourceRef.current = '';
      setQuiverOpen(false);
      setQuiverPending(false);
      setQuiverFrameReady(false);
      setQuiverError('');
      setQuiverDialogInteracting(false);
    };

    const beginQuiverDialogDrag = (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (event.target instanceof HTMLElement && event.target.closest('button')) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      quiverDialogInteractionRef.current = {
        mode: 'drag',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLayout: quiverDialogLayout,
      };
      setQuiverDialogInteracting(true);
    };

    const beginQuiverDialogResize = (
      event: ReactPointerEvent<HTMLElement>,
      edge: QuiverResizeEdge,
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      quiverDialogInteractionRef.current = {
        mode: 'resize',
        edge,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLayout: quiverDialogLayout,
      };
      setQuiverDialogInteracting(true);
    };

    useEffect(() => {
      if (!quiverOpen) return undefined;

      const handlePointerMove = (event: PointerEvent) => {
        const interaction = quiverDialogInteractionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        event.preventDefault();
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;
        if (interaction.mode === 'drag') {
          setQuiverDialogLayout(
            fitQuiverDialogLayout({
              ...interaction.startLayout,
              left: interaction.startLayout.left + deltaX,
              top: interaction.startLayout.top + deltaY,
            }),
          );
          return;
        }
        if (interaction.edge) {
          setQuiverDialogLayout(
            resizeQuiverDialogLayout(interaction.startLayout, interaction.edge, deltaX, deltaY),
          );
        }
      };

      const endPointerInteraction = (event: PointerEvent) => {
        const interaction = quiverDialogInteractionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        quiverDialogInteractionRef.current = null;
        setQuiverDialogInteracting(false);
      };

      const handleViewportResize = () => {
        setQuiverDialogLayout((current) => fitQuiverDialogLayout(current));
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', endPointerInteraction);
      window.addEventListener('pointercancel', endPointerInteraction);
      window.addEventListener('resize', handleViewportResize);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', endPointerInteraction);
        window.removeEventListener('pointercancel', endPointerInteraction);
        window.removeEventListener('resize', handleViewportResize);
      };
    }, [quiverOpen]);

    const requestQuiverTikzcd = () => {
      if (quiverPending) return;
      const target = quiverFrameRef.current?.contentWindow;
      if (!target) {
        setQuiverError('Quiver 尚未加载完成');
        return;
      }
      if (!quiverFrameReady) {
        setQuiverError('Quiver 正在加载，请稍后再插入');
        return;
      }
      if (quiverReplacingImageSrcRef.current) {
        quiverSelectionRestoreRef.current = null;
      } else {
        saveQuiverSelection();
      }
      const requestId = `quiver-${Date.now()}-${++quiverRequestSequenceRef.current}`;
      clearQuiverRequest();
      setQuiverPending(true);
      setQuiverError('');
      quiverActiveRequestRef.current = {
        id: requestId,
        timeout: window.setTimeout(() => {
          quiverActiveRequestRef.current = null;
          setQuiverPending(false);
          setQuiverError('Quiver 导出超时，请确认弹层已加载完成');
        }, 8000),
      };
      target.postMessage(
        {
          scope: 'rin-quiver',
          type: 'export-tikzcd',
          requestId,
        },
        window.location.origin,
      );
    };

    useEffect(() => {
      if (!latexEditor) return undefined;

      const closeFromOutside = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (
          activeLatexBlockRef.current?.contains(target) ||
          (target instanceof Element && target.closest('.rin-latex-editor-panel'))
        ) {
          return;
        }
        closeLatexBlockEditor();
      };
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeLatexBlockEditor(false);
      };

      document.addEventListener('mousedown', closeFromOutside, true);
      document.addEventListener('keydown', closeOnEscape, true);
      return () => {
        document.removeEventListener('mousedown', closeFromOutside, true);
        document.removeEventListener('keydown', closeOnEscape, true);
      };
    }, [latexEditor]);

    useEffect(() => {
      if (!quiverOpen) return undefined;

      const handleQuiverMessage = (event: MessageEvent<unknown>) => {
        if (event.origin !== window.location.origin) return;
        if (event.source !== quiverFrameRef.current?.contentWindow) return;
        const message = readQuiverExportMessage(event.data);
        if (!message) return;
        if (!quiverActiveRequestRef.current || message.requestId !== quiverActiveRequestRef.current.id) {
          return;
        }

        clearQuiverRequest();
        setQuiverPending(false);
        if (!message.ok) {
          setQuiverError(message.error || 'Quiver 导出失败');
          return;
        }

        void (async () => {
          try {
            const tikzcd = normalizeQuiverTikzcd(message.payload?.data || '');
            const parsed = parseTikzcdSource(tikzcd);
            if (!parsed) throw new Error('请先在 Quiver 中画一个图表，再点击插入');
            const diagram = await renderTikzcdDiagram(parsed);
            const replacingImageSrc = quiverReplacingImageSrcRef.current;
            closeQuiverDialog();
            syncingRef.current = true;
            skipNextMathReparseRef.current = true;
            try {
              if (replacingImageSrc) {
                editorRef.current?.editor.action(
                  replaceQuiverDiagramBlock(replacingImageSrc, diagram.url),
                );
              } else {
                quiverSelectionRestoreRef.current?.();
                editorRef.current?.editor.action(insertQuiverDiagramBlock(diagram.url));
              }
            } catch (editorInsertError) {
              syncingRef.current = false;
              throw editorInsertError;
            }
            window.setTimeout(() => {
              syncingRef.current = false;
              if (!editorRef.current) return;
              emitChange(
                ensureQuiverImageComments(
                  markdownWithoutDefaultTemplate(editorRef.current.getMarkdown()),
                  window.location.origin,
                ),
              );
            }, 0);
          } catch (quiverInsertError) {
            setQuiverPending(false);
            setQuiverError(messageFromError(quiverInsertError, 'creation.quiverRenderFailed'));
          }
        })();
      };

      window.addEventListener('message', handleQuiverMessage);
      return () => {
        window.removeEventListener('message', handleQuiverMessage);
      };
    }, [quiverOpen, quiverFrameReady]);

    useEffect(() => {
      if (!quiverOpen || !quiverFrameReady) return;
      importSourceIntoQuiver();
    }, [quiverOpen, quiverFrameReady]);

    useEffect(() => {
      if (latexEditor) return undefined;
      const pendingPos = pendingLatexContinuationPosRef.current;
      if (pendingPos === null) return undefined;
      pendingLatexContinuationPosRef.current = null;

      let cancelled = false;
      const frameId = window.requestAnimationFrame(() => {
        if (cancelled || !editorRef.current) return;
        focusAfterLatexBlock(editorRef.current, pendingPos);
      });
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frameId);
      };
    }, [latexEditor]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || !editorReady) return;
      const nextValue = cleanEditorMarkdown(value || '');
      if (nextValue === markdownRef.current) return;
      syncingRef.current = true;
      markdownRef.current = nextValue;
      editor.editor.action(replaceAll(nextValue, true));
      window.setTimeout(() => {
        syncingRef.current = false;
      }, 0);
    }, [value, editorReady]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return undefined;
      onReady?.(false);
      setEditorReady(false);
      host.innerHTML = '';
      const initialValue = cleanEditorMarkdown(value || '');
      markdownRef.current = initialValue;
      const editor = new Crepe({
        root: host,
        defaultValue: initialValue,
        features: {
          [Crepe.Feature.CodeMirror]: true,
          [Crepe.Feature.Latex]: true,
          [Crepe.Feature.Toolbar]: true,
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.TopBar]: true,
          [Crepe.Feature.Table]: true,
          [Crepe.Feature.ImageBlock]: true,
          [Crepe.Feature.LinkTooltip]: true,
        },
        featureConfigs: {
            [Crepe.Feature.TopBar]: {
              headingOptions: bodyHeadingOptions,
              mathIcon: rinTopBarMathIcon,
              buildTopBar: (builder) =>
                buildRinTopBar(builder, {
                  mathIcon: rinTopBarMathIcon,
                  openMath: (ctx) => {
                    closeLatexBlockEditor();
                    clearMathReparseTimer();
                    skipNextMathReparseRef.current = true;
                    const pos = insertLatexBlockInCtx(ctx);
                    if (pos === false) {
                      skipNextMathReparseRef.current = false;
                      return;
                    }
                    window.requestAnimationFrame(() => {
                      if (openLatexBlockEditorAtPosRef.current?.(pos)) return;
                      window.setTimeout(() => {
                        openLatexBlockEditorAtPosRef.current?.(pos);
                      }, 50);
                    });
                  },
                  openQuiver: () => openQuiverDialog(),
                }),
            },
            [Crepe.Feature.BlockEdit]: {
              textGroup: {
                h1: null,
              },
              advancedGroup: {
                math: null,
              },
            },
            [Crepe.Feature.Latex]: {
            katexOptions: {
              throwOnError: false,
              strict: false,
              trust: true,
            },
          },
          [Crepe.Feature.Placeholder]: {
            text: placeholder,
            mode: 'block',
          },
          [Crepe.Feature.ImageBlock]: {
            onUpload: async (file: File) => {
              const runtime = bootstrapRef.current;
              return demoModeRef.current && runtime
                ? (await runtime.ports.uploads.upload({ name: file.name, type: file.type, bytes: file })).url
                : uploadAnswerFile('post', file);
            },
            blockCaptionPlaceholderText: '图片说明',
            blockUploadPlaceholderText: '上传图片',
          },
        },
      });
      editor.editor.use(rinNonFirstH1InputRule);
      editor.editor.use(rinLatexCodeBlockGapCursorPlugin);
      editor.editor.use(rinLatexTrailingConfigPlugin);
      editor.editor.use(rinLatexTrailingPlaceholderPlugin);
      editor.editor.use(rinTypedDisplayMathFenceMergePlugin);
      editor.editor.use(rinTypedMarkdownTableInputPlugin);
      editor.editor.use(rinDisplayMathShortcutPlugin);
      editor.editor.use(rinSingleLineDisplayMathInputRule);
      const clearMathReparseTimer = () => {
        if (mathReparseTimerRef.current !== null) {
          window.clearTimeout(mathReparseTimerRef.current);
          mathReparseTimerRef.current = null;
        }
      };
      const editorHasActiveSelection = () => {
        const activeElement = document.activeElement;
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const anchorElement =
          anchor instanceof Element ? anchor : anchor?.parentElement;
        return Boolean(
          (activeElement instanceof Element && host.contains(activeElement)) ||
            (anchorElement && host.contains(anchorElement)),
        );
      };
      const replaceAllWhenEditorInactive = (markdown: string) => {
        if (editorHasActiveSelection()) return false;
        editor.editor.action(replaceAll(markdown, true));
        return true;
      };
      const hasStaleMathDom = () =>
        Boolean(
          host.querySelector('.milkdown-code-block .katex-error') ||
            Array.from(host.querySelectorAll('.milkdown-code-block .preview')).some((node) =>
              (node.textContent || '').includes('$$') ||
              (node.textContent || '').includes('\\]'),
            ) ||
            Array.from(host.querySelectorAll('.ProseMirror p')).some((node) =>
              hasCompleteDisplayMathFence(node.textContent || ''),
            ),
        );
      const scheduleMathReparse = (source: string) => {
        if (!hasCompleteDisplayMathFence(source) || lastMathReparseRef.current === source) return;
        if (!hasStaleMathDom()) return;
        clearMathReparseTimer();
        mathReparseTimerRef.current = window.setTimeout(() => {
          if (!editorRef.current || markdownRef.current !== source) return;
          if (!hasStaleMathDom()) return;
          if (editorHasActiveSelection()) return;
          lastMathReparseRef.current = source;
          syncingRef.current = true;
          replaceAllWhenEditorInactive(source);
          window.setTimeout(() => {
            syncingRef.current = false;
          }, 0);
        }, 250);
      };
      const normalizeEditorMath = () => {
        if (readOnlyRef.current) return;
        if (editorRef.current && closeActiveLatexBlockFence(editorRef.current)) {
          return;
        }
        clearMathReparseTimer();
        mathReparseTimerRef.current = window.setTimeout(() => {
          if (!editorRef.current) return;
          if (closeActiveLatexBlockFence(editorRef.current)) return;
          const source = editorRef.current.getMarkdown();
          const normalized = cleanEditorMarkdown(source);
          const staleMathPreview = hasStaleMathDom();
          if (normalized === source && !staleMathPreview) return;
          if (editorHasActiveSelection()) return;
          lastMathReparseRef.current = normalized;
          emitChange(normalized);
          syncingRef.current = true;
          replaceAllWhenEditorInactive(normalized);
          window.setTimeout(() => {
            syncingRef.current = false;
          }, 0);
        }, 300);
      };
      const parsePastedMathMarkdown = (event: ClipboardEvent) => {
        if (readOnlyRef.current) return;
        const text = event.clipboardData?.getData('text/plain') || '';
        const html = event.clipboardData?.getData('text/html') || '';
        if (
          !shouldPasteClipboardAsMarkdown(text, html) ||
          !editorRef.current
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        editorRef.current.editor.action((ctx) => pasteMarkdownMathInCtx(ctx, text));
        window.setTimeout(() => {
          syncLatexBlockViews();
          const source = editorRef.current?.getMarkdown();
          if (source) scheduleMathReparse(source);
        }, 0);
      };
      const closeCodeBlockFenceOnEnter = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || readOnlyRef.current || !editorRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const block = target.closest('.milkdown-code-block:not(.rin-latex-block)');
      if (!(block instanceof HTMLElement)) return;
      const closeAfterCodeMirrorUpdate = () => {
        window.setTimeout(() => {
          if (readOnlyRef.current || !editorRef.current || !block.isConnected) return;
          closeActiveCodeBlockFence(editorRef.current, block);
        }, 0);
      };
      if (promoteActiveCodeBlockInfoString(editorRef.current, block)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!hasActiveCodeBlockClosingFence(editorRef.current, block)) {
        closeAfterCodeMirrorUpdate();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeAfterCodeMirrorUpdate();
    };
      const closeCodeBlockFenceAfterEnter = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || readOnlyRef.current || !editorRef.current) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const block = target.closest('.milkdown-code-block:not(.rin-latex-block)');
        if (!(block instanceof HTMLElement)) return;
        if (!hasActiveCodeBlockClosingFence(editorRef.current, block)) return;
        event.preventDefault();
        event.stopPropagation();
        closeActiveCodeBlockFence(editorRef.current, block);
      };
      const clearPendingCodeBlockFocus = () => {
        if (pendingCodeBlockFocusRef.current) {
          window.clearTimeout(pendingCodeBlockFocusRef.current.timeout);
        }
        pendingCodeBlockFocusRef.current = null;
      };
      const keepFocusOnBlankParagraphAfterCodeBlock = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || readOnlyRef.current) return;
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const anchorElement =
          anchor instanceof Element ? anchor : anchor?.parentElement;
        const paragraph = anchorElement?.closest('.ProseMirror p');
        if (!(paragraph instanceof HTMLElement) || (paragraph.textContent || '') !== '') {
          return;
        }
        const previous = paragraph.previousElementSibling;
        if (
          !(previous instanceof HTMLElement) ||
          !previous.matches('.milkdown-code-block:not(.rin-latex-block)')
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        editorRef.current?.editor.action((ctx) =>
          focusParagraphElementInCtx(ctx, paragraph),
        );
      };
      const keepFocusOnBlankParagraphAfterLatexBlock = (event: KeyboardEvent) => {
        if (event.key !== 'Backspace' && event.key !== 'Delete') return;
        if (
          editorRef.current?.editor.action((ctx) =>
            deleteLatexBlockBeforeSelectionInCtx(ctx),
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const anchorElement =
          anchor instanceof Element ? anchor : anchor?.parentElement;
        const paragraph = anchorElement?.closest('.ProseMirror p');
        if (!(paragraph instanceof HTMLElement) || (paragraph.textContent || '') !== '') {
          return;
        }
        const previousContentSibling = (element: Element) => {
          let current = element.previousElementSibling;
          while (current?.classList.contains('prosemirror-virtual-cursor')) {
            current = current.previousElementSibling;
          }
          return current;
        };
        let targetParagraph = paragraph;
        let previous = previousContentSibling(targetParagraph);
        if (
          previous instanceof HTMLElement &&
          previous.matches('.ProseMirror p') &&
          (previous.textContent || '') === ''
        ) {
          const beforePrevious = previousContentSibling(previous);
          if (
            beforePrevious instanceof HTMLElement &&
            beforePrevious.matches('.rin-latex-block')
          ) {
            targetParagraph = previous;
            previous = beforePrevious;
          }
        }
        if (
          !(previous instanceof HTMLElement) ||
          !previous.matches('.rin-latex-block')
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        editorRef.current?.editor.action((ctx) =>
          deleteLatexBlockBeforeParagraphInCtx(ctx, targetParagraph),
        );
      };
      const requestCodeBlockFocusAfterEnter = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || readOnlyRef.current) return;
        const target = event.target instanceof Element ? event.target : null;
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const anchorElement =
          anchor instanceof Element ? anchor : anchor?.parentElement;
        const eventInsideHost = Boolean(target && host.contains(target));
        const selectionInsideHost = Boolean(anchorElement && host.contains(anchorElement));
        if (!eventInsideHost && !selectionInsideHost) return;
        if (
          target?.closest('.milkdown-code-block') ||
          anchorElement?.closest('.milkdown-code-block')
        ) {
          return;
        }
        clearPendingCodeBlockFocus();
        pendingCodeBlockFocusRef.current = {
          beforeCount: host.querySelectorAll('.milkdown-code-block:not(.rin-latex-block)').length,
          timeout: window.setTimeout(() => {
            pendingCodeBlockFocusRef.current = null;
          }, 1200),
        };
        window.setTimeout(() => focusPendingCodeBlockEditor(), 0);
        window.setTimeout(() => focusPendingCodeBlockEditor(), 50);
        window.setTimeout(() => focusPendingCodeBlockEditor(), 200);
        window.setTimeout(() => focusLatestEmptyCodeBlockEditor(), 100);
        window.setTimeout(() => focusLatestEmptyCodeBlockEditor(), 300);
      };
      const focusLatestEmptyCodeBlockEditor = () => {
        const activeElement = document.activeElement;
        if (
          activeElement &&
          activeElement !== document.body &&
          !host.contains(activeElement)
        ) {
          return false;
        }
        if (
          activeElement instanceof HTMLElement &&
          activeElement.classList.contains('cm-content')
        ) {
          return false;
        }
        const contents = Array.from(
          host.querySelectorAll('.milkdown-code-block:not(.rin-latex-block) .cm-content'),
        );
        const content = contents[contents.length - 1];
        if (!(content instanceof HTMLElement) || (content.textContent || '') !== '') {
          return false;
        }
        content.focus();
        return true;
      };
      const focusPendingCodeBlockEditor = () => {
        const pending = pendingCodeBlockFocusRef.current;
        if (!pending || readOnlyRef.current) return false;
        const blocks = Array.from(
          host.querySelectorAll('.milkdown-code-block:not(.rin-latex-block)'),
        );
        if (blocks.length <= pending.beforeCount) return false;
        const activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body && !host.contains(activeElement)) {
          return false;
        }
        const block = blocks[blocks.length - 1];
        const content = block?.querySelector('.cm-content');
        if (!(content instanceof HTMLElement)) return false;
        clearPendingCodeBlockFocus();
        window.requestAnimationFrame(() => {
          content.focus();
          window.setTimeout(() => content.focus(), 50);
          window.setTimeout(() => focusLatestEmptyCodeBlockEditor(), 100);
        });
        return true;
      };
      let closeInlineMathEditor: (() => void) | null = null;
      const openInlineMathEditor = (event: MouseEvent) => {
        if (readOnlyRef.current || !editorRef.current) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const mathNode = target.closest('span[data-type="math_inline"]');
        if (!(mathNode instanceof HTMLElement)) return;
        closeInlineMathEditor?.();
        closeInlineMathEditor = openInlineMathPopover(editorRef.current, mathNode, () => {
          closeInlineMathEditor = null;
        });
        if (!closeInlineMathEditor) return;
        event.preventDefault();
        event.stopPropagation();
      };
      const syncLatexBlockViews = () => {
        host.querySelectorAll('.milkdown-code-block').forEach((block) => {
          if (!(block instanceof HTMLElement)) return;
          syncLatexCodeBlockElement(block, {
            throwOnError: false,
            strict: false,
            trust: true,
          });
        });
      };
      const syncQuiverImageBlocks = () => {
        host.querySelectorAll('img[data-type="image-block"]').forEach((image) => {
          if (!(image instanceof HTMLElement)) return;
          const block = image.closest('.milkdown-image-block');
          if (!(block instanceof HTMLElement)) return;
          const imageSource = image.getAttribute('src') || '';
          const isQuiverImage = /\/rin\/api\/diagrams\/[^/?#]+/.test(imageSource);
          block.classList.toggle('rin-quiver-image-block', isQuiverImage);
          image.classList.toggle('rin-quiver-image', isQuiverImage);
          image.dataset.rinQuiverUrl = '';
        });
      };
      const showLatexBlockEditor = (block: HTMLElement, info: LatexBlockEditorState) => {
        if (latexEditorStateRef.current?.pos === info.pos) {
          window.setTimeout(() => latexEditorHandleRef.current?.focusEnd(), 0);
          return true;
        }

        closeLatexBlockEditor();
        if (readOnlyRef.current || !editorRef.current) return false;

        activeLatexBlockRef.current?.classList.remove('rin-latex-editing');
        activeLatexBlockRef.current = block;
        block.classList.add('rin-latex-editing');
        const rect = block.getBoundingClientRect();
        const nextLatexEditor = {
          pos: info.pos,
          value: info.value,
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        };
        latexEditorStateRef.current = nextLatexEditor;
        setLatexEditor(nextLatexEditor);
        return true;
      };
      const openLatexBlockEditorForBlock = (block: HTMLElement) => {
        if (readOnlyRef.current || !editorRef.current) return;
        const info = latexBlockNodeInfo(editorRef.current, block);
        if (!info) return;
        showLatexBlockEditor(block, {
          ...info,
          top: 0,
          left: 0,
          width: 0,
        });
      };
      const openLatexBlockEditorAtPos = (pos: number) => {
        if (readOnlyRef.current || !editorRef.current) return false;
        const target = editorRef.current.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const node = view.state.doc.nodeAt(pos);
          if (
            !node ||
            node.type.name !== 'code_block' ||
            String(node.attrs.language || '').toLowerCase() !== 'latex'
          ) {
            return null;
          }

          const dom = view.nodeDOM(pos);
          const block =
            dom instanceof HTMLElement
              ? dom.closest('.milkdown-code-block')
              : dom?.parentElement?.closest('.milkdown-code-block');
          if (!(block instanceof HTMLElement)) return null;
          return {
            block,
            info: {
              pos,
              value: node.textContent,
              top: 0,
              left: 0,
              width: 0,
            },
          };
        });
        if (!target) return false;
        return showLatexBlockEditor(target.block, target.info);
      };
      openLatexBlockEditorAtPosRef.current = openLatexBlockEditorAtPos;
      const openLatexBlockEditor = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const block = target.closest('.rin-latex-block');
        if (!(block instanceof HTMLElement)) return;
        openLatexBlockEditorForBlock(block);
        event.preventDefault();
        event.stopPropagation();
      };
      const openExistingQuiverImage = (event: PointerEvent) => {
        if (readOnlyRef.current) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const block = target.closest('.rin-quiver-image-block');
        if (!(block instanceof HTMLElement)) return;
        if (
          target.closest('.operation, .operation-item, .image-resize-handle, figcaption, .caption') ||
          target.closest('button, input, textarea, select, a')
        ) {
          return;
        }
        const image = block.querySelector('img[data-type="image-block"].rin-quiver-image');
        if (!(image instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();

        const imageSource = image.getAttribute('src') || '';
        const diagramID = diagramIdFromImageUrl(imageSource);
        if (!diagramID) return;
        if (demoModeRef.current) {
          openQuiverDialog();
          return;
        }
        setQuiverError('');
        void loadTikzcdDiagramSource(diagramID)
          .then((source) => {
            openQuiverDialog({
              source: tikzcdDiagramSourceText(source),
              replacingImageSrc: imageSource,
            });
          })
          .catch((quiverOpenError) => {
            onError?.(messageFromError(quiverOpenError, 'creation.quiverSourceLoadFailed'));
          });
      };
      const openFocusedLatexBlockEditor = (event: FocusEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const block = target.closest('.rin-latex-block');
        if (!(block instanceof HTMLElement)) return;
        openLatexBlockEditorForBlock(block);
      };
      const openNewFocusedLatexBlockEditor = () => {
        if (latexEditorStateRef.current) return true;
        const focusedBlock = host.querySelector(
          '.rin-latex-block .cm-editor.cm-focused',
        )?.closest('.rin-latex-block');
        if (focusedBlock instanceof HTMLElement) {
          openLatexBlockEditorForBlock(focusedBlock);
          return true;
        }
        return false;
      };
      const openLatexBlockEditorFromShortcut = (event: Event) => {
        if (readOnlyRef.current) return;
        if (!(event instanceof CustomEvent)) return;
        const detail = event.detail as { pos?: unknown } | null;
        const pos = detail?.pos;
        if (typeof pos !== 'number') return;
        window.setTimeout(() => {
          if (openLatexBlockEditorAtPosRef.current?.(pos)) return;
          openNewFocusedLatexBlockEditor();
        }, 0);
      };
      const preventReadonlyMutation = (event: Event) => {
        if (!readOnlyRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      };
      const latexBlockObserver = new MutationObserver(() => {
        syncLatexBlockViews();
        syncQuiverImageBlocks();
        focusPendingCodeBlockEditor();
        openNewFocusedLatexBlockEditor();
      });
      editorRef.current = editor;
      editor.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          const cleanMarkdown = cleanEditorMarkdown(markdown);
          markdownRef.current = cleanMarkdown;
          if (syncingRef.current) return;
          emitChange(cleanMarkdown);
          if (skipNextMathReparseRef.current) {
            skipNextMathReparseRef.current = false;
            lastMathReparseRef.current = cleanMarkdown;
            return;
          }
          if (cleanMarkdown !== markdown) {
            if (editorHasActiveSelection()) return;
            syncingRef.current = true;
            replaceAllWhenEditorInactive(cleanMarkdown);
            window.setTimeout(() => {
              syncingRef.current = false;
            }, 0);
            return;
          }
        });
      });
      void editor
        .create()
        .then(() => {
          const currentMarkdown = editor.getMarkdown();
          const cleanMarkdown = cleanEditorMarkdown(currentMarkdown);
          markdownRef.current = cleanMarkdown;
          if (cleanMarkdown !== currentMarkdown) {
            replaceAllWhenEditorInactive(cleanMarkdown);
          }
          scheduleMathReparse(cleanMarkdown);
          host.addEventListener('paste', parsePastedMathMarkdown, true);
          host.addEventListener('keydown', keepFocusOnBlankParagraphAfterCodeBlock, true);
          host.addEventListener('keydown', keepFocusOnBlankParagraphAfterLatexBlock, true);
          document.addEventListener('keydown', requestCodeBlockFocusAfterEnter, true);
          host.addEventListener(rinLatexBlockOpenEvent, openLatexBlockEditorFromShortcut);
          host.addEventListener('keydown', closeCodeBlockFenceOnEnter, true);
          host.addEventListener('keyup', closeCodeBlockFenceAfterEnter, true);
          host.addEventListener('drop', preventReadonlyMutation, true);
          host.addEventListener('click', openInlineMathEditor, true);
          host.addEventListener('pointerdown', openExistingQuiverImage, true);
          host.addEventListener('pointerdown', openLatexBlockEditor, true);
          host.addEventListener('focusin', openFocusedLatexBlockEditor, true);
          latexBlockObserver.observe(host, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-language'],
          });
          syncLatexBlockViews();
          syncQuiverImageBlocks();
          openNewFocusedLatexBlockEditor();
          applyEditorAccessibility(host, ariaLabel || 'Markdown 编辑器');
          setEditorReady(true);
          onReady?.(true);
        })
        .catch((createError) => {
          const message = messageFromError(createError, 'creation.markdownEditorFailed');
          onError?.(message);
        });
      return () => {
        clearMathReparseTimer();
        clearPendingCodeBlockFocus();
        host.removeEventListener('paste', parsePastedMathMarkdown, true);
        host.removeEventListener('keydown', keepFocusOnBlankParagraphAfterCodeBlock, true);
        host.removeEventListener('keydown', keepFocusOnBlankParagraphAfterLatexBlock, true);
        document.removeEventListener('keydown', requestCodeBlockFocusAfterEnter, true);
        host.removeEventListener(rinLatexBlockOpenEvent, openLatexBlockEditorFromShortcut);
        host.removeEventListener('keydown', closeCodeBlockFenceOnEnter, true);
        host.removeEventListener('keyup', closeCodeBlockFenceAfterEnter, true);
        host.removeEventListener('drop', preventReadonlyMutation, true);
        host.removeEventListener('click', openInlineMathEditor, true);
        host.removeEventListener('pointerdown', openExistingQuiverImage, true);
        host.removeEventListener('pointerdown', openLatexBlockEditor, true);
        host.removeEventListener('focusin', openFocusedLatexBlockEditor, true);
        openLatexBlockEditorAtPosRef.current = null;
        latexBlockObserver.disconnect();
        closeInlineMathEditor?.();
        closeLatexBlockEditor(false);
        editor.destroy();
        editorRef.current = null;
        setEditorReady(false);
        onReady?.(false);
      };
    }, []);

    return (
      <>
        <div
          id={id}
          ref={hostRef}
          className={[
            'milkdown-editor-host',
            'rin-milkdown-editor-host',
            readOnly ? 'rin-milkdown-readonly' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={ariaLabel}
          style={{ '--rin-milkdown-min-height': minHeight } as CSSProperties}
        />
        {!editorReady ? <LoadingState variant="strip" /> : null}
        {latexEditor ? (
          <div
            className="rin-latex-editor-panel"
            style={{
              left: `${latexEditor.left}px`,
              top: `${latexEditor.top}px`,
              width: `${latexEditor.width}px`,
            }}
          >
            <span>$$</span>
            <CodeMirrorEditor
              value={latexEditor.value}
              minHeight="86px"
              ariaLabel="编辑行间公式"
              editorRef={latexEditorHandleRef}
              submitOnEnter={false}
              onReady={(handle) => {
                latexEditorHandleRef.current = handle;
                handle?.focusEnd();
                window.setTimeout(() => handle?.focusEnd(), 0);
              }}
              onChange={changeLatexBlockValue}
              onSubmit={submitLatexBlockAndContinue}
            />
            <span>$$</span>
            <AnimateButton unstyled type="button" onClick={submitLatexBlockAndContinue}>
              完成
            </AnimateButton>
          </div>
        ) : null}
        {quiverOpen ? (
          <section
            className={[
              'rin-quiver-dialog',
              quiverDialogInteracting ? 'rin-quiver-dialog-interacting' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label="Quiver 交换图编辑器"
            style={{
              left: `${quiverDialogLayout.left}px`,
              top: `${quiverDialogLayout.top}px`,
              width: `${quiverDialogLayout.width}px`,
              height: `${quiverDialogLayout.height}px`,
            }}
          >
            <div
              className="rin-quiver-dialog-title"
              role="presentation"
              onPointerDown={beginQuiverDialogDrag}
            >
              <div>
                <strong>Quiver</strong>
                <span>导出为图片并插入当前光标位置</span>
              </div>
              <div className="rin-quiver-dialog-actions">
                <AnimateButton unstyled type="button" onClick={closeQuiverDialog}>
                  取消
                </AnimateButton>
                <AnimateButton unstyled
                  type="button"
                  className="primary"
                  disabled={quiverPending || !quiverFrameReady}
                  onClick={requestQuiverTikzcd}
                >
                  {quiverPending ? '导出中' : quiverFrameReady ? '插入' : '加载中'}
                </AnimateButton>
              </div>
            </div>
            {quiverError ? <div className="rin-quiver-dialog-error">{quiverError}</div> : null}
            <iframe
              ref={quiverFrameRef}
              className="rin-quiver-frame"
              title="Quiver commutative diagram editor"
              src={quiverFrameSrc}
              onLoad={() => {
                setQuiverFrameReady(true);
                setQuiverError('');
              }}
            />
            {quiverResizeEdges.map((edge) => (
              <span
                aria-hidden="true"
                className={`rin-quiver-dialog-resize rin-quiver-dialog-resize-${edge}`}
                key={edge}
                onPointerDown={(event) => beginQuiverDialogResize(event, edge)}
              />
            ))}
          </section>
        ) : null}
      </>
    );
  },
);

export default RinMilkdownEditor;
