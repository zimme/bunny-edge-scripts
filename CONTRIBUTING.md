# Contributing

Thanks for helping keep this small and useful.

## Development

Use the repository's Docker Compose-backed Dev Container. In VS Code or
Codespaces, reopen the repository in the container. From a host with Docker,
Node, and npm:

```sh
npm run devcontainer:up
npm run devcontainer:exec -- npm run validate
npm run devcontainer:down
```

Once inside the container:

```sh
npm run setup
npm run fmt
npm run test
npm run validate
```

`npm run validate` is exactly what CI runs. The Compose definition is the place
to add any future service dependency needed by tests or development.

Package `dist/` directories are generated from package `src/` directories and
are gitignored. Do not edit them by hand. Change source files, run
`deno task build` for a local package build, and rely on `prepack` scripts to
refresh `dist/` during `npm pack` and `npm publish`.

The npm scripts are the stable command interface for developers and automation;
they delegate dependency installation, formatting, linting, typechecking,
testing, and bundling to Deno tasks.

## Public API

For release and compatibility purposes, the public API is:

- The package-root exports declared in each package's `src/mod.*`
- The documented environment variables in `README.md`
- The documented HTTP endpoints, parameters, and DDNS response codes

Internal helpers in package implementation files are not part of the stable
package contract unless they are re-exported from that package's root module.

## Versioning

This project uses Compatible Versioning (ComVer).

- Compatible releases increment `MINOR` and keep `PATCH` at `0`
- Incompatible releases increment `MAJOR` and reset `MINOR` to `0`
- Release notes and the changelog carry the detail that SemVer patch releases
  would normally try to encode

## Pull Request Expectations

- Keep the package easy to consume from a tiny Bunny Edge Script repo.
- Preserve secure defaults.
- Add or update tests for behavior changes.
- Update `README.md` when configuration, endpoints, response codes, or deploy
  behavior changes.
- Avoid runtime dependencies unless they are clearly worth the operational cost.
