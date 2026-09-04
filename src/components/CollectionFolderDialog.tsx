import { Icon, AnimateButton} from 'components/ui';
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import { formatNumber } from '@/i18n/format';
import { useOptionalLanguage } from '@/i18n/LanguageProvider';
import { resolveLocale } from '@/i18n/resolveLocale';
import { createCollectionFolder, loadCollectionFolderPage } from '@/services/domains/identity';
import type { CollectionFolder } from '@/services/contracts';
import { messageFromError } from '@/services/errors';

type VisibleCollectionFolder = {
  folder: CollectionFolder;
  depth: number;
  path: string;
};

type CollectionFolderDialogProps = {
  open: boolean;
  title: string;
  currentFolderId?: string;
  initialFolderId?: string;
  confirmLabel: string;
  busy?: boolean;
  status?: string;
  error?: string;
  onClose: () => void;
  onConfirm: (folderId: string, folder?: CollectionFolder) => void | Promise<void>;
  onFoldersLoaded?: (folders: CollectionFolder[]) => void;
};

function folderSorter(left: CollectionFolder, right: CollectionFolder, locale: string) {
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
  if (left.position !== right.position) return left.position - right.position;
  return left.name.localeCompare(right.name, locale);
}

function isWorksCollectionFolder(folder: CollectionFolder) {
  return folder.scope === 'works' || folder.systemKind === 'works' || folder.systemKind === 'works-private';
}

function buildFolderPath(folder: CollectionFolder, folders: CollectionFolder[]) {
  const folderById = new Map(folders.map((item) => [item.id, item]));
  const chain: string[] = [folder.name];
  let parentId = folder.parentId;
  const seen = new Set([folder.id]);
  while (parentId && !seen.has(parentId)) {
    const parent = folderById.get(parentId);
    if (!parent) break;
    chain.unshift(parent.name);
    seen.add(parent.id);
    parentId = parent.parentId;
  }
  return chain.join(' / ');
}

function visibleFoldersFor(folders: CollectionFolder[], query: string, locale: string): VisibleCollectionFolder[] {
  const normalizedQuery = query.trim().toLowerCase();
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const childIdsByParent = new Map<string, string[]>();
  const rootIds: string[] = [];

  folders.forEach((folder) => {
    if (folder.parentId && folderById.has(folder.parentId)) {
      const siblings = childIdsByParent.get(folder.parentId) || [];
      siblings.push(folder.id);
      childIdsByParent.set(folder.parentId, siblings);
      return;
    }
    rootIds.push(folder.id);
  });

  rootIds.sort((leftId, rightId) => folderSorter(folderById.get(leftId)!, folderById.get(rightId)!, locale));
  childIdsByParent.forEach((ids) => {
    ids.sort((leftId, rightId) => folderSorter(folderById.get(leftId)!, folderById.get(rightId)!, locale));
  });

  const visibleIds = new Set<string>();
  if (normalizedQuery) {
    folders.forEach((folder) => {
      if (!buildFolderPath(folder, folders).toLowerCase().includes(normalizedQuery)) return;
      let current: CollectionFolder | undefined = folder;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        visibleIds.add(current.id);
        seen.add(current.id);
        current = current.parentId ? folderById.get(current.parentId) : undefined;
      }
    });
  }

  const flattened: VisibleCollectionFolder[] = [];
  const visit = (folderId: string, depth: number, stack: Set<string>) => {
    if (stack.has(folderId)) return;
    const folder = folderById.get(folderId);
    if (!folder) return;
    if (!normalizedQuery || visibleIds.has(folder.id)) {
      flattened.push({
        folder,
        depth,
        path: buildFolderPath(folder, folders),
      });
    }
    const nextStack = new Set(stack);
    nextStack.add(folderId);
    (childIdsByParent.get(folderId) || []).forEach((childId) => {
      visit(childId, depth + 1, nextStack);
    });
  };

  rootIds.forEach((folderId) => visit(folderId, 0, new Set()));
  return flattened;
}

