# Contributing to Rinspace Web

Thank you for helping improve Rinspace Web. This repository contains the public Web frontend and deterministic demo runtime; it does not contain the private Rinspace backend or production credentials.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Discuss large behavior, API, dependency, licensing, or architecture changes in an issue before implementation.
- Never submit production data, personal information, access tokens, private endpoints, internal incident material, or third-party work that you are not entitled to contribute.
- Report vulnerabilities through [`SECURITY.md`](./SECURITY.md), not a public issue or pull request.

## Contributor agreement

Rinspace Web uses a contributor license agreement so accepted contributions can remain available under `AGPL-3.0-only` while Rinspace can also offer a separate commercial license. Contributors keep their copyright.

- Individuals use [`ICLA.md`](./ICLA.md).
- A company or other organization uses [`CCLA.md`](./CCLA.md) when it owns or controls the contribution; its authorized contributors must be identified.
- Before signing, read [`CLA-PRIVACY.md`](./CLA-PRIVACY.md), which describes the necessary identity, authority, retention, public-registry, and possible cross-border processing controls.
- The accepted record must bind the exact agreement version and SHA-256, the contributor identity or organization authority, the time, the expression of agreement, and evidence integrity.
- A pull request, comment, checkbox, or `Signed-off-by` trailer alone is not an accepted CLA record unless the repository's designated process explicitly captures all required evidence.

The automated CLA gate is installed in a deliberately disabled, fail-closed state. The signing intake, private authoritative record store, encrypted backup, applicable cross-border controls, and required branch-protection check are not yet operational. Until all of them are verified, maintainers must not merge an external contribution.

## Development

Use the pinned Node and pnpm versions declared by the repository. From the repository root:

```bash
corepack pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build
```

For browser-visible behavior, add or update Playwright coverage and run the relevant project. Demo behavior must remain deterministic, use only synthetic data, and fail closed instead of calling production or unspecified external services.

## Pull requests

- Keep a pull request focused and explain user-visible behavior, security impact, tests, and rollback considerations.
- Add tests for bug fixes and new behavior.
- Do not weaken runtime validation, origin checks, secret scanning, third-party inventory, license notices, or release gates merely to make CI pass.
- Disclose every added dependency, copied snippet, font, image, template, generated binary, or other third-party input with its exact source and license.
- Follow [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

Maintainers may decline or request changes to any contribution. Submission does not guarantee acceptance, payment, employment, support, or a release schedule.
