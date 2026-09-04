import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';

import { fireEvent } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';

import { parseRuntimeConfig } from '@/app/config/runtime';
import { assembleRuntimePorts } from '@/platform/runtime';
import type { BootstrapContextValue } from './context';
import { BootstrapError } from './prepare';
import { startApplication } from './start';

const config = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.json'), 'utf8'),
) as unknown);
const modeRuntime: BootstrapContextValue['modeRuntime'] = {
  mode: 'demo',
  persona: 'guest',
  demoRepositoryReady: true,
  demoWorkerReady: true,
  adapters: { auth: 'demo', http: 'msw' },
};
const context: BootstrapContextValue = {
  config,
  modeRuntime,
  ports: assembleRuntimePorts(config, modeRuntime),
};

describe('single-mount application start', () => {
  it('does not create or render a React root before bootstrap completes', async () => {
    const rootElement = document.createElement('div');
    rootElement.innerHTML = '<p>static fallback</p>';
    let release: ((value: BootstrapContextValue) => void) | undefined;
    const prepare = () => new Promise<BootstrapContextValue>((resolve) => { release = resolve; });
    const render = vi.fn();
    const createApplicationRoot = vi.fn(() => ({ render }));
    const start = startApplication({
      rootElement,
      prepare,
      createApplicationRoot,
      renderApplication: () => 'application' as ReactNode,
    });
    await Promise.resolve();
    expect(createApplicationRoot).not.toHaveBeenCalled();
    expect(rootElement.textContent).toBe('static fallback');
    release?.(context);
    await expect(start).resolves.toBe(true);
    expect(createApplicationRoot).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(rootElement.textContent).toBe('');
  });

  it('renders a non-React error page and retries without mounting a failed tree', async () => {
    const rootElement = document.createElement('div');
    const prepare = vi.fn<() => Promise<BootstrapContextValue>>()
      .mockRejectedValueOnce(new BootstrapError('runtime_config_invalid', 'invalid', [
        { path: '$.basePath', code: 'custom', message: 'sensitive value omitted' },
      ]))
      .mockResolvedValueOnce(context);
    const render = vi.fn();
    const createApplicationRoot = vi.fn(() => ({ render }));
    await expect(startApplication({
      rootElement,
      prepare,
      createApplicationRoot,
      renderApplication: () => 'application' as ReactNode,
    })).resolves.toBe(false);
    expect(createApplicationRoot).not.toHaveBeenCalled();
    expect(rootElement.querySelector('[data-rin-bootstrap-error="true"]')).not.toBeNull();
    expect(rootElement.textContent).toContain('$.basePath: custom');
    expect(rootElement.textContent).not.toContain('sensitive value omitted');
    fireEvent.click(Array.from(rootElement.querySelectorAll('button'))[0]);
    await vi.waitFor(() => expect(createApplicationRoot).toHaveBeenCalledOnce());
  });

  it('runs a scoped reset before retry', async () => {
    const rootElement = document.createElement('div');
    const prepare = vi.fn<() => Promise<BootstrapContextValue>>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(context);
    const reset = vi.fn(async () => undefined);
    const createApplicationRoot = vi.fn(() => ({ render: vi.fn() }));
    await startApplication({
      rootElement,
      prepare,
      reset,
      createApplicationRoot,
      renderApplication: () => 'application' as ReactNode,
    });
    fireEvent.click(Array.from(rootElement.querySelectorAll('button'))[1]);
    await vi.waitFor(() => expect(createApplicationRoot).toHaveBeenCalledOnce());
    expect(reset).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
