import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseRuntimeConfig } from '@/app/config/runtime';
import {
  applySiteMetadata,
  buildRouteHeadMetadata,
  buildSiteWebManifest,
  canonicalSiteUrl,
} from '@/app/config/siteMetadata';

const readConfig = (name: string) => parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', name), 'utf8'),
) as unknown);
const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const demo = readConfig('runtime.demo.json');
const integration = readConfig('runtime.example.json');
const official = readConfig('runtime.official.example.json');

describe('runtime site brand metadata', () => {
  it('keeps the static shell generic until validated runtime config loads', () => {
    for (const productionValue of [
      '任务优先（上海）网络科技有限责任公司',
      'lunifans@outlook.com',
      '沪ICP备2025152146号-2',
      '沪公网安备31012102000206号',
      'https://rinspace.com',
      'assets/brand/rinspace-mark',
    ]) expect(indexHtml).not.toContain(productionValue);
    expect(indexHtml).toContain('name="rinspace-runtime-config"');
    expect(indexHtml).toContain('data-rin-bootstrap-fallback="true"');
    expect(indexHtml).not.toMatch(/<link rel="(?:icon|shortcut icon|apple-touch-icon|manifest)"/);
  });

  it('builds a neutral demo manifest without official brand icons or filings', () => {
    expect(buildSiteWebManifest(demo)).toEqual({
      name: 'Rinspace Web Demo',
      short_name: 'Rinspace Demo',
      description: demo.site.description,
      lang: 'zh-CN',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f8fafc',
      theme_color: '#f8fafc',
      icons: [],
    });
    expect(demo.site.legalEntity).toBeNull();
    expect(demo.site.filings).toEqual({ icp: null, publicSecurity: null });
  });

  it('applies official title, structured data, favicon, manifest, and verification', () => {
    const documentNode = document.implementation.createHTMLDocument('generic');
    applySiteMetadata(official, documentNode);
    expect(documentNode.title).toBe('芥子环');
    expect(documentNode.documentElement.lang).toBe('zh-CN');
    expect(documentNode.querySelector('meta[name="author"]')?.getAttribute('content')).toBe(official.site.legalEntity);
    expect(documentNode.querySelector('meta[name="baidu-site-verification"]')?.getAttribute('content')).toBe('codeva-LjXqtDBsLT');
    expect(documentNode.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.ico');
    expect(documentNode.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/apple-touch-icon.png');
    expect(documentNode.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/site.webmanifest');
    const jsonLd = JSON.parse(documentNode.querySelector('script[type="application/ld+json"]')?.textContent || '{}') as {
      '@graph': Array<Record<string, unknown>>;
    };
    expect(jsonLd['@graph'][0]).toMatchObject({
      '@type': 'Organization',
      name: official.site.legalEntity,
      email: official.site.contactEmail,
    });
  });

  it('removes official-only metadata and icons when applying demo over an official document', () => {
    const documentNode = document.implementation.createHTMLDocument('generic');
    applySiteMetadata(official, documentNode);
    applySiteMetadata(demo, documentNode);
    expect(documentNode.querySelector('meta[name="author"]')).toBeNull();
    expect(documentNode.querySelector('meta[name="baidu-site-verification"]')).toBeNull();
    expect(documentNode.querySelector('link[rel="icon"]')).toBeNull();
    expect(documentNode.querySelector('link[rel="apple-touch-icon"]')).toBeNull();
    expect(documentNode.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/site.webmanifest');
    expect(documentNode.head.textContent).not.toContain('任务优先');
  });

  it('generates absolute canonical URLs consistently for root and subpath deployments', () => {
    expect(canonicalSiteUrl(demo, '/legal')).toBe('http://localhost:4173/legal');
    expect(canonicalSiteUrl(integration, '/legal')).toBe('https://web.example.com/rinspace/legal');
    expect(canonicalSiteUrl(integration, '/rinspace/legal')).toBe('https://web.example.com/rinspace/legal');
  });

  it('builds route metadata only from the validated runtime site configuration', () => {
    expect(buildRouteHeadMetadata(demo, '/a/1010/local-error-atlas', '博客')).toEqual({
      pageTitle: '博客',
      title: '博客 · Rinspace Web Demo',
      description: demo.site.description,
      canonicalUrl: 'http://localhost:4173/a/1010/local-error-atlas',
      openGraph: {
        type: 'website',
        siteName: 'Rinspace Web Demo',
        title: '博客 · Rinspace Web Demo',
        description: demo.site.description,
        url: 'http://localhost:4173/a/1010/local-error-atlas',
      },
    });
    const integrated = buildRouteHeadMetadata(integration, '/a/1010/local-error-atlas', 'Article');
    expect(integrated.canonicalUrl).toBe('https://web.example.com/rinspace/a/1010/local-error-atlas');
    expect(integrated.title).toBe('Article · Example Knowledge Space');
    expect(JSON.stringify(integrated)).not.toContain('rinspace.com');
  });

  it('restores official brand and registration values only in official config', () => {
    const manifest = buildSiteWebManifest(official);
    expect(manifest.name).toBe('芥子环');
    expect(manifest.icons).toHaveLength(2);
    expect(official.site.filings).toEqual({
      icp: '沪ICP备2025152146号-2',
      publicSecurity: '沪公网安备31012102000206号',
    });
    expect(integration.site.name).toBe('Example Knowledge Space');
    expect(integration.site.filings).toEqual({ icp: null, publicSecurity: null });
  });

  it('scopes configured brand assets and manifest icons to a subpath shell', () => {
    const input = JSON.parse(JSON.stringify(official)) as Record<string, unknown>;
    input.basePath = '/rinspace/';
    const subpathOfficial = parseRuntimeConfig(input);
    expect(buildSiteWebManifest(subpathOfficial).icons[0]?.src).toBe('/rinspace/favicon-192x192.png');
    const documentNode = document.implementation.createHTMLDocument('generic');
    applySiteMetadata(subpathOfficial, documentNode);
    expect(documentNode.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/rinspace/favicon.ico');
    expect(documentNode.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/rinspace/site.webmanifest');
  });
});
