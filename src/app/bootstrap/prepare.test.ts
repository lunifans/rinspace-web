import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseRuntimeConfig } from '@/app/config/runtime';
import { DemoRepositoryError } from '@/demo/repository';
import type { BootstrapModeRuntime } from './context';
import {
  BootstrapError,
  loadRuntimeConfig,
  prepareBootstrap,
} from './prepare';

const demoInput = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.json'), 'utf8'),
) as unknown;

describe('application bootstrap preparation', () => {
  it('loads runtime config with no-store and validates unknown JSON', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(demoInput));
    const config = await loadRuntimeConfig({
      fetchImpl,
      configUrl: 'http://localhost/runtime-config.json',
    });
    expect(config.mode).toBe('demo');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost/runtime-config.json',
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
  });

  it('does not resolve until mode initialization is ready', async () => {
    let release: ((runtime: BootstrapModeRuntime) => void) | undefined;
    const initializeMode = vi.fn(() => new Promise<BootstrapModeRuntime>((resolve) => { release = resolve; }));
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(demoInput));
    const preparation = prepareBootstrap({
      fetchImpl,
      configUrl: 'http://localhost/runtime-config.json',
      initializeMode,
    });
    let settled = false;
    void preparation.then(() => { settled = true; });
    await vi.waitFor(() => expect(initializeMode).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    release?.({
      mode: 'demo',
      persona: 'guest',
      demoRepositoryReady: true,
      demoWorkerReady: true,
      adapters: { auth: 'demo', http: 'msw' },
    });
    await expect(preparation).resolves.toMatchObject({
      config: { mode: 'demo' },
      modeRuntime: { persona: 'guest', demoRepositoryReady: true, demoWorkerReady: true },
    });
  });

  it('installs public runtime values before initializing mode adapters', async () => {
    const order: string[] = [];
    const installPublicConfig = vi.fn(() => { order.push('config'); });
    await prepareBootstrap({
      fetchImpl: vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(demoInput)),
      configUrl: 'http://localhost/runtime-config.json',
      installPublicConfig,
      initializeMode: async () => {
        order.push('mode');
        return {
          mode: 'demo',
          persona: 'guest',
          demoRepositoryReady: true,
          demoWorkerReady: true,
          adapters: { auth: 'demo', http: 'msw' },
        };
      },
    });
    expect(order.slice(0, 2)).toEqual(['config', 'mode']);
    expect(installPublicConfig).toHaveBeenCalledWith(expect.objectContaining({ basePath: '/' }));
  });

  it('fails when demo initialization reports the worker is not ready', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(demoInput));
    await expect(prepareBootstrap({
      fetchImpl,
      configUrl: 'http://localhost/runtime-config.json',
      initializeMode: async () => ({
        mode: 'demo',
        persona: 'guest',
        demoRepositoryReady: true,
        demoWorkerReady: false,
        adapters: { auth: 'demo', http: 'msw' },
      }),
    })).rejects.toEqual(expect.objectContaining({ code: 'runtime_mode_not_ready' }));
  });

  it('maps repository upgrade blocking to a safe actionable bootstrap result', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(demoInput));
    await expect(prepareBootstrap({
      fetchImpl,
      configUrl: 'http://localhost/runtime-config.json',
      initializeMode: async () => {
        throw new DemoRepositoryError('upgrade_blocked', 'private database detail', true);
      },
    })).rejects.toEqual(expect.objectContaining({
      code: 'demo_repository_upgrade_blocked',
      message: 'Close other Rinspace tabs so demo data can be upgraded, then retry.',
    }));
  });

  it('normalizes config fetch, JSON, and schema failures into safe diagnostics', async () => {
    await expect(loadRuntimeConfig({
      fetchImpl: vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('contains-sensitive-network-detail')),
      configUrl: 'http://localhost/runtime-config.json',
    })).rejects.toEqual(expect.objectContaining({ code: 'runtime_config_unavailable' }));

    const invalid = { ...(demoInput as Record<string, unknown>), schemaVersion: 2 };
    try {
      await loadRuntimeConfig({
        fetchImpl: vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(invalid)),
        configUrl: 'http://localhost/runtime-config.json',
      });
      expect.fail('expected runtime config validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BootstrapError);
      expect((error as BootstrapError).diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: '$.schemaVersion' }),
      ]));
    }
  });

  it('keeps non-demo modes synchronous and consistent', async () => {
    const integration = parseRuntimeConfig(JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'config/runtime.example.json'), 'utf8'),
    ) as unknown);
    const installHttpRuntime = vi.fn();
    const installNetworkPolicy = vi.fn();
    const context = await prepareBootstrap({
      fetchImpl: vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(integration)),
      configUrl: 'http://localhost/runtime-config.json',
      installNetworkPolicy,
      installHttpRuntime,
    });
    expect(context.modeRuntime).toEqual({
      mode: 'integration',
      persona: null,
      demoRepositoryReady: false,
      demoWorkerReady: false,
      adapters: { auth: 'compatible', http: 'compatible' },
    });
    expect(installNetworkPolicy).toHaveBeenCalledWith(context.config);
    expect(installHttpRuntime).toHaveBeenCalledWith(context.config, context.ports.http);
  });

  it('stops bootstrap when required runtime ports cannot be assembled', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(demoInput));
    await expect(prepareBootstrap({
      fetchImpl,
      configUrl: 'http://localhost/runtime-config.json',
      initializeMode: async () => ({
        mode: 'demo',
        persona: 'guest',
        demoRepositoryReady: true,
        demoWorkerReady: true,
        adapters: { auth: 'demo', http: 'msw' },
      }),
      assemblePorts: () => { throw new Error('internal adapter detail'); },
    })).rejects.toEqual(expect.objectContaining({
      code: 'runtime_ports_assembly_failed',
      message: 'Runtime adapters could not be assembled safely.',
    }));
  });
});
