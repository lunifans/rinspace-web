import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const release = process.argv.includes("--release");
const packageDocument = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "config/dependency-policy.json"), "utf8"),
);
const lockText = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
const failures = [];

if (packageDocument.packageManager !== "pnpm@9.7.0")
  failures.push("packageManager must remain pinned to pnpm@9.7.0");
if (!/^lockfileVersion:\s*['"]?9\.0['"]?/m.test(lockText))
  failures.push("pnpm-lock.yaml must use lockfileVersion 9.0");
if (/^(?:<{7}|={7}|>{7})/m.test(lockText))
  failures.push("pnpm-lock.yaml contains merge-conflict markers");

const licenseGroups = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--json", "--prod"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }),
);
const allowed = new Set(policy.allowedLicenses);
const pending = new Map(
  policy.pendingUnknownPackages.map((entry) => [
    `${entry.name}@${entry.version}`,
    entry,
  ]),
);
let packageCount = 0;
let pendingCount = 0;

for (const [license, packages] of Object.entries(licenseGroups)) {
  packageCount += packages.length;
  for (const dependency of packages) {
    for (const version of dependency.versions) {
      const key = `${dependency.name}@${version}`;
      if (license === "Unknown") {
        const exception = pending.get(key);
        if (!exception)
          failures.push(`${key}: unknown license is not explicitly reviewed`);
        else {
          pendingCount += 1;
          if (release && !exception.releaseAllowed)
            failures.push(`${key}: pending license review blocks release`);
        }
      } else if (!allowed.has(license)) {
        failures.push(`${key}: license expression is not allowed: ${license}`);
      }
    }
  }
}

for (const [key] of pending) {
  const [name, version] = key.startsWith("@")
    ? [key.slice(0, key.lastIndexOf("@")), key.slice(key.lastIndexOf("@") + 1)]
    : key.split("@");
  const present = Object.values(licenseGroups)
    .flat()
    .some((entry) => entry.name === name && entry.versions.includes(version));
  if (!present) failures.push(`${key}: stale pending-license policy entry`);
}

if (failures.length) {
  throw new Error(
    `Dependency policy failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
  );
}
process.stdout.write(
  `Dependency policy passed: ${packageCount} installed production package records, ${pendingCount} explicitly pending license record(s), frozen pnpm 9 lock.\n`,
);
