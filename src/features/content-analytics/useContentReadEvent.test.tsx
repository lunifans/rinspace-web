import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./readEvents', () => ({
  createContentReadRequestId: vi.fn(() => 'read:1234567890abcdef'),
  recordContentRead: vi.fn(async () => ({ counted: true, readCount: 21 })),
}));

import { recordContentRead } from './readEvents';
import { useContentReadEvent, type ContentReadTarget } from './useContentReadEvent';

describe('useContentReadEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records one read for repeated renders of the same work', async () => {
    const target: ContentReadTarget = { id: 12, slug: 'work-12', type: 'blog' };
    const onReadCount = vi.fn();
    const { rerender } = renderHook(
      ({ current }) => useContentReadEvent({ target: current, onReadCount }),
      { initialProps: { current: target } },
    );
    rerender({ current: { ...target } });
    await waitFor(() => expect(onReadCount).toHaveBeenCalledWith(21));
    expect(recordContentRead).toHaveBeenCalledTimes(1);
  });

  it('ignores content types outside the shared readable configuration', () => {
    renderHook(() => useContentReadEvent({
      target: { id: 9, slug: 'question-9', type: 'question' },
      onReadCount: vi.fn(),
    }));
    expect(recordContentRead).not.toHaveBeenCalled();
  });
});
