import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseRuntimeConfig } from '../src/app/config/runtime.ts';
import { buildSiteWebManifest } from '../src/app/config/siteMetadata.ts';

export const immutableCacheControl = 'public, max-age=31536000, immutable';
export const shellCacheControl = 'no-store';
export const defaultCacheControl = 'public, max-age=3600';

const excludedCoreShellFiles = new Set([
  '404.html',
  '_headers',
  '_redirects',
  'runtime-config.json',
  'site.webmanifest',
  'static-headers.json',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function listFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isSymbolicLink()) throw new Error(`Core artifact cannot contain symbolic links: ${relative}`);
    return entry.isDirectory() ? listFiles(root, absolute) : [relative];
  });
}

function resetOutputDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    return;
  }
  const stat = fs.lstatSync(directory);
  invariant(!stat.isSymbolicLink() && stat.isDirectory(), 'Package output must be a real directory.');
  for (const entry of fs.readdirSync(directory)) {
    fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
  }
}

function prefixedPath(basePath, pathname) {
  const relative = pathname.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${basePath}${relative}`;
}

function rewriteHtmlShell(source, config) {
  const canonical = new URL(config.basePath, `${config.canonicalOrigin}/`).toString();
  let html = source
    .replace(/(<html\b[^>]*\blang=")[^"]*(")/i, `$1${config.site.defaultLocale}$2`)
    .replace(/(<meta\b[^>]*\bname="description"[^>]*\bcontent=")[^"]*(")/i, `$1${config.site.description}$2`)
    .replace(/<title>[^<]*<\/title>/i, `<title>${config.site.name}</title>`)
    .replace(/\b(src|href|content)="\.\//g, (_match, attribute) => `${attribute}="${config.basePath}`)
    .replace(/<link\b[^>]*\brel="canonical"[^>]*>\s*/gi, '');
  invariant(html.includes(`${config.basePath}runtime-config.json`), 'HTML shell is missing the runtime config marker.');
  html = html.replace('</head>', `    <link data-rinspace-shell="true" rel="canonical" href="${canonical}" />\n  </head>`);
  return html;
}

function endpointOrigins(config) {
  const sources = new Set(["'self'"]);
  const endpoints = [
    config.api.baseUrl,
    config.auth.endpoint,
    ...Object.values(config.integrations).map((integration) => integration.baseUrl),
  ];
  for (const endpoint of endpoints) {
    if (!endpoint || endpoint.startsWith('/')) continue;
    const url = new URL(endpoint);
    sources.add(url.origin);
    if (url.protocol === 'https:') sources.add(`wss://${url.host}`);
  }
  const cloudbase = config.auth.provider === 'cloudbase' ? config.auth.cloudbase : null;
  if (cloudbase) {
    const host = `${cloudbase.envId}.api.tcloudbasegateway.com`;
    sources.add(`https://${host}`);
    sources.add(`wss://${host}`);
  }
  return [...sources];
}

