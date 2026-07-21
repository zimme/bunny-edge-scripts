# Releasing

All three packages use one lockstep version. A GitHub release tag must match the
`version` in every package's `deno.json` and `package.json`.

## One-Time Registry Setup

Create each `@zimme/*` package on JSR and link it to `zimme/bunny-edge-scripts`
with `.github/workflows/publish.yml` as its publishing workflow.

On npm, configure a GitHub Actions trusted publisher for each package:

- Organization or user: `zimme`
- Repository: `bunny-edge-scripts`
- Workflow: `publish.yml`
- Allowed action: `npm publish`

No long-lived JSR or npm publish token is required. The workflow uses GitHub
OIDC, and npm and JSR attach provenance to public package publications.

## Release

1. Update all six package version fields to the same ComVer version.
2. Update `CHANGELOG.md` and run `npm run validate` in the Dev Container.
3. Run `RELEASE_TAG=vX.Y.0 deno task release:check` inside the Dev Container.
4. Commit, tag `vX.Y.0`, push the tag, and publish the matching GitHub release.
5. Verify all three packages on both JSR and npm.

The thin workflow runs `npm run release` in the same Dev Container used by CI.
It refuses to publish when the release tag and package versions do not match.
