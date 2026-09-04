import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { craCompatManifest } from "./scripts/cra-compat-manifest";
import { parseRuntimeConfig } from "./src/app/config/runtime";
import { buildSiteWebManifest } from "./src/app/config/siteMetadata";

const approvedRuntimeConfigFiles = [
  "runtime.demo.json",
  "runtime.demo.subpath.json",
  "runtime.example.json",
  "runtime.integration.json",
  "runtime.integration.subpath.json",
  "runtime.official.example.json",
] as const;

function readRuntimeConfig(fileName: string) {
  if (!(approvedRuntimeConfigFiles as readonly string[]).includes(fileName)) {
    throw new Error(
      "RINSPACE_RUNTIME_CONFIG_FILE must name an approved public config file.",
    );
  }
  const configPath = path.resolve(__dirname, "config", fileName);
  return parseRuntimeConfig(
    JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown,
  );
}

const runtimeConfigAsset = (
  config: ReturnType<typeof readRuntimeConfig>,
): Plugin => {
  const source = `${JSON.stringify(config, null, 2)}\n`;
  const manifest = `${JSON.stringify(buildSiteWebManifest(config), null, 2)}\n`;
  return {
    name: "rinspace-runtime-config",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost")
          .pathname;
        const isConfig = pathname.endsWith("/runtime-config.json");
        const isManifest = pathname.endsWith("/site.webmanifest");
        if (!isConfig && !isManifest) return next();
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader(
          "Content-Type",
          isConfig
            ? "application/json; charset=utf-8"
            : "application/manifest+json; charset=utf-8",
        );
        response.end(isConfig ? source : manifest);
      });
    },
  };
};

function readJson(fileName: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, fileName), "utf8"),
  ) as Record<string, unknown>;
}

function sha256File(fileName: string): string {
  return `sha256:${crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.resolve(__dirname, fileName)))
    .digest("hex")}`;
}

function sourceCommit(env: Record<string, string>): string {
  const configured = env.RINSPACE_BUILD_COMMIT || env.GITHUB_SHA || "";
  if (/^[a-f0-9]{40}$/i.test(configured)) return configured.toLowerCase();
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
    }).trim();
    return /^[a-f0-9]{40}$/i.test(commit) ? commit.toLowerCase() : "unknown";
  } catch {
    return "unknown";
  }
}

function buildMetadataAsset(env: Record<string, string>): Plugin {
  const packageDocument = readJson("package.json");
  const seedManifest = readJson(
    "src/demo/fixtures/v1/seed-manifest.generated.json",
  );
  const metadata = Object.freeze({
    schemaVersion: 1,
    applicationVersion: String(packageDocument.version || "0.0.0"),
    sourceCommit: sourceCommit(env),
    builtAt: env.RINSPACE_BUILD_TIME || new Date().toISOString(),
    apiContractVersion: "v1",
    demoDataVersion: String(seedManifest.datasetVersion || "unknown"),
    dependencyLockSha256: sha256File("pnpm-lock.yaml"),
  });
  return {
    name: "rinspace-build-metadata",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify(metadata, null, 2)}\n`,
      });
    },
  };
}

function developmentProxyTarget(
  command: string,
  env: Record<string, string>,
): string {
  if (command !== "serve") return "http://127.0.0.1:8080";
  const candidate = env.RINSPACE_DEV_PROXY_TARGET || "http://127.0.0.1:8080";
  const target = new URL(candidate);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    target.username ||
    target.password ||
    !["", "/"].includes(target.pathname) ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "RINSPACE_DEV_PROXY_TARGET must be a credential-free loopback HTTP(S) origin.",
    );
  }
  return target.origin;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const runtimeConfig = readRuntimeConfig(
    env.RINSPACE_RUNTIME_CONFIG_FILE || "runtime.demo.json",
  );
  const base = command === "build" ? "./" : runtimeConfig.basePath;
  const proxyTarget = developmentProxyTarget(command, env);

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      craCompatManifest(),
      runtimeConfigAsset(runtimeConfig),
      buildMetadataAsset(env),
    ],
    resolve: {
      alias: {
        "react-bootstrap": path.resolve(
          __dirname,
          "src/components/ui/compat.tsx",
        ),
        "@": path.resolve(__dirname, "src"),
        app: path.resolve(__dirname, "src/app"),
        components: path.resolve(__dirname, "src/components"),
        features: path.resolve(__dirname, "src/features"),
        pages: path.resolve(__dirname, "src/pages"),
        services: path.resolve(__dirname, "src/services"),
        styles: path.resolve(__dirname, "src/styles"),
        "@mathjax/src": path.resolve(__dirname, "node_modules/@mathjax/src"),
      },
    },
    build: {
      outDir: "build",
      emptyOutDir: true,
      cssMinify: "lightningcss",
      sourcemap: env.GENERATE_SOURCEMAP === "true",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "index.html"),
        },
        output: {
          entryFileNames: "static/js/[name].[hash].js",
          chunkFileNames: "static/js/[name].[hash].chunk.js",
          assetFileNames: (asset) =>
            asset.name?.endsWith(".css")
              ? "static/css/[name].[hash][extname]"
              : "assets/[name].[hash][extname]",
        },
      },
    },
    server: {
      proxy: {
        "/rinspace/admin/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/rinspace/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/rinspace/auth": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./src/test/setup.ts"],
      css: true,
      coverage: { provider: "v8", reporter: ["text", "json-summary"] },
    },
  };
});
