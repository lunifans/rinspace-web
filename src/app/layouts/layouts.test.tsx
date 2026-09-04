import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RouteLayout } from './index';

describe('route layouts', () => {
  it.each(['PublicLayout', 'ReaderLayout', 'WorkspaceLayout', 'AdminLayout'] as const)('%s exposes a skip target and layout landmark', (kind) => {
    const { container } = render(<RouteLayout kind={kind}><main>内容</main></RouteLayout>);
    expect(screen.getByRole('link', { name: '跳到主要内容' }).getAttribute('href')).toBe('#rin-main-content');
    expect(container.querySelector('[data-layout]')).toBeTruthy();
  });

  it('marks the external integration layout as a frozen styling boundary', () => {
    const { container } = render(<RouteLayout kind="FrozenIntegrationLayout"><main>空间</main></RouteLayout>);
    expect(container.querySelector('[data-rin-ui-boundary="frozen"]')).toBeTruthy();
  });
});
