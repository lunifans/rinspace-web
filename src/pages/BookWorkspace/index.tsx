import { Icon, AnimateButton, useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { RuntimeHelmet as Helmet } from '@/components/RuntimeHelmet';
import { Link, useParams } from 'react-router-dom';

import { useOptionalBootstrap } from '@/app/bootstrap/context';
import { MathInline } from '@/components/MathText';
import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import BookProfileDialog from '@/features/publish/BookProfileDialog';
import { formatNumber } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadContentDetail, updateContent } from '@/services/domains/article';
import { loadBookImportJob, startBookImportJob, openBookCodeWorkspace } from '@/services/domains/book';
import type { BookImportJob, BookMetadata, BookTOCItem, PostDetail } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { type CloudUser } from '@/services/phoneAuth';
import { getCurrentUser } from '@/services/profile';
import {
  buildBookProjectIndex,
  importBookProjectArchive,
  rinArchiveFromBody,
  type BookMatter,
  type BookProjectIndex,
} from '@/utils/bookProject';
import {
  addMarkdownBookFile,
  addMarkdownBookSection,
  bodyFromMarkdownBookProject,
  markdownBookExcerpt,
  markdownBookProjectFromBody,
  moveMarkdownBookFileNear,
  type MarkdownBookProject,
} from '@/utils/markdownBook';
import {
  bookReadingPath,
  bookWorkspacePath,
  contentPath,
} from '@/utils/routes';

type WorkspaceChapter = {
  id: string;
  title: string;
  source: 'reader' | 'toc' | 'source';
  page?: number;
  path?: string;
  command?: string;
  matter?: BookMatter;
  line?: number;
  level?: number;
  fileNode?: boolean;
};

type WorkspaceMatter = 'front' | 'main' | 'back';
type DropTarget = {
  path: string;
  placement: 'before' | 'after';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sameUserId(
  left: string | undefined | null,
  right: string | undefined | null,
) {
  const normalizedLeft = (left || '').trim().toLowerCase();
  const normalizedRight = (right || '').trim().toLowerCase();
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  );
}

function extractMarkedSection(body: string, marker: string) {
  const startMarker = `[[${marker}]]`;
  const endMarker = `[[/${marker}]]`;
  const start = body.indexOf(startMarker);
  if (start < 0) return '';
  const end = body.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return '';
  return body.slice(start + startMarker.length, end).trim();
}

