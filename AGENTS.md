# AGENTS.md

This repository is intentionally AI-agent friendly. Agents should be able to
understand, modify, test, and deploy the project without hidden context.

## Project Intent

This monorepo publishes three packages:

- `@zimme/bunny-ddns-edge-script`, the runtime DDNS handler published to JSR and
  npm.
- `@zimme/bunny-tunnel-edge-script`, the runtime tunnel/access gateway handler
  published to JSR and npm.
- `@zimme/create-bunny-ddns`, the scaffold generator for personal deployment
  repos published to JSR and npm.

The generated Bunny Edge Script exposes secure DynDNS-compatible endpoints for
inadyn and similar clients. The client gets a DDNS secret. The script keeps the
Bunny API key in the Edge Script environment and updates Bunny DNS records on
the client's behalf.

## Ground Rules For Agents

- Preserve secure defaults. HTTPS-only, Basic Auth only, no query-string
  credentials, deny-over-allow, and fail-safe multi-record handling are
  intentional.
- Preserve secure tunnel defaults. HTTPS-only viewers and origins, bounded
  request bodies, stripped hop-by-hop, authorization, and spoofable forwarding
  headers, deny-first path filtering, and optional signed origin forwarding are
  intentional for tunnel work.
- Keep Bunny deployment simple. Consumer repos should need only a tiny
  `script.ts` entrypoint that imports this package.
- Do not edit `dist/` directly. Edit `src/`, then run `deno task build` or let
  `npm pack` regenerate package output through `prepack`.
- Prefer no runtime dependencies. If a dependency is necessary, explain why in
  the PR and update the deployment notes.
- Update docs and tests alongside behavior changes.
- Treat the Bunny API key as a secret in examples and tests.

## Useful Commands

```sh
deno install
deno ci
deno task fmt
deno task spellcheck
deno task lint
deno task check
deno task test
deno task build
deno task ci
```

## Important Files

- `packages/bunny-ddns-edge-script/src/app.js` contains the testable DDNS and
  Bunny DNS logic.
- `packages/bunny-tunnel-edge-script/src/app.ts` contains the testable tunnel
  routing, auth, signing, and proxy logic.
- `packages/bunny-ddns-edge-script/src/mod.ts` is the runtime package
  entrypoint.
- `packages/bunny-tunnel-edge-script/src/mod.ts` is the tunnel package
  entrypoint.
- `packages/create-bunny-ddns/src/main.ts` is the scaffold CLI.
- `packages/*/dist/` are generated local npm package artifact directories.
- `scripts/build_npm_package.ts` owns npm package artifact builds.
- `scripts/verify_release_version.ts` prevents release tags from publishing
  mismatched package versions.
- `examples/edge-script-repo` shows the user-owned Bunny Edge Script repo shape.
- `examples/tunnel-edge-script-repo` shows the user-owned Bunny Tunnel Edge
  Script repo shape.
- `packages/bunny-ddns-edge-script/tests/app.test.ts` covers endpoint, auth,
  allow/deny, IP family, and DNS mutation behavior.
- `packages/bunny-tunnel-edge-script/tests/app.test.ts` covers route selection,
  viewer auth, path/method filtering, origin signing, and proxy behavior.
