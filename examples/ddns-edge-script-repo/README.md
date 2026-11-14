# Bunny DDNS Edge Script Repository Example

This directory shows the small repository shape used to deploy
`@zimme/bunny-ddns-edge-script` as a bunny.net Standalone Edge Script.

The example import tracks the monorepo package version and is updated by release
preparation. It installs independently only when that version is present on JSR;
the monorepo also uses it as a source-development fixture.

For a generated personal repository, use a published `@zimme/create-bunny-ddns`
release. The generator also emits `.env.example`, `AGENTS.md`, optional private
provisioning, and a lockfile.

## Files

- `script.ts` reads Bunny environment configuration and registers the DDNS
  handler.
- `deno.json` pins imports and builds one self-contained deployment artifact.
- `generated/script.ts` is generated output and is not source.
- `.github/workflows/deploy.yml` demonstrates the optional GitHub Action upload
  path.

## Local Commands

After the imported package version is published and a `deno.lock` exists:

```sh
deno install --frozen
deno task check
deno task build
deno task ci
```

Commit the lockfile in a real deployment repository.

## Bunny Git Integration

The preferred deployment mode keeps runtime credentials in Bunny. Push the
deployment repository, create a Standalone Edge Script, and connect it with:

| Setting         | Value                   |
| --------------- | ----------------------- |
| Install command | `deno install --frozen` |
| Build command   | `deno task build`       |
| Entry file      | `generated/script.ts`   |

## Runtime Configuration

Add these as Bunny Environment Secrets:

- `BUNNY_API_KEY`
- `DDNS_CLIENTS`

Configure the initial client with username `inadyn`, its own password-manager
secret, and `allowedHosts: ["home.example.com"]` in the private `DDNS_CLIENTS`
JSON. Follow the
[runtime client configuration guide](../../packages/bunny-ddns-edge-script#individual-client-credentials)
for the full schema. Every client needs its own explicit scope or deliberate
`allowAllHosts=true` acknowledgement in addition to the global scope below.
Never commit secret JSON or pass it through an AI terminal. The old
`DDNS_SHARED_SECRET`, `DDNS_SHARED_SECRETS`, and `DDNS_USERNAME` settings are
unsupported and must be absent.

Authorization must include at least one of:

- `DDNS_ALLOWED_HOSTS=<comma-separated-host-patterns>`
- `DDNS_ALLOWED_ZONES=<comma-separated-zone-patterns>`
- `DDNS_ALLOW_ALL_HOSTS=true` for intentionally account-wide access

When both allow lists are present, the hostname and selected Bunny zone must
both match. Deny lists always win. Use [`.env.example`](.env.example) as the
non-secret Bunny configuration checklist. See the
[runtime package README](../../packages/bunny-ddns-edge-script) for every
configuration option.

## GitHub Action Upload

The example workflow uploads `generated/script.ts`. Create a protected GitHub
environment named `production`, then add `SCRIPT_ID` and `DEPLOY_KEY` as
**environment secrets**.

Those values authorize deployment only. `BUNNY_API_KEY` and `DDNS_CLIENTS`
remain Bunny Environment Secrets and must not be stored in GitHub.

## inadyn

Use an explicit-address update URL:

```conf
custom bunny-ddns-edge-script {
    username    = "inadyn"
    password    = "use-a-long-random-ddns-secret"
    ddns-server = "ddns.example.com"
    ddns-path   = "/nic/update?hostname=%h&myip=%i"
    ssl         = true
    hostname    = "home.example.com"
}
```

Replace `ddns.example.com` with the deployed Edge Script hostname and
`home.example.com` with the Bunny DNS record to update.

The runtime provides optional `/checkip` endpoints, but Bunny does not document
a guaranteed sanitized client-address header for them. Configure inadyn to use
one only after verifying that it returns the correct address on your deployment.

Configure the client to send periodic forced updates when the IP is unchanged.
Each update rechecks Bunny records and can repair DNS drift; no background
reconciliation occurs without client requests. `/health` does not establish DNS
correctness or application reachability.

## Manual Deployment

After a successful build, `generated/script.ts` can also be uploaded with
Bunny's deployment action or pasted into Bunny's script editor. Always maintain
`script.ts`, never the generated artifact.
