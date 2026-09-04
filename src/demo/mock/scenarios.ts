import { delay, HttpResponse } from 'msw';

import type { ApiErrorResponse } from '@/generated/api-contract';

export const demoScenarioStorageKey = 'rinspace.demo.scenario.v1';
export const demoScenarioNames = [
  'normal',
  'offline',
  'latency',
  'unauthorized',
  'forbidden',
  'conflict',
  'validation',
  'rate-limited',
  'server-error',
] as const;

export type DemoScenarioName = typeof demoScenarioNames[number];
export type DemoScenarioSource = Readonly<{ current: () => DemoScenarioName }>;

export function parseDemoScenario(value: string | null | undefined): DemoScenarioName {
  return demoScenarioNames.includes(value as DemoScenarioName) ? value as DemoScenarioName : 'normal';
}

export function createStoredDemoScenarioSource(storage: Pick<Storage, 'getItem'>): DemoScenarioSource {
  return Object.freeze({ current: () => parseDemoScenario(storage.getItem(demoScenarioStorageKey)) });
}

function scenarioError(status: 401 | 403 | 409 | 422 | 429 | 500, code: string, message: string): Response {
  const payload: ApiErrorResponse = { error: { code, message, details: { scenario: true } } };
  return HttpResponse.json(payload, {
    status,
    headers: status === 429 ? { 'Retry-After': '30' } : undefined,
  });
}

export async function applyDemoScenario(source: DemoScenarioSource): Promise<Response | null> {
  switch (source.current()) {
    case 'normal':
      return null;
    case 'latency':
      await delay(650);
      return null;
    case 'offline':
      return HttpResponse.error();
    case 'unauthorized':
      return scenarioError(401, 'demo.scenario.unauthorized', 'The demo scenario requires authentication.');
    case 'forbidden':
      return scenarioError(403, 'demo.scenario.forbidden', 'The demo scenario denied this operation.');
    case 'conflict':
      return scenarioError(409, 'demo.scenario.conflict', 'The demo scenario created a deterministic conflict.');
    case 'validation':
      return scenarioError(422, 'demo.scenario.validation', 'The demo scenario rejected the request fields.');
    case 'rate-limited':
      return scenarioError(429, 'demo.scenario.rate_limited', 'The demo scenario reached its request limit.');
    case 'server-error':
      return scenarioError(500, 'demo.scenario.server_error', 'The demo scenario simulated a server failure.');
  }
}
