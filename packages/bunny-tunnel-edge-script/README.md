# bunny-tunnel-edge-script

Secure edge reverse proxy and origin gateway for bunny.net Edge Scripting.

```sh
deno add jsr:@zimme/bunny-tunnel-edge-script
```

```ts
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import {
  createBunnyTunnelHandler,
  readBunnyTunnelConfigFromEnv,
} from "@zimme/bunny-tunnel-edge-script";

const config = readBunnyTunnelConfigFromEnv({
  get(name: string) {
    return Deno.env.get(name);
  },
});

BunnySDK.net.http.serve(createBunnyTunnelHandler({ config }));
```

This package is the Bunny Edge Script side of a tunnel/access gateway. It
proxies HTTP requests to configured origins, can require viewer bearer tokens,
and can sign every origin request with an HMAC so the origin can reject traffic
that did not pass through the edge script.

It is not a full private connector daemon yet. If the origin is not publicly
reachable from Bunny's edge, a future connector package would still be needed.
