# Agent Skills

Project-specific Agent Skills live in `.agents/skills/`. Each skill contains the
focused workflow and OpenAI interface metadata used by compatible coding agents.
`AGENTS.md` remains the canonical repository-wide instruction source.

## Available skills

- `change-bunny-dns-api`: Bunny zone discovery, record matching, mutation
  payloads, pagination, and subrequest budgets.
- `change-ddns-behavior`: DDNS parsing, authentication, hostnames, addresses,
  response codes, and record update behavior.
- `change-deployment`: Dev Containers, CI, Bunny deployment, package builds,
  publishing, and releases.
- `change-security-configuration`: environment configuration that affects
  authorization, scoping, secrets, and transport trust.
- `change-tunnel-runtime`: routing, viewer authorization, proxying, forwarded
  headers, limits, and origin signing.
- `setup-bunny-ddns`: create, validate, and hand off a secure personal Bunny
  DDNS deployment repository.

Load only the skill relevant to the current task. Validate the catalog and its
Claude, Gemini, and Copilot compatibility shims with:

```sh
deno task agents:check
```
