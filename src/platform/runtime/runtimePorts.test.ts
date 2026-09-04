import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { BootstrapModeRuntime } from '@/app/bootstrap/types';
import { parseRuntimeConfig } from '@/app/config/runtime';
import {
  closeDemoRepositoryRuntime,
  createMemoryDemoRepository,
  installDemoRepositoryRuntime,
} from '@/demo/repository';
import {
  assembleRuntimePorts,
  CapabilityUnavailable,
  RuntimePortAssemblyError,
} from './index';

const readConfig = (name: string) => parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', name), 'utf8'),
) as unknown);
const demo = readConfig('runtime.demo.json');
const integration = readConfig('runtime.example.json');
const official = readConfig('runtime.official.example.json');

const demoRuntime = (persona: 'guest' | 'member'): BootstrapModeRuntime => ({
  mode: 'demo',
  persona,
  demoRepositoryReady: true,
  demoWorkerReady: true,
  adapters: { auth: 'demo', http: 'msw' },
});

describe('runtime port assembly', () => {
  it('assembles a guest demo with audited read-only capabilities and no credential', async () => {
    const ports = assembleRuntimePorts(demo, demoRuntime('guest'));
    expect(ports.auth.kind).toBe('demo-auth');
    expect(ports.http.kind).toBe('demo-msw-http');
    expect(ports.auth.getSnapshot()).toMatchObject({ status: 'guest', user: null, roles: [] });
    expect(ports.capabilities.has('content.read')).toBe(true);
    expect(ports.capabilities.has('content.create')).toBe(false);
    expect(ports.capabilities.has('demo.reset')).toBe(true);
    await expect(ports.auth.getAccessToken()).resolves.toBeNull();
  });

  it('assembles a member demo with a stable synthetic identity but no fake JWT or admin role', async () => {
    const ports = assembleRuntimePorts(demo, demoRuntime('member'));
    const snapshot = ports.auth.getSnapshot();
    expect(snapshot).toMatchObject({
      status: 'authenticated',
      user: {
        id: 'demo-user-member',
        username: 'demo-orbit-reader',
        publicUserId: 'demo-orbit-reader',
        displayName: '轨道读者',
      },
      roles: ['member', 'author'],
    });
    expect(snapshot.user?.avatarUrl).toMatch(/^data:image\/svg\+xml/);
    expect(snapshot.roles).not.toContain('admin');
    expect(snapshot.roles).not.toContain('moderator');
    expect(ports.capabilities.has('content.create')).toBe(true);
    await expect(ports.auth.getAccessToken()).resolves.toBeNull();
  });

  it('stores member profile images locally and never exposes an upload credential', async () => {
    const repository = createMemoryDemoRepository();
    installDemoRepositoryRuntime(repository);
    try {
      const ports = assembleRuntimePorts(demo, demoRuntime('member'));
      const uploaded = await ports.uploads.upload({
        name: 'avatar.svg',
        type: 'image/svg+xml',
        bytes: new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }),
      });
      expect(uploaded.url).toMatch(/^data:image\/svg\+xml;base64,/);
      await expect(ports.auth.getAccessToken()).resolves.toBeNull();
      await expect(repository.transaction(['blobs'], 'readonly', (transaction) => transaction.getAll('blobs')))
        .resolves.toHaveLength(1);
    } finally {
      closeDemoRepositoryRuntime();
    }
  });

  it('rejects non-image and oversized local uploads before writing repository blobs', async () => {
    const repository = createMemoryDemoRepository();
    installDemoRepositoryRuntime(repository);
    try {
      const ports = assembleRuntimePorts(demo, demoRuntime('member'));
      await expect(ports.uploads.upload({
        name: 'notes.txt',
        type: 'text/plain',
        bytes: new Blob(['not an image'], { type: 'text/plain' }),
      })).rejects.toMatchObject({
        code: 'capability_unavailable',
        capability: 'upload.local',
        dependency: 'local-image-up-to-2mb',
        recoverable: true,
      });
      await expect(ports.uploads.upload({
        name: 'too-large.png',
        type: 'image/png',
        bytes: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' }),
      })).rejects.toMatchObject({
        code: 'capability_unavailable',
        capability: 'upload.local',
        dependency: 'local-image-up-to-2mb',
        recoverable: true,
      });
      await expect(repository.transaction(['blobs'], 'readonly', (transaction) => transaction.getAll('blobs')))
        .resolves.toHaveLength(0);
    } finally {
      closeDemoRepositoryRuntime();
    }
  });

  it('assembles explicit compatible and official adapter families', () => {
    const compatibleRuntime: BootstrapModeRuntime = {
      mode: 'integration',
      persona: null,
      demoRepositoryReady: false,
      demoWorkerReady: false,
      adapters: { auth: 'compatible', http: 'compatible' },
    };
    const officialRuntime: BootstrapModeRuntime = {
      mode: 'official',
      persona: null,
      demoRepositoryReady: false,
      demoWorkerReady: false,
      adapters: { auth: 'cloudbase', http: 'official' },
    };
    expect(assembleRuntimePorts(integration, compatibleRuntime)).toMatchObject({
      auth: { kind: 'compatible-auth' },
      http: { kind: 'compatible-http' },
      uploads: { kind: 'compatible-upload' },
      renderer: { kind: 'compatible-renderer' },
      workspace: { kind: 'compatible-workspace' },
    });
    expect(assembleRuntimePorts(official, officialRuntime)).toMatchObject({
      auth: { kind: 'cloudbase-auth' },
      http: { kind: 'official-http' },
      uploads: { kind: 'official-upload' },
      renderer: { kind: 'official-renderer' },
      workspace: { kind: 'official-workspace' },
    });
  });

  it('returns structured CapabilityUnavailable for dependencies not implemented yet', async () => {
    const ports = assembleRuntimePorts(demo, demoRuntime('member'));
    await expect(ports.workspace.open({ projectId: 'demo-project' })).rejects.toEqual(
      expect.objectContaining({
        code: 'capability_unavailable',
        capability: 'workspace.remote',
        mode: 'demo',
        adapter: 'demo-workspace',
        dependency: 'demo-workspace-simulation',
        recoverable: true,
      }) as CapabilityUnavailable,
    );
    expect(() => ports.capabilities.require('renderer.remote')).toThrow(CapabilityUnavailable);
  });

  it('updates exposed demo capabilities when the persona changes', () => {
    const ports = assembleRuntimePorts(demo, demoRuntime('guest'));
    expect(ports.capabilities.has('content.create')).toBe(false);

    ports.auth.setDemoPersona?.('member');

    expect(ports.capabilities.has('content.create')).toBe(true);
    expect(ports.capabilities.snapshot()).toBe(ports.auth.getSnapshot().capabilities);
  });

  it('fails assembly for missing demo readiness or mismatched mode adapters', () => {
    expect(() => assembleRuntimePorts(demo, {
      ...demoRuntime('guest'),
      demoRepositoryReady: false,
    })).toThrowError(expect.objectContaining({ code: 'demo_not_ready' }));
    expect(() => assembleRuntimePorts(demo, {
      ...demoRuntime('guest'),
      demoWorkerReady: false,
    })).toThrowError(expect.objectContaining({ code: 'demo_not_ready' }));
    expect(() => assembleRuntimePorts(demo, {
      ...demoRuntime('guest'),
      mode: 'official',
    })).toThrowError(expect.objectContaining({ code: 'mode_mismatch' }));
    expect(() => assembleRuntimePorts(demo, {
      ...demoRuntime('guest'),
      adapters: { auth: 'compatible', http: 'msw' },
    })).toThrowError(expect.objectContaining({ code: 'auth_adapter_mismatch' }));
  });

  it('freezes the port collection and all exposed snapshots', () => {
    const ports = assembleRuntimePorts(demo, demoRuntime('member'));
    expect(Object.isFrozen(ports)).toBe(true);
    expect(Object.isFrozen(ports.auth)).toBe(true);
    expect(Object.isFrozen(ports.auth.getSnapshot())).toBe(true);
    expect(() => (ports.capabilities.snapshot() as Set<string>).add('admin')).toThrow(TypeError);
  });

  it('keeps assembly errors distinct from recoverable capability results', () => {
    const error = new RuntimePortAssemblyError('invalid_fixture', 'Invalid fixture');
    expect(error.code).toBe('invalid_fixture');
    expect(error).not.toBeInstanceOf(CapabilityUnavailable);
  });
});
