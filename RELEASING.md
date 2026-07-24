# Releasing

Both packages use one lockstep Semantic Version. A pushed SemVer tag is the only
release trigger. Branch pushes and manual workflow dispatches never publish. The
version `0.0.0` marks an unreleased source checkout; registry commands are valid
only after a matching signed tag has completed the release workflow.

## One-Time Setup

Create each `@zimme/*` package on JSR and link it to `zimme/bunny-edge-scripts`
with `.github/workflows/publish.yml` as its trusted publishing workflow. Set
each JSR package description to the matching `package.json` description. Mark
Deno as supported for both packages; leave untested runtime compatibility as
unknown, except that the generator is unsupported outside Deno. JSR uses these
settings in package pages and search results.

On npm, configure a GitHub Actions trusted publisher for each package:

- Organization or user: `zimme`
- Repository: `bunny-edge-scripts`
- Workflow: `publish.yml`
- Environment: `release`

Create a GitHub environment named `release`. Limit deployments to tags matching
`*.*.*`. A required reviewer adds a useful final publication gate when another
maintainer is available.

No long-lived JSR or npm publish token is required. The publish job receives
OIDC but only read access to repository contents. The separate GitHub release
job receives contents write access but no OIDC.

## Release Checklist

1. Before the first release, generate release notes in dry-run mode and confirm
   they describe only packages that still exist. In particular, removed
   pre-release experiments must not appear as current features.
2. Confirm `main` is current, clean, and passing `CI`, `CodeQL`, and Dependency
   Review.
3. Choose the next version from the Conventional Commits since the previous
   release.
4. Run `deno task release:prepare 1.0.0`, replacing `1.0.0` with the chosen
   version. It requires a clean worktree, synchronizes package manifests,
   scaffold defaults, and the checked DDNS example, then runs the complete
   validation suite.
5. Review the generated version changes.
6. Commit the version changes, for example
   `git commit -S -am "chore(release): 1.0.0"`, and merge that commit through
   the normal protected-branch process.
7. After the release commit is on `main`, update the remote-tracking branch and
   create a signed annotated tag with the guarded command:

   ```sh
   git fetch origin main
   deno task release:tag 1.0.0
   git push origin 1.0.0
   ```

8. Watch the `Release` workflow. It checks that the tag has no leading `v` and
   exactly matches the root version plus every JSR and npm package version.
9. Verify both packages on JSR and npm, test the documented `deno create`,
   `deno add`, and npm commands in clean directories, and inspect the GitHub
   release.

Git has no native pre-tag hook. `deno task release:tag` is the repository's safe
tag-creation interface: it checks the clean worktree, branch, remote commit,
manifest versions, and existing tags before invoking `git tag -s`. Running
`deno task setup` installs tracked `commit-msg` and `pre-push` hooks. They
reject invalid Conventional Commit messages, including outgoing commits created
by automation, before the pre-push guard checks release tags for valid shape,
signatures, matching versions, and reachability from pushed `main`. The release
workflow repeats these checks because local hooks can be bypassed.

The workflow publishes packages only after full validation succeeds. It then
creates the GitHub release from Conventional Commits, using the latest section
as release notes and attaching the full generated `CHANGELOG.md`. Changelog
files remain release artifacts and are never committed.

Do not move or reuse a release tag. If publication partially fails, inspect
which registries accepted the immutable version, then rerun the failed job. The
publisher checks each exact version and safely skips an already published JSR or
npm package; immutable versions are never overwritten.

## Recommended Rulesets

Protect `main` with a branch ruleset that requires pull requests, resolved
conversations, linear history, signed commits, and the `CI / ci`,
`CodeQL / Analyze JavaScript`, and `Dependency Review / review` checks. Require
the branch to be current before merging, block deletions and force pushes, and
allow squash merges. Use one approval when another maintainer exists; a
mandatory approval blocks a sole maintainer from approving their own pull
request.

Add a tag ruleset targeting `*.*.*` that blocks updates and deletions. Restrict
tag creation to a maintainer bypass role so untrusted contributors cannot start
the OIDC publication workflow. Keep repository Actions permissions read-only by
default, prevent Actions from approving pull requests, require full commit SHA
pinning, and enable secret scanning, push protection, Dependabot alerts, and
CodeQL.
