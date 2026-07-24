# @zimme/bunny-ddns-edge-script

A secure DynDNS-compatible request handler for bunny.net Edge Scripting. It
allows routers, NAS devices, and clients such as inadyn to update Bunny DNS
without receiving the Bunny account API key.

> Registry commands require a published signed release. A manifest version of
> `0.0.0` identifies an unreleased source checkout. Verify
> [JSR](https://jsr.io/@zimme/bunny-ddns-edge-script) or
> [npm](https://www.npmjs.com/package/@zimme/bunny-ddns-edge-script) before
> installation.

## What It Provides

- Update endpoints: `GET /nic/update` and `GET /update`.
- Optional address-diagnostic endpoints: `GET /checkip`, `GET /nic/checkip`, and
  `GET /ip`.
- Health endpoints: `GET /health` and `GET /healthz`.
- HTTP Basic Auth with one or more DDNS shared secrets.
- HTTPS enforcement by default.
- Bunny DNS zone discovery and `A`/`AAAA` record updates.
- Optional record creation.
- Deny-first hostname and zone authorization.
- Conservative handling of ambiguous multi-record sets.

The package is a request handler, not a reverse tunnel or NAT traversal service.

## Installation

### Current Source Development

The package is available through this monorepo's Deno workspace:

```ts
import {
  createBunnyDdnsHandler,
  readBunnyDdnsConfigFromEnv,
} from "@zimme/bunny-ddns-edge-script";
```

Run the complete source validation in the repository Dev Container:

```sh
deno task devcontainer:up
deno task devcontainer:exec deno task validate
deno task devcontainer:down
```

### Published Package

The preferred JSR installation is:

```sh
deno add jsr:@zimme/bunny-ddns-edge-script
```

The npm compatibility package is also usable through Deno:

```sh
deno add npm:@zimme/bunny-ddns-edge-script
```

## Edge Script Entrypoint

Create `script.ts` in a small deployment repository:

```ts
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import {
  createBunnyDdnsHandler,
  readBunnyDdnsConfigFromEnv,
} from "@zimme/bunny-ddns-edge-script";

const config = readBunnyDdnsConfigFromEnv({
  get(name: string) {
    return Deno.env.get(name);
  },
});

BunnySDK.net.http.serve(createBunnyDdnsHandler({ config }));
```

Bundle package imports into one deployment artifact:

```json
{
  "imports": {
    "@bunny.net/edgescript-sdk": "npm:@bunny.net/edgescript-sdk@0.12.1",
    "@zimme/bunny-ddns-edge-script": "jsr:@zimme/bunny-ddns-edge-script"
  },
  "tasks": {
    "build": "deno bundle --external @bunny.net/edgescript-sdk script.ts -o generated/script.ts && deno fmt generated/script.ts"
  }
}
```

Run `deno install` once and commit `deno.lock` to pin the resolved release.

For Bunny Git integration use:

| Setting         | Value                   |
| --------------- | ----------------------- |
| Install command | `deno install --frozen` |
| Build command   | `deno task build`       |
| Entry file      | `generated/script.ts`   |

Store runtime credentials only in Bunny Edge Script Env Configuration. Bunny Git
integration keeps them out of GitHub.

## Runtime Configuration

### Secrets

| Name                  | Required | Description                                                                                                                             |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `BUNNY_API_KEY`       | Yes      | Bunny account API key used to discover zones and mutate records. `BUNNY_ACCESS_KEY` is accepted as an alias.                            |
| `DDNS_SHARED_SECRET`  | Yes*     | Password sent by the DDNS client through HTTP Basic Auth. It must be 32 to 256 printable ASCII characters without whitespace or commas. |
| `DDNS_SHARED_SECRETS` | No       | Comma-separated secrets used for rotation. When present, it replaces `DDNS_SHARED_SECRET`; each secret has the same validation rules.   |

At least one shared secret is required.

### Authorization

| Name                   | Default      | Description                                                                                           |
| ---------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `DDNS_USERNAME`        | Any username | When set, Basic Auth must contain this exact username as well as a valid shared secret.               |
| `DDNS_ALLOWED_HOSTS`   | Empty        | Comma-separated exact or wildcard hostname patterns, such as `home.example.com,*.home.example.net`.   |
| `DDNS_DENIED_HOSTS`    | Empty        | Comma-separated exact or wildcard hostname patterns. A match always denies the request.               |
| `DDNS_ALLOWED_ZONES`   | Empty        | Comma-separated exact or wildcard Bunny DNS zone patterns.                                            |
| `DDNS_DENIED_ZONES`    | Empty        | Comma-separated zone patterns. A match always denies the request.                                     |
| `DDNS_ALLOW_ALL_HOSTS` | `false`      | Explicit acknowledgement that the DDNS secret may update any hostname in every discovered Bunny zone. |

At least one of `DDNS_ALLOWED_HOSTS`, `DDNS_ALLOWED_ZONES`, or
`DDNS_ALLOW_ALL_HOSTS=true` is required. Configuration otherwise fails closed.

Allow lists are cumulative:

- With only `DDNS_ALLOWED_HOSTS`, the hostname must match that list.
- With only `DDNS_ALLOWED_ZONES`, the selected Bunny zone must match that list.
- With both, the hostname **and** its selected zone must match. The lists form
  an intersection, not a union.
- Hostname or zone deny rules are evaluated first and always win.
- `DDNS_ALLOW_ALL_HOSTS=true` acknowledges the absence of allow lists; it does
  not override deny rules or a configured allow list.

### Record Behavior

| Name                     | Default                             | Description                                                                                                      |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DDNS_AUTO_CREATE`       | `true`                              | Create a missing `A` or `AAAA` record. Set `false` to update existing records only.                              |
| `DDNS_TTL`               | `900`                               | TTL for records created by the script. Valid Bunny TTL values start at 60 seconds.                               |
| `DDNS_MULTI_RECORD_MODE` | `reject`                            | Reject ambiguous matching record sets. `update-all` updates every matching record of the same hostname and type. |
| `DDNS_MAX_HOSTNAMES`     | `25`                                | Maximum hostnames accepted by one update request. Valid range: 1 to 100.                                         |
| `DDNS_MAX_MUTATIONS`     | `40`                                | Maximum planned record mutations. Valid range: 1 to 40.                                                          |
| `DDNS_RECORD_COMMENT`    | `Managed by bunny-ddns-edge-script` | Comment assigned to newly created records.                                                                       |

### Transport And Testing

| Name                       | Default                 | Description                                                                           |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `DDNS_ALLOW_INSECURE_HTTP` | `false`                 | Allows HTTP only for local development. Keep `false` in Bunny.                        |
| `DDNS_API_BASE_URL`        | `https://api.bunny.net` | Alternate Bunny API base URL, primarily for tests. HTTP requires insecure local mode. |

## DDNS API

### Update

```text
GET https://<script-host>/nic/update?hostname=<fqdn>&myip=<ip>
Authorization: Basic base64(username:ddns-secret)
```

Supported parameters:

| Parameter  | Description                                               |
| ---------- | --------------------------------------------------------- |
| `hostname` | Required. One FQDN or a comma-separated list of FQDNs.    |
| `myip`     | Explicit IPv4 or IPv6 address to publish.                 |
| `ip`       | Compatibility alias for `myip`.                           |
| `myip6`    | Optional additional IPv6 address for a dual-stack update. |

At least one address parameter is required. Updates never infer the DNS value
from forwarding headers.

Normal DDNS results use HTTP 200 with DynDNS-compatible text:

| Response     | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `good <ip>`  | A record was created or changed.                                             |
| `nochg <ip>` | The record already contained that address.                                   |
| `badauth`    | Basic Auth was missing or invalid.                                           |
| `badagent`   | The method, transport, or request shape was unsupported.                     |
| `badip`      | An address was missing, invalid, or conflicting.                             |
| `numhost`    | The request exceeds a hostname, mutation, or Bunny subrequest budget.        |
| `notfqdn`    | The hostname was not a valid FQDN.                                           |
| `nohost`     | No matching Bunny zone exists, or creation is disabled for a missing record. |
| `!yours`     | Authorization configuration denied the hostname or zone.                     |
| `dnserr`     | Existing DNS record state was ambiguous.                                     |
| `911`        | Bunny API or script failure. The client may retry later.                     |

Authentication failures use HTTP 401. Transport and method failures use HTTP
errors. A multi-hostname request returns one response line per hostname.

### Optional Address Diagnostic

`/checkip`, `/nic/checkip`, and `/ip` return the first valid address found in
common forwarding headers. They are unauthenticated but still require HTTPS.

Bunny does not document which of these headers is guaranteed to contain a
sanitized client address. Treat these endpoints as optional diagnostics only:
verify the result on your own deployed script before configuring a client to use
one. The update endpoint does not trust their result and still requires an
explicit address parameter.

### Health

`/health` and `/healthz` provide a non-secret health response suitable for basic
deployment checks.

## inadyn

Use an explicit-address update configuration. Replace the script host, username,
secret, and managed hostname:

```conf
custom bunny-ddns-edge-script {
    username    = "inadyn"
    password    = "use-a-long-random-ddns-secret"
    ddns-server = "ddns.example.com"
    ddns-path   = "/nic/update?hostname=%h&myip=%i"
    ssl         = true
    hostname    = "home.example.com"
}
```

Do not add `checkip-server` or `checkip-path` unconditionally. Configure those
only after verifying that the optional diagnostic endpoint returns the correct
client address in your Bunny deployment. Otherwise, use inadyn's supported
address discovery mechanism and ensure the update request sends `%i`.

For a client that supplies IPv6 directly:

```text
/nic/update?hostname=home.example.com&myip=203.0.113.10&myip6=2001:db8::10
```

## Library API

The stable package root exports:

- `createBunnyDdnsHandler(options)`
- `readBunnyDdnsConfigFromEnv(env)`
- Types `RuntimeConfig`, `HandlerOptions`, `Fetcher`, `EnvReader`, and
  `MultiRecordMode`

Internal helpers are not part of the public package contract.

## AI-Assisted Deployment

The source repository includes an
[AI setup runbook](https://github.com/zimme/bunny-edge-scripts/blob/main/AI_SETUP.md)
and a `setup-bunny-ddns` Agent Skill. An agent may generate, validate, commit,
and push non-secret deployment code. It must never ask for credentials or run
the generated `deno task provision` command.

The preferred credential path is direct user entry into Bunny Environment
Secrets. Optional provisioning must run in a separate private terminal after all
AI sessions that can observe it have ended.

## License

[MIT](LICENSE)
