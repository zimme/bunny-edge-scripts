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
client that knows the DDNS secret can request updates for any hostname allowed
by the script configuration.

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

## Operational Guidance

- Use a long random `DDNS_SHARED_SECRET`.
- Set `DDNS_USERNAME` unless you need username-less compatibility.
- Prefer allow lists for shared or multi-domain Bunny accounts.
- Keep `DDNS_ALLOW_INSECURE_HTTP=false` in Bunny.
- Rotate secrets with `DDNS_SHARED_SECRETS=old,new`, update clients, then remove
  the old secret.
- Require clients to send `myip`, `ip`, or `myip6`. Treat `/checkip` as an
  optional diagnostic and configure a client to use it only after verifying the
  returned address on the deployed script; Bunny does not document a guaranteed
  sanitized client-address header for this purpose.
- Leave `DDNS_MULTI_RECORD_MODE=reject` unless the hostname is intentionally a
  DDNS-managed record set.
