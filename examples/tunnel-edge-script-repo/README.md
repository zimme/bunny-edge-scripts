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

## Bunny Runtime Env

Set these in Bunny Edge Script Env Configuration:

- `TUNNEL_ORIGIN`: origin URL, for example `https://origin.example.com`.
- Optional `TUNNEL_HOST`: public hostname this route should match.
- Optional `TUNNEL_PATH_PREFIX`: public path prefix to proxy.
- Optional `TUNNEL_VIEWER_TOKEN` or `TUNNEL_VIEWER_TOKENS`: bearer token
  required from viewers.
- Optional `TUNNEL_ORIGIN_SHARED_SECRET`: HMAC secret used to sign origin
  requests.

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

Do not commit real secrets to this repo.
