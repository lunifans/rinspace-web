import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";

const root = process.cwd();
const workflowDirectory = path.join(root, ".github/workflows");
const workflowNames = [
  "cla.yml",
  "ci.yml",
  "container.yml",
  "private-release-rehearsal.yml",
  "release.yml",
  "static-host.yml",
];
const workflows = Object.fromEntries(
  workflowNames.map((name) => [
    name,
    fs.readFileSync(path.join(workflowDirectory, name), "utf8"),
  ]),
);

test("every third-party Action is pinned to a full commit SHA", () => {
  const actionPolicy = JSON.parse(
    fs.readFileSync(
      path.join(root, "config/github-actions-policy.json"),
      "utf8",
    ),
  ).actions;
  const usedActions = new Set();
  for (const [name, source] of Object.entries(workflows)) {
    const uses = [
      ...source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#\s*(\S+))?/gm),
    ];
    assert.ok(uses.length > 0, `${name} has no Actions`);
    for (const match of uses) {
      assert.match(
        match[1],
        /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}$/i,
        `${name}: ${match[1]}`,
      );
      assert.match(
        match[2] || "",
        /^v\d+\.\d+\.\d+$/,
        `${name}: missing reviewed version comment for ${match[1]}`,
      );
      const [action, commit] = match[1].split("@");
      assert.deepEqual(
        { commit, version: match[2] },
        actionPolicy[action],
        `${name}: ${action} differs from reviewed policy`,
      );
      usedActions.add(action);
    }
  }
  assert.deepEqual([...usedActions].sort(), Object.keys(actionPolicy).sort());
});

test("pull-request workflows are read-only and cannot consume repository secrets", () => {
  for (const name of ["ci.yml", "container.yml", "static-host.yml"]) {
    const source = workflows[name];
    assert.match(source, /^\s{2}pull_request:/m);
    assert.match(source, /^permissions:\n\s{2}contents: read$/m);
    assert.doesNotMatch(
      source,
      /^\s{2}(?:attestations|contents|id-token|packages): write$/m,
    );
    assert.doesNotMatch(source, /\bsecrets\./);
  }
  const cla = workflows["cla.yml"];
  assert.match(cla, /^\s{2}pull_request_target:/m);
  assert.doesNotMatch(cla, /^\s{2}pull_request:/m);
  assert.match(cla, /^permissions:\n\s{2}contents: read\n\s{2}pull-requests: read$/m);
  assert.doesNotMatch(cla, /^\s{2}(?:actions|contents|id-token|pull-requests|statuses): write$/m);
  assert.doesNotMatch(cla, /\bsecrets\./);
  assert.match(cla, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.doesNotMatch(cla, /pull_request\.(?:head\.sha|head\.ref)/);
  assert.match(cla, /node scripts\/check-cla-registry\.mjs --event/);
  assert.doesNotMatch(workflows["release.yml"], /^\s{2}pull_request:/m);
  assert.match(
    workflows["release.yml"],
    /Fail closed until Task 26 governance and release policy are approved[\s\S]*pnpm check:release-readiness/,
  );
  assert.match(
    workflows["ci.yml"],
    /package:[\s\S]*head\.repo\.full_name == github\.repository[\s\S]*runs-on: \[self-hosted, linux, x64, rinspace-release-build\]/,
  );
  assert.match(
    workflows["container.yml"],
    /head\.repo\.full_name == github\.repository[\s\S]*runs-on: \[self-hosted, linux, x64, rinspace-release-build\]/,
  );
  assert.match(
    workflows["static-host.yml"],
    /head\.repo\.full_name == github\.repository[\s\S]*runs-on: \[self-hosted, linux, x64, rinspace-release-build\]/,
  );
  assert.equal(
    (
      workflows["release.yml"].match(
        /runs-on: \[self-hosted, linux, x64, rinspace-release-build\]/g,
      ) || []
    ).length,
    3,
  );
});

test("every pnpm command used by public workflows is declared", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const builtIns = new Set(["exec", "install"]);
  const invokedScripts = new Set();
  for (const source of Object.values(workflows)) {
    for (const match of source.matchAll(/\bpnpm[ \t]+([a-z][\w:-]*)/g)) {
      if (!builtIns.has(match[1])) invokedScripts.add(match[1]);
    }
  }
  const missing = [...invokedScripts]
    .filter((name) => typeof packageJson.scripts?.[name] !== "string")
    .sort();
  assert.deepEqual(missing, []);
});

test("public CI covers source, contract, dependency, coverage, browser, accessibility, and package gates", () => {
  const source = workflows["ci.yml"];
  for (const expected of [
    "pnpm check:publication-boundary",
    "pnpm check:dependencies",
    "pnpm check:lockfile-diff",
    "pnpm check:env-boundary",
    "pnpm check:direct-fetch",
    "pnpm check:api-contract",
    "pnpm check:route-contracts",
    "pnpm check:demo-seed",
    "pnpm check:i18n",
    "pnpm check:i18n:bundles",
    "pnpm check",
    "pnpm lint",
    "pnpm test:coverage",
    "pnpm test:demo-routes:browser",
    "pnpm test:demo-production-boundaries:browser",
    "pnpm check:vite-artifact",
    "pnpm check:release-budgets",
    "pnpm test:cla",
  ])
    assert.ok(source.includes(expected), `CI is missing ${expected}`);
  assert.match(
    source,
    /playwright install --with-deps chromium firefox webkit/,
  );
});

