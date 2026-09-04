# Rinspace Web

[简体中文](./README.zh-CN.md)

<!-- rinspace-section: product -->

## Product

Rinspace Web is the browser frontend and local demonstration runtime for Rinspace, a tag-centered long-form knowledge community with Markdown, LaTeX, books, discussions, profiles, notifications, and creator workflows.

This repository is not the complete self-hosted Rinspace service. It does not contain the private production API, databases, Control Plane, Renderer, Gitea, code-server, payment callbacks, SMS sender, or object-storage services. The included demo uses deterministic synthetic data and local browser storage.

<!-- rinspace-section: scope -->

## Scope and modes

One codebase and one hashed core artifact support three validated runtime modes:

| Mode          | Purpose                                                  | Network boundary                                                          |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `demo`        | Safe product tour and frontend contribution              | Same-origin MSW + browser-local repository; external requests fail closed |
| `integration` | Connect to a compatible independently operated backend   | Explicit compatible auth/API/integration endpoints                        |
| `official`    | Rinspace-operated deployment of the same public frontend | CloudBase public auth config plus Rinspace server adapters                |

Routes are not separate integration entry points. All 85 routes consume the same auth, HTTP, upload, renderer, and workspace ports. Production-only capabilities are listed in [the capability boundary](./docs/production-capabilities.md).

<!-- rinspace-section: demo -->

## Demo personas and data

- `guest` shows the anonymous product, public content, sign-in gates, and empty states.
- `member` is a synthetic local identity that can follow, vote, comment, edit settings, read notifications, create Markdown/LaTeX content, and publish locally.
- Neither persona has an administrator role, a real JWT, or production credentials.
- The versioned seed is shared by Vitest, MSW, Playwright, and screenshots. Reset restores exactly that seed.

Use the demo control at the lower edge of the page to switch persona or a reproducible error/latency scenario.

<!-- rinspace-section: screenshots -->

## Screenshots

The images below are generated from the fixed local seed by `pnpm capture:demo-screenshots`; they contain no production response or real account.

| Guest · desktop                                                            | Member · desktop                                                             |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ![Guest demo on desktop](./docs/assets/screenshots/demo-guest-desktop.png) | ![Member demo on desktop](./docs/assets/screenshots/demo-member-desktop.png) |

| Guest · mobile                                                           | Member · mobile                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| ![Guest demo on mobile](./docs/assets/screenshots/demo-guest-mobile.png) | ![Member demo on mobile](./docs/assets/screenshots/demo-member-mobile.png) |

<!-- rinspace-section: quick-start -->

## Three-minute quick start

Prerequisites: Node.js 22 and Corepack. The repository pins pnpm 9.7.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

Open <http://127.0.0.1:5173/>. No database, account, CloudBase project, or `.env` file is needed. The clean-checkout documentation gate measures install-to-ready time and refuses external demo requests; timing evidence is recorded with Task 27 rather than presented as an unverified platform promise.

<!-- rinspace-section: reset -->

## Reset local demo data

Open the demo control, choose **Reset demo data**, and confirm. This resets only the namespaced Rinspace demo repository and scenario. It preserves the selected persona, language, theme, and unrelated browser storage.

If bootstrap itself cannot complete, use **Reset demo** on the standalone error page. To clear the site manually, remove site data for the local origin; never reuse an official production origin for demo mode.

<!-- rinspace-section: static-deployment -->

## Static deployment

Build the runtime-neutral core once, then assemble a root shell without recompiling it:

```bash
pnpm build
pnpm package -- --config config/runtime.demo.json --out package
RINSPACE_ARTIFACT_DIR=package pnpm preview
```

For a subpath, select a config whose normalized `basePath`, local API path, canonical URL, manifest scope, and worker scope agree:

```bash
pnpm package -- --config config/runtime.demo.subpath.json --out package-subpath --base-path /rinspace-demo/
RINSPACE_ARTIFACT_DIR=package-subpath RINSPACE_PREVIEW_BASE_PATH=/rinspace-demo/ pnpm preview
```

Deploy the complete output directory. `_headers`, `_redirects`, `404.html`, and `static-headers.json` describe SPA fallback, CSP, worker scope, immutable hashed assets, and no-store shell files. A host must not rewrite a missing JS/CSS/font request to HTML.

The first provider-specific template is Netlify. `pnpm prepare:netlify` creates the required physical root/subpath layout from the same package implementation; setup, config updates, verification, and rollback are documented in [`docs/static-hosting-netlify.md`](./docs/static-hosting-netlify.md). No one-click deploy button is advertised before a credentialed preview and rollback are recorded.

<!-- rinspace-section: docker-deployment -->

## Docker and Compose

The default Compose service builds and runs the zero-credential root demo on loopback port 8080:

```bash
docker compose up --build
```

For the verified subpath overlay:

```bash
docker compose -f compose.yaml -f compose.subpath.yaml up --build
```

The runtime is UID/GID 1000, listens on 8080, drops all Linux capabilities, uses a read-only root filesystem, and writes only the generated shell/config to `/run/rinspace` tmpfs. Health and immutable build facts are available at `/healthz` and `/version.json`. The Compose files do not use privileged mode, host networking, the Docker socket, credentials, or persistent volumes.

