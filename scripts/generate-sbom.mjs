import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outputFlag = process.argv.indexOf("--output");
const output = path.resolve(
  root,
  outputFlag >= 0
    ? process.argv[outputFlag + 1]
    : "release/rinspace-web.spdx.json",
);
const packageDocument = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const licenseGroups = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--json", "--prod"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }),
);
const sourceCommit =
  process.env.GITHUB_SHA || process.env.RINSPACE_SOURCE_COMMIT || "unknown";
const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH || 0);
const created =
  sourceDateEpoch > 0 ? new Date(sourceDateEpoch * 1000) : new Date();
const dependencies = [];

for (const [license, entries] of Object.entries(licenseGroups)) {
  for (const entry of entries) {
    for (const version of entry.versions)
      dependencies.push({ license, name: entry.name, version });
  }
}
dependencies.sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(
    `${right.name}@${right.version}`,
  ),
);
const graphDigest = crypto
  .createHash("sha256")
  .update(JSON.stringify(dependencies))
  .digest("hex");
const spdxId = (name, version) =>
  `SPDXRef-Package-${crypto.createHash("sha256").update(`${name}@${version}`).digest("hex").slice(0, 16)}`;
const declaredLicense = (license) =>
  license === "Unknown" ? "NOASSERTION" : license;
const rootId = "SPDXRef-Rinspace-Web";
const packages = [
  {
    SPDXID: rootId,
    name: packageDocument.name,
    versionInfo: packageDocument.version,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared:
      packageDocument.license === "UNLICENSED"
        ? "NOASSERTION"
        : packageDocument.license,
    copyrightText: "NOASSERTION",
    externalRefs: [
      {
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: `pkg:npm/${encodeURIComponent(packageDocument.name)}@${packageDocument.version}`,
      },
    ],
  },
  ...dependencies.map((dependency) => ({
    SPDXID: spdxId(dependency.name, dependency.version),
    name: dependency.name,
    versionInfo: dependency.version,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: declaredLicense(dependency.license),
    copyrightText: "NOASSERTION",
    externalRefs: [
      {
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: `pkg:npm/${encodeURIComponent(dependency.name)}@${dependency.version}`,
      },
    ],
  })),
];
const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: `rinspace-web-${packageDocument.version}`,
  documentNamespace: `https://github.com/rinspacehq/rinspace-web/sbom/${sourceCommit}/${graphDigest}`,
  creationInfo: {
    created: created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    creators: ["Tool: rinspace-web/scripts/generate-sbom.mjs"],
  },
  documentDescribes: [rootId],
  packages,
  relationships: dependencies.map((dependency) => ({
    spdxElementId: rootId,
    relationshipType: "DEPENDS_ON",
    relatedSpdxElement: spdxId(dependency.name, dependency.version),
  })),
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(
  `Wrote ${path.relative(root, output)} with ${dependencies.length} production dependencies (${graphDigest}).\n`,
);
