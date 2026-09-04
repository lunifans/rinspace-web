import { setupWorker } from 'msw/browser';

import type { RuntimeConfig } from '@/app/config/runtime';
import type { DemoRepository } from '@/demo/repository';
import { createDemoRequestHandlers } from './handlers';

export function createDemoWorker(config: RuntimeConfig, repository: DemoRepository) {
  return setupWorker(...createDemoRequestHandlers(config, repository));
}
