# Rinspace stack development baseline

[简体中文](./rinspace-stack-baseline.zh-CN.md)

The machine-readable baseline is [`contracts/rinspace-stack-baseline.json`](../contracts/rinspace-stack-baseline.json). It records the exact source commits inspected before implementing the two-world architecture; it is not a production deployment record and contains no endpoint, credential, personal data, or database content.

## Recorded components

| Component                   | Commit                                     | Role at the baseline                                                           |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `lunifans/rinspace-web`     | `d8878c0ddc10275f0ae0cac2ef726c418fcb5b20` | Public outer-world frontend, deterministic demo, public contracts              |
| `lunifans/mastodon`         | `0a32b4a831838ef1f363a915c2e71e2a1b52cf0d` | Public inner-world fork baseline                                               |
| private `lunifans/rinspace` | `d5e83cb83577e0935ebd20665782884de75643cd` | Gateway, identity/control plane, private adapters and deployment orchestration |

The Mastodon fork and upstream `main` pointed to the same commit at inspection time, so the initial Rinspace patch inventory is empty. Every future fork patch must be classified as upstreamable, Rinspace product behavior, or long-lived safety behavior, and must record its upstream base, changed files, verification, license impact, and upgrade notes.

## Compatibility rule

Development may use explicit worktrees, but a release must bind every component to an exact 40-character commit and immutable artifact digest. Floating branches, `latest` tags, dirty unrecorded builds, and guessed compatibility are not valid release inputs. The initial compatibility family is world-route contract `1.x`, `@rinspace/world-shell` `0.1.x`, and React peer `^19.0.0`.

This baseline should be replaced by release locks when the private integration pipeline is implemented. Updating it requires re-running the public contract checks and reviewing Mastodon upstream drift; changing a hash without that review defeats the guard.
