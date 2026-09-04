import type { RuntimeConfig } from '@/app/config/runtime';
import type { BootstrapModeRuntime, DemoPersona } from '@/app/bootstrap/types';
import {
  createCloudBaseAuthAdapter,
  createDemoAuthAdapter,
} from '@/platform/auth/adapters';
import { createRuntimeHttpTransport } from '@/platform/http';
import { getDemoRepositoryRuntime } from '@/demo/repository';

export type AuthOtpChallenge = Readonly<{
  verificationId: string;
  phoneNumber: string;
  isUser: boolean;
}>;

export type RuntimeCapability =
  | 'content.read'
  | 'content.interact'
  | 'content.create'
  | 'demo.reset'
  | 'upload.local'
  | 'renderer.remote'
  | 'workspace.remote';

export class CapabilityUnavailable extends Error {
  readonly code = 'capability_unavailable';
  readonly capability: RuntimeCapability;
  readonly mode: RuntimeConfig['mode'];
  readonly adapter: string;
  readonly dependency: string;
  readonly recoverable = true;

  constructor(input: Readonly<{
    capability: RuntimeCapability;
    mode: RuntimeConfig['mode'];
    adapter: string;
    dependency: string;
  }>) {
    super(`Capability ${input.capability} is unavailable in the selected runtime.`);
    this.name = 'CapabilityUnavailable';
    this.capability = input.capability;
    this.mode = input.mode;
    this.adapter = input.adapter;
    this.dependency = input.dependency;
  }

  toJSON() {
    return {
      code: this.code,
      capability: this.capability,
      mode: this.mode,
      adapter: this.adapter,
      dependency: this.dependency,
      recoverable: this.recoverable,
    };
  }
}

export class RuntimePortAssemblyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuntimePortAssemblyError';
    this.code = code;
  }
}

export type RuntimeAuthSnapshot = Readonly<{
  status: 'guest' | 'authenticated' | 'restoring';
  user: Readonly<{
    id: string;
    username: string;
    publicUserId: string;
    displayName: string;
    avatarUrl: string | null;
    language: string;
    colorScheme: string;
  }> | null;
  roles: readonly string[];
  capabilities: ReadonlySet<RuntimeCapability>;
}>;

export interface AuthAdapter {
  readonly kind: 'demo-auth' | 'compatible-auth' | 'cloudbase-auth';
  getSnapshot(): RuntimeAuthSnapshot;
  getAccessToken(): Promise<string | null>;
  getDeviceId(): string | null;
  subscribe(listener: (snapshot: RuntimeAuthSnapshot) => void): () => void;
  start(): () => void;
  restore(): Promise<RuntimeAuthSnapshot>;
  signOut(): Promise<RuntimeAuthSnapshot>;
  sendPhoneOtp(phone: string): Promise<AuthOtpChallenge>;
  completePhoneOtp(challenge: AuthOtpChallenge, token: string): Promise<RuntimeAuthSnapshot>;
  updatePreferences(input: Readonly<{ language?: string; colorScheme?: string }>): RuntimeAuthSnapshot;
  updateProfile?(input: Readonly<{
    username?: string;
    publicUserId?: string;
    displayName?: string;
    avatarUrl?: string | null;
  }>): RuntimeAuthSnapshot;
  setDemoPersona?(persona: DemoPersona): RuntimeAuthSnapshot;
}

export type RuntimeHttpRequest = Readonly<{
  path: string;
  scope?: 'api' | 'admin-api' | 'auth';
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  bodyEncoding?: 'json' | 'form-data';
  responseType?: 'json' | 'text';
  auth?: 'none' | 'optional' | 'required';
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  cache?: RequestCache;
}>;

export interface HttpTransport {
  readonly kind: 'demo-msw-http' | 'compatible-http' | 'official-http';
  request(request: RuntimeHttpRequest): Promise<unknown>;
  requestRaw(request: RuntimeHttpRequest): Promise<Response>;
}

export interface CapabilityProvider {
  readonly kind: 'demo-capabilities' | 'remote-capabilities';
  snapshot(): ReadonlySet<RuntimeCapability>;
  has(capability: RuntimeCapability): boolean;
  require(capability: RuntimeCapability): void;
}