function stripLatexTitle(value: string) {
  return value
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function chapterSlug(value: string, fallback: string) {
  const slug = value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function tocChapterKey(index: number, item: BookTOCItem) {
  const page =
    typeof item.page === 'number' && Number.isFinite(item.page)
      ? Math.max(0, Math.trunc(item.page))
      : 0;
  return `toc-${String(index + 1).padStart(3, '0')}-p${page}-${chapterSlug(item.title, 'chapter')}`;
}

function readerChapters(body: string): WorkspaceChapter[] {
  const raw = extractMarkedSection(body, 'RIN_READER');
  if (!raw) return [];
  try {
    const payload: unknown = JSON.parse(raw);
    if (!isRecord(payload) || !Array.isArray(payload.toc)) return [];
    const chapters = payload.toc
      .map((item): WorkspaceChapter | null => {
        if (!isRecord(item)) return null;
        if (typeof item.id !== 'string' || typeof item.text !== 'string')
          return null;
        const level = typeof item.level === 'number' ? item.level : 2;
        if (level !== 2) return null;
        return {
          id: item.id,
          title: item.text,
          source: 'reader',
        };
      })
      .filter((item): item is WorkspaceChapter => item !== null);
    if (chapters.length) return chapters;
    if (!Array.isArray(payload.pages)) return [];
    return payload.pages
      .map((item): WorkspaceChapter | null => {
        if (!isRecord(item)) return null;
        if (typeof item.id !== 'string' || typeof item.text !== 'string')
          return null;
        return {
          id: item.id,
          title: item.text,
          source: 'reader',
        };
      })
      .filter((item): item is WorkspaceChapter => item !== null);
  } catch {
    return [];
  }
}

function tocChapters(toc: BookTOCItem[] | undefined): WorkspaceChapter[] {
  if (!toc?.length) return [];
  const normalized = toc.map((item) => ({
    item,
    level: Math.max(1, Math.trunc(item.level || 1) || 1),
  }));
  const rootLevel = Math.min(...normalized.map((entry) => entry.level));
  return normalized
    .map((entry, index): WorkspaceChapter | null => {
      if (entry.level !== rootLevel) return null;
      return {
        id: tocChapterKey(index, entry.item),
        title: entry.item.title,
        page: entry.item.page,
        source: 'toc',
      };
    })
    .filter((item): item is WorkspaceChapter => item !== null);
}

function sourceCommandChapters(source: string, command: 'chapter' | 'section') {
  const chapters: WorkspaceChapter[] = [];
  const pattern =
    command === 'chapter'
      ? /\\chapter\*?(?:\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
      : /\\section\*?(?:\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const title =
      stripLatexTitle(match[1] || '') || `Chapter ${chapters.length + 1}`;
    chapters.push({
      id: `source-${command}-${String(chapters.length + 1).padStart(3, '0')}-${chapterSlug(title, 'chapter')}`,
      title,
      source: 'source',
    });
  }
  return chapters;
}

function sourceChapters(body: string): WorkspaceChapter[] {
  const source = extractMarkedSection(body, 'RIN_SOURCE');
  if (!source) return [];
  const chapters = sourceCommandChapters(source, 'chapter');
  return chapters.length ? chapters : sourceCommandChapters(source, 'section');
}

function workspaceChapters(post: PostDetail | null): WorkspaceChapter[] {
  if (!post) return [];
  const fromReader = readerChapters(post.body);
  if (fromReader.length) return fromReader;
  const fromToc = tocChapters(post.book?.toc);
  if (fromToc.length) return fromToc;
  return sourceChapters(post.body);
}

function projectIndexChapters(
  index: BookProjectIndex | null,
): WorkspaceChapter[] {
  if (!index) return [];
  return index.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    source: 'source',
    path: node.path,
    command: node.command,
    matter: node.matter,
    line: node.line,
    level: node.level,
    fileNode: node.fileNode,
  }));
}

function hasReaderPayload(post: PostDetail | null) {
  return Boolean(post && extractMarkedSection(post.body, 'RIN_READER'));
}

function groupChapters(chapters: WorkspaceChapter[]) {
  const groups: Array<{
    key: WorkspaceMatter;
    items: WorkspaceChapter[];
  }> = [
    { key: 'front', items: [] },
    { key: 'main', items: [] },
    { key: 'back', items: [] },
  ];
  chapters.forEach((chapter) => {
    const matter: WorkspaceMatter =
      chapter.matter === 'front'
        ? 'front'
        : chapter.matter === 'back' || chapter.matter === 'appendix'
          ? 'back'
          : 'main';
    const group = groups.find((item) => item.key === matter);
    group?.items.push(chapter);
  });
  return groups;
}

