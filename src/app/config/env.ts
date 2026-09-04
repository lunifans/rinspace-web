import type { RuntimeConfig } from './runtime';

export type RinspacePublicEnv = Readonly<{
  publicBasePath: string;
  basePath: string;
  cloudbaseEnvId: string;
  cloudbaseRegion: string;
  cloudbaseAccessKey: string;
  giteaBasePath: string;
}>;

let runtimeConfig: RuntimeConfig | null = null;

function shellBasePath(): string {
  if (typeof document === 'undefined' || typeof window === 'undefined') return '/';
  const configured = document.querySelector<HTMLMetaElement>('meta[name="rinspace-runtime-config"]')?.content;
  if (!configured) return '/';
  try {
    const url = new URL(configured, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.endsWith('/runtime-config.json')) return '/';
    return url.pathname.slice(0, -'runtime-config.json'.length) || '/';
  } catch {
    return '/';
  }
}

function basePath(): string {
  return runtimeConfig?.basePath ?? shellBasePath();
}

function withoutTrailingSlash(value: string): string {
  return value === '/' ? '' : value.replace(/\/+$/, '');
}

function cloudbaseConfig() {
  return runtimeConfig?.auth.provider === 'cloudbase' ? runtimeConfig.auth.cloudbase : null;
}

export function installPublicRuntimeConfig(config: RuntimeConfig): void {
  runtimeConfig = config;
}

export function getInstalledRuntimeConfig(): RuntimeConfig | null {
  return runtimeConfig;
}

export function resetPublicRuntimeConfigForTests(): void {
  runtimeConfig = null;
}

export const publicEnv: RinspacePublicEnv = Object.freeze({
  get publicBasePath() { return withoutTrailingSlash(basePath()); },
  get basePath() { return basePath(); },
  get cloudbaseEnvId() { return cloudbaseConfig()?.envId ?? ''; },
  get cloudbaseRegion() { return cloudbaseConfig()?.region ?? 'ap-shanghai'; },
  get cloudbaseAccessKey() { return cloudbaseConfig()?.publishableKey ?? ''; },
  get giteaBasePath() {
    const configured = runtimeConfig?.integrations.gitea;
    return configured?.enabled && configured.baseUrl ? configured.baseUrl : '/repos/';
  },
});

export function publicAsset(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${publicEnv.publicBasePath}${path}`;
}
