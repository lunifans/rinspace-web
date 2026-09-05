import { defaultWorldRouteContract } from "./generated/world-routes.js";
import type {
  WorldResolution,
  WorldRoute,
  WorldRouteContract,
  WorldRuntimeOwner,
  WorldState,
} from "./types.js";

const localBase = "https://rinspace.invalid";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentExpression(segment: string): string {
  let expression = "";
  let cursor = 0;
  const parameter = /:([A-Za-z][A-Za-z0-9_]*)/g;
  for (const match of segment.matchAll(parameter)) {
    const index = match.index ?? 0;
    expression += escapeRegExp(segment.slice(cursor, index));
    expression += "[^/]+";
    cursor = index + match[0].length;
  }
  expression += escapeRegExp(segment.slice(cursor));
  return expression;
}

function routeExpression(pattern: string): RegExp {
  if (pattern === "*") return /^.*$/;
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    const segments = base.split("/").map(segmentExpression).join("/");
    return new RegExp(`^${segments}(?:/.*)?$`);
  }
  const segments = pattern.split("/").map(segmentExpression).join("/");
  return new RegExp(`^${segments}$`);
}

function routeForPath(
  pathname: string,
  contract: WorldRouteContract,
): WorldRoute | null {
  return (
    contract.routes.find((route) =>
      routeExpression(route.pattern).test(pathname),
    ) ?? null
  );
}

function runtimeForRoute(
  route: WorldRoute,
  world: WorldState | null,
): WorldRuntimeOwner | null {
  if (route.kind === "dual") {
    return route.owners[world === "inner" ? 1 : 0] ?? null;
  }
  return route.owners[0] ?? null;
}

function relativeHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function canonicalizeWorld(url: URL, world: WorldState): string {
  if (world === "inner") url.searchParams.set("world", "inner");
  else url.searchParams.delete("world");
  return relativeHref(url);
}

export function resolveWorld(
  input: string | URL,
  contract: WorldRouteContract = defaultWorldRouteContract,
): WorldResolution {
  const url = new URL(input.toString(), localBase);
  const route = routeForPath(url.pathname, contract);
  if (!route) {
    return {
      route: null,
      world: null,
      runtime: null,
      canonicalHref: relativeHref(url),
      invalidWorld: false,
    };
  }

  if (
    route.kind === "service" ||
    route.kind === "federation-disabled" ||
    route.kind === "reserved"
  ) {
    return {
      route,
      world: null,
      runtime: runtimeForRoute(route, null),
      canonicalHref: relativeHref(url),
      invalidWorld: false,
    };
  }

  const rawWorld = url.searchParams.get(contract.worldQuery.parameter);
  const invalidWorld =
    rawWorld !== null && rawWorld !== contract.worldQuery.innerValue;
  const world: WorldState =
    route.kind === "inner-only"
      ? "inner"
      : route.kind === "outer-only"
        ? "outer"
        : rawWorld === contract.worldQuery.innerValue
          ? "inner"
          : "outer";

  const canonicalHref =
    route.canonicalWorld === "query-for-inner"
      ? canonicalizeWorld(url, world)
      : (() => {
          url.searchParams.delete(contract.worldQuery.parameter);
          return relativeHref(url);
        })();

  return {
    route,
    world,
    runtime: runtimeForRoute(route, world),
    canonicalHref,
    invalidWorld,
  };
}

export function currentWorldHome(world: WorldState): string {
  return world === "inner" ? "/?world=inner" : "/";
}

export function hrefInWorld(
  input: string | URL,
  world: WorldState,
  contract: WorldRouteContract = defaultWorldRouteContract,
): string {
  const resolution = resolveWorld(input, contract);
  if (!resolution.route || resolution.route.kind !== "dual") {
    return resolution.canonicalHref;
  }
  const url = new URL(input.toString(), localBase);
  return canonicalizeWorld(url, world);
}

export type FlipTargetOptions = Readonly<{
  oppositePath?: string;
}>;

export function flipTarget(
  input: string | URL,
  resolution: WorldResolution = resolveWorld(input),
  options: FlipTargetOptions = {},
): string | null {
  if (
    !resolution.route ||
    !resolution.world ||
    resolution.route.flip === "none"
  ) {
    return null;
  }
  const opposite: WorldState = resolution.world === "outer" ? "inner" : "outer";
  if (resolution.route.flip === "opposite-home")
    return currentWorldHome(opposite);

  const source = new URL(input.toString(), localBase);
  if (resolution.route.flip === "binding") {
    if (!options.oppositePath) return currentWorldHome(opposite);
    const mapped = new URL(options.oppositePath, localBase);
    return canonicalizeWorld(mapped, opposite);
  }

  return canonicalizeWorld(source, opposite);
}
