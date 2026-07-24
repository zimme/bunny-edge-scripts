# @zimme/create-bunny-ddns

A Deno generator for small, reproducible repositories that deploy
`@zimme/bunny-ddns-edge-script` to bunny.net Edge Scripting.

> Registry commands require a published signed release. A manifest version of
> `0.0.0` identifies an unreleased source checkout. Verify
> [JSR](https://jsr.io/@zimme/create-bunny-ddns) or
> [npm](https://www.npmjs.com/package/@zimme/create-bunny-ddns) before
> installation.

## Current Source Usage

From the root of this monorepo:

```sh
deno run --allow-read --allow-write --allow-run=deno \
  packages/create-bunny-ddns/src/main.ts my-bunny-ddns \
  --allowed-hosts home.example.com --no-install
```

The generated project references the monorepo's current package version. Keep
`--no-install` when that version has not been published.

## Published Commands

Preferred Deno usage:

```sh
deno create jsr:@zimme/create-bunny-ddns -- my-bunny-ddns
```

npm compatibility:

```sh
npm exec @zimme/create-bunny-ddns -- my-bunny-ddns
npm init @zimme/bunny-ddns my-bunny-ddns
```

The npm forms still require Deno 2.9.3 or later on `PATH`. npm is an alternate
distribution channel; Deno remains the generator and Edge Script toolchain.

## CLI

```text
deno create jsr:@zimme/create-bunny-ddns -- [directory] [options]
npm init @zimme/bunny-ddns [directory] -- [options]
```

| Option                   | Default                     | Description                                                                             |
| ------------------------ | --------------------------- | --------------------------------------------------------------------------------------- |
| `--dir <path>`           | `my-bunny-ddns-edge-script` | Target directory. A positional directory is also accepted.                              |
| `--deploy <mode>`        | `bunny-git`                 | `bunny-git` or `github-action`.                                                         |
| `--registry <registry>`  | `jsr`                       | Use `jsr` or `npm` imports in the generated project.                                    |
| `--version <range>`      | Current package version     | Runtime and provisioning range. Release preparation updates this default automatically. |
| `--username <name>`      | `inadyn`                    | Basic Auth username required by the generated configuration.                            |
| `--allowed-hosts <list>` | Empty                       | Initial comma-separated `DDNS_ALLOWED_HOSTS`.                                           |
| `--allowed-zones <list>` | Empty                       | Initial comma-separated `DDNS_ALLOWED_ZONES`.                                           |
| `--allow-all-hosts`      | Off                         | Explicitly grant account-wide hostname access instead of using an allow list.           |
| `--no-install`           | Off                         | Skip dependency resolution and `deno.lock` creation.                                    |
| `--force`                | Off                         | Write into a non-empty directory. Symlinked outputs are still rejected.                 |
| `--dry-run`              | Off                         | Validate options and list files without writing them.                                   |
| `-y`, `--yes`            | Off                         | Accept non-secret defaults without prompts.                                             |
| `-h`, `--help`           |                             | Show CLI help.                                                                          |

Interactive mode asks only for non-secret project configuration. The generator
itself has no Bunny network permission and never requests a Bunny API key or
DDNS shared secret.

When both allow-list options are supplied, a runtime update must match both the
hostname list and the selected Bunny zone list. The two lists intersect. When
neither is supplied, the scaffold fails closed with
`DDNS_ALLOW_ALL_HOSTS=false`. Use `--allow-all-hosts` only when account-wide
authority is intentional. It cannot be combined with either allow-list option.

## Generated Repository

The generator writes:

- `script.ts`: thin Bunny SDK entrypoint.
- `deno.json`: imports and Deno tasks.
- `provision.ts`: optional user-owned private-terminal provisioning entrypoint.
- `.env.example`: non-secret Bunny runtime configuration.
- `.gitignore` and `.tool-versions`.
- `README.md` and `AGENTS.md`.
- `LICENSE`.
- `.github/workflows/deploy.yml` only in `github-action` mode.

Unless `--no-install` is set, it then runs Deno dependency resolution and
creates `deno.lock`. Commit that lockfile for reproducible deployment.

### Programmatic API

The package root exports:

- `defaultOptions(): ScaffoldOptions`
- `scaffoldProject(options: ScaffoldOptions): Promise<ScaffoldResult>`
- Types `ScaffoldOptions`, `ScaffoldResult`, `PackageRegistry`, and `DeployMode`

`scaffoldProject` validates values before writing. Existing non-empty
directories require `force: true`, and symlinked output paths are rejected.
`ScaffoldOptions.allowAllHosts` must be `false` when either allow list is set.

The `./provision` export contains the private-terminal provisioning API used by
generated repositories. It is not an agent automation interface.

## Deployment Modes

### Bunny Git Integration

`bunny-git` is the default and recommended mode. It keeps runtime credentials in
Bunny and emits no deployment workflow.

After pushing the generated repository, create a Standalone Edge Script and
connect it through Bunny's Git integration:

| Setting         | Value                   |
| --------------- | ----------------------- |
| Install command | `deno install --frozen` |
| Build command   | `deno task build`       |
| Entry file      | `generated/script.ts`   |

Add `BUNNY_API_KEY` and `DDNS_SHARED_SECRET` as Bunny Environment Secrets. Add
the non-secret username and exact scope values from `.env.example` as Bunny
Environment Variables. This must include either an allow list or the explicit
`DDNS_ALLOW_ALL_HOSTS=true` acknowledgement.

### GitHub Action Upload

`--deploy github-action` emits `.github/workflows/deploy.yml`. The workflow
builds the same artifact and uploads it with Bunny's deployment action.

Create a protected GitHub environment named `production` and store `SCRIPT_ID`
and `DEPLOY_KEY` as **environment secrets** there. They are deployment
credentials, not runtime credentials. `BUNNY_API_KEY` and `DDNS_SHARED_SECRET`
must still exist only in Bunny Environment Secrets.

## Private Credential Boundary

The safest setup is direct credential entry in Bunny's dashboard using a
user-controlled browser.

Generated repositories also include `deno task provision`. This optional command
creates and configures the Edge Script through Bunny's API, but it must be run
only by the user:

1. Generate and save a DDNS secret of at least 32 printable ASCII characters in
   a password manager.
2. End every AI session that can access, record, or stream the terminal.
3. Open a separate private terminal.
4. Run `deno task provision`.
5. Enter the Bunny account API key and DDNS secret only into its hidden prompts.
6. After the command exits, return only its marked `SAFE AI HANDOFF` block to an
   agent.

The command requires an explicit private-terminal acknowledgement. It does not
print or save credentials. Hidden input prevents terminal echo, but it cannot
isolate secrets from an AI product that controls the terminal. An AI agent must
never invoke the command, type into it, or wait on its prompts.

## AI Agent Setup

Give an agent working from the source repository:

> Set up Bunny DDNS for me in a new private GitHub repository named
> `<repo-name>` using <https://github.com/zimme/bunny-edge-scripts>. The verify
> that the required package version is published, follow `AI_SETUP.md`, and use
> the checked-out generator with `--no-install` if it is not. Never ask for
> credentials or run `deno task provision`. Complete non-secret setup, then stop
> for my Bunny dashboard or private-terminal actions.

The canonical cross-agent workflow is
[`AI_SETUP.md`](https://github.com/zimme/bunny-edge-scripts/blob/main/AI_SETUP.md).

## License

[MIT](LICENSE)