<!-- rinspace-section: integration -->

## Compatible backend integration

Implement the versioned contract in `contracts/openapi.yaml`, start the compatible private backend on loopback, then use the dedicated Vite integration entry:

```bash
pnpm dev:integration -- --backend http://127.0.0.1:8080
```

Open `http://127.0.0.1:5173/rinspace/`. The browser sees only same-origin `/rinspace/api/` and `/rinspace/auth/v1/`; the loopback backend target exists only in the Vite process and cannot enter runtime config or a production bundle. The official private-repository worktree/lock entry and all four dirty-worktree scenarios are documented in [`docs/integration-development.md`](./docs/integration-development.md); additive-first and breaking API rules are in [`docs/api-compatibility.md`](./docs/api-compatibility.md).

For static hosting, run `pnpm package` with a validated integration config. For a container, provide the entire public document as `RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON`; secret-shaped fields are rejected. Authentication, cookies/CORS, uploads, Renderer, Gitea, and workspace services remain the integrator's responsibility.

<!-- rinspace-section: architecture -->

## Architecture

```text
immutable core (hashed JS/CSS/assets + version.json)
                     │
deployment shell (index + runtime-config + CSP/cache/fallback)
                     │
bootstrap → mode adapters → shared auth/HTTP/upload/renderer/workspace ports
                     │
          85 route definitions and feature modules
```

Bootstrap loads same-origin `runtime-config.json` with `no-store`, validates it with Zod, installs the network policy and mode adapters, and only then mounts React. Demo starts its scoped MSW worker before the application can issue business requests.

<!-- rinspace-section: configuration -->

## Public configuration

`RuntimeConfig` is strict and versioned. Important container overrides include:

- `RINSPACE_PUBLIC_BASE_PATH`
- `RINSPACE_PUBLIC_API_BASE_URL`
- `RINSPACE_PUBLIC_CANONICAL_ORIGIN`
- `RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON`

CloudBase environment ID, region, and publishable key may be browser-public but still belong only in the `cloudbase` auth provider config. Never place database URLs/passwords, private keys, administrator identity, payment credentials, service tokens, or internal proxy targets in runtime config.

<!-- rinspace-section: testing -->

## Testing

Core contributor checks:

```bash
pnpm check
pnpm lint
pnpm test
pnpm test:static-package
pnpm test:container-contract
pnpm check:i18n
pnpm check:api-contract
pnpm check:route-contracts
pnpm test:demo-routes:browser
```

Public CI also checks the publication boundary, dependency licenses, lockfile diffs, coverage, release budgets, workflow pins, and fail-closed legal release policy. Formal Vite/Docker builds, multi-architecture smoke, screenshots, release artifacts, and provenance run only on designated self-hosted workflows. Fork pull requests never run code on those runners; after review, a maintainer tests the commit from a repository branch. See [`docs/supply-chain.md`](./docs/supply-chain.md) and `package.json` for details.

Before publication, the exact release is rehearsed while the repository is still private, including clean quick start, three-browser coverage, real static-host preview, container/layer/log/screenshot audit, and previous-release rollback. See [`docs/private-release-rehearsal.md`](./docs/private-release-rehearsal.md).

<!-- rinspace-section: licensing -->

## Licensing and contribution status

Rinspace-owned software is offered to the community under `AGPL-3.0-only`, with separate commercial licensing for customers who need proprietary modifications or integrations. Third-party material keeps its own terms: in particular, `src/components/animate-ui/` remains credited to Animate UI and governed by its bundled MIT + Commons Clause terms; it is not included in Rinspace commercial relicensing. See [`LICENSING.md`](./LICENSING.md).

The rights holder has finalized the `LICENSE`, licensing notice, CLA templates, trademark policy, and asset terms after a disclosed, non-lawyer review of PRC law and mature-project texts. The automated CLA acceptance/backup process and repository governance are still a Task 26 gate, so external contributions must not be merged yet. This candidate remains private until the remaining release gates pass; no third-party material is relicensed merely by inclusion in the application. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

<!-- rinspace-section: security -->

## Security

Do not put credentials or real user/production data in issues, screenshots, runtime config, demo fixtures, or diagnostic exports. Demo networking fails closed and only exports version, mode, route, and safe error codes.

Report suspected vulnerabilities through GitHub private vulnerability reporting when enabled, or through the private email route in [`SECURITY.md`](./SECURITY.md); never disclose details in a public issue. The policy intentionally promises no response deadline, bounty, or confidentiality beyond applicable law and an explicit agreement. Supported release lines, emergency-patch limits, and breaking-contract windows are documented in [`docs/version-support.md`](./docs/version-support.md).

<!-- rinspace-section: limitations -->

## Known limitations

- The demo is single-browser local product simulation, not a multi-user server.
- Payments, SMS, real upload, Gitea, code-server, Quiver, and durable Renderer jobs are production-only.
- Static hosting supplies client metadata and SPA fallback, not dynamic per-request SSR.
- Integration mode is contract-driven and requires a compatible independently secured backend.
- The repository remains a private candidate until third-party, legal, release, and explicit publication gates pass.
