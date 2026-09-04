# API compatibility and versioning

Rinspace Web declares its required contract in `contracts/openapi.yaml` through `x-rinspace-contract-version`. Every runtime config repeats that version in `api.contractVersion`; a mismatch is a release error, not a browser fallback.

## Additive-first changes

Compatible API evolution follows this order:

1. Deploy backend additions while preserving every field, status, method, and route used by the currently supported frontend releases.
2. Update the public OpenAPI document, generated types, demo handlers, and frontend behavior. Validate the exact public commit against an exact backend commit.
3. Publish an immutable frontend release with commit, tag, checksums, SBOM, attestations, and contract version.
4. Upgrade the official private lock to that release and observe it while the backend still supports the prior frontend.
5. Remove old behavior only after the published migration window and support policy permit it.

New response fields must be optional to old clients. New request fields must remain optional until all supported clients send them. Do not change the meaning of an existing enum value, success status, identifier, pagination cursor, authentication requirement, or error code under the same contract version.

## Breaking versions

A necessary breaking change increments the contract major (`v1` to `v2`) and runs both versions during a migration window of at least 90 days and two consecutive public minor releases. The release notes must identify affected operations, the first compatible frontend release, the final old-version support date, data migration needs, and rollback limitations.

An old frontend rejected after the window receives HTTP `426` and a structured `contract.upgrade_required` error with the minimum supported contract version and a public release/source link. It must show an actionable upgrade screen; it must not retry indefinitely or silently switch endpoints.

Rollback during the dual-version window restores the previous official frontend lock and runtime config while the backend continues serving both contracts. If a backend regression invalidates the compatibility promise, restore the last dual-version backend before changing the frontend lock. Never solve a break by consuming `main`, `latest`, or an unverified artifact.

## Public pull requests and private validation

Public pull requests run only synthetic demo and public contract checks. They receive no private repository credential or staging token. An authorized maintainer separately dispatches the private `rinspace-web-cross-repo` workflow with a lowercase full 40-character public commit. The protected workflow checks out both exact commits, runs OpenAPI compatibility and Chromium integration on loopback, and records both commits, the contract version, and `runtime.integration.json`.

The private workflow is not triggered by `pull_request`, `pull_request_target`, `repository_dispatch`, branch names, or moving tags. A successful cross-repository result is evidence for review; it does not itself publish a release or update the official lock.
