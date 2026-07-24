# @zimme/bunny-ddns-edge-script

Secure DynDNS-compatible update handler for bunny.net Edge Scripts.

## AI Agent Setup

For a complete personal deployment, give an AI coding agent this prompt:

> Set up Bunny DDNS for me in a new private GitHub repository named
> `<repo-name>` using <https://github.com/zimme/bunny-edge-scripts>. Read and
> follow `AI_SETUP.md` and the `setup-bunny-ddns` Agent Skill. Never put
> credentials in chat, files, Git, GitHub, logs, or command arguments, and never
> run the generated `deno task provision` command for me. Stop and wait for my
> private setup actions, then continue only from the non-secret handoff I send.

The repository generator creates an agent-ready `AGENTS.md`, reproducible Deno
project, Bunny configuration instructions, and `inadyn` example. The source
repository's
[AI setup runbook](https://github.com/zimme/bunny-edge-scripts/blob/main/AI_SETUP.md)
and
[setup skill](https://github.com/zimme/bunny-edge-scripts/blob/main/.agents/skills/setup-bunny-ddns/SKILL.md)
are the canonical agent workflow.

Install in a Deno Edge Script project from JSR:

```sh
deno add jsr:@zimme/bunny-ddns-edge-script
```

or from npm:

```sh
deno add npm:@zimme/bunny-ddns-edge-script
```

See the repository README for full deployment, inadyn, and security
configuration instructions.

Configure `DDNS_ALLOWED_HOSTS` or `DDNS_ALLOWED_ZONES`. Account-wide access is
available only through the explicit `DDNS_ALLOW_ALL_HOSTS=true` acknowledgement.
