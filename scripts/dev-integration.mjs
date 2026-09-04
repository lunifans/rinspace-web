import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

function readOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a value.`);
  return value;
}

export function validateLoopbackOrigin(value, label = "backend") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute loopback HTTP(S) origin.`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !loopbackHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    !["", "/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${label} must be a credential-free loopback HTTP(S) origin.`,
    );
  }
  return url.origin;
}

export function integrationLaunchPlan(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const backend = validateLoopbackOrigin(
    readOption(
      argv,
      "--backend",
      environment.RINSPACE_DEV_PROXY_TARGET || "http://127.0.0.1:8080",
    ),
    "integration backend",
  );
  const host = readOption(argv, "--host", "127.0.0.1");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("Integration dev host must remain loopback-only.");
  }
  const port = Number.parseInt(readOption(argv, "--port", "5173"), 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      "Integration dev port must be an integer from 1024 through 65535.",
    );
  }
  return Object.freeze({
    backend,
    host,
    port,
    runtimeConfigFile: "runtime.integration.json",
    basePath: "/rinspace/",
    dryRun: argv.includes("--dry-run"),
  });
}

async function main() {
  const plan = integrationLaunchPlan();
  if (plan.dryRun) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  process.stderr.write(
    `[rinspace-web] integration UI http://${plan.host}:${plan.port}${plan.basePath} -> private backend ${plan.backend}\n`,
  );
  const child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      plan.host,
      "--port",
      String(plan.port),
      "--strictPort",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RINSPACE_RUNTIME_CONFIG_FILE: plan.runtimeConfigFile,
        RINSPACE_DEV_PROXY_TARGET: plan.backend,
      },
      stdio: "inherit",
    },
  );
  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => forward("SIGINT"));
  process.once("SIGTERM", () => forward("SIGTERM"));
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
