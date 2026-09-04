# Instructions for coding agents

These instructions apply to the entire Rinspace Web repository.

## Start here

1. Read `README.md` (or `README.zh-CN.md`) and `CONTRIBUTING.md` before changing files.
2. Inspect `package.json`, nearby tests, and the current `git diff`; do not assume commands or architecture.
3. Restate the requested outcome, acceptance criteria, and files you expect to touch before a broad change.

## Repository boundaries

- This repository is the public browser frontend and deterministic local demo. It does not contain the private Rinspace backend or production credentials.
- Demo mode must use synthetic data, remain deterministic, and fail closed. Never add a production endpoint or an unspecified external request as a fallback.
- Browser runtime configuration is public. Never place a password, token, private key, database URL, internal address, personal information, or production data in source, fixtures, logs, screenshots, examples, or `runtime-config.json`.
- Do not weaken origin validation, authorization boundaries, secret scanning, third-party inventory, license notices, DCO checks, or release checks to make a test pass.
- Ask before adding/upgrading a dependency, changing a public API or license boundary, deleting data, using `sudo`, accessing a cloud account, changing DNS/firewall settings, or pushing/merging/publishing anything.

## Toolchain and verification

- Use Node.js 22.x and pnpm 9.7.0. Install dependencies with `pnpm install --frozen-lockfile`; do not use `npm install` for project dependencies.
- Prefer the smallest relevant test while iterating. Before handing off a normal code change, run:

```bash
pnpm check
pnpm lint
pnpm test
```

- For browser-visible, packaging, container, translation, API, or routing changes, also run the matching commands documented in `README.md` and `package.json`.
- Report the exact commands run and whether each passed. If a check could not run, say why; never claim it passed.

## Changes and contribution

- Keep changes focused, preserve unrelated work, and review `git diff --check` plus `git status --short` before handoff.
- Update English and Simplified Chinese documentation together when their shared behavior changes.
- Add tests for fixes and new behavior. Disclose copied/generated material and every new third-party input with its source and license.
- Do not commit, push, open a pull request, deploy, or publish unless the user explicitly asks. When asked to commit, use a DCO sign-off: `git commit -s`.
- AI output is only a draft: the human contributor remains responsible for reviewing correctness, security, licenses, tests, and the DCO certification.
