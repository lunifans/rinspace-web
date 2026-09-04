export type InternalContentPreviewKind =
  | 'blog'
  | 'book'
  | 'question'
  | 'discussion'
  | 'dynamic'
  | 'announcement';

export type InternalContentPreviewTarget = {
  href: string;
  slug: string;
  kind: InternalContentPreviewKind;
};

type ResolveInternalContentPreviewOptions = {
  basePath?: string;
  currentHref?: string;
  origin?: string;
};

const routeKinds: Record<string, InternalContentPreviewKind> = {
  a: 'blog',
  books: 'book',
  q: 'question',
  d: 'discussion',
  s: 'dynamic',
  announcements: 'announcement',
};

function trimBasePath(pathname: string, basePath: string) {
  const normalizedBase = `/${basePath.trim().replace(/^\/+|\/+$/g, '')}`;
  if (normalizedBase === '/') return pathname;
  if (pathname === normalizedBase) return '/';
  return pathname.startsWith(`${normalizedBase}/`)
    ? pathname.slice(normalizedBase.length)
    : pathname;
}

function routeIdentity(pathname: string, basePath: string) {
  const localPath = trimBasePath(pathname, basePath);
  const match = localPath.match(/^\/(a|books|q|d|s|announcements)\/([^/?#]+)/i);
  if (!match) return null;
  const route = match[1].toLocaleLowerCase();
  let slug = '';
  try {
    slug = decodeURIComponent(match[2]).trim();
  } catch {
    return null;
  }
  if (!slug) return null;
  return { kind: routeKinds[route], slug };
}

export function resolveInternalContentPreview(
  rawHref: string,
  options: ResolveInternalContentPreviewOptions = {},
): InternalContentPreviewTarget | null {
  const href = rawHref.trim();
  if (!href || href.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(href)) return null;
  if (typeof window === 'undefined' && (!options.currentHref || !options.origin)) return null;

  const origin = options.origin || window.location.origin;
  const currentHref = options.currentHref || window.location.href;
  let url: URL;
  let currentUrl: URL;
  try {
    url = new URL(href, currentHref);
    currentUrl = new URL(currentHref, origin);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(url.protocol)) return null;
  const isSameOrigin = url.origin === origin;
  const isCanonicalRinspace = url.protocol === 'https:' && url.hostname.toLocaleLowerCase() === 'rinspace.com';
  if (!isSameOrigin && !isCanonicalRinspace) return null;

  const identity = routeIdentity(url.pathname, options.basePath || '');
  if (!identity) return null;
  const currentIdentity = routeIdentity(currentUrl.pathname, options.basePath || '');
  if (
    currentIdentity &&
    currentIdentity.kind === identity.kind &&
    currentIdentity.slug.toLocaleLowerCase() === identity.slug.toLocaleLowerCase()
  ) {
    return null;
  }

  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    slug: identity.slug,
    kind: identity.kind,
  };
}
