# AGENTS.md

This repository is intentionally friendly to coding agents. This file is the
canonical, cross-agent source for durable project instructions. Task-specific
workflows live in `.agents/skills/` and should be loaded only when relevant.

## Project intent

This Deno-first monorepo publishes three packages to JSR and npm:

- `@zimme/bunny-ddns-edge-script`: secure DynDNS-compatible Bunny DNS updates.
- `@zimme/bunny-tunnel-edge-script`: a secure Bunny Edge Script HTTP gateway.
- `@zimme/create-bunny-ddns`: a generator for personal DDNS deployment repos.

Runtime packages execute on Bunny Edge Scripting. DDNS clients receive a limited
shared secret; Bunny API keys remain in the Edge Script environment.

## Execution environment

Use the Docker Compose-backed Dev Container for repository work. From the host:

```sh
npm run devcontainer:up
npm run devcontainer:exec -- <command>
npm run devcontainer:down
```

When already inside the container, run commands directly. The GitHub Copilot
setup workflow starts the same container before the coding agent begins.

Use root npm scripts as the stable command interface. They delegate project work
to Deno while retaining npm publication support:

```sh
npm run setup
npm run agents:check
npm run fmt
npm run lint
npm run typecheck
npm run test
npm run build
npm run validate
```

`npm run validate` is the complete local and CI check. Do not invent CI-only
commands; use `CI=true` when behavior genuinely needs to differ in CI.

## Engineering rules

- Preserve DDNS secure defaults: HTTPS-only, Basic Auth only, no query-string
  credentials, deny-over-allow, and fail-safe multi-record handling.
- Preserve tunnel secure defaults: HTTPS-only viewers and origins, bounded
  request bodies, stripped authorization, hop-by-hop, signature, and spoofable
  forwarding headers, deny-first path filtering, and optional origin signing.
- Keep consumer deployment repos small. Runtime entrypoints should only adapt
  environment configuration and register the package handler.
- Prefer no runtime dependencies. Explain and document any dependency that is
  necessary.
- Edit package `src/` files, never generated `dist/` or `generated/` output.
- Use structured parsers and existing repository patterns before adding new
  abstractions.
- Update focused tests and user documentation with behavior changes.
- Use Conventional Commit messages. Prefer `feat`, `fix`, `docs`, `test`,
  `refactor`, `perf`, `build`, `ci`, and `chore`; mark incompatible public API
  changes with `!` and a `BREAKING CHANGE:` footer.
- Do not create or edit `CHANGELOG.md` by hand. The tag-only release workflow
  generates it from Conventional Commits as a GitHub release artifact.
- Never commit, print, or place Bunny API keys, DDNS secrets, publish tokens, or
  origin secrets in examples, fixtures, logs, or generated files.
- Do not publish packages, create releases, or mutate live Bunny resources
  unless the user explicitly requests it.

## Completion criteria

Before handing off a code or configuration change:

1. Run focused tests while iterating.
2. Run `npm run validate` inside the Dev Container.
3. Review the final diff for regressions, generated files, secrets, and
   unrelated changes.
4. Update `README.md`, package docs, examples, or security docs when their
   documented behavior changed.
5. Report any check that could not run and why.

## Review guidelines

When asked to review, lead with actionable findings ordered by severity. Focus
on authentication and authorization boundaries, secret handling, hostname and
zone scope, DNS mutation safety, proxy header handling, Bunny Edge Scripting
limits, package compatibility, and missing tests. Include file and line
references. Say explicitly when no findings remain and name residual test gaps.

## Repository map

- `packages/bunny-ddns-edge-script/src/app.js`: DDNS and Bunny DNS logic.
- `packages/bunny-tunnel-edge-script/src/app.ts`: tunnel routing and proxy
  logic.
- `packages/create-bunny-ddns/src/`: scaffold generator implementation.
- `packages/*/tests/`: package-focused tests.
- `examples/*-edge-script-repo/`: minimal consumer deployment repos.
- `scripts/build_npm_package.ts`: generated npm package artifacts.
- `scripts/verify_release_version.ts`: release/package version guard.
- `scripts/set_version.ts`: lockstep release-version updater.
- `scripts/prepare_release.ts`: guarded version preparation and validation.
- `scripts/create_release_tag.ts`: post-merge signed-tag creator.
- `scripts/pre_push.ts`: local release-tag push guard.
- `scripts/create_github_release.ts`: Conventional Changelog release builder.
- `scripts/publish_packages.ts`: retry-safe JSR and npm package publication.
- `scripts/verify_agent_config.ts`: instruction, skill, metadata, and shim
  guard.
- `.devcontainer/`: shared local, CI, Codespaces, and agent environment.
- `.agents/skills/`: discoverable task-specific Agent Skills.
- `.github/workflows/`: thin CI, security, agent setup, and release wrappers.

## Task skills

Use a matching skill from `.agents/skills/` for DDNS behavior, Bunny DNS API,
tunnel runtime, deployment/release, or security-configuration work. `SKILLS.md`
is the human-readable index; each `SKILL.md` is the executable source.
