import fs from "node:fs";
import process from "node:process";
import { execFileSync } from "node:child_process";

const lockText = fs.readFileSync("pnpm-lock.yaml", "utf8");
if (!/^lockfileVersion:\s*['"]?9\.0['"]?/m.test(lockText))
  throw new Error("pnpm-lock.yaml must use lockfileVersion 9.0.");
if (/^(?:<{7}|={7}|>{7})/m.test(lockText))
  throw new Error("pnpm-lock.yaml contains merge-conflict markers.");

const base =
  process.env.RINSPACE_DIFF_BASE || process.env.GITHUB_BASE_SHA || "";
if (!base) {
  process.stdout.write(
    "Lockfile structure passed; no comparison base was supplied.\n",
  );
  process.exit(0);
}
if (!/^[0-9a-f]{40}$/i.test(base))
  throw new Error("Lockfile comparison base must be a full commit SHA.");
execFileSync("git", ["cat-file", "-e", `${base}^{commit}`], {
  stdio: "ignore",
});
const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
const packageChanged = changed.includes("package.json");
const lockChanged = changed.includes("pnpm-lock.yaml");
if (packageChanged && !lockChanged)
  throw new Error(
    "package.json changed without pnpm-lock.yaml; regenerate and review the frozen lockfile.",
  );
process.stdout.write(
  `Lockfile diff passed: package.json=${packageChanged}, pnpm-lock.yaml=${lockChanged}, changedFiles=${changed.length}.\n`,
);
