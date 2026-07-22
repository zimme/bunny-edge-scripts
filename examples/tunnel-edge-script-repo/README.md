# Bunny Tunnel Edge Script Deployment Repo

This is the minimal shape of a user-owned Bunny Edge Script repository that uses
`@zimme/bunny-tunnel-edge-script`.

## Commands

```sh
deno install
deno task check
deno task build
deno task ci
```

## Bunny Git Integration

| Setting         | Value                 |
| --------------- | --------------------- |
| Install command | `deno install`        |
| Build command   | `deno task build`     |
| Entry file      | `generated/script.ts` |

The included GitHub deployment workflow is an alternative to Bunny Git. Create a
protected `production` GitHub environment and add `SCRIPT_ID` and `DEPLOY_KEY`
as environment secrets before running it.

## Bunny Runtime Env

Set these in Bunny Edge Script Env Configuration:

- `TUNNEL_ORIGIN`: origin URL, for example `https://origin.example.com`.
- Optional `TUNNEL_HOST`: public hostname this route should match.
- Optional `TUNNEL_PATH_PREFIX`: public path prefix to proxy.
- `TUNNEL_VIEWER_TOKEN` or `TUNNEL_VIEWER_TOKENS`: bearer token required from
  viewers by default.
- Optional `TUNNEL_ALLOW_PUBLIC`: set `true` only when unauthenticated public
  access is intentional.
- Optional `TUNNEL_ORIGIN_SHARED_SECRET`: HMAC secret used to sign origin
  requests.
- Optional `TUNNEL_MAX_BODY_BYTES`: maximum buffered request body, default 10
  MiB.
- Optional `TUNNEL_ALLOW_INSECURE_ORIGIN`: default `false`; leave disabled in
  production.

For multiple routes, set `TUNNEL_ROUTES` to JSON:

```json
[
  {
    "host": "app.example.com",
    "pathPrefix": "/",
    "origin": "https://app-origin.example.com"
  },
  {
    "host": "api.example.com",
    "pathPrefix": "/v1",
    "origin": "https://api-origin.example.com/private"
  }
]
```

The JSON value must remain within Bunny's 2 KB environment-value limit.

Do not commit real secrets to this repo.

When origin signing is enabled, verify requests with
`verifyBunnyTunnelSignature()` before consuming the body. Signature `v2` binds
the request to its destination origin and uses a nonce. Multi-instance origins
should provide a shared atomic replay cache; see the package README.
