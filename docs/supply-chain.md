# Supply-chain and release verification

The pull-request workflow has repository read permission only. It runs types, lint, generated-contract checks, dependency/license policy, Vitest coverage, publication-boundary scans, and lockfile review. Formal package, browser, and container jobs use the designated self-hosted runner only for same-repository branches; fork code never runs there.

All `uses:` references are full commit SHAs mirrored in `config/github-actions-policy.json`. Dependabot proposes pnpm, Actions, and Docker updates, but a reviewer must inspect the upstream diff and update the policy record. `pnpm install --frozen-lockfile` prevents an unreviewed dependency graph rewrite.

The release workflow accepts an existing `vX.Y.Z` tag only when it resolves to the checked-out full commit and matches `package.json`. It creates:

- a deterministic root demo tar archive;
- `SHA256SUMS`, `version.json`, and the changelog;
- an SPDX 2.3 production-dependency SBOM;
- a bundled Node 22 official-shell assembler that validates the complete public runtime config without rebuilding application assets;
- a GHCR image for `linux/amd64` and `linux/arm64`, addressed by digest;
- GitHub build-provenance attestations for the archive, SBOM, and official-shell assembler, plus OCI provenance/SBOM for the image;
- release metadata binding repository, tag, full commit, artifact hashes, API contract version, image name, platforms, and digest.

Before creating a release, CI runs `gh attestation verify` for all three downloadable subjects, checks all SHA-256 values, resolves the source tag again, and inspects the immutable image digest. Consumers must use the digest and release metadata, never `main` or a floating container tag.

The workflow is intentionally blocked by `config/release-policy.json` until legal files, the demo-data license, and every dependency license are approved. Passing this release gate does not authorize changing repository visibility; that is a separate explicit human action.
