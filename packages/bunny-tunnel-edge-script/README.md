# @zimme/bunny-tunnel-edge-script

Secure edge reverse proxy and origin gateway for bunny.net Edge Scripting.

```sh
deno add jsr:@zimme/bunny-tunnel-edge-script
```

or from npm:

```sh
deno add npm:@zimme/bunny-tunnel-edge-script
```

```ts
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import {
  createBunnyTunnelHandler,
  readBunnyTunnelConfigFromEnv,
} from "@zimme/bunny-tunnel-edge-script";

const config = readBunnyTunnelConfigFromEnv({
  get(name: string) {
    return Deno.env.get(name);
  },
});

BunnySDK.net.http.serve(createBunnyTunnelHandler({ config }));
```

This package is the Bunny Edge Script side of a tunnel/access gateway. It
proxies HTTP requests to configured origins, can require viewer bearer tokens,
and can sign every origin request with an HMAC so the origin can reject traffic
that did not pass through the edge script.

It is not a full private connector daemon yet. If the origin is not publicly
reachable from Bunny's edge, a future connector package would still be needed.

## Configuration

- `TUNNEL_ORIGIN`: required single HTTPS origin.
- `TUNNEL_ROUTES`: optional JSON route array instead of a single origin.
- `TUNNEL_VIEWER_TOKEN` or `TUNNEL_VIEWER_TOKENS`: viewer bearer tokens. At
  least one is required by default.
- `TUNNEL_ALLOW_PUBLIC`: explicitly allows unauthenticated viewers. Default
  `false`.
- `TUNNEL_ORIGIN_SHARED_SECRET`: optional HMAC signing secret.
- `TUNNEL_ALLOWED_METHODS`: allowed HTTP methods.
- `TUNNEL_DENIED_PATH_PREFIXES`: path prefixes that always return 404.
- `TUNNEL_MAX_BODY_BYTES`: default and maximum 10 MiB to retain memory headroom
  under Bunny's 128 MB isolate limit.
- `TUNNEL_REQUEST_TIMEOUT_MS`: default 30 seconds; covers request upload,
  upstream response headers, and response streaming.
- `TUNNEL_ALLOW_INSECURE_HTTP`: permits HTTP viewers for local testing.
- `TUNNEL_ALLOW_INSECURE_ORIGIN`: permits an HTTP origin when explicitly
  enabled.

`TUNNEL_ROUTES` must fit Bunny's 2 KB per-environment-value limit. Route hosts
and paths are validated strictly, exact hosts outrank wildcards, and request
paths are canonicalized before both authorization and forwarding.
`TUNNEL_PRESERVE_HOST_HEADER` depends on Bunny allowing an outbound `Host`
override; validate that option against an echo origin before production use.

## Verify Origin Signatures

At the origin, verify the request before consuming its body:

```ts
import { verifyBunnyTunnelSignature } from "@zimme/bunny-tunnel-edge-script";

if (!await verifyBunnyTunnelSignature(request, originSharedSecret)) {
  return new Response("unauthorized", { status: 401 });
}
```

The `v2` verifier checks the destination origin, path and query, method, HMAC,
body digest, random nonce, and a five-minute timestamp window. It buffers at
most 10 MiB by default; set `maxBodyBytes` to the smallest limit your origin
accepts. The built-in bounded replay cache rejects duplicate nonces within one
process or isolate. Multi-instance origins should pass a shared implementation:

```ts
const valid = await verifyBunnyTunnelSignature(request, originSharedSecret, {
  maxBodyBytes: 1024 * 1024,
  replayCache: {
    consume(nonce, expiresAtSeconds) {
      return sharedStore.consumeOnce(nonce, expiresAtSeconds);
    },
  },
});
```

`consume` must atomically return `true` only for the nonce's first use and keep
it until `expiresAtSeconds`. The origin must reject unsigned requests for
signing to add security. When `TUNNEL_PRESERVE_HOST_HEADER=true`, pass the
configured origin as `expectedOrigin` because the origin framework may build
`request.url` from the preserved public Host header. Version `v1` signatures are
intentionally rejected.

The built-in cache is intended for low-volume, single-process origins and holds
at most 10,000 live nonces. Use a shared cache for horizontally scaled or
sustained high-rate traffic. Signature `v2` protects routing metadata and the
body digest, not arbitrary application headers; do not treat forwarded identity
headers as authenticated unless your origin validates them separately.