test("private release rehearsal is manual, private-only, exact, and comprehensive", () => {
  const source = workflows["private-release-rehearsal.yml"];
  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /^\s{2}(?:pull_request|push):/m);
  assert.match(source, /github\.event\.repository\.private == true/);
  assert.match(source, /environment: private-release-rehearsal/);
  assert.match(source, /runs-on: \[self-hosted, linux, x64, rinspace-release-build\]/);
  for (const expected of [
    "pnpm verify:quick-start",
    "pnpm check:release-readiness",
    "pnpm test:coverage",
    "pnpm test:demo-routes:browser",
    "pnpm test:demo-production-boundaries:browser",
    "pnpm capture:demo-screenshots",
    "gh attestation verify",
    "/etc/rinspace/bin/verify-rinspace-web-private-release",
    "pnpm check:private-release-rehearsal",
    "pnpm check:cla-registry",
  ]) assert.ok(source.includes(expected), `private rehearsal is missing ${expected}`);
});

test("release contract binds source, static archive, SBOM, attestations, and multi-platform image", () => {
  const source = workflows["release.yml"];
  for (const expected of [
    "git rev-parse -q --verify",
    "linux/amd64,linux/arm64",
    "pnpm generate:sbom",
    "pnpm check:cla-registry",
    "rinspace-web-shell-${VERSION}.mjs",
    "sha256sum --check SHA256SUMS",
    "actions/attest-build-provenance@",
    "gh attestation verify",
    "docker buildx imagetools inspect",
    "scripts/write-release-metadata.mjs",
    "gh release create",
    "provenance: mode=max",
    "sbom: true",
  ])
    assert.ok(
      source.includes(expected),
      `release workflow is missing ${expected}`,
    );
  assert.match(
    source,
    /permissions:[\s\S]*attestations: write[\s\S]*id-token: write/,
  );
});

test("dependency automation and fail-closed legal policy are explicit", () => {
  const dependabot = fs.readFileSync(
    path.join(root, ".github/dependabot.yml"),
    "utf8",
  );
  for (const ecosystem of ["npm", "github-actions", "docker"]) {
    assert.ok(dependabot.includes(`package-ecosystem: ${ecosystem}`));
  }
  const releasePolicy = JSON.parse(
    fs.readFileSync(path.join(root, "config/release-policy.json"), "utf8"),
  );
  assert.equal(releasePolicy.releasesEnabled, false);
  assert.equal(releasePolicy.requiredRootLicense, "AGPL-3.0-only");
  assert.deepEqual(releasePolicy.blockers, [
    "Task 26 CLA intake, record backup, and repository governance are not operational or verified.",
  ]);
  assert.match(releasePolicy.policy, /Task 4 legal inputs are approved/);
});

test("SPDX generator is deterministic with SOURCE_DATE_EPOCH and exposes no install paths", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-sbom-test-"),
  );
  try {
    const first = path.join(temporary, "first.json");
    const second = path.join(temporary, "second.json");
    const env = {
      ...process.env,
      RINSPACE_SOURCE_COMMIT: "0123456789abcdef0123456789abcdef01234567",
      SOURCE_DATE_EPOCH: "1704067200",
    };
    execFileSync(
      process.execPath,
      ["scripts/generate-sbom.mjs", "--output", first],
      { cwd: root, env },
    );
    execFileSync(
      process.execPath,
      ["scripts/generate-sbom.mjs", "--output", second],
      { cwd: root, env },
    );
    const firstBytes = fs.readFileSync(first);
    assert.deepEqual(firstBytes, fs.readFileSync(second));
    const document = JSON.parse(firstBytes);
    assert.equal(document.spdxVersion, "SPDX-2.3");
    assert.equal(document.creationInfo.created, "2024-01-01T00:00:00Z");
    assert.ok(document.packages.length > 100);
    assert.equal(firstBytes.includes(Buffer.from("/home/")), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("release metadata verifies local artifact hashes and immutable identities", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-release-metadata-test-"),
  );
  try {
    const artifact = path.join(temporary, "artifact.tar.gz");
    const sbom = path.join(temporary, "sbom.json");
    const shell = path.join(temporary, "shell.mjs");
    const output = path.join(temporary, "metadata.json");
    fs.writeFileSync(artifact, "artifact");
    fs.writeFileSync(sbom, "{}\n");
    fs.writeFileSync(shell, "export {};\n");
    execFileSync(
      process.execPath,
      [
        "scripts/write-release-metadata.mjs",
        "--artifact",
        artifact,
        "--sbom",
        sbom,
        "--shell",
        shell,
        "--image",
        "ghcr.io/lunifans/rinspace-web",
        "--image-digest",
        `sha256:${"a".repeat(64)}`,
        "--commit",
        "0123456789abcdef0123456789abcdef01234567",
        "--tag",
        "v0.1.0",
        "--output",
        output,
      ],
      { cwd: root },
    );
    const metadata = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(
      metadata.artifacts.static.sha256,
      crypto.createHash("sha256").update("artifact").digest("hex"),
    );
    assert.equal(
      metadata.source.commit,
      "0123456789abcdef0123456789abcdef01234567",
    );
    assert.equal(metadata.artifacts.container.platforms.length, 2);
    assert.equal(
      metadata.artifacts.shell.sha256,
      crypto.createHash("sha256").update("export {};\n").digest("hex"),
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("release readiness remains blocked until Task 26 governance is completed", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-release-readiness.mjs"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Release is blocked/);
  const expected = spawnSync(
    process.execPath,
    ["scripts/check-release-readiness.mjs", "--expect-blocked"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.equal(expected.status, 0, expected.stderr);
});
