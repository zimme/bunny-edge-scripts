# Contributing

Thanks for helping keep this small and useful.

## Development

Use the repository's Docker Compose-backed Dev Container. In VS Code or
Codespaces, reopen the repository in the container. From a host with Docker,
Deno:

```sh
deno task devcontainer:up
deno task devcontainer:exec deno task validate
deno task devcontainer:down
```

Once inside the container:

```sh
deno task setup
deno task fmt
deno task test
deno task validate
```

`deno task validate` is exactly what CI runs. The Compose definition is the
place to add any future service dependency needed by tests or development. A
GHCR prebuild accelerates local and hosted builds, but is only a cache:
checked-in Dev Container changes are always applied even before a new prebuild
is published. The Dockerfile caches the frozen Deno dependency graph and
platform bundler in an image layer before source is mounted. Keep the Compose
`cache_from` setting as the single container-cache source instead of adding
workflow-only caches.

Package `dist/` directories are generated from package `src/` directories and
are gitignored. Do not edit them by hand. Change source files, run
`deno task build` for a local package build, and rely on the package `prepack`
scripts to refresh `dist/` while the verified npm release tarballs are built.

Deno tasks are the stable command interface for developers and automation. npm
is retained only for npm tarball validation and publication.

## Public API

For release and compatibility purposes, the public API is:

- The package-root exports declared in each package's `src/mod.*`
- The environment variables documented in
  `packages/bunny-ddns-edge-script/README.md`
- The documented HTTP endpoints, parameters, and DDNS response codes

Internal helpers in package implementation files are not part of the stable
package contract unless they are re-exported from that package's root module.

## Versioning

This project uses Semantic Versioning with both packages released at one
lockstep version. A manifest version of `0.0.0` denotes unreleased source;
source-checkout workflows must verify that a matching registry release exists
before suggesting registry installation. Conventional Commits determine the
changelog sections and communicate impact:

- `fix:` produces a patch release.
- `feat:` produces a minor release.
- A type followed by `!`, with a `BREAKING CHANGE:` footer, produces a major
  release.
- `docs:`, `test:`, `build:`, `ci:`, and `chore:` do not trigger a release by
  themselves.

Use an optional scope when it clarifies ownership, for example
`fix(ddns): reject ambiguous record sets`. Run `deno task commits:check`
locally. `deno task setup` configures tracked `commit-msg` and `pre-push` hooks:
the first rejects an invalid new message, while the second rechecks every
outgoing branch range so commits created by automation cannot bypass the policy
silently. Maintainers prepare all manifest versions and validation together with
`deno task release:prepare <version>` in a dedicated release commit. Do not add
a committed `CHANGELOG.md`; the tag workflow generates release notes and
attaches the complete changelog to the GitHub release.

## Pull Request Expectations

- Keep the package easy to consume from a tiny Bunny Edge Script repo.
- Preserve secure defaults.
- Add or update tests for behavior changes.
- Update the applicable root, package, example, security, or setup documentation
  when configuration, endpoints, response codes, packaging, or deploy behavior
  changes.
- Avoid runtime dependencies unless they are clearly worth the operational cost.
- Use a Conventional Commit title for each pull request and squash-merge it so
  the title becomes the single commit on `main`.
