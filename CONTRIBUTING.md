# Contributing to Rinspace Web

[简体中文](./CONTRIBUTING.zh-CN.md)

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

## Prepare your fork and toolchain

Use Git, Node.js 22.x, and pnpm 9.7.0. The installation and Docker alternatives for Windows, macOS, and Linux are in the [README](./README.md#beginner-friendly-quick-start). Fork the repository on GitHub, then replace `YOUR_ACCOUNT` below with your account name:

```bash
git clone https://github.com/YOUR_ACCOUNT/rinspace-web.git
cd rinspace-web
git remote add upstream https://github.com/lunifans/rinspace-web.git
git remote -v
corepack enable
corepack prepare pnpm@9.7.0 --activate
pnpm install --frozen-lockfile
```

If Corepack cannot create a global shim, use `corepack pnpm ...` for each command. If Corepack is unavailable but npm works, run `npm install --global pnpm@9.7.0`. Do not use `npm install` for repository dependencies and do not regenerate `pnpm-lock.yaml` without an intentional dependency change.

Configure an author identity before the first commit. A GitHub `noreply` address is fine:

```bash
git config user.name "Your Name"
git config user.email "YOUR_ID+YOUR_ACCOUNT@users.noreply.github.com"
```

## Make and verify a change

Create one focused branch from an up-to-date upstream branch:

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch -c fix/short-description
```

Run the demo with `pnpm start`. Use a branch prefix such as `fix/`, `feat/`, `docs/`, or `test/`; do not mix unrelated cleanup into the same pull request. Demo behavior must remain deterministic, use only synthetic data, and fail closed instead of calling production or unspecified external services.

While iterating, run the smallest relevant test. Before submission, run the baseline checks from the repository root:

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
git diff --check
git status --short
```

For browser-visible behavior, add or update Playwright coverage and run the relevant browser test from `package.json`. For packaging, containers, runtime configuration, routes, contracts, or translations, run the corresponding checks documented in the README. Update `README.md` and `README.zh-CN.md` together when shared behavior changes.

Review every changed file, then create a signed-off commit:

```bash
git diff
git add path/to/changed-file path/to/test-file
git commit -s -m "fix(scope): describe the user-visible result"
git show --stat --oneline HEAD
```

Do not use `git add .` without reviewing untracked files. A good commit subject is imperative, specific, and under roughly 72 characters. Common types are `fix`, `feat`, `docs`, `test`, `refactor`, `build`, and `ci`.

## Using Codex or another coding AI

Read [`AGENTS.md`](./AGENTS.md) first. AI assistance is welcome, but the human contributor remains responsible for correctness, security, third-party rights, tests, and the DCO certification. Never give an AI production data or credentials, and disclose substantial generated or copied material plus its sources in the pull request.

Copy, fill in, and give this prompt to the coding agent:

```text
Work in the current Rinspace Web repository. Read AGENTS.md, README.md, CONTRIBUTING.md, package.json, and the relevant nearby tests before changing anything.

Outcome: <one concrete user-visible result>
Acceptance criteria:
- <observable behavior or failing test that must pass>
- <edge case and security/privacy expectation>
Constraints:
- Keep the change focused; preserve unrelated work and public API compatibility unless explicitly required.
- Use only synthetic demo data. Add no credentials, private endpoints, production fallback, or unreviewed dependency.
- Update English and Chinese docs together when shared behavior changes.
Verification:
- Run the smallest relevant test while iterating.
- Before handoff run pnpm check, pnpm lint, pnpm test, plus <feature-specific command>.
Handoff:
- Summarize changed files, behavior, commands and results, residual risks, and anything not verified.
- Show git diff/status. Do not commit, push, deploy, or open a PR unless I explicitly ask.

If the requested outcome conflicts with repository safety or licensing rules, stop and explain the conflict instead of weakening a gate.
```

For an AI-assisted local or server deployment, use the purpose-built [Codex deployment prompt](./docs/ai-deployment.md).

## Pull requests

- Push the branch with `git push -u origin fix/short-description`, then open a pull request from your fork to `lunifans/rinspace-web:main`.
- Use a clear title and explain the problem, user-visible result, implementation boundaries, security/privacy impact, tests run, screenshots for visual changes, compatibility or migration impact, and rollback plan.
- Link the issue with `Fixes #123` only when merging the pull request should close it. Mark unfinished work as a draft.
- Add tests for bug fixes and new behavior. State any test you could not run and why; do not report an unrun check as passing.
- Do not weaken runtime validation, origin checks, secret scanning, third-party inventory, license notices, or release gates merely to make CI pass.
- Disclose every added dependency, copied snippet, font, image, template, generated binary, or other third-party input with its exact source and license.
- State whether AI assistance was used and what the human contributor reviewed. This disclosure does not replace source/license disclosure or the DCO sign-off.
- Follow [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

Maintainers may decline or request changes to any contribution. Submission does not guarantee acceptance, payment, employment, support, or a release schedule.
