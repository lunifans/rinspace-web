# Contributing to Rinspace Web

Thank you for helping improve Rinspace Web. This repository contains the public Web frontend and deterministic demo runtime; it does not contain the private Rinspace backend or production credentials.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Discuss large behavior, API, dependency, licensing, or architecture changes in an issue before implementation.
- Never submit production data, personal information, access tokens, private endpoints, internal incident material, or third-party work that you are not entitled to contribute.
- Report vulnerabilities through [`SECURITY.md`](./SECURITY.md), not a public issue or pull request.

## One-command contribution sign-off

Ordinary contributions do not require an external CLA service, a separate account, an identity document, or a private contributor registry. Every commit author certifies the repository's [`DCO`](./DCO) 1.1 and accepts [`CONTRIBUTION-LICENSE.md`](./CONTRIBUTION-LICENSE.md) by adding a matching sign-off:

```bash
git commit -s
```

The resulting commit message contains:

```text
Signed-off-by: Your Name <you@example.com>
```

The name and email must match the commit author. A GitHub `noreply` email is accepted. Each person named in a `Co-authored-by` trailer must add a matching `Signed-off-by` trailer. If you forgot, update the commit message—for the latest commit, use `git commit --amend --signoff`; for several commits, use an interactive rebase or ask a maintainer for help.

You retain copyright. Contributions are licensed under Apache License 2.0 so Rinspace can include them in the `AGPL-3.0-only` community edition and separately licensed commercial editions. The DCO workflow reads commit metadata through GitHub's read-only API, checks every commit, and never executes code from the pull request.

If an employer, customer, school, or another organization may own the work, obtain authority before submitting. Large, organization-wide, ownership-complex, or patent-sensitive contributions may require a separate written agreement before merge; open an issue first and do not include confidential material. This exception is a maintainer review, not a routine hurdle for normal fixes and features.

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
