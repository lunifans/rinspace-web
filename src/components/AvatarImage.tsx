import { type ReactNode, useEffect, useState } from 'react';

const avatarUrlCache = new Map<string, string>();
const avatarMaxAgeSeconds = 24 * 60 * 60;

type TempFileResult = {
  fileList?: Array<{
    tempFileURL?: string;
    download_url?: string;
  }>;
};

type TempUrlApp = {
  getTempFileURL(params: { fileList: Array<{ fileID: string; maxAge: number }> }): Promise<TempFileResult>;
};

type AvatarImageProps = {
  src?: string;
  alt?: string;
  className?: string;
  fallback: ReactNode;
};

function isCloudFileID(value: string) {
  return value.trim().startsWith('cloud://');
}

function immediateAvatarUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || isCloudFileID(trimmed)) return '';
  return trimmed;
}

async function resolveCloudAvatar(fileID: string) {
  const cached = avatarUrlCache.get(fileID);
  if (cached) return cached;

  const { getCloudBaseApp } = await import('@/services/cloudbase');
  const app = getCloudBaseApp() as TempUrlApp;
  const result = await app.getTempFileURL({
    fileList: [{ fileID, maxAge: avatarMaxAgeSeconds }],
  });
  const firstFile = result.fileList?.[0];
  const url = firstFile?.tempFileURL || firstFile?.download_url || '';
  if (url) {
    avatarUrlCache.set(fileID, url);
  }
  return url;
}

export function useResolvedAvatarUrl(src?: string) {
  const normalized = (src || '').trim();
  const [resolved, setResolved] = useState(() => immediateAvatarUrl(normalized));

  useEffect(() => {
    let cancelled = false;
    const directUrl = immediateAvatarUrl(normalized);
    if (directUrl || !normalized) {
      setResolved(directUrl);
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      void resolveCloudAvatar(normalized)
        .then((url) => {
          if (!cancelled) setResolved(url);
        })
        .catch(() => {
          if (!cancelled) setResolved('');
        });
    }, 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalized]);

  return resolved;
}

export default function AvatarImage({ src, alt = '', className, fallback }: AvatarImageProps) {
  const resolved = useResolvedAvatarUrl(src);
  const [failedUrl, setFailedUrl] = useState('');
  const shouldShowImage = Boolean(resolved && resolved !== failedUrl);

  useEffect(() => {
    if (!resolved) {
      setFailedUrl('');
    }
  }, [resolved]);

  if (shouldShowImage) {
    return (
      <img
        className={className}
        src={resolved}
        alt={alt}
        onError={() => setFailedUrl(resolved)}
      />
    );
  }
  return <>{fallback}</>;
}
