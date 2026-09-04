import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageLoadingState } from './LoadingState';

describe('PageLoadingState', () => {
  it('uses the shared circular loading indicator without a route skeleton', () => {
    const { container } = render(<PageLoadingState />);
    expect(screen.getByRole('status', { name: '页面加载中' })).toBeTruthy();
    expect(container.querySelector('.rin-ui-spinner')).toBeTruthy();
    expect(container.querySelector('.rin-route-skeleton')).toBeNull();
  });
});