export function contentSecurityPolicy(config) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src ${endpointOrigins(config).join(' ')}`,
    "worker-src 'self' blob:",
  ].join('; ');
}

function isImmutablePath(relativePath) {
  if (relativePath.startsWith('static/')) return true;
  return relativePath.startsWith('assets/')
    && /(?:^|\.)[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(path.posix.basename(relativePath));
}

export function cacheControlForPath(relativePath) {
  const normalized = relativePath.replace(/^\/+/, '');
  if (isImmutablePath(normalized)) return immutableCacheControl;
  if ([
    '',
    '404.html',
    'bootstrap-theme.js',
    'index.html',
    'official-shell-result.json',
    'runtime-config.json',
    'site.webmanifest',
    'version.json',
  ].includes(normalized)) return shellCacheControl;
  return defaultCacheControl;
}

function securityHeaders(config) {
  return Object.freeze({
    'Content-Security-Policy': contentSecurityPolicy(config),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
}

function buildHeaderDocument(config, files) {
  const immutablePaths = files.filter(isImmutablePath).map((file) => prefixedPath(config.basePath, file));
  return {
    schemaVersion: 1,
    basePath: config.basePath,
    spaFallback: `${config.basePath}index.html`,
    securityHeaders: securityHeaders(config),
    cacheRules: [
      { paths: immutablePaths, cacheControl: immutableCacheControl },
      {
        paths: [
          config.basePath,
          `${config.basePath}index.html`,
          `${config.basePath}official-shell-result.json`,
          `${config.basePath}404.html`,
          `${config.basePath}runtime-config.json`,
          `${config.basePath}site.webmanifest`,
          `${config.basePath}version.json`,
          `${config.basePath}mockServiceWorker.js`,
        ],
        cacheControl: shellCacheControl,
      },
    ],
    serviceWorker: {
      path: `${config.basePath}mockServiceWorker.js`,
      allowedScope: config.basePath,
      cacheControl: shellCacheControl,
    },
  };
}

function netlifyHeaders(document) {
  const lines = [`${document.basePath}*`];
  for (const [name, value] of Object.entries(document.securityHeaders)) lines.push(`  ${name}: ${value}`);
  lines.push(`  Cache-Control: ${defaultCacheControl}`);
  for (const rule of document.cacheRules) {
    for (const pathname of rule.paths) lines.push('', pathname, `  Cache-Control: ${rule.cacheControl}`);
  }
  lines.push('', document.serviceWorker.path, `  Cache-Control: ${document.serviceWorker.cacheControl}`, `  Service-Worker-Allowed: ${document.serviceWorker.allowedScope}`);
  return `${lines.join('\n')}\n`;
}

function rewriteAssetManifest(outputDirectory, basePath) {
  const fileName = path.join(outputDirectory, 'asset-manifest.json');
  if (!fs.existsSync(fileName)) return;
  const manifest = JSON.parse(fs.readFileSync(fileName, 'utf8'));
  const rewrite = (value) => typeof value === 'string' ? prefixedPath(basePath, value) : value;
  if (manifest.files && typeof manifest.files === 'object') {
    manifest.files = Object.fromEntries(Object.entries(manifest.files).map(([name, value]) => [name, rewrite(value)]));
  }
  if (Array.isArray(manifest.entrypoints)) manifest.entrypoints = manifest.entrypoints.map(rewrite);
  fs.writeFileSync(fileName, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function immutableFileDigests(root) {
  return Object.fromEntries(listFiles(root)
    .filter(isImmutablePath)
    .sort()
    .map((file) => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
}

export function assembleRuntimeShell({
  coreDirectory,
  config,
  configFile,
  copyCore = true,
  outputDirectory,
  expectedBasePath,
}) {
  const core = path.resolve(coreDirectory);
  const output = path.resolve(outputDirectory);
  invariant(fs.existsSync(core) && fs.statSync(core).isDirectory(), `Core artifact directory does not exist: ${core}`);
  invariant(core !== output && !isWithin(core, output) && !isWithin(output, core), 'Core and package directories must not overlap.');
  const runtimeConfig = parseRuntimeConfig(config ?? JSON.parse(fs.readFileSync(path.resolve(configFile), 'utf8')));
  if (expectedBasePath !== undefined) invariant(runtimeConfig.basePath === expectedBasePath, `Config basePath ${runtimeConfig.basePath} does not match --base-path ${expectedBasePath}.`);
  const coreFiles = listFiles(core);
  for (const required of ['asset-manifest.json', 'index.html', 'version.json']) {
    invariant(coreFiles.includes(required), `Core artifact is missing ${required}.`);
  }
  invariant(Object.keys(immutableFileDigests(core)).length > 0, 'Core artifact does not contain hashed immutable resources.');

  // The container output is a writable tmpfs mounted on a read-only root.
  // Empty its contents without trying to unlink and recreate the mount point.
  resetOutputDirectory(output);
  if (copyCore) {
    fs.cpSync(core, output, {
      recursive: true,
      filter(source) {
        const relative = path.relative(core, source).split(path.sep).join('/');
        return relative === '' || !excludedCoreShellFiles.has(relative);
      },
    });
  } else {
    for (const file of coreFiles.filter((name) => name.endsWith('.html') || name === 'asset-manifest.json')) {
      const target = path.join(output, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(core, file), target);
    }
  }
  // Only index.html is the runtime-configured application shell. Auxiliary
  // Vite HTML entries (for example, the design labs) intentionally have no
  // runtime-config marker and keep their relative asset URLs unchanged.
  fs.writeFileSync(
    path.join(output, 'index.html'),
    rewriteHtmlShell(fs.readFileSync(path.join(core, 'index.html'), 'utf8'), runtimeConfig),
  );
  const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(output, '404.html'), index);
  fs.writeFileSync(path.join(output, 'runtime-config.json'), `${JSON.stringify(runtimeConfig, null, 2)}\n`);
  fs.writeFileSync(path.join(output, 'site.webmanifest'), `${JSON.stringify(buildSiteWebManifest(runtimeConfig), null, 2)}\n`);
  rewriteAssetManifest(output, runtimeConfig.basePath);
  const files = [...new Set([...coreFiles, ...listFiles(output)])];
  const headers = buildHeaderDocument(runtimeConfig, files);
  fs.writeFileSync(path.join(output, 'static-headers.json'), `${JSON.stringify(headers, null, 2)}\n`);
  fs.writeFileSync(path.join(output, '_headers'), netlifyHeaders(headers));
  fs.writeFileSync(path.join(output, '_redirects'), `${runtimeConfig.basePath}* ${runtimeConfig.basePath}index.html 200\n`);
  return Object.freeze({
    config: runtimeConfig,
    headers,
    immutableDigests: copyCore ? immutableFileDigests(output) : immutableFileDigests(core),
  });
}
