# Security Policy

## Supported Versions

Security fixes target the latest Compatible Version that exists as a matching
GitHub, JSR, and npm release. A backwards-compatible security fix increments the
minor version; an incompatible security fix increments the major version. The
patch component remains zero. Source checkouts still at `0.0.0` are unreleased
and unsupported.

## Reporting A Vulnerability

Please use GitHub private vulnerability reporting. Do not disclose vulnerability
details, secrets, working exploit tokens, or Bunny account details in a public
issue.

## Threat Model

The intended deployment keeps the Bunny account API key inside Bunny Edge
Scripting as a secret. DDNS clients receive only a separate DDNS secret. A
client that knows a legacy DDNS secret can request updates for any hostname
allowed by the script configuration. Optional `DDNS_CLIENTS` mode assigns each
client its own Basic Auth username, secrets, and explicit hostname or zone allow
lists. Requests must pass both the global and client policy. A client allow list
cannot override a global deny rule or broaden the global scope.

### Agent-Assisted Setup

The scaffold generator never requests credentials and has no Bunny network
permission. AI agents may generate, validate, commit, and push deployment code,
but must never receive credentials or invoke a generated repository's
`deno task provision`.

The safest credential path is direct entry into Bunny Environment Secrets in a
user-controlled browser. Optional automatic provisioning is a separate
user-owned command that must run only after AI sessions with terminal access
have ended. It requires an interactive acknowledgement, reads the Bunny account
key and a password-manager-owned DDNS secret without echo, and never prints or
saves either credential. Masked terminal input alone is not considered an AI
provider isolation boundary. The command's explicitly marked `SAFE AI HANDOFF`
block contains only non-secret deployment status and may be returned to an agent
after the private command exits.

Update requests must provide explicit IP query parameters. The package does not
trust forwarding headers to decide which address should be written into DNS.

Use `DDNS_ALLOWED_HOSTS`, `DDNS_ALLOWED_ZONES`, `DDNS_DENIED_HOSTS`, and
`DDNS_DENIED_ZONES` to scope DDNS authority. If both allow lists are present,
the requested hostname and its selected Bunny zone must both match; the lists
form an intersection. Deny rules always win. With no allow list, account-wide
access requires the explicit `DDNS_ALLOW_ALL_HOSTS=true` acknowledgement.

### Individual Client Credentials

Store `DDNS_CLIENTS` only as a Bunny Environment Secret: its JSON contains
authentication secrets. Configure it in a user-controlled Bunny dashboard; never
place it in repository files, GitHub variables, logs, or an agent-controlled
terminal. It replaces legacy authentication and cannot coexist with
`DDNS_SHARED_SECRET` or `DDNS_SHARED_SECRETS`, even when either legacy variable
is empty. `DDNS_USERNAME` applies only to legacy authentication.

Give each client a distinct username and independent random secret. Multiple
`sharedSecrets` within one client support rotation; removing that client or its
old secret revokes the affected credentials when the new configuration takes
effect. Revocation does not delete DNS records or disconnect existing
connections to the published service. Removing the final client leaves an
invalid configuration; disable the deployment to revoke all clients. Empty or
malformed client configuration fails closed without falling back to legacy
authentication.

## Operational Guidance

The unpublished `experiments/http-ws-tunnel` probe uses separate connector and
viewer credentials scoped to one exact hostname. It has no Bunny account API
key, DNS mutation, enrollment, or origin-forwarding functionality. Credentials
must never be shared with DDNS or Bunny Hole. The local adapter permits
unencrypted traffic only on the explicit IPv4 loopback harness; the Bunny
adapter requires HTTPS. See its README for limits and unresolved routing risks.

- Use a long random `DDNS_SHARED_SECRET`.
- Set `DDNS_USERNAME` unless you need username-less compatibility.
- Prefer allow lists for shared or multi-domain Bunny accounts.
- Keep `DDNS_ALLOW_INSECURE_HTTP=false` in Bunny.
- In legacy mode, rotate secrets with `DDNS_SHARED_SECRETS=old,new`, update
  clients, then remove the old secret. In client mode, rotate only that client
  through its `sharedSecrets` array in Bunny Environment Secrets.
- Require clients to send `myip`, `ip`, or `myip6`. Treat `/checkip` as an
  optional diagnostic and configure a client to use it only after verifying the
  returned address on the deployed script; Bunny does not document a guaranteed
  sanitized client-address header for this purpose.
- Leave `DDNS_MULTI_RECORD_MODE=reject` unless the hostname is intentionally a
  DDNS-managed record set.
- Configure periodic forced client updates even if the IP stays unchanged. Each
  update reads Bunny DNS and reconciles record values; no scheduler runs when
  clients stop sending requests. Intentional DNS changes can be overwritten by a
  later authorized update. Use `DDNS_AUTO_CREATE=false` when deletion should not
  result in recreation.
- Monitor DNS correctness and service reachability separately from the basic
  health endpoint. Successful DDNS responses describe the provider API result,
  not authoritative DNS propagation or application availability.