export interface UploadAdapter {
  readonly kind: 'demo-upload' | 'compatible-upload' | 'official-upload';
  upload(input: Readonly<{ name: string; type: string; bytes: Blob }>): Promise<Readonly<{ url: string }>>;
}

export interface RendererAdapter {
  readonly kind: 'demo-renderer' | 'compatible-renderer' | 'official-renderer';
  render(input: Readonly<{ format: 'markdown' | 'latex'; source: string }>): Promise<Readonly<{ html: string }>>;
}

export interface WorkspaceAdapter {
  readonly kind: 'demo-workspace' | 'compatible-workspace' | 'official-workspace';
  open(input: Readonly<{ projectId: string }>): Promise<Readonly<{ url: string }>>;
}

export type RuntimePorts = Readonly<{
  auth: AuthAdapter;
  http: HttpTransport;
  capabilities: CapabilityProvider;
  uploads: UploadAdapter;
  renderer: RendererAdapter;
  workspace: WorkspaceAdapter;
}>;

const demoCapabilitiesByPersona: Readonly<Record<DemoPersona, readonly RuntimeCapability[]>> = {
  guest: ['content.read', 'demo.reset'],
  member: ['content.read', 'content.interact', 'content.create', 'upload.local', 'demo.reset'],
};

export function immutableCapabilities(values: readonly RuntimeCapability[]): ReadonlySet<RuntimeCapability> {
  const target = new Set(values);
  const immutable = new Proxy(target, {
    get(set, property) {
      if (property === 'add' || property === 'delete' || property === 'clear') {
        return () => { throw new TypeError('Runtime capabilities are immutable.'); };
      }
      const value = Reflect.get(set, property, set) as unknown;
      return typeof value === 'function' ? value.bind(set) : value;
    },
  });
  Object.freeze(immutable);
  return immutable;
}

function capabilityProvider(
  mode: RuntimeConfig['mode'],
  readValues: () => ReadonlySet<RuntimeCapability>,
): CapabilityProvider {
  const kind = mode === 'demo' ? 'demo-capabilities' : 'remote-capabilities';
  return Object.freeze({
    kind,
    snapshot: readValues,
    has: (capability: RuntimeCapability) => readValues().has(capability),
    require: (capability: RuntimeCapability) => {
      if (!readValues().has(capability)) {
        throw new CapabilityUnavailable({
          capability,
          mode,
          adapter: kind,
          dependency: mode === 'demo' ? 'demo-persona-capability' : 'backend-capabilities-response',
        });
      }
    },
  });
}

function unavailable(
  mode: RuntimeConfig['mode'],
  adapter: string,
  capability: RuntimeCapability,
  dependency: string,
): CapabilityUnavailable {
  return new CapabilityUnavailable({ mode, adapter, capability, dependency });
}

