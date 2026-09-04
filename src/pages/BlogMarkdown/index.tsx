import { Icon, AnimateButton, useToast } from 'components/ui';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { editorViewCtx, schemaCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { Fragment, Slice } from '@milkdown/kit/prose/model';
import { replaceAll } from '@milkdown/kit/utils';
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Form, Modal, Spinner } from '@/components/ui/compat';
import { RuntimeHelmet as Helmet } from '@/components/RuntimeHelmet';
import { useNavigate, useSearchParams } from 'react-router-dom';

import CodeMirrorEditor, {
  type CodeMirrorEditorHandle,
} from '@/components/CodeMirrorEditor';
import ImageCropDialog from '@/components/ImageCropDialog';
import LoadingState from '@/components/LoadingState';
import MilkdownMarkdownArticle from '@/components/MilkdownMarkdownArticle';
import SiteTopbar from '@/components/SiteTopbarShell';
import TagPicker, { joinTagValues, splitTagValues } from '@/components/TagPicker';
import { i18n as appI18n } from '@/i18n';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatDate, formatNumber } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { createContent, isContentModerationSubmission, loadContentDetail, updateContent } from '@/services/domains/article';
import { moveWorkItem } from '@/services/domains/identity';
import { cancelMarkdownRenderJob, loadMarkdownRenderJob, submitMarkdownRenderJob, uploadAnswerFile } from '@/services/domains/publication';
import type { CreateContentInput, MarkdownRenderJob, PostDetail, SourceFileInfo } from '@/services/contracts';
import { getCurrentUser, uploadCoverFile } from '@/services/profile';
import type { CloudUser } from '@/services/phoneAuth';
import {
  firstMarkdownHeading,
  markdownWithTitle,
  markdownWithoutDefaultTemplate,
} from '@/utils/markdownTitle';
import {
  makeMilkdownAutosaveKey,
  useMilkdownAutosave,
  type MilkdownAutosaveDraft,
} from '@/utils/milkdownAutosave';
import {
  blogEditorKind,
  bodyFromMarkdownSource,
  excerptFromMarkdown,
  markdownBlogSource,
  markdownSourceFile,
  normalizeMarkdownWhitespaceEntities,
} from '@/utils/blogBody';
import { contentPath } from '@/utils/routes';
import { useOptionalAuthSnapshot } from '@/platform/auth/context';
import { loadTextAsset } from '@/platform/assets';
import { useOptionalBootstrap } from '@/app/bootstrap/context';
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
} from './rinMilkdownMathPlugin';
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
} from './rinMilkdownQuiverPlugin';

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function markdownFilename(title: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('');
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');
  const slug = slugify(title) || 'rinspace-markdown';
  return `${stamp}-${time}-${slug}.md`;
}

const markdownSourceStorageMime = 'text/plain;charset=utf-8';
const markdownSourceBusinessMime = 'text/markdown;charset=utf-8';
const defaultQuiverFrameSrc = '/quiver/?rinWriter=1';
function bodyHeadingOptions() {
  return [
    { label: appI18n.t('creation:markdownWriter.headings.paragraph'), level: null },
    { label: appI18n.t('creation:markdownWriter.headings.heading2'), level: 2 },
    { label: appI18n.t('creation:markdownWriter.headings.heading3'), level: 3 },
    { label: appI18n.t('creation:markdownWriter.headings.heading4'), level: 4 },
    { label: appI18n.t('creation:markdownWriter.headings.heading5'), level: 5 },
    { label: appI18n.t('creation:markdownWriter.headings.heading6'), level: 6 },
  ];
}

type QuiverDialogInteraction = {
  mode: 'drag' | 'resize';
  edge?: QuiverResizeEdge;
  pointerId: number;
  startX: number;
  startY: number;
  startLayout: QuiverDialogLayout;
};

type PendingCoverCrop = {
  imageUrl: string;
  fileName: string;
};

type MarkdownPageState = 'draft' | 'published';

type MarkdownWriterNotice = {
  key: string;
  values?: Record<string, string | number>;
};

function markdownRenderStateKey(job: MarkdownRenderJob) {
  switch (job.state) {
    case 'queued':
      return 'markdownWriter.render.states.queued';
    case 'running':
      return 'markdownWriter.render.states.running';
    case 'succeeded':
      return 'markdownWriter.render.states.succeeded';
    case 'failed':
      return 'markdownWriter.render.states.failed';
    case 'canceled':
      return 'markdownWriter.render.states.canceled';
    case 'expired':
      return 'markdownWriter.render.states.expired';
    default:
      return '';
  }
}

function markdownRenderStageKey(stage?: string) {
  switch (stage) {
    case 'admission':
    case 'queue':
      return 'markdownWriter.render.stages.queue';
    case 'analysis':
    case 'analyze':
      return 'markdownWriter.render.stages.analysis';
    case 'document_compile':
    case 'compile':
      return 'markdownWriter.render.stages.compile';
    case 'resolve':
      return 'markdownWriter.render.stages.resolve';
    case 'finalize':
      return 'markdownWriter.render.stages.finalize';
    case 'store':
      return 'markdownWriter.render.stages.store';
    default:
      return '';
  }
}

