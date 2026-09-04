import { describe, expect, it } from 'vitest';

import {
  demoProductionCapabilityForPath,
  productionCapabilityCatalog,
  productionCapabilityIds,
} from './productionCapabilities';

describe('production capability catalog', () => {
  it('describes every Task 20 boundary without embedding an external URL', () => {
    expect(productionCapabilityCatalog.map(({ id }) => id)).toEqual(productionCapabilityIds);
    expect(productionCapabilityCatalog.find(({ id }) => id === 'real-upload')?.state).toBe('local-only');
    expect(productionCapabilityCatalog.filter(({ id }) => id !== 'real-upload'))
      .toEqual(expect.arrayContaining(
        productionCapabilityIds
          .filter((id) => id !== 'real-upload')
          .map((id) => expect.objectContaining({ id, state: 'unavailable' })),
      ));
    for (const capability of productionCapabilityCatalog) {
      expect(capability.dependency).not.toMatch(/https?:\/\//);
      expect(capability.recovery).not.toMatch(/https?:\/\//);
    }
  });

  it('fails closed for routes that otherwise poll or redirect to production integrations', () => {
    expect(demoProductionCapabilityForPath('/git-auth')).toBe('gitea');
    expect(demoProductionCapabilityForPath('/tags/42/info/history/physics')).toBe('gitea');
    expect(demoProductionCapabilityForPath('/tags/42/edit/physics')).toBe('gitea');
    expect(demoProductionCapabilityForPath('/tags/new')).toBeNull();
    expect(demoProductionCapabilityForPath('/sponsor')).toBe('payments');
    expect(demoProductionCapabilityForPath('/sponsor/supporters/order-1')).toBe('payments');
    expect(demoProductionCapabilityForPath('/blogs')).toBeNull();
  });
});
