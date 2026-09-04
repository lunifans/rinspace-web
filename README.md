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

## Beginner-friendly quick start

No database, account, CloudBase project, or `.env` file is needed. Choose the path that matches what you want to do:

| Goal                                          | Recommended path                          | What to install  |
| --------------------------------------------- | ----------------------------------------- | ---------------- |
| Try the demo without learning Node.js or pnpm | [Docker and Compose](#docker-and-compose) | Docker only      |
| Read or change the source and get hot reload  | Local development below                   | Git + Node.js 22 |
| Produce files for a static host               | [Static deployment](#static-deployment)   | Git + Node.js 22 |

### 1. Install Git and Node.js on Windows, macOS, or Linux

Rinspace Web's documented and CI-tested line is **Node.js 22.x**. The official download page may select a newer line by default, so explicitly select version 22 from the [Node.js download page](https://nodejs.org/en/download). Install [Git](https://git-scm.com/downloads) if `git --version` is not already available.

| System        | Beginner route                                                                                                                                                                                    | Terminal to use                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Windows 10/11 | Install Git for Windows and the Node.js 22 Windows installer. Keep the installer's default PATH options.                                                                                          | PowerShell or Windows Terminal |
| macOS         | Install the Node.js 22 macOS installer. Install Git when macOS prompts for the command-line tools, if needed.                                                                                     | Terminal                       |
| Linux         | Install Git with the distribution package manager, then install Node.js 22 using the official download instructions or a version manager. Distribution repositories may contain an older Node.js. | Your normal shell              |

Close and reopen the terminal after installation, then check the tools:

```bash
git --version
node --version
npm --version
```

`node --version` should start with `v22.`. Next, clone the repository and enter it:

```bash
git clone https://github.com/lunifans/rinspace-web.git
cd rinspace-web
```

### 2. Start the demo with pnpm

pnpm is the package manager used to install this project's JavaScript dependencies and run its scripts. You do not need prior pnpm knowledge, and the repository pins pnpm 9.7.0 for you. Do not replace `pnpm-lock.yaml` or run `npm install` for project dependencies.

The normal commands are:

```bash
corepack enable
pnpm --version
pnpm install --frozen-lockfile
pnpm start
```

Open <http://127.0.0.1:5173/>. Keep the terminal open while using the demo; press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop it.

If `pnpm` is “not recognized” or “command not found”, use Corepack directly instead of changing system permissions:

```bash
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

If `corepack` itself is unavailable but `npm --version` works, install the exact project version once and retry the normal commands:

```bash
npm install --global pnpm@9.7.0
pnpm --version
```

See the [pnpm installation guide](https://pnpm.io/installation) if your system blocks global tools. The clean-checkout documentation gate measures install-to-ready time after prerequisites and refuses external demo requests; timing evidence is recorded with Task 27 rather than presented as an unverified platform promise.

<!-- rinspace-section: reset -->

## Reset local demo data

Open the demo control, choose **Reset demo data**, and confirm. This resets only the namespaced Rinspace demo repository and scenario. It preserves the selected persona, language, theme, and unrelated browser storage.

If bootstrap itself cannot complete, use **Reset demo** on the standalone error page. To clear the site manually, remove site data for the local origin; never reuse an official production origin for demo mode.

<!-- rinspace-section: static-deployment -->

## Static deployment

Run these commands from the repository root after completing the local installation above. Build the runtime-neutral core once, assemble a root shell without recompiling it, and preview the exact output directory:

```bash
pnpm build
pnpm package -- --config config/runtime.demo.json --out package
pnpm preview:artifact -- --root package --port 4173
```

Open <http://127.0.0.1:4173/>. The deployable files are now in `package/`; stop the preview with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

For a subpath, select a config whose normalized `basePath`, local API path, canonical URL, manifest scope, and worker scope agree. This example serves the demo at `/rinspace-demo/`:

```bash
pnpm package -- --config config/runtime.demo.subpath.json --out package-subpath --base-path /rinspace-demo/
pnpm preview:artifact -- --root package-subpath --port 4173
```

Open <http://127.0.0.1:4173/rinspace-demo/>. Before deploying to a real domain, copy the closest file in `config/`, set its public `canonicalOrigin`, `basePath`, and same-prefix API path, then pass that file to `pnpm package`. Configuration is downloaded by every browser: never put a password, token, private key, database URL, internal address, or real user data in it.

Deployment checklist:

1. Upload the **complete contents** of `package/` (or the complete subpath layout), including dotfiles and generated metadata. Do not upload only `index.html` or only `assets/`.
2. Apply `_headers` and `_redirects` when the provider supports them. On another server, translate `static-headers.json` into equivalent CSP, cache, and service-worker rules.
3. Configure SPA fallback to the matching `index.html` for browser navigation, but leave missing JS, CSS, font, image, and other asset requests as real `404` responses.
4. Visit the home page and directly refresh a deep URL. Check `/runtime-config.json` and `/version.json` before considering the deployment complete.

The first provider-specific template is Netlify. `pnpm prepare:netlify` creates the required physical root/subpath layout from the same package implementation; setup, config updates, verification, and rollback are documented in [`docs/static-hosting-netlify.md`](./docs/static-hosting-netlify.md). No one-click deploy button is advertised before a credentialed preview and rollback are recorded.

<!-- rinspace-section: docker-deployment -->

## Docker and Compose

Docker is the simplest route if you only want to run the demo: it does **not** require Node.js, Corepack, or pnpm on the host.

| System        | Install                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 10/11 | Install and start [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Its default Linux-container/WSL 2 setup is suitable.    |
| macOS         | Install and start the correct Apple silicon or Intel build from [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/).                   |
| Linux         | Install [Docker Engine](https://docs.docker.com/engine/install/) and the [Docker Compose plugin](https://docs.docker.com/compose/install/linux/) for your distribution. |

After installation, `docker compose version` should print a version. Clone this repository, enter it, and start the zero-credential root demo on loopback port 8080:

```bash
git clone https://github.com/lunifans/rinspace-web.git
cd rinspace-web
docker compose version
docker compose up --build
```

The first build downloads base images and dependencies, so it may take longer than later starts. When the log reports the service as ready, open <http://127.0.0.1:8080/>. Press <kbd>Ctrl</kbd>+<kbd>C</kbd>, then remove the stopped project resources with:

```bash
docker compose down
```

To run in the background, inspect logs, and stop later:

```bash
docker compose up --build -d
docker compose logs -f
docker compose down
```

For the verified subpath overlay, run the following command and open <http://127.0.0.1:8080/rinspace-demo/>:

```bash
docker compose -f compose.yaml -f compose.subpath.yaml up --build
```

The runtime is UID/GID 1000, listens on 8080, drops all Linux capabilities, uses a read-only root filesystem, and writes only the generated shell/config to `/run/rinspace` tmpfs. Health and immutable build facts are available at `/healthz` and `/version.json`. The Compose files do not use privileged mode, host networking, the Docker socket, credentials, or persistent volumes.

### Common setup problems

- **Port 5173 is already in use:** run `pnpm start -- --port 5174`, then open `http://127.0.0.1:5174/`.
- **Port 8080 is already in use:** in PowerShell run `$env:RINSPACE_WEB_PORT='8081'; docker compose up --build`; in macOS/Linux shells run `RINSPACE_WEB_PORT=8081 docker compose up --build`.
- **`docker compose` is unavailable:** start Docker Desktop, or on Linux install the Compose plugin. This project uses the current `docker compose` command, not legacy `docker-compose`.
- **A deployed deep link returns 404:** configure the SPA fallback and deploy all generated files; do not rewrite missing asset requests to HTML.
- **A subpath page is blank or redirects incorrectly:** rebuild with one consistent `basePath`, API prefix, canonical origin, and physical hosting directory.

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

The rights holder finalized the `LICENSE`, licensing notice, repository-local contribution terms, trademark policy, and asset terms after a disclosed, non-lawyer review of PRC law and mature-project texts. Ordinary contributors only run `git commit -s`: no external CLA account, identity upload, or private contributor registry is required. Contributors retain copyright and license their contributions under Apache License 2.0 so Rinspace can include them in both the AGPL community edition and separately licensed commercial editions. Large or ownership-complex organizational contributions may still require a separate written agreement before merge. This candidate remains private until the remaining release gates pass; no third-party material is relicensed merely by inclusion in the application. See [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`DCO`](./DCO), and [`CONTRIBUTION-LICENSE.md`](./CONTRIBUTION-LICENSE.md).

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
