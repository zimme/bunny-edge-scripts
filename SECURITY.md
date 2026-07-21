# Security Policy

## Supported Versions

Security fixes target the latest published Semantic Version. There is no
supported release until the first GitHub release and matching registry packages
have been published.

## Reporting A Vulnerability

Please open a private security advisory on GitHub if available. If that is not
available, open an issue with a minimal description and avoid posting secrets,
working exploit tokens, or Bunny account details.

## Threat Model

The intended deployment keeps the Bunny account API key inside Bunny Edge
Scripting as a secret. DDNS clients receive only a separate DDNS secret. A
client that knows the DDNS secret can request updates for any hostname allowed
by the script configuration.

Update requests must provide explicit IP query parameters. The package does not
trust forwarding headers to decide which address should be written into DNS.

Use `DDNS_ALLOWED_HOSTS`, `DDNS_ALLOWED_ZONES`, `DDNS_DENIED_HOSTS`, and
`DDNS_DENIED_ZONES` when a DDNS secret should have narrower power than the whole
Bunny DNS account.

The tunnel package is an edge reverse proxy/access gateway. It can protect an
origin with viewer bearer tokens and signed origin forwarding, but it does not
make a private LAN service reachable by itself. Origins must still be reachable
from Bunny's edge unless a future connector package is introduced.

If `TUNNEL_ORIGIN_SHARED_SECRET` is set, the script signs origin requests with
HMAC headers. The origin must verify those headers and reject unsigned or stale
requests for the signing layer to provide security. The package exports
`verifyBunnyTunnelSignature()` for this purpose. Signed requests should be
accepted only within a short timestamp tolerance to limit replay.

## Operational Guidance

- Use a long random `DDNS_SHARED_SECRET`.
- Set `DDNS_USERNAME` unless you need username-less compatibility.
- Prefer allow lists for shared or multi-domain Bunny accounts.
- Keep `DDNS_ALLOW_INSECURE_HTTP=false` in Bunny.
- Rotate secrets with `DDNS_SHARED_SECRETS=old,new`, update clients, then remove
  the old secret.
- Require clients to send `myip`, `ip`, or `myip6`; use `/checkip` only for
  discovery.
- Leave `DDNS_MULTI_RECORD_MODE=reject` unless the hostname is intentionally a
  DDNS-managed record set.
- Keep `TUNNEL_VIEWER_TOKEN` or `TUNNEL_VIEWER_TOKENS` configured unless the
  proxied service is intentionally public.
- Leave `TUNNEL_ALLOW_PUBLIC=false` unless public access is intentional.
- Use `TUNNEL_ORIGIN_SHARED_SECRET` with origin-side verification when the
  origin is publicly reachable.
- Keep `TUNNEL_ALLOW_INSECURE_HTTP=false` in Bunny.
- Keep `TUNNEL_ALLOW_INSECURE_ORIGIN=false`; use HTTPS to the origin.
- Keep `TUNNEL_MAX_BODY_BYTES` no larger than the origin actually needs.
- Keep origin secrets and viewer tokens in Bunny Edge Script Env Configuration,
  not in source control.
