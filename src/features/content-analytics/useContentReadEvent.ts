import { useEffect, useRef } from 'react';

import { createContentReadRequestId, recordContentRead } from './readEvents';

const readableContentTypes = new Set(['blog', 'book', 'discussion', 'dynamic', 'forum', 'status']);

export type ContentReadTarget = {
  id: string | number;
  slug: string;
  type: string;
};

type UseContentReadEventOptions = {
  target: ContentReadTarget | null;
  enabled?: boolean;
  onReadCount(readCount: number): void;
};

export function useContentReadEvent({ target, enabled = true, onReadCount }: UseContentReadEventOptions) {
  const lastRecordedKeyRef = useRef('');
  const onReadCountRef = useRef(onReadCount);
  onReadCountRef.current = onReadCount;
  const targetID = target?.id;
  const targetSlug = target?.slug || '';
  const targetType = target?.type || '';

  useEffect(() => {
    if (!enabled || targetID === undefined || !readableContentTypes.has(targetType)) return;
    const slug = targetSlug.trim() || String(targetID);
    const readKey = `${targetID}:${slug}`;
    if (lastRecordedKeyRef.current === readKey) return;
    lastRecordedKeyRef.current = readKey;
    void recordContentRead(slug, createContentReadRequestId())
      .then((response) => onReadCountRef.current(response.readCount))
      .catch((error: unknown) => {
        console.warn('Content read analytics failed', error);
      });
  }, [enabled, targetID, targetSlug, targetType]);
}
