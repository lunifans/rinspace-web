import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, 'src/app/routing/routeManifest.tsx');
const supportPath = path.join(projectRoot, 'config/demo-route-support.json');
const coveragePath = path.join(projectRoot, 'contracts/demo-coverage.json');
const metadataPath = path.join(projectRoot, 'contracts/route-metadata.json');
const documentationPath = path.join(projectRoot, 'docs/demo-route-coverage.md');
const routeTitleLocales = ['en', 'zh-CN'];
const mode = process.argv.includes('--check') ? 'check' : 'write';
const supportKinds = ['interactive', 'read-only', 'production-only', 'not-yet-supported'];

function fail(message) {
  throw new Error(`Route contract generation failed: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${path.relative(projectRoot, file)} is invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export function readRouteTitleCatalog() {
  return Object.fromEntries(routeTitleLocales.map((locale) => {
    const resource = readJson(path.join(projectRoot, 'src/i18n/resources', locale, 'common.json'));
    if (!resource.routes || typeof resource.routes !== 'object') fail(`${locale} common resource is missing routes`);
    return [locale, resource.routes];
  }));
}

function unwrap(node) {
  let current = node;
  while (
    ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isParenthesizedExpression(current)
  ) current = current.expression;
  return current;
}

function property(object, name) {
  const item = object.properties.find((candidate) => (
    ts.isPropertyAssignment(candidate)
    && ((ts.isIdentifier(candidate.name) && candidate.name.text === name)
      || (ts.isStringLiteral(candidate.name) && candidate.name.text === name))
  ));
  if (!item || !ts.isPropertyAssignment(item)) fail(`route row is missing ${name}`);
  return unwrap(item.initializer);
}

function stringProperty(object, name) {
  const value = property(object, name);
  if (!ts.isStringLiteral(value)) fail(`${name} must be a string literal`);
  return value.text;
}

function numberProperty(object, name) {
  const value = property(object, name);
  if (!ts.isNumericLiteral(value)) fail(`${name} must be a number literal`);
  return Number(value.text);
}

function stringArrayProperty(object, name) {
  const value = property(object, name);
  if (!ts.isArrayLiteralExpression(value)) fail(`${name} must be an array literal`);
  return value.elements.map((item) => {
    if (!ts.isStringLiteral(item)) fail(`${name} must contain only string literals`);
    return item.text;
  });
}

export function readRouteManifestSource(sourceText) {
  const source = ts.createSourceFile(manifestPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === 'routeDefinitions');
  if (!declaration?.initializer) fail('routeDefinitions array is missing');
  const array = unwrap(declaration.initializer);
  if (!ts.isArrayLiteralExpression(array)) fail('routeDefinitions must be an array literal');
  return array.elements.map((element) => {
    const row = unwrap(element);
    if (!ts.isObjectLiteralExpression(row)) fail('routeDefinitions entries must be object literals');
    return Object.freeze({
      order: numberProperty(row, 'order'),
      path: stringProperty(row, 'path'),
      canonicalPath: stringProperty(row, 'canonicalPath'),
      titleKey: stringProperty(row, 'titleKey'),
      translationNamespaces: stringArrayProperty(row, 'translationNamespaces'),
      layout: stringProperty(row, 'layout'),
      family: stringProperty(row, 'family'),
      minimumRole: stringProperty(row, 'minimumRole'),
      anonymousResult: stringProperty(row, 'anonymousResult'),
      frozenBoundary: stringProperty(row, 'frozenBoundary'),
    });
  });
}

function routeSupportIndex(config) {
  if (config.schemaVersion !== 1 || !config.support || !config.pathParameters) {
    fail('config/demo-route-support.json must use schemaVersion 1 and declare support/pathParameters');
  }
  const index = new Map();
  for (const support of supportKinds) {
    const paths = config.support[support];
    if (!Array.isArray(paths)) fail(`support.${support} must be an array`);
    for (const routePath of paths) {
      if (typeof routePath !== 'string' || index.has(routePath)) fail(`duplicate or invalid support path ${String(routePath)}`);
      index.set(routePath, support);
    }
  }
  return index;
}

function routeFixtureValues(routePath, defaults) {
  const values = { ...defaults };
  if (routePath.startsWith('/books/')) Object.assign(values, { postId: '1040', slug: 'paper-to-orbit', titleSlug: 'paper-to-orbit' });
  if (routePath.startsWith('/q/') || routePath.startsWith('/questions/')) Object.assign(values, { postId: '1030', slug: 'iterator-boundary-last-example', titleSlug: 'iterator-boundary-last-example' });
  if (routePath.startsWith('/d/') || routePath.startsWith('/discussions/') || routePath.startsWith('/forum/')) Object.assign(values, { postId: '1050', slug: 'diagrams-before-proof', titleSlug: 'diagrams-before-proof' });
  if (routePath.startsWith('/s/') || routePath.startsWith('/dynamics/') || routePath.startsWith('/activity/')) Object.assign(values, { postId: '1060', slug: 'field-note-fixed-clock', titleSlug: 'field-note-fixed-clock' });
  if (routePath.startsWith('/announcements/')) values.slug = 'local-demo-announcement';
  return values;
}

export function concreteDemoPath(routePath, defaults) {
  if (routePath === '*') return '/route-coverage-not-found';
  const values = routeFixtureValues(routePath, defaults);
  return routePath.replace(/:([A-Za-z0-9_]+)/g, (_match, name) => {
    const value = values[name];
    if (!value) fail(`missing demo path parameter ${name} for ${routePath}`);
    return encodeURIComponent(value);
  });
}

function acceptanceFor(route, support) {
  const guest = route.minimumRole === 'member'
    ? 'authentication-outcome'
    : support === 'production-only'
      ? 'capability-boundary'
      : support === 'not-yet-supported'
        ? 'unsupported-explanation'
        : 'render';
  const member = route.path === '/admin'
    ? 'authorization-outcome'
    : support === 'production-only'
      ? 'capability-boundary'
      : support === 'not-yet-supported'
        ? 'unsupported-explanation'
        : 'render';
  return { guest, member };
}

function htmlMode(route, support) {
  if (route.path === '*' || route.canonicalPath !== route.path) return 'redirect';
  if (route.minimumRole !== 'none' || support === 'production-only' || support === 'not-yet-supported' || route.path.startsWith('/test/')) return 'client-only';
  return route.path.includes(':') ? 'dynamic-official' : 'site-shell';
}

function routeParameters(routePath) {
  return [...routePath.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]);
}

export function buildRouteContracts(routes, supportConfig, routeTitleCatalog = readRouteTitleCatalog()) {
  if (routes.length !== 85) fail(`expected 85 active routes, found ${routes.length}`);
  if (routes.some((route, order) => route.order !== order)) fail('route orders must be contiguous and zero-based');
  if (new Set(routes.map((route) => route.path)).size !== routes.length) fail('route paths must be unique');
  if (routes.at(-1)?.path !== '*') fail('catch-all route must remain last');
  const supportIndex = routeSupportIndex(supportConfig);
  const manifestPaths = new Set(routes.map((route) => route.path));
  const missing = routes.filter((route) => !supportIndex.has(route.path)).map((route) => route.path);
  const extra = [...supportIndex.keys()].filter((routePath) => !manifestPaths.has(routePath));
  if (missing.length || extra.length) fail(`support coverage drift (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);

  const coverageRoutes = routes.map((route) => {
    const support = supportIndex.get(route.path);
    return {
      order: route.order,
      path: route.path,
      testPath: concreteDemoPath(route.path, supportConfig.pathParameters),
      canonicalPath: route.canonicalPath,
      family: route.family,
      minimumRole: route.minimumRole,
      support,
      fixtureSetup: supportConfig.fixtureSetups?.[route.path] ?? 'seed',
      acceptance: acceptanceFor(route, support),
    };
  });
  const summary = Object.fromEntries(supportKinds.map((support) => [support, coverageRoutes.filter((route) => route.support === support).length]));
  const routeByPath = new Map(coverageRoutes.map((route) => [route.path, route]));
  const manifestFamilies = [...new Set(routes.map((route) => route.family))].sort();
  const representativeFamilies = Object.keys(supportConfig.playwrightRepresentatives ?? {}).sort();
  if (JSON.stringify(representativeFamilies) !== JSON.stringify(manifestFamilies)) {
    fail(`Playwright representatives must cover every family (expected ${manifestFamilies.join(', ')})`);
  }
  const playwrightCases = manifestFamilies.flatMap((family) => ['guest', 'member'].map((persona) => {
    const routePath = supportConfig.playwrightRepresentatives[family]?.[persona];
    const route = routeByPath.get(routePath);
    if (!route || route.family !== family) fail(`invalid ${family}/${persona} Playwright representative`);
    return {
      id: `${family}:${persona}`,
      family,
      persona,
      path: route.path,
      testPath: route.testPath,
      support: route.support,
      expected: route.acceptance[persona],
      canonicalPath: route.canonicalPath,
    };
  }));
  const coverage = {
    schemaVersion: 'rinspace-demo-coverage/v1',
    generatedFrom: ['src/app/routing/routeManifest.tsx', 'config/demo-route-support.json'],
    routeCount: coverageRoutes.length,
    summary,
    playwright: {
      strategy: 'one guest and one applicable member route per page family',
      cases: playwrightCases,
    },
    routes: coverageRoutes,
  };
  const metadata = {
    schemaVersion: 'rinspace-route-metadata/v1',
    contractVersion: 'v1',
    generatedFrom: [
      'src/app/routing/routeManifest.tsx',
      ...routeTitleLocales.map((locale) => `src/i18n/resources/${locale}/common.json`),
    ],
    siteConfigFields: ['canonicalOrigin', 'basePath', 'site.name', 'site.shortName', 'site.description', 'site.defaultLocale', 'site.sourceUrl', 'site.legalEntity', 'site.contactEmail', 'site.brand.logoPath'],
    metadataTemplate: {
      title: '{pageTitle} · {site.name}',
      defaultTitle: '{site.name}',
      canonical: '{canonicalOrigin}{basePath}{canonicalPath}',
      description: '{site.description}',
      openGraph: {
        type: 'website',
        siteName: '{site.name}',
        title: '{resolvedTitle}',
        description: '{site.description}',
        url: '{canonicalUrl}',
      },
    },
    staticHosting: {
      historyFallbackRequired: true,
      siteMetadataOnly: true,
      dynamicHtmlInjection: false,
      limitation: 'Generic static hosting serves runtime-configured site metadata and client routing, but does not provide per-request HTML injection for dynamic content routes.',
    },
    routes: routes.map((route) => {
      const titleName = route.titleKey.replace(/^routes\./, '');
      const localizedTitles = Object.fromEntries(routeTitleLocales.map((locale) => {
        const title = routeTitleCatalog[locale]?.[titleName];
        if (typeof title !== 'string' || !title.trim()) fail(`${route.titleKey} is missing for locale ${locale}`);
        if (/(Rinspace|芥子环)/.test(title)) fail(`${route.titleKey} in ${locale} must be a page title without a hard-coded site brand`);
        return [locale, title];
      }));
      return {
        order: route.order,
        path: route.path,
        canonicalPath: route.canonicalPath,
        titleKey: route.titleKey,
        localizedTitles,
        family: route.family,
        minimumRole: route.minimumRole,
        htmlMode: htmlMode(route, supportIndex.get(route.path)),
        pathParameters: routeParameters(route.path),
      };
    }),
  };
  return { coverage, metadata };
}

function documentation(coverage) {
  const labels = {
    interactive: 'Interactive / 可交互',
    'read-only': 'Read-only / 只读',
    'production-only': 'Production-only / 仅生产',
    'not-yet-supported': 'Not yet supported / 暂未支持',
  };
  const rows = coverage.routes.map((route) => `| \`${route.path}\` | ${route.family} | ${labels[route.support]} | ${route.minimumRole} | \`${route.testPath}\` | ${route.acceptance.guest} | ${route.acceptance.member} |`);
  return `# Demo route coverage / 演示路由覆盖\n\nThis table is generated from the repository-owned route manifest and its audited demo-support association. Do not edit it by hand.\n\n本表由仓库内的路由 manifest 与经审计的 demo-support 关联表生成，不应手工修改。\n\nGeneric static hosting provides one runtime-configured site shell and BrowserRouter fallback. It does not provide per-request HTML/SSR metadata for dynamic content; the official Go shell consumes \`contracts/route-metadata.json\` for that integration.\n\n通用静态托管只提供一份运行时配置的站点外壳与 BrowserRouter fallback，不提供动态内容的逐请求 HTML/SSR metadata；官方 Go 外壳通过 \`contracts/route-metadata.json\` 集成。\n\nSummary: ${supportKinds.map((support) => `${labels[support]} ${coverage.summary[support]}`).join('; ')}.\n\n| Route | Family | Demo support | Minimum role | Playwright path | Guest | Member |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;
}

function emit(file, value) {
  if (mode === 'check') {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== value) {
      fail(`${path.relative(projectRoot, file)} is stale; run pnpm generate:route-contracts`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function main() {
  const sourceText = fs.readFileSync(manifestPath, 'utf8');
  if (sourceText.includes('specs/rinspace-animate-ui-redesign') || sourceText.includes('Generated by scripts/redesign')) {
    fail('route manifest must be repository-owned and must not depend on monorepo evidence');
  }
  const routes = readRouteManifestSource(sourceText);
  const supportConfig = readJson(supportPath);
  const { coverage, metadata } = buildRouteContracts(routes, supportConfig, readRouteTitleCatalog());
  emit(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`);
  emit(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  emit(documentationPath, documentation(coverage));
  process.stdout.write(`Route contracts ${mode} passed: ${routes.length} routes; ${supportKinds.map((support) => `${support}=${coverage.summary[support]}`).join(', ')}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
