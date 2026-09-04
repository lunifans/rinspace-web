import { describe, expect, it } from 'vitest';

import {
  RINSPACE_API_CONTRACT_VERSION,
  type ApiOperations,
  type ApiSchemas,
} from './api-contract';

describe('generated public API types', () => {
  it('exposes the runtime contract version', () => {
    expect(RINSPACE_API_CONTRACT_VERSION).toBe('v1');
  });

  it('types representative discovery, identity and error payloads', () => {
    const feedQuery = { mode: 'following', page: 2, size: 20 } satisfies ApiOperations['getHomeFeed']['query'];
    const update = { display_name: 'Rin', avatar: { custom: 'https://example.test/avatar.png' } } satisfies ApiOperations['updateCurrentUserInfo']['requestBody'];
    const error = { error: { code: 'permission_denied', message: 'Denied' } } satisfies ApiSchemas['ErrorResponse'];

    expect(feedQuery.mode).toBe('following');
    expect(update.avatar.custom).toContain('/avatar.png');
    expect(error.error.code).toBe('permission_denied');
  });
});
