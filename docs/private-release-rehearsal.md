# Private release rehearsal

Run the `Private Release Rehearsal` workflow only while `rinspacehq/rinspace-web` is private and only after an immutable candidate release exists. The workflow is manual, uses the protected `private-release-rehearsal` environment and the dedicated release-build runner, and never authorizes changing repository visibility.

Provide the exact candidate tag/full commit, a distinct previous tag, and successful workflow run IDs for Release, Public CI, Container CI, and Static Host Preview. Each run must belong to the candidate commit. The workflow rejects branches, `latest`, failed runs, public repository state, or an incomplete legal release gate.

The in-repository portion reproduces the README quick start from a clean copy; runs source, dependency, API, route, i18n, type, lint, coverage, package, static-host, container-contract, and release-shell gates; builds one neutral core; assembles root and subpath packages; exercises guest/member and fail-closed behavior in Chromium, Firefox, and WebKit; runs all packaged desktop/mobile, light/dark, and reduced-motion Playwright projects; regenerates the synthetic screenshots; and verifies exact release checksums and attestations.

## Protected audit harness

The release-build runner must provide `/etc/rinspace/bin/verify-rinspace-web-private-release`. This operator-owned harness receives only bounded source, package, release, Actions-log, and screenshot directories plus immutable candidate/previous identities. It must:

- scan the full Git history and current source for secrets, production data, private material, unsafe files, and unapproved third-party content;
- scan release attachments, SPDX SBOM, container configuration/layers, workflow logs, and screenshots/metadata without copying a detected secret into evidence;
- start the released non-root image through root and subpath Compose, verify read-only/no-capability behavior, health, deep refresh, cache rules, restart, and both published architectures;
- deploy the selected static-host preview for root and subpath, verify fallback/cache/worker/config behavior on the real platform, then remove or roll it back;
- restore the exact previous release and compatible demo data, verify it, redeploy the candidate, and retain non-secret rollback evidence;
- write `private-release-rehearsal.json` conforming to `schemas/private-release-rehearsal.schema.json`, with a concrete non-secret reference for every passing check.

The checked-in validator rejects missing checks or boolean-only self-claims. Evidence is retained as a protected workflow artifact for 90 days. A failed or unavailable harness leaves the rehearsal incomplete.

This rehearsal covers technical readiness. Legal/rightsholder approval, final repository settings, official-site dogfood, and the separately authorized public visibility change remain independent gates.
