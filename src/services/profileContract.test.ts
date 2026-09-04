import { describe, expect, it } from 'vitest';

import { parseProfileResponse } from './profile';

describe('profile API contract parser', () => {
  it('accepts the generated public profile shape', () => {
    expect(parseProfileResponse({
      uid: 'demo-reader',
      handle: 'reader',
      nickname: 'Demo Reader',
      rank: 42,
      updatedAt: '2026-09-01T00:00:00Z',
    })).toEqual(expect.objectContaining({ uid: 'demo-reader' }));
  });

  it('rejects unknown, non-string and opaque profile fields', () => {
    expect(parseProfileResponse({ uid: 42 })).toBeNull();
    expect(parseProfileResponse({ uid: 'reader', rank: 4.2 })).toBeNull();
    expect(parseProfileResponse({ uid: 'reader', privateRole: 'admin' })).toBeNull();
  });
});
