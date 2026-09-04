import routeSupportConfig from '../../../config/demo-route-support.json';

export const demoSupportKinds = [
  'interactive',
  'read-only',
  'production-only',
  'not-yet-supported',
] as const;

export type DemoSupport = typeof demoSupportKinds[number];

type RouteSupportConfig = Readonly<{
  schemaVersion: number;
  support: Readonly<Record<DemoSupport, readonly string[]>>;
}>;

const config = routeSupportConfig as RouteSupportConfig;
const supportByPath = new Map<string, DemoSupport>();

if (config.schemaVersion !== 1) {
  throw new Error('Demo route support schema version is unsupported.');
}

for (const support of demoSupportKinds) {
  for (const path of config.support[support]) {
    if (supportByPath.has(path)) {
      throw new Error(`Demo route support is duplicated: ${path}`);
    }
    supportByPath.set(path, support);
  }
}

export function demoSupportForRoute(path: string): DemoSupport {
  const support = supportByPath.get(path);
  if (!support) throw new Error(`Demo route support is missing: ${path}`);
  return support;
}

export function configuredDemoRoutePaths(): readonly string[] {
  return Object.freeze([...supportByPath.keys()]);
}
