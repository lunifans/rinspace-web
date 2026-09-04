import { cleanupRecordedDemoWorker } from './demoWorkerLifecycle';
import { resetBrowserNetworkPolicy } from '@/platform/http';
import { closeDemoRepositoryRuntime, deleteIndexedDbDemoRepository } from '@/demo/repository';
import { BootstrapError } from './prepare';

const demoStoragePrefix = 'rinspace.demo.';

export async function resetBootstrapState({
  storage = window.localStorage,
  serviceWorker = navigator.serviceWorker,
  deleteRepository = async () => {
    closeDemoRepositoryRuntime();
    await deleteIndexedDbDemoRepository();
  },
}: {
  storage?: Storage;
  serviceWorker?: Pick<ServiceWorkerContainer, 'getRegistrations'>;
  deleteRepository?: () => Promise<void>;
} = {}): Promise<void> {
  resetBrowserNetworkPolicy();
  await deleteRepository();
  await cleanupRecordedDemoWorker({ storage, serviceWorker });
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith(demoStoragePrefix)));
  for (const key of keys) storage.removeItem(key);
}

function displayDiagnostics(error: unknown): readonly string[] {
  if (!(error instanceof BootstrapError)) return ['startup: unexpected_error'];
  if (error.diagnostics.length === 0) return [`startup: ${error.code}`];
  return error.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.code}`);
}

export function renderBootstrapError(
  rootElement: HTMLElement,
  error: unknown,
  actions: Readonly<{ retry: () => void; reset: () => void }>,
): void {
  const main = document.createElement('main');
  main.dataset.rinBootstrapError = 'true';
  main.setAttribute('role', 'alert');
  main.style.cssText = 'max-width:720px;margin:10vh auto;padding:24px;font:16px/1.6 system-ui,sans-serif;color:#24262b';

  const title = document.createElement('h1');
  title.textContent = 'Rinspace could not start safely';
  const message = document.createElement('p');
  message.textContent = error instanceof BootstrapError
    ? error.message
    : 'Check the public runtime configuration, then retry. No application requests were started.';
  const list = document.createElement('ul');
  for (const diagnostic of displayDiagnostics(error)) {
    const item = document.createElement('li');
    item.textContent = diagnostic;
    list.append(item);
  }
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.addEventListener('click', actions.retry);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset demo data and retry';
  reset.style.marginInlineStart = '12px';
  reset.addEventListener('click', actions.reset);
  main.append(title, message, list, retry, reset);
  rootElement.replaceChildren(main);
}
