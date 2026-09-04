import type { RuntimeConfig, SiteBrandConfig } from './runtime';

export type SiteWebManifest = Readonly<{
  name: string;
  short_name: string;
  description: string;
  lang: SiteBrandConfig['defaultLocale'];
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  icons: SiteBrandConfig['brand']['manifestIcons'];
}>;

export type RouteHeadMetadata = Readonly<{
  pageTitle: string;
  title: string;
  description: string;
  canonicalUrl: string;
  openGraph: Readonly<{
    type: 'website';
    siteName: string;
    title: string;
    description: string;
    url: string;
  }>;
}>;

function siteAssetPath(config: RuntimeConfig, pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (config.basePath === '/' || normalized.startsWith(config.basePath)) return normalized;
  return `${config.basePath}${normalized.slice(1)}`;
}

export function buildSiteWebManifest(config: RuntimeConfig): SiteWebManifest {
  return {
    name: config.site.name,
    short_name: config.site.shortName,
    description: config.site.description,
    lang: config.site.defaultLocale,
    start_url: config.basePath,
    scope: config.basePath,
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#f8fafc',
    icons: config.site.brand.manifestIcons.map((icon) => ({
      ...icon,
      src: siteAssetPath(config, icon.src),
    })),
  };
}

function routePath(config: RuntimeConfig, pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (config.basePath === '/' || normalized.startsWith(config.basePath)) return normalized;
  return `${config.basePath}${normalized.slice(1)}`;
}

export function canonicalSiteUrl(config: RuntimeConfig, pathname: string): string {
  return new URL(routePath(config, pathname), `${config.canonicalOrigin}/`).toString();
}

export function buildRouteHeadMetadata(
  config: RuntimeConfig,
  pathname: string,
  pageTitle: string,
): RouteHeadMetadata {
  const normalizedTitle = pageTitle.trim() || config.site.name;
  const title = runtimeDocumentTitle(config, normalizedTitle);
  const canonicalUrl = canonicalSiteUrl(config, pathname);
  return Object.freeze({
    pageTitle: normalizedTitle,
    title,
    description: config.site.description,
    canonicalUrl,
    openGraph: Object.freeze({
      type: 'website',
      siteName: config.site.name,
      title,
      description: config.site.description,
      url: canonicalUrl,
    }),
  });
}

export function runtimeDocumentTitle(config: RuntimeConfig, pageTitle: string): string {
  const normalizedTitle = pageTitle.trim();
  if (!normalizedTitle || normalizedTitle === config.site.name) return config.site.name;
  return `${normalizedTitle} · ${config.site.name}`;
}

function setNamedMeta(documentNode: Document, name: string, content: string | null): void {
  const existing = documentNode.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (content === null) {
    existing?.remove();
    return;
  }
  const meta = existing ?? documentNode.createElement('meta');
  meta.name = name;
  meta.content = content;
  meta.dataset.rinspaceSite = 'true';
  if (!existing) documentNode.head.append(meta);
}

function setPropertyMeta(documentNode: Document, property: string, content: string): void {
  const existing = documentNode.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  const meta = existing ?? documentNode.createElement('meta');
  meta.setAttribute('property', property);
  meta.content = content;
  meta.dataset.rinspaceSite = 'true';
  if (!existing) documentNode.head.append(meta);
}

function appendManagedLink(documentNode: Document, attributes: Readonly<Record<string, string>>): void {
  const link = documentNode.createElement('link');
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
  link.dataset.rinspaceSite = 'true';
  documentNode.head.append(link);
}

function structuredSiteData(config: RuntimeConfig): Readonly<Record<string, unknown>> {
  const websiteId = `${config.canonicalOrigin}/#website`;
  const organizationId = `${config.canonicalOrigin}/#organization`;
  const organization = config.site.legalEntity ? {
    '@type': 'Organization',
    '@id': organizationId,
    name: config.site.legalEntity,
    url: canonicalSiteUrl(config, '/'),
    ...(config.site.contactEmail ? { email: config.site.contactEmail } : {}),
    ...(config.site.brand.logoPath ? { logo: canonicalSiteUrl(config, config.site.brand.logoPath) } : {}),
  } : null;
  const website = {
    '@type': 'WebSite',
    '@id': websiteId,
    name: config.site.name,
    url: canonicalSiteUrl(config, '/'),
    description: config.site.description,
    inLanguage: config.site.defaultLocale,
    ...(organization ? { publisher: { '@id': organizationId } } : {}),
    potentialAction: {
      '@type': 'SearchAction',
      target: `${canonicalSiteUrl(config, '/search')}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
  return {
    '@context': 'https://schema.org',
    '@graph': organization ? [organization, website] : [website],
  };
}

export function applySiteMetadata(config: RuntimeConfig, documentNode: Document = document): void {
  documentNode.documentElement.lang = config.site.defaultLocale;
  documentNode.title = config.site.name;
  setNamedMeta(documentNode, 'description', config.site.description);
  setNamedMeta(documentNode, 'author', config.site.legalEntity);
  setNamedMeta(documentNode, 'application-name', config.site.shortName);
  setNamedMeta(documentNode, 'apple-mobile-web-app-title', config.site.shortName);
  setNamedMeta(documentNode, 'baidu-site-verification', config.site.verification.baidu);
  setNamedMeta(documentNode, '360-site-verification', config.site.verification.qihoo360);
  setNamedMeta(documentNode, 'sogou_site_verification', config.site.verification.sogou);
  setPropertyMeta(documentNode, 'og:type', 'website');
  setPropertyMeta(documentNode, 'og:site_name', config.site.name);
  setPropertyMeta(documentNode, 'og:title', config.site.name);
  setPropertyMeta(documentNode, 'og:description', config.site.description);
  setPropertyMeta(documentNode, 'og:url', canonicalSiteUrl(config, '/'));

  documentNode.head.querySelectorAll('[data-rinspace-site="true"][rel]').forEach((node) => node.remove());
  if (config.site.brand.faviconPath) {
    const faviconPath = siteAssetPath(config, config.site.brand.faviconPath);
    appendManagedLink(documentNode, { rel: 'icon', href: faviconPath });
    appendManagedLink(documentNode, { rel: 'shortcut icon', href: faviconPath });
  }
  if (config.site.brand.appleTouchIconPath) {
    appendManagedLink(documentNode, { rel: 'apple-touch-icon', href: siteAssetPath(config, config.site.brand.appleTouchIconPath) });
  }
  if (config.site.brand.logoPath) {
    appendManagedLink(documentNode, {
      rel: 'preload',
      href: siteAssetPath(config, config.site.brand.logoPath),
      as: 'image',
      fetchpriority: 'high',
    });
  }
  appendManagedLink(documentNode, { rel: 'manifest', href: `${config.basePath}site.webmanifest` });

  documentNode.head.querySelectorAll('script[data-rinspace-site="true"]').forEach((node) => node.remove());
  const jsonLd = documentNode.createElement('script');
  jsonLd.type = 'application/ld+json';
  jsonLd.dataset.rinspaceSite = 'true';
  jsonLd.textContent = JSON.stringify(structuredSiteData(config));
  documentNode.head.append(jsonLd);
}