export default function BookWorkspacePage() {
  const { postId = '' } = useParams();
  const bootstrap = useOptionalBootstrap();
  const { t, i18n } = useFeatureTranslation('creation');
  const demoMode = bootstrap?.config.mode === 'demo';
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [currentUser, setCurrentUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectIndex, setProjectIndex] = useState<BookProjectIndex | null>(
    null,
  );
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectNotice, setProjectNotice] = useState('');
  const [codeWorkspaceOpening, setCodeWorkspaceOpening] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [importJob, setImportJob] = useState<BookImportJob | null>(null);
  const [activeImportJobID, setActiveImportJobID] = useState('');
  const [markdownProject, setMarkdownProject] =
    useState<MarkdownBookProject | null>(null);
  const [newMarkdownPageTitle, setNewMarkdownPageTitle] = useState('');
  const [newMarkdownSectionTitles, setNewMarkdownSectionTitles] = useState<
    Record<string, string>
  >({});
  const [dragChapterPath, setDragChapterPath] = useState('');
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragChapterPathRef = useRef('');
  const importJobStorageKey = useMemo(
    () => `rinspace-book-import-job:${postId}`,
    [postId],
  );

  useNoticeToasts({
    error, projectError, projectNotice,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void Promise.all([
      loadContentDetail(postId),
      getCurrentUser().catch(() => null),
    ])
      .then(([detail, user]) => {
        if (cancelled) return;
        setPost(detail);
        setCurrentUser(user);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(messageFromError(loadError, 'creation.bookWorkspaceLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    let cancelled = false;
    setProjectIndex(null);
    setProjectError('');
    setProjectNotice('');
    if (!post || post.type !== 'book' || post.book?.kind !== 'original') {
      setProjectLoading(false);
      return undefined;
    }
    const archive = rinArchiveFromBody(post.body);
    if (!archive) {
      setProjectLoading(false);
      return undefined;
    }
    setProjectLoading(true);
    void importBookProjectArchive(archive)
      .then((loadedProject) => {
        if (!cancelled) {
          setProjectIndex(buildBookProjectIndex(loadedProject));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setProjectError(messageFromError(loadError, 'creation.bookProjectLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post]);

  useEffect(() => {
    if (!post || post.type !== 'book' || post.book?.kind !== 'markdown') {
      setMarkdownProject(null);
      return;
    }
    const nextProject = markdownBookProjectFromBody(
      post.body,
      post.book.bookTitle || post.title,
    );
    setMarkdownProject(nextProject);
  }, [post]);

  useEffect(() => {
    if (demoMode) {
      window.localStorage.removeItem(importJobStorageKey);
      setActiveImportJobID('');
      setImportJob(null);
      return;
    }
    const savedJobID = window.localStorage.getItem(importJobStorageKey) || '';
    setActiveImportJobID(savedJobID);
    setImportJob(null);
  }, [demoMode, importJobStorageKey]);

  const chapters = useMemo(() => {
    const fromProject = projectIndexChapters(projectIndex);
    return fromProject.length ? fromProject : workspaceChapters(post);
  }, [post, projectIndex]);
  const chapterGroups = useMemo(() => groupChapters(chapters), [chapters]);
  const title = post?.book?.bookTitle || post?.title || t('bookWorkspace.fallbackTitle');
  const overviewPath = post ? contentPath('book', post.id, title) : '/books';
  const readerPath = post ? bookReadingPath(post.id, title) : '/books';
  const editRef = encodeURIComponent(post?.slug || post?.id || postId);
  const profileEditPath = `/books/${editRef}/edit`;
  const canEdit = Boolean(
    post &&
    post.type === 'book' &&
    (post.book?.kind === 'original' || post.book?.kind === 'markdown') &&
    sameUserId(currentUser?.id, post.authorUid || post.authorId),
  );
  const importJobInProgress =
    Boolean(activeImportJobID) &&
    (!importJob ||
      importJob.status === 'queued' ||
      importJob.status === 'running');
  const readerReady = hasReaderPayload(post);
  const markdownReaderReady = Boolean(
    post?.book?.kind === 'markdown' &&
    extractMarkedSection(post.body, 'RIN_MARKDOWN_BOOK'),
  );
  const publishStatusKey = post?.publishStatus === 'draft'
    ? 'draft'
    : post?.publishStatus === 'private'
      ? 'private'
      : 'published';
  const countLabel = (
    kind: 'page' | 'file' | 'chapter' | 'node',
    count: number,
  ) => t(`bookWorkspace.counts.${kind}`, {
    count,
    displayCount: formatNumber(locale, count),
  });

  useEffect(() => {
    if (demoMode || !activeImportJobID || !post || !canEdit) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const slug = post.slug || post.id;
    const poll = () => {
      void loadBookImportJob(slug, activeImportJobID)
        .then((job) => {
          if (cancelled) return;
          setImportJob(job);
          if (job.status === 'succeeded') {
            window.localStorage.removeItem(importJobStorageKey);
            setActiveImportJobID('');
            setProjectNotice(t('bookWorkspace.notices.renderPublished'));
            void loadContentDetail(slug)
              .then((detail) => {
                if (!cancelled) setPost(detail);
              })
              .catch((loadError) => {
                if (!cancelled) {
                  setProjectError(
                    messageFromError(loadError, 'creation.bookWorkspaceLoadFailed'),
                  );
                }
              });
            return;
          }
          if (job.status === 'failed') {
            window.localStorage.removeItem(importJobStorageKey);
            setActiveImportJobID('');
            console.error('Book import job failed', {
              jobId: job.id,
              detail: job.error,
            });
            setProjectError(
              messageFromError(null, 'creation.bookImportFailed'),
            );
            return;
          }
          timer = window.setTimeout(poll, 3500);
        })
        .catch((loadError) => {
          if (cancelled) return;
          setProjectError(
            messageFromError(loadError, 'creation.bookImportStatusFailed'),
          );
          timer = window.setTimeout(poll, 6000);
        });
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeImportJobID, canEdit, demoMode, importJobStorageKey, post, t]);
  const setActiveDragChapterPath = (path: string) => {
    dragChapterPathRef.current = path;
    setDragChapterPath(path);
  };
  const clearActiveDragChapterPath = () => {
    dragChapterPathRef.current = '';
    setDragChapterPath('');
    setDropTarget(null);
  };

  const saveMarkdownProject = async (
    nextProject: MarkdownBookProject,
    notice: string,
  ) => {
    if (!post || !canEdit) return false;
    setProjectSaving(true);
    setProjectError('');
    setProjectNotice('');
    try {
      const book: BookMetadata = {
        ...(post.book || {
          kind: 'markdown',
          bookTitle: title,
          authors: [],
        }),
        kind: 'markdown',
        bookTitle: post.book?.bookTitle || post.title || title,
      };
      // Structural saves (chapter/section creation and reordering) do not
      // render: they persist the project as-is and keep the previous reader.
      const saved = await updateContent(post.slug || post.id, {
        type: 'book',
        status: post.publishStatus === 'draft' || post.publishStatus === 'private' ? post.publishStatus : 'published',
        editor: 'markdown',
        title: post.title,
        body: bodyFromMarkdownBookProject(nextProject),
        excerpt: post.excerpt || markdownBookExcerpt(nextProject),
        tags: post.tags || [],
        coverUrl: post.coverUrl || '',
        book,
      });
      setPost(saved);
      setMarkdownProject(nextProject);
      setProjectNotice(notice);
      return true;
    } catch (saveError) {
      setProjectError(
        messageFromError(saveError, 'creation.markdownStructureSaveFailed'),
      );
      return false;
    } finally {
      setProjectSaving(false);
    }
  };

  const createMarkdownPage = async () => {
    if (!markdownProject) return;
    const pageTitle = newMarkdownPageTitle.trim();
    if (!pageTitle) return;
    const nextProject = addMarkdownBookFile(markdownProject, pageTitle);
    setNewMarkdownPageTitle('');
    await saveMarkdownProject(
      nextProject,
      t('bookWorkspace.notices.chapterCreated', { title: pageTitle }),
    );
  };

  const setMarkdownSectionTitle = (parentId: string, value: string) => {
    setNewMarkdownSectionTitles((current) => ({
      ...current,
      [parentId]: value,
    }));
  };

  const createMarkdownSection = async (parentId: string) => {
    if (!markdownProject) return;
    const sectionTitle = (newMarkdownSectionTitles[parentId] || '').trim();
    if (!sectionTitle) return;
    const nextProject = addMarkdownBookSection(
      markdownProject,
      parentId,
      sectionTitle,
    );
    setMarkdownSectionTitle(parentId, '');
    await saveMarkdownProject(
      nextProject,
      t('bookWorkspace.notices.sectionCreated', { title: sectionTitle }),
    );
  };

  const reorderMarkdownFile = async (
    fromId: string,
    toId: string,
    placement: 'before' | 'after',
  ) => {
    if (!markdownProject || !fromId || !toId || fromId === toId) return;
    const previousProject = markdownProject;
    const nextProject = moveMarkdownBookFileNear(
      markdownProject,
      fromId,
      toId,
      placement,
    );
    if (nextProject === markdownProject) {
      clearActiveDragChapterPath();
      return;
    }
    setMarkdownProject(nextProject);
    const saved = await saveMarkdownProject(
      nextProject,
      t('bookWorkspace.notices.orderUpdated'),
    );
    if (!saved) setMarkdownProject(previousProject);
    clearActiveDragChapterPath();
  };

  const publishWholeProject = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !post || !canEdit) return;
    if (demoMode) {
      setProjectError(t('bookWorkspace.capabilities.rendererUnavailable'));
      setProjectNotice('');
      return;
    }
    setProjectSaving(true);
    setError('');
    setProjectError('');
    setProjectNotice('');
    try {
      const slug = post.slug || post.id;
      const job = await startBookImportJob(slug, file);
      setImportJob(job);
      setActiveImportJobID(job.id);
      window.localStorage.setItem(importJobStorageKey, job.id);
      setProjectNotice(t('bookWorkspace.notices.renderSubmitted'));
    } catch (publishError) {
      setProjectError(messageFromError(publishError, 'creation.bookImportFailed'));
    } finally {
      setProjectSaving(false);
    }
  };

  const openCodeWorkspace = async () => {
    if (!post || !canEdit || codeWorkspaceOpening) return;
    setProjectError('');
    setProjectNotice('');
    setCodeWorkspaceOpening(true);
    try {
      if (demoMode && bootstrap) {
        await bootstrap.ports.workspace.open({ projectId: post.slug || post.id || postId });
        return;
      }
      const workspace = await openBookCodeWorkspace(
        post.slug || post.id || postId,
      );
      window.location.assign(workspace.url);
    } catch (openError) {
      setProjectError(
        messageFromError(openError, 'creation.bookWorkspaceOpenFailed'),
      );
      setCodeWorkspaceOpening(false);
    }
  };

  return (
    <>
      <Helmet title={t('bookWorkspace.documentTitle', { title })} />
      <SiteTopbar />
      <main className="book-workspace-page">
        {loading ? <LoadingState variant="strip" /> : null}
        {demoMode ? (
          <Alert className="notice warning" data-rin-demo-book-boundary="true">
            {t('bookWorkspace.capabilities.demoBoundary')}
          </Alert>
        ) : null}
        {!loading && post && post.type !== 'book' ? (
          <Alert className="notice danger">{t('bookWorkspace.notBook')}</Alert>
        ) : null}
        {!loading &&
        post?.type === 'book' &&
        post.book?.kind !== 'original' &&
        post.book?.kind !== 'markdown' ? (
          <Alert className="notice warning">
            {t('bookWorkspace.externalBookManagement')}
            <Link to={profileEditPath}>{t('bookWorkspace.editBookProfile')}</Link>
          </Alert>
        ) : null}
        {!loading && post?.type === 'book' && post.book?.kind === 'markdown' ? (
          <>
            <section className="book-workspace-hero">
              <div className="book-workspace-cover">
                {post.coverUrl ? (
                  <img src={post.coverUrl} alt="" />
                ) : (
                  <Icon name="markdown" />
                )}
              </div>
              <div className="book-workspace-identity">
                <span className="eyebrow">{t('bookWorkspace.markdownWorkspace')}</span>
                <h1>
                  <MathInline text={title} />
                </h1>
                <p>
                  <MathInline
                    text={post.excerpt || t('bookWorkspace.defaultMarkdownExcerpt')}
                  />
                </p>
                <div className="book-workspace-meta">
                  <span>{t(`bookWorkspace.publishStatus.${publishStatusKey}`)}</span>
                  <span>{post.author}</span>
                  <span>{countLabel('page', markdownProject?.files.length || 0)}</span>
                  <span>
                    {markdownReaderReady
                      ? t('bookWorkspace.reader.generated')
                      : t('bookWorkspace.reader.notGenerated')}
                  </span>
                </div>
              </div>
              <div
                className="book-workspace-actions"
                aria-label={t('bookWorkspace.actions.label')}
              >
                <Link to={overviewPath}>
                  <Icon name="layout-text-sidebar-reverse" />
                  {t('bookWorkspace.actions.ratingPage')}
                </Link>
                {markdownReaderReady ? (
                  <Link to={readerPath}>
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPage')}
                  </Link>
                ) : (
                  <span className="disabled-action">
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPending')}
                  </span>
                )}
                {canEdit ? (
                  <AnimateButton
                    unstyled
                    className="primary-workspace-action"
                    type="button"
                    onClick={() => setProfileDialogOpen(true)}
                  >
                    <Icon name="card-text" />
                    {t('bookWorkspace.actions.editProfile')}
                  </AnimateButton>
                ) : (
                  <span className="disabled-action">
                    <Icon name="lock" />
                    {t('bookWorkspace.actions.authorOnly')}
                  </span>
                )}
              </div>
            </section>

            <section className="book-workspace-layout reader-only">
              <article className="book-workspace-panel book-workspace-chapters">
                <div className="panel-heading">
                  <span>{t('bookWorkspace.markdown.chapters')}</span>
                  <strong>
                    {countLabel('file', markdownProject?.files.length || 0)}
                  </strong>
                </div>
                
                
                {canEdit ? (
                  <div className="book-workspace-section-heading">
                    <strong>{t('bookWorkspace.markdown.newChapter')}</strong>
                    <div className="book-workspace-section-tools">
                      <input
                        value={newMarkdownPageTitle}
                        aria-label={t('bookWorkspace.markdown.newChapterTitle')}
                        disabled={projectSaving}
                        onChange={(event) =>
                          setNewMarkdownPageTitle(event.currentTarget.value)
                        }
                      />
                      <AnimateButton unstyled
                        type="button"
                        disabled={projectSaving || !newMarkdownPageTitle.trim()}
                        onClick={() => void createMarkdownPage()}
                      >
                        {t('bookWorkspace.markdown.createChapter')}
                      </AnimateButton>
                    </div>
                  </div>
                ) : null}
                {markdownProject?.files.length ? (
                  <ol className="book-workspace-chapter-list">
                    {markdownProject.files.map((file, index) => {
                      const editPath = `${bookWorkspacePath(post.id)}/markdown/${encodeURIComponent(file.id)}`;
                      const activeDropTarget = dropTarget;
                      const dropClass =
                        activeDropTarget && activeDropTarget.path === file.id
                          ? ` drop-${activeDropTarget.placement}`
                          : '';
                      const indent = file.level === 3 ? 2 : 0;
                      return (
                        <li
                          key={file.id}
                          className={`book-workspace-node depth-${indent}${dragChapterPath === file.id ? ' is-dragging' : ''}${dropClass}`}
                          onDragOver={(event) => {
                            const activeDragId =
                              dragChapterPathRef.current || dragChapterPath;
                            if (!activeDragId || projectSaving) return;
                            const dragged = markdownProject.files.find(
                              (item) => item.id === activeDragId,
                            );
                            if (
                              !dragged ||
                              dragged.level !== file.level ||
                              (dragged.parentId || '') !== (file.parentId || '')
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            const placement =
                              event.clientY > rect.top + rect.height / 2
                                ? 'after'
                                : 'before';
                            setDropTarget({ path: file.id, placement });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (projectSaving) return;
                            const fromId =
                              event.dataTransfer.getData('text/plain') ||
                              dragChapterPathRef.current ||
                              dragChapterPath;
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            const placement =
                              event.clientY > rect.top + rect.height / 2
                                ? 'after'
                                : 'before';
                            void reorderMarkdownFile(
                              fromId,
                              file.id,
                              placement,
                            );
                          }}
                          onDragLeave={() => {
                            if (dropTarget?.path === file.id)
                              setDropTarget(null);
                          }}
                        >
                          <div className="book-workspace-node-main">
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <strong>
                              <MathInline text={file.title} />
                            </strong>
                            <em>
                              {file.level === 3
                                ? t('bookWorkspace.markdown.section')
                                : t('bookWorkspace.markdown.chapter')} · {file.path}
                            </em>
                          </div>
                          <div
                            className={`book-workspace-node-actions markdown-node-actions${file.level === 2 && canEdit ? ' has-inline-section' : ''}`}
                          >
                            {file.level === 2 && canEdit ? (
                              <div className="book-workspace-inline-section">
                                <input
                                  value={
                                    newMarkdownSectionTitles[file.id] || ''
                                  }
                                  aria-label={t('bookWorkspace.markdown.newSectionTitle', {
                                    title: file.title,
                                  })}
                                  disabled={projectSaving}
                                  onChange={(event) =>
                                    setMarkdownSectionTitle(
                                      file.id,
                                      event.currentTarget.value,
                                    )
                                  }
                                />
                                <AnimateButton unstyled
                                  type="button"
                                  disabled={
                                    projectSaving ||
                                    !(
                                      newMarkdownSectionTitles[file.id] || ''
                                    ).trim()
                                  }
                                  onClick={() =>
                                    void createMarkdownSection(file.id)
                                  }
                                >
                                  {t('bookWorkspace.markdown.createSection')}
                                </AnimateButton>
                              </div>
                            ) : null}
                            {canEdit ? (
                              <>
                                <AnimateButton unstyled
                                  className="book-workspace-drag-handle"
                                  type="button"
                                  draggable={!projectSaving}
                                  disabled={projectSaving}
                                  aria-label={t('bookWorkspace.markdown.reorder')}
                                  title={t('bookWorkspace.markdown.reorder')}
                                  onDragStart={(event) => {
                                    if (projectSaving) return;
                                    setActiveDragChapterPath(file.id);
                                    setDropTarget(null);
                                    event.dataTransfer.effectAllowed = 'move';
                                    event.dataTransfer.setData(
                                      'text/plain',
                                      file.id,
                                    );
                                  }}
                                  onDragEnd={clearActiveDragChapterPath}
                                >
                                  <Icon name="grip-vertical" />
                                </AnimateButton>
                                <Link to={editPath}>
                                  <Icon name="pencil-square" />
                                  {t('bookWorkspace.markdown.edit')}
                                </Link>
                              </>
                            ) : null}
                            <Link
                              to={`${readerPath}#${encodeURIComponent(file.id)}`}
                            >
                              <Icon name="book" />
                              {t('bookWorkspace.markdown.read')}
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="book-workspace-empty">
                    <strong>{t('bookWorkspace.markdown.empty')}</strong>
                  </div>
                )}
              </article>
            </section>
          </>
        ) : null}
        {!loading && post?.type === 'book' && post.book?.kind === 'original' ? (
          <>
            <section className="book-workspace-hero">
              <div className="book-workspace-cover">
                {post.coverUrl ? (
                  <img src={post.coverUrl} alt="" />
                ) : (
                  <Icon name="book" />
                )}
              </div>
              <div className="book-workspace-identity">
                <span className="eyebrow">{t('bookWorkspace.latexWorkspace')}</span>
                <h1>
                  <MathInline text={title} />
                </h1>
                <p>
                  <MathInline
                    text={post.excerpt || post.body || t('bookWorkspace.defaultBookExcerpt')}
                  />
                </p>
                <div className="book-workspace-meta">
                  <span>{t(`bookWorkspace.publishStatus.${publishStatusKey}`)}</span>
                  <span>{post.author}</span>
                  <span>
                    {chapters.length
                      ? countLabel('chapter', chapters.length)
                      : t('bookWorkspace.original.noChapters')}
                  </span>
                  <span>
                    {readerReady
                      ? t('bookWorkspace.reader.generated')
                      : t('bookWorkspace.reader.notGenerated')}
                  </span>
                </div>
              </div>
              <div
                className="book-workspace-actions"
                aria-label={t('bookWorkspace.actions.label')}
              >
                <Link to={overviewPath}>
                  <Icon name="layout-text-sidebar-reverse" />
                  {t('bookWorkspace.actions.ratingPage')}
                </Link>
                {readerReady ? (
                  <Link to={readerPath}>
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPage')}
                  </Link>
                ) : (
                  <span className="disabled-action">
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPending')}
                  </span>
                )}
                {canEdit ? (
                  <>
                    <AnimateButton
                      unstyled
                      className="primary-workspace-action"
                      type="button"
                      onClick={() => setProfileDialogOpen(true)}
                    >
                      <Icon name="card-text" />
                      {t('bookWorkspace.actions.editProfile')}
                    </AnimateButton>
                    <a
                      href="#repository"
                      className={`primary-workspace-action${codeWorkspaceOpening ? ' disabled-action' : ''}`}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!codeWorkspaceOpening) void openCodeWorkspace();
                      }}
                    >
                      <Icon name="git" />
                      {codeWorkspaceOpening
                        ? t('bookWorkspace.actions.openingRepository')
                        : t('bookWorkspace.actions.openRepository')}
                    </a>
                    <label
                      className={`primary-workspace-action book-workspace-import${demoMode || projectSaving || projectLoading || importJobInProgress ? ' disabled-action' : ''}`}
                    >
                      <Icon name="cloud-arrow-up" />
                      {demoMode
                        ? t('bookWorkspace.actions.rendererUnavailable')
                        : projectSaving
                        ? t('bookWorkspace.actions.uploading')
                        : importJobInProgress
                          ? t('bookWorkspace.actions.rendering')
                          : projectLoading
                            ? t('bookWorkspace.actions.loading')
                            : t('bookWorkspace.actions.importAndPublish')}
                      <input
                        type="file"
                        accept=".zip,.tar,.gz,.tgz,.tex,.ltx,application/zip,application/x-tar,application/gzip,text/x-tex,text/plain"
                        disabled={
                          demoMode || projectSaving || projectLoading || importJobInProgress
                        }
                        onChange={(event) =>
                          void publishWholeProject(event.currentTarget)
                        }
                      />
                    </label>
                  </>
                ) : (
                  <span className="disabled-action">
                    <Icon name="lock" />
                    {t('bookWorkspace.actions.authorOnly')}
                  </span>
                )}
              </div>
            </section>

            <section className="book-workspace-layout reader-only">
              <article className="book-workspace-panel book-workspace-chapters">
                <div className="panel-heading">
                  <span>{t('bookWorkspace.original.workspace')}</span>
                  <strong>
                    {projectLoading
                      ? t('bookWorkspace.original.indexing')
                      : chapters.length
                        ? countLabel('node', chapters.length)
                        : t('bookWorkspace.original.emptyDirectory')}
                  </strong>
                </div>
                
                {importJobInProgress ? (
                  <Alert className="notice success">
                    {t('bookWorkspace.original.renderingImport', {
                      filename: importJob?.filename || t('bookWorkspace.original.wholeBook'),
                    })}
                  </Alert>
                ) : null}
                
                {projectIndex?.diagnostics.length ? (
                  <div className="book-workspace-diagnostics">
                    {projectIndex.diagnostics.slice(0, 4).map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                ) : null}
                {chapterGroups.length ? (
                  <div className="book-workspace-section-groups">
                    {chapterGroups.map((group) => (
                      <section
                        className="book-workspace-section-group"
                        key={group.key}
                      >
                        <div className="book-workspace-section-heading">
                          <strong>{t(`bookWorkspace.matter.${group.key}`)}</strong>
                          <div className="book-workspace-section-tools">
                            <span>{countLabel('node', group.items.length)}</span>
                          </div>
                        </div>
                        {group.items.length ? (
                          <ol className="book-workspace-chapter-list">
                            {group.items.map((chapter, index) => {
                              const indent = Math.max(
                                0,
                                Math.min(4, chapter.level ?? 0),
                              );
                              return (
                                <li
                                  key={`${chapter.source}-${chapter.id}`}
                                  className={`book-workspace-node depth-${indent}`}
                                >
                                  <div className="book-workspace-node-main">
                                    <span>
                                      {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <strong>
                                      <MathInline text={chapter.title} />
                                    </strong>
                                    <em>
                                      {chapter.command
                                        ? `\\${chapter.command}`
                                        : chapter.source === 'reader'
                                          ? t('bookWorkspace.original.sources.reader')
                                          : chapter.source === 'toc'
                                            ? t('bookWorkspace.original.sources.toc')
                                            : t('bookWorkspace.original.sources.tex')}
                                      {chapter.path ? ` · ${chapter.path}` : ''}
                                      {chapter.page
                                        ? ` · p. ${chapter.page}`
                                        : ''}
                                      {chapter.fileNode === false
                                        ? ` · ${t('bookWorkspace.original.sources.sameFile')}`
                                        : ''}
                                    </em>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <div className="book-workspace-empty compact">
                            <strong>{t('bookWorkspace.original.emptyGroup')}</strong>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="book-workspace-empty">
                    <strong>{t('bookWorkspace.original.empty')}</strong>
                  </div>
                )}
              </article>
            </section>
          </>
        ) : null}
      </main>
      <BookProfileDialog
        open={profileDialogOpen}
        post={post}
        user={currentUser}
        onClose={() => setProfileDialogOpen(false)}
        onSaved={(saved) => setPost(saved)}
      />
    </>
  );
}
