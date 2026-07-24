---
name: setup-bunny-ddns
description: Create and validate a personal GitHub repository that deploys secure Bunny DDNS through Bunny Edge Scripting. Use when a user asks to set up, bootstrap, deploy, or maintain Bunny DDNS from this repository.
license: MIT
---

# Set up Bunny DDNS

Follow the repository-root `AI_SETUP.md` runbook. Treat it as the authoritative
workflow and preserve these boundaries:

1. Establish the GitHub owner, repository name, visibility, and least-privilege
   hostname or zone scope before provisioning.
2. Default the generated repository to private. Never broaden DDNS scope or
   mutate live Bunny resources without explicit approval.
3. Never ask for, receive, store, print, or pass a Bunny API key or DDNS secret
   through chat, files, Git, GitHub, logs, command arguments, or agent memory.
   Let the user type the Bunny API key into the generator's masked terminal
   prompt.
4. Prefer the JSR generator and Bunny Git integration:

   ```sh
   deno create -y jsr:@zimme/create-bunny-ddns -- <repo-name>
   ```

5. If the published package is unavailable and this source repository is checked
   out, use the source command documented in `AI_SETUP.md`.
6. Read the generated `AGENTS.md` and `README.md`, then run `deno task ci`.
7. Initialize Git and create or push the requested GitHub repository only after
   validation passes.
8. Leave Bunny's GitHub App authorization to the user in the Bunny dashboard.
   Relay the exact install command, build command, entry file, runtime secrets,
   and variables from the generated README.
9. Report repository visibility, validation and deployment state, the active
   hostname or zone scope, and any remaining user-owned dashboard action. Never
   include secret values.

Do not substitute GitHub secrets, encrypted repository files, or a different
credential transport for Bunny runtime secrets.
