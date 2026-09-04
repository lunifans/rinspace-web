export const productionCapabilityIds = [
  'gitea',
  'code-server',
  'renderer',
  'quiver',
  'payments',
  'sms',
  'real-upload',
] as const;

export type ProductionCapabilityId = typeof productionCapabilityIds[number];

export type ProductionCapabilityState = 'unavailable' | 'local-only';

export type ProductionCapabilityDefinition = Readonly<{
  id: ProductionCapabilityId;
  state: ProductionCapabilityState;
  dependency: string;
  recovery: string;
}>;

export const productionCapabilityCatalog = Object.freeze([
  {
    id: 'gitea',
    state: 'unavailable',
    dependency: 'same-origin Gitea service and identity bridge',
    recovery: 'configure integration or official mode with a compatible Gitea adapter',
  },
  {
    id: 'code-server',
    state: 'unavailable',
    dependency: 'authenticated remote workspace service',
    recovery: 'configure integration or official mode with a compatible workspace adapter',
  },
  {
    id: 'renderer',
    state: 'unavailable',
    dependency: 'asynchronous document renderer and job API',
    recovery: 'configure integration or official mode with a compatible renderer adapter',
  },
  {
    id: 'quiver',
    state: 'unavailable',
    dependency: 'same-origin Quiver application and diagram API',
    recovery: 'configure integration or official mode with the Quiver application enabled',
  },
  {
    id: 'payments',
    state: 'unavailable',
    dependency: 'payment order service, provider credentials, and callback verification',
    recovery: 'use an official deployment with the payment backend explicitly enabled',
  },
  {
    id: 'sms',
    state: 'unavailable',
    dependency: 'supported authentication provider and configured SMS sender',
    recovery: 'configure integration or official authentication and its server-side SMS sender',
  },
  {
    id: 'real-upload',
    state: 'local-only',
    dependency: 'compatible object storage and upload authorization service',
    recovery: 'use the local image simulation or configure an integration or official upload adapter',
  },
] as const satisfies readonly ProductionCapabilityDefinition[]);

const capabilityById = new Map(
  productionCapabilityCatalog.map((capability) => [capability.id, capability]),
);

export function productionCapability(id: ProductionCapabilityId) {
  const capability = capabilityById.get(id);
  if (!capability) throw new Error(`Unknown production capability: ${id}`);
  return capability;
}

export function demoProductionCapabilityForPath(pathname: string): ProductionCapabilityId | null {
  if (pathname === '/git-auth') return 'gitea';
  if (/^\/tags\/[^/]+\/info\/history(?:\/[^/]+)?\/?$/.test(pathname)) return 'gitea';
  if (/^\/tags\/[^/]+\/(?:edit(?:\/[^/]+)?|[^/]+\/edit)\/?$/.test(pathname)) return 'gitea';
  if (pathname === '/sponsor' || pathname.startsWith('/sponsor/')) return 'payments';
  return null;
}