function uploadAdapter(mode: RuntimeConfig['mode'], kind: UploadAdapter['kind']): UploadAdapter {
  return Object.freeze({
    kind,
    upload: async () => {
      throw unavailable(mode, kind, 'upload.local', mode === 'demo' ? 'demo-blob-repository' : 'compatible-upload-service');
    },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read local demo upload.'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

function demoUploadAdapter(auth: AuthAdapter): UploadAdapter {
  return Object.freeze({
    kind: 'demo-upload',
    async upload(input: Parameters<UploadAdapter['upload']>[0]) {
      if (auth.getSnapshot().status !== 'authenticated') {
        throw unavailable('demo', 'demo-upload', 'upload.local', 'demo-member-persona');
      }
      if (!input.type.startsWith('image/') || input.bytes.size > 2 * 1024 * 1024) {
        throw unavailable('demo', 'demo-upload', 'upload.local', 'local-image-up-to-2mb');
      }
      const repository = getDemoRepositoryRuntime();
      if (!repository) throw unavailable('demo', 'demo-upload', 'upload.local', 'demo-blob-repository');
      const bytes = await readBlobBytes(input.bytes);
      const key = `demo-profile-upload-${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();
      await repository.transaction(['blobs'], 'readwrite', async (transaction) => {
        await transaction.put('blobs', {
          key,
          name: input.name,
          type: input.type,
          bytes,
          createdAt,
        });
      });
      return { url: `data:${input.type};base64,${bytesToBase64(bytes)}` };
    },
  });
}

function rendererAdapter(mode: RuntimeConfig['mode'], kind: RendererAdapter['kind']): RendererAdapter {
  return Object.freeze({
    kind,
    render: async () => {
      throw unavailable(mode, kind, 'renderer.remote', mode === 'demo' ? 'browser-renderer' : 'compatible-renderer-service');
    },
  });
}

function workspaceAdapter(mode: RuntimeConfig['mode'], kind: WorkspaceAdapter['kind']): WorkspaceAdapter {
  return Object.freeze({
    kind,
    open: async () => {
      throw unavailable(mode, kind, 'workspace.remote', mode === 'demo' ? 'demo-workspace-simulation' : 'compatible-workspace-service');
    },
  });
}

function demoPorts(config: RuntimeConfig, modeRuntime: BootstrapModeRuntime): RuntimePorts {
  if (!modeRuntime.demoRepositoryReady || !modeRuntime.demoWorkerReady || modeRuntime.persona === null) {
    throw new RuntimePortAssemblyError('demo_not_ready', 'Demo ports require a ready repository, worker and persona.');
  }
  const capabilities = immutableCapabilities(demoCapabilitiesByPersona[modeRuntime.persona]);
  const auth = createDemoAuthAdapter(modeRuntime.persona, capabilities, modeRuntime.demoMemberIdentity ?? undefined);
  return Object.freeze({
    auth,
    http: createRuntimeHttpTransport(config, auth, 'demo-msw-http'),
    capabilities: capabilityProvider('demo', () => auth.getSnapshot().capabilities),
    uploads: demoUploadAdapter(auth),
    renderer: rendererAdapter('demo', 'demo-renderer'),
    workspace: workspaceAdapter('demo', 'demo-workspace'),
  });
}

function remotePorts(config: RuntimeConfig, mode: 'integration' | 'official'): RuntimePorts {
  const isOfficial = mode === 'official';
  const capabilities = immutableCapabilities([]);
  const auth = createCloudBaseAuthAdapter(isOfficial ? 'cloudbase-auth' : 'compatible-auth');
  return Object.freeze({
    auth,
    http: createRuntimeHttpTransport(config, auth, isOfficial ? 'official-http' : 'compatible-http'),
    capabilities: capabilityProvider(mode, () => capabilities),
    uploads: uploadAdapter(mode, isOfficial ? 'official-upload' : 'compatible-upload'),
    renderer: rendererAdapter(mode, isOfficial ? 'official-renderer' : 'compatible-renderer'),
    workspace: workspaceAdapter(mode, isOfficial ? 'official-workspace' : 'compatible-workspace'),
  });
}

const assemblers: Readonly<Record<
  RuntimeConfig['mode'],
  (config: RuntimeConfig, runtime: BootstrapModeRuntime) => RuntimePorts
>> = {
  demo: demoPorts,
  integration: (config) => remotePorts(config, 'integration'),
  official: (config) => remotePorts(config, 'official'),
};

export function assembleRuntimePorts(
  config: RuntimeConfig,
  modeRuntime: BootstrapModeRuntime,
): RuntimePorts {
  if (config.mode !== modeRuntime.mode) {
    throw new RuntimePortAssemblyError('mode_mismatch', 'Validated config and initialized runtime mode do not match.');
  }
  if (config.auth.provider !== modeRuntime.adapters.auth) {
    throw new RuntimePortAssemblyError('auth_adapter_mismatch', 'Initialized auth adapter does not match runtime config.');
  }
  const expectedHttp = config.mode === 'demo' ? 'msw' : config.mode === 'integration' ? 'compatible' : 'official';
  if (modeRuntime.adapters.http !== expectedHttp) {
    throw new RuntimePortAssemblyError('http_adapter_mismatch', 'Initialized HTTP adapter does not match runtime config.');
  }
  return assemblers[config.mode](config, modeRuntime);
}
