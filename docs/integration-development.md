# Local integration development

Rinspace Web is consumed as one application, not as dozens of page-specific entry points. Every route shares one Vite server, one validated runtime config, one API contract, and one adapter assembly.

Start a compatible private backend on loopback, then run from a `rinspace-web` checkout:

```bash
pnpm install --frozen-lockfile
pnpm dev:integration -- --backend http://127.0.0.1:8080
```

Open `http://127.0.0.1:5173/rinspace/`. `runtime.integration.json` exposes only same-origin `/rinspace/api/` and `/rinspace/auth/v1/`. `RINSPACE_DEV_PROXY_TARGET` is read by Vite on the server and is never copied into the browser config. Remote, credentialed, path-bearing, and non-loopback targets are rejected.

Options:

```bash
pnpm dev:integration -- --backend http://localhost:9090 --port 5190
pnpm dev:integration -- --dry-run
```

The host remains loopback-only. A port must be 1024–65535. Gitea, Renderer, uploads, and workspace stay disabled until their compatible local dependencies and runtime capabilities are explicitly configured.

The private Rinspace repository provides `npm run dev:web`. Set `RINSPACE_WEB_WORKTREE` to use uncommitted frontend work. Without it, the private entry checks out the exact `rinspace-web.lock.json` commit into its ignored `.rinspace-web-cache/`; Task 32 installs that production-grade lock. The entry records full frontend/backend commits, dirty flags, contract version, and runtime channel before starting this command. It never copies frontend sources into the private repository.
