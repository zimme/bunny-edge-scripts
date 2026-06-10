# Changelog

All notable changes to this project will be documented here. This project uses
Compatible Versioning (ComVer), so releases are published as `X.Y.0`.

## Unreleased

- Convert project into a monorepo with JSR and npm publishing.
- Rename published packages to scoped JSR/npm names:
  `@zimme/bunny-ddns-edge-script` and `@zimme/create-bunny-ddns`.
- Make JSR the default Deno package source for generated deployment repos.

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

- HTTPS detection now only trusts the first hop in the `Forwarded` header.
- Type declarations are generated as part of the build instead of being
  hand-maintained.
