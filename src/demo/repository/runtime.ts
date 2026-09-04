import type { DemoRepository } from './types';

let activeRepository: DemoRepository | null = null;

export function installDemoRepositoryRuntime(repository: DemoRepository): void {
  if (activeRepository && activeRepository !== repository) activeRepository.close();
  activeRepository = repository;
}

export function getDemoRepositoryRuntime(): DemoRepository | null {
  return activeRepository;
}

export function closeDemoRepositoryRuntime(): void {
  activeRepository?.close();
  activeRepository = null;
}
