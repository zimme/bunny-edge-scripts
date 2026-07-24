# AI Setup Runbook

Use this runbook when a user asks an AI coding agent to create a personal Bunny
DDNS deployment repository from `https://github.com/zimme/bunny-edge-scripts`.
Compatible agents should activate the repository's `setup-bunny-ddns` Agent
Skill; this document remains the complete cross-agent runbook.

## Required Inputs

Before changing live infrastructure, establish:

- The target GitHub repository name and owner.
- Repository visibility. Default to private when the user does not specify.
- Either `DDNS_ALLOWED_HOSTS`, `DDNS_ALLOWED_ZONES`, or explicit confirmation
  that account-wide hostname access is intended.
- Whether the user wants automatic Bunny provisioning or dashboard-only
  instructions.

Do not ask the user to paste a Bunny API key or DDNS secret into chat. Never put
credentials in command arguments, files, Git, GitHub variables, GitHub secrets,
logs, or agent memory. For automatic provisioning, pause and let the user enter
the Bunny API key directly into the generator's masked terminal prompt.

## Agent Workflow

1. Verify that Deno 2.9.3 or later, Git, and GitHub CLI are available. Confirm
   GitHub CLI is authenticated before attempting repository creation.
2. Make sure the target directory and GitHub repository will not overwrite
   unrelated work.
3. Prefer the published JSR generator:

   ```sh
   deno create -y jsr:@zimme/create-bunny-ddns -- <repo-name>
   ```

   The Deno `-y` flag grants the reviewed template permissions. Do not pass the
   generator's `--yes` flag when the user wants the masked Bunny API key prompt.

4. When working from a clone of this source repository before a package release,
   run the checked-out generator:

   ```sh
   deno run --allow-read --allow-write --allow-env --allow-net=api.bunny.net --allow-run=deno packages/create-bunny-ddns/src/main.ts <repo-name>
   ```

5. If automatic Bunny setup is selected, give terminal control to the user for
   the masked API key prompt. Do not observe, repeat, or record the value. The
   generator creates the standalone script, stores the API key as a Bunny
   runtime secret, generates the DDNS client secret, and prints that client
   secret once for the user.
6. If the key is skipped or no interactive terminal is available, preserve and
   relay the generator's manual Bunny instructions. Do not invent another
   credential transport.
7. In the generated repository, read `AGENTS.md` and `README.md`, then run:

   ```sh
   deno task ci
   ```

8. Initialize Git if necessary, commit the generated source and `deno.lock`, and
   create the requested GitHub repository. Unless the user chose otherwise, use
   a private repository. Push the initial branch only after validation passes.
9. Bunny's GitHub App authorization remains an interactive dashboard step. Help
   the user connect the generated repository to the standalone script with:

   | Setting         | Value                   |
   | --------------- | ----------------------- |
   | Install command | `deno install --frozen` |
   | Build command   | `deno task build`       |
   | Entry file      | `generated/script.ts`   |

10. Confirm that Bunny contains the required runtime secrets and variables,
    deployment succeeds, and the generated `inadyn` example uses the deployed
    HTTPS hostname. Never test by printing credentials.

## Completion Report

Report:

- The GitHub repository URL and visibility.
- Validation and deployment status.
- The Bunny script ID or hostname when available.
- Any remaining dashboard action.
- Which hostname or zone scope is active.

Do not include secret values in the report.
