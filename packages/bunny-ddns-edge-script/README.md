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
- HTTP Basic Auth with shared secrets or individually scoped client credentials.
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

| Name            | Required | Description                                                                                                  |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `BUNNY_API_KEY` | Yes      | Bunny account API key used to discover zones and mutate records. `BUNNY_ACCESS_KEY` is accepted as an alias. |
| `DDNS_CLIENTS`  | Yes      | Non-empty JSON array of named clients, their authentication secrets, and hostname or zone policy.            |

### Individual Client Credentials

Every DDNS client uses its own Basic Auth username and secret. Store the
`DDNS_CLIENTS` JSON only as a **Bunny Environment Secret**. This is a structural
example; replace the secret placeholder privately in your password manager or
Bunny dashboard, never in this repository:

```json
[
  {
    "username": "home-router",
    "sharedSecrets": ["<unique secret from password manager>"],
    "allowedHosts": ["home.example.com"]
  },
  {
    "username": "office-router",
    "sharedSecrets": ["<different unique secret from password manager>"],
    "allowedZones": ["office.example.net"],
    "deniedHosts": ["reserved.office.example.net"]
  }
]
```

Each client requires a unique, case-sensitive username of 1 to 128 characters
from `A-Z`, `a-z`, `0-9`, `.`, `_`, `@`, `+`, and `-`; a non-empty
`sharedSecrets` string array; and at least one non-empty `allowedHosts` or
`allowedZones` string array unless `allowAllHosts=true` explicitly acknowledges
account-wide authority. Each secret must contain 32 to 256 printable ASCII
characters without whitespace or commas. Optional `deniedHosts` and
`deniedZones` are string arrays. Omitted policy arrays are empty; hostname
patterns use the global rules below. Unknown object fields and malformed arrays
are rejected to catch configuration mistakes.

For a deliberately account-wide client, set its `allowAllHosts` boolean to
`true` instead of providing client allow lists. It cannot be combined with
non-empty client allow lists. Global authorization still applies: account-wide
authority across all Bunny zones also requires `DDNS_ALLOW_ALL_HOSTS=true` and
no global allow lists. Both global and client deny rules remain authoritative.
Prefer narrowly scoped clients whenever possible.

The client policy and global policy must both allow an update. Within either
policy, hostname and zone allow lists intersect, and deny lists always win.
Global scope remains required. Clients keep using standard Basic Auth and the
existing DynDNS endpoints; credentials identify a client without binding it to
particular hardware.

`DDNS_SHARED_SECRET`, `DDNS_SHARED_SECRETS`, and `DDNS_USERNAME` are unsupported
and cause startup to fail, including when configured as empty entries. Remove
those settings and configure `DDNS_CLIENTS`. Missing, empty, or malformed client
configuration fails startup. The generator and private provisioning command
configure the initial scoped client using the chosen username and scope. For
manual dashboard setup, use that same username, secret, and scope in the client
JSON and copy the selected global scope from `.env.example` into Bunny
variables.

Rotate one client by adding a new secret to its `sharedSecrets`, updating that
client, and removing the old secret. Revoke a client by removing its object from
the array. Changes take effect when the updated configuration is loaded;
existing DNS records remain. To revoke every client, disable the deployment: an
empty array is invalid. Never put client JSON containing real secrets in
committed files, GitHub settings, logs, or agent-controlled terminals.

### Authorization

| Name                   | Default | Description                                                                                         |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `DDNS_ALLOWED_HOSTS`   | Empty   | Comma-separated exact or wildcard hostname patterns, such as `home.example.com,*.home.example.net`. |
| `DDNS_DENIED_HOSTS`    | Empty   | Comma-separated exact or wildcard hostname patterns. A match always denies the request.             |
| `DDNS_ALLOWED_ZONES`   | Empty   | Comma-separated exact or wildcard Bunny DNS zone patterns.                                          |
| `DDNS_DENIED_ZONES`    | Empty   | Comma-separated zone patterns. A match always denies the request.                                   |
| `DDNS_ALLOW_ALL_HOSTS` | `false` | Explicit acknowledgement of global account-wide authority; individual client policies still apply.  |

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

### DNS Drift And Periodic Updates

Every authorized update reads the current Bunny records, even when the requested
IP is unchanged. A later request can repair an externally edited value and, with
`DDNS_AUTO_CREATE=true`, recreate a missing record. Existing settings are
preserved on updates; ambiguous record sets remain subject to
`DDNS_MULTI_RECORD_MODE`. With auto-create disabled, missing records return
`nohost` instead.

Configure your DDNS client to force an update periodically even when its public
IP stays unchanged. Choose an interval that balances recovery time and Bunny API
usage. There is no independent reconciliation scheduler: drift persists until
the next client request. Intentional DNS changes may be overwritten by that
request, so restrict scope to records owned by DDNS.

A `good` or `nochg` response describes the Bunny API state observed during the
request, not authoritative DNS propagation or service reachability. Monitor
those independently. The basic health endpoint does not query Bunny DNS.

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
- Types `RuntimeConfig`, `HandlerOptions`, `Fetcher`, `EnvReader`,
  `MultiRecordMode`, and `DdnsClientConfig`

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
