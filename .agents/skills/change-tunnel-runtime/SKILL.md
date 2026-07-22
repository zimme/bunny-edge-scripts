---
name: change-tunnel-runtime
description: Modify or review tunnel routing, viewer authorization, proxy requests, forwarded headers, request limits, origin signing, or tunnel environment configuration.
---

# Change tunnel runtime

1. Read the tunnel and security sections in `README.md` and inspect
   `packages/bunny-tunnel-edge-script/src/app.ts`.
2. Keep the package focused on the Bunny Edge Script gateway. Do not claim
   private-network connectivity without a separately designed connector and
   authenticated protocol.
3. Preserve HTTPS defaults, bounded and timed bodies, canonicalized deny-first
   paths, strict route validation and precedence, method filtering, viewer
   authorization, repeated response headers, header stripping, and optional HMAC
   origin signing.
4. Add focused cases to `packages/bunny-tunnel-edge-script/tests/app.test.ts`,
   including malformed, denied, oversized, and upstream-failure paths.
5. Update package and root documentation for public behavior or environment
   changes.
6. Run `npm run test`, `npm run build`, and finally `npm run validate` inside
   the Dev Container.
