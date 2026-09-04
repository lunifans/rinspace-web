import { z } from 'zod';

const BLOCKED_DEMO_HOSTS = [
  'rinspace.com',
  'api.tcloudbasegateway.com',
  'tcloudbasegateway.com',
  'cloudbase.net',
] as const;

export const forbiddenRuntimeConfigKeys = [
  'adminPhone',
  'adminPhoneSha256',
  'databasePassword',
  'databaseUrl',
  'privateKey',
  'secret',
  'serviceToken',
] as const;

const forbiddenKeyPattern = /(?:admin.*phone|database.*(?:password|url)|private.*key|secret|service.*token)/i;

const normalizedBasePath = z.string().refine((value) => {
  if (!value.startsWith('/') || !value.endsWith('/')) return false;
  if (value.includes('?') || value.includes('#') || value.includes('\\')) return false;
  if (/\/{2,}/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '.' && segment !== '..');
}, 'Must be / or a normalized absolute path ending in /.');

const publicPath = z.string().refine((value) => {
  if (!value.startsWith('/') || !value.endsWith('/')) return false;
  if (value.includes('?') || value.includes('#') || value.includes('\\')) return false;
  if (/\/{2,}/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '.' && segment !== '..');
}, 'Must be a normalized absolute path ending in /.');

const nullablePublicAssetPath = z.string().refine((value) => (
  value.startsWith('/')
  && !value.includes('?')
  && !value.includes('#')
  && !value.includes('\\')
  && !value.split('/').some((segment) => segment === '.' || segment === '..')
), 'Must be an absolute local asset path.').nullable();

const nullableEmail = z.string().email().nullable();
const nullableHttpsUrl = z.string().url().refine((value) => new URL(value).protocol === 'https:', 'Must use HTTPS.').nullable();
const ManifestIconSchema = z.object({
  src: nullablePublicAssetPath.unwrap(),
  sizes: z.string().regex(/^\d+x\d+(?: \d+x\d+)*$/, 'Must contain explicit icon dimensions.'),
  type: z.enum(['image/png', 'image/svg+xml', 'image/x-icon']),
  purpose: z.enum(['any', 'maskable', 'any maskable']),
}).strict();

export const SiteBrandConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(32),
  description: z.string().trim().min(1).max(240),
  defaultLocale: z.enum(['en', 'zh-CN']),
  contactEmail: nullableEmail,
  sourceUrl: nullableHttpsUrl,
  legalEntity: z.string().trim().min(1).nullable(),
  filings: z.object({
    icp: z.string().trim().min(1).nullable(),
    publicSecurity: z.string().trim().min(1).nullable(),
  }).strict(),
  brand: z.object({
    logoPath: nullablePublicAssetPath,
    faviconPath: nullablePublicAssetPath,
    appleTouchIconPath: nullablePublicAssetPath,
    manifestIcons: z.array(ManifestIconSchema).max(8),
  }).strict(),
  verification: z.object({
    baidu: z.string().trim().min(1).nullable(),
    qihoo360: z.string().trim().min(1).nullable(),
    sogou: z.string().trim().min(1).nullable(),
  }).strict(),
}).strict();

export const ApiRuntimeConfigSchema = z.object({
  baseUrl: z.string().min(1),
  contractVersion: z.string().regex(/^v[1-9]\d*$/, 'Must use a version such as v1.'),
}).strict();

const CloudBasePublicConfigSchema = z.object({
  envId: z.string().trim().min(1),
  region: z.string().regex(/^[a-z]+-[a-z]+$/, 'Must be a public CloudBase region identifier.'),
  publishableKey: z.string().trim().min(1).nullable(),
}).strict();

export const AuthRuntimeConfigSchema = z.object({
  provider: z.enum(['demo', 'compatible', 'cloudbase']),
  endpoint: z.string().min(1).nullable(),
  cloudbase: CloudBasePublicConfigSchema.nullable(),
}).strict();

const IntegrationEndpointSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().min(1).nullable(),
}).strict();

export const IntegrationRuntimeConfigSchema = z.object({
  gitea: IntegrationEndpointSchema,
  renderer: IntegrationEndpointSchema,
  workspace: IntegrationEndpointSchema,
}).strict();

export const FeatureFlagsSchema = z.object({
  demoControls: z.boolean(),
  creator: z.boolean(),
  notifications: z.boolean(),
  externalIntegrations: z.boolean(),
}).strict();

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function validateCanonicalOrigin(value: string): boolean {
  const url = parsedUrl(value);
  if (!url || url.origin !== value || url.username || url.password) return false;
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname));
}

function validateEndpoint(value: string): boolean {
  if (value.startsWith('/')) return publicPath.safeParse(value).success;
  const url = parsedUrl(value);
  if (!url || url.username || url.password || url.search || url.hash) return false;
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname));
}

