# Security Policy

## Supported Versions

This project uses Compatible Versioning (ComVer). Security fixes target the
latest release line.

| Version | Supported |
| ------- | --------- |
| 1.0     | Yes       |

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
