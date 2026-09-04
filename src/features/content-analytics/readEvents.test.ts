import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/httpClient', () => ({ requestJson: vi.fn() }));
vi.mock('@/services/phoneAuth', () => ({ getAuthDeviceId: vi.fn(() => 'anonymous-device') }));

import { requestJson } from '@/services/httpClient';
import { createContentReadRequestId, parseContentReadResponse, recordContentRead } from './readEvents';

describe('content read events', () => {
  it('parses the canonical counter response', () => {
    expect(parseContentReadResponse({ counted: true, readCount: 205 }))
      .toEqual({ counted: true, readCount: 205 });
    expect(() => parseContentReadResponse({ counted: 'yes', readCount: 205 }))
      .toThrow('阅读统计返回格式异常');
  });

  it('creates a stable request-id shape for server idempotency', () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue('12345678-1234-4234-8234-123456789abc');
    expect(createContentReadRequestId()).toBe('read:12345678-1234-4234-8234-123456789abc');
    randomUUID.mockRestore();
  });

  it('uses the shared transport with optional auth and anonymous identity', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ counted: true, readCount: 206 });
    await expect(recordContentRead('work-1', 'read:1234567890abcdef'))
      .resolves.toEqual({ counted: true, readCount: 206 });
    expect(requestJson).toHaveBeenCalledWith('content/work-1/read', {
      method: 'POST',
      auth: 'optional',
      headers: { 'x-device-id': 'anonymous-device' },
      body: { requestId: 'read:1234567890abcdef' },
    });
  });
});
