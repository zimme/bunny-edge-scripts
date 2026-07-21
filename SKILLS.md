# SKILLS.md

These are project-local skills for AI agents working in this repo.

Use `npm run validate` inside the Dev Container when validating a clean
checkout. The committed Deno and Dev Container lockfiles are part of the
repository's supply-chain controls.

## Change DDNS Behavior

Use when modifying request parsing, response codes, authentication, IP handling,
or hostname handling.

1. Read `README.md` API and Security Defaults sections.
2. Update `packages/bunny-ddns-edge-script/src/app.js`.
3. Add or update focused tests in
   `packages/bunny-ddns-edge-script/tests/app.test.ts`.
4. Run `npm run test`.
5. Run `npm run build`.
6. Run `npm run validate` before handing off.
7. Update `README.md` if any public behavior changed.

## Change Bunny DNS API Behavior

Use when changing how zones or records are listed, matched, created, or updated.

1. Read the Bunny DNS API links in `README.md`.
2. Keep record updates conservative. Preserve existing record settings whenever
   possible.
3. Avoid mutating multiple matching records unless
   `DDNS_MULTI_RECORD_MODE=update-all`.
4. Add tests for record matching and mutation payload behavior.
5. Run `npm run validate`.

## Change Tunnel Runtime Behavior

Use when modifying route selection, viewer authorization, proxy headers, origin
signing, or tunnel environment configuration.

1. Keep `@zimme/bunny-tunnel-edge-script` focused on the Bunny Edge Script side
   of the gateway.
2. Update `packages/bunny-tunnel-edge-script/src/app.ts`.
3. Add or update focused tests in
   `packages/bunny-tunnel-edge-script/tests/app.test.ts`.
4. Keep private-network connector behavior out of this package unless a matching
   connector package and protocol are added deliberately.
5. Run `npm run validate`.

## Change Deployment

Use when changing GitHub Actions, package output, example build output, or Bunny
Edge Script entrypoints.

1. Keep package `dist/` directories generated.
2. Keep `examples/edge-script-repo/script.ts` minimal.
3. Run `npm run build`.
4. Run `npm run validate`.
5. Verify generated package output, `deno publish --dry-run`, and
   `npm pack --dry-run` contents are expected.
6. Update `README.md`, package manifests, and example docs if the consumer flow
   changes.

## Change Security Configuration

Use when adding, removing, or changing env vars that affect authorization or
scope.

1. Default to the least surprising safe behavior.
2. Deny rules must continue to win over allow rules.
3. Add tests for default, allow, deny, and invalid configuration cases.
4. Update `.env.example`, `README.md`, and `SECURITY.md`.
