import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "config/publication-boundary.json"), "utf8"),
);
const excludedDirectories = new Set([
  ".git",
  "build",
  "coverage",
  "node_modules",
  "package",
  "package-preview-root",
  "package-preview-subpath",
  "playwright-report",
  "release",
  "test-results",
]);
const ignoredBinaryExtensions = new Set([
  ".7z",
  ".avif",
  ".br",
  ".eot",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".otf",
  ".pdf",
  ".png",
  ".tar",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);
const secretPatterns = [
  ["private key", /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
];
const productionDomain = /rinspace\.com|tcloudbasegateway\.com|cloudbase\.net/i;
const failures = [];
let scannedFiles = 0;

function walk(directory, prefix = "") {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      failures.push(
        `${relative}: symbolic links are not allowed in the publication source tree`,
      );
    } else if (entry.isDirectory()) {
      result.push(...walk(absolute, relative));
    } else if (entry.isFile()) {
      result.push(relative);
    }
  }
  return result;
}

function isTestOrDocumentation(relative) {
  return (
    /(?:^|\/)(?:tests?|docs)\//.test(relative) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative) ||
    /(?:^|\/)README(?:\.zh-CN)?\.md$/.test(relative) ||
    relative === "CHANGELOG.md"
  );
}

let files;
try {
  files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "."],
    {
      cwd: root,
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
} catch {
  files = walk(root).sort();
}
const allowedEnvironmentFiles = new Set(policy.allowedEnvironmentFiles);
const productionAllowlist = new Set(
  policy.productionDomainAllowlist.map((entry) => entry.path),
);

for (const relative of files) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) continue;
  if (fs.lstatSync(absolute).isSymbolicLink()) {
    failures.push(
      `${relative}: symbolic links are not allowed in the publication source tree`,
    );
    continue;
  }
  const basename = path.posix.basename(relative);
  if (
    (basename === ".env" || basename.startsWith(".env.")) &&
    !allowedEnvironmentFiles.has(relative)
  ) {
    failures.push(
      `${relative}: environment file is not in the publication allowlist`,
    );
  }
  if (ignoredBinaryExtensions.has(path.extname(relative).toLowerCase()))
    continue;
  const buffer = fs.readFileSync(absolute);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  scannedFiles += 1;
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text))
      failures.push(`${relative}: detected ${label} shape`);
  }
  const isDemoSurface = policy.demoSurfacePrefixes.some(
    (prefix) => relative === prefix || relative.startsWith(prefix),
  );
  if (
    isDemoSurface &&
    !isTestOrDocumentation(relative) &&
    productionDomain.test(text)
  ) {
    failures.push(
      `${relative}: demo runtime surface contains a production domain`,
    );
  }
  if (
    !isTestOrDocumentation(relative) &&
    !relative.startsWith("scripts/") &&
    productionDomain.test(text) &&
    !productionAllowlist.has(relative)
  ) {
    failures.push(
      `${relative}: production domain occurrence lacks a narrow policy entry`,
    );
  }
}

for (const entry of policy.productionDomainAllowlist) {
  const absolute = path.join(root, entry.path);
  if (!fs.existsSync(absolute))
    failures.push(`${entry.path}: stale production-domain allowlist entry`);
  else if (!productionDomain.test(fs.readFileSync(absolute, "utf8"))) {
    failures.push(
      `${entry.path}: allowlisted file no longer contains a production domain`,
    );
  }
  if (typeof entry.reason !== "string" || entry.reason.length < 20) {
    failures.push(
      `${entry.path}: production-domain allowlist reason is not auditable`,
    );
  }
}

if (failures.length) {
  throw new Error(
    `Publication boundary failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
  );
}
process.stdout.write(
  `Publication boundary passed: ${scannedFiles} text files, ${productionAllowlist.size} reviewed production-domain files, no secret shapes.\n`,
);
