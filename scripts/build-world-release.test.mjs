import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildWorldRelease } from "./build-world-release.mjs";

const root = process.cwd();

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

test("world release is checksummed and installable by a clean public consumer", () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-world-release-"),
  );
  try {
    const releaseDirectory = path.join(temporaryRoot, "release");
    const result = buildWorldRelease({
      root,
      outputDirectory: releaseDirectory,
      skipBuild: false,
      allowDirty: true,
    });
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(releaseDirectory, "world-release-manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.contractVersion, "1.0.0");
    assert.equal(manifest.shellVersion, "0.1.0");
    assert.equal(manifest.reactPeer, "^19.0.0");
    assert.ok(result.files.includes("LICENSE-AGPL-3.0-only.txt"));
    assert.ok(result.files.includes("rinspace-world-release-1.0.0.spdx.json"));

    const checksumLines = fs
      .readFileSync(path.join(releaseDirectory, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n");
    for (const line of checksumLines) {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/);
      assert.ok(match, `invalid checksum line: ${line}`);
      assert.equal(sha256(path.join(releaseDirectory, match[2])), match[1]);
    }

    const consumer = path.join(temporaryRoot, "consumer");
    fs.mkdirSync(consumer);
    fs.writeFileSync(
      path.join(consumer, "package.json"),
      `${JSON.stringify(
        {
          name: "rinspace-world-clean-consumer",
          private: true,
          type: "module",
          dependencies: {
            "@rinspace/world-shell": `file:${path.join(releaseDirectory, result.shellArchive)}`,
            react: "19.2.8",
          },
        },
        null,
        2,
      )}\n`,
    );
    execFileSync(
      "corepack",
      ["pnpm", "install", "--offline", "--ignore-scripts"],
      {
        cwd: consumer,
        stdio: "pipe",
      },
    );
    const output = execFileSync(
      "node",
      [
        "--input-type=module",
        "-e",
        [
          "import { flipTarget, hrefInWorld, resolveWorld } from '@rinspace/world-shell';",
          "const account = hrefInWorld('/@demo-orbit-reader', 'inner');",
          "const post = resolveWorld('/p/7001001/wrong-slug');",
          "console.log(JSON.stringify({ account, postWorld: post.world, fallback: flipTarget('/books') }));",
        ].join(" "),
      ],
      { cwd: consumer, encoding: "utf8" },
    );
    assert.deepEqual(JSON.parse(output), {
      account: "/@demo-orbit-reader?world=inner",
      postWorld: "inner",
      fallback: "/?world=inner",
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
