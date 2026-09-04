import type { RuntimeConfig } from '@/app/config/runtime';
import type { RuntimeAuthSnapshot } from '@/platform/runtime';

export type DemoPersona = 'guest' | 'member';

export type BootstrapAdapterSelection = Readonly<{
  auth: 'demo' | 'compatible' | 'cloudbase';
  http: 'msw' | 'compatible' | 'official';
}>;

export type BootstrapModeRuntime = Readonly<{
  mode: RuntimeConfig['mode'];
  persona: DemoPersona | null;
  demoRepositoryReady: boolean;
  demoWorkerReady: boolean;
  adapters: BootstrapAdapterSelection;
  demoMemberIdentity?: Partial<NonNullable<RuntimeAuthSnapshot['user']>> | null;
}>;
