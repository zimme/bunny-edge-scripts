# Changelog

All notable changes to this project will be documented here. This project uses
Compatible Versioning (ComVer), so releases are published as `X.Y.0`.

## Unreleased

- Added a pinned Docker Compose-backed Dev Container shared by local
  development, CI, release publishing, Codespaces, and coding-agent setup.

- Convert project into a monorepo with JSR and npm publishing.
- Rename published packages to scoped JSR/npm names:
  `@zimme/bunny-ddns-edge-script` and `@zimme/create-bunny-ddns`.
- Add `@zimme/bunny-tunnel-edge-script`, a Bunny Edge Script HTTP access gateway
  with route matching, viewer bearer tokens, and signed origin forwarding.
- Make JSR the default Deno package source for generated deployment repos.
- Add native `deno create` scaffolding, dependency lockfiles, Bunny CLI
  deployment guidance, and OIDC trusted publishing.
- Enforce Bunny's subrequest budget before DDNS mutations.
- Harden tunnel transport, origins, forwarding headers, paths, and request body
  limits, and add origin-side HMAC verification.

## 1.0.0 - 2026-05-12

### Added

- Initial stable npm package for secure DynDNS-compatible Bunny Edge Scripts.
- Bunny Git integration, GitHub Actions, and manual paste deployment guidance.

### Changed

- Stable package-root exports now focus on the Bunny-specific handler and config
  API plus core config types.
- Update requests now require explicit IP query parameters. `/checkip` remains
  the discovery endpoint for clients that need it.

### Fixed

- HTTPS detection uses the request URL and does not trust caller-supplied
  forwarding headers.
- Type declarations are generated as part of the build instead of being
  hand-maintained.
