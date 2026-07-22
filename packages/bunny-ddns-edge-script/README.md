# @zimme/bunny-ddns-edge-script

Secure DynDNS-compatible update handler for bunny.net Edge Scripts.

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
