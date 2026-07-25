# Bunny Edge Scripts

A Deno-first collection of independent, open-source
[bunny.net Edge Scripts](https://bunny.net/edge-scripting/) and deployment
tools. Each runtime package solves one edge use case and can be deployed without
the others.

> Registry installation requires a signed release. A source manifest at `0.0.0`
> is an unreleased development version; verify the linked registry before
> running a package command.

## Catalog

### Edge Scripts

| Package                                                            | Purpose                                                                                                                                | Registry                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`@zimme/bunny-ddns-edge-script`](packages/bunny-ddns-edge-script) | A secure DynDNS-compatible API for Bunny DNS. DDNS clients use a limited shared secret while the Bunny account API key stays in Bunny. | [JSR](https://jsr.io/@zimme/bunny-ddns-edge-script) / [npm](https://www.npmjs.com/package/@zimme/bunny-ddns-edge-script) |

### Tools

| Package                                                  | Purpose                                                                                                                         | Registry                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`@zimme/create-bunny-ddns`](packages/create-bunny-ddns) | Generates a minimal, Deno-based repository for deploying the DDNS Edge Script through Bunny Git integration or a GitHub Action. | [JSR](https://jsr.io/@zimme/create-bunny-ddns) / [npm](https://www.npmjs.com/package/@zimme/create-bunny-ddns) |

The DDNS script is not a reverse tunnel and does not provide NAT traversal. It
is for services that are intentionally reachable through an inbound port but
whose public IP address can change.

## DDNS Setup

For the complete runtime API, configuration, deployment settings, and DDNS
client examples, read the
[`@zimme/bunny-ddns-edge-script` documentation](packages/bunny-ddns-edge-script).
For generator commands, options, output, and deployment modes, read the
[`@zimme/create-bunny-ddns` documentation](packages/create-bunny-ddns).

### From This Source Checkout

To work from an unreleased source checkout, run the generator directly:

```sh
deno run --allow-read --allow-write --allow-run=deno \
  packages/create-bunny-ddns/src/main.ts my-bunny-ddns \
  --allowed-hosts home.example.com --no-install
```

The generated project references the monorepo's current package version. Keep
`--no-install` when that version is not present in the registries. Release
preparation updates the generator default automatically.

### Ask An AI Agent

During source development, give an agent working from this checkout:

> Set up Bunny DDNS for me in a new private GitHub repository named
> `<repo-name>` using <https://github.com/zimme/bunny-edge-scripts>. Then verify
> that the required package version is published, read and follow `AI_SETUP.md`,
> and use the checked-out generator with `--no-install` if it is not. Never ask
> for credentials or run `deno task provision`. Ask me for the hostname or zone
> scope, complete every non-secret step, and stop for my Bunny dashboard or
> private-terminal actions.

For a published release, the preferred setup path is:

```sh
deno create jsr:@zimme/create-bunny-ddns -- my-bunny-ddns
```

The npm compatibility forms will also be:

```sh
npm exec @zimme/create-bunny-ddns
npm init @zimme/bunny-ddns
```

## Security Model

- The Bunny account API key remains a Bunny Environment Secret.
- DDNS clients receive a separate long, random shared secret.
- HTTPS and HTTP Basic Auth are required by default.
- Update addresses must be explicit request parameters; forwarding headers are
  never trusted as the DNS mutation value.
- Hostname and zone allow lists scope authority. When both are configured, a
  request must match both lists.
- Deny lists always win.
- With no allow list, account-wide access requires the explicit
  `DDNS_ALLOW_ALL_HOSTS=true` acknowledgement.
- Ambiguous multi-record sets are rejected by default.

See [SECURITY.md](SECURITY.md) for the threat model and credential-safe agent
workflow.

## Development

The development environment is native Docker Compose; Dev Container tooling is
optional and attaches to the same service:

```sh
docker compose -f .devcontainer/compose.yaml up --build --detach --wait development
docker compose -f .devcontainer/compose.yaml exec --user vscode development deno task validate
docker compose -f .devcontainer/compose.yaml down
```

Equivalent Deno task aliases are available when Deno is installed on the host:

```sh
deno task devcontainer:up
deno task devcontainer:exec deno task validate
deno task devcontainer:down
```

`deno task validate` is the complete local and CI check. Deno is the repository
toolchain; Node and npm are retained only to validate and publish npm artifacts.
Releases use [Compatible Versioning](https://gitlab.com/staltz/comver):
compatible changes increment `MINOR`, incompatible changes increment `MAJOR`,
and `PATCH` is always zero. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE)
