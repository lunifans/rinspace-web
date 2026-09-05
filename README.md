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

The Logo turns between the two world homes. In demo mode, the inner home is an explicitly labelled local contract preview with synthetic posts and a route lab for account/tag dual views, single-sided fallback, `/p/:id`, incorrect slugs, and fail-closed degradation. It is not a substitute for the Mastodon runtime and makes no private or production request.

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
| Let Codex choose and execute the path         | [Deploy with Codex](#deploy-with-codex)   | Codex            |
| Read or change the source and get hot reload  | Local development below                   | Git + Node.js 22 |
| Produce files for a static host               | [Static deployment](#static-deployment)   | Git + Node.js 22 |

### 1. Install Git and Node.js on Windows, macOS, or Linux

Rinspace Web's documented and CI-tested line is **Node.js 22.x**. The official download page may select a newer line by default, so explicitly select version 22 from the [Node.js download page](https://nodejs.org/en/download). Install [Git](https://git-scm.com/downloads) if `git --version` is not already available.

| System        | Beginner route                                                                                                                                                                                    | Terminal to use                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Windows 10/11 | Install Git for Windows and the Node.js 22 Windows installer. Keep the installer's default PATH options.                                                                                          | PowerShell or Windows Terminal |
| macOS         | Install the Node.js 22 macOS installer. Install Git when macOS prompts for the command-line tools, if needed.                                                                                     | Terminal                       |
| Linux         | Install Git with the distribution package manager, then install Node.js 22 using the official download instructions or a version manager. Distribution repositories may contain an older Node.js. | Your normal shell              |

Common installation commands follow. The Windows Node command installs the current LTS; if it does not report `v22.`, use the Node.js 22 installer from the official page above for exact CI parity. The macOS commands require [Homebrew](https://brew.sh/). The Ubuntu/Debian commands install system prerequisites only; install Node.js 22.x from the official page instead of relying on a potentially old distribution package.

Windows PowerShell:

```powershell
winget install --exact --id Git.Git --source winget
winget install --exact --id OpenJS.NodeJS.LTS --source winget
```

macOS:

```bash
xcode-select --install
brew install node@22
echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc
exec zsh
```

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install --yes git ca-certificates curl
```

Close and reopen the terminal after installation, then check the tools:

```bash
git --version
node --version
npm --version
```

`node --version` should start with `v22.`. Next, clone the repository and enter it:

```bash
git clone https://github.com/rinspacehq/rinspace-web.git
cd rinspace-web
```

### 2. Start the demo with pnpm

pnpm is the package manager used to install this project's JavaScript dependencies and run its scripts. You do not need prior pnpm knowledge, and the repository pins pnpm 9.7.0 for you. Do not replace `pnpm-lock.yaml` or run `npm install` for project dependencies.

On macOS/Linux, the normal commands are below. `corepack prepare` explicitly activates the repository's version:

```bash
corepack enable
corepack prepare pnpm@9.7.0 --activate
pnpm --version
pnpm install --frozen-lockfile
pnpm start
```

The pnpm project currently recommends installing pnpm through npm on Windows. In PowerShell run:

```powershell
npm install --global pnpm@9.7.0
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

`pnpm start` is a development server, not a production deployment. A static host should receive only the complete, locally previewed `package/`. Upload into a new directory, verify it, and switch atomically; retain the previous complete directory for rollback instead of editing generated files in place.

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

Windows PowerShell and a macOS machine with Homebrew can install Docker Desktop directly:

```powershell
winget install --exact --id Docker.DockerDesktop --source winget
```

```bash
brew install --cask docker
open -a Docker
```

Windows may first require WSL 2 and a restart. On both systems, wait until Docker Desktop reports that its engine is running. Ubuntu should use Docker's official repository instead of a potentially old distribution `docker.io` package:

```bash
sudo apt update
sudo apt install --yes ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg --output /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install --yes docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world
```

On Ubuntu you may keep using `sudo docker compose ...`. To run it without `sudo`, follow Docker's [Linux post-install guide](https://docs.docker.com/engine/install/linux-postinstall/) to join the `docker` group. That group grants root-equivalent privileges and should not be given casually to shared or untrusted accounts.

After installation, `docker compose version` should print a version. Clone this repository, enter it, and start the zero-credential root demo on loopback port 8080:

```bash
git clone https://github.com/rinspacehq/rinspace-web.git
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
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:8080/healthz
docker compose logs -f
docker compose down
```

Before updating an existing checkout, confirm that it has no uncommitted work. Then fast-forward, rebuild, and verify health again:

```bash
git status --short
git pull --ff-only
docker compose up --build -d --remove-orphans
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:8080/healthz
```

In Windows PowerShell, use `curl.exe` if `curl` resolves to an alias. To roll back, check out the previously recorded commit or tag and run the same `docker compose up --build -d --remove-orphans` command. Do not remove an image or checkout that is still needed for rollback.

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

<!-- rinspace-section: ai-assisted-deployment -->

## Deploy with Codex

If command-line setup is unfamiliar, open the destination directory in Codex and paste this prompt. It defaults to a local-only demo and selects Docker or Node/pnpm from observed facts. Administrator, production, domain, credential, and public-network operations require your confirmation.

```text
Act as the Rinspace Web deployment assistant. Deploy https://github.com/rinspacehq/rinspace-web on this machine until I can open it in a browser and its health checks pass. Default to a zero-credential demo reachable only from this machine: prefer existing Docker, otherwise use Node.js 22.x and pnpm 9.7.0. Do not assume that I know Git, Node.js, pnpm, or Docker.

First read AGENTS.md, README.md, CONTRIBUTING.md, and package.json. Then perform read-only discovery of the OS, CPU, shell, required tools, ports 5173/8080, and worktree status. Clone the official repository if absent; if present, verify its remote. Do not pull, reset, clean, switch branches, overwrite changes, or discard work on your own.

When a tool is missing, show the exact installation command for this OS. Before sudo/administrator actions, PATH changes, Docker daemon installation, public listener/firewall changes, cloud login, server-directory writes, DNS/HTTPS changes, stopping an existing service, or replacing a deployment, explain the impact and wait for explicit confirmation. Never ask me to paste credentials in chat or put them in the repository, runtime config, image layers, shell history, or logs.

Do not change application code to bypass a deployment problem. Do not disable tests, health checks, security headers, authorization, origin validation, or secret scanning, and never fall back from demo mode to a production API. Work incrementally; for a network failure, report the failed host and command before asking whether I have a proxy.

Acceptance: the process/container is running and the home page succeeds; Docker exposes /healthz and /version.json, a static package exposes /version.json, and local development reports Vite ready; directly opening and refreshing a deep route does not incorrectly return 404; the listener defaults to loopback; and the demo requires no account, database, CloudBase project, or .env.

Finish with the URL, method, commit/Node/pnpm/image versions, commands run, each acceptance result, stop/restart/update/rollback commands, and manual steps still needed. Unless explicitly asked, do not commit, push, open a PR, change repository visibility, or publish to the Internet.
```

For a static host, Ubuntu server, or existing Docker update, use the expanded [Codex deployment prompt](./docs/ai-deployment.md), which includes target examples and complete stop rules.

<!-- rinspace-section: integration -->

## Compatible backend integration

Implement the versioned contract in `contracts/openapi.yaml`, start the compatible private backend on loopback, then use the dedicated Vite integration entry:

```bash
pnpm dev:integration -- --backend http://127.0.0.1:8080
```

Open `http://127.0.0.1:5173/rinspace/`. The browser sees only same-origin `/rinspace/api/` and `/rinspace/auth/v1/`; the loopback backend target exists only in the Vite process and cannot enter runtime config or a production bundle. The official private-repository worktree/lock entry and all four dirty-worktree scenarios are documented in [`docs/integration-development.md`](./docs/integration-development.md); additive-first and breaking API rules are in [`docs/api-compatibility.md`](./docs/api-compatibility.md).

For static hosting, run `pnpm package` with a validated integration config. For a container, provide the entire public document as `RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON`; secret-shaped fields are rejected. Authentication, cookies/CORS, uploads, Renderer, Gitea, and workspace services remain the integrator's responsibility.

### Consume the public world contract from another repository

Development inside this monorepo uses the workspace dependency `@rinspace/world-shell`. Another repository must consume an immutable release attachment, never this working tree or a floating branch. Each tagged release includes:

- `rinspace-world-shell-<version>.tgz`, a normal package-manager archive;
- versioned route contract JSON and JSON Schema;
- `world-release-manifest.json`, `WORLD-SHA256SUMS`, license metadata, the full AGPL license, and a minimal SPDX 2.3 SBOM.

Download all world release files into one directory, verify them, then install the archive. Replace the example version only with the version named by the compatibility tuple in [`docs/rinspace-stack-baseline.md`](./docs/rinspace-stack-baseline.md):

```bash
sha256sum --check WORLD-SHA256SUMS
pnpm add ./rinspace-world-shell-0.1.0.tgz
```

Import `@rinspace/world-shell` plus `@rinspace/world-shell/styles.css`; validate runtime routes against `rinspace-world-routes-1.0.0.json`. A consumer does not need this repository's private backend. Maintainers can reproduce and clean-install the exact public bundle before tagging with:

```bash
pnpm build:world-release -- --out world-release-candidate
pnpm test:world-release
```

The builder refuses a non-empty output directory and, unless it is a local development probe with explicit `--allow-dirty`, refuses a dirty worktree.

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

Before first source publication, the exact commit is rehearsed while the repository is still private: clean quick start, core browser coverage, root/subpath static packages, containers, and source/history/log/screenshot safety review. Formal tags, SBOM/attestations, credentialed hosting previews, and previous-release rollback are a separate post-publication release milestone; artifact-quota failures do not block source publication when the underlying checks passed. See [`docs/private-release-rehearsal.md`](./docs/private-release-rehearsal.md).

<!-- rinspace-section: contributing -->

## Contributing code

The beginner-oriented [`CONTRIBUTING.md`](./CONTRIBUTING.md) covers forking, cloning, pnpm setup, branches, tests, DCO sign-off, pushing, and opening a pull request. The shortest submission path is:

```bash
git switch -c fix/short-description
pnpm check
pnpm lint
pnpm test
git diff --check
git add path/to/changed-file path/to/test-file
git commit -s -m "fix(scope): describe the user-visible result"
git push -u origin fix/short-description
```

Ordinary contributions do not require an external CLA. When using Codex or another coding AI, have it read [`AGENTS.md`](./AGENTS.md) first and use the outcome/acceptance/constraints/verification prompt in the contribution guide. The human contributor remains responsible for reviewing code, tests, security, sources, and the DCO certification.

<!-- rinspace-section: china-user-documents -->

## Mainland China user documents

Versioned candidate drafts for the [user agreement, privacy policy, community rules, algorithm disclosure, minor protection, and report/appeal process](./docs/legal/zh-CN/README.md) are maintained in Chinese. They do not claim that real-identity operations, content review, algorithm filings, security assessments, or production approval are complete. Writes, recommendations, and the public entry stay closed whenever the corresponding engineering or operating evidence is absent.

<!-- rinspace-section: licensing -->

## Licensing and contribution status

Rinspace-owned software is offered to the community under `AGPL-3.0-only`, with separate commercial licensing for customers who need proprietary modifications or integrations. Third-party material keeps its own terms: in particular, `src/components/animate-ui/` remains credited to Animate UI and governed by its bundled MIT + Commons Clause terms; it is not included in Rinspace commercial relicensing. See [`LICENSING.md`](./LICENSING.md).

The rights holder finalized the `LICENSE`, licensing notice, repository-local contribution terms, trademark policy, and asset terms after a disclosed, non-lawyer review of PRC law and mature-project texts. Ordinary contributors only run `git commit -s`: no external CLA account, identity upload, or private contributor registry is required. Contributors retain copyright and license their contributions under Apache License 2.0 so Rinspace can include them in both the AGPL community edition and separately licensed commercial editions. Large or ownership-complex organizational contributions may still require a separate written agreement before merge. The source repository is public after its source-publication gates passed; formal releases and official production migration remain separate milestones. No third-party material is relicensed merely by inclusion in the application. See [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`DCO`](./DCO), and [`CONTRIBUTION-LICENSE.md`](./CONTRIBUTION-LICENSE.md).

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
- The source repository is public, but it does not yet advertise a formal versioned Release, prebuilt package, or completed official-production migration.
