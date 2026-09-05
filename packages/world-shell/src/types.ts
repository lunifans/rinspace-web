import type { ReactNode } from "react";

export type WorldState = "outer" | "inner";

export type WorldRouteKind =
  | "dual"
  | "outer-only"
  | "inner-only"
  | "service"
  | "federation-disabled"
  | "reserved";

export type WorldRuntimeOwner =
  | "rinspace-web"
  | "mastodon"
  | "rinspace-private"
  | "blocked";

export type WorldAnonymousPolicy =
  | "public"
  | "authenticated"
  | "runtime-policy"
  | "service-policy"
  | "blocked";

export type WorldFlipStrategy =
  | "same-path"
  | "binding"
  | "opposite-home"
  | "none";

export type WorldCanonicalStrategy =
  | "query-for-inner"
  | "path-owned"
  | "not-applicable";

export type WorldRoute = Readonly<{
  id: string;
  pattern: string;
  kind: WorldRouteKind;
  priority: number;
  owners: readonly WorldRuntimeOwner[];
  anonymousPolicy: WorldAnonymousPolicy;
  flip: WorldFlipStrategy;
  canonicalWorld: WorldCanonicalStrategy;
  source: "rinspace-web-manifest" | "shared-contract";
  manifestOrder?: number;
  canonicalPath?: string;
  minimumRole?: string;
}>;

export type WorldRouteContract = Readonly<{
  schemaVersion: "rinspace-world-routes/v1";
  contractVersion: string;
  generatedFrom: readonly string[];
  worldQuery: Readonly<{
    parameter: "world";
    innerValue: "inner";
    outerRepresentation: "omitted";
    invalidValue: "strip-and-use-route-default";
  }>;
  resolutionOrder: readonly string[];
  manifestCoverage: Readonly<{
    routeCount: number;
    orderedPathSha256: string;
  }>;
  routes: readonly WorldRoute[];
}>;

export type WorldResolution = Readonly<{
  route: WorldRoute | null;
  world: WorldState | null;
  runtime: WorldRuntimeOwner | null;
  canonicalHref: string;
  invalidWorld: boolean;
}>;

export type WorldNavigationReason = "flip" | "current-home" | "runtime-link";

export type WorldNavigationRequest = Readonly<{
  href: string;
  reason: WorldNavigationReason;
  world: WorldState;
}>;

export type WorldShellPorts = Readonly<{
  navigation?: Readonly<{
    navigate: (request: WorldNavigationRequest) => boolean | void;
  }>;
  search?: Readonly<{
    submit: (query: string) => void | Promise<void>;
  }>;
  publishing?: Readonly<{
    open: () => void | Promise<void>;
  }>;
  notifications?: Readonly<{
    open: () => void | Promise<void>;
  }>;
  session?: Readonly<{
    open: () => void | Promise<void>;
  }>;
  theme?: Readonly<{
    toggle: () => void;
  }>;
}>;

export type RinspaceTopbarSlots = Readonly<{
  search?: ReactNode;
  publishing?: ReactNode;
  notifications?: ReactNode;
  theme?: ReactNode;
  session?: ReactNode;
}>;
