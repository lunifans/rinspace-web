import { type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { BootstrapContextValue } from './context';
import { renderBootstrapError, resetBootstrapState } from './errorPage';
import { prepareBootstrap } from './prepare';

type StartApplicationDependencies = Readonly<{
  rootElement: HTMLElement;
  prepare?: () => Promise<BootstrapContextValue>;
  createApplicationRoot?: (element: HTMLElement) => Pick<Root, 'render'>;
  renderApplication: (context: BootstrapContextValue) => ReactNode;
  reset?: () => Promise<void>;
}>;

export async function startApplication(dependencies: StartApplicationDependencies): Promise<boolean> {
  const prepare = dependencies.prepare ?? prepareBootstrap;
  try {
    const context = await prepare();
    dependencies.rootElement.replaceChildren();
    const root = (dependencies.createApplicationRoot ?? createRoot)(dependencies.rootElement);
    root.render(dependencies.renderApplication(context));
    return true;
  } catch (error) {
    const retry = () => { void startApplication(dependencies); };
    const reset = () => {
      void (dependencies.reset ?? resetBootstrapState)().then(() => startApplication(dependencies));
    };
    renderBootstrapError(dependencies.rootElement, error, { retry, reset });
    return false;
  }
}
