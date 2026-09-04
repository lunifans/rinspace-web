import { useCallback, useEffect, useRef, useState } from 'react';

import { formatDate } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type { CloudUser } from '@/services/phoneAuth';
import { isHttpClientRuntimeReady, requestJson, ServiceError } from '@/services/httpClient';
import {
  activeDemoDraftRepository,
  deleteDemoAutosaveDraft,
  readDemoAutosaveEnvelope,
  writeDemoAutosaveDraft,
} from '@/demo/draftStorage';

export type MilkdownAutosaveKind = 'blog-markdown' | 'markdown-book-section';

export type MilkdownAutosaveDraft = {
  version: 1;
  key: string;
  kind: MilkdownAutosaveKind;
  title: string;
  markdown: string;
  excerpt?: string;
  excerptCustomized?: boolean;
  tags?: string;
  coverUrl?: string;
  editSlug?: string;
  bookId?: string;
  sectionId?: string;
  bookTitle?: string;
  savedAt: number;
};

type RemoteMilkdownAutosaveDraft = {
  draft: MilkdownAutosaveDraft;
  revision: number;
  sourceId: string;
  updatedAt: string;
};

type MilkdownAutosaveNotice = {
  key: string;
  timestamp?: number;
  source?: 'local' | 'remote';
  tone?: 'default' | 'destructive';
};

type UseMilkdownAutosaveOptions = {
  key: string;
  user: CloudUser | null;
  userChecked: boolean;
  enabled: boolean;
  ready: boolean;
  makeDraft: () => MilkdownAutosaveDraft | null;
  applyDraft: (draft: MilkdownAutosaveDraft, source: 'local' | 'remote' | 'sync') => void | Promise<void>;
};

const milkdownAutosaveDbName = 'rinspace-milkdown-autosave';
const milkdownAutosaveStoreName = 'drafts';
const milkdownRemoteAutosaveSourceKey = 'rinspace-milkdown-autosave-source';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMilkdownAutosaveKind(value: unknown): value is MilkdownAutosaveKind {
  return value === 'blog-markdown' || value === 'markdown-book-section';
}

function isMilkdownAutosaveDraft(value: unknown, key?: string): value is MilkdownAutosaveDraft {
  if (!isRecord(value)) return false;
  if (value.version !== 1 || typeof value.key !== 'string') return false;
  if (key && value.key !== key) return false;
  return (
    isMilkdownAutosaveKind(value.kind) &&
    typeof value.title === 'string' &&
    typeof value.markdown === 'string' &&
    typeof value.savedAt === 'number'
  );
}

