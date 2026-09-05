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
  "dco.yml",
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
  const dco = workflows["dco.yml"];
  assert.match(dco, /^\s{2}pull_request_target:/m);
  assert.doesNotMatch(dco, /^\s{2}pull_request:/m);
  assert.match(dco, /^permissions:\n\s{2}contents: read\n\s{2}pull-requests: read$/m);
  assert.doesNotMatch(dco, /^\s{2}(?:actions|contents|id-token|pull-requests|statuses): write$/m);
  assert.doesNotMatch(dco, /\bsecrets\./);
  assert.match(dco, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.doesNotMatch(dco, /pull_request\.(?:head\.sha|head\.ref)/);
  assert.match(dco, /node scripts\/check-dco\.mjs --event/);
  assert.doesNotMatch(workflows["release.yml"], /^\s{2}pull_request:/m);
  assert.match(
    workflows["release.yml"],
    /Verify legal and contribution policy readiness[\s\S]*pnpm check:release-readiness/,
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
        /runs-on: ubuntu-24\.04/g,
      ) || []
    ).length,
    3,
  );
  assert.doesNotMatch(
    workflows["release.yml"],
    /runs-on: \[self-hosted, linux, x64, rinspace-release-build\]/,
  );
  assert.match(workflows["release.yml"], /^\s{10}pnpm test$/m);
  assert.doesNotMatch(workflows["release.yml"], /pnpm test -- --pool/);
  assert.match(
    workflows["release.yml"],
    /pnpm check:i18n:bundles\n\s{10}pnpm build:world-release -- --out world-release\n\s{10}pnpm package/,
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
  assert.match(
    packageJson.scripts.build,
    /^pnpm build:world-shell && /,
    "a fresh checkout must build workspace packages before the application",
  );
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
    "pnpm test:world-demo:browser",
    "pnpm test:world-release",
    "pnpm check:vite-artifact",
    "pnpm check:release-budgets",
    "pnpm test:dco",
  ])
    assert.ok(source.includes(expected), `CI is missing ${expected}`);
  assert.match(
    source,
    /playwright install --with-deps chromium firefox webkit/,
  );
  assert.ok(
    source.indexOf("pnpm build") < source.indexOf("pnpm check:i18n:bundles"),
    "translation bundle budget must run after a production build",
  );
  assert.match(
    source,
    /- name: Upload coverage for review\n\s+if: always\(\)\n\s+continue-on-error: true/,
    "coverage execution must remain required while external artifact quota errors stay non-blocking",
  );
});

test("Buildx can receive reviewed self-hosted runner network options without repository secrets", () => {
  for (const name of ["container.yml", "release.yml"]) {
    const source = workflows[name];
    assert.match(
      source,
      /docker\/setup-buildx-action@[0-9a-f]{40}[\s\S]*?driver-opts: \$\{\{ vars\.RINSPACE_BUILDX_DRIVER_OPTS \}\}/,
      `${name} must pass the optional repository-level Buildx driver options`,
    );
  }
  assert.doesNotMatch(
    `${workflows["container.yml"]}\n${workflows["release.yml"]}`,
    /secrets\.RINSPACE_BUILDX_DRIVER_OPTS/,
  );
});

test("QEMU setup does not depend on the GitHub Actions cache quota", () => {
  for (const name of ["container.yml", "release.yml"]) {
    const source = workflows[name];
    assert.match(
      source,
      /docker\/setup-qemu-action@[0-9a-f]{40}[\s\S]*?cache-image: false/,
      `${name} must keep the binfmt image outside the GitHub Actions cache`,
    );
  }
});

test("container smoke validates the image revision with a valid Docker template", () => {
  const source = workflows["container.yml"];
  assert.ok(
    source.includes(
      `docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'`,
    ),
  );
  assert.doesNotMatch(
    source,
    /docker image inspect --format '\{\{index \.Config\.Labels \\"/,
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
    "pnpm check:dco",
  ]) assert.ok(source.includes(expected), `private rehearsal is missing ${expected}`);
});

test("release contract binds source, static archive, SBOM, attestations, and multi-platform image", () => {
  const source = workflows["release.yml"];
  for (const expected of [
    "git rev-parse -q --verify",
    "linux/amd64,linux/arm64",
    "pnpm generate:sbom",
    "pnpm check:dco",
    "rinspace-web-shell-${VERSION}.mjs",
    "rinspace-world-shell-${{ needs.validate.outputs.world_shell_version }}.tgz",
    "rinspace-world-routes-${{ needs.validate.outputs.world_contract_version }}.json",
    "WORLD-SHA256SUMS",
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

test("dependency automation and release legal policy are explicit", () => {
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
  assert.equal(releasePolicy.releasesEnabled, true);
  assert.equal(releasePolicy.requiredRootLicense, "AGPL-3.0-only");
  assert.deepEqual(releasePolicy.blockers, []);
  assert.match(releasePolicy.policy, /Task 4 legal inputs and the repository-local DCO contribution policy are approved/);
  assert.match(releasePolicy.policy, /never authorizes creating a tag, publishing a release, deploying, or making the repository public/);
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
        "ghcr.io/rinspacehq/rinspace-web",
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

test("release readiness passes after Task 26 without authorizing an external release action", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-release-readiness.mjs"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /authorizes release artifact generation only/);
  assert.match(result.stdout, /does not authorize making the repository public/);
});