function markdownRenderETARange(job: MarkdownRenderJob, locale: 'zh-CN' | 'en') {
  const range = job.queue?.estimate?.estimatedStartRange;
  if (!range) return '';
  const earliest = new Date(range.earliest);
  const latest = new Date(range.latest);
  if (Number.isNaN(earliest.getTime()) || Number.isNaN(latest.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  };
  return `${formatDate(locale, earliest, options)}–${formatDate(locale, latest, options)}`;
}
type MarkdownSourceVisibility = 'private' | 'open';

function pageStateForPost(post: PostDetail): MarkdownPageState {
  return post.publishStatus === 'draft' ? 'draft' : 'published';
}

function sourceVisibilityForPost(post: PostDetail): MarkdownSourceVisibility {
  if (post.sourceVisibility === 'open') return 'open';
  if (post.sourceVisibility === 'private') return 'private';
  if (post.repositoryStatus === 'published') return 'open';
  return post.publishStatus === 'published' ? 'open' : 'private';
}

function contentStatusForControls(
  pageState: MarkdownPageState,
  sourceVisibility: MarkdownSourceVisibility,
): CreateContentInput['status'] {
  if (pageState === 'draft') return 'draft';
  return sourceVisibility === 'open' ? 'published' : 'private';
}

function normalizeManualExcerpt(value: string) {
  return normalizeMarkdownWhitespaceEntities(value).trim();
}

function manualExcerptFromPost(post: PostDetail, markdown: string) {
  const savedExcerpt = normalizeManualExcerpt(post.excerpt || '');
  if (!savedExcerpt) return '';
  const automaticExcerpt = normalizeManualExcerpt(excerptFromMarkdown(markdown));
  return savedExcerpt === automaticExcerpt ? '' : savedExcerpt;
}

function quiverEditorNodes(ctx: Ctx, imageUrl: string) {
  const schema = ctx.get(schemaCtx);
  const imageBlockType = schema.nodes['image-block'];
  if (!imageBlockType) {
    throw new Error('The editor is missing the node required for Quiver images.');
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
      throw new Error('The editor is missing the node required for Quiver images.');
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

function differsOnlyByTrailingBlankLines(current: string, normalized: string) {
  const trimTrailingBlankLines = (value: string) => value.replace(/\n+$/g, '');
  return trimTrailingBlankLines(current) === trimTrailingBlankLines(normalized);
}

async function uploadMarkdownSource(
  markdown: string,
  title: string,
): Promise<SourceFileInfo | null> {
  if (!markdown.trim()) return null;
  const filename = markdownFilename(title);
  const file = new File([markdown], filename, {
    type: markdownSourceStorageMime,
  });
  const url = await uploadAnswerFile('post_attachment', file);
  return {
    filename,
    mime: markdownSourceBusinessMime,
    bytes: file.size,
    url,
  };
}

async function sourceFromPost(post: PostDetail) {
  const embedded = markdownBlogSource(post.body);
  if (embedded) return embedded;
  const file = markdownSourceFile(post);
  if (!file) return '';
  return loadTextAsset(file.url).catch(() => '');
}

export default function BlogMarkdownPage() {
  const { t, i18n } = useFeatureTranslation('creation');
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const navigate = useNavigate();
  const authSnapshot = useOptionalAuthSnapshot();
  const bootstrap = useOptionalBootstrap();
  const demoMode = bootstrap?.config.mode === 'demo';
  const bootstrapRef = useRef(bootstrap);
  const demoModeRef = useRef(demoMode);
  bootstrapRef.current = bootstrap;
  demoModeRef.current = demoMode;
  const [searchParams] = useSearchParams();
  const editSlug = searchParams.get('edit')?.trim() || '';
  const worksFolderId = searchParams.get('worksFolderId')?.trim() || '';
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
  const markdownRef = useRef('');
  const titleRef = useRef('');
  const syncingTitleRef = useRef(false);
  const mathReparseTimerRef = useRef<number | null>(null);
  const lastMathReparseRef = useRef('');
  const skipNextMathReparseRef = useRef(false);
  const activeRenderJobIDRef = useRef('');
  const [user, setUser] = useState<CloudUser | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editPost, setEditPost] = useState<PostDetail | null>(null);
  const [initialMarkdown, setInitialMarkdown] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [manualExcerpt, setManualExcerpt] = useState('');
  const [manualExcerptEnabled, setManualExcerptEnabled] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [summaryEditorValue, setSummaryEditorValue] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [pendingCoverCrop, setPendingCoverCrop] = useState<PendingCoverCrop | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [savingMode, setSavingMode] = useState<'draft' | 'published' | ''>('');
  const [renderJob, setRenderJob] = useState<MarkdownRenderJob | null>(null);
  const [renderCanceling, setRenderCanceling] = useState(false);
  const [pageState, setPageState] = useState<MarkdownPageState>('published');
  const [sourceVisibility, setSourceVisibility] = useState<MarkdownSourceVisibility>('open');
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
  const [status, setStatus] = useState<MarkdownWriterNotice | null>(null);
  const [error, setError] = useState('');
  const [userChecked, setUserChecked] = useState(false);

  const canSave = Boolean(
    user &&
      editorReady &&
      !loadingEdit &&
      title.trim() &&
      !savingMode,
  );
  const statusText = status ? t(status.key, status.values) : '';

  useEffect(() => {
    if (authSnapshot) {
      const authUser = authSnapshot.user;
      setUser(authSnapshot.status === 'authenticated' && authUser ? {
        id: authUser.id,
        username: authUser.username,
        user_metadata: {
          nickname: authUser.displayName,
          avatarUrl: authUser.avatarUrl ?? '',
        },
        is_anonymous: false,
      } : null);
      setUserChecked(authSnapshot.status !== 'restoring');
      return undefined;
    }
    let cancelled = false;
    setUserChecked(false);
    void getCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setUserChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authSnapshot]);

  useEffect(() => {
    return () => {
      if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    };
  }, [pendingCoverCrop]);

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
      const cleanMarkdown = normalizeMilkdownMathMarkdown(
        markdownWithoutDefaultTemplate(editorRef.current.getMarkdown()),
      );
      markdownRef.current = normalizeMarkdownWhitespaceEntities(cleanMarkdown);
    }
    activeLatexBlockRef.current = null;
    latexEditorHandleRef.current = null;
    latexEditorStateRef.current = null;
    pendingLatexContinuationPosRef.current =
      focusAfter && commit && currentLatexEditor && !committed ? currentLatexEditor.pos : null;
    setLatexEditor(null);
  };

  const changeLatexBlockValue = (value: string) => {
    setLatexEditor((current) => {
      if (!current) return current;
      const next = { ...current, value };
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
      setQuiverError(t('markdownWriter.quiver.notLoaded'));
      return;
    }
    if (!quiverFrameReady) {
      setQuiverError(t('markdownWriter.quiver.stillLoading'));
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
        setQuiverError(appI18n.t('creation:markdownWriter.quiver.timeout'));
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
        if (message.error) console.error('Quiver export failed', message.error);
        setQuiverError(appI18n.t('creation:markdownWriter.quiver.exportFailed'));
        return;
      }

      void (async () => {
        try {
          const tikzcd = normalizeQuiverTikzcd(message.payload?.data || '');
          const parsed = parseTikzcdSource(tikzcd);
          if (!parsed) {
            setQuiverPending(false);
            setQuiverError(appI18n.t('creation:markdownWriter.quiver.empty'));
            return;
          }
          const diagram = await renderTikzcdDiagram(parsed);
          const replacingImageSrc = quiverReplacingImageSrcRef.current;
          closeQuiverDialog();
          syncingTitleRef.current = true;
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
            syncingTitleRef.current = false;
            throw editorInsertError;
          }
          window.setTimeout(() => {
            syncingTitleRef.current = false;
            if (!editorRef.current) return;
            markdownRef.current = ensureQuiverImageComments(
              markdownWithoutDefaultTemplate(editorRef.current.getMarkdown()),
              window.location.origin,
            );
          }, 0);
        } catch (quiverInsertError) {
          setQuiverPending(false);
          setQuiverError(localizedErrorMessage(quiverInsertError, 'creation.quiverRenderFailed'));
        }
      })();
    };

    window.addEventListener('message', handleQuiverMessage);
    return () => {
      window.removeEventListener('message', handleQuiverMessage);
    };
  }, [quiverOpen]);

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
    let cancelled = false;
    setError('');
    setStatus(null);
    setEditPost(null);
    setInitialMarkdown(null);
    if (!editSlug) {
      titleRef.current = '';
      markdownRef.current = '';
      setTitle('');
      setTags('');
      setManualExcerpt('');
      setManualExcerptEnabled(false);
      setSummaryEditorValue('');
      setSummaryDialogOpen(false);
      setCoverUrl('');
      setPageState('published');
      setSourceVisibility('open');
      setInitialMarkdown('');
      setLoadingEdit(false);
      return undefined;
    }
    setLoadingEdit(true);
    setStatus({ key: 'markdownWriter.loading.source' });
    void loadContentDetail(editSlug)
      .then(async (post) => {
        if (post.type !== 'blog') {
          throw new Error('Unsupported Markdown content type.');
        }
        if (blogEditorKind(post) !== 'markdown') {
          throw new Error('The blog uses a different editor.');
        }
        const source = await sourceFromPost(post);
        if (!source.trim()) {
          throw new Error('No Markdown source is available.');
        }
        if (cancelled) return;
        const sourceTitle = firstMarkdownHeading(source) || post.title;
        const syncedSource = markdownWithTitle(source, sourceTitle);
        const nextManualExcerpt = manualExcerptFromPost(post, syncedSource);
        setEditPost(post);
        titleRef.current = sourceTitle;
        setTitle(sourceTitle);
        setTags(post.tags.join(', '));
        setManualExcerpt(nextManualExcerpt);
        setManualExcerptEnabled(Boolean(nextManualExcerpt));
        setSummaryEditorValue(nextManualExcerpt);
        setSummaryDialogOpen(false);
        setCoverUrl(post.coverUrl || '');
        setPageState(pageStateForPost(post));
        setSourceVisibility(sourceVisibilityForPost(post));
        setInitialMarkdown(syncedSource);
        markdownRef.current = syncedSource;
        setStatus({ key: 'markdownWriter.status.sourceLoaded' });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(localizedErrorMessage(loadError, 'creation.markdownEditLoadFailed'));
          setStatus(null);
          titleRef.current = '';
          markdownRef.current = '';
          setTitle('');
          setManualExcerpt('');
          setManualExcerptEnabled(false);
          setSummaryEditorValue('');
          setSummaryDialogOpen(false);
          setInitialMarkdown('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editSlug]);

  const autosaveKey = useMemo(
    () => makeMilkdownAutosaveKey(user, 'blog-markdown', editSlug || 'new'),
    [editSlug, user],
  );

  const makeAutosaveDraft = useCallback((): MilkdownAutosaveDraft | null => {
    const draftTitle = titleRef.current || title;
    const draftMarkdown = markdownWithTitle(markdownRef.current, draftTitle);
    const draftExcerpt = manualExcerptEnabled ? normalizeManualExcerpt(manualExcerpt) : '';
    if (!draftMarkdown.trim() && !draftTitle.trim() && !tags.trim() && !coverUrl.trim() && !draftExcerpt) {
      return null;
    }
    return {
      version: 1,
      key: autosaveKey,
      kind: 'blog-markdown',
      title: draftTitle,
      markdown: draftMarkdown,
      excerpt: draftExcerpt,
      excerptCustomized: Boolean(draftExcerpt),
      tags,
      coverUrl,
      editSlug,
      savedAt: Date.now(),
    };
  }, [autosaveKey, coverUrl, editSlug, manualExcerpt, manualExcerptEnabled, tags, title]);

  const applyAutosaveDraft = useCallback((draft: MilkdownAutosaveDraft) => {
    if (draft.kind !== 'blog-markdown') return;
    const nextTitle = draft.title || firstMarkdownHeading(draft.markdown) || titleRef.current;
    const nextMarkdown = markdownWithTitle(draft.markdown, nextTitle);
    titleRef.current = nextTitle;
    markdownRef.current = nextMarkdown;
    setTitle(nextTitle);
    const nextExcerpt = draft.excerptCustomized ? normalizeManualExcerpt(draft.excerpt || '') : '';
    setManualExcerpt(nextExcerpt);
    setManualExcerptEnabled(Boolean(nextExcerpt));
    setSummaryEditorValue(nextExcerpt);
    setTags(draft.tags || '');
    setCoverUrl(draft.coverUrl || '');
    setInitialMarkdown(nextMarkdown);
    if (!editorRef.current) return;
    syncingTitleRef.current = true;
    editorRef.current.editor.action(replaceAll(nextMarkdown, true));
    window.setTimeout(() => {
      syncingTitleRef.current = false;
    }, 0);
  }, []);

  const {
    checked: autosaveChecked,
    notice: autosaveNotice,
    noticeTone: autosaveNoticeTone,
    markChanged: markAutosaveChanged,
    scheduleAutosave,
    clearAutosave,
  } = useMilkdownAutosave({
    key: autosaveKey,
    user,
    userChecked,
    enabled: initialMarkdown !== null && !loadingEdit,
    ready: editorReady && !savingMode,
    makeDraft: makeAutosaveDraft,
    applyDraft: applyAutosaveDraft,
  });

  // Transient notices render as toasts (top-right) so they never shift the
  // writing surface layout.
  const toast = useToast();
  useEffect(() => {
    if (statusText) toast.notify({ title: statusText });
  }, [statusText, toast]);
  useEffect(() => {
    if (autosaveNotice) toast.notify({ title: autosaveNotice, tone: autosaveNoticeTone });
  }, [autosaveNotice, autosaveNoticeTone, toast]);
  useEffect(() => {
    if (error) toast.notify({ title: error, tone: 'destructive' });
  }, [error, toast]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || loadingEdit || initialMarkdown === null || !autosaveChecked) return undefined;
    setEditorReady(false);
    host.innerHTML = '';
    const editor = new Crepe({
      root: host,
      defaultValue: initialMarkdown,
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
            headingOptions: bodyHeadingOptions(),
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
                openQuiver: () => {
                  if (demoModeRef.current) {
                    setError(appI18n.t('creation:markdownWriter.quiver.unavailableDemo'));
                    return;
                  }
                  openQuiverDialog();
                },
                mathLabel: appI18n.t('creation:markdownWriter.topBar.math'),
                quiverLabel: appI18n.t('creation:markdownWriter.topBar.quiver'),
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
          text: appI18n.t('creation:markdownWriter.placeholders.editor'),
          mode: 'block',
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            const runtime = bootstrapRef.current;
            return demoModeRef.current && runtime
              ? (await runtime.ports.uploads.upload({ name: file.name, type: file.type, bytes: file })).url
              : uploadAnswerFile('post', file);
          },
          blockCaptionPlaceholderText: appI18n.t(
            'creation:markdownWriter.placeholders.imageCaption',
          ),
          blockUploadPlaceholderText: appI18n.t(
            'creation:markdownWriter.placeholders.imageUpload',
          ),
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
        syncingTitleRef.current = true;
        replaceAllWhenEditorInactive(source);
        window.setTimeout(() => {
          syncingTitleRef.current = false;
        }, 0);
      }, 250);
    };
    const normalizeEditorMath = () => {
      if (editorRef.current && closeActiveLatexBlockFence(editorRef.current)) {
        return;
      }
      clearMathReparseTimer();
      mathReparseTimerRef.current = window.setTimeout(() => {
        if (!editorRef.current) return;
        if (closeActiveLatexBlockFence(editorRef.current)) return;
        const source = editorRef.current.getMarkdown();
        const normalized = normalizeMarkdownWhitespaceEntities(
          normalizeMilkdownMathMarkdown(markdownWithoutDefaultTemplate(source)),
        );
        const staleMathPreview = hasStaleMathDom();
        if (normalized === source && !staleMathPreview) return;
        if (editorHasActiveSelection()) return;
        lastMathReparseRef.current = normalized;
        markdownRef.current = normalized;
        syncingTitleRef.current = true;
        replaceAllWhenEditorInactive(normalized);
        window.setTimeout(() => {
          syncingTitleRef.current = false;
        }, 0);
      }, 300);
    };
    const parsePastedMathMarkdown = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain') || '';
      const html = event.clipboardData?.getData('text/html') || '';
      if (!shouldPasteClipboardAsMarkdown(text, html) || !editorRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      editorRef.current.editor.action((ctx) => pasteMarkdownMathInCtx(ctx, text));
      const pastedTitle = firstMarkdownHeading(text);
      if (pastedTitle && pastedTitle !== titleRef.current) {
        titleRef.current = pastedTitle;
        setTitle(pastedTitle);
      }
      window.setTimeout(() => {
        syncLatexBlockViews();
        const source = editorRef.current?.getMarkdown();
        if (source) scheduleMathReparse(source);
      }, 0);
    };
    const closeCodeBlockFenceOnEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !editorRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const block = target.closest('.milkdown-code-block:not(.rin-latex-block)');
      if (!(block instanceof HTMLElement)) return;
      const closeAfterCodeMirrorUpdate = () => {
        window.setTimeout(() => {
          if (!editorRef.current || !block.isConnected) return;
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
      if (event.key !== 'Enter' || !editorRef.current) return;
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
      if (event.key !== 'Enter') return;
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
      if (!(previous instanceof HTMLElement) || !previous.matches('.rin-latex-block')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      editorRef.current?.editor.action((ctx) =>
        deleteLatexBlockBeforeParagraphInCtx(ctx, targetParagraph),
      );
    };
    const requestCodeBlockFocusAfterEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
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
      if (!pending) return false;
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
      if (!editorRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const mathNode = target.closest('span[data-type="math_inline"]');
      if (!(mathNode instanceof HTMLElement)) return;
      closeInlineMathEditor?.();
      closeInlineMathEditor = openInlineMathPopover(
        editorRef.current,
        mathNode,
        () => {
          closeInlineMathEditor = null;
        },
        {
          ariaLabel: appI18n.t('creation:markdownWriter.math.inlineEditor'),
          save: appI18n.t('creation:markdownWriter.actions.done'),
          cancel: appI18n.t('creation:markdownWriter.actions.cancel'),
        },
      );
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
      if (!editorRef.current) return false;

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
      if (!editorRef.current) return;
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
      if (!editorRef.current) return false;
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
          setError(localizedErrorMessage(quiverOpenError, 'creation.quiverSourceLoadFailed'));
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
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { pos?: unknown } | null;
      const pos = detail?.pos;
      if (typeof pos !== 'number') return;
      window.setTimeout(() => {
        if (openLatexBlockEditorAtPosRef.current?.(pos)) return;
        openNewFocusedLatexBlockEditor();
      }, 0);
    };
    const latexBlockObserver = new MutationObserver(() => {
      syncLatexBlockViews();
      syncQuiverImageBlocks();
      focusPendingCodeBlockEditor();
      openNewFocusedLatexBlockEditor();
    });
    const restoreEditorSelectionAfterTitleSync = () => {
      const activeElement = document.activeElement;
      if (!editorRef.current || !activeElement || !host.contains(activeElement)) return;
      const bookmark = editor.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        return view.state.selection.getBookmark();
      });
      window.setTimeout(() => {
        if (!editorRef.current) return;
        editorRef.current.editor.action((ctx) => {
          restoreSelectionBookmarkInCtx(ctx, bookmark);
        });
      }, 0);
    };
    editorRef.current = editor;
    editor.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        const cleanMarkdown = normalizeMarkdownWhitespaceEntities(
          normalizeMilkdownMathMarkdown(markdownWithoutDefaultTemplate(markdown)),
        );
        markdownRef.current = cleanMarkdown;
        if (syncingTitleRef.current) return;
        markAutosaveChanged();
        const headingTitle = firstMarkdownHeading(cleanMarkdown);
        const nextTitle = headingTitle || titleRef.current;
        if (headingTitle && headingTitle !== titleRef.current) {
          titleRef.current = headingTitle;
          setTitle(headingTitle);
          restoreEditorSelectionAfterTitleSync();
        }
        const normalizedMarkdown = markdownWithTitle(cleanMarkdown, nextTitle);
        if (normalizedMarkdown !== cleanMarkdown) {
          if (differsOnlyByTrailingBlankLines(cleanMarkdown, normalizedMarkdown)) {
            markdownRef.current = normalizedMarkdown;
            return;
          }
          if (editorHasActiveSelection()) {
            markdownRef.current = normalizedMarkdown;
            return;
          }
          syncingTitleRef.current = true;
          markdownRef.current = normalizedMarkdown;
          replaceAllWhenEditorInactive(normalizedMarkdown);
          window.setTimeout(() => {
            syncingTitleRef.current = false;
          }, 0);
          return;
        }
        if (skipNextMathReparseRef.current) {
          skipNextMathReparseRef.current = false;
          lastMathReparseRef.current = cleanMarkdown;
          return;
        }
        if (cleanMarkdown !== markdown) {
          if (editorHasActiveSelection()) return;
          syncingTitleRef.current = true;
          replaceAllWhenEditorInactive(cleanMarkdown);
          window.setTimeout(() => {
            syncingTitleRef.current = false;
          }, 0);
          return;
        }
      });
    });
    void editor
      .create()
      .then(() => {
        const currentMarkdown = editor.getMarkdown();
        const cleanMarkdown = markdownWithoutDefaultTemplate(currentMarkdown);
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
        const editorSurface = host.querySelector<HTMLElement>('.ProseMirror');
        editorSurface?.setAttribute('aria-label', appI18n.t('creation:markdownWriter.editor'));
        const toolbarLabels = [
          'bold', 'italic', 'strike', 'inlineCode', 'bulletList', 'orderedList', 'taskList', 'link',
          'image', 'table', 'codeBlock', 'quote', 'divider', 'math', 'quiver',
        ].map((key) => appI18n.t(`creation:markdownWriter.topBar.${key}`));
        host.querySelectorAll<HTMLButtonElement>('.top-bar-item[type="button"]').forEach((button, index) => {
          const label = toolbarLabels[index] || appI18n.t('creation:markdownWriter.topBar.tool', { index: index + 1 });
          button.setAttribute('aria-label', label);
          button.setAttribute('title', label);
        });
        setEditorReady(true);
      })
      .catch((createError) => {
        setError(localizedErrorMessage(createError, 'creation.markdownEditorFailed'));
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
    };
  }, [autosaveChecked, initialMarkdown, loadingEdit, markAutosaveChanged]);

  useEffect(() => {
    if (!autosaveChecked || !editorReady) return;
    scheduleAutosave(8000);
  }, [
    autosaveChecked,
    coverUrl,
    editorReady,
    manualExcerpt,
    manualExcerptEnabled,
    scheduleAutosave,
    tags,
    title,
  ]);

  const titlePlaceholder = useMemo(
    () => t(`markdownWriter.placeholders.${editSlug ? 'editTitle' : 'newTitle'}`),
    [editSlug, t],
  );

  const automaticExcerptPreview = useMemo(() => {
    if (!summaryDialogOpen) return '';
    const sourceMarkdown = normalizeMarkdownWhitespaceEntities(
      markdownWithTitle(markdownRef.current, titleRef.current || title),
    ).trim();
    return excerptFromMarkdown(sourceMarkdown);
  }, [summaryDialogOpen, title]);

  const summaryPreviewMarkdown =
    normalizeManualExcerpt(summaryEditorValue) || automaticExcerptPreview;
  const summaryCustomized =
    manualExcerptEnabled && Boolean(normalizeManualExcerpt(manualExcerpt));

  const openSummaryDialog = () => {
    closeLatexBlockEditor();
    setSummaryEditorValue(summaryCustomized ? manualExcerpt : '');
    setSummaryDialogOpen(true);
  };

  const closeSummaryDialog = () => {
    setSummaryDialogOpen(false);
    setSummaryEditorValue(summaryCustomized ? manualExcerpt : '');
  };

  const useAutomaticSummary = () => {
    setManualExcerpt('');
    setManualExcerptEnabled(false);
    setSummaryEditorValue('');
    setSummaryDialogOpen(false);
    markAutosaveChanged();
  };

  const saveSummaryDialog = () => {
    const nextExcerpt = normalizeManualExcerpt(summaryEditorValue);
    setManualExcerpt(nextExcerpt);
    setManualExcerptEnabled(Boolean(nextExcerpt));
    setSummaryEditorValue(nextExcerpt);
    setSummaryDialogOpen(false);
    markAutosaveChanged();
  };

  const changeTitle = (value: string) => {
    closeLatexBlockEditor();
    titleRef.current = value;
    setTitle(value);
    if (!editorReady || !editorRef.current) return;
    const nextMarkdown = markdownWithTitle(markdownRef.current, value);
    if (nextMarkdown === markdownRef.current) return;
    syncingTitleRef.current = true;
    markdownRef.current = nextMarkdown;
    editorRef.current.editor.action(replaceAll(nextMarkdown, true));
    window.setTimeout(() => {
      syncingTitleRef.current = false;
    }, 0);
  };

  const changeCover = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setError('');
    setStatus(null);
    if (!file.type.startsWith('image/')) {
      setError(t('markdownWriter.validation.imageOnly'));
      return;
    }
    if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    setPendingCoverCrop({
      imageUrl: URL.createObjectURL(file),
      fileName: file.name || 'markdown-cover.jpg',
    });
  };

  const closeCoverCrop = () => {
    if (coverUploading) return;
    if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    setPendingCoverCrop(null);
  };

  const uploadCroppedCover = async (file: File) => {
    if (!user || !pendingCoverCrop) return;
    setCoverUploading(true);
    setError('');
    setStatus({ key: 'markdownWriter.status.coverUploading' });
    try {
      const uploaded = demoMode && bootstrap
        ? { fileID: (await bootstrap.ports.uploads.upload({ name: file.name, type: file.type, bytes: file })).url }
        : await uploadCoverFile(user, file);
      setCoverUrl(uploaded.fileID);
      setStatus({ key: 'markdownWriter.status.coverUploaded' });
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    } catch (uploadError) {
      setError(localizedErrorMessage(uploadError, 'creation.markdownCoverUploadFailed'));
      setStatus(null);
    } finally {
      setCoverUploading(false);
    }
  };

  const waitForMarkdownRender = async (initial: MarkdownRenderJob) => {
    let current = initial;
    let lastQueue = initial.queue;
    activeRenderJobIDRef.current = initial.jobId;
    setRenderJob(current);
    while (current.state === 'queued' || current.state === 'running') {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1000);
      });
      const next = await loadMarkdownRenderJob(current.jobId);
      lastQueue = next.queue || lastQueue;
      current = next.queue || !lastQueue ? next : { ...next, queue: lastQueue };
      setRenderJob(current);
    }
    activeRenderJobIDRef.current = '';
    if (current.state !== 'succeeded') {
      throw new Error(`Markdown render ended with state: ${current.state}`);
    }
    return current;
  };

  const cancelActiveMarkdownRender = async () => {
    const jobId = activeRenderJobIDRef.current || renderJob?.jobId || '';
    if (!jobId || (renderJob?.state !== 'queued' && renderJob?.state !== 'running')) return;
    setRenderCanceling(true);
    try {
      const canceled = await cancelMarkdownRenderJob(jobId);
      setRenderJob((current) => ({ ...canceled, queue: canceled.queue || current?.queue }));
      setStatus({ key: 'markdownWriter.status.renderCancelRequested' });
    } catch (cancelError) {
      setError(localizedErrorMessage(cancelError, 'creation.markdownRenderCancelFailed'));
    } finally {
      setRenderCanceling(false);
    }
  };

  const saveArticle = async () => {
    closeLatexBlockEditor();
    if (!user) {
      setError(t('markdownWriter.validation.signIn'));
      return;
    }
    setSavingMode(pageState);
    setError('');
    setStatus(null);
    try {
      const sourceMarkdown = normalizeMarkdownWhitespaceEntities(
        ensureQuiverImageComments(
          markdownWithTitle(markdownRef.current, title),
          window.location.origin,
        ),
      ).trim();
      markdownRef.current = sourceMarkdown;
      let renderJobId = '';
      if (pageState === 'published' && !demoMode) {
        const submission = await submitMarkdownRenderJob(
          sourceMarkdown,
          title.trim(),
          editPost?.slug || editPost?.id || '',
        );
        if (submission.enabled) {
          const submittedJob = submission.job.queue
            ? submission.job
            : { ...submission.job, queue: submission.queue };
          setStatus({
            key: `markdownWriter.status.${submission.reused ? 'renderReused' : 'renderQueued'}`,
          });
          const completed = await waitForMarkdownRender(submittedJob);
          renderJobId = completed.jobId;
          setStatus({ key: 'markdownWriter.status.renderComplete' });
        } else {
          setRenderJob(null);
          activeRenderJobIDRef.current = '';
          setStatus({ key: 'markdownWriter.status.compatibilitySave' });
        }
      } else {
        setRenderJob(null);
        activeRenderJobIDRef.current = '';
      }
      const sourceFile = demoMode ? null : await uploadMarkdownSource(sourceMarkdown, title);
      const tagList = splitTagValues(tags).slice(0, 6);
      const creatingPost = !editPost;
      const savedStatus = contentStatusForControls(pageState, sourceVisibility);
      const savedExcerpt = manualExcerptEnabled ? normalizeManualExcerpt(manualExcerpt) : '';
      const input: CreateContentInput = {
        type: 'blog',
        status: savedStatus,
        repositoryStatus: pageState,
        sourceVisibility,
        editor: 'markdown',
        title: title.trim(),
        body: bodyFromMarkdownSource(sourceMarkdown, sourceFile),
        excerpt: savedExcerpt || excerptFromMarkdown(sourceMarkdown),
        tags: tagList,
        coverUrl,
        markdownSource: sourceFile,
        renderJobId: renderJobId || undefined,
      };
      const saved = editPost
        ? await updateContent(editPost.slug || editPost.id, input)
        : await createContent(input);
      if (isContentModerationSubmission(saved)) {
        setStatus({
          key: `publishDialog.create.moderation.${saved.state === 'rejected'
            ? 'rejected'
            : saved.state === 'published'
              ? 'published'
              : 'pending'}`,
        });
        return;
      }
      await clearAutosave();
      setEditPost(saved);
      setPageState(pageStateForPost(saved));
      setSourceVisibility(sourceVisibilityForPost(saved));
	  if (saved.publicationPending) {
		setStatus({ key: 'markdownWriter.status.activationPending' });
		return;
	  }
      if (pageState === 'draft') {
        setStatus({ key: 'markdownWriter.status.draftSaved' });
        navigate(`/write/markdown?edit=${encodeURIComponent(saved.slug || saved.id)}`, {
          replace: true,
        });
      } else {
        if (creatingPost && worksFolderId) {
          await moveWorkItem({ postId: saved.id, folderId: worksFolderId });
        }
        setStatus({
          key: sourceVisibility === 'open'
            ? 'markdownWriter.status.published'
            : 'markdownWriter.status.privatePublished',
          values: { title: saved.title },
        });
        navigate(contentPath('blog', saved.id, saved.title));
      }
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, 'creation.markdownSaveFailed'));
    } finally {
      setSavingMode('');
    }
  };

  return (
    <>
      <Helmet title={t('markdownWriter.documentTitle')} />
      <SiteTopbar />
      <main className={`writer-shell markdown-writer-shell${demoMode ? ' demo-creation-writer-shell' : ''}`}>
        {demoMode ? (
          <Alert className="demo-creation-capability-note" role="status">
            {t('demoCapabilities.notice')}
          </Alert>
        ) : null}
        <div className="writer-publish-bar markdown-writer-publish-bar">
          <Form.Group className="writer-title-field" controlId="markdown-title">
            <Form.Label>{t('markdownWriter.labels.title')}</Form.Label>
            <Form.Control
              value={title}
              placeholder={titlePlaceholder}
              onChange={(event) => changeTitle(event.currentTarget.value)}
            />
          </Form.Group>
          <Form.Group className="writer-tags-field" controlId="markdown-tags">
            <Form.Label>{t('markdownWriter.labels.tags')}</Form.Label>
            <div className="writer-tags-control">
              <TagPicker
                value={splitTagValues(tags).slice(0, 6)}
                onChange={(next) => setTags(joinTagValues(next))}
                disabled={!user || Boolean(savingMode)}
                ariaLabel={t('markdownWriter.labels.tags')}
              />
              <AnimateButton unstyled
                type="button"
                className={summaryCustomized ? 'writer-summary-button active' : 'writer-summary-button'}
                disabled={!user || Boolean(savingMode) || loadingEdit}
                onClick={openSummaryDialog}
              >
                <Icon name="card-text" />
                <span>{t('markdownWriter.labels.summary')}</span>
              </AnimateButton>
            </div>
          </Form.Group>
          <Form.Group className="writer-cover-field" controlId="markdown-cover">
            <Form.Label>{t('markdownWriter.labels.cover')}</Form.Label>
            <div className="writer-cover-control">
              {coverUrl ? <img src={coverUrl} alt="" /> : <span>16:9</span>}
              <label className="writer-cover-upload-button" htmlFor="markdown-cover">
                <Icon name="image" />
                <span>{t(`markdownWriter.actions.${coverUrl ? 'change' : 'upload'}`)}</span>
                <Form.Control
                  id="markdown-cover"
                  type="file"
                  accept="image/*"
                  disabled={!user || coverUploading}
                  onChange={changeCover}
                />
              </label>
              {coverUrl ? (
                <AnimateButton unstyled
                  type="button"
                  className="writer-cover-remove-button"
                  disabled={coverUploading}
                  onClick={() => setCoverUrl('')}
                >
                  {t('markdownWriter.actions.remove')}
                </AnimateButton>
              ) : null}
            </div>
          </Form.Group>
          <div className="writer-topbar-actions">
            <div className="markdown-status-controls" aria-label={t('markdownWriter.controls.saveState')}>
              <label className="markdown-status-select-label">
                <span>{t('markdownWriter.labels.source')}</span>
                <Form.Select
                  className="markdown-status-select"
                  size="sm"
                  value={sourceVisibility}
                  disabled={Boolean(savingMode) || loadingEdit}
                  aria-label={t('markdownWriter.controls.sourceVisibility')}
                  onChange={(event) => {
                    const nextVisibility =
                      event.currentTarget.value === 'private' ? 'private' : 'open';
                    setSourceVisibility(nextVisibility);
                  }}
                >
                  <option value="open">{t('markdownWriter.visibility.open')}</option>
                  <option value="private">{t('markdownWriter.visibility.private')}</option>
                </Form.Select>
              </label>
              <label className="markdown-status-select-label">
                <span>{t('markdownWriter.labels.page')}</span>
                <Form.Select
                  className="markdown-status-select"
                  size="sm"
                  value={pageState}
                  disabled={Boolean(savingMode) || loadingEdit}
                  aria-label={t('markdownWriter.controls.pageState')}
                  onChange={(event) => {
                    const nextPageState =
                      event.currentTarget.value === 'draft' ? 'draft' : 'published';
                    setPageState(nextPageState);
                  }}
                >
                  <option value="published">{t('markdownWriter.pageState.published')}</option>
                  <option value="draft">{t('markdownWriter.pageState.draft')}</option>
                </Form.Select>
              </label>
            </div>
            <Button
              className="primary-button writer-save-button"
              type="button"
              disabled={!canSave}
              onClick={() => void saveArticle()}
            >
              {savingMode ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  {t('markdownWriter.actions.saving')}
                </>
              ) : (
                t('markdownWriter.actions.save')
              )}
            </Button>
          </div>
          {renderJob ? (
            <section className="markdown-render-progress" aria-live="polite" aria-label={t('markdownWriter.render.aria')}>
              <div className="markdown-render-progress-main">
                <strong>{markdownRenderStateKey(renderJob) ? t(markdownRenderStateKey(renderJob)) : renderJob.state}</strong>
                {markdownRenderStageKey(renderJob.stage) ? (
                  <span>{t(markdownRenderStageKey(renderJob.stage))}</span>
                ) : null}
                {renderJob.queue ? (
                  <span>
                    {t('markdownWriter.render.queue', {
                      count: renderJob.queue.queuedProjects,
                      displayCount: formatNumber(locale, renderJob.queue.queuedProjects),
                    })}
                    {renderJob.state === 'queued'
                      ? ` · ${t('markdownWriter.render.ahead', {
                          count: renderJob.queue.jobsAheadEstimate,
                          displayCount: formatNumber(locale, renderJob.queue.jobsAheadEstimate),
                        })}`
                      : ` · ${t('markdownWriter.render.active', {
                          count: renderJob.queue.activeProjects,
                          displayCount: formatNumber(locale, renderJob.queue.activeProjects),
                        })}`}
                  </span>
                ) : null}
                {markdownRenderETARange(renderJob, locale) ? (
                  <span>{t('markdownWriter.render.eta', { range: markdownRenderETARange(renderJob, locale) })}</span>
                ) : null}
              </div>
              {renderJob.state === 'queued' || renderJob.state === 'running' ? (
                <Button
                  className="secondary-button markdown-render-cancel"
                  size="sm"
                  type="button"
                  disabled={renderCanceling || renderJob.cancelRequested}
                  onClick={() => void cancelActiveMarkdownRender()}
                >
                  {t(`markdownWriter.render.${renderCanceling || renderJob.cancelRequested ? 'canceling' : 'cancel'}`)}
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
        <section className="writer-frame markdown-writer-frame" aria-label={t('markdownWriter.editor')}>
          {!editorReady ? (
            <LoadingState variant="strip" />
          ) : null}
          <div ref={hostRef} className="milkdown-editor-host" />
        </section>
        <Modal
          show={summaryDialogOpen}
          onHide={closeSummaryDialog}
          size="lg"
          centered
          dialogClassName="markdown-summary-dialog"
        >
          <Modal.Header closeButton>
            <Modal.Title>{t('markdownWriter.labels.summary')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="markdown-summary-stack">
              <section className="markdown-summary-panel" aria-label={t('markdownWriter.summary.edit')}>
                <div className="markdown-summary-panel-head">
                  <span>{t('markdownWriter.actions.edit')}</span>
                </div>
                <CodeMirrorEditor
                  id="markdown-summary"
                  value={summaryEditorValue}
                  minHeight="168px"
                  placeholder={t('markdownWriter.placeholders.summary')}
                  ariaLabel={t('markdownWriter.labels.summary')}
                  submitOnEnter={false}
                  onChange={setSummaryEditorValue}
                />
              </section>
              <section className="markdown-summary-panel" aria-label={t('markdownWriter.summary.preview')}>
                <div className="markdown-summary-panel-head">
                  <span>{t('markdownWriter.actions.preview')}</span>
                </div>
                <MilkdownMarkdownArticle
                  markdown={summaryPreviewMarkdown}
                  className="markdown-summary-preview"
                  emptyFallback={t('markdownWriter.summary.emptyPreview')}
                />
              </section>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button className="secondary-link" type="button" onClick={useAutomaticSummary}>
              {t('markdownWriter.actions.useDefault')}
            </Button>
            <Button className="secondary-link" type="button" onClick={closeSummaryDialog}>
              {t('markdownWriter.actions.cancel')}
            </Button>
            <Button className="primary-button" type="button" onClick={saveSummaryDialog}>
              {t('markdownWriter.actions.save')}
            </Button>
          </Modal.Footer>
        </Modal>
        {pendingCoverCrop ? (
          <ImageCropDialog
            open
            imageUrl={pendingCoverCrop.imageUrl}
            title={t('markdownWriter.coverCrop')}
            aspect={16 / 9}
            cropShape="rect"
            outputWidth={1600}
            outputHeight={900}
            outputFileName={pendingCoverCrop.fileName}
            busy={coverUploading}
            onCancel={closeCoverCrop}
            onConfirm={uploadCroppedCover}
          />
        ) : null}
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
              ariaLabel={t('markdownWriter.math.blockEditor')}
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
              {t('markdownWriter.actions.done')}
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
            aria-label={t('markdownWriter.quiver.editor')}
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
                <span>{t('markdownWriter.quiver.help')}</span>
              </div>
              <div className="rin-quiver-dialog-actions">
                <AnimateButton unstyled type="button" onClick={closeQuiverDialog}>
                  {t('markdownWriter.actions.cancel')}
                </AnimateButton>
                <AnimateButton unstyled
                  type="button"
                  className="primary"
                  disabled={quiverPending || !quiverFrameReady}
                  onClick={requestQuiverTikzcd}
                >
                  {t(`markdownWriter.quiver.${quiverPending ? 'exporting' : quiverFrameReady ? 'insert' : 'loading'}`)}
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
      </main>
    </>
  );
}
