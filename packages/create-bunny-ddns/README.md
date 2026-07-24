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
> command arguments. Pause so I can enter the Bunny API key directly into the
> masked generator prompt.

Every generated repository includes its own `AGENTS.md` with Deno commands,
secret-handling rules, Bunny Git settings, and completion criteria. The source
repository's
[AI setup runbook](https://github.com/zimme/bunny-edge-scripts/blob/main/AI_SETUP.md)
and
[setup skill](https://github.com/zimme/bunny-edge-scripts/blob/main/.agents/skills/setup-bunny-ddns/SKILL.md)
are the canonical agent workflow.

In an interactive terminal, the generator optionally asks for your Bunny API key
using a masked prompt. When provided, it creates the Edge Script, generates the
DDNS shared secret, and configures Bunny environment secrets and variables. The
API key is held only in memory and is never written to the generated repo.

Leave the prompt empty, use `--yes`, or run non-interactively to skip automatic
provisioning. The command then prints complete instructions for creating the
script, connecting the GitHub repository, and configuring Bunny manually.
