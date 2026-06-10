# Bunny Edge Script Repo Example

This is the shape of a small repo you can connect to a bunny.net Standalone Edge
Script Git deployment.

## Install

```sh
deno add jsr:@zimme/bunny-ddns-edge-script
```

## Entry Point

`script.ts` imports the package, reads Bunny Edge Script environment variables,
and registers the handler with Bunny's SDK.

## Bunny Deploy Settings

When configuring Bunny's Git integration, use:

| Setting         | Value                 |
| --------------- | --------------------- |
| Install command | `deno install`        |
| Build command   | `deno task build`     |
| Entry file      | `generated/script.ts` |

If you use the GitHub Action deployment instead, this example workflow builds
the same generated file and uploads it with `BunnyWay/actions/deploy-script`. It
runs `deno install` before building because `script.ts` imports
`@zimme/bunny-ddns-edge-script` through the Deno import map in `deno.json`.

Bunny can run a self-contained `script.ts` directly, but this example imports
`@zimme/bunny-ddns-edge-script` from JSR through Deno. The build step exists
only to turn that package-based source into one uploadable script file.

If you prefer manual deployment, run the same build and paste
`generated/script.ts` into Bunny's script editor.

## Required Edge Script Secrets

Set at least:

- `BUNNY_API_KEY`
- `DDNS_SHARED_SECRET`

See the root project README for all optional security controls.
