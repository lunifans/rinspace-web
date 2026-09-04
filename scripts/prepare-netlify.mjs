import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { assembleRuntimeShell } from "./static-package.mjs";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a value.`);
  return value;
}

function safeConfiguredFile(root, configured) {
  const configRoot = path.resolve(root, "config");
  const candidate = path.resolve(root, configured);
  const relative = path.relative(configRoot, candidate);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      "RINSPACE_STATIC_CONFIG must name a regular JSON file below config/.",
    );
  }
  if (
    !candidate.endsWith(".json") ||
    !fs.existsSync(candidate) ||
    !fs.statSync(candidate).isFile()
  ) {
    throw new Error(
      "RINSPACE_STATIC_CONFIG must name an existing regular JSON file.",
    );
  }
  if (fs.lstatSync(candidate).isSymbolicLink())
    throw new Error("RINSPACE_STATIC_CONFIG cannot be a symbolic link.");
  return candidate;
}

function applicationDirectory(basePath) {
  return basePath === "/" ? "." : basePath.replace(/^\/+|\/+$/g, "");
}

function assertSafeOutput(root, output, coreDirectory) {
  const candidate = path.resolve(output);
  const allowedParents = [path.resolve(root), path.resolve(os.tmpdir())];
  const isBelowAllowedParent = allowedParents.some((parent) => {
    const relative = path.relative(parent, candidate);
    return (
      relative &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  });
  if (!isBelowAllowedParent)
    throw new Error(
      "Netlify output must be a child of the repository or operating-system temporary directory.",
    );
  const protectedPaths = [
    path.parse(candidate).root,
    os.homedir(),
    path.resolve(root),
    path.resolve(root, coreDirectory),
  ];
  if (protectedPaths.includes(candidate))
    throw new Error("Refusing to replace a protected Netlify output path.");
  const core = path.resolve(root, coreDirectory);
  const outputWithinCore = path.relative(core, candidate);
  const coreWithinOutput = path.relative(candidate, core);
  if (
    (outputWithinCore &&
      outputWithinCore !== ".." &&
      !outputWithinCore.startsWith(`..${path.sep}`)) ||
    (coreWithinOutput &&
      coreWithinOutput !== ".." &&
      !coreWithinOutput.startsWith(`..${path.sep}`))
  ) {
    throw new Error(
      "Netlify output and immutable core directories cannot overlap.",
    );
  }
}

function copyPreparedLayout(staging, output, basePath) {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const relativeApplicationDirectory = applicationDirectory(basePath);
  const destination =
    relativeApplicationDirectory === "."
      ? output
      : path.join(output, relativeApplicationDirectory);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(staging)) {
    if (["_headers", "_redirects"].includes(entry)) continue;
    fs.cpSync(path.join(staging, entry), path.join(destination, entry), {
      recursive: true,
      errorOnExist: false,
    });
  }
  fs.copyFileSync(
    path.join(staging, "_headers"),
    path.join(output, "_headers"),
  );
  fs.copyFileSync(
    path.join(staging, "_redirects"),
    path.join(output, "_redirects"),
  );
  if (basePath !== "/") {
    fs.writeFileSync(
      path.join(output, "404.html"),
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><body><main><h1>Not found</h1></main></body></html>\n',
    );
  }
  return relativeApplicationDirectory;
}

export function prepareNetlifyPackage({
  coreDirectory,
  configFile,
  outputDirectory,
}) {
  const root = process.cwd();
  const output = path.resolve(root, outputDirectory);
  assertSafeOutput(root, output, coreDirectory);
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-netlify-stage-"),
  );
  try {
    const result = assembleRuntimeShell({
      coreDirectory,
      configFile,
      outputDirectory: temporary,
    });
    const relativeApplicationDirectory = copyPreparedLayout(
      temporary,
      output,
      result.config.basePath,
    );
    const runtimePath = path.join(
      output,
      relativeApplicationDirectory === "." ? "" : relativeApplicationDirectory,
      "runtime-config.json",
    );
    const versionPath = path.join(
      output,
      relativeApplicationDirectory === "." ? "" : relativeApplicationDirectory,
      "version.json",
    );
    const immutableGraphSha256 = sha256(
      JSON.stringify(
        Object.entries(result.immutableDigests).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    );
    const manifest = {
      schemaVersion: 1,
      provider: "netlify",
      basePath: result.config.basePath,
      applicationDirectory: relativeApplicationDirectory,
      runtimeConfigSha256: sha256(fs.readFileSync(runtimePath)),
      versionSha256: sha256(fs.readFileSync(versionPath)),
      immutableGraphSha256,
      immutableResourceCount: Object.keys(result.immutableDigests).length,
      platformFiles: ["_headers", "_redirects"],
      rollbackUnit: "atomic-deploy",
    };
    fs.writeFileSync(
      path.join(output, "netlify-deploy.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return Object.freeze({ ...result, manifest, outputDirectory: output });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const root = process.cwd();
  const coreDirectory = option("--core", "build");
  const outputDirectory = option(
    "--out",
    process.env.RINSPACE_STATIC_OUTPUT || "netlify-dist",
  );
  let configFile = option(
    "--config",
    process.env.RINSPACE_STATIC_CONFIG || "config/runtime.demo.json",
  );
  let temporaryConfig;
  try {
    if (process.env.RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON) {
      const temporary = fs.mkdtempSync(
        path.join(os.tmpdir(), "rinspace-netlify-config-"),
      );
      temporaryConfig = temporary;
      configFile = path.join(temporary, "runtime-config.json");
      fs.writeFileSync(
        configFile,
        `${process.env.RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON}\n`,
        { mode: 0o600 },
      );
    } else {
      configFile = safeConfiguredFile(root, configFile);
    }
    const result = prepareNetlifyPackage({
      coreDirectory,
      configFile,
      outputDirectory,
    });
    process.stdout.write(
      `Prepared ${path.relative(root, result.outputDirectory)} for Netlify at ${result.config.basePath} (${result.manifest.immutableResourceCount} immutable resources).\n`,
    );
  } finally {
    if (temporaryConfig)
      fs.rmSync(temporaryConfig, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
