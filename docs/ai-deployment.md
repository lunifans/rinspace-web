# Deploy Rinspace Web with Codex

[简体中文](./ai-deployment.zh-CN.md)

This guide gives people unfamiliar with Node.js, pnpm, or Docker an auditable AI-assisted path. It does not grant Codex implicit access to cloud accounts, servers, or production.

## How to use it

1. Open the destination directory in Codex, or open the repository root if it is already cloned.
2. Copy the complete prompt below. You may prefix it with a target such as “run a local Docker demo” or “deploy to `/srv/rinspace-web` on this Ubuntu server.”
3. Codex first performs read-only discovery. It must pause before administrator access, cloud login, DNS, certificates, firewall changes, public exposure, or replacing an existing deployment.
4. Do not accept “the command succeeded” as completion. Require a URL, mode, version, health result, and direct deep-route refresh result.

## Copy-and-paste deployment prompt

```text
Act as the deployment assistant for Rinspace Web. Deploy https://github.com/rinspacehq/rinspace-web on this machine until I can open it in a browser and all documented verification passes. Unless I specify another target, deploy a zero-credential demo reachable only from this machine. Prefer Docker if it is already available; otherwise use Node.js 22 and pnpm 9.7.0. Do not assume that I know Git, Node.js, pnpm, Docker, or the command line.

Requirements:
1. Read AGENTS.md, README.md, CONTRIBUTING.md, and package.json before acting, then present a plan of no more than six steps.
2. Begin with read-only discovery of the OS, CPU architecture, shell, availability of Git/Node/npm/Corepack/pnpm/Docker/Compose, ports 5173/8080, and any existing uncommitted files. Do not overwrite existing work.
3. Clone the official repository if absent. If it exists, use the current checkout only after verifying its remote. Do not pull, reset, clean, switch branches, or discard changes without permission.
4. Choose one path from observed facts:
   - Docker: do not install Node or pnpm on the host; run docker compose up --build -d.
   - Local development: use Node.js 22.x and pnpm 9.7.0; run pnpm install --frozen-lockfile and pnpm start.
   - Static deployment: use pnpm build, pnpm package, and the complete package/ directory only when I explicitly request static hosting. Follow the README for SPA fallback, security headers, runtime configuration, atomic replacement, and rollback.
5. If a user-level prerequisite is missing, show the exact command for this OS and explain what it installs. Before sudo/administrator access, PATH changes, installing a Docker daemon, firewall or public-listen changes, cloud login, writing to a server directory, DNS/HTTPS changes, stopping an existing service, or replacing a deployment, explain the impact and wait for explicit confirmation.
6. Never ask me to paste a token, password, private key, or production data into chat. Use interactive provider CLI login or local secure credential storage. Never write credentials to the repository, runtime-config.json, image layers, shell history, or logs.
7. Do not modify application code to bypass setup failures. Do not disable tests, health checks, security headers, authorization, origin validation, or secret scanning. Never fall back from demo mode to a production Rinspace API.
8. Execute incrementally and diagnose the cause of failures before retrying. If a download fails, report the host and command, then ask whether to use a proxy I provide.
9. Acceptance requires: the process/container is running; the home page succeeds; Docker exposes /healthz and /version.json, a static package exposes /version.json, and local development reports Vite ready; directly opening and refreshing a deep route does not incorrectly return 404; the demo needs no account, database, CloudBase project, or .env; and the reported listener defaults to loopback only.
10. Finish with the URL, deployment method, Node/pnpm or image/commit version, important commands run, every acceptance result, stop/restart/update/rollback commands, and any manual action still required. Unless explicitly requested, do not commit, push, open a pull request, change repository visibility, or publish to the Internet.

If information is missing but the local-demo defaults are safe, proceed instead of repeatedly asking questions. Pause only for choices that affect privileges, cost, domains, production traffic, or data.
```

## Example target prefixes

- `Use the prompt defaults to start a local Docker demo on my Windows 11 computer.`
- `Deploy on this macOS machine for frontend editing with hot reload; do not install Docker.`
- `Build the static package on this Ubuntu host but do not change Nginx yet; give me a reviewed Nginx draft.`
- `Update the existing Docker demo. Inspect the worktree and version first, retain a rollback version, and wait before replacement.`

There is no universally safe default for a production domain, HTTPS, cloud provider, or existing server. State the destination path, domain, reverse proxy, and acceptable maintenance window before the prompt; Codex should treat those operations as a separate confirmation-gated phase.
