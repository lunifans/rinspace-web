import {
  parseRuntimeConfig,
  RuntimeConfigError,
  type RuntimeConfig,
} from '@/app/config/runtime';
import { installPublicRuntimeConfig } from '@/app/config/env';
import { applySiteMetadata } from '@/app/config/siteMetadata';
import { assembleRuntimePorts, type RuntimePorts } from '@/platform/runtime';
import { installBrowserNetworkPolicy } from '@/platform/http';
import { installHttpClientRuntime } from '@/services/httpClient';
import { DemoRepositoryError } from '@/demo/repository';
import type { BootstrapContextValue } from './context';
import type { BootstrapModeRuntime } from './types';
import { DemoRuntimeInitializationError, initializeDemoRuntime } from './demoRuntime';
import { cleanupRecordedDemoWorker } from './demoWorkerLifecycle';

export class BootstrapError extends Error {
  readonly code: string;
  readonly diagnostics: readonly Readonly<{ path: string; code: string; message: string }>[];

  constructor(
    code: string,
    message: string,
    diagnostics: readonly Readonly<{ path: string; code: string; message: string }>[] = [],
  ) {
    super(message);
    this.name = 'BootstrapError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

type PrepareBootstrapDependencies = Readonly<{
  fetchImpl?: typeof globalThis.fetch;
  configUrl?: string;
  initializeMode?: (config: RuntimeConfig) => Promise<BootstrapModeRuntime>;
  installPublicConfig?: (config: RuntimeConfig) => void;
  applySite?: (config: RuntimeConfig) => void;
  assemblePorts?: (config: RuntimeConfig, modeRuntime: BootstrapModeRuntime) => RuntimePorts;
  installNetworkPolicy?: (config: RuntimeConfig) => void;
  installHttpRuntime?: (config: RuntimeConfig, transport: RuntimePorts['http']) => void;
}>;

function runtimeConfigUrl(): string {
  const configured = document.querySelector<HTMLMetaElement>('meta[name="rinspace-runtime-config"]')?.content;
  const resolved = new URL(configured || '/runtime-config.json', window.location.origin);
  if (resolved.origin !== window.location.origin) {
    throw new BootstrapError('external_runtime_config', 'Runtime configuration must be loaded from this site.');
  }
  return resolved.toString();
}

export async function loadRuntimeConfig({
  fetchImpl = globalThis.fetch,
  configUrl = runtimeConfigUrl(),
}: Pick<PrepareBootstrapDependencies, 'fetchImpl' | 'configUrl'> = {}): Promise<RuntimeConfig> {
  let response: Response;
  try {
    response = await fetchImpl(configUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new BootstrapError('runtime_config_unavailable', 'The public runtime configuration could not be loaded.');
  }
  if (!response.ok) {
    throw new BootstrapError('runtime_config_http_error', `The public runtime configuration returned HTTP ${response.status}.`);
  }
  let input: unknown;
  try {
    input = await response.json() as unknown;
  } catch {
    throw new BootstrapError('runtime_config_invalid_json', 'The public runtime configuration is not valid JSON.');
  }
  try {
    return parseRuntimeConfig(input);
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      throw new BootstrapError('runtime_config_invalid', error.message, error.diagnostics);
    }
    throw error;
  }
}

export async function initializeBootstrapMode(config: RuntimeConfig): Promise<BootstrapModeRuntime> {
  if (config.mode === 'demo') return initializeDemoRuntime(config);
  await cleanupRecordedDemoWorker();
  return Object.freeze({
    mode: config.mode,
    persona: null,
    demoRepositoryReady: false,
    demoWorkerReady: false,
    adapters: Object.freeze({
      auth: config.auth.provider,
      http: config.mode === 'integration' ? 'compatible' : 'official',
    }),
  });
}

export async function prepareBootstrap(
  dependencies: PrepareBootstrapDependencies = {},
): Promise<BootstrapContextValue> {
  const config = await loadRuntimeConfig(dependencies);
  (dependencies.installPublicConfig ?? installPublicRuntimeConfig)(config);
  let modeRuntime: BootstrapModeRuntime;
  try {
    modeRuntime = await (dependencies.initializeMode ?? initializeBootstrapMode)(config);
  } catch (error) {
    if (error instanceof DemoRepositoryError) {
      const messages: Partial<Record<DemoRepositoryError['code'], string>> = {
        upgrade_blocked: 'Close other Rinspace tabs so demo data can be upgraded, then retry.',
        version_changed: 'Demo data changed in another tab. Reload to continue safely.',
        quota_exceeded: 'Browser storage is full. Reset demo data or free storage, then retry.',
        unavailable: 'This browser does not provide the storage required by demo mode.',
      };
      throw new BootstrapError(`demo_repository_${error.code}`, messages[error.code] ?? 'Demo data could not be prepared safely.');
    }
    if (error instanceof DemoRuntimeInitializationError) {
      throw new BootstrapError(`demo_${error.stage}_failed`, 'The local demo network worker could not be prepared safely.');
    }
    throw new BootstrapError('runtime_mode_initialization_failed', 'The selected runtime mode could not be initialized safely.');
  }
  if (modeRuntime.mode !== config.mode || (config.mode === 'demo' && (!modeRuntime.demoRepositoryReady || !modeRuntime.demoWorkerReady))) {
    throw new BootstrapError('runtime_mode_not_ready', 'The selected runtime mode did not reach a safe ready state.');
  }
  let ports: RuntimePorts;
  try {
    ports = (dependencies.assemblePorts ?? assembleRuntimePorts)(config, modeRuntime);
  } catch {
    throw new BootstrapError('runtime_ports_assembly_failed', 'Runtime adapters could not be assembled safely.');
  }
  try {
    (dependencies.installNetworkPolicy ?? installBrowserNetworkPolicy)(config);
  } catch {
    throw new BootstrapError('runtime_network_policy_failed', 'The runtime network policy could not be installed safely.');
  }
  (dependencies.installHttpRuntime ?? installHttpClientRuntime)(config, ports.http);
  (dependencies.applySite ?? applySiteMetadata)(config);
  return Object.freeze({ config, modeRuntime, ports });
}
