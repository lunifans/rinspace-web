import { describe, expect, it } from 'vitest';

import { isApiErrorResponse, parseApiErrorResponse } from './apiError';

describe('generated API error contract', () => {
  it('accepts direct and enveloped unified errors', () => {
    expect(parseApiErrorResponse({ code: 'not_found', message: 'Missing' })).toEqual({ code: 'not_found', message: 'Missing' });
    expect(parseApiErrorResponse({ error: { code: 'permission_denied', message: 'Denied' } })).toEqual({ code: 'permission_denied', message: 'Denied' });
  });

  it('rejects legacy or malformed shapes at the generated contract boundary', () => {
    expect(isApiErrorResponse({ message: 'legacy only' })).toBe(false);
    expect(isApiErrorResponse({ error: 'not structured' })).toBe(false);
  });
});
