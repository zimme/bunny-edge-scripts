# Releasing

All three packages use one lockstep Semantic Version. Conventional Commits are
the release input; Release Please owns version changes, `CHANGELOG.md`, tags,
GitHub releases, and release notes.

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

1. Merge Conventional Commit changes into `main`, preferably by squash-merging
   pull requests with a Conventional Commit title.
2. Review the Release Please pull request. It updates the root version, all six
   package version fields, and the generated `CHANGELOG.md` together.
3. Merge the release pull request. Release Please creates the `vX.Y.Z` tag and
   matching GitHub release.
4. The same workflow checks out that exact tag, runs `npm run release` in the
   Dev Container, and publishes all three packages to JSR and npm with OIDC.
5. Verify all three packages on both registries and the GitHub release assets.

Do not manually edit package versions, create a changelog, tag a commit, or
publish a GitHub release. The release guard refuses publication unless the tag,
root version, and every package manifest agree.

By default the workflow uses the repository `GITHUB_TOKEN`, so release
preparation needs no secret. GitHub does not trigger additional workflows for a
pull request created with that token; `npm run release` therefore repeats the
full validation against the exact release tag before publishing. Repositories
that require a CI check on the generated release pull request can add a
fine-grained `RELEASE_PLEASE_TOKEN` secret with contents and pull-request write
access. Registry trusted publishers remain the only required one-time external
setup.
