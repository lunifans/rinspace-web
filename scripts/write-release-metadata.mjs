import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const values = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  if (!flag?.startsWith("--") || process.argv[index + 1] === undefined)
    throw new Error(`Invalid release metadata argument: ${flag}`);
  values[flag.slice(2)] = process.argv[index + 1];
}
for (const required of [
  "artifact",
  "sbom",
  "shell",
  "image-digest",
  "commit",
  "tag",
  "output",
]) {
  if (!values[required]) throw new Error(`Missing --${required}.`);
}
if (!/^[0-9a-f]{40}$/i.test(values.commit))
  throw new Error("--commit must be a full Git commit SHA.");
if (!/^sha256:[0-9a-f]{64}$/i.test(values["image-digest"]))
  throw new Error("--image-digest must be a sha256 digest.");

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

const artifact = path.resolve(values.artifact);
const sbom = path.resolve(values.sbom);
const shell = path.resolve(values.shell);
const output = path.resolve(values.output);
const document = {
  schemaVersion: 1,
  repository: "https://github.com/lunifans/rinspace-web",
  source: {
    commit: values.commit.toLowerCase(),
    tag: values.tag,
  },
  artifacts: {
    static: {
      file: path.basename(artifact),
      sha256: sha256(artifact),
    },
    sbom: {
      file: path.basename(sbom),
      format: "SPDX-2.3",
      sha256: sha256(sbom),
    },
    shell: {
      file: path.basename(shell),
      sha256: sha256(shell),
    },
    container: {
      image: values.image || "ghcr.io/lunifans/rinspace-web",
      digest: values["image-digest"].toLowerCase(),
      platforms: ["linux/amd64", "linux/arm64"],
    },
  },
  apiContractVersion: values["api-contract-version"] || "v1",
  repositoryVisibilityAuthorization: "out-of-scope",
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`Wrote ${path.relative(process.cwd(), output)}.\n`);
