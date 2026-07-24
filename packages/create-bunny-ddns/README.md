# @zimme/create-bunny-ddns

Scaffold a small Deno repository that deploys `@zimme/bunny-ddns-edge-script` to
bunny.net Edge Scripting.

Preferred Deno usage:

```sh
deno create jsr:@zimme/create-bunny-ddns -- my-bunny-ddns
```

The generator resolves the runtime dependency and creates a committed-ready
`deno.lock` by default. Pass `--no-install` to skip that step.

npm compatibility:

```sh
npm exec @zimme/create-bunny-ddns
```

The npm command still requires Deno 2.9.3 or later on `PATH`; npm is an
alternate distribution channel, while Deno remains the generator and Edge Script
toolchain.

With npm's initializer shorthand, this package is also reachable as
`npm init @zimme/bunny-ddns`.

## AI Agent Setup

Give an AI coding agent this prompt:

> Set up Bunny DDNS for me in a new private GitHub repository named
> `<repo-name>` using <https://github.com/zimme/bunny-edge-scripts>. Read and
> follow `AI_SETUP.md` and the `setup-bunny-ddns` Agent Skill from that
> repository. Keep credentials out of chat, files, Git, GitHub, logs, and
> command arguments. Never run `deno task provision`; give me a precise
> user-owned credential handoff instead.

Every generated repository includes its own `AGENTS.md` with Deno commands,
secret-handling rules, Bunny Git settings, and completion criteria. The source
repository's
[AI setup runbook](https://github.com/zimme/bunny-edge-scripts/blob/main/AI_SETUP.md)
and
[setup skill](https://github.com/zimme/bunny-edge-scripts/blob/main/.agents/skills/setup-bunny-ddns/SKILL.md)
are the canonical agent workflow.

The generator asks only for non-secret project configuration. It has no Bunny
network permission and never requests a Bunny API key or DDNS secret.

The generated repository recommends entering secrets directly in Bunny's
dashboard. It also includes an optional `deno task provision` command for the
user to run in a separate private terminal after ending all AI sessions. The
command requires an explicit acknowledgement, reads both credentials without
echo, and never prints or saves either value. AI agents must not invoke or
observe it. On success it emits a non-secret `SAFE AI HANDOFF` block; paste only
that block back into the AI task so the agent can resume the remaining setup.
