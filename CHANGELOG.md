# Changelog

All notable changes to Rinspace Web will be documented in this file. Releases follow Semantic Versioning once the legal release gate is approved.

## 0.1.6 - 2026-09-06

- Canonicalize every non-post inner-world page with `world=inner`, while keeping `/p/:id[/slug]` path-owned and older unqualified links compatible.
- Classify Mastodon Web settings API and the server-rendered settings, filters, relationship, cleanup, invite, administration, privacy, and terms pages so they cannot fall into the outer runtime.

## 0.1.5 - 2026-09-05

- Added explicit world-gateway routes for the public runtime configuration, Web App Manifest, and container health endpoint so they cannot be shadowed by reserved profile paths.

## 0.1.4 - 2026-09-05

- Added the versioned two-world route contract, shared `world-shell`, cross-document turn transition, and quiet outer-world home.
- Added a fail-closed synthetic inner-world contract demo with stable `/p/:id/:slug` resolution and automated browser coverage.
- Added checksummed world release attachments, AGPL license metadata, a minimal SPDX SBOM, and clean-consumer install verification.
- Added runtime-neutral demo, integration, and official deployment shells.
- Added deterministic guest/member demo data with offline network isolation.
- Added static-package, non-root container, public CI, SBOM, checksum, and provenance release contracts.
- Fixed fresh-runner release sequencing so build evidence is verified only after the production build exists.
- Fixed the release test invocation to use the repository's single pinned Vitest execution policy.
- Fixed formal world-shell packaging to run before other release outputs make the clean worktree appear dirty.
- Made the root production build compile the shared world-shell automatically on a fresh checkout.

Release creation remains an explicit maintainer operation; `config/release-policy.json` only defines artifact readiness.