function CollectionFolderDialog({
  open,
  title,
  currentFolderId = '',
  initialFolderId = '',
  confirmLabel,
  busy = false,
  status = '',
  error = '',
  onClose,
  onConfirm,
  onFoldersLoaded,
}: CollectionFolderDialogProps) {
  const { i18n, t } = useTranslation('common');
  const language = useOptionalLanguage();
  const locale = language?.resolvedLocale
    ?? resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [targetFolderId, setTargetFolderId] = useState('');
  const [query, setQuery] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [internalStatus, setInternalStatus] = useState('');
  const [internalError, setInternalError] = useState('');

  const reloadFolders = useCallback(async (preferredFolderId = '') => {
    setLoading(true);
    setInternalError('');
    try {
      const page = await loadCollectionFolderPage();
      const nextTargetId = preferredFolderId || currentFolderId || initialFolderId || page.defaultId || page.folders[0]?.id || '';
      const collectionFolders = page.folders.filter((folder) => !isWorksCollectionFolder(folder));
      setFolders(collectionFolders);
      setTargetFolderId(nextTargetId);
      onFoldersLoaded?.(collectionFolders);
    } catch (loadFailure) {
      setFolders([]);
      setTargetFolderId('');
      setInternalError(messageFromError(loadFailure, 'identity.profileCollectionLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, initialFolderId, onFoldersLoaded]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setNewFolderName('');
    setInternalStatus('');
    setInternalError('');
    setTargetFolderId(currentFolderId || initialFolderId || '');
    void reloadFolders(currentFolderId || initialFolderId);
  }, [currentFolderId, initialFolderId, open, reloadFolders]);

  const currentFolder = useMemo(
    () => (currentFolderId ? folders.find((folder) => folder.id === currentFolderId) : undefined),
    [currentFolderId, folders],
  );
  const targetFolder = useMemo(
    () => (targetFolderId ? folders.find((folder) => folder.id === targetFolderId) : undefined),
    [targetFolderId, folders],
  );
  const visibleFolders = useMemo(
    () => visibleFoldersFor(folders, query, locale),
    [folders, locale, query],
  );

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || createBusy) return;
    setCreateBusy(true);
    setInternalStatus('');
    setInternalError('');
    try {
      const parentId = folders.find((folder) => folder.isDefault)?.id;
      const created = await createCollectionFolder({ parentId, name });
      const page = await loadCollectionFolderPage();
      const collectionFolders = page.folders.filter((folder) => !isWorksCollectionFolder(folder));
      setFolders(collectionFolders);
      setTargetFolderId(created.id);
      setNewFolderName('');
      setQuery('');
      setInternalStatus(t('collection.created', { name: created.name }));
      onFoldersLoaded?.(collectionFolders);
    } catch (createFailure) {
      setInternalError(messageFromError(createFailure, 'identity.profileCollectionUpdateFailed'));
    } finally {
      setCreateBusy(false);
    }
  };

  if (!open) return null;

  const displayedStatus = status || internalStatus;
  const displayedError = error || internalError;

  return (
    <div
      className="detail-collection-dialog-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="detail-collection-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-collection-dialog-head">
          <strong>{title}</strong>
          <AnimateButton unstyled type="button" onClick={onClose} aria-label={t('collection.closeSelector')}>
            <Icon name="x-lg" />
          </AnimateButton>
        </div>
        <div className={`detail-collection-dialog-target${targetFolder ? '' : ' empty'}`}>
          <span>
            {currentFolder
              ? t('collection.current', { path: buildFolderPath(currentFolder, folders) })
              : t('collection.chooseLocation')}
          </span>
          <strong>
            {targetFolder
              ? t('collection.target', { path: buildFolderPath(targetFolder, folders) })
              : t('collection.chooseTarget')}
          </strong>
        </div>
        {displayedStatus ? (
          <div className="notice success">{displayedStatus}</div>
        ) : null}
        {displayedError ? (
          <div className="notice error">{displayedError}</div>
        ) : null}
        <div className="collection-create-inline">
          <Icon name="folder-plus" />
          <input
            aria-label={t('collection.newName')}
            placeholder={t('collection.newPlaceholder')}
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void createFolder();
              }
            }}
          />
          <AnimateButton unstyled
            type="button"
            onClick={() => void createFolder()}
            disabled={createBusy || !newFolderName.trim()}
          >
            {createBusy ? t('collection.creating') : t('collection.create')}
          </AnimateButton>
        </div>
        <label className="collection-folder-search collection-folder-search-compact">
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('collection.search')}
            aria-label={t('collection.search')}
          />
        </label>
        <div className="detail-collection-section-head">
          <span>{t('collection.title')}</span>
          <strong>{formatNumber(locale, visibleFolders.length)}</strong>
        </div>
        <div className="detail-collection-folder-list">
          {loading ? (
            <LoadingState variant="compact" className="detail-collection-loading" />
          ) : null}
          {visibleFolders.map(({ folder, depth, path }) => (
            <AnimateButton unstyled
              type="button"
              key={folder.id}
              className={folder.id === targetFolderId ? 'active' : ''}
              style={{ '--collection-folder-indent': `${Math.min(depth, 8) * 18}px` } as CSSProperties}
              onClick={() => setTargetFolderId(folder.id)}
            >
              <Icon name={folder.id === targetFolderId ? 'check-circle-fill' : 'folder2'} />
              <span>
                <strong><MathInline text={folder.name} /></strong>
                <em>{path}</em>
              </span>
              <small>
                {t('collection.itemCount', {
                  count: folder.itemCount,
                  displayCount: formatNumber(locale, folder.itemCount),
                })}
                {folder.childCount
                  ? ` · ${t('collection.childCount', {
                    count: folder.childCount,
                    displayCount: formatNumber(locale, folder.childCount),
                  })}`
                  : ''}
              </small>
            </AnimateButton>
          ))}
          {!loading && internalError ? (
            <AnimateButton unstyled
              type="button"
              className="detail-collection-folder-retry"
              onClick={() => void reloadFolders(currentFolderId || initialFolderId)}
            >
              <Icon name="arrow-clockwise" />
              <span>{internalError}</span>
              <small>{t('actions.retry')}</small>
            </AnimateButton>
          ) : null}
          {!loading && !internalError && !visibleFolders.length ? (
            <span className="detail-collection-loading">{t('collection.noMatches')}</span>
          ) : null}
        </div>
        <div className="detail-collection-dialog-actions">
          <AnimateButton unstyled type="button" onClick={onClose} disabled={busy}>{t('actions.cancel')}</AnimateButton>
          <AnimateButton unstyled
            type="button"
            className="primary"
            onClick={() => void onConfirm(targetFolderId, targetFolder)}
            disabled={busy || createBusy || loading || !targetFolderId}
          >
            {busy ? t('actions.saving') : confirmLabel}
          </AnimateButton>
        </div>
      </div>
    </div>
  );
}

export default CollectionFolderDialog;
