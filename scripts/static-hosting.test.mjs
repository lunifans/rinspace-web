import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";

import { prepareNetlifyPackage } from "./prepare-netlify.mjs";
import { immutableCacheControl } from "./static-package.mjs";
import { startArtifactServer } from "./static-server.mjs";

function writeCore(directory, version = "0.1.0") {
  fs.mkdirSync(path.join(directory, "static/js"), { recursive: true });
  const hash = crypto
    .createHash("sha256")
    .update(version)
    .digest("hex")
    .slice(0, 8);
  const script = `static/js/index.${hash}.js`;
  fs.writeFileSync(
    path.join(directory, script),
    `globalThis.__netlifyFixture=${JSON.stringify(version)};\n`,
  );
  fs.writeFileSync(
    path.join(directory, "mockServiceWorker.js"),
    "// fixture worker\n",
  );
  fs.writeFileSync(
    path.join(directory, "bootstrap-theme.js"),
    "// fixture theme\n",
  );
  fs.writeFileSync(
    path.join(directory, "index.html"),
    `<!doctype html><html lang="en"><head><meta name="description" content="neutral"><meta name="rinspace-runtime-config" content="./runtime-config.json"><title>Neutral</title></head><body><script src="./bootstrap-theme.js"></script><script type="module" src="./${script}"></script></body></html>`,
  );
  fs.writeFileSync(
    path.join(directory, "asset-manifest.json"),
    `${JSON.stringify({ files: { "main.js": `/${script}` }, entrypoints: [`/${script}`] }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(directory, "version.json"),
    `${JSON.stringify({ schemaVersion: 1, applicationVersion: version })}\n`,
  );
  return script;
}

test("Netlify template uses the package command, fixed toolchain, and no deployment credential", () => {
  const source = fs.readFileSync("netlify.toml", "utf8");
  assert.match(source, /command = "pnpm build && pnpm prepare:netlify"/);
  assert.match(source, /publish = "netlify-dist"/);
  assert.match(source, /NODE_VERSION = "22\.22\.3"/);
  assert.match(source, /PNPM_VERSION = "9\.7\.0"/);
  assert.match(source, /skip_processing = true/);
  assert.doesNotMatch(source, /(?:token|password|secret|site[_-]?id)/i);
});

test("Netlify preparation refuses broad or core-overlapping output paths", () => {
  assert.throws(
    () =>
      prepareNetlifyPackage({
        coreDirectory: "build",
        configFile: "config/runtime.demo.json",
        outputDirectory: process.cwd(),
      }),
    /child of the repository|protected Netlify output path/,
  );
  assert.throws(
    () =>
      prepareNetlifyPackage({
        coreDirectory: "build",
        configFile: "config/runtime.demo.json",
        outputDirectory: "build/netlify-dist",
      }),
    /cannot overlap/,
  );
});

test("root and nested Netlify layouts expose platform files at publish root", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-netlify-layout-"),
  );
  try {
    const core = path.join(temporary, "core");
    const script = writeCore(core);
    const root = prepareNetlifyPackage({
      coreDirectory: core,
      configFile: "config/runtime.demo.json",
      outputDirectory: path.join(temporary, "root"),
    });
    const nested = prepareNetlifyPackage({
      coreDirectory: core,
      configFile: "config/runtime.demo.subpath.json",
      outputDirectory: path.join(temporary, "nested"),
    });
    assert.deepEqual(root.immutableDigests, nested.immutableDigests);
    assert.equal(root.manifest.applicationDirectory, ".");
    assert.equal(nested.manifest.applicationDirectory, "rinspace-demo");
    assert.ok(fs.existsSync(path.join(temporary, "root", script)));
    assert.ok(
      fs.existsSync(path.join(temporary, "nested", "rinspace-demo", script)),
    );
    assert.ok(fs.existsSync(path.join(temporary, "nested", "_headers")));
    assert.ok(fs.existsSync(path.join(temporary, "nested", "_redirects")));
    assert.equal(
      fs.readFileSync(path.join(temporary, "nested", "_redirects"), "utf8"),
      "/rinspace-demo/* /rinspace-demo/index.html 200\n",
    );
    const headers = fs.readFileSync(
      path.join(temporary, "nested", "_headers"),
      "utf8",
    );
    assert.match(headers, /\/rinspace-demo\/mockServiceWorker\.js/);
    assert.match(headers, /Service-Worker-Allowed: \/rinspace-demo\//);
    assert.match(
      headers,
      new RegExp(immutableCacheControl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("runtime config can change without changing the immutable core graph", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-netlify-config-"),
  );
  try {
    const core = path.join(temporary, "core");
    writeCore(core);
    const first = prepareNetlifyPackage({
      coreDirectory: core,
      configFile: "config/runtime.demo.json",
      outputDirectory: path.join(temporary, "first"),
    });
    const changedConfig = JSON.parse(
      fs.readFileSync("config/runtime.demo.json", "utf8"),
    );
    changedConfig.site.name = "Rinspace Static Preview";
    changedConfig.site.shortName = "Static Preview";
    changedConfig.site.description =
      "Runtime shell update without rebuilding the immutable core.";
    const changedConfigPath = path.join(temporary, "changed.json");
    fs.writeFileSync(
      changedConfigPath,
      `${JSON.stringify(changedConfig, null, 2)}\n`,
    );
    const second = prepareNetlifyPackage({
      coreDirectory: core,
      configFile: changedConfigPath,
      outputDirectory: path.join(temporary, "second"),
    });
    assert.equal(
      first.manifest.immutableGraphSha256,
      second.manifest.immutableGraphSha256,
    );
    assert.notEqual(
      first.manifest.runtimeConfigSha256,
      second.manifest.runtimeConfigSha256,
    );
    assert.match(
      fs.readFileSync(path.join(temporary, "second", "index.html"), "utf8"),
      /Rinspace Static Preview/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("controlled root and subpath previews preserve fallback, cache, worker scope, and missing-asset 404", async () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-netlify-preview-"),
  );
  try {
    const core = path.join(temporary, "core");
    const script = writeCore(core);
    for (const fixture of [
      { config: "config/runtime.demo.json", basePath: "/", directory: "." },
      {
        config: "config/runtime.demo.subpath.json",
        basePath: "/rinspace-demo/",
        directory: "rinspace-demo",
      },
    ]) {
      const output = path.join(
        temporary,
        fixture.directory === "." ? "root" : "nested",
      );
      prepareNetlifyPackage({
        coreDirectory: core,
        configFile: fixture.config,
        outputDirectory: output,
      });
      const application =
        fixture.directory === "."
          ? output
          : path.join(output, fixture.directory);
      const server = startArtifactServer({
        rootDirectory: application,
        port: 0,
      });
      await once(server, "listening");
      try {
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const origin = `http://127.0.0.1:${address.port}`;
        const response = await fetch(
          `${origin}${fixture.basePath}a/1010/deep-route`,
          {
            headers: { Accept: "text/html" },
          },
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const worker = await fetch(
          `${origin}${fixture.basePath}mockServiceWorker.js`,
        );
        assert.equal(
          worker.headers.get("service-worker-allowed"),
          fixture.basePath,
        );
        const immutable = await fetch(`${origin}${fixture.basePath}${script}`);
        assert.equal(
          immutable.headers.get("cache-control"),
          immutableCacheControl,
        );
        const missing = await fetch(
          `${origin}${fixture.basePath}static/js/missing.js`,
        );
        assert.equal(missing.status, 404);
      } finally {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
