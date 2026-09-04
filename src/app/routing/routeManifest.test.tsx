import { describe, expect, it } from 'vitest';

import { routeManifest } from './routeManifest';
import { configuredDemoRoutePaths, demoSupportKinds } from './routeSupport';

describe('typed route manifest', () => {
  it('owns all 85 active route facts inside the public frontend', () => {
    expect(routeManifest).toHaveLength(85);
    expect(routeManifest.map((route) => route.order)).toEqual([...Array(85).keys()]);
    expect(new Set(routeManifest.map((route) => route.path)).size).toBe(85);
    expect(routeManifest.every((route) => route.canonicalPath && route.titleKey)).toBe(true);
    expect(routeManifest.filter((route) => route.family === 'operations').map((route) => route.path)).toEqual(['/admin']);
    expect(routeManifest.find((route) => route.path === '/admin')?.minimumRole).toBe('member');
    expect(routeManifest.some((route) => ['/review', '/space', '/admin/content', '/admin/users', '/admin/system', '/admin/records'].includes(route.path))).toBe(false);
  });

  it('associates every route with one audited demo support state', () => {
    expect(new Set(configuredDemoRoutePaths())).toEqual(new Set(routeManifest.map((route) => route.path)));
    expect(new Set(routeManifest.map((route) => route.demoSupport))).toEqual(new Set(demoSupportKinds));
    expect(Object.fromEntries(demoSupportKinds.map((support) => [
      support,
      routeManifest.filter((route) => route.demoSupport === support).length,
    ]))).toEqual({
      interactive: 48,
      'read-only': 22,
      'production-only': 11,
      'not-yet-supported': 4,
    });
  });

  it('keeps the catch-all last and every route lazy-loadable', () => {
    expect(routeManifest.at(-1)?.path).toBe('*');
    expect(routeManifest.slice(0, -1).every((route) => route.path.startsWith('/'))).toBe(true);
    expect(new Set(routeManifest.map((route) => route.order)).size).toBe(85);
  });

  it('does not declare the retired /space route', () => {
    const activePaths: readonly string[] = routeManifest.map((route) => route.path);
    expect(activePaths).not.toContain('/space');
  });
});