function getRemoteAutosaveSourceId() {
  try {
    const existing = window.sessionStorage.getItem(milkdownRemoteAutosaveSourceKey);
    if (existing) return existing;
    const random = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const sourceId = `milkdown-${random}`;
    window.sessionStorage.setItem(milkdownRemoteAutosaveSourceKey, sourceId);
    return sourceId;
  } catch {
    return `milkdown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function parseRemoteAutosaveDraft(value: unknown, key: string): RemoteMilkdownAutosaveDraft | null {
  if (!isRecord(value) || !isMilkdownAutosaveDraft(value.draft, key)) return null;
  return {
    draft: value.draft,
    revision: typeof value.revision === 'number' ? value.revision : 0,
    sourceId: typeof value.sourceId === 'string' ? value.sourceId : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

async function readRemoteAutosaveDraft(key: string): Promise<RemoteMilkdownAutosaveDraft | null> {
  if (!isHttpClientRuntimeReady()) return null;
  let payload: unknown;
  try {
    payload = await requestJson<unknown>('rin-writer/draft', { auth: 'required', query: { key } });
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) return null;
    throw error;
  }
  if (payload === null) return null;
  const parsed = parseRemoteAutosaveDraft(payload, key);
  if (!parsed) throw new Error('Unexpected remote draft response.');
  return parsed;
}

async function writeRemoteAutosaveDraft(
  draft: MilkdownAutosaveDraft,
  sourceId: string,
  revision = 0,
): Promise<RemoteMilkdownAutosaveDraft | null> {
  if (!isHttpClientRuntimeReady()) return null;
  const payload = await requestJson<unknown>('rin-writer/draft', {
    method: 'PUT',
    auth: 'required',
    query: { key: draft.key },
    body: { draft, sourceId, revision },
  });
  const parsed = parseRemoteAutosaveDraft(payload, draft.key);
  if (!parsed) throw new Error('Unexpected remote draft response.');
  return parsed;
}

async function deleteRemoteAutosaveDraft(key: string): Promise<void> {
  if (!isHttpClientRuntimeReady()) return;
  try {
    await requestJson<unknown>('rin-writer/draft', { method: 'DELETE', auth: 'required', query: { key } });
  } catch (error) {
    if (!(error instanceof ServiceError && error.status === 404)) throw error;
  }
}

function localAutosaveKey(key: string) {
  return `rinspace:milkdown-autosave:${encodeURIComponent(key)}`;
}

export function formatMilkdownAutosaveTime(
  timestamp: number,
  locale: 'zh-CN' | 'en' = 'zh-CN',
) {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  return formatDate(locale, timestamp, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function openAutosaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(milkdownAutosaveDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(milkdownAutosaveStoreName)) {
        db.createObjectStore(milkdownAutosaveStoreName, { keyPath: 'key' });
      }
    };
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
  });
}

function readAutosaveDraftFromDb(key: string): Promise<MilkdownAutosaveDraft | null> {
  return openAutosaveDb().then((db) => new Promise<MilkdownAutosaveDraft | null>((resolve, reject) => {
    const transaction = db.transaction(milkdownAutosaveStoreName, 'readonly');
    const store = transaction.objectStore(milkdownAutosaveStoreName);
    const request = store.get(key) as IDBRequest<MilkdownAutosaveDraft | undefined>;
    request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    request.onsuccess = () => resolve(request.result || null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('IndexedDB transaction failed'));
    };
  }));
}

function writeAutosaveDraftToDb(draft: MilkdownAutosaveDraft): Promise<void> {
  return openAutosaveDb().then((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(milkdownAutosaveStoreName, 'readwrite');
    transaction.objectStore(milkdownAutosaveStoreName).put(draft);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('IndexedDB write failed'));
    };
  }));
}

function deleteAutosaveDraftFromDb(key: string): Promise<void> {
  return openAutosaveDb().then((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(milkdownAutosaveStoreName, 'readwrite');
    transaction.objectStore(milkdownAutosaveStoreName).delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('IndexedDB delete failed'));
    };
  }));
}

async function readAutosaveDraft(key: string): Promise<MilkdownAutosaveDraft | null> {
  const repository = activeDemoDraftRepository();
  if (repository) {
    const value = await readDemoAutosaveEnvelope<MilkdownAutosaveDraft>(repository, key);
    return value && isMilkdownAutosaveDraft(value.draft, key) ? value.draft : null;
  }
  return readAutosaveDraftFromDb(key).catch(() => {
    try {
      const raw = window.localStorage.getItem(localAutosaveKey(key));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isMilkdownAutosaveDraft(parsed, key)) return null;
      return parsed;
    } catch {
      return null;
    }
  });
}

function writeAutosaveDraft(draft: MilkdownAutosaveDraft): Promise<void> {
  const repository = activeDemoDraftRepository();
  if (repository) return writeDemoAutosaveDraft(repository, draft.key, draft);
  return writeAutosaveDraftToDb(draft).catch(() => {
    window.localStorage.setItem(localAutosaveKey(draft.key), JSON.stringify(draft));
  });
}

function deleteAutosaveDraft(key: string): Promise<void> {
  const repository = activeDemoDraftRepository();
  if (repository) return deleteDemoAutosaveDraft(repository, key);
  return deleteAutosaveDraftFromDb(key)
    .catch(() => undefined)
    .then(() => {
      try {
        window.localStorage.removeItem(localAutosaveKey(key));
      } catch {
        // Manual save already succeeded; storage cleanup can be best effort.
      }
    });
}

export function milkdownAutosaveUserId(user: CloudUser | null) {
  return user?.id || user?.phone || 'anonymous';
}

export function makeMilkdownAutosaveKey(
  user: CloudUser | null,
  kind: MilkdownAutosaveKind,
  contentRef: string,
) {
  return [milkdownAutosaveUserId(user), 'milkdown', kind, contentRef || 'new'].join(':');
}

export function useMilkdownAutosave({
  key,
  user,
  userChecked,
  enabled,
  ready,
  makeDraft,
  applyDraft,
}: UseMilkdownAutosaveOptions) {
  const { t, i18n } = useFeatureTranslation('creation');
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const lastRunRef = useRef(0);
  const keyRef = useRef(key);
  const sourceIdRef = useRef('');
  const remoteRevisionRef = useRef(0);
  const lastLocalChangeAtRef = useRef(0);
  const lastLocalAutosaveAtRef = useRef(0);
  const applyingRemoteDraftRef = useRef(false);
  const makeDraftRef = useRef(makeDraft);
  const applyDraftRef = useRef(applyDraft);
  const enabledRef = useRef(enabled);
  const readyRef = useRef(ready);
  const userRef = useRef(user);
  const [checked, setChecked] = useState(false);
  const [noticeState, setNotice] = useState<MilkdownAutosaveNotice | null>(null);
  const notice = noticeState
    ? t(noticeState.key, {
        ...(noticeState.timestamp
          ? { time: formatMilkdownAutosaveTime(noticeState.timestamp, locale) }
          : {}),
        ...(noticeState.source
          ? { source: t(`writer.autosave.sources.${noticeState.source}`) }
          : {}),
      })
    : '';

  useEffect(() => {
    sourceIdRef.current = getRemoteAutosaveSourceId();
  }, []);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    makeDraftRef.current = makeDraft;
  }, [makeDraft]);

  useEffect(() => {
    applyDraftRef.current = applyDraft;
  }, [applyDraft]);

  useEffect(() => {
    enabledRef.current = enabled;
    readyRef.current = ready;
    userRef.current = user;
  }, [enabled, ready, user]);

  useEffect(() => {
    remoteRevisionRef.current = 0;
    lastLocalChangeAtRef.current = 0;
    lastLocalAutosaveAtRef.current = 0;
  }, [key]);

  const runAutosave = useCallback(async () => {
    if (!enabledRef.current || !readyRef.current) return;
    const draft = makeDraftRef.current();
    const currentKey = keyRef.current;
    if (!draft || !currentKey || draft.key !== currentKey) return;
    if (runningRef.current) {
      pendingRef.current = true;
      return;
    }
    runningRef.current = true;
    pendingRef.current = false;
    lastRunRef.current = Date.now();
    try {
      await writeAutosaveDraft(draft);
      lastLocalAutosaveAtRef.current = draft.savedAt;
      try {
        const remoteDraft = await writeRemoteAutosaveDraft(
          draft,
          sourceIdRef.current || getRemoteAutosaveSourceId(),
          remoteRevisionRef.current,
        );
        if (remoteDraft) {
          remoteRevisionRef.current = Math.max(remoteRevisionRef.current, remoteDraft.revision);
          setNotice({ key: 'writer.autosave.savedSynced', timestamp: draft.savedAt });
        } else {
          setNotice({ key: 'writer.autosave.savedLocal', timestamp: draft.savedAt });
        }
      } catch (remoteError) {
        console.error('Failed to sync the remote Milkdown draft', remoteError);
        setNotice({ key: 'writer.autosave.cloudSyncFailed', tone: 'destructive' });
      }
    } catch (autosaveError) {
      console.error('Failed to save the local Milkdown draft', autosaveError);
      setNotice({ key: 'writer.autosave.localSaveFailed', tone: 'destructive' });
    } finally {
      runningRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        window.setTimeout(() => {
          void runAutosave();
        }, 500);
      }
    }
  }, []);

  const scheduleAutosave = useCallback((delay = 8000, options: { force?: boolean } = {}) => {
    if (!enabledRef.current || !readyRef.current) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    const elapsed = Date.now() - lastRunRef.current;
    const minDelay = !options.force && elapsed < 8000 ? 8000 - elapsed : 0;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void runAutosave();
    }, Math.max(delay, minDelay));
  }, [runAutosave]);

  const markChanged = useCallback((delay = 8000) => {
    lastLocalChangeAtRef.current = Date.now();
    scheduleAutosave(delay);
  }, [scheduleAutosave]);

  const clearAutosave = useCallback(async () => {
    const currentKey = keyRef.current;
    if (!currentKey) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await deleteAutosaveDraft(currentKey);
    await deleteRemoteAutosaveDraft(currentKey).catch(() => undefined);
    setNotice(null);
    lastLocalChangeAtRef.current = 0;
    lastLocalAutosaveAtRef.current = 0;
  }, []);

  const applyRemoteAutosaveDraft = useCallback(async (remoteDraft: RemoteMilkdownAutosaveDraft) => {
    const draft = remoteDraft.draft;
    if (draft.key !== keyRef.current) return;
    if (remoteDraft.revision <= remoteRevisionRef.current) return;
    remoteRevisionRef.current = remoteDraft.revision;
    if (remoteDraft.sourceId && remoteDraft.sourceId === sourceIdRef.current) return;
    if (lastLocalChangeAtRef.current > lastLocalAutosaveAtRef.current) {
      setNotice({ key: 'writer.autosave.remoteConflict' });
      return;
    }
    applyingRemoteDraftRef.current = true;
    try {
      await applyDraftRef.current(draft, 'sync');
      await writeAutosaveDraft(draft).catch(() => undefined);
      lastLocalAutosaveAtRef.current = draft.savedAt;
      lastLocalChangeAtRef.current = 0;
      setNotice({ key: 'writer.autosave.remoteSynced', timestamp: draft.savedAt });
    } finally {
      window.setTimeout(() => {
        applyingRemoteDraftRef.current = false;
      }, 0);
    }
  }, []);

  const pollRemoteAutosaveDraft = useCallback(async () => {
    const currentKey = keyRef.current;
    if (!currentKey || !userRef.current || applyingRemoteDraftRef.current) return;
    const remoteDraft = await readRemoteAutosaveDraft(currentKey);
    if (!remoteDraft) return;
    await applyRemoteAutosaveDraft(remoteDraft);
  }, [applyRemoteAutosaveDraft]);

  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    setNotice(null);
    if (!userChecked || !enabled || !key) return undefined;
    void (async () => {
      const localDraft = await readAutosaveDraft(key);
      let remoteDraft: RemoteMilkdownAutosaveDraft | null = null;
      try {
        remoteDraft = user ? await readRemoteAutosaveDraft(key) : null;
      } catch (remoteError) {
        if (!cancelled && !localDraft) {
          console.error('Failed to read the remote Milkdown draft', remoteError);
          setNotice({ key: 'writer.autosave.remoteReadFailed', tone: 'destructive' });
        }
      }
      if (remoteDraft) {
        remoteRevisionRef.current = Math.max(remoteRevisionRef.current, remoteDraft.revision);
      }
      const draft =
        remoteDraft?.draft && (!localDraft || remoteDraft.draft.savedAt > localDraft.savedAt)
          ? remoteDraft.draft
          : localDraft;
      const source: 'local' | 'remote' = draft && remoteDraft?.draft === draft ? 'remote' : 'local';
      if (draft && source === 'remote') {
        await writeAutosaveDraft(draft).catch(() => undefined);
      }
      return { draft, source };
    })()
      .then(async ({ draft, source }) => {
        if (cancelled) return;
        if (draft) {
          lastLocalAutosaveAtRef.current = draft.savedAt;
          await applyDraftRef.current(draft, source);
          setNotice({
            key: 'writer.autosave.restored',
            timestamp: draft.savedAt,
            source,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, user, userChecked]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !enabled) return undefined;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        scheduleAutosave(0, { force: true });
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!timerRef.current && !runningRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, ready, scheduleAutosave]);

  useEffect(() => {
    if (!ready || !enabled || !user) return undefined;
    let cancelled = false;
    const run = () => {
      void pollRemoteAutosaveDraft().catch((pollError) => {
        if (!cancelled) {
          console.error('Failed to poll the remote Milkdown draft', pollError);
          setNotice({ key: 'writer.autosave.pollFailed', tone: 'destructive' });
        }
      });
    };
    const timer = window.setInterval(run, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, pollRemoteAutosaveDraft, ready, user]);

  return {
    checked,
    notice,
    noticeTone: noticeState?.tone || 'default',
    markChanged,
    scheduleAutosave,
    clearAutosave,
  };
}
