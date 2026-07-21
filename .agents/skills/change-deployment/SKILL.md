---
name: change-deployment
description: Modify or review Dev Container, Docker Compose, GitHub Actions, Bunny deployment, package build, package publishing, release, or generated example workflows.
---

# Change deployment

1. Identify the boundary being changed: local/CI environment, Bunny consumer
   deployment, npm/JSR packaging, or release publication.
2. Keep GitHub workflows thin. Run repository behavior through root npm scripts
   in the Compose-backed Dev Container and use `CI=true` for necessary CI
   differences.
3. Preserve exact tool versions and immutable action, image, and Feature
   resolutions. Update readable versions and lock data together.
4. Keep `dist/` and `examples/*/generated/` generated. Change their source and
   build scripts instead.
5. Never publish, release, push, or mutate Bunny resources without an explicit
   user request. Prefer dry runs during validation.
6. Treat Conventional Commits as release input. Do not hand-edit `CHANGELOG.md`,
   tags, GitHub release notes, or package versions; Release Please owns them
   through its release pull request.
7. Test a fresh cache volume when changing container lifecycle or permissions.
8. Run `npm run validate` inside the Dev Container and inspect all JSR and npm
   dry-run contents.
9. Update `README.md`, `CONTRIBUTING.md`, `RELEASING.md`, `AGENTS.md`, and
   examples when their workflows change.
