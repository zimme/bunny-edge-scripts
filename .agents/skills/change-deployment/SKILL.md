---
name: change-deployment
description: Modify or review Dev Container, Docker Compose, GitHub Actions, Bunny deployment, package build, package publishing, release, or generated example workflows.
---

# Change deployment

1. Identify the boundary being changed: local/CI environment, Bunny consumer
   deployment, npm/JSR packaging, or release publication.
2. Keep GitHub workflows thin. Run repository behavior through root Deno tasks
   in the Compose-backed Dev Container and use `CI=true` for necessary CI
   differences.
3. Preserve exact tool versions and immutable action, image, and Feature
   resolutions. Update readable versions and lock data together.
4. Keep `dist/` and `examples/*/generated/` generated. Change their source and
   build scripts instead.
5. Never publish, release, push, or mutate Bunny resources without an explicit
   user request. Prefer dry runs during validation.
6. Treat Conventional Commits as release-note input. Use
   `deno task release:prepare` for lockstep versions and validation, then
   `deno task release:tag` only after merge. Only an explicitly pushed SemVer
   tag that is increasing, annotated, signed, and GitHub-verified may publish;
   generated changelogs remain uncommitted release artifacts.
7. Keep build and dependency caching in the Dockerfile and Compose definition,
   not duplicated in workflows. Verify cold and warm image builds and that a
   fresh container can install and bundle without dependency downloads.
8. Run `deno task validate` inside the Dev Container and inspect all JSR and npm
   dry-run contents.
9. Update `README.md`, `CONTRIBUTING.md`, `RELEASING.md`, `AGENTS.md`, and
   examples when their workflows change.
