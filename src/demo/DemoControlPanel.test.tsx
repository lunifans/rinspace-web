import fs from 'node:fs';
import path from 'node:path';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BootstrapProvider, type BootstrapContextValue } from '@/app/bootstrap/context';
import { parseRuntimeConfig } from '@/app/config/runtime';
import { createRinspaceDemoSeed } from '@/demo/fixtures/v1';
import {
  closeDemoRepositoryRuntime,
  createMemoryDemoRepository,
  installDemoRepositoryRuntime,
} from '@/demo/repository';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { AuthProvider } from '@/platform/auth/context';
import { assembleRuntimePorts } from '@/platform/runtime';
import DemoControlPanel from './DemoControlPanel';

const config = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.json'), 'utf8'),
) as unknown);

function demoBootstrap(persona: 'guest' | 'member'): BootstrapContextValue {
  const modeRuntime = {
    mode: 'demo' as const,
    persona,
    demoRepositoryReady: true,
    demoWorkerReady: true,
    adapters: { auth: 'demo' as const, http: 'msw' as const },
  };
  return { config, modeRuntime, ports: assembleRuntimePorts(config, modeRuntime) };
}

describe('DemoControlPanel', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => closeDemoRepositoryRuntime());

  it('switches persona and exposes repository-backed diagnostics', async () => {
    const repository = createMemoryDemoRepository();
    await repository.ensureSeed(await createRinspaceDemoSeed());
    installDemoRepositoryRuntime(repository);
    const bootstrap = demoBootstrap('guest');
    const user = userEvent.setup();
    const { container } = render(
      <LanguageProvider>
        <BootstrapProvider value={bootstrap}>
          <AuthProvider adapter={bootstrap.ports.auth}>
            <DemoControlPanel />
          </AuthProvider>
        </BootstrapProvider>
      </LanguageProvider>,
    );

    await user.click(container.querySelector<HTMLButtonElement>('[data-rin-demo-badge]') as HTMLButtonElement);
    await user.click(container.querySelector<HTMLButtonElement>('[data-rin-demo-persona-option="member"]') as HTMLButtonElement);

    expect(bootstrap.ports.auth.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user: { id: 'demo-user-member', displayName: '轨道读者' },
      roles: ['member', 'author'],
    });
    expect(window.localStorage.getItem('rinspace.demo.persona.v1')).toBe('member');

    await user.click(screen.getByText(/诊断|Diagnostics/));
    await waitFor(() => {
      expect(container.querySelector('[data-rin-demo-dataset]')?.textContent).toBe('rinspace-demo-v1');
    });
  });

  it('resets demo records and scenario while preserving persona, theme, language, and unrelated storage', async () => {
    window.localStorage.setItem('rinspace-theme-v2', 'dark');
    window.localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'en' }));
    window.localStorage.setItem('rinspace.demo.persona.v1', 'member');
    window.localStorage.setItem('unrelated.preference', 'keep');
    const repository = createMemoryDemoRepository();
    await repository.ensureSeed(await createRinspaceDemoSeed());
    await repository.transaction(['relations'], 'readwrite', (transaction) => transaction.put('relations', {
      key: 'demo-local-relation',
      kind: 'like',
      sourceKind: 'user',
      sourceId: 'demo-user-member',
      targetKind: 'content',
      targetId: 'demo-content-mobile-edge',
      createdAt: '2026-06-01T12:00:00.000Z',
    }));
    installDemoRepositoryRuntime(repository);
    const bootstrap = demoBootstrap('member');
    const user = userEvent.setup();
    const { container } = render(
      <LanguageProvider>
        <BootstrapProvider value={bootstrap}>
          <AuthProvider adapter={bootstrap.ports.auth}>
            <DemoControlPanel />
          </AuthProvider>
        </BootstrapProvider>
      </LanguageProvider>,
    );

    await user.click(container.querySelector<HTMLButtonElement>('[data-rin-demo-badge]') as HTMLButtonElement);
    await user.selectOptions(container.querySelector<HTMLSelectElement>('[data-rin-demo-scenario]') as HTMLSelectElement, 'offline');
    expect(window.localStorage.getItem('rinspace.demo.scenario.v1')).toBe('offline');
    await user.click(container.querySelector<HTMLButtonElement>('[data-rin-demo-reset]') as HTMLButtonElement);

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/restored|恢复/));
    const relations = await repository.transaction(['relations'], 'readonly', (transaction) => transaction.getAll('relations'));
    expect(relations).toHaveLength((await createRinspaceDemoSeed()).relations.length);
    expect(relations.some((relation) => relation.key === 'demo-local-relation')).toBe(false);
    expect(window.localStorage.getItem('rinspace.demo.scenario.v1')).toBe('normal');
    expect(window.localStorage.getItem('rinspace.demo.persona.v1')).toBe('member');
    expect(window.localStorage.getItem('rinspace-theme-v2')).toBe('dark');
    expect(window.localStorage.getItem('rinspace-language-preference-v1')).toBe(JSON.stringify({ preference: 'en' }));
    expect(window.localStorage.getItem('unrelated.preference')).toBe('keep');
  });
});
