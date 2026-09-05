import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { readRouteManifestSource } from "./generate-route-contracts.mjs";

const projectRoot = process.cwd();
const manifestPath = path.join(
  projectRoot,
  "src/app/routing/routeManifest.tsx",
);
const sourcePath = path.join(projectRoot, "config/world-routes.json");
const contractPath = path.join(projectRoot, "contracts/world-routes.json");
const generatedTypeScriptPath = path.join(
  projectRoot,
  "packages/world-shell/src/generated/world-routes.ts",
);
const documentationPaths = [
  path.join(projectRoot, "docs/world-routes.md"),
  path.join(projectRoot, "docs/world-routes.zh-CN.md"),
];
const mode = process.argv.includes("--check") ? "check" : "write";

const routeKinds = new Set([
  "dual",
  "outer-only",
  "inner-only",
  "service",
  "federation-disabled",
  "reserved",
]);
const runtimeOwners = new Set([
  "rinspace-web",
  "mastodon",
  "rinspace-private",
  "blocked",
]);
const anonymousPolicies = new Set([
  "public",
  "authenticated",
  "runtime-policy",
  "service-policy",
  "blocked",
]);
const flipStrategies = new Set([
  "same-path",
  "binding",
  "opposite-home",
  "none",
]);

function fail(message) {
  throw new Error(`World route generation failed: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(
      `${path.relative(projectRoot, file)} is invalid JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

function orderedPathSha256(routes) {
  const source = `${JSON.stringify(routes.map((route) => route.path))}\n`;
  return `sha256:${crypto.createHash("sha256").update(source).digest("hex")}`;
}

function ensureStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${label} must be an array of strings`);
  }
  return value;
}

function defaultOwners(kind) {
  if (kind === "dual") return ["rinspace-web", "mastodon"];
  if (kind === "outer-only") return ["rinspace-web"];
  return ["blocked"];
}

function defaultAnonymousPolicy(route, kind) {
  if (kind === "federation-disabled" || kind === "reserved") return "blocked";
  if (route.minimumRole === "member") return "authenticated";
  return kind === "dual" ? "runtime-policy" : "public";
}

function defaultCanonicalWorld(kind, pattern) {
  if (kind === "dual") return "query-for-inner";
  if (kind === "inner-only") {
    return pattern === "/p/:id" || pattern === "/p/:id/:slug"
      ? "path-owned"
      : "query-for-inner";
  }
  if (kind === "outer-only") return "path-owned";
  return "not-applicable";
}

function defaultFlip(kind) {
  if (kind === "dual") return "same-path";
  if (kind === "outer-only" || kind === "inner-only") return "opposite-home";
  return "none";
}

function defaultPriority(kind, order) {
  const bases = {
    service: 1000,
    "federation-disabled": 2000,
    "inner-only": 3000,
    dual: 4000,
    "outer-only": 5000,
    reserved: 9000,
  };
  return bases[kind] + order;
}

function validateAdditionalRoute(route, index) {
  const label = `additionalRoutes[${index}]`;
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    fail(`${label} must be an object`);
  }
  if (typeof route.id !== "string" || !/^[a-z0-9][a-z0-9.-]+$/.test(route.id)) {
    fail(`${label}.id is invalid`);
  }
  if (
    typeof route.pattern !== "string" ||
    (route.pattern !== "*" && !route.pattern.startsWith("/"))
  ) {
    fail(`${label}.pattern is invalid`);
  }
  if (!routeKinds.has(route.kind)) fail(`${label}.kind is invalid`);
  if (!Number.isInteger(route.priority) || route.priority < 0) {
    fail(`${label}.priority must be a non-negative integer`);
  }
  if (
    !Array.isArray(route.owners) ||
    route.owners.length < 1 ||
    route.owners.length > 2 ||
    route.owners.some((owner) => !runtimeOwners.has(owner)) ||
    new Set(route.owners).size !== route.owners.length
  ) {
    fail(`${label}.owners is invalid`);
  }
  if (!anonymousPolicies.has(route.anonymousPolicy)) {
    fail(`${label}.anonymousPolicy is invalid`);
  }
  if (!flipStrategies.has(route.flip)) fail(`${label}.flip is invalid`);
}

export function buildWorldRouteContract(routes, source) {
  if (
    source?.schemaVersion !== "rinspace-world-route-source/v1" ||
    typeof source.contractVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(source.contractVersion)
  ) {
    fail(
      "config/world-routes.json has an unsupported schema or contract version",
    );
  }
  if (!source.manifestGuard || !source.classificationOverrides) {
    fail(
      "config/world-routes.json must declare manifestGuard and classificationOverrides",
    );
  }

  const actualHash = orderedPathSha256(routes);
  if (source.manifestGuard.routeCount !== routes.length) {
    fail(
      `manifest route count changed: expected ${source.manifestGuard.routeCount}, found ${routes.length}`,
    );
  }
  if (source.manifestGuard.orderedPathSha256 !== actualHash) {
    fail(
      `manifest path set changed: expected ${source.manifestGuard.orderedPathSha256}, found ${actualHash}; classify the route before updating the guard`,
    );
  }

  const manifestPathSet = new Set(routes.map((route) => route.path));
  if (manifestPathSet.size !== routes.length)
    fail("manifest paths must be unique");
  const classificationByPath = new Map(
    routes.map((route) => [route.path, "outer-only"]),
  );
  const explicitlyClassified = new Set();

  for (const [kind, values] of Object.entries(source.classificationOverrides)) {
    if (
      !routeKinds.has(kind) ||
      ["outer-only", "inner-only", "service"].includes(kind)
    ) {
      fail(
        `classificationOverrides.${kind} is not an allowed manifest override`,
      );
    }
    for (const routePath of ensureStringArray(
      values,
      `classificationOverrides.${kind}`,
    )) {
      if (!manifestPathSet.has(routePath)) {
        fail(
          `classification override references unknown manifest path ${routePath}`,
        );
      }
      if (explicitlyClassified.has(routePath)) {
        fail(
          `manifest path ${routePath} has more than one classification override`,
        );
      }
      explicitlyClassified.add(routePath);
      classificationByPath.set(routePath, kind);
    }
  }

  const bindingFlipPaths = new Set(
    ensureStringArray(source.bindingFlipPaths, "bindingFlipPaths"),
  );
  for (const routePath of bindingFlipPaths) {
    if (!manifestPathSet.has(routePath)) {
      fail(`bindingFlipPaths references unknown manifest path ${routePath}`);
    }
  }

  const manifestRoutes = routes.map((route) => {
    const kind = classificationByPath.get(route.path);
    const flip = bindingFlipPaths.has(route.path)
      ? "binding"
      : defaultFlip(kind);
    return {
      id: `rinspace-web.route.${route.order}`,
      pattern: route.path,
      kind,
      priority: defaultPriority(kind, route.order),
      owners: defaultOwners(kind),
      anonymousPolicy: defaultAnonymousPolicy(route, kind),
      flip,
      canonicalWorld: defaultCanonicalWorld(kind, route.path),
      source: "rinspace-web-manifest",
      manifestOrder: route.order,
      canonicalPath: route.canonicalPath,
      minimumRole: route.minimumRole,
    };
  });

  if (!Array.isArray(source.additionalRoutes)) {
    fail("additionalRoutes must be an array");
  }
  source.additionalRoutes.forEach(validateAdditionalRoute);
  const additionalRoutes = source.additionalRoutes.map((route) => ({
    ...route,
    canonicalWorld: defaultCanonicalWorld(route.kind, route.pattern),
    source: "shared-contract",
  }));
  const allRoutes = [...additionalRoutes, ...manifestRoutes].sort(
    (left, right) =>
      left.priority - right.priority || left.id.localeCompare(right.id),
  );
  const routeIds = new Set();
  const routePatterns = new Set();
  for (const route of allRoutes) {
    if (routeIds.has(route.id)) fail(`duplicate route id ${route.id}`);
    if (routePatterns.has(route.pattern)) {
      fail(`duplicate route pattern ${route.pattern}`);
    }
    routeIds.add(route.id);
    routePatterns.add(route.pattern);
  }

  return {
    schemaVersion: "rinspace-world-routes/v1",
    contractVersion: source.contractVersion,
    generatedFrom: [
      "src/app/routing/routeManifest.tsx",
      "config/world-routes.json",
    ],
    worldQuery: {
      parameter: "world",
      innerValue: "inner",
      outerRepresentation: "omitted",
      invalidValue: "strip-and-use-route-default",
    },
    resolutionOrder: [
      "service",
      "federation-disabled",
      "reserved",
      "inner-only",
      "dual",
      "outer-only",
      "unmatched",
    ],
    manifestCoverage: {
      routeCount: routes.length,
      orderedPathSha256: actualHash,
    },
    routes: allRoutes,
  };
}

function documentation(contract, locale) {
  const chinese = locale === "zh-CN";
  const heading = chinese
    ? "Rinspace 世界路由契约"
    : "Rinspace world route contract";
  const intro = chinese
    ? "本表由公开前端路由 manifest 与经审计的世界路由配置生成，不应手工修改。除 `/p/*` 永久链接外，里世界网页统一使用 `world=inner`；服务与协议路由不会解释该参数。"
    : "This table is generated from the public frontend route manifest and its audited world-route source. Do not edit it by hand. Inner-world pages use `world=inner` except for permanent `/p/*` links; service and protocol routes ignore it.";
  const rows = contract.routes.map(
    (route) =>
      `| \`${route.pattern}\` | ${route.kind} | ${route.owners.join(", ")} | ${route.flip} | ${route.anonymousPolicy} | ${route.source} |`,
  );
  return `# ${heading}\n\n${intro}\n\nContract version: \`${contract.contractVersion}\`. Manifest routes: ${contract.manifestCoverage.routeCount}.\n\n| Pattern | Kind | Owner | Logo flip | Anonymous policy | Source |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`;
}

function emit(file, value) {
  if (mode === "check") {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== value) {
      fail(
        `${path.relative(projectRoot, file)} is stale; run pnpm generate:world-routes`,
      );
    }
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function main() {
  const sourceText = fs.readFileSync(manifestPath, "utf8");
  const routes = readRouteManifestSource(sourceText);
  const source = readJson(sourcePath);
  const contract = buildWorldRouteContract(routes, source);
  const serialized = `${JSON.stringify(contract, null, 2)}\n`;
  emit(contractPath, serialized);
  emit(
    generatedTypeScriptPath,
    `/* Generated by scripts/generate-world-routes.mjs. Do not edit. */\nimport type { WorldRouteContract } from '../types.js';\n\nexport const defaultWorldRouteContract = ${JSON.stringify(contract, null, 2)} as const satisfies WorldRouteContract;\n`,
  );
  emit(documentationPaths[0], documentation(contract, "en"));
  emit(documentationPaths[1], documentation(contract, "zh-CN"));
  process.stdout.write(
    `World route contract ${mode} passed: ${contract.routes.length} patterns, ${contract.manifestCoverage.routeCount} manifest routes.\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)
) {
  main();
}
