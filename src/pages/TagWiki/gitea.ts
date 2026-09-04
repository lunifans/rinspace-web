import { contentTitleSlug } from '../../utils/routes';
import { giteaPath } from '../../utils/giteaPaths';

type SourceFileLike = {
  filename?: string | null;
};

type TagWikiGiteaTarget = string | {
  id?: string | number | null;
  tagId?: string | number | null;
  slug?: string | null;
  slugName?: string | null;
  name?: string | null;
  displayName?: string | null;
  wikiSourceFile?: SourceFileLike | null;
};

function cleanText(value: string | number | undefined | null) {
  return String(value || '').trim();
}

function sourceTopFolder(sourceFile: SourceFileLike | undefined | null) {
  const filename = cleanText(sourceFile?.filename);
  if (!filename) return '';
  const folder = filename.replace(/^\/+/, '').split('/')[0]?.trim() || '';
  if (!folder || folder === '.' || folder === '..') return '';
  return folder;
}

export function tagWikiGiteaFolder(target: TagWikiGiteaTarget) {
  if (typeof target === 'string') {
    return contentTitleSlug(target || 'tag');
  }
  const sourceFolder = sourceTopFolder(target.wikiSourceFile);
  if (sourceFolder) return sourceFolder;

  const tagId = cleanText(target.tagId) || cleanText(target.id);
  const slug = contentTitleSlug(
    target.slugName || target.slug || target.displayName || target.name || tagId || 'tag',
  );
  return tagId ? `${tagId}-${slug}` : slug;
}

export function tagWikiGiteaSourcePath(target: TagWikiGiteaTarget) {
  return giteaPath('rinspace', 'tags', 'src', 'branch', 'main', tagWikiGiteaFolder(target));
}

export function tagWikiGiteaHistoryPath(target: TagWikiGiteaTarget) {
  return giteaPath('rinspace', 'tags', 'commits', 'branch', 'main', tagWikiGiteaFolder(target));
}
