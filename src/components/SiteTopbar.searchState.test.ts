import { describe, expect, it } from 'vitest';

import { shouldShowTopbarSearchPreview } from './SiteTopbar';

describe('topbar instant search visibility', () => {
  it('opens only while search is active and the query is long enough', () => {
    expect(shouldShowTopbarSearchPreview('索引', true)).toBe(true);
    expect(shouldShowTopbarSearchPreview('索引', false)).toBe(false);
    expect(shouldShowTopbarSearchPreview('索', true)).toBe(false);
  });
});
