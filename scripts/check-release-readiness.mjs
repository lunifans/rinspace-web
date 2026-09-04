import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const expectBlocked = process.argv.includes("--expect-blocked");
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "config/release-policy.json"), "utf8"),
);
const packageDocument = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const seedManifest = JSON.parse(
  fs.readFileSync(
    path.join(root, "src/demo/fixtures/v1/seed-manifest.generated.json"),
    "utf8",
  ),
);
const blockers = [];

if (policy.releasesEnabled !== true)
  blockers.push("config/release-policy.json keeps releasesEnabled=false");
if (packageDocument.license !== policy.requiredRootLicense) {
  blockers.push(
    `package.json license is ${packageDocument.license}, expected ${policy.requiredRootLicense}`,
  );
}
for (const relative of policy.requiredLegalFiles) {
  if (!fs.existsSync(path.join(root, relative)))
    blockers.push(`required legal file is missing: ${relative}`);
}
if (
  seedManifest.license?.distributionApproved !== true ||
  !seedManifest.license?.effectiveSpdx
) {
  blockers.push("demo dataset distribution license is not approved");
}
try {
  execFileSync(
    process.execPath,
    ["scripts/check-dependencies.mjs", "--release"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    },
  );
} catch (error) {
  const diagnostic = `${error.stdout || ""}\n${error.stderr || ""}`;
  const detail =
    diagnostic.match(/- [^\n]*blocks release/)?.[0] ||
    diagnostic.match(/Error: Dependency policy failed/)?.[0] ||
    error.message;
  blockers.push(`release dependency policy failed: ${detail}`);
}
for (const blocker of policy.blockers || [])
  blockers.push(`declared policy blocker: ${blocker}`);

if (expectBlocked) {
  if (blockers.length === 0)
    throw new Error(
      "Release unexpectedly became ready; update the release evidence and remove --expect-blocked in the same reviewed change.",
    );
  process.stdout.write(
    `Release gate is correctly blocked (${blockers.length} reasons).\n`,
  );
  for (const blocker of blockers) process.stdout.write(`- ${blocker}\n`);
  process.exit(0);
}
if (blockers.length) {
  throw new Error(
    `Release is blocked:\n${blockers.map((blocker) => `- ${blocker}`).join("\n")}`,
  );
}
process.stdout.write(
  "Release readiness passed. This authorizes release artifact generation only; it does not authorize making the repository public.\n",
);
