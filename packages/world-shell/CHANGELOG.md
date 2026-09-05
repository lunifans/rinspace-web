# Changelog

All notable changes to `@rinspace/world-shell` are documented here.

## 0.1.6 - 2026-09-06

- Canonicalize non-post inner-world product pages with `world=inner` and retain path-owned canonical URLs for `/p/:id[/slug]`.
- Add explicit Mastodon Web API and server-rendered product-page route ownership.

## 0.1.5 - 2026-09-05

- Add public service routes for `runtime-config.json`, `site.webmanifest`, and `healthz` to the generated two-world contract.

## 0.1.0 - Unreleased

- Add the generated `rinspace-world-routes/v1` contract snapshot and pure URL resolver.
- Add current-world home and Logo flip target helpers, including explicit tag binding support.
- Add the framework-light `RinspaceTopbar` with separate accessible Logo and brand-home links.
- Add runtime adapter port types and namespaced responsive CSS.
- Add progressive cross-document world-turn transitions with native-history,
  reduced-motion, focus, scroll-restoration, and deadline-safe fallback behavior.
