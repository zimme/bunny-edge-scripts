---
name: change-security-configuration
description: Add, remove, or review environment variables and configuration that affect authentication, authorization, hostname or zone scope, secrets, transport security, or origin trust.
---

# Change security configuration

1. Trace the setting from environment parsing through validation, runtime use,
   examples, generated scaffolds, and documentation.
2. Choose a fail-closed default. Deny rules must override allow rules, and
   malformed security configuration must not broaden access.
3. Keep account API keys, client secrets, bearer tokens, and origin-signing
   secrets separate. Never accept credentials in URLs or generated files.
4. Use constant-time secret comparison where runtime APIs permit it and avoid
   logging secret-bearing headers or values.
5. Add tests for omitted, valid, invalid, allowed, denied, and conflicting
   configuration.
6. Update applicable `.env.example`, package docs, generated README content,
   root `README.md`, and `SECURITY.md`.
7. Run `npm run validate` inside the Dev Container and review the diff for
   accidental secret exposure.
