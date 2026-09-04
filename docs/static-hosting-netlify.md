# Netlify static hosting

Netlify is the first platform-specific static-host template. Rinspace Web still has one source tree and one runtime-neutral core: `prepare:netlify` calls the same `pnpm package` implementation, then lays a subpath package out below its actual URL prefix while keeping `_headers` and `_redirects` at the publish root.

This repository deliberately has no **Deploy to Netlify** button yet. The source-controlled template and controlled preview are verified, but a credentialed Netlify preview and rollback must be recorded in the private publication candidate before advertising one-click deployment.

## Root deployment

`netlify.toml` fixes Node 22.22.3, pnpm 9.7.0, the build command, `netlify-dist` publish directory, and disables post-processing so hashed core bytes are not rewritten. A local or designated CI preparation is:

```bash
pnpm install --frozen-lockfile
pnpm build
RINSPACE_STATIC_CONFIG=config/runtime.demo.json pnpm prepare:netlify
```

Connect the repository in Netlify and retain the file-based build settings, or upload the complete `netlify-dist/` directory produced by the designated workflow. Never upload only `index.html`.

## Subpath deployment

Select a config whose `basePath`, canonical origin, API path, manifest scope, and worker scope all use the same prefix:

```bash
RINSPACE_STATIC_CONFIG=config/runtime.demo.subpath.json \
RINSPACE_STATIC_OUTPUT=netlify-dist \
pnpm prepare:netlify
```

For `/rinspace-demo/`, application files are placed in `netlify-dist/rinspace-demo/`; `_headers` and `_redirects` remain in `netlify-dist/`. This physical nesting is required on a conventional static CDN. The output root also contains `netlify-deploy.json`, which binds the base path, runtime-config hash, version hash, and immutable core graph.

## Runtime configuration

`RINSPACE_STATIC_CONFIG` must identify a regular JSON file below `config/`. A deployment system may instead provide the complete public document through `RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON`. It is schema-validated and becomes a downloadable `runtime-config.json`, so it must never contain a password, database URL, private key, service token, internal proxy target, administrator identity, or real user data.

A reviewed core can be assembled repeatedly with a changed public config without recompilation:

```bash
pnpm prepare:netlify -- --core build --config config/runtime.example.json --out netlify-dist
```

The controlled test asserts that the runtime-config digest changes while the immutable graph digest stays identical.

## Routing, headers, and caching

- `_redirects` uses a `200` rewrite from the configured `basePath` splat to that prefix's `index.html`, preserving the BrowserRouter URL.
- `_headers` applies CSP and security headers, `no-store` to shell/config/worker/version files, one-year `immutable` caching to hashed resources, and the exact `Service-Worker-Allowed` prefix.
- Missing JS, CSS, fonts, and other asset requests must remain `404`; only HTML navigation receives the SPA fallback.
- `static-headers.json` is the provider-neutral source of truth for another host. Translate it exactly instead of inventing a second cache/security policy.

## Controlled verification

The `Static Host Preview` workflow builds one core, prepares root and subpath layouts without rebuilding, runs the five hosting contract tests, checks package budgets, and exercises direct deep-route refresh in Chromium. Equivalent local checks against an existing core are:

```bash
pnpm test:static-host
RINSPACE_ARTIFACT_DIR=netlify-dist pnpm exec playwright test tests/e2e/static-package.spec.ts --project=desktop-light
```

Before calling a Netlify deployment verified, record these checks against its real preview URL:

1. root or configured subpath and a direct deep route return the app;
2. `runtime-config.json` is `no-store`, the worker has the exact allowed scope, and a hashed asset is immutable;
3. a nonexistent `.js` request is `404`, not HTML;
4. a config-only deploy changes config/HTML but preserves immutable asset hashes;
5. guest/member flows make no unexpected external or production requests.

## Rollback

Keep the previous successful deploy ID and its `netlify-deploy.json`. In Netlify, open that successful deploy and use **Publish Deploy** to make the previous atomic deploy live. If automatic publishing remains enabled, a later Git-triggered production deploy can replace the rollback, so lock publishing or revert the source change as appropriate. After rollback, verify `version.json`, `runtime-config.json`, a deep route, the worker scope, and the immutable asset digest against the saved manifest.
