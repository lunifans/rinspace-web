import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  integrationLaunchPlan,
  validateLoopbackOrigin,
} from "./dev-integration.mjs";

test("integration dev uses a fixed public runtime config and a server-only loopback proxy", () => {
  const plan = integrationLaunchPlan(
    ["--backend", "http://localhost:9090", "--port", "5190", "--dry-run"],
    {},
  );
  assert.deepEqual(plan, {
    backend: "http://localhost:9090",
    host: "127.0.0.1",
    port: 5190,
    runtimeConfigFile: "runtime.integration.json",
    basePath: "/rinspace/",
    dryRun: true,
  });
  const config = JSON.parse(
    fs.readFileSync("config/runtime.integration.json", "utf8"),
  );
  assert.equal(config.api.baseUrl, "/rinspace/api/");
  assert.equal(config.auth.endpoint, "/rinspace/auth/v1/");
  assert.equal(JSON.stringify(config).includes("9090"), false);
  const keys = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      visit(child);
    }
  };
  visit(config);
  assert.equal(
    keys.some((key) => /proxy|target/i.test(key)),
    false,
  );
});

test("integration dev rejects remote, credentialed, and path-bearing proxy targets", () => {
  for (const invalid of [
    "https://api.example.com",
    "http://user:password@127.0.0.1:8080",
    "http://127.0.0.1:8080/private",
    "file:///tmp/backend.sock",
  ])
    assert.throws(() => validateLoopbackOrigin(invalid), /loopback/);
  assert.throws(
    () => integrationLaunchPlan(["--host", "0.0.0.0"], {}),
    /loopback-only/,
  );
  assert.throws(() => integrationLaunchPlan(["--port", "80"], {}), /1024/);
});

test("Vite proxy has no legacy browser env fallback and covers local API/auth prefixes", () => {
  const source = fs.readFileSync("vite.config.ts", "utf8");
  assert.doesNotMatch(source, /REACT_APP_API_URL/);
  assert.match(source, /RINSPACE_DEV_PROXY_TARGET/);
  for (const prefix of [
    "/rinspace/admin/api",
    "/rinspace/api",
    "/rinspace/auth",
  ]) {
    assert.ok(source.includes(prefix));
  }
});
