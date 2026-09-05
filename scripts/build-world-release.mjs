import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function safeVersion(value, label) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value || "")) {
    throw new Error(`${label} must be a semantic version.`);
  }
  return value;
}

function assertEmptyOutput(output) {
  if (!fs.existsSync(output)) return;
  if (!fs.statSync(output).isDirectory())
    throw new Error("World release output must be a directory.");
  if (fs.readdirSync(output).length > 0) {
    throw new Error(
      `Refusing to overwrite non-empty world release output: ${output}`,
    );
  }
}

function sourceIdentity(root) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const status = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  return { commit, dirty: status.trim().length > 0 };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function buildWorldSbom({
  shellPackage,
  reactVersion,
  sourceCommit,
  contractVersion,
}) {
  const namespaceKey = sha256(
    `${sourceCommit}:${shellPackage.version}:${contractVersion}`,
  );
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `rinspace-world-release-${contractVersion}`,
    documentNamespace: `https://github.com/lunifans/rinspace-web/world-sbom/${namespaceKey}`,
    creationInfo: {
      created: "1970-01-01T00:00:00Z",
      creators: ["Tool: rinspace-web/scripts/build-world-release.mjs"],
    },
    documentDescribes: ["SPDXRef-World-Shell"],
    packages: [
      {
        SPDXID: "SPDXRef-World-Shell",
        name: shellPackage.name,
        versionInfo: shellPackage.version,
        downloadLocation: "NOASSERTION",
        filesAnalyzed: false,
        licenseConcluded: "NOASSERTION",
        licenseDeclared: shellPackage.license,
        copyrightText: "NOASSERTION",
        externalRefs: [
          {
            referenceCategory: "PACKAGE-MANAGER",
            referenceType: "purl",
            referenceLocator: `pkg:npm/%40rinspace/world-shell@${shellPackage.version}`,
          },
        ],
      },
      {
        SPDXID: "SPDXRef-React-Peer",
        name: "react",
        versionInfo: reactVersion,
        downloadLocation: "https://www.npmjs.com/package/react",
        filesAnalyzed: false,
        licenseConcluded: "NOASSERTION",
        licenseDeclared: "MIT",
        copyrightText: "NOASSERTION",
        externalRefs: [
          {
            referenceCategory: "PACKAGE-MANAGER",
            referenceType: "purl",
            referenceLocator: `pkg:npm/react@${reactVersion}`,
          },
        ],
      },
    ],
    relationships: [
      {
        spdxElementId: "SPDXRef-World-Shell",
        relationshipType: "DEPENDS_ON",
        relatedSpdxElement: "SPDXRef-React-Peer",
        comment: "React is a consumer-provided peer dependency.",
      },
    ],
  };
}

export function buildWorldRelease({
  root = scriptRoot,
  outputDirectory,
  skipBuild = false,
  allowDirty = false,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const output = path.resolve(
    outputDirectory || path.join(resolvedRoot, "release/world"),
  );
  const shellRoot = path.join(resolvedRoot, "packages/world-shell");
  const shellPackage = readJson(path.join(shellRoot, "package.json"));
  const rootPackage = readJson(path.join(resolvedRoot, "package.json"));
  const contract = readJson(
    path.join(resolvedRoot, "contracts/world-routes.json"),
  );
  const identity = sourceIdentity(resolvedRoot);
  if (identity.dirty && !allowDirty) {
    throw new Error(
      "Formal world releases require a clean worktree. Pass --allow-dirty only for local verification.",
    );
  }
  const shellVersion = safeVersion(shellPackage.version, "world-shell version");
  const contractVersion = safeVersion(
    contract.contractVersion,
    "world route contract version",
  );
  const reactVersion = safeVersion(
    rootPackage.dependencies?.react,
    "React version",
  );
  assertEmptyOutput(output);
  fs.mkdirSync(output, { recursive: true });

  if (!skipBuild)
    execFileSync("pnpm", ["build:world-shell"], {
      cwd: resolvedRoot,
      stdio: "inherit",
    });
  if (!fs.existsSync(path.join(shellRoot, "dist/index.js"))) {
    throw new Error(
      "world-shell dist is missing. Build it before using --skip-build.",
    );
  }

  const contractName = `rinspace-world-routes-${contractVersion}.json`;
  const schemaName = `rinspace-world-routes-${contractVersion}.schema.json`;
  const sbomName = `rinspace-world-release-${contractVersion}.spdx.json`;
  const statusSlugFixtureName = "rinspace-status-slug-v1.json";
  const licenseName = "LICENSE-AGPL-3.0-only.txt";
  fs.copyFileSync(
    path.join(resolvedRoot, "contracts/world-routes.json"),
    path.join(output, contractName),
  );
  fs.copyFileSync(
    path.join(resolvedRoot, "contracts/world-routes.schema.json"),
    path.join(output, schemaName),
  );
  fs.copyFileSync(
    path.join(resolvedRoot, "contracts/status-slug-v1.json"),
    path.join(output, statusSlugFixtureName),
  );
  fs.copyFileSync(
    path.join(resolvedRoot, "LICENSE"),
    path.join(output, licenseName),
  );
  execFileSync("pnpm", ["pack", "--pack-destination", output], {
    cwd: shellRoot,
    stdio: "inherit",
  });
  const shellArchive = fs
    .readdirSync(output)
    .find((name) => name === `rinspace-world-shell-${shellVersion}.tgz`);
  if (!shellArchive)
    throw new Error(
      "pnpm pack did not create the expected world-shell archive.",
    );

  writeJson(
    path.join(output, sbomName),
    buildWorldSbom({
      shellPackage,
      reactVersion,
      sourceCommit: identity.commit,
      contractVersion,
    }),
  );
  writeJson(path.join(output, "license-info.json"), {
    schemaVersion: 1,
    projectLicense: rootPackage.license,
    worldShellLicense: shellPackage.license,
    licenseFile: licenseName,
    sourceRepository: "https://github.com/lunifans/rinspace-web",
  });

  const artifactFiles = fs.readdirSync(output).sort();
  const artifacts = Object.fromEntries(
    artifactFiles.map((name) => [
      name,
      {
        sha256: sha256(fs.readFileSync(path.join(output, name))),
        bytes: fs.statSync(path.join(output, name)).size,
      },
    ]),
  );
  const manifestName = "world-release-manifest.json";
  writeJson(path.join(output, manifestName), {
    schemaVersion: 1,
    source: { commit: identity.commit, dirty: identity.dirty },
    contractVersion,
    shellVersion,
    reactPeer: shellPackage.peerDependencies.react,
    artifacts,
  });
  const checksumFiles = [...artifactFiles, manifestName].sort();
  const checksums = checksumFiles
    .map(
      (name) => `${sha256(fs.readFileSync(path.join(output, name)))}  ${name}`,
    )
    .join("\n");
  fs.writeFileSync(path.join(output, "SHA256SUMS"), `${checksums}\n`);
  return Object.freeze({
    output,
    contractVersion,
    shellVersion,
    shellArchive,
    files: [...checksumFiles, "SHA256SUMS"],
  });
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a value.`);
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = buildWorldRelease({
    outputDirectory: readOption("--out"),
    skipBuild: process.argv.includes("--skip-build"),
    allowDirty: process.argv.includes("--allow-dirty"),
  });
  process.stdout.write(
    `${JSON.stringify({ ...result, output: path.relative(process.cwd(), result.output) }, null, 2)}\n`,
  );
}
