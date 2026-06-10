# @zimme/create-bunny-ddns

Scaffold a small Deno repository that deploys `@zimme/bunny-ddns-edge-script` to
bunny.net Edge Scripting.

Preferred Deno usage:

```sh
deno run -A jsr:@zimme/create-bunny-ddns
```

npm compatibility:

```sh
npm exec @zimme/create-bunny-ddns
```

With npm's initializer shorthand, this package is also reachable as
`npm init @zimme/bunny-ddns`.

The generator does not ask for or store your Bunny API key or DDNS shared
secret. It creates instructions for adding those values to Bunny Edge Script
environment secrets, which keeps runtime credentials out of GitHub.