function isBlockedDemoHost(value: string): boolean {
  const url = parsedUrl(value);
  if (!url) return false;
  return BLOCKED_DEMO_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function pathIsWithinBase(pathname: string, basePath: string): boolean {
  return basePath === '/' || pathname.startsWith(basePath);
}

export const RuntimeConfigSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['demo', 'integration', 'official']),
  basePath: normalizedBasePath,
  canonicalOrigin: z.string().refine(validateCanonicalOrigin, 'Must be an HTTPS origin, or an HTTP loopback origin.'),
  site: SiteBrandConfigSchema,
  api: ApiRuntimeConfigSchema,
  auth: AuthRuntimeConfigSchema,
  integrations: IntegrationRuntimeConfigSchema,
  features: FeatureFlagsSchema,
}).strict().superRefine((config, context) => {
  const endpoints = [
    ['api.baseUrl', config.api.baseUrl],
    ['auth.endpoint', config.auth.endpoint],
    ...Object.entries(config.integrations).map(([name, integration]) => [
      `integrations.${name}.baseUrl`,
      integration.baseUrl,
    ] as const),
  ] as const;

  for (const [fieldPath, endpoint] of endpoints) {
    if (endpoint !== null && !validateEndpoint(endpoint)) {
      context.addIssue({
        code: 'custom',
        path: fieldPath.split('.'),
        message: 'Must be a normalized local path or a safe HTTP(S) endpoint.',
      });
    }
  }
  if (config.api.baseUrl.startsWith('/') && !pathIsWithinBase(config.api.baseUrl, config.basePath)) {
    context.addIssue({
      code: 'custom',
      path: ['api', 'baseUrl'],
      message: 'A local API path must be contained by basePath.',
    });
  }

  const enabledIntegrations = Object.entries(config.integrations)
    .filter(([, integration]) => integration.enabled);
  for (const [name, integration] of Object.entries(config.integrations)) {
    if (integration.enabled !== (integration.baseUrl !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['integrations', name],
        message: 'enabled and baseUrl must be set or cleared together.',
      });
    }
  }

  if (config.mode === 'demo') {
    if (config.auth.provider !== 'demo' || config.auth.endpoint !== null || config.auth.cloudbase !== null) {
      context.addIssue({ code: 'custom', path: ['auth'], message: 'Demo mode requires local demo authentication only.' });
    }
    if (!config.api.baseUrl.startsWith('/')) {
      context.addIssue({ code: 'custom', path: ['api', 'baseUrl'], message: 'Demo mode requires a same-origin API path.' });
    }
    if (enabledIntegrations.length > 0) {
      context.addIssue({ code: 'custom', path: ['integrations'], message: 'Demo mode cannot enable external integrations.' });
    }
    if (config.features.externalIntegrations) {
      context.addIssue({ code: 'custom', path: ['features', 'externalIntegrations'], message: 'Demo mode cannot expose external integrations.' });
    }
    if (isBlockedDemoHost(config.canonicalOrigin)) {
      context.addIssue({ code: 'custom', path: ['canonicalOrigin'], message: 'Demo mode cannot claim an official production origin.' });
    }
  }

  if (config.mode === 'integration' && (config.auth.provider !== 'compatible' || config.auth.cloudbase !== null)) {
    context.addIssue({ code: 'custom', path: ['auth'], message: 'Integration mode requires the compatible auth provider.' });
  }
  if (config.mode === 'official' && config.auth.provider !== 'cloudbase') {
    context.addIssue({ code: 'custom', path: ['auth', 'provider'], message: 'Official mode requires the CloudBase auth provider.' });
  }
  if (config.auth.provider === 'cloudbase' && config.auth.cloudbase === null) {
    context.addIssue({ code: 'custom', path: ['auth', 'cloudbase'], message: 'CloudBase public configuration is required.' });
  }
  if (config.auth.provider !== 'cloudbase' && config.auth.cloudbase !== null) {
    context.addIssue({ code: 'custom', path: ['auth', 'cloudbase'], message: 'CloudBase configuration is only valid for that provider.' });
  }
  if (config.auth.provider === 'compatible' && config.auth.endpoint === null) {
    context.addIssue({ code: 'custom', path: ['auth', 'endpoint'], message: 'Compatible auth requires an endpoint.' });
  }
  if (config.auth.provider !== 'compatible' && config.auth.endpoint !== null) {
    context.addIssue({ code: 'custom', path: ['auth', 'endpoint'], message: 'This auth provider does not accept a separate endpoint.' });
  }
});

export type RuntimeConfig = Readonly<z.infer<typeof RuntimeConfigSchema>>;
export type SiteBrandConfig = Readonly<z.infer<typeof SiteBrandConfigSchema>>;
export type ApiRuntimeConfig = Readonly<z.infer<typeof ApiRuntimeConfigSchema>>;
export type AuthRuntimeConfig = Readonly<z.infer<typeof AuthRuntimeConfigSchema>>;
export type IntegrationRuntimeConfig = Readonly<z.infer<typeof IntegrationRuntimeConfigSchema>>;
export type FeatureFlags = Readonly<z.infer<typeof FeatureFlagsSchema>>;

export type RuntimeConfigDiagnostic = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class RuntimeConfigError extends Error {
  readonly diagnostics: readonly RuntimeConfigDiagnostic[];

  constructor(diagnostics: readonly RuntimeConfigDiagnostic[]) {
    super('The public runtime configuration is invalid.');
    this.name = 'RuntimeConfigError';
    this.diagnostics = diagnostics;
  }
}

function findForbiddenKeys(value: unknown, currentPath = '$'): RuntimeConfigDiagnostic[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findForbiddenKeys(entry, `${currentPath}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const entryPath = `${currentPath}.${key}`;
    const ownDiagnostic = forbiddenKeyPattern.test(key)
      ? [{ path: entryPath, code: 'forbidden_public_config_key', message: 'Secret or identity-derived fields cannot appear in browser runtime configuration.' }]
      : [];
    return [...ownDiagnostic, ...findForbiddenKeys(entry, entryPath)];
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  const forbiddenDiagnostics = findForbiddenKeys(input);
  if (forbiddenDiagnostics.length > 0) throw new RuntimeConfigError(forbiddenDiagnostics);
  const result = RuntimeConfigSchema.safeParse(input);
  if (!result.success) {
    throw new RuntimeConfigError(result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? `$.${issue.path.join('.')}` : '$',
      code: issue.code,
      message: issue.message,
    })));
  }
  return deepFreeze(result.data);
}
