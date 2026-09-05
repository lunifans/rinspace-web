import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { readRouteManifestSource } from "./generate-route-contracts.mjs";
import { buildWorldRouteContract } from "./generate-world-routes.mjs";

const manifestSource = fs.readFileSync(
  new URL("../src/app/routing/routeManifest.tsx", import.meta.url),
  "utf8",
);
const routeSource = JSON.parse(
  fs.readFileSync(
    new URL("../config/world-routes.json", import.meta.url),
    "utf8",
  ),
);
const routes = readRouteManifestSource(manifestSource);

test("classifies every public manifest route and every shared route exactly once", () => {
  const contract = buildWorldRouteContract(routes, routeSource);
  const manifestRoutes = contract.routes.filter(
    (route) => route.source === "rinspace-web-manifest",
  );

  assert.equal(manifestRoutes.length, 85);
  assert.equal(new Set(manifestRoutes.map((route) => route.pattern)).size, 85);
  assert.equal(contract.manifestCoverage.routeCount, 85);
  assert.equal(
    contract.routes.find((route) => route.pattern === "/")?.kind,
    "dual",
  );
  assert.equal(
    contract.routes.find((route) => route.pattern === "/a/:postId/:titleSlug")
      ?.kind,
    "outer-only",
  );
  assert.equal(
    contract.routes.find((route) => route.pattern === "/p/:id/:slug")?.kind,
    "inner-only",
  );
  assert.equal(
    contract.routes.find((route) => route.pattern === "/users/:username")?.kind,
    "federation-disabled",
  );
  assert.equal(
    contract.routes.find((route) => route.pattern === "/@:username/:statusId")
      ?.kind,
    "reserved",
  );
  for (const path of [
    "/runtime-config.json",
    "/site.webmanifest",
    "/healthz",
  ]) {
    const route = contract.routes.find((candidate) => candidate.pattern === path);
    assert.deepEqual(
      [route?.kind, route?.owners, route?.anonymousPolicy],
      ["service", ["rinspace-web"], "public"],
    );
  }
});

test("fails closed when the public manifest changes without route review", () => {
  const changedRoutes = [
    ...routes,
    {
      ...routes[0],
      order: routes.length,
      path: "/new-unreviewed-page",
      canonicalPath: "/new-unreviewed-page",
    },
  ];

  assert.throws(
    () => buildWorldRouteContract(changedRoutes, routeSource),
    /manifest route count changed/,
  );
});

test("rejects an additional route that shadows an existing route pattern", () => {
  const changedSource = structuredClone(routeSource);
  changedSource.additionalRoutes.push({
    id: "invalid.duplicate-home",
    pattern: "/",
    kind: "dual",
    priority: 1,
    owners: ["rinspace-web", "mastodon"],
    anonymousPolicy: "public",
    flip: "same-path",
  });

  assert.throws(
    () => buildWorldRouteContract(routes, changedSource),
    /duplicate route pattern \//,
  );
});
