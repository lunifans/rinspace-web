import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();
const documents = ["README.md", "README.zh-CN.md"].map((name) => ({
  name,
  source: fs.readFileSync(path.join(root, name), "utf8"),
}));
const expectedSections = [
  "product",
  "scope",
  "demo",
  "screenshots",
  "quick-start",
  "reset",
  "static-deployment",
  "docker-deployment",
  "ai-assisted-deployment",
  "integration",
  "architecture",
  "configuration",
  "testing",
  "contributing",
  "licensing",
  "security",
  "limitations",
];
const requiredCommands = [
  "pnpm install --frozen-lockfile",
  "pnpm start",
  "corepack prepare pnpm@9.7.0 --activate",
  "corepack pnpm install --frozen-lockfile",
  "npm install --global pnpm@9.7.0",
  "pnpm build",
  "pnpm package -- --config config/runtime.demo.json --out package",
  "pnpm preview:artifact -- --root package --port 4173",
  "docker compose up --build",
  "docker compose up --build -d --remove-orphans",
  "curl --fail --silent --show-error http://127.0.0.1:8080/healthz",
  "docker compose down",
  "git commit -s -m",
  "git push -u origin",
  "pnpm test",
  "pnpm test:static-package",
  "pnpm test:container-contract",
];
const requiredSetupGuidance = [
  "Windows 10/11",
  "macOS",
  "Linux",
  "https://nodejs.org/en/download",
  "https://pnpm.io/installation",
  "winget install --exact --id Git.Git --source winget",
  "brew install node@22",
  "sudo apt install --yes git ca-certificates curl",
  "winget install --exact --id Docker.DockerDesktop --source winget",
  "brew install --cask docker",
  "sudo apt install --yes docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
  "https://docs.docker.com/desktop/setup/install/windows-install/",
  "https://docs.docker.com/desktop/setup/install/mac-install/",
  "https://docs.docker.com/engine/install/",
];
const requiredAiGuidance = [
  "AGENTS.md",
  "https://github.com/lunifans/rinspace-web",
  "5173/8080",
  "/healthz",
  "/version.json",
  "runtime config",
];
const requiredPublicKeys = [
  "RINSPACE_PUBLIC_BASE_PATH",
  "RINSPACE_PUBLIC_API_BASE_URL",
  "RINSPACE_PUBLIC_CANONICAL_ORIGIN",
  "RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON",
];

for (const document of documents) {
  const sections = [
    ...document.source.matchAll(/<!--\s*rinspace-section:\s*([a-z-]+)\s*-->/g),
  ].map((match) => match[1]);
  if (JSON.stringify(sections) !== JSON.stringify(expectedSections)) {
    throw new Error(
      `${document.name} section contract differs: ${sections.join(", ")}`,
    );
  }
  for (const command of requiredCommands) {
    if (!document.source.includes(command))
      throw new Error(`${document.name} is missing command: ${command}`);
  }
  for (const guidance of requiredSetupGuidance) {
    if (!document.source.includes(guidance))
      throw new Error(
        `${document.name} is missing setup guidance: ${guidance}`,
      );
  }
  for (const guidance of requiredAiGuidance) {
    if (!document.source.toLowerCase().includes(guidance.toLowerCase()))
      throw new Error(
        `${document.name} is missing AI deployment guidance: ${guidance}`,
      );
  }
  for (const key of requiredPublicKeys) {
    if (!document.source.includes(key))
      throw new Error(`${document.name} is missing public config key: ${key}`);
  }
  for (const phrase of ["AGPL-3.0-only", "commercial", "production-only"]) {
    if (!document.source.toLowerCase().includes(phrase.toLowerCase()))
      throw new Error(
        `${document.name} is missing release-boundary phrase: ${phrase}`,
      );
  }
  for (const match of document.source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|#)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(root, target)))
      throw new Error(`${document.name} references a missing image: ${target}`);
  }
}

if (!documents[0].source.includes("[简体中文](./README.zh-CN.md)"))
  throw new Error("English README is missing the Chinese link.");
if (!documents[1].source.includes("[English](./README.md)"))
  throw new Error("Chinese README is missing the English link.");
const quickStart = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/quick-start-verification.json"),
    "utf8",
  ),
);
if (
  quickStart.result !== "passed" ||
  quickStart.environment?.cleanWorkingDirectory !== true
) {
  throw new Error(
    "Quick-start evidence must come from a passing clean working directory.",
  );
}
if (
  !Number.isFinite(quickStart.timingMilliseconds?.total) ||
  quickStart.timingMilliseconds.total >= 180_000
) {
  throw new Error(
    "The recorded quick start did not reach ready within three minutes.",
  );
}
const screenshotManifest = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/assets/screenshots/manifest.json"),
    "utf8",
  ),
);
for (const [name, width, height] of [
  ["demo-guest-desktop.png", 1440, 1000],
  ["demo-member-desktop.png", 1440, 1000],
  ["demo-guest-mobile.png", 390, 844],
  ["demo-member-mobile.png", 390, 844],
]) {
  const png = fs.readFileSync(path.join(root, "docs/assets/screenshots", name));
  if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height)
    throw new Error(`${name} dimensions changed.`);
  const sha256 = crypto.createHash("sha256").update(png).digest("hex");
  if (screenshotManifest.files?.[name]?.sha256 !== sha256)
    throw new Error(`${name} differs from the screenshot manifest.`);
}
process.stdout.write(
  `README parity passed (${expectedSections.length} shared sections, ${requiredCommands.length} shared commands, ${requiredSetupGuidance.length} setup requirements, ${requiredAiGuidance.length} AI deployment requirements, ${quickStart.timingMilliseconds.total} ms quick start).\n`,
);
