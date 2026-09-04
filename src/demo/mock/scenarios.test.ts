import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyDemoScenario, parseDemoScenario, type DemoScenarioName } from './scenarios';

describe('reproducible demo scenarios', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['unauthorized', 401],
    ['forbidden', 403],
    ['conflict', 409],
    ['validation', 422],
    ['rate-limited', 429],
    ['server-error', 500],
  ] as const)('maps %s to HTTP %d', async (name, status) => {
    const response = await applyDemoScenario({ current: () => name });
    expect(response?.status).toBe(status);
    await expect(response?.json()).resolves.toMatchObject({ error: { details: { scenario: true } } });
  });

  it('provides deterministic latency and an actual network error for offline', async () => {
    vi.useFakeTimers();
    let finished = false;
    const pending = applyDemoScenario({ current: () => 'latency' }).then((response) => {
      finished = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(649);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeNull();
    const offline = await applyDemoScenario({ current: () => 'offline' });
    expect(offline?.type).toBe('error');
  });

  it('falls back to normal for unknown or corrupt stored values', () => {
    expect(parseDemoScenario('normal')).toBe('normal');
    expect(parseDemoScenario('unexpected' as DemoScenarioName)).toBe('normal');
    expect(parseDemoScenario(null)).toBe('normal');
  });
});
